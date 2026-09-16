import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, Sparkles, Upload } from 'lucide-react'
import type { ArranqueAgente } from '@auditorya/types'
import { Button } from '../../components/ui/Button'
import { BalanceImportWizard, type ArchivoBalance, type ImportarBalancePayload } from '../../components/auditoria/BalanceImportWizard'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { parseCsv } from '../../lib/csv'
import { leerExcelAFilas } from '../../lib/xlsx-loader'
import { useAuthStore } from '../../store/auth.store'

type Pantalla = 'bienvenida' | 'empresa' | 'balance' | 'revisando' | 'listo'
const ORDEN: Pantalla[] = ['bienvenida', 'empresa', 'balance', 'revisando', 'listo']

type Auditoria = { id: string; fechaInicio: string; fechaFin: string; tipoServicio: string; agenteActivado?: boolean; arranqueCompletadoAt?: string | null; empresa: { id: string; nombre: string } }

const money = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`
const fmtFecha = (d: string) => new Date(d.slice(0, 10) + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result ?? '').split(',')[1] ?? '')
    r.onerror = () => reject(new Error('No se pudo leer el archivo'))
    r.readAsDataURL(file)
  })
}

function Agente() {
  return (
    <div className="flex items-center gap-2.5 text-xs text-gray-400">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-white"><Sparkles size={13} /></span>
      <span><span className="font-semibold text-gray-600">Tu agente</span> · te acompaña en este encargo</span>
    </div>
  )
}

/**
 * Arranque guiado de un encargo con agente: una sola pantalla al centro, sin rail,
 * que lleva al auditor desde "acabo de crear el encargo" hasta el primer hallazgo.
 */
export function EmpresaArranque() {
  const { id, auditoriaId } = useParams<{ id: string; auditoriaId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const nombreCorto = (user?.nombre ?? '').split(' ')[0]

  const { data: auditoria } = useQuery<Auditoria>({ queryKey: ['auditoria', auditoriaId], queryFn: () => api.get(`/auditorias/${auditoriaId}`), enabled: !!auditoriaId })
  const arranque = useQuery<ArranqueAgente>({ queryKey: ['agente', 'arranque', auditoriaId], queryFn: () => api.get(`/auditorias/${auditoriaId}/agente/arranque`), enabled: !!auditoriaId })

  const [pantalla, setPantalla] = useState<Pantalla | null>(null)
  useEffect(() => {
    if (pantalla !== null || !arranque.data) return
    const a = arranque.data
    setPantalla(a.balanceCargado && a.corrida ? 'listo' : a.entendimiento ? 'balance' : 'bienvenida')
  }, [arranque.data, pantalla])

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['agente', 'arranque', auditoriaId] })
    qc.invalidateQueries({ queryKey: ['agente', 'resumen', auditoriaId] })
    qc.invalidateQueries({ queryKey: ['auditoria', auditoriaId] })
    qc.invalidateQueries({ queryKey: ['progreso', auditoriaId] })
    qc.invalidateQueries({ queryKey: ['balance', auditoriaId] })
  }

  // ── Pantalla 2: empresa ──
  const [cambios, setCambios] = useState('')
  const [provisiona, setProvisiona] = useState<'no_se' | 'mensual' | 'cierre'>('no_se')
  const guardarEmpresa = useMutation({
    mutationFn: (saltar: boolean) => api.post(`/auditorias/${auditoriaId}/agente/arranque/empresa`, saltar ? {} : { cambios, provisionaRenta: provisiona }),
    onSuccess: () => { invalidar(); setPantalla('balance') },
  })

  // ── Pantalla 3: balance ──
  const fileRef = useRef<HTMLInputElement>(null)
  const [modo, setModo] = useState<'actual' | 'comparativo'>('actual')
  const [archivo, setArchivo] = useState<ArchivoBalance | null>(null)
  const [leyendo, setLeyendo] = useState(false)
  const [errorLectura, setErrorLectura] = useState<string | null>(null)
  const importar = useMutation({
    mutationFn: (p: ImportarBalancePayload) => modo === 'comparativo'
      ? api.post(`/auditorias/${auditoriaId}/balance/comparativo`, { cuentas: p.cuentas.filter((c) => !c.tercero).map((c) => ({ codigo: c.codigo, nombre: c.nombre, nivel: c.nivel, saldo: c.saldoActual })), archivoNombre: archivo?.nombre })
      : api.post(`/auditorias/${auditoriaId}/balance`, { cuentas: p.cuentas, perfil: p.perfil, corteDesde: p.corteDesde, corteHasta: p.corteHasta, archivo: archivo ? { nombre: archivo.nombre, tamano: archivo.tamano, contenido: archivo.contenido } : undefined }),
    onSuccess: async () => {
      setArchivo(null)
      invalidar()
      if (modo === 'actual') { await arranque.refetch(); setPantalla('revisando') }
    },
  })
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setErrorLectura(null); setLeyendo(true)
    try {
      const filas = /\.(xlsx|xlsm|xls)$/i.test(file.name) ? await leerExcelAFilas(file) : parseCsv(await file.text())
      if (filas.length === 0) { setErrorLectura('El archivo está vacío o no se pudo leer.'); return }
      setArchivo({ filas, nombre: file.name, tamano: file.size, contenido: await fileToBase64(file) })
    } catch (err) { setErrorLectura(err instanceof Error ? err.message : 'No se pudo leer el archivo') } finally { setLeyendo(false) }
  }

  // ── Pantalla 4: revisando (bitácora en vivo) ──
  const [visibles, setVisibles] = useState(0)
  useEffect(() => {
    if (pantalla !== 'revisando') return
    const lineas = arranque.data?.corrida?.bitacora ?? []
    if (lineas.length === 0) { const t = setTimeout(() => arranque.refetch(), 1500); return () => clearTimeout(t) }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setVisibles(0)
    let k = 0
    const t = setInterval(() => { k++; setVisibles(k); if (k >= lineas.length) { clearInterval(t); setTimeout(() => setPantalla('listo'), reduce ? 0 : 800) } }, reduce ? 0 : 420)
    return () => clearInterval(t)
  }, [pantalla, arranque.data?.corrida?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Completar ──
  const completar = useMutation({
    mutationFn: () => api.post(`/auditorias/${auditoriaId}/agente/arranque/completar`, {}),
    onSuccess: () => invalidar(),
  })
  async function irAlEncargo(paso?: string) {
    await completar.mutateAsync()
    navigate(`/empresas/${id}/encargos/${auditoriaId}${paso ? `?paso=${paso}` : ''}`, { replace: true })
  }

  const a = arranque.data
  const idx = pantalla ? ORDEN.indexOf(pantalla) : 0
  const empresaNombre = auditoria?.empresa.nombre ?? a?.empresa.nombre ?? ''

  if (!a || !pantalla) {
    return <div className="flex justify-center py-20"><div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" /></div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex items-center gap-4 border-b border-gray-200 bg-white px-6 py-3">
        <button
          type="button"
          onClick={() => navigate(`/empresas/${id}/encargos`)}
          aria-label="Volver a los encargos"
          title="Volver a los encargos"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0"><p className="truncate text-sm font-semibold text-gray-900">{empresaNombre}</p><p className="text-xs text-gray-400">{auditoria ? `${fmtFecha(auditoria.fechaInicio)} – ${fmtFecha(auditoria.fechaFin)}` : ''} · recién creado</p></div>
        <div className="flex-1" />
        <div className="flex items-center gap-1.5" aria-label={`Paso ${idx + 1} de ${ORDEN.length}`}>
          {ORDEN.map((p, k) => <i key={p} className={cn('h-1 w-5 rounded-full', k < idx ? 'bg-emerald-500' : k === idx ? 'bg-indigo-600' : 'bg-gray-200')} />)}
          <span className="ml-1 font-mono text-xs text-gray-400 tabular-nums">{idx + 1}/{ORDEN.length}</span>
        </div>
        <button onClick={() => irAlEncargo()} className="text-xs text-gray-400 underline underline-offset-2 hover:text-gray-600">Ir al encargo sin la guía</button>
      </div>

      <div className="mx-auto w-full max-w-2xl px-4 py-12">
        {pantalla === 'bienvenida' && (
          <div className="space-y-5 animate-fade-in">
            <Agente />
            <h1 className="text-[26px] font-bold leading-tight tracking-tight text-gray-900 text-balance">Hola{nombreCorto ? `, ${nombreCorto}` : ''}. Vamos a arrancar el encargo de {empresaNombre}.</h1>
            <p className="text-[15px] text-gray-600">Para empezar a trabajar necesito conocer la empresa y leer su balance de prueba. Son tres pasos y toma unos cinco minutos. Lo demás lo voy pidiendo después, y siempre te digo para qué.</p>
            <div className="space-y-2">
              {[['Conocer la empresa', 'Te muestro lo que ya sé y te hago dos preguntas.'], ['Subir el balance de prueba', 'En el formato que salga de tu programa contable. Yo lo leo.'], ['Ver lo que encontré', 'Hallazgos con su explicación y una materialidad propuesta.']].map(([t, s], k) => (
                <div key={t} className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
                  <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold', k === 0 ? 'bg-indigo-600 text-white' : 'border border-gray-300 text-gray-400')}>{k + 1}</span>
                  <div><p className="text-sm font-semibold text-gray-900">{t}</p><p className="text-[13px] text-gray-500">{s}</p></div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4"><Button onClick={() => setPantalla('empresa')}>Empezar</Button><span className="text-xs text-gray-400">Puedes salir cuando quieras; al volver retomas aquí.</span></div>
          </div>
        )}

        {pantalla === 'empresa' && (
          <div className="space-y-5 animate-fade-in">
            <Agente />
            <h1 className="text-[26px] font-bold leading-tight tracking-tight text-gray-900 text-balance">Esto es lo que ya sé de {empresaNombre}.</h1>
            <p className="text-[15px] text-gray-600">Lo tomé de la ficha de la empresa y de los documentos cargados. Si algo está mal, corrígelo en la ficha después. Ahora respóndeme dos cosas.</p>
            <dl className="grid grid-cols-[150px_1fr] gap-x-4 gap-y-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-[13.5px]">
              <dt className="text-gray-400">Sector</dt><dd className="text-gray-900">{a.empresa.sector}{a.empresa.ciiu ? ` · CIIU ${a.empresa.ciiu}` : ''}</dd>
              {a.empresa.actividadEconomica && (<><dt className="text-gray-400">Actividad</dt><dd className="text-gray-900">{a.empresa.actividadEconomica}</dd></>)}
              <dt className="text-gray-400">Marco contable</dt><dd className="text-gray-900">{a.empresa.marcoContable.replace('_', ' ')}</dd>
              <dt className="text-gray-400">RUT</dt><dd>{a.documentos.rut ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700"><Check size={11} /> cargado</span> : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">no cargado</span>}<span className="ml-2 text-xs text-gray-400">lo uso para saber sus responsabilidades tributarias</span></dd>
              <dt className="text-gray-400">Cámara de comercio</dt><dd>{a.documentos.camaraComercio ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700"><Check size={11} /> cargada</span> : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">no cargada</span>}<span className="ml-2 text-xs text-gray-400">la pido después si la necesito</span></dd>
            </dl>
            <label className="block space-y-1.5" htmlFor="arr-cambios">
              <span className="text-sm font-semibold text-gray-900">¿Hubo cambios importantes este año?</span>
              <textarea id="arr-cambios" value={cambios} onChange={(e) => setCambios(e.target.value)} rows={4} placeholder="Nuevos socios, cambio de software contable, una línea de negocio nueva, un crédito grande… Si no hubo, déjalo vacío." className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400" />
              <span className="block text-xs text-gray-400">Con esto armo el entendimiento del período y te lo pongo como primera decisión para que lo confirmes.</span>
            </label>
            <label className="block space-y-1.5" htmlFor="arr-renta">
              <span className="text-sm font-semibold text-gray-900">¿La empresa provisiona el impuesto de renta mes a mes o solo al cierre?</span>
              <select id="arr-renta" value={provisiona} onChange={(e) => setProvisiona(e.target.value as typeof provisiona)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900">
                <option value="no_se">No lo sé, revísalo tú</option><option value="mensual">Mes a mes</option><option value="cierre">Solo al cierre</option>
              </select>
              <span className="block text-xs text-gray-400">Lo pregunto una sola vez por empresa: cambia cómo leo la cuenta 5405 en cortes intermedios.</span>
            </label>
            <div className="flex items-center gap-3">
              <Button loading={guardarEmpresa.isPending} onClick={() => guardarEmpresa.mutate(false)}>Listo, sigamos</Button>
              <Button variant="ghost" onClick={() => guardarEmpresa.mutate(true)}>Saltar por ahora</Button>
            </div>
          </div>
        )}

        {pantalla === 'balance' && (
          archivo ? (
            <div className="animate-fade-in">
              <Agente />
              <h1 className="mt-4 mb-1 text-[22px] font-bold tracking-tight text-gray-900">Confirma cómo leo las columnas</h1>
              <p className="mb-4 text-sm text-gray-600">Detecté el formato; revisa que cada columna sea lo que creo. Después no vuelvo a preguntarlo para esta empresa.</p>
              <BalanceImportWizard auditoriaId={auditoriaId!} archivo={archivo} modo={modo} onCancelar={() => setArchivo(null)} onImportar={(p) => importar.mutate(p)} importando={importar.isPending} errorImportar={importar.isError ? (importar.error instanceof Error ? importar.error.message : 'Error al importar') : null} />
            </div>
          ) : (
            <div className="space-y-5 animate-fade-in">
              <Agente />
              <h1 className="text-[26px] font-bold leading-tight tracking-tight text-gray-900 text-balance">Ahora sí: el balance de prueba.</h1>
              <p className="text-[15px] text-gray-600">Súbelo tal como sale de tu programa contable. Con saldos por tercero mejor, pero no es obligatorio. Yo detecto las columnas y en segundos te muestro lo que encuentro.</p>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xlsm,.xls" className="hidden" onChange={onFile} />
              {errorLectura && <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">{errorLectura}</p>}
              <button type="button" onClick={() => { setModo('actual'); fileRef.current?.click() }} disabled={leyendo} className="flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 bg-white px-6 py-12 transition-colors hover:border-indigo-400 hover:bg-indigo-50/40">
                <Upload size={28} className="mb-3 text-gray-300" />
                <span className="text-[15px] font-semibold text-gray-800">{leyendo ? 'Leyendo el archivo…' : 'Haz clic para elegir el balance de prueba'}</span>
                <span className="mt-1 text-[13px] text-gray-500">.xlsx, .xls o .csv · hasta 100.000 filas</span>
              </button>
              <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
                <div className="flex-1"><p className="text-[13.5px] font-semibold text-gray-900">¿Tienes también el balance del año anterior?</p><p className="text-xs text-gray-500">{a.comparativoCargado ? 'Ya lo tengo. Con él veo variaciones.' : 'Con él puedo ver variaciones. Si no lo tienes, sigo sin él y te lo pido después.'}</p></div>
                {a.comparativoCargado ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700"><Check size={11} /> cargado</span> : <Button variant="secondary" size="sm" onClick={() => { setModo('comparativo'); fileRef.current?.click() }}>Subir comparativo</Button>}
              </div>
              <div className="flex items-center gap-4"><Button variant="ghost" onClick={() => setPantalla('empresa')}>Atrás</Button><span className="text-xs text-gray-400">Sin el balance no puedo revisar nada: es lo único que de verdad necesito.</span></div>
            </div>
          )
        )}

        {pantalla === 'revisando' && (
          <div className="space-y-5 animate-fade-in">
            <Agente />
            <h1 className="text-[26px] font-bold leading-tight tracking-tight text-gray-900 text-balance">Leyendo {a.corrida?.archivoNombre ?? 'el balance'}…</h1>
            <p className="text-[15px] text-gray-600">Te muestro lo que voy haciendo. Termina en segundos.</p>
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2.5 text-[13px] font-semibold text-gray-700">
                {visibles < (a.corrida?.bitacora.length ?? 1) ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-indigo-600 border-r-transparent motion-reduce:animate-none" /> : <Check size={14} className="text-emerald-600" />}
                {visibles < (a.corrida?.bitacora.length ?? 1) ? 'Revisando' : 'Revisión terminada'}
              </div>
              <ol className="py-1">
                {(a.corrida?.bitacora ?? []).map((l, k) => (
                  <li key={l.numero} className={cn('grid grid-cols-[30px_1fr] gap-2 px-4 py-1.5 text-[13px] text-gray-600 transition-opacity', k >= visibles && 'opacity-25')}>
                    <span className="font-mono text-[11px] text-gray-400 pt-0.5">{String(l.numero).padStart(2, '0')}</span><span>{l.texto}</span>
                  </li>
                ))}
                {(a.corrida?.bitacora.length ?? 0) === 0 && <li className="px-4 py-3 text-sm text-gray-400">Preparando la revisión…</li>}
              </ol>
            </div>
          </div>
        )}

        {pantalla === 'listo' && (
          <div className="space-y-5 animate-fade-in">
            <Agente />
            <h1 className="text-[26px] font-bold leading-tight tracking-tight text-gray-900 text-balance">
              {a.teToca > 0 ? `Listo. Encontré ${Number((a.corrida?.resultado as { hallazgos?: number })?.hallazgos ?? 0)} cosas y ${a.teToca} necesitan tu decisión.` : 'Listo. Revisé el balance y no hay nada que decidir por ahora.'}
            </h1>
            <p className="text-[15px] text-gray-600">
              Revisé {a.corrida?.filas?.toLocaleString('es-CO')} filas con {String(((a.corrida?.resultado as { reglasEjecutadas?: string[] })?.reglasEjecutadas ?? []).length)} reglas.
              {a.materialidadPropuesta != null ? ` También te propuse una materialidad de ${money(a.materialidadPropuesta)}; la confirmas con un clic cuando quieras.` : ''}
              {a.entendimiento && !a.entendimiento.confirmado ? ' Lo primero que te voy a pedir es confirmar el entendimiento del período con lo que me contaste.' : ''}
            </p>
            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-200 max-sm:grid-cols-1">
              <div className="bg-white px-4 py-3"><b className="block font-mono text-2xl font-semibold text-red-700 tabular-nums">{a.hallazgosAltos}</b><span className="text-xs text-gray-500">hallazgos de riesgo alto</span></div>
              <div className="bg-white px-4 py-3"><b className="block font-mono text-2xl font-semibold text-gray-900 tabular-nums">{Math.max(0, a.teToca - a.hallazgosAltos - a.documentosPedidos - (a.materialidadPropuesta != null ? 1 : 0))}</b><span className="text-xs text-gray-500">otras decisiones</span></div>
              <div className="bg-white px-4 py-3"><b className="block font-mono text-2xl font-semibold text-gray-900 tabular-nums">{a.documentosPedidos}</b><span className="text-xs text-gray-500">documentos que te voy a pedir</span></div>
            </div>
            {a.primeraDecision && (
              <div className={cn('flex items-start gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 border-l-4', a.primeraDecision.severidad === 'alta' ? 'border-l-red-500' : a.primeraDecision.severidad === 'media' ? 'border-l-amber-500' : 'border-l-indigo-500')}>
                <div className="min-w-0 flex-1"><p className="font-mono text-[11px] text-gray-400">{a.primeraDecision.codigo ?? 'Primera decisión'}</p><p className="text-sm font-semibold text-gray-900">{a.primeraDecision.titulo}</p></div>
                {a.primeraDecision.monto != null && <span className={cn('font-mono text-sm font-semibold tabular-nums', a.primeraDecision.monto < 0 ? 'text-red-700' : 'text-gray-900')}>{a.primeraDecision.monto < 0 ? '−' : ''}{money(Math.abs(a.primeraDecision.monto))}</span>}
              </div>
            )}
            <div className="flex items-center gap-3">
              <Button loading={completar.isPending} onClick={() => irAlEncargo(a.primeraDecision?.paso ?? 'balance')}>{a.primeraDecision ? 'Ver la primera decisión' : 'Ir al encargo'}</Button>
              <Button variant="ghost" onClick={() => irAlEncargo('balance')}>Ver todo el balance</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
