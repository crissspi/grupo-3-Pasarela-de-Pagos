# Manifiestos Kubernetes (K3s) — Grupo 3

Los manifiestos **no llevan namespace fijo**: el mismo YAML sirve para QA y PROD,
solo cambia el `-n` al aplicar. Los Ingress son la única excepción (dominio distinto).

## Despliegue en la VM (146.83.102.22)

```bash
# 1. Crear los namespaces (una sola vez)
kubectl apply -f k8s/namespaces.yml

# 2. Desplegar TODO en QA
kubectl apply -f k8s/databases/ -n grupo3-qa
kubectl apply -f k8s/rabbitmq.yml -n grupo3-qa
kubectl apply -f k8s/servicio-1.yml -f k8s/servicio-2.yml -f k8s/servicio-3.yml -n grupo3-qa
kubectl apply -f k8s/frontend.yml -f k8s/gateway.yml -n grupo3-qa
kubectl apply -f k8s/ingress-qa.yml -n grupo3-qa
kubectl apply -f k8s/backup-cronjob.yml -n grupo3-qa
kubectl apply -f k8s/logging.yml -n grupo3-qa   # Loki + Promtail + Grafana

# 3. Lo mismo en PROD (cambiando -n grupo3-prod e ingress-prod.yml)
```

> En el flujo final estos comandos los ejecuta **GitHub Actions**, no una persona.

## Comandos de operación

```bash
kubectl get pods -n grupo3-qa                  # estado de todos los pods
kubectl logs -f deploy/servicio-2-validador -n grupo3-qa   # logs de un servicio
kubectl get pvc -n grupo3-qa                   # volúmenes persistentes
kubectl get cronjob -n grupo3-qa               # estado del respaldo automático

# Verificar que hay respaldos guardados
kubectl create job --from=cronjob/backup-databases backup-manual -n grupo3-qa
kubectl logs job/backup-manual -n grupo3-qa
```

## Prueba de resiliencia (lo que hará el docente)

```bash
# Matar un pod: K8s lo recrea solo (self-healing)
kubectl delete pod -l app=servicio-1-procesador -n grupo3-qa
kubectl get pods -n grupo3-qa -w

# Matar la BD: los datos sobreviven en el PVC
kubectl delete pod -l app=db-svc3 -n grupo3-qa
```

## Nota sobre imágenes

Los Deployments referencian `DOCKERHUB_USER/<servicio>:latest` como placeholder. El workflow
de GitHub Actions ([.github/workflows/deploy.yml](../.github/workflows/deploy.yml)) construye
y publica las 5 imágenes en Docker Hub, y reemplaza `DOCKERHUB_USER` por el usuario real
(`secrets.DOCKER_USER`) con `sed` antes de aplicar los manifiestos. Para probar localmente sin
pasar por Actions:

```bash
docker build -t <tu-usuario-dockerhub>/procesador-transacciones:latest ./servicio-1-procesador
docker push <tu-usuario-dockerhub>/procesador-transacciones:latest
# o, para importar directo a K3s sin pasar por el registro:
docker save <tu-usuario-dockerhub>/procesador-transacciones:latest | sudo k3s ctr images import -
```
