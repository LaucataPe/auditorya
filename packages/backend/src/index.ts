import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

import authRoutes from './routes/auth'
import firmasRoutes from './routes/firmas'
import usuariosRoutes from './routes/usuarios'
import empresasRoutes from './routes/empresas'
import auditoriasRoutes from './routes/auditorias'
import ejecucionRoutes from './routes/ejecucion'
import informesRoutes from './routes/informes'
import superadminRoutes from './routes/superadmin'

const app = new Hono()

app.use('*', logger())
app.use(
  '*',
  cors({
    origin: (origin) => {
      const allowed = process.env.FRONTEND_URL ?? 'http://localhost:5173'
      // Acepta localhost en desarrollo
      if (origin && /^http:\/\/localhost:\d+$/.test(origin)) return origin
      // Acepta el dominio con y sin www
      const base = allowed.replace(/^https?:\/\/(www\.)?/, '')
      if (origin && new RegExp(`^https?://(www\\.)?${base.replace('.', '\\.')}$`).test(origin)) return origin
      return allowed
    },
    credentials: true,
  }),
)

app.get('/health', (c) => c.json({ status: 'ok' }))

app.route('/auth', authRoutes)
app.route('/firmas', firmasRoutes)
app.route('/firmas', usuariosRoutes)
app.route('/empresas', empresasRoutes)
// auditoriasRoutes define rutas absolutas (/empresas/:id/auditorias y /auditorias/...)
app.route('/', auditoriasRoutes)
// ejecucionRoutes define rutas absolutas (/auditorias/:id/papeles, /papeles/..., /auditorias/:id/coso)
app.route('/', ejecucionRoutes)
// informesRoutes define rutas absolutas (/auditorias/:id/informes, /informes/...)
app.route('/', informesRoutes)
app.route('/superadmin', superadminRoutes)

const port = Number(process.env.PORT ?? 3001)
console.log(`Backend corriendo en http://localhost:${port}`)

serve({ fetch: app.fetch, port })
