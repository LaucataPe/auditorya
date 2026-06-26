import { createMiddleware } from 'hono/factory'
import { verifyToken, type JwtPayload } from '../lib/jwt'

type Variables = { user: JwtPayload }

export const authMiddleware = createMiddleware<{ Variables: Variables }>(async (c, next) => {
  const cookieHeader = c.req.header('cookie') ?? ''
  const token = cookieHeader
    .split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith('token='))
    ?.slice('token='.length)

  if (!token) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, 401)
  }

  const payload = verifyToken(token)
  if (!payload) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Token inválido o expirado' } }, 401)
  }

  c.set('user', payload)
  await next()
})
