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

**IA** — LLM vía OpenRouter (`OPENROUTER_MODEL`, p. ej. `anthropic/claude-sonnet-4.5`) en `lib/llm.ts`.
OpenRouter es compatible con la API de OpenAI (Chat Completions); se llama directo con `fetch`, sin SDK.
Diseño "real con fallback": si no hay `OPENROUTER_API_KEY`, `GET /ia/estado` devuelve `disponible: false`,
el frontend oculta las funciones de IA y la sugerencia de riesgos cae al catálogo estático por sector
(`lib/ia.ts`). Endpoints de IA en `routes/ia.ts`:
sugerir riesgos con contexto real (sector + entendimiento + balance), análisis analítico del balance (NIA 520),
asistente NIA conversacional por encargo, y redacción de campos de papeles de trabajo.

**Archivos** — `lib/storage.ts` con drivers `local` (disco, `STORAGE_DIR`) y `s3` (pendiente).
Descargas SIEMPRE por URL firmada HMAC de 15 minutos (`/archivos?key=&exp=&sig=`), nunca públicas.

**Pista de auditoría** — tabla `eventos` (inmutable, quién/qué/cuándo). Registrar con
`registrarEvento()` en toda mutación relevante (aprobaciones, importaciones, acciones IA).

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
pnpm test                             # vitest en types y backend (lógica pura)
```

## Variables de entorno

`packages/backend/.env`
```
DATABASE_URL=postgresql://user:pass@localhost:5432/auditorya
REDIS_URL=redis://localhost:6379
JWT_SECRET=...
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=anthropic/claude-sonnet-4.5    # cualquier slug de OpenRouter
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1  # opcional (default)
OPENROUTER_SITE_URL=https://auditorya.app         # opcional (atribución)
S3_BUCKET=auditorya-evidencia
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
FRONTEND_URL=http://localhost:5173
PORT=3001
STORAGE_DRIVER=local            # 'local' o 's3' (s3 pendiente de activar)
STORAGE_DIR=./data/archivos     # solo para driver local
```

`packages/frontend/.env`
```
VITE_API_URL=http://localhost:3001
```

## Multi-servicio por encargo

El **tipo de servicio se elige por encargo (auditoría), no por empresa** — una misma empresa
puede tener Revisoría Fiscal en 2024 y Auditoría Interna en 2025. El campo `auditorias.tipoServicio`
(`'revisoria_fiscal' | 'auditoria_interna'`) decide qué tabs y qué flujo normativo se muestran.

- **Revisoría Fiscal** → flujo NIA (materialidad, riesgos, papeles, COSO, dictamen). El campo `tipo`
  (`'financiera' | 'integral' | 'especial'`) solo aplica aquí.
- **Auditoría Interna** → flujo IIA IPPF 2024 (alcance → programas → hallazgos → informe AI).
  No usa el gate de materialidad. Tablas `programas_ai` y `hallazgos_ai`, informe tipo `'informe_ai'`.

La **guía por fases** (`packages/types/src/guia.ts` → `construirGuia`) es el motor de acompañamiento:
consume las señales de `GET /auditorias/:id/progreso`, calcula la fase actual, el % de avance y el
"siguiente paso". Cualquier feature nueva del flujo debe alimentar esta guía, no vivir aparte.

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

[3] PLANIFICACIÓN  (Revisoría Fiscal)
    Crear auditoría (período, tipo de servicio, socio responsable)
    → carta de encargo (NIA 210)
    → entendimiento del período/cliente (NIA 315)
    → cargar balance de prueba (habilita analíticos NIA 520)
    → evaluar control interno COSO (5 componentes, NIA 315)
    → identificar riesgos por área con respuesta planeada (NIA 315)
    → calcular materialidad (NIA 320)
    → cronograma / hoja de ruta (NIA 300 — oportunidad)
    → memo de planeación que consolida lo anterior (NIA 300)
    → si materialidad aprobada, habilita ejecución

[4] EJECUCIÓN  (Revisoría Fiscal)
    Asignar tareas al equipo por área
    → diseñar pruebas desde los riesgos (papel = prueba, NIA 330/500)
    → solicitar documentos al cliente (PBC) y adjuntar evidencia (URL firmada)
    → papeles de trabajo por área (NIA 230) con notas de revisión (NIA 220)

[5] INFORMES / CIERRE  (Revisoría Fiscal)
    Generar dictamen (NIA 700)
    → carta de control interno (NIA 265)
    → carta de representaciones (NIA 580)
    → exportar PDF / Word (todos los documentos)
    → cierre: hechos posteriores (NIA 560), negocio en marcha (NIA 570),
      revisión de calidad y cierre del socio (NIA 220)

    Auditoría Interna (IIA IPPF): alcance → programas de trabajo →
    hallazgos (condición/criterio/causa/efecto + recomendación + seguimiento) → informe AI
```

## Roadmap — estado

El "hilo dorado" **riesgo → prueba → documentos → evidencia → conclusión** y la guía por fases son el
eje del acompañamiento de punta a punta. Las cinco tareas del roadmap están **completas**:

- **1. Exportación PDF / Word** ✅ — `lib/informe-export.ts` (client-side): PDF vía impresión, `.docx`
  real con la librería `docx` (lazy import) y membrete de la firma. Aplica a todos los informes.
- **2. Hilo riesgo → prueba → PBC** ✅ — catálogo `PruebaEstandar` enriquecido (`documentosRequeridos`
  + `guia`); tabla `solicitudes_pbc` (`routes/pbc.ts`); al crear pruebas desde un riesgo se generan los
  ítems PBC; ciclo `solicitado → recibido → no_aplica`; al recibir se crea la evidencia del papel y se
  adjunta el archivo inline. Vista por papel + consolidada (sub-tab "Documentos"). PBC interna (sin
  portal de cliente).
- **3. Memo de planeación (NIA 300) + cronograma** ✅ — `fechaInicio`/`fechaFin`/`asignadoA` en tareas y
  pruebas; `GET /auditorias/:id/cronograma` + `CronogramaTab` (timeline simple, no Gantt); memo como
  `informe` tipo `memo_planeacion` que consolida los datos reales de planeación (sub-tab en
  Planificación).
- **4. Carta de encargo (NIA 210)** ✅ — `informe` tipo `carta_encargo`, exento del gate de materialidad
  (sub-tab en Planificación).
- **5. Cierre + notas de revisión (NIA 220/560/570)** ✅ — tablas `notas_revision` y `cierres_auditoria`
  (`routes/cierre.ts`); notas de revisión por papel + consolidado; `CierreTab` con checklist (hechos
  posteriores, negocio en marcha, revisión de calidad) y cierre del socio (bloqueado si hay notas
  abiertas).

**Documentos de planeación** (carta de encargo, memo) se generan sin exigir materialidad aprobada; el
gate de ejecución sigue siendo `materialidadAprobada` (no se rehízo). Decisiones tomadas: PBC interna
primero (portal después) · cronograma timeline simple (no Gantt).

Ideas futuras fuera de alcance actual: portal del cliente para PBC; Gantt con dependencias; firma
electrónica del dictamen.

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
