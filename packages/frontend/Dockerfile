FROM node:20-alpine AS builder
RUN npm install -g pnpm
WORKDIR /app

# Instalar dependencias
COPY package.json pnpm-workspace.yaml ./
COPY packages/types/package.json ./packages/types/
COPY packages/frontend/package.json ./packages/frontend/

RUN pnpm install --frozen-lockfile --filter @auditorya/frontend --filter @auditorya/types

# Copiar código fuente
COPY packages/types ./packages/types
COPY packages/frontend ./packages/frontend

# Build — VITE_API_URL se inyecta en tiempo de build
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

WORKDIR /app/packages/frontend
RUN pnpm build

# Servir con Nginx
FROM nginx:alpine
COPY --from=builder /app/packages/frontend/dist /usr/share/nginx/html
COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
