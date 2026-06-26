FROM node:20-alpine
RUN npm install -g pnpm
WORKDIR /app

# Archivos raíz del workspace
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# package.json de todos los paquetes (pnpm workspace los necesita todos)
COPY packages/types/package.json ./packages/types/
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/

# Instalar solo las dependencias del backend y types
RUN pnpm install --frozen-lockfile --filter @auditorya/backend --filter @auditorya/types

# Copiar código fuente
COPY packages/types ./packages/types
COPY packages/backend ./packages/backend

WORKDIR /app/packages/backend

EXPOSE 3001

CMD ["node", "--import", "tsx/esm", "src/index.ts"]
