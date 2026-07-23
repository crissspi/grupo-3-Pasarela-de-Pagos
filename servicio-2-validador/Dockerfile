# ============================================================
# Build multi-stage (ver servicio-1): dependencias en una etapa,
# imagen final limpia en otra. Antes se instalaban tambien las
# devDependencies; ahora solo las de produccion (--omit=dev).
# ============================================================

# --- Etapa 1: dependencias de produccion ---
FROM node:18-alpine AS deps
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --omit=dev

# --- Etapa 2: imagen final ---
FROM node:18-alpine
WORKDIR /usr/src/app
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY . .
CMD ["node", "src/index.js"]
