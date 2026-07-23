# ============================================================
# Build multi-stage (ver servicio-1): imagen Alpine liviana con
# solo las dependencias de produccion en la imagen final.
# ============================================================

# --- Etapa 1: dependencias de produccion ---
FROM node:18-alpine AS deps
WORKDIR /app
COPY package.json .
RUN npm install --omit=dev

# --- Etapa 2: imagen final ---
FROM node:18-alpine
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json .
COPY src/ ./src/
CMD ["node", "src/index.js"]
