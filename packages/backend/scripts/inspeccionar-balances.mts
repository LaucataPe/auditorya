/**
 * Inspección de los balances cargados en la base local: estructura, convención de
 * signos, terceros y movimientos. Exporta el archivo original a data/fixtures-balances
 * (carpeta ignorada por git) para usarlo como fixture del motor.
 * Uso: npx tsx scripts/inspeccionar-balances.mts
 */
import 'dotenv/config'
import { Pool } from 'pg'
import { mkdirSync, writeFileSync } from 'node:fs'
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const q = async (s: string, p: unknown[] = []) => (await pool.query(s, p)).rows as any[]
const f = (n: unknown) => Number(n).toLocaleString('es-CO')
mkdirSync('data/fixtures-balances', { recursive: true })
const archivos = await q(`select ba.id, ba.auditoria_id, ba.nombre, ba.tamano, ba.created_at, e.nombre as empresa, a.fecha_inicio, a.fecha_fin
  from balance_archivos ba join auditorias a on a.id=ba.auditoria_id join empresas e on e.id=a.empresa_id order by ba.created_at`)
console.log('==== archivos de balance:', archivos.length)
for (const a of archivos) {
  console.log(`\n--- ${a.nombre} (${a.tamano} bytes) · empresa "${a.empresa}" · encargo ${a.fecha_inicio}..${a.fecha_fin} · auditoria ${a.auditoria_id}`)
  const [{ contenido }] = await q('select contenido from balance_archivos where id=$1', [a.id])
  const ext = String(a.nombre).split('.').pop()
  const out = `data/fixtures-balances/${String(a.empresa).replace(/[^a-z0-9]+/gi, '_').toLowerCase()}.${ext}`
  writeFileSync(out, Buffer.from(contenido, 'base64'))
  console.log('    exportado a', out)
  const [perfil] = await q('select mapeo, encabezados from perfiles_balance p join auditorias a on a.empresa_id=p.empresa_id where a.id=$1', [a.auditoria_id])
  console.log('    encabezados:', JSON.stringify(perfil?.encabezados))
  console.log('    mapeo      :', JSON.stringify(perfil?.mapeo))
  const [tot] = await q(`select count(*)::int filas, count(*) filter (where tercero is not null)::int terceros,
     count(*) filter (where debito is not null)::int con_mov from cuentas_balance where auditoria_id=$1`, [a.auditoria_id])
  console.log('    filas/terceros/con_movimiento:', JSON.stringify(tot))
  const niv = await q('select nivel, count(*)::int n from cuentas_balance where auditoria_id=$1 group by nivel order by nivel', [a.auditoria_id])
  console.log('    por nivel:', niv.map((r) => `${r.nivel}:${r.n}`).join(' '))
  const clases = await q(`select codigo, nombre, saldo_actual, saldo_inicial, debito, credito from cuentas_balance where auditoria_id=$1 and nivel=1 and tercero is null order by codigo`, [a.auditoria_id])
  for (const c of clases) console.log(`    clase ${c.codigo} ${String(c.nombre ?? '').slice(0, 22).padEnd(22)} final=${f(c.saldo_actual)} inicial=${f(c.saldo_inicial)} deb=${c.debito == null ? '-' : f(c.debito)} cred=${c.credito == null ? '-' : f(c.credito)}`)
  const contra = await q(`select codigo, nombre, saldo_actual from cuentas_balance where auditoria_id=$1 and tercero is null and nivel>=4
     and ((left(codigo,1) in ('1','5','6','7') and saldo_actual < 0) or (left(codigo,1) in ('2','3','4') and saldo_actual > 0)) order by abs(saldo_actual) desc limit 8`, [a.auditoria_id])
  console.log('    signos contrarios bajo convención natural (top 8):', contra.map((r) => `${r.codigo}=${f(r.saldo_actual)}`).join(' | ') || 'ninguno')
  const [meta] = await q('select corte_desde, corte_hasta, comparativo_nombre from balance_meta where auditoria_id=$1', [a.auditoria_id])
  console.log('    meta:', JSON.stringify(meta ?? null))
  const [mat] = await q('select base_calculo, materialidad, aprobada from materialidades where auditoria_id=$1', [a.auditoria_id])
  console.log('    materialidad:', JSON.stringify(mat ?? null))
}
await pool.end()
