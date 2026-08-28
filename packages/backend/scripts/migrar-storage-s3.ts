/**
 * Copia los archivos del disco local (STORAGE_DIR) al bucket S3/R2 configurado,
 * conservando las mismas claves. Idempotente: re-ejecutarlo sobreescribe.
 *
 * Uso (con STORAGE_DRIVER=s3 y las variables S3_* configuradas):
 *   node --import tsx/esm scripts/migrar-storage-s3.ts
 */
import 'dotenv/config'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { storage } from '../src/lib/storage'

const DIR = process.env.STORAGE_DIR ?? path.resolve(process.cwd(), 'data', 'archivos')

async function* caminar(dir: string): AsyncGenerator<string> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, e.name)
    if (e.isDirectory()) yield* caminar(ruta)
    else yield ruta
  }
}

if ((process.env.STORAGE_DRIVER ?? 'local') !== 's3') {
  console.error('Configura STORAGE_DRIVER=s3 (y S3_BUCKET, S3_ENDPOINT, credenciales) antes de migrar.')
  process.exit(1)
}

let subidos = 0
for await (const ruta of caminar(DIR)) {
  const key = path.relative(DIR, ruta).split(path.sep).join('/')
  await storage.guardar(key, await readFile(ruta))
  subidos++
  console.log(`↑ ${key}`)
}
console.log(`Listo: ${subidos} archivos migrados desde ${DIR} al bucket.`)
process.exit(0)
