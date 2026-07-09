#!/bin/bash
# ============================================================
# Agente de despliegue continuo (corre en la VM 1 via cron)
#
# La universidad bloquea SSH entrante desde los runners de
# GitHub Actions, asi que el deploy no puede ser "push".
# Este agente hace el CD estilo GitOps (pull-based):
#   - GitHub Actions construye y publica las imagenes (CI)
#   - Cada minuto este script revisa si hay commits nuevos:
#       develop -> despliega al namespace grupo3-qa
#       main    -> despliega al namespace grupo3-prod
#
# Instalacion (una vez, como dici-uta en la VM 1):
#   cp ~/grupo-3-Pasarela-de-Pagos/scripts/deploy-agent.sh ~/deploy-agent.sh
#   chmod +x ~/deploy-agent.sh
#   (crontab -l 2>/dev/null; echo "* * * * * $HOME/deploy-agent.sh") | crontab -
#
# Log: ~/deploy-agent.log
# ============================================================
export KUBECONFIG=$HOME/.kube/config
export PATH=$PATH:/usr/local/bin

REPO=$HOME/grupo-3-Pasarela-de-Pagos
DOCKER_USER=bliptheclip
LOG=$HOME/deploy-agent.log

cd "$REPO" || exit 1
git fetch origin -q 2>/dev/null || exit 0   # DNS de la U es intermitente: reintenta al proximo minuto

deploy_ns() {
  BRANCH=$1
  NS=$2
  INGRESS=$3
  STATE=$HOME/.deploy-state-$NS

  NEW=$(git rev-parse "origin/$BRANCH" 2>/dev/null) || return
  OLD=$(cat "$STATE" 2>/dev/null)
  [ "$NEW" = "$OLD" ] && return

  echo "[$(date '+%F %T')] Detectado commit nuevo en $BRANCH ($NEW) -> desplegando a $NS" >> "$LOG"

  git checkout -q "$BRANCH" 2>/dev/null || git checkout -qb "$BRANCH" "origin/$BRANCH"
  git reset --hard -q "origin/$BRANCH"

  # Copia de trabajo con el usuario real de Docker Hub
  rm -rf "/tmp/k8s-$NS" && cp -r k8s "/tmp/k8s-$NS"
  find "/tmp/k8s-$NS" -name '*.yml' -exec sed -i "s|DOCKERHUB_USER|$DOCKER_USER|g" {} +

  {
    k3s kubectl apply -f "/tmp/k8s-$NS/namespaces.yml"
    k3s kubectl apply -n "$NS" \
      -f "/tmp/k8s-$NS/databases/" \
      -f "/tmp/k8s-$NS/rabbitmq.yml" \
      -f "/tmp/k8s-$NS/servicio-1.yml" \
      -f "/tmp/k8s-$NS/servicio-2.yml" \
      -f "/tmp/k8s-$NS/servicio-3.yml" \
      -f "/tmp/k8s-$NS/gateway.yml" \
      -f "/tmp/k8s-$NS/frontend.yml" \
      -f "/tmp/k8s-$NS/backup-cronjob.yml" \
      -f "/tmp/k8s-$NS/$INGRESS"
    # Fuerza a bajar las imagenes :latest recien publicadas por Actions
    k3s kubectl rollout restart deployment -n "$NS"
  } >> "$LOG" 2>&1

  echo "$NEW" > "$STATE"
  echo "[$(date '+%F %T')] Deploy de $BRANCH a $NS completado" >> "$LOG"
}

deploy_ns develop grupo3-qa  ingress-qa.yml
deploy_ns main    grupo3-prod ingress-prod.yml
