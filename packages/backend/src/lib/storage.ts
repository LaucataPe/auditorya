/**
 * Almacenamiento de archivos con interfaz única y dos drivers:
 *  - local: disco del servidor (STORAGE_DIR, default ./data/archivos)
 *  - s3:    pendiente de activar; misma interfaz, se elige con STORAGE_DRIVER=s3
 *
 * Las descargas SIEMPRE van por URL firmada de corta duración (15 min),
 * nunca por rutas públicas — regla del proyecto.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import path from 'node:path'

export interface Storage {
  guardar(key: string, contenido: Buffer): Promise<void>
  leer(key: string): Promise<Buffer>
  eliminar(key: string): Promise<void>
}

const STORAGE_DIR = process.env.STORAGE_DIR ?? path.resolve(process.cwd(), 'data', 'archivos')

/** Evita path traversal: la clave solo admite [a-z0-9/_.-]. */
function rutaSegura(key: string): string {
  if (!/^[a-zA-Z0-9/_.-]+$/.test(key) || key.includes('..')) {
    throw new Error(`Clave de archivo inválida: ${key}`)
  }
  return path.join(STORAGE_DIR, key)
}

const localStorage: Storage = {
  async guardar(key, contenido) {
    const ruta = rutaSegura(key)
    await mkdir(path.dirname(ruta), { recursive: true })
    await writeFile(ruta, contenido)
  },
  async leer(key) {
    return readFile(rutaSegura(key))
  },
  async eliminar(key) {
    await unlink(rutaSegura(key)).catch(() => {})
  },
}

function s3NoConfigurado(): never {
  throw new Error(
    'STORAGE_DRIVER=s3 requiere implementar el driver S3 (agregar @aws-sdk/client-s3 y credenciales). Usa "local" mientras tanto.',
  )
}

const s3Storage: Storage = {
  guardar: s3NoConfigurado,
  leer: s3NoConfigurado,
  eliminar: s3NoConfigurado,
}

export const storage: Storage =
  (process.env.STORAGE_DRIVER ?? 'local') === 's3' ? s3Storage : localStorage

// ─── URLs firmadas (15 minutos) ──────────────────────────────────────────────

const VIGENCIA_SEG = 15 * 60

function secreto(): string {
  const s = process.env.JWT_SECRET
  if (!s) throw new Error('JWT_SECRET no configurado')
  return s
}

function firma(key: string, exp: number): string {
  return createHmac('sha256', secreto()).update(`${key}:${exp}`).digest('hex')
}

/** Genera los parámetros firmados para descargar una clave. */
export function firmarDescarga(key: string): { key: string; exp: number; sig: string } {
  const exp = Math.floor(Date.now() / 1000) + VIGENCIA_SEG
  return { key, exp, sig: firma(key, exp) }
}

/** Verifica una firma de descarga. */
export function verificarDescarga(key: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false
  const esperada = firma(key, exp)
  if (sig.length !== esperada.length) return false
  return timingSafeEqual(Buffer.from(sig), Buffer.from(esperada))
}
