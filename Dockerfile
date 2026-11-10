# Multi-stage Dockerfile para despliegue productivo de Gestor Planta Académica

# 1. Compilación del Frontend (Vue 3 + Vite)
FROM node:20-alpine AS builder-frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# 2. Servidor de Producción (Express + Frontend estático)
FROM node:20-alpine
WORKDIR /app

# Instalar dependencias de producción del backend
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

# Copiar código del backend
COPY backend/ ./backend/

# Copiar bundle estático generado por Vite al path esperado por el servidor
COPY --from=builder-frontend /app/frontend/dist ./frontend/dist

# Copiar package.json raíz
COPY package.json ./

ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

# Seguridad: Ejecución con usuario no privilegiado (node)
RUN chown -R node:node /app
USER node

CMD ["node", "backend/src/server.js"]
