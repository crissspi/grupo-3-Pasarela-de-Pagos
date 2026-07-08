import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import pg from 'pg';
import amqp from 'amqplib';

const { Pool } = pg;
const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

const PORT = process.env.PORT || 3001;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

let channel;

async function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function iniciarBaseDatos() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transacciones (
      id SERIAL PRIMARY KEY,
      id_transaccion TEXT UNIQUE NOT NULL,
      monto INTEGER NOT NULL,
      moneda TEXT NOT NULL,
      estado TEXT NOT NULL,
      folio_contable TEXT,
      mensaje TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

async function conectarRabbitMQ() {
  for (let i = 1; i <= 10; i++) {
    try {
      const connection = await amqp.connect(process.env.RABBITMQ_URL);
      return connection.createChannel();
    } catch {
      console.log(`RabbitMQ no listo. Intento ${i}/10...`);
      await esperar(5000);
    }
  }
  throw new Error('No se pudo conectar a RabbitMQ');
}

async function iniciarRabbitMQ() {
  channel = await conectarRabbitMQ();

  await channel.assertExchange('pagos', 'topic', { durable: true });
  await channel.assertQueue('transacciones.finalizar', { durable: true });

  await channel.bindQueue(
    'transacciones.finalizar',
    'pagos',
    'comprobante_emitido'
  );

  channel.consume('transacciones.finalizar', async (msg) => {
    const evento = JSON.parse(msg.content.toString());
    console.log('Transacciones recibió evento final:', evento);

    await pool.query(
      `UPDATE transacciones
       SET estado = $1,
           folio_contable = $2,
           mensaje = $3
       WHERE id_transaccion = $4`,
      [
        evento.estado_final.toUpperCase(),
        evento.folio_contable,
        evento.mensaje,
        evento.id_transaccion
      ]
    );

    channel.ack(msg);
  });
}

app.get('/health', (req, res) => {
  res.json({ status: 'UP', service: 'transacciones' });
});

app.get('/transacciones', async (req, res) => {
  const result = await pool.query(`
    SELECT id, id_transaccion, monto, moneda, estado, folio_contable, mensaje, created_at
    FROM transacciones
    ORDER BY id DESC
    LIMIT 50
  `);

  res.json(result.rows);
});

app.post('/transacciones', async (req, res) => {
  const { tarjeta_numero, cvc, monto } = req.body;

  if (!tarjeta_numero || !cvc || !monto) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }

  if (!/^[0-9]{12}$/.test(tarjeta_numero)) {
    return res.status(400).json({ error: 'La tarjeta debe tener 12 dígitos' });
  }

  if (!/^[0-9]{3}$/.test(cvc)) {
    return res.status(400).json({ error: 'El CVC debe tener 3 dígitos' });
  }

  const fechaHora = new Date().toISOString();

  const insert = await pool.query(
    `INSERT INTO transacciones(id_transaccion, monto, moneda, estado)
     VALUES($1, $2, $3, $4)
     RETURNING id`,
    [`temp-${Date.now()}`, monto, 'CLP', 'EN_PROCESO']
  );

  const idTransaccion = `tx-${String(insert.rows[0].id).padStart(6, '0')}`;

  await pool.query(
    `UPDATE transacciones SET id_transaccion = $1 WHERE id = $2`,
    [idTransaccion, insert.rows[0].id]
  );

  const evento = {
    id_transaccion: idTransaccion,
    fecha_hora: fechaHora,
    datos_pago: {
      monto,
      moneda: 'CLP',
      tarjeta_numero,
      cvc
    }
  };

  channel.publish(
    'pagos',
    'transaccion_iniciada',
    Buffer.from(JSON.stringify(evento)),
    { persistent: true }
  );

  res.status(202).json({
    mensaje: 'Pago recibido correctamente. Estado: EN_PROCESO',
    id_transaccion: idTransaccion,
    estado: 'EN_PROCESO'
  });
});

async function main() {
  console.log('Esperando PostgreSQL y RabbitMQ...');
  await esperar(10000);

  await iniciarBaseDatos();
  await iniciarRabbitMQ();

  app.listen(PORT, () => {
    console.log(`Servicio de transacciones funcionando en puerto ${PORT}`);
  });
}

main().catch((error) => {
  console.error('Error iniciando transacciones:', error);
  process.exit(1);
});
