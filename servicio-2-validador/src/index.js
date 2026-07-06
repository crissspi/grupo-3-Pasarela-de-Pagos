const amqp = require('amqplib');
const { Client } = require('pg');

const dbClient = new Client({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 5432,
});

async function iniciarServicio2() {
    await dbClient.connect();
    console.log("Servicio 2 conectado a su base de datos aislada (Antifraude)");

    const connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://rabbitmq_host');
    const channel = await connection.createChannel();
    
    const colaEntrada = 'transacciones_iniciadas';
    await channel.assertQueue(colaEntrada);
    
    console.log("Validador Antifraude esperando transacciones...");

    channel.consume(colaEntrada, async (mensaje) => {
        if (mensaje !== null) {
            const transaccion = JSON.parse(mensaje.content.toString());
            
            const tarjetaValida = transaccion.tarjeta && transaccion.tarjeta.length === 12;
            const cvcValido = transaccion.cvc && transaccion.cvc.length >= 3;
            
            let tieneFondos = false;

            try {
                const res = await dbClient.query(
                    'SELECT saldo FROM tarjetas WHERE numero = $1', 
                    [transaccion.tarjeta]
                );

                if (res.rows.length > 0) {
                    const saldoDisponible = res.rows[0].saldo;
                    if (saldoDisponible >= transaccion.monto) {
                        tieneFondos = true;
                        await dbClient.query('UPDATE tarjetas SET saldo = saldo - $1 WHERE numero = $2', [transaccion.monto, transaccion.tarjeta]);
                    }
                }
            } catch (dbError) {
                console.error("❌ Error consultando a la BD Antifraude:", dbError);
            }
            
            if (tarjetaValida && cvcValido && tieneFondos) {
                const eventoAprobado = {
                    id_transaccion: transaccion.id,
                    estado: 'pago_autorizado'
                };
                
                const colaSalida = 'pagos_autorizados';
                await channel.assertQueue(colaSalida);
                channel.sendToQueue(colaSalida, Buffer.from(JSON.stringify(eventoAprobado)));
                
                console.log(`✅ Transacción ${transaccion.id} aprobada y evento publicado.`);
            } else {
                console.log(`⚠️ Transacción ${transaccion.id} rechazada (Datos inválidos o sin fondos).`);
            }
            
            channel.ack(mensaje);
        }
    });
}

iniciarServicio2().catch(console.error);