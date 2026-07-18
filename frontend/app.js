// El frontend habla SOLO con el API Gateway (ruta relativa /api/pagos).
// El gateway enruta al Servicio 1; los Servicios 2 y 3 son invisibles desde aqui.
const API = '/api/pagos';

const form = document.getElementById('pago-form');
const mensaje = document.getElementById('mensaje');
const historial = document.getElementById('historial');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  mensaje.className = '';

  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tarjeta_numero: document.getElementById('tarjeta').value,
        cvc: document.getElementById('cvc').value,
        monto: Number(document.getElementById('monto').value)
      })
    });
    const data = await res.json();

    if (res.ok) {
      mensaje.className = 'ok';
      mensaje.textContent = `${data.mensaje} (${data.id_transaccion})`;
      form.reset();
    } else {
      mensaje.className = 'error';
      mensaje.textContent = data.error || 'Error al procesar el pago';
    }
  } catch {
    mensaje.className = 'error';
    mensaje.textContent = 'No se pudo contactar al servidor';
  }

  cargarHistorial();
});

async function cargarHistorial() {
  try {
    const res = await fetch(API);
    const txs = await res.json();
    historial.innerHTML = txs.map(t => `
      <tr>
        <td>${t.id_transaccion}</td>
        <td>$${Number(t.monto).toLocaleString('es-CL')}</td>
        <td class="estado-${t.estado}">${t.estado}</td>
        <td>${t.folio_contable || '—'}</td>
      </tr>`).join('');
  } catch { /* el gateway puede estar levantando */ }
}

// Refresco periodico: el estado cambia de EN_PROCESO a COMPLETADO
// cuando el flujo Svc1 -> Svc2 -> Svc3 -> Svc1 termina (asincrono via RabbitMQ)
cargarHistorial();
setInterval(cargarHistorial, 3000);
