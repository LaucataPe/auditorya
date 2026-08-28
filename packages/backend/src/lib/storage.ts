/**
 * Almacenamiento de archivos con interfaz única y dos drivers:
 *  - local: disco del servidor (STORAGE_DIR, default ./data/archivos)
 *  - s3:    cualquier almacenamiento compatible con S3 (Cloudflare R2, AWS S3, …).
 *           Se elige con STORAGE_DRIVER=s3 + S3_BUCKET, S3_ENDPOINT,
 *           AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (S3_REGION opcional, default 'auto').
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
function validarKey(key: string): string {
  if (!/^[a-zA-Z0-9/_.-]+$/.test(key) || key.includes('..')) {
    throw new Error(`Clave de archivo inválida: ${key}`)
  }
  return key
}

function rutaSegura(key: string): string {
  return path.join(STORAGE_DIR, validarKey(key))
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

// El SDK se carga perezosamente: con driver local no se importa nunca.
type SdkS3 = typeof import('@aws-sdk/client-s3')
let _s3: Promise<{ client: InstanceType<SdkS3['S3Client']>; sdk: SdkS3 }> | null = null

function s3(): NonNullable<typeof _s3> {
  _s3 ??= (async () => {
    const { S3_ENDPOINT, S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY } = process.env
    if (!S3_BUCKET || !S3_ENDPOINT || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      throw new Error(
        'STORAGE_DRIVER=s3 requiere S3_BUCKET, S3_ENDPOINT, AWS_ACCESS_KEY_ID y AWS_SECRET_ACCESS_KEY',
      )
    }
    const sdk = await import('@aws-sdk/client-s3')
    const client = new sdk.S3Client({
      region: process.env.S3_REGION ?? 'auto',
      endpoint: S3_ENDPOINT,
      credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY },
    })
    return { client, sdk }
  })()
  return _s3
}

const s3Storage: Storage = {
  async guardar(key, contenido) {
    const { client, sdk } = await s3()
    await client.send(
      new sdk.PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: validarKey(key), Body: contenido }),
    )
  },
  async leer(key) {
    const { client, sdk } = await s3()
    const res = await client.send(
      new sdk.GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: validarKey(key) }),
    )
    if (!res.Body) throw new Error(`Archivo sin contenido: ${key}`)
    return Buffer.from(await res.Body.transformToByteArray())
  },
  async eliminar(key) {
    const { client, sdk } = await s3()
    await client
      .send(new sdk.DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: validarKey(key) }))
      .catch(() => {})
  },
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
