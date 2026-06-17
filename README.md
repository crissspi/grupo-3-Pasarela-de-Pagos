# Proyecto Final: Aplicaciones Distribuidas - Pasarela de Pagos (Fintech)

**Grupo 3**
- Andrea Navia Marín
- Cristina Cortez Escobar
- Pablo Varas Burgos
- Joshua Jara Herrera

**Máquina Virtual Asignada:** 146.83.102.22

---

## 🛠️ Stack Tecnológico

- **Servicios (x3):** Node.js + Express (`node:18-alpine`)
- **Bases de Datos (x3):** PostgreSQL (`postgres:15-alpine`)
- **Message Broker:** RabbitMQ (`rabbitmq:3-alpine`)
- **API Gateway:** Nginx (`nginx:alpine`)
- **Frontend:** HTML + JavaScript
- **Orquestación:** Kubernetes / K3s
- **CI/CD:** GitHub Actions (develop → QA / main → PROD)
- **Desarrollo Local:** Docker Compose

---

## 1. Diagrama Arquitectónico

A continuación se detalla el flujo asíncrono y la independencia de bases de datos de la pasarela de pagos:

```mermaid
flowchart TD
    %% Nodos externos
    Cliente((Frontend))

    %% API Gateway
    Gateway[API Gateway Nginx]

    %% Broker Central
    Broker{RabbitMQ Message Broker}

    %% Microservicios
    S1[Servicio 1: Procesador REST + Eventos]
    S2[Servicio 2: Validador Event Driven]
    S3[Servicio 3: Comprobantes Event Driven]

    %% Bases de datos Aisladas
    DB1[(PostgreSQL 1)]
    DB2[(PostgreSQL 2)]
    DB3[(PostgreSQL 3)]

    %% Flujo REST Síncrono
    Cliente -- "1. Petición de pago (REST)" --> Gateway
    Gateway -- "2. Enruta tráfico" --> S1
    S1 -- "Guarda estado: En Proceso" --> DB1
    S1 -- "3. Responde HTTP 202 En proceso" --> Cliente

    %% Flujo Asíncrono (Eventos)
    S1 -- "4. Evento: transaccion_iniciada" --> Broker
    Broker -- "5. Consume evento" --> S2
    S2 -- "Valida Saldo y CVC" --> DB2
    S2 -- "6. Evento: pago_autorizado" --> Broker
    Broker -- "7. Consume evento" --> S3
    S3 -- "Genera folio contable" --> DB3
    S3 -- "8. Evento: comprobante_emitido" --> Broker
    
    %% Cierre del ciclo
    Broker -- "9. Consume para actualizar a Completado" --> S1
```

---

## 2. Contrato de Datos (Eventos JSON en RabbitMQ)

Para garantizar la comunicación asíncrona, los microservicios intercambiarán los siguientes eventos por las colas del broker:

**Evento A: `transaccion_iniciada` (S1 -> S2)**
```json
{
  "id_transaccion": "tx-987654321",
  "fecha_hora": "2026-06-17T14:30:00Z",
  "datos_pago": {
    "monto": 25000,
    "moneda": "CLP",
    "tarjeta_numero": "123456789012",
    "cvc": "123"
  }
}
```

**Evento B: `pago_autorizado` (S2 -> S3)**
```json
{
  "id_transaccion": "tx-987654321",
  "estado_validacion": "aprobado",
  "motivo": "Fondos suficientes y validación de seguridad exitosa",
  "monto_validado": 25000
}
```

**Evento C: `comprobante_emitido` (S3 -> S1 / Frontend)**
```json
{
  "id_transaccion": "tx-987654321",
  "folio_contable": "FC-1029384756",
  "estado_final": "completado",
  "mensaje": "El dinero ha sido legalmente procesado."
}
```

---

## 3. Guía de Configuración de Acceso
**

## 4. Manual Operativo de Control
**