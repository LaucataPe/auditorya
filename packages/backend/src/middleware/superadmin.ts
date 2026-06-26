import { createMiddleware } from 'hono/factory'
import { verifyToken, type JwtPayload } from '../lib/jwt'

type Variables = { user: JwtPayload }

export const superadminMiddleware = createMiddleware<{ Variables: Variables }>(async (c, next) => {
  const cookieHeader = c.req.header('cookie') ?? ''
  const token = cookieHeader
    .split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith('sa_token='))
    ?.slice('sa_token='.length)

  if (!token) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, 401)
  }

  const payload = verifyToken(token)
  if (!payload || payload.rol !== 'superadmin') {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Acceso restringido' } }, 403)
  }

  c.set('user', payload)
  await next()
})
