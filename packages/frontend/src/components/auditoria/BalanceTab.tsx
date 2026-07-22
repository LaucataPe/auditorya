import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CLASE_PUC_LABEL,
  type AnalisisBalance,
  type RatioFinanciero, type BanderaAnalitica,
} from '@auditorya/types'
import {
  Upload, FileSpreadsheet, AlertTriangle, Flag, Trash2, RefreshCw, Users, Sparkles, X,
  TrendingUp, TrendingDown, Minus, Info, Search, Download,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { api } from '../../lib/api'
import { parseCsv } from '../../lib/csv'
import { leerExcelAFilas, descargarPlantillaBalance } from '../../lib/xlsx-loader'
import { cn } from '../../lib/cn'
import { BalanceImportWizard, type ArchivoBalance, type ImportarBalancePayload } from './BalanceImportWizard'

const cop = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    isFinite(n) ? n : 0,
  )

type Filtro = 'todas' | 'significativas' | 'anomalias'

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result ?? '').split(',')[1] ?? '')
    r.onerror = () => reject(new Error('No se pudo leer el archivo'))
    r.readAsDataURL(file)
  })
}

export function BalanceTab({ auditoriaId }: { auditoriaId: string }) {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [busqueda, setBusqueda] = useState('')
  const [archivo, setArchivo] = useState<ArchivoBalance | null>(null)
  const [modoCarga, setModoCarga] = useState<'actual' | 'comparativo'>('actual')
  const [leyendo, setLeyendo] = useState(false)
  const [errorLectura, setErrorLectura] = useState<string | null>(null)
  const [analisisIA, setAnalisisIA] = useState<string | null>(null)

  const { data: ia } = useQuery<{ disponible: boolean }>({
    queryKey: ['ia-estado'],
    queryFn: () => api.get('/ia/estado'),
    staleTime: 5 * 60 * 1000,
  })

  const analizarIA = useMutation({
    mutationFn: () => api.post<{ analisis: string }>(`/auditorias/${auditoriaId}/ia/analisis-balance`, {}),
    onSuccess: ({ analisis: texto }) => setAnalisisIA(texto),
  })

  const { data: analisis, isLoading } = useQuery<AnalisisBalance>({
    queryKey: ['balance', auditoriaId],
    queryFn: () => api.get<AnalisisBalance>(`/auditorias/${auditoriaId}/balance`),
  })

  const importar = useMutation({
    mutationFn: (p: ImportarBalancePayload) => {
      if (modoCarga === 'comparativo') {
        // Del comparativo solo van código + saldo final (nivel resumen, sin terceros).
        return api.post(`/auditorias/${auditoriaId}/balance/comparativo`, {
          cuentas: p.cuentas
            .filter((c) => !c.tercero)
            .map((c) => ({ codigo: c.codigo, nombre: c.nombre, nivel: c.nivel, saldo: c.saldoActual })),
          archivoNombre: archivo?.nombre,
        })
      }
      return api.post(`/auditorias/${auditoriaId}/balance`, {
        cuentas: p.cuentas,
        perfil: p.perfil,
        corteDesde: p.corteDesde,
        corteHasta: p.corteHasta,
        archivo: archivo
          ? { nombre: archivo.nombre, tamano: archivo.tamano, contenido: archivo.contenido }
          : undefined,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['balance', auditoriaId] })
      queryClient.invalidateQueries({ queryKey: ['progreso', auditoriaId] })
      queryClient.invalidateQueries({ queryKey: ['perfil-balance', auditoriaId] })
      setArchivo(null)
    },
  })

  const limpiar = useMutation({
    mutationFn: () => api.delete(`/auditorias/${auditoriaId}/balance`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['balance', auditoriaId] })
      queryClient.invalidateQueries({ queryKey: ['progreso', auditoriaId] })
    },
  })

  const quitarComparativo = useMutation({
    mutationFn: () => api.delete(`/auditorias/${auditoriaId}/balance/comparativo`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['balance', auditoriaId] }),
  })

  function abrirSelector(modo: 'actual' | 'comparativo') {
    setModoCarga(modo)
    fileRef.current?.click()
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setErrorLectura(null)
    setLeyendo(true)
    try {
      const esExcel = /\.(xlsx|xlsm|xls)$/i.test(file.name)
      const filas = esExcel
        ? await leerExcelAFilas(file)
        : parseCsv(await file.text())
      if (filas.length === 0) {
        setErrorLectura('El archivo está vacío o no se pudo leer.')
        return
      }
      const contenido = await fileToBase64(file)
      importar.reset()
      setArchivo({ filas, nombre: file.name, tamano: file.size, contenido })
    } catch (err) {
      setErrorLectura(err instanceof Error ? err.message : 'No se pudo leer el archivo')
    } finally {
      setLeyendo(false)
    }
  }

  // ─── Asistente de importación (mapeo de columnas + validación) ───────────────
  if (archivo) {
    return (
      <BalanceImportWizard
        auditoriaId={auditoriaId}
        archivo={archivo}
        modo={modoCarga}
        onCancelar={() => setArchivo(null)}
        onImportar={(payload) => importar.mutate(payload)}
        importando={importar.isPending}
        errorImportar={
          importar.isError
            ? importar.error instanceof Error ? importar.error.message : 'Error al importar'
            : null
        }
      />
    )
  }

  const cuentas = analisis?.cuentas ?? []
  const cargado = cuentas.length > 0
  const r = analisis?.resumen
  const q = busqueda.trim().toLowerCase()
  const filtradas = cuentas
    .filter((c) => (filtro === 'significativas' ? c.significativa : filtro === 'anomalias' ? c.anomalia : true))
    .filter((c) => (q === '' ? true : c.codigo.toLowerCase().includes(q) || (c.nombre ?? '').toLowerCase().includes(q)))

  return (
    <div className="space-y-5">
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.xlsx,.xlsm,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        className="hidden"
        onChange={onFile}
      />

      {errorLectura && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{errorLectura}</p>
      )}

      {isLoading || leyendo ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          {leyendo && <p className="text-xs text-gray-400">Leyendo y procesando el archivo…</p>}
        </div>
      ) : !cargado ? (
        <div className="space-y-3">
          <button
            onClick={() => abrirSelector('actual')}
            className="w-full flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white py-16 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors"
          >
            <Upload size={30} className="text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-600">Subir balance de prueba</p>
            <p className="text-xs text-gray-400 mt-1">Excel (.xlsx) o CSV · un asistente te ayuda a mapear las columnas</p>
          </button>
          <button
            onClick={() => void descargarPlantillaBalance()}
            className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700"
          >
            <Download size={12} /> Descargar plantilla oficial (.xlsx)
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Cuentas', value: r?.totalCuentas ?? 0, color: 'text-gray-900' },
              { label: 'Por tercero', value: r?.terceros ?? 0, color: 'text-gray-900' },
              { label: 'Significativas', value: r?.significativas ?? 0, color: 'text-indigo-600' },
              { label: 'Inusuales', value: r?.anomalias ?? 0, color: 'text-amber-600' },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
                <p className={cn('text-xl font-bold', s.color)}>{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 flex-wrap text-xs text-gray-400">
            {analisis?.archivo && (
              <span className="inline-flex items-center gap-1.5">
                <FileSpreadsheet size={12} /> Archivo guardado como evidencia: {analisis.archivo.nombre}
              </span>
            )}
            {analisis?.periodo ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-0.5">
                Período: {analisis.periodo.corteDesde ?? '?'} → {analisis.periodo.corteHasta ?? '?'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-amber-700">
                Período no declarado — decláralo al reimportar
              </span>
            )}
            {analisis?.comparativo.cargado ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-emerald-700">
                Comparativo del año anterior cargado{analisis.comparativo.nombre ? ` (${analisis.comparativo.nombre})` : ''}
                <button
                  onClick={() => quitarComparativo.mutate()}
                  className="text-emerald-400 hover:text-emerald-700"
                  title="Quitar comparativo"
                >
                  <X size={11} />
                </button>
              </span>
            ) : (
              <button
                onClick={() => abrirSelector('comparativo')}
                className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-indigo-600 hover:bg-indigo-100 transition-colors"
                title="Balance al mismo corte del año anterior: habilita variaciones y tendencias reales"
              >
                <Upload size={11} /> Cargar comparativo (año anterior)
              </button>
            )}
          </div>

          {!analisis?.comparativo.cargado && (
            <p className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
              <Info size={14} className="shrink-0 mt-0.5 text-gray-400" />
              <span>
                Sin comparativo del año anterior, la variación se mide contra el <strong>saldo inicial del período</strong> y
                solo en cuentas de balance (activo, pasivo, patrimonio). Las cuentas de resultado no tienen una base honesta
                de comparación hasta que cargues el comparativo.
              </span>
            </p>
          )}

          {r?.umbralSignificativa != null ? (
            <p className="text-xs text-gray-500">
              Significativa: saldo mayor a {cop(r.umbralSignificativa)} (materialidad de desempeño). Inusual: variación ±{r.umbralVariacionPct}% o
              más, medida {analisis?.comparativo.cargado ? 'frente al mismo corte del año anterior' : 'frente al saldo inicial (solo cuentas de balance)'}.
            </p>
          ) : (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>Aún no hay materialidad calculada, por lo que no se marcan cuentas significativas. Calcúlala para activarlo.</span>
            </div>
          )}

          <Analitica ratios={analisis?.ratios ?? []} banderas={analisis?.banderas ?? []} />

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              {(['todas', 'significativas', 'anomalias'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFiltro(f)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    filtro === f ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50',
                  )}
                >
                  {f === 'todas' ? 'Todas' : f === 'significativas' ? 'Significativas' : 'Inusuales'}
                </button>
              ))}
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300" />
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por código o nombre…"
                  className="w-56 rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-xs text-gray-700 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="flex gap-2">
              {ia?.disponible && (
                <Button
                  variant="secondary" size="sm" className="gap-1.5"
                  loading={analizarIA.isPending}
                  onClick={() => analizarIA.mutate()}
                  title="Revisión analítica preliminar generada por IA (NIA 520)"
                >
                  <Sparkles size={13} /> Análisis IA
                </Button>
              )}
              <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => abrirSelector('actual')}>
                <RefreshCw size={13} /> Reemplazar
              </Button>
              <Button
                variant="secondary" size="sm" className="gap-1.5"
                onClick={() => void descargarPlantillaBalance()}
                title="Plantilla oficial con las columnas esperadas"
              >
                <Download size={13} /> Plantilla
              </Button>
              <Button variant="secondary" size="sm" className="gap-1.5" loading={limpiar.isPending} onClick={() => limpiar.mutate()}>
                <Trash2 size={13} /> Quitar
              </Button>
            </div>
          </div>

          {analizarIA.isError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {analizarIA.error instanceof Error ? analizarIA.error.message : 'No se pudo generar el análisis'}
            </p>
          )}

          {analisisIA && (
            <div className="rounded-xl border border-indigo-100 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-indigo-50 px-4 py-2.5">
                <p className="flex items-center gap-1.5 text-sm font-medium text-indigo-800">
                  <Sparkles size={13} className="text-indigo-500" /> Revisión analítica preliminar (IA · NIA 520)
                </p>
                <button onClick={() => setAnalisisIA(null)} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors">
                  <X size={13} />
                </button>
              </div>
              <div className="whitespace-pre-wrap px-4 py-3 text-[13px] leading-relaxed text-gray-700">
                {analisisIA}
              </div>
              <p className="border-t border-gray-50 px-4 py-2 text-[11px] text-gray-400">
                Generado por IA como apoyo: valida cada observación con tu juicio profesional antes de documentarla.
              </p>
            </div>
          )}

          <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
            <div className="max-h-[560px] overflow-y-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500">
                    <th className="px-3 py-2 text-left">Cuenta</th>
                    <th className="px-3 py-2 text-right">Actual</th>
                    <th className="px-3 py-2 text-right">Inicial</th>
                    {analisis?.comparativo.cargado && <th className="px-3 py-2 text-right">Año anterior</th>}
                    <th className="px-3 py-2 text-right">Variación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtradas.length === 0 ? (
                    <tr>
                      <td colSpan={analisis?.comparativo.cargado ? 5 : 4} className="px-3 py-10 text-center text-sm text-gray-400">
                        No hay cuentas que coincidan con la búsqueda.
                      </td>
                    </tr>
                  ) : (
                    filtradas.map((c, i) => (
                      <tr key={i} className={cn(c.anomalia && 'bg-amber-50/40')}>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-gray-400">{c.codigo}</span>
                            {c.significativa && <Flag size={11} className="text-indigo-500" />}
                          </div>
                          <p className="text-gray-800">{c.nombre ?? '—'}</p>
                          {c.clase && <span className="text-xs text-gray-400">{CLASE_PUC_LABEL[c.clase] ?? c.clase}</span>}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">{cop(c.saldoActual)}</td>
                        <td className="px-3 py-2 text-right text-gray-500 whitespace-nowrap">{cop(c.saldoInicial)}</td>
                        {analisis?.comparativo.cargado && (
                          <td className="px-3 py-2 text-right text-gray-500 whitespace-nowrap">{cop(c.saldoComparativo ?? 0)}</td>
                        )}
                        <td className={cn('px-3 py-2 text-right whitespace-nowrap font-medium',
                          c.anomalia ? 'text-amber-700' : 'text-gray-600')}>
                          {c.baseVariacion === null
                            ? <span title="Sin base honesta de comparación: carga el comparativo del año anterior">—</span>
                            : c.variacionPct == null ? 'nuevo' : `${c.variacionPct > 0 ? '+' : ''}${c.variacionPct.toFixed(0)}%`}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-xs text-gray-400 flex items-center gap-2 flex-wrap">
            <span>{filtradas.length} cuentas mostradas (nivel cuenta).</span>
            <Flag size={11} className="text-indigo-500" /> significativa
            <span className="inline-flex items-center gap-1"><Users size={11} /> {r?.terceros ?? 0} registros por tercero guardados para ejecución</span>
          </p>
        </>
      )}
    </div>
  )
}

// ─── Analítica: ratios financieros + banderas automáticas (NIA 520) ──────────

function fmtRatio(r: RatioFinanciero): string {
  if (r.valor == null) return '—'
  if (r.unidad === 'pct') return `${r.valor}%`
  if (r.unidad === 'dias') return `${r.valor} d`
  return `${r.valor}×`
}

const ESTADO_COLOR: Record<RatioFinanciero['estado'], string> = {
  bueno: 'text-emerald-600',
  alerta: 'text-amber-600',
  neutral: 'text-gray-900',
}

function TendenciaRatio({ r }: { r: RatioFinanciero }) {
  if (r.valor == null || r.anterior == null) return null
  const sube = r.valor > r.anterior
  const baja = r.valor < r.anterior
  const Icono = sube ? TrendingUp : baja ? TrendingDown : Minus
  const antes = r.unidad === 'pct' ? `${r.anterior}%` : r.unidad === 'dias' ? `${r.anterior} d` : `${r.anterior}×`
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
      <Icono size={11} className={sube ? 'text-gray-500' : baja ? 'text-gray-500' : 'text-gray-300'} />
      antes {antes}
    </span>
  )
}

const SEVERIDAD_STYLE: Record<BanderaAnalitica['severidad'], { wrap: string; icon: string }> = {
  alta: { wrap: 'border-red-200 bg-red-50', icon: 'text-red-500' },
  media: { wrap: 'border-amber-200 bg-amber-50', icon: 'text-amber-500' },
  info: { wrap: 'border-gray-200 bg-gray-50', icon: 'text-gray-400' },
}

function Analitica({ ratios, banderas }: { ratios: RatioFinanciero[]; banderas: BanderaAnalitica[] }) {
  if (ratios.length === 0 && banderas.length === 0) return null
  return (
    <div className="space-y-4">
      {ratios.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Indicadores</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {ratios.map((r) => (
              <div key={r.clave} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-xs text-gray-500">{r.nombre}</p>
                  {r.aproximado && <span className="text-[10px] text-gray-300" title="Cálculo aproximado a partir de los grupos del balance">aprox.</span>}
                </div>
                <p className={cn('text-2xl font-bold leading-tight mt-0.5', ESTADO_COLOR[r.estado])}>{fmtRatio(r)}</p>
                <p className="text-[11px] text-gray-500 mt-1 leading-snug">{r.interpretacion}</p>
                <div className="mt-1.5"><TendenciaRatio r={r} /></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {banderas.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
            Banderas automáticas <span className="text-gray-300 normal-case font-normal">· dónde mirar</span>
          </h3>
          <div className="space-y-2">
            {banderas.map((b) => {
              const st = SEVERIDAD_STYLE[b.severidad]
              const Icono = b.severidad === 'info' ? Info : AlertTriangle
              return (
                <div key={b.clave} className={cn('flex items-start gap-2.5 rounded-lg border px-3 py-2.5', st.wrap)}>
                  <Icono size={15} className={cn('shrink-0 mt-0.5', st.icon)} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">{b.titulo}</p>
                    <p className="text-xs text-gray-600 mt-0.5 leading-snug">{b.detalle}</p>
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {b.codigos.map((cod) => (
                        <span key={cod} className="text-[10px] text-gray-400 bg-white/70 border border-gray-200 rounded px-1.5 py-0.5">
                          PUC {cod}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
