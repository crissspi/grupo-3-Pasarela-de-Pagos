document.getElementById('pago-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const res = await fetch('http://localhost/transacciones', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      monto: document.getElementById('monto').value,
      numeroTarjeta: document.getElementById('tarjeta').value,
      cvc: document.getElementById('cvc').value
    })
  });
  const data = await res.json();
  console.log(data); // { estado: "En proceso", transaccionId: "..." }
});
