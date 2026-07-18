// ============================================================
// SERVICIO 3: Emisión de Comprobantes (Event Driven)
// - Escucha la cola "pagos_autorizados" (la publica el Servicio 2)
// - Genera un folio contable único en su propia base de datos
// - Publica "comprobante_emitido" al exchange "pagos", que el
//   Servicio 1 recibe en su cola "transacciones.finalizar"
// ============================================================
const amqp = require('amqplib');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://admin:admin123@rabbitmq';

const QUEUE_IN = 'pago_autorizado';
const QUEUE_OUT = 'comprobante_emitido';

const db = new Pool({
  host: process.env.DB_HOST || 'db-svc3',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'comprobantes_db',
  port: 5432
});

async function initDB(retries = 10) {
  // Reintentos: la BD puede tardar en aceptar conexiones al levantar el stack
  for (let i = 1; i <= retries; i++) {
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS comprobantes (
          id             SERIAL PRIMARY KEY,
          transaction_id VARCHAR(100) UNIQUE NOT NULL,
          folio          VARCHAR(100) UNIQUE NOT NULL,
          amount         NUMERIC,
          created_at     TIMESTAMP DEFAULT NOW()
        )
      `);
      console.log('[Svc3] Base de datos de comprobantes lista');
      return;
    } catch {
      console.log(`[Svc3] BD no disponible, reintento ${i}/${retries}...`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  throw new Error('No se pudo conectar a la base de datos');
}

async function connectRabbit(retries = 10) {
  for (let i = 1; i <= retries; i++) {
    try {
      const conn = await amqp.connect(RABBITMQ_URL);
      return await conn.createChannel();
    } catch {
      console.log(`[Svc3] RabbitMQ no disponible, reintento ${i}/${retries}...`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  throw new Error('No se pudo conectar a RabbitMQ');
}

async function main() {
  await initDB();
  const channel = await connectRabbit();

  await channel.assertQueue(QUEUE_IN, { durable: true });
  await channel.assertQueue(QUEUE_OUT, { durable: true });

  console.log(`[Svc3] Escuchando cola: ${QUEUE_IN}`);

  channel.consume(QUEUE_IN, async (msg) => {
    if (!msg) return;
    // Contrato del Servicio 2: { id_transaccion, estado_validacion, motivo, monto_validado }
    const data = JSON.parse(msg.content.toString());

    // Folio contable único: FOLIO-YYYYMMDD-XXXXXXXX
    const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const folio = `FOLIO-${fecha}-${uuidv4().slice(0, 8).toUpperCase()}`;

    await db.query(
      `INSERT INTO comprobantes (transaction_id, folio, amount)
       VALUES ($1, $2, $3) ON CONFLICT (transaction_id) DO NOTHING`,
      [data.id_transaccion, folio, data.monto_validado]
    );

    // Contrato que espera el Servicio 1 en "transacciones.finalizar"
    const evento = {
      id_transaccion: data.id_transaccion,
      estado_final: 'completado',
      folio_contable: folio,
      mensaje: 'Comprobante emitido y proceso finalizado',
      timestamp: new Date().toISOString()
    };
    channel.sendToQueue(QUEUE_OUT, Buffer.from(JSON.stringify(evento)), { persistent: true });
    channel.ack(msg);
    console.log(`[Svc3] Comprobante emitido: ${folio} (tx ${data.id_transaccion})`);
  });
}

main().catch(err => { console.error(err); process.exit(1); });
