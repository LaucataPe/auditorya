/**
 * Ventana para leer un libro contable de cualquier software: cuando el lector no
 * reconoce el archivo solo (encabezados propios, otro programa), el auditor dice
 * qué es cada columna. Basta con lo mínimo —cuenta, débitos y créditos en un
 * balance; fecha, cuenta e importe en un auxiliar— y lo demás es opcional. Al
 * cargar, las columnas quedan en la memoria de la empresa con la firma del
 * encabezado y desde ahí ese formato se lee solo. También sirve para corregir
 * columnas que la detección automática tomó mal.
 */
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Table2 } from 'lucide-react'
import { faltaParaFormato, leerConColumnas, sugerirFilaEncabezado, type HojaLibro } from '@auditorya/types'
import { cn } from '../../lib/cn'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import type { ColumnasIndicadas } from '../../hooks/useAgenteIva'

export type EstadoColumnas = {
  archivo: File
  hojas: HojaLibro[]
  hoja: string
  motivo: string | null
  /** Columnas con que se leyó (al corregir) o con que se intentó la última vez. */
  inicial?: ColumnasIndicadas
}

type Familia = ColumnasIndicadas['familia']

const ROLES: Record<Familia, { rol: string; label: string }[]> = {
  balance: [
    { rol: 'cuenta', label: 'Código de la cuenta' },
    { rol: 'nombre', label: 'Nombre de la cuenta' },
    { rol: 'debito', label: 'Débitos del período' },
    { rol: 'credito', label: 'Créditos del período' },
    { rol: 'saldoInicial', label: 'Saldo inicial' },
    { rol: 'saldoFinal', label: 'Saldo final' },
    { rol: 'tercero', label: 'NIT del tercero' },
    { rol: 'terceroNombre', label: 'Nombre del tercero' },
  ],
  movimientos: [
    { rol: 'fecha', label: 'Fecha' },
    { rol: 'cuenta', label: 'Código de la cuenta' },
    { rol: 'cuentaNombre', label: 'Nombre de la cuenta' },
    { rol: 'debito', label: 'Débito' },
    { rol: 'credito', label: 'Crédito' },
    { rol: 'valor', label: 'Valor (una sola columna con signo)' },
    { rol: 'tercero', label: 'NIT del tercero' },
    { rol: 'terceroNombre', label: 'Nombre del tercero' },
    { rol: 'tipoDoc', label: 'Tipo de comprobante' },
    { rol: 'numeroDoc', label: 'Número de documento' },
    { rol: 'concepto', label: 'Concepto o detalle' },
    { rol: 'base', label: 'Base de retención o IVA' },
    { rol: 'tarifa', label: 'Tarifa (%)' },
  ],
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Propuesta inicial por el texto del encabezado (el auditor la corrige). */
function adivinar(encabezado: string[], familia: Familia): Record<string, number | null> {
  const out: Record<string, number | null> = {}
  const usadas = new Set<number>()
  const poner = (rol: string, pred: (t: string) => boolean) => {
    const i = encabezado.findIndex((t, idx) => !usadas.has(idx) && t !== '' && pred(norm(t)))
    if (i >= 0) { out[rol] = i; usadas.add(i) }
  }
  const saldo = (t: string) => /saldo|inicial|anterior|final|nuevo/.test(t)
  if (familia === 'movimientos') poner('fecha', (t) => /fecha/.test(t))
  poner('debito', (t) => /debit|debe/.test(t) && !saldo(t))
  poner('credito', (t) => /credit|haber/.test(t) && !saldo(t))
  if (familia === 'movimientos' && out.debito === undefined) poner('valor', (t) => /^(valor|neto|importe|monto)/.test(t))
  poner('cuenta', (t) => /^(codigo|cod|cuenta|cta|puc)/.test(t) && !/nombre|tercero/.test(t))
  poner(familia === 'balance' ? 'nombre' : 'cuentaNombre', (t) => /nombre|descripcion|^cuenta$|denominacion/.test(t) && !/tercero|razon/.test(t))
  poner('tercero', (t) => /^(nit|identificacion|cedula|tercero$|documento del tercero)/.test(t))
  poner('terceroNombre', (t) => /razon social|nombre (del )?tercero|^terceros$/.test(t))
  if (familia === 'balance') {
    poner('saldoInicial', (t) => /saldo (inicial|anterior)|^inicial|^anterior/.test(t))
    poner('saldoFinal', (t) => /saldo (final|actual)|nuevo saldo|^final/.test(t))
  } else {
    poner('tipoDoc', (t) => /^tipo|^tp/.test(t))
    poner('numeroDoc', (t) => /documento|comprobante|^n[°o.]|^numero|^nro/.test(t))
    poner('concepto', (t) => /concepto|detalle|descripcion|observacion|nota/.test(t))
    poner('base', (t) => /^base/.test(t))
    poner('tarifa', (t) => /^%|tarifa|porcentaje/.test(t))
  }
  return out
}

const fmt = (n: number) => Math.round(n).toLocaleString('es-CO')

export function ModalColumnasLibro({ estado, cargando, onClose, onLeer }: {
  estado: EstadoColumnas | null
  cargando: boolean
  onClose: () => void
  onLeer: (hoja: string, indicadas: ColumnasIndicadas) => void | Promise<void>
}) {
  const [hoja, setHoja] = useState('')
  const [familia, setFamilia] = useState<Familia>('balance')
  const [fila, setFila] = useState(0)
  const [columnas, setColumnas] = useState<Record<string, number | null>>({})

  const filas = useMemo(() => estado?.hojas.find((h) => h.nombre === hoja)?.filas ?? [], [estado, hoja])

  // Cada archivo (o cada corrección) arranca con lo que ya se sabe: las columnas con que se leyó, o una propuesta.
  useEffect(() => {
    if (!estado) return
    const h = estado.hojas.find((x) => x.nombre === estado.hoja) ?? estado.hojas.find((x) => x.filas.length) ?? estado.hojas[0]
    setHoja(h?.nombre ?? '')
    if (estado.inicial) {
      setFamilia(estado.inicial.familia)
      setFila(estado.inicial.fila)
      setColumnas(estado.inicial.columnas)
    } else {
      const f = sugerirFilaEncabezado(h?.filas ?? [])
      const tieneFecha = (h?.filas[f] ?? []).some((c) => /fecha/i.test(c))
      const fam: Familia = tieneFecha ? 'movimientos' : 'balance'
      setFamilia(fam)
      setFila(f)
      setColumnas(adivinar(h?.filas[f] ?? [], fam))
    }
  }, [estado])

  const encabezado = filas[fila] ?? []
  const muestra = filas.slice(fila + 1, fila + 6)
  const ancho = Math.min(40, Math.max(encabezado.length, ...muestra.map((r) => r.length), 1))
  const rolDe = (col: number) => Object.entries(columnas).find(([, v]) => v === col)?.[0] ?? ''
  const asignar = (col: number, rol: string) => {
    setColumnas((prev) => {
      const nuevo: Record<string, number | null> = {}
      for (const [r, v] of Object.entries(prev)) if (v !== col && r !== rol) nuevo[r] = v
      if (rol) nuevo[rol] = col
      return nuevo
    })
  }
  const cambiarFamilia = (f: Familia) => { setFamilia(f); setColumnas(adivinar(encabezado, f)) }
  const cambiarFila = (f: number) => { setFila(f); setColumnas(adivinar(filas[f] ?? [], familia)) }

  const falta = faltaParaFormato(familia, columnas)
  // Vista previa: cómo queda el archivo con estas columnas, antes de cargarlo.
  const previa = useMemo(() => {
    if (falta.length || !filas.length) return null
    const libro = leerConColumnas(filas, familia, fila, columnas)
    if (!libro) return { ok: false as const, texto: 'Con estas columnas no salió ninguna cuenta. Revisa la fila de encabezado y que la columna de cuenta tenga códigos.' }
    if (libro.familia === 'balance') {
      const c = libro.balance.cuentas
      const d = c.reduce((s, x) => s + x.debitos, 0)
      const h = c.reduce((s, x) => s + x.creditos, 0)
      return { ok: true as const, texto: `${c.length} cuenta(s) hoja · débitos $${fmt(d)} · créditos $${fmt(h)}${Math.abs(d - h) > 1 ? ' (no son iguales: puede ser un balance parcial, de unas cuentas)' : ' (cuadran)'}${libro.balance.terceros.length ? ` · ${libro.balance.terceros.length} saldo(s) por tercero` : ''}` }
    }
    const m = libro.auxiliar.movimientos
    const fechas = m.map((x) => x.fecha).sort()
    return { ok: true as const, texto: `${m.length} asiento(s) del ${fechas[0]} al ${fechas.at(-1)} en ${new Set(m.map((x) => x.cuenta)).size} cuenta(s)` }
  }, [filas, familia, fila, columnas, falta.length])

  if (!estado) return null
  const conContenido = estado.hojas.filter((h) => h.filas.length > 0)
  const opcionesFila = filas.slice(0, 30).map((r, i) => ({ i, texto: r.filter((c) => c.trim()).join(' · ').slice(0, 90) || '(vacía)' }))

  return (
    <Modal open onClose={onClose} title="Indica las columnas del archivo" size="xl">
      <div className="space-y-4 text-sm">
        <p className="text-xs leading-relaxed text-gray-600">
          {estado.inicial ? 'Corrige qué es cada columna de' : 'No reconocí solo el formato de'} <span className="font-medium text-gray-800">{estado.archivo.name}</span>.
          Indícalo una vez: queda guardado para esta empresa y la próxima vez ese formato se lee solo. Basta con lo mínimo
          ({familia === 'balance' ? 'código de la cuenta, débitos y créditos' : 'fecha, código de la cuenta y débito y crédito, o una columna de valor'}); lo demás es opcional y amplía lo que el agente puede verificar.
        </p>
        {estado.motivo && (
          <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"><AlertTriangle size={13} className="mt-0.5 shrink-0" /> {estado.motivo}</p>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {conContenido.length > 1 && (
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-gray-700">Hoja</span>
              <select value={hoja} onChange={(e) => { setHoja(e.target.value); const f = sugerirFilaEncabezado(estado.hojas.find((h) => h.nombre === e.target.value)?.filas ?? []); setFila(f); setColumnas(adivinar(estado.hojas.find((h) => h.nombre === e.target.value)?.filas[f] ?? [], familia)) }} className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm">
                {conContenido.map((h) => <option key={h.nombre} value={h.nombre}>{h.nombre} ({h.filas.length} filas)</option>)}
              </select>
            </label>
          )}
          <div className="text-xs">
            <span className="mb-1 block font-medium text-gray-700">¿Qué es el archivo?</span>
            <div className="flex rounded-lg border border-gray-200 p-0.5">
              {([['balance', 'Balance de prueba'], ['movimientos', 'Libro auxiliar']] as [Familia, string][]).map(([f, label]) => (
                <button key={f} onClick={() => cambiarFamilia(f)} className={cn('flex-1 rounded-md px-2 py-1 font-medium', familia === f ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50')}>{label}</button>
              ))}
            </div>
          </div>
          <label className={cn('block text-xs', conContenido.length > 1 ? '' : 'md:col-span-2')}>
            <span className="mb-1 block font-medium text-gray-700">Fila de los títulos de columna</span>
            <select value={fila} onChange={(e) => cambiarFila(Number(e.target.value))} className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm">
              {opcionesFila.map((o) => <option key={o.i} value={o.i}>Fila {o.i + 1}: {o.texto}</option>)}
            </select>
          </label>
        </div>

        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-gray-700"><Table2 size={13} className="text-indigo-500" /> Elige qué es cada columna (las que no uses, déjalas en "No usar")</p>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="text-[11px]">
              <thead className="bg-gray-50">
                <tr>
                  {Array.from({ length: ancho }, (_, col) => (
                    <th key={col} className="min-w-[9rem] border-b border-gray-200 px-2 py-1.5 text-left align-top font-normal">
                      <select
                        value={rolDe(col)}
                        onChange={(e) => asignar(col, e.target.value)}
                        className={cn('mb-1 w-full rounded border px-1 py-0.5 text-[11px]', rolDe(col) ? 'border-indigo-300 bg-indigo-50 font-medium text-indigo-800' : 'border-gray-200 bg-white text-gray-500')}
                      >
                        <option value="">No usar</option>
                        {ROLES[familia].map((r) => <option key={r.rol} value={r.rol}>{r.label}</option>)}
                      </select>
                      <span className="block truncate font-semibold text-gray-700" title={encabezado[col]}>{encabezado[col] || `Columna ${col + 1}`}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {muestra.map((r, i) => (
                  <tr key={i}>
                    {Array.from({ length: ancho }, (_, col) => <td key={col} className={cn('max-w-[12rem] truncate px-2 py-1 text-gray-600', rolDe(col) && 'bg-indigo-50/40')} title={r[col]}>{r[col] ?? ''}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {falta.length > 0 ? (
          <p className="text-xs text-amber-700">Falta indicar {falta.join(', ')}.</p>
        ) : previa && (
          <p className={cn('flex items-start gap-1.5 text-xs', previa.ok ? 'text-emerald-700' : 'text-amber-700')}>
            {previa.ok ? <CheckCircle2 size={13} className="mt-0.5 shrink-0" /> : <AlertTriangle size={13} className="mt-0.5 shrink-0" />} {previa.texto}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={cargando}>Cancelar</Button>
          <Button loading={cargando} disabled={falta.length > 0 || previa?.ok === false} onClick={() => void onLeer(hoja, { familia, fila, columnas })}>Leer con estas columnas</Button>
        </div>
      </div>
    </Modal>
  )
}
