#!/bin/bash
# ============================================================
# Prueba de estres de la Pasarela de Pagos (defensa en vivo)
#
# Dispara N pagos concurrentes contra el API Gateway y luego
# mide cuantos termino de procesar la cadena asincrona
# (Svc1 -> RabbitMQ -> Svc2 -> Svc3 -> Svc1).
#
# Uso:
#   ./prueba-estres.sh                                  # local, 200 pagos, 20 en paralelo
#   ./prueba-estres.sh http://localhost:8080 500 50     # URL, total, concurrencia
#
# Contra QA en el cluster (el dominio no resuelve publico, se
# fuerza el Host header):
#   ./prueba-estres.sh http://146.83.102.22 200 20 qa.grupo3.uta.cl
#
# Nota: usa la tarjeta 111122223333 con monto 1 para no agotar
# el saldo (500.000) entre corridas.
# ============================================================
set -u

BASE="${1:-http://localhost:8080}"
TOTAL="${2:-200}"
CONC="${3:-20}"
HOST_HEADER="${4:-}"

URL="$BASE/api/pagos"
EXTRA=()
[ -n "$HOST_HEADER" ] && EXTRA=(-H "Host: $HOST_HEADER")

BODY='{"tarjeta_numero":"111122223333","cvc":"123","monto":1}'
RESULTADOS=$(mktemp)

echo "== Prueba de estres: $TOTAL pagos, $CONC en paralelo -> $URL"
INICIO=$(date +%s.%N)

seq "$TOTAL" | xargs -P "$CONC" -I{} \
  curl -s -o /dev/null -w "%{http_code}\n" --max-time 30 "${EXTRA[@]}" \
    -X POST "$URL" -H 'Content-Type: application/json' -d "$BODY" \
  > "$RESULTADOS"

FIN=$(date +%s.%N)
DURACION=$(awk -v a="$INICIO" -v b="$FIN" 'BEGIN { printf "%.1f", b - a }')

OK=$(grep -c '^202$' "$RESULTADOS")
ERRORES=$((TOTAL - OK))
RPS=$(awk -v t="$TOTAL" -v d="$DURACION" 'BEGIN { printf "%.1f", t / d }')

echo "== Resultados HTTP (fase sincrona) =="
echo "   Aceptados (202): $OK / $TOTAL"
echo "   Errores:         $ERRORES"
echo "   Duracion:        ${DURACION}s (~$RPS req/s)"

echo "== Esperando que la cadena de eventos procese todo... =="
for i in $(seq 1 30); do
  # El endpoint devuelve las ultimas 50; si ninguna sigue EN_PROCESO, terminamos
  PENDIENTES=$(curl -s "${EXTRA[@]}" "$URL" | grep -o 'EN_PROCESO' | wc -l)
  echo "   intento $i: $PENDIENTES EN_PROCESO en las ultimas 50 transacciones"
  [ "$PENDIENTES" -eq 0 ] && break
  sleep 2
done

echo "== Muestra del estado final (ultimas 5) =="
curl -s "${EXTRA[@]}" "$URL" | python3 -m json.tool 2>/dev/null | head -40 || curl -s "${EXTRA[@]}" "$URL" | head -c 800

rm -f "$RESULTADOS"
echo
echo "== Fin de la prueba =="
