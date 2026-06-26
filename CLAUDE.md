# AuditorYa

Software de auditoría financiera externa SaaS para firmas auditoras colombianas.

## Stack

**Frontend** — `packages/frontend`
- React 18 + Vite + TypeScript
- Tailwind CSS + shadcn/ui
- TanStack Query v5 (fetching y caché)
- Zustand (estado global)
- React Router v6

**Backend** — `packages/backend`
- Hono + TypeScript
- Drizzle ORM + PostgreSQL
- Zod (validación de schemas)
- BullMQ + Redis (jobs en background para IA)
- JWT + cookies httpOnly

**IA** — Claude API (`claude-sonnet-4-6`)

**Monorepo** — pnpm workspaces con un package `types` compartido entre frontend y backend.

## Comandos

```bash
pnpm install
pnpm dev                              # levanta frontend y backend
pnpm --filter backend db:generate    # genera migración desde schema
pnpm --filter backend db:migrate     # aplica migraciones
pnpm --filter backend db:studio      # UI visual de la DB
pnpm build
pnpm lint
```

## Variables de entorno

`packages/backend/.env`
```
DATABASE_URL=postgresql://user:pass@localhost:5432/auditorya
REDIS_URL=redis://localhost:6379
JWT_SECRET=...
ANTHROPIC_API_KEY=...
CLAUDE_MODEL=claude-sonnet-4-6
S3_BUCKET=auditorya-evidencia
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
FRONTEND_URL=http://localhost:5173
PORT=3001
```

`packages/frontend/.env`
```
VITE_API_URL=http://localhost:3001
```

## Flujo de la información — fases del sistema

El usuario recorre estas fases en orden. Cada fase desbloquea la siguiente.

```
[1] FIRMA
    Registro de la firma auditora + equipo de auditores
    → habilita crear empresas cliente

[2] EMPRESA
    Crear empresa cliente (NIT, sector, marco contable)
    → evaluación de aceptación del encargo (independencia, conflictos)
    → si aceptado, habilita crear auditoría

[3] PLANIFICACIÓN
    Crear auditoría (período, tipo, módulos, socio responsable)
    → calcular materialidad (NIA 320)
    → identificar riesgos por área (NIA 315)
    → si materialidad aprobada, habilita ejecución

[4] EJECUCIÓN
    Asignar tareas al equipo por área
    → crear papeles de trabajo por área (NIA 230)
    → adjuntar archivos de evidencia
    → evaluar control interno COSO (5 componentes)

[5] INFORMES
    Generar dictamen (NIA 700)
    → carta de control interno (NIA 265)
    → carta de representaciones (NIA 580)
    → exportar PDF / Word
```

## Reglas que el backend debe hacer cumplir

- No se puede crear una auditoría si el encargo no fue aceptado
- No se puede ejecutar si la materialidad no está aprobada
- Solo el socio responsable puede aprobar papeles de trabajo y el dictamen
- Los archivos en S3 se sirven siempre con URLs firmadas (15 min), nunca públicas

## Convenciones

- Archivos: `kebab-case.ts`
- Componentes React: `PascalCase.tsx`
- Hooks: `useNombreRecurso.ts`
- Schemas Drizzle: plural en `snake_case`
- Endpoints REST: `/empresas`, `/empresas/:id/auditorias`, etc.
- Respuesta API éxito: `{ data: T }`
- Respuesta API error: `{ error: { code: string, message: string } }`
