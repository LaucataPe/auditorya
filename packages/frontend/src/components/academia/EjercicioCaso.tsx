import { useMemo, useState } from 'react'
import { CheckCircle2, Download, FileText, FolderOpen, Printer, RotateCcw, XCircle } from 'lucide-react'
import {
  EMPRESA_CASO, PERSONAJES_CASO, evaluarCalculo, evaluarDocumento, leerNumero, llenarPlantilla,
  type EjercicioCaso, type Leccion,
} from '@auditorya/types'
import { Button } from '../ui/Button'
import { cn } from '../../lib/cn'
import { construirHtmlInforme, descargarDocx, imprimirInforme } from '../../lib/informe-export'
import { useAcademiaStore, useExpedienteStore } from '../../store/academia.store'
import { toast } from '../../store/toast.store'
import { tituloDocumento } from './Expediente'

type Props<T extends EjercicioCaso['tipo']> = { ejercicio: Extract<EjercicioCaso, { tipo: T }>; onResuelto: () => void }

const ETIQUETA_TIPO: Record<EjercicioCaso['tipo'], string> = {
  decision: 'Decide',
  documento: 'Completa el documento',
  calculo: 'Calcula',
  clasificar: 'Clasifica',
}

// ─── Decidir ─────────────────────────────────────────────────────────────────

function Decision({ ejercicio, onResuelto }: Props<'decision'>) {
  const [elegida, setElegida] = useState<number | null>(null)
  const acerto = elegida !== null && ejercicio.opciones[elegida].correcta

  return (
    <div className="space-y-3">
      <p className="font-semibold text-slate-900">{ejercicio.pregunta}</p>
      {ejercicio.opciones.map((o, i) => {
        const mostrada = elegida === i || (acerto && o.correcta)
        return (
          <div key={o.texto}>
            <button
              type="button"
              disabled={acerto}
              onClick={() => {
                setElegida(i)
                if (o.correcta) onResuelto()
              }}
              className={cn(
                'w-full rounded-xl border px-4 py-3 text-left text-sm transition-colors',
                mostrada && o.correcta && 'border-emerald-300 bg-emerald-50 text-emerald-900',
                mostrada && !o.correcta && 'border-rose-300 bg-rose-50 text-rose-900',
                !mostrada && 'border-slate-200 bg-white hover:border-violet-300 disabled:opacity-60',
              )}
            >
              {o.texto}
            </button>
            {elegida === i && (
              <p className={cn('mt-1.5 px-1 text-sm', o.correcta ? 'text-emerald-700' : 'text-rose-700')}>{o.feedback}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Clasificar ──────────────────────────────────────────────────────────────

function Clasificar({ ejercicio, onResuelto }: Props<'clasificar'>) {
  const [asignadas, setAsignadas] = useState<Record<string, string>>({})
  const [revisado, setRevisado] = useState(false)
  const completo = ejercicio.items.every((it) => asignadas[it.id])
  const aciertos = ejercicio.items.filter((it) => asignadas[it.id] === it.correcta).length
  const todoBien = revisado && aciertos === ejercicio.items.length

  function revisar() {
    setRevisado(true)
    if (ejercicio.items.every((it) => asignadas[it.id] === it.correcta)) onResuelto()
  }

  return (
    <div className="space-y-3">
      <p className="font-semibold text-slate-900">{ejercicio.instruccion}</p>
      <ul className="space-y-2">
        {ejercicio.items.map((it) => {
          const ok = asignadas[it.id] === it.correcta
          return (
            <li key={it.id} className={cn(
              'rounded-xl border bg-white p-3',
              revisado ? (ok ? 'border-emerald-200' : 'border-rose-200') : 'border-slate-200',
            )}>
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                <p className="flex-1 text-sm text-slate-800">{it.texto}</p>
                <div className="flex flex-wrap gap-1.5">
                  {ejercicio.categorias.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      disabled={todoBien}
                      onClick={() => {
                        setAsignadas((prev) => ({ ...prev, [it.id]: cat }))
                        setRevisado(false)
                      }}
                      className={cn(
                        'rounded-lg border px-2.5 py-1 text-xs font-medium',
                        asignadas[it.id] === cat ? 'border-violet-500 bg-violet-600 text-white' : 'border-slate-200 text-slate-600 hover:border-violet-300',
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
              {revisado && (
                <p className={cn('mt-2 flex items-start gap-1.5 text-xs', ok ? 'text-emerald-700' : 'text-rose-700')}>
                  {ok ? <CheckCircle2 size={13} className="mt-0.5 shrink-0" /> : <XCircle size={13} className="mt-0.5 shrink-0" />}
                  {ok ? it.explicacion : 'Revisa esta: no es la clasificación correcta.'}
                </p>
              )}
            </li>
          )
        })}
      </ul>
      {!todoBien && (
        <div className="flex items-center gap-3">
          <Button size="sm" disabled={!completo} onClick={revisar}>Revisar</Button>
          {revisado && <span className="text-sm text-slate-600">{aciertos} de {ejercicio.items.length} correctas: corrige las marcadas y vuelve a revisar.</span>}
        </div>
      )}
    </div>
  )
}

// ─── Calcular ────────────────────────────────────────────────────────────────

const UNIDAD: Record<string, string> = { millones: 'millones de $', horas: 'horas', '%': '%', veces: 'veces' }

function Calculo({ ejercicio, onResuelto }: Props<'calculo'>) {
  const [valores, setValores] = useState<Record<string, string>>({})
  const [revisado, setRevisado] = useState(false)
  const ok = (id: string) => evaluarCalculo(ejercicio.items.find((x) => x.id === id)!, valores[id] ?? '')
  const todoBien = revisado && ejercicio.items.every((it) => ok(it.id))

  function revisar() {
    setRevisado(true)
    if (ejercicio.items.every((it) => ok(it.id))) onResuelto()
  }

  // Reparto de una cifra: la suma en vivo ayuda a ver si cuadra antes de revisar.
  const total = ejercicio.total
  const suma = ejercicio.items.reduce((acc, it) => acc + (leerNumero(valores[it.id] ?? '') ?? 0), 0)
  const cuadra = !!total && Math.abs(suma - total.valor) < 0.005
  const unidadTotal = UNIDAD[ejercicio.items[0].unidad]

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {ejercicio.items.map((it) => {
          const estado = !revisado ? null : ok(it.id) ? 'bien' : 'mal'
          return (
            <li key={it.id} className={cn('px-4 py-3', estado === 'mal' && 'bg-rose-50/60')}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                <label htmlFor={`calc-${it.id}`} className="min-w-0 flex-1 text-sm text-slate-800">{it.enunciado}</label>
                <div className="flex shrink-0 items-center gap-2">
                  <input
                    id={`calc-${it.id}`}
                    inputMode="decimal"
                    disabled={todoBien}
                    value={valores[it.id] ?? ''}
                    onChange={(e) => { setValores((p) => ({ ...p, [it.id]: e.target.value })); setRevisado(false) }}
                    className={cn(
                      'w-28 rounded-lg border px-3 py-1.5 text-right font-mono text-sm tabular-nums focus:outline-none focus:ring-1',
                      estado === 'bien' ? 'border-emerald-300 focus:ring-emerald-400'
                        : estado === 'mal' ? 'border-rose-300 focus:ring-rose-400'
                          : 'border-slate-300 focus:border-violet-500 focus:ring-violet-500',
                    )}
                  />
                  <span className="w-24 text-xs text-slate-500">{UNIDAD[it.unidad]}</span>
                  <span className="w-4">
                    {estado === 'bien' && <CheckCircle2 size={16} className="text-emerald-500" aria-label="Correcto" />}
                    {estado === 'mal' && <XCircle size={16} className="text-rose-500" aria-label="Incorrecto" />}
                  </span>
                </div>
              </div>
              {estado === 'mal' && <p className="mt-1.5 text-xs text-rose-700">Pista: {it.pista}</p>}
            </li>
          )
        })}
        {total && (
          <li className="flex flex-col gap-1 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
            <span className="min-w-0 flex-1 text-sm font-semibold text-slate-900">{total.etiqueta}</span>
            <span className="flex shrink-0 items-center gap-2">
              <span className={cn('w-28 text-right font-mono text-sm font-semibold tabular-nums', cuadra ? 'text-emerald-700' : 'text-slate-700')}>
                {new Intl.NumberFormat('es-CO').format(suma)}
              </span>
              <span className={cn('w-28 text-xs', cuadra ? 'text-emerald-700' : 'text-slate-500')}>
                {cuadra ? `${unidadTotal} · cuadra` : `de ${new Intl.NumberFormat('es-CO').format(total.valor)} ${unidadTotal}`}
              </span>
            </span>
          </li>
        )}
      </ul>
      {!todoBien && (
        <Button size="sm" disabled={ejercicio.items.some((it) => !(valores[it.id] ?? '').trim())} onClick={revisar}>Revisar</Button>
      )}
    </div>
  )
}

// ─── Documento ───────────────────────────────────────────────────────────────

function Documento({ ejercicio, onResuelto }: Props<'documento'>) {
  const doc = ejercicio.documento
  const [valores, setValores] = useState<Record<string, string>>({})
  const [errores, setErrores] = useState<Record<string, string | null> | null>(null)
  const valido = !!errores && Object.values(errores).every((e) => e === null)

  const secciones = useMemo(
    () => doc.secciones.map((s) => ({ label: s.titulo, contenido: llenarPlantilla(s.texto, valores) })),
    [doc.secciones, valores],
  )
  const exportOpts = () => ({ titulo: doc.titulo, empresaNombre: EMPRESA_CASO.nombre, periodo: '2026', secciones })

  function revisar() {
    const r = evaluarDocumento(doc.campos, valores)
    setErrores(r)
    if (Object.values(r).every((e) => e === null)) onResuelto()
  }

  async function descargarWord() {
    try {
      await descargarDocx(doc.nombreArchivo, exportOpts())
    } catch {
      toast.error('No se pudo generar el Word')
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <div className="space-y-3">
        {doc.campos.map((c) => {
          const error = errores?.[c.id]
          const comun = cn(
            'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1',
            error ? 'border-rose-400 focus:ring-rose-400' : errores ? 'border-emerald-300 focus:ring-violet-500' : 'border-slate-300 focus:border-violet-500 focus:ring-violet-500',
          )
          const cambiar = (v: string) => { setValores((p) => ({ ...p, [c.id]: v })); setErrores(null) }
          return (
            <div key={c.id}>
              <label htmlFor={`doc-${c.id}`} className="mb-1 block text-sm font-medium text-slate-700">{c.etiqueta}</label>
              {c.tipo === 'opcion' ? (
                <select id={`doc-${c.id}`} value={valores[c.id] ?? ''} onChange={(e) => cambiar(e.target.value)} className={cn(comun, 'bg-white')}>
                  <option value="">— Elige —</option>
                  {c.opciones!.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : c.tipo === 'textoLargo' ? (
                <textarea id={`doc-${c.id}`} rows={3} value={valores[c.id] ?? ''} onChange={(e) => cambiar(e.target.value)} className={comun} />
              ) : (
                <input id={`doc-${c.id}`} value={valores[c.id] ?? ''} onChange={(e) => cambiar(e.target.value)} className={comun} />
              )}
              {error && <p className="mt-1 text-xs text-rose-700">{error}</p>}
            </div>
          )
        })}
        {!valido && <Button size="sm" onClick={revisar}>Revisar documento</Button>}
      </div>

      <div className="space-y-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <FileText size={13} /> Vista previa
          </p>
          <h4 className="mt-2 text-base font-bold text-slate-900">{doc.titulo}</h4>
          <p className="text-xs text-slate-500">{EMPRESA_CASO.nombre} · Período 2026</p>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-700">
            {secciones.map((s) => (
              <div key={s.label}>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{s.label}</p>
                <p className="mt-0.5 whitespace-pre-wrap">{s.contenido}</p>
              </div>
            ))}
          </div>
        </div>
        {valido && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" className="gap-1.5" onClick={descargarWord}>
              <Download size={14} /> Descargar Word
            </Button>
            <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => imprimirInforme(construirHtmlInforme(exportOpts()))}>
              <Printer size={14} /> Imprimir / PDF
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Contenedor ──────────────────────────────────────────────────────────────

/** Ejercicio del caso de una lección: mensaje del personaje, el ejercicio y el cierre al resolverlo. */
export function EjercicioCasoLeccion({ leccion }: { leccion: Leccion }) {
  const ejercicio = leccion.ejercicio!
  const persona = PERSONAJES_CASO[ejercicio.deQuien]
  const abrirExpediente = useExpedienteStore((s) => s.abrir)
  const marcarEjercicio = useAcademiaStore((s) => s.marcarEjercicio)
  const yaResuelto = useAcademiaStore((s) => s.progreso.ejercicios.includes(leccion.id))
  const [resueltoAhora, setResueltoAhora] = useState(false)
  const [intento, setIntento] = useState(0)

  function onResuelto() {
    setResueltoAhora(true)
    if (!yaResuelto) {
      marcarEjercicio(leccion.id)
      toast.success(`Ejercicio de la lección ${leccion.id} resuelto`)
    }
  }

  const resuelto = resueltoAhora || yaResuelto
  const props = { onResuelto }

  return (
    <section className="overflow-hidden rounded-2xl border-2 border-violet-300 bg-white">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-violet-950 px-4 py-3 text-white sm:px-5">
        <span className="rounded-md bg-violet-500/30 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-violet-200">
          {ETIQUETA_TIPO[ejercicio.tipo]}
        </span>
        <p className="min-w-0 flex-1 text-sm font-semibold">{ejercicio.titulo}</p>
        {resuelto && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-300"><CheckCircle2 size={13} /> Resuelto</span>
        )}
        {resuelto && (
          <button
            type="button"
            onClick={() => { setIntento((n) => n + 1); setResueltoAhora(false) }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/60 px-2.5 py-1 text-xs text-violet-100 hover:bg-white/10"
          >
            <RotateCcw size={12} /> Hacerlo de nuevo
          </button>
        )}
      </div>

      <div className="space-y-5 p-4 sm:p-5">
        {/* Mensaje del personaje */}
        <div className="flex gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-600 text-sm font-semibold text-white sm:h-10 sm:w-10">
            {persona.iniciales}
          </span>
          <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm bg-slate-100 px-3 py-3 sm:px-4">
            <p className="text-xs text-slate-500"><b className="text-slate-700">{persona.nombre}</b> · {persona.rol}</p>
            <p className="mt-1 text-[15px] text-slate-800">{ejercicio.mensaje}</p>
            {ejercicio.expediente && ejercicio.expediente.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {ejercicio.expediente.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => abrirExpediente(id)}
                    className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-white px-2.5 py-0.5 text-xs text-violet-700 hover:border-violet-400"
                  >
                    <FolderOpen size={11} /> {tituloDocumento(id)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* El ejercicio (key: «hacerlo de nuevo» lo reinicia) */}
        <div key={intento}>
          {ejercicio.tipo === 'decision' && <Decision ejercicio={ejercicio} {...props} />}
          {ejercicio.tipo === 'clasificar' && <Clasificar ejercicio={ejercicio} {...props} />}
          {ejercicio.tipo === 'calculo' && <Calculo ejercicio={ejercicio} {...props} />}
          {ejercicio.tipo === 'documento' && <Documento ejercicio={ejercicio} {...props} />}
        </div>

        {resuelto && (
          <div className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />
            <p className="text-sm text-emerald-900"><b>Lo que debe quedar:</b> {ejercicio.cierre}</p>
          </div>
        )}
      </div>
    </section>
  )
}
