FROM node:20-alpine AS base
RUN npm install -g pnpm
WORKDIR /app

# Instalar dependencias
COPY package.json pnpm-workspace.yaml ./
COPY packages/types/package.json ./packages/types/
COPY packages/backend/package.json ./packages/backend/

RUN pnpm install --frozen-lockfile --filter @auditorya/backend --filter @auditorya/types

# Copiar código fuente
COPY packages/types ./packages/types
COPY packages/backend ./packages/backend

WORKDIR /app/packages/backend

EXPOSE 3001

CMD ["node", "--import", "tsx/esm", "src/index.ts"]
