import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

import authRoutes from './routes/auth'
import firmasRoutes from './routes/firmas'
import usuariosRoutes from './routes/usuarios'
import rolesRoutes from './routes/roles'
import empresasRoutes from './routes/empresas'
import auditoriasRoutes from './routes/auditorias'
import ejecucionRoutes from './routes/ejecucion'
import informesRoutes from './routes/informes'
import auditoriaInternaRoutes from './routes/auditoria-interna'
import pbcRoutes from './routes/pbc'
import muestreoRoutes from './routes/muestreo'
import ajustesRoutes from './routes/ajustes'
import hallazgosRoutes from './routes/hallazgos'
import cierreRoutes from './routes/cierre'
import notificacionesRoutes from './routes/notificaciones'
import miTrabajoRoutes from './routes/mi-trabajo'
import archivosRoutes from './routes/archivos'
import iaRoutes from './routes/ia'
import superadminRoutes from './routes/superadmin'

const app = new Hono()

app.use('*', logger())

// CORS: solo el frontend configurado (con y sin www) y localhost en desarrollo.
// Cualquier otro origen se deniega (sin header Access-Control-Allow-Origin).
const FRONTEND = process.env.FRONTEND_URL ?? 'http://localhost:5173'
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const ORIGEN_PERMITIDO = new RegExp(
  `^https?://(www\\.)?${escapeRegex(FRONTEND.replace(/^https?:\/\/(www\.)?/, ''))}$`,
)
app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin) return FRONTEND
      if (/^http:\/\/localhost:\d+$/.test(origin)) return origin
      if (ORIGEN_PERMITIDO.test(origin)) return origin
      return ''
    },
    credentials: true,
  }),
)

// Contrato de error uniforme también para 404 y errores no manejados.
app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada' } }, 404))
app.onError((err, c) => {
  // UUID malformado en un parámetro de ruta → error del cliente, no 500.
  const pgCode =
    (err as { code?: string }).code ?? ((err as { cause?: { code?: string } }).cause?.code)
  if (pgCode === '22P02') {
    return c.json({ error: { code: 'ID_INVALIDO', message: 'Identificador con formato inválido' } }, 400)
  }
  console.error(`[error] ${c.req.method} ${c.req.path}:`, err)
  // Nunca se filtra el detalle interno al cliente.
  return c.json({ error: { code: 'INTERNAL', message: 'Error interno del servidor' } }, 500)
})

app.get('/health', (c) => c.json({ status: 'ok' }))

app.route('/auth', authRoutes)
app.route('/firmas', firmasRoutes)
app.route('/firmas', usuariosRoutes)
app.route('/firmas', rolesRoutes)
app.route('/empresas', empresasRoutes)
// auditoriasRoutes define rutas absolutas (/empresas/:id/auditorias y /auditorias/...)
app.route('/', auditoriasRoutes)
// ejecucionRoutes define rutas absolutas (/auditorias/:id/papeles, /papeles/..., /auditorias/:id/coso)
app.route('/', ejecucionRoutes)
// informesRoutes define rutas absolutas (/auditorias/:id/informes, /informes/...)
app.route('/', informesRoutes)
// auditoriaInternaRoutes define rutas absolutas (/auditorias/:id/ai/...)
app.route('/', auditoriaInternaRoutes)
// pbcRoutes define rutas absolutas (/auditorias/:id/pbc, /pbc/...)
app.route('/', pbcRoutes)
// muestreoRoutes define rutas absolutas (/papeles/:id/muestra, /muestra-items/...)
app.route('/', muestreoRoutes)
// ajustesRoutes define rutas absolutas (/auditorias/:id/ajustes, /ajustes/...)
app.route('/', ajustesRoutes)
// hallazgosRoutes define rutas absolutas (/auditorias/:id/hallazgos, /papeles/:id/hallazgos, /hallazgos/...)
app.route('/', hallazgosRoutes)
// cierreRoutes define rutas absolutas (/auditorias/:id/cierre, /papeles/:id/notas-revision, /notas-revision/...)
app.route('/', cierreRoutes)
// Bandeja de notificaciones del equipo (/notificaciones)
app.route('/', notificacionesRoutes)
// Vista transversal "Mi trabajo" (/mi-trabajo)
app.route('/', miTrabajoRoutes)
// Descarga de archivos con URL firmada (sin cookie de sesión)
app.route('/', archivosRoutes)
// Funciones de IA (Claude) — /auditorias/:id/ia/..., /papeles/:id/ia/...
app.route('/', iaRoutes)
app.route('/superadmin', superadminRoutes)

const port = Number(process.env.PORT ?? 3001)
console.log(`Backend corriendo en http://localhost:${port}`)

serve({ fetch: app.fetch, port })
