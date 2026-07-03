/**
 * Descarga de archivos por URL firmada (15 min). Sin cookie de sesión:
 * la autorización va en la firma HMAC, lo que permite abrir el enlace
 * en una pestaña nueva o compartirlo brevemente dentro del equipo.
 */
import { Hono } from 'hono'
import { storage, verificarDescarga } from '../lib/storage'

const app = new Hono()

// GET /archivos?key=...&exp=...&sig=...&nombre=...&mime=...
app.get('/archivos', async (c) => {
  const key = c.req.query('key')
  const exp = Number(c.req.query('exp'))
  const sig = c.req.query('sig')
  const nombre = c.req.query('nombre') ?? 'archivo'
  const mime = c.req.query('mime') ?? 'application/octet-stream'

  if (!key || !sig || !verificarDescarga(key, exp, sig)) {
    return c.json({ error: { code: 'ENLACE_INVALIDO', message: 'Enlace de descarga inválido o expirado' } }, 403)
  }

  try {
    const contenido = await storage.leer(key)
    return c.body(new Uint8Array(contenido), 200, {
      'Content-Type': mime,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(nombre)}"`,
      'Cache-Control': 'private, no-store',
    })
  } catch {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Archivo no encontrado' } }, 404)
  }
})

export default app
