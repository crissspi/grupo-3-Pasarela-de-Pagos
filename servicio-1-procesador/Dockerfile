# ============================================================
# Build multi-stage: separa la instalacion de dependencias de
# la imagen final, para que la imagen que corre en produccion
# solo lleve node_modules (ya sin dev) + el codigo, sin caches
# ni herramientas de build. Imagen final mas liviana y limpia.
# ============================================================

# --- Etapa 1: dependencias de produccion ---
FROM node:18-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

# --- Etapa 2: imagen final ---
FROM node:18-alpine
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
EXPOSE 3001
CMD ["npm", "start"]
