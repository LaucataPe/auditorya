/**
 * Revierte la ÚLTIMA migración aplicada usando su archivo `drizzle/down/<tag>.sql`.
 *
 * Convención del repo: toda migración nueva `drizzle/00XX_nombre.sql` lleva su
 * reverso en `drizzle/down/00XX_nombre.sql` (mismo tag, mismos separadores
 * `--> statement-breakpoint`). El reverso solo toca lo que la migración creó.
 *
 * Uso:
 *   pnpm --filter backend db:rollback            → muestra qué haría, no ejecuta
 *   pnpm --filter backend db:rollback --confirmar → ejecuta en una transacción
 *
 * Ensayo obligatorio antes de producción (copia de la base):
 *   DATABASE_URL=<copia> pnpm --filter backend db:migrate
 *   DATABASE_URL=<copia> pnpm --filter backend db:rollback --confirmar
 *   DATABASE_URL=<copia> pnpm --filter backend db:migrate
 */
import 'dotenv/config'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { Pool } from 'pg'

type Entrada = { idx: number; when: number; tag: string }

const confirmar = process.argv.includes('--confirmar')
const journal = JSON.parse(readFileSync(path.resolve('drizzle/meta/_journal.json'), 'utf8')) as { entries: Entrada[] }

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const client = await pool.connect()
try {
  const { rows } = await client.query<{ id: number; created_at: string }>(
    'select id, created_at from drizzle.__drizzle_migrations order by created_at desc, id desc limit 1',
  )
  const ultima = rows[0]
  if (!ultima) throw new Error('No hay migraciones aplicadas en esta base')

  const entrada = journal.entries.find((e) => String(e.when) === String(ultima.created_at))
  if (!entrada) throw new Error(`La última migración aplicada (when=${ultima.created_at}) no está en _journal.json`)

  const archivo = path.resolve('drizzle/down', `${entrada.tag}.sql`)
  if (!existsSync(archivo)) {
    throw new Error(`La migración ${entrada.tag} no tiene reverso en drizzle/down/. No se puede revertir automáticamente.`)
  }
  const sentencias = readFileSync(archivo, 'utf8')
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean)

  console.log(`Última migración aplicada: ${entrada.tag} (registro #${ultima.id})`)
  console.log(`Reverso: ${path.relative(process.cwd(), archivo)} · ${sentencias.length} sentencia(s)`)
  if (!confirmar) {
    console.log('\nModo simulación. Añade --confirmar para ejecutar.')
    process.exit(0)
  }

  await client.query('begin')
  try {
    for (const s of sentencias) await client.query(s)
    await client.query('delete from drizzle.__drizzle_migrations where id = $1', [ultima.id])
    await client.query('commit')
    console.log(`Revertida ${entrada.tag}. La base quedó en el estado anterior; db:migrate la vuelve a aplicar.`)
  } catch (err) {
    await client.query('rollback')
    throw err
  }
} finally {
  client.release()
  await pool.end()
}
