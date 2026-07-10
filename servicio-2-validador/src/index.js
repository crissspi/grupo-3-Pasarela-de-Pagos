const amqp = require('amqplib');
const { Client } = require('pg');

let dbClient;

const connectDBWithRetry = async () => {
  while (true) {
    // Un Client de pg que fallo al conectar queda inutilizable:
    // hay que crear uno nuevo en cada intento
    dbClient = new Client({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });
    try {
      await dbClient.connect();
      console.log('Servicio 2 conectado a su base de datos aislada (Antifraude)');
      break;
    } catch (error) {
      console.error(`Base de datos no disponible (${error.message}). Reintentando en 5 segundos...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
};

async function iniciarServicio2() {
    await connectDBWithRetry();

    // Conexión a RabbitMQ con reintentos: en arranque en frío (docker compose up)
    // el broker puede tardar más que este servicio y sin esto el proceso quedaba muerto
    let connection;
    while (!connection) {
        try {
            connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://admin:admin123@rabbitmq');
        } catch (error) {
            console.log(`RabbitMQ no disponible (${error.message}). Reintentando en 5 segundos...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
    const channel = await connection.createChannel();
    
    const colaEntrada = 'transaccion_iniciada';
    const colaSalida = 'pago_autorizado';
    
    await channel.assertExchange('pagos', 'topic', { durable: true });
    await channel.bindQueue(colaEntrada, 'pagos', 'transaccion_iniciada');

    console.log("Validador Antifraude esperando transacciones...");

    channel.consume(colaEntrada, async (mensaje) => {
        if (mensaje !== null) {
            const transaccion = JSON.parse(mensaje.content.toString());
            
            const idTx = transaccion.id_transaccion;
            const tarjeta = transaccion.datos_pago.tarjeta_numero;
            const cvc = transaccion.datos_pago.cvc;
            const monto = transaccion.datos_pago.monto;
            
            const tarjetaValida = tarjeta && tarjeta.length === 12;
            const cvcValido = cvc && cvc.length >= 3;
            let tieneFondos = false;

            try {
                const res = await dbClient.query(
                    'SELECT saldo FROM tarjetas WHERE numero = $1', 
                    [tarjeta]
                );

                if (res.rows.length > 0) {
                    const saldoDisponible = res.rows[0].saldo;
                    if (saldoDisponible >= monto) {
                        tieneFondos = true;
                        await dbClient.query('UPDATE tarjetas SET saldo = saldo - $1 WHERE numero = $2', [monto, tarjeta]);
                    }
                }
            } catch (dbError) {
                console.error(`Error consultando a la BD Antifraude para Tx ${idTx}:`, dbError);
            }
            
            if (tarjetaValida && cvcValido && tieneFondos) {
                const eventoAprobado = {
                    id_transaccion: idTx,
                    estado_validacion: "aprobado",
                    motivo: "Fondos suficientes y validación de seguridad exitosa",
                    monto_validado: monto
                };
                
                channel.sendToQueue(colaSalida, Buffer.from(JSON.stringify(eventoAprobado)));
                console.log(`Transacción ${idTx} aprobada y evento publicado.`);
            } else {
                // Notifica el rechazo al Servicio 1 para que la transaccion
                // no quede EN_PROCESO para siempre
                const eventoRechazado = {
                    id_transaccion: idTx,
                    estado_final: "rechazado",
                    folio_contable: null,
                    mensaje: "Datos inválidos o fondos insuficientes"
                };
                channel.sendToQueue('comprobante_emitido', Buffer.from(JSON.stringify(eventoRechazado)), { persistent: true });
                console.log(`Transacción ${idTx} rechazada (Datos inválidos o sin fondos).`);
            }
            
            channel.ack(mensaje);
        }
    });
}

iniciarServicio2().catch(console.error);
