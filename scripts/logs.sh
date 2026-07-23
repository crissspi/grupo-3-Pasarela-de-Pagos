#!/bin/bash
# ============================================================
# Trazas UNIFICADAS de la Pasarela de Pagos (defensa en vivo).
#
# Sigue en UN SOLO stream los logs de los 4 servicios (gateway,
# svc1, svc2, svc3), con el nombre del pod como prefijo. Permite
# rastrear el viaje de un pago por los 3 microservicios sin saltar
# de contenedor en contenedor (criterio "trazas unificadas" de la
# rubrica). El estado exacto de las colas se ve en el panel de
# RabbitMQ (ver README abajo).
#
# Uso:
#   ./logs.sh                       # namespace grupo3-qa
#   ./logs.sh grupo3-prod           # produccion
#   ./logs.sh grupo3-qa tx-000042   # filtra por id de transaccion
#
# Ver el estado de las colas de RabbitMQ (panel web):
#   k3s kubectl port-forward -n grupo3-qa svc/rabbitmq 15672:15672
#   -> abrir http://localhost:15672  (admin / admin123)
# ============================================================
set -u

NS="${1:-grupo3-qa}"
FILTRO="${2:-}"

# Etiqueta comun: todos los pods de servicio tienen app=<nombre>
SEL='app in (api-gateway,servicio-1-procesador,servicio-2-validador,servicio-3-comprobantes)'

echo "== Trazas unificadas de $NS (Ctrl+C para salir) =="
[ -n "$FILTRO" ] && echo "== Filtrando por: $FILTRO =="

if [ -n "$FILTRO" ]; then
  k3s kubectl logs -f -n "$NS" --prefix --max-log-requests=20 --tail=20 \
    --selector="$SEL" | grep --line-buffered "$FILTRO"
else
  k3s kubectl logs -f -n "$NS" --prefix --max-log-requests=20 --tail=20 \
    --selector="$SEL"
fi
