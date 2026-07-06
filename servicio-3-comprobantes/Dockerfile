# Imagen ligera Alpine (~180MB vs ~1GB de node:18 completa)
FROM node:18-alpine

WORKDIR /app

COPY package.json .
RUN npm install --omit=dev

COPY src/ ./src/

CMD ["node", "src/index.js"]
