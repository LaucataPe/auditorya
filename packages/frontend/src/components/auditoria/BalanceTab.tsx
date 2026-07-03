import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CLASE_PUC_LABEL, parseBalanceMatrix,
  type AnalisisBalance, type CuentaImport,
} from '@auditorya/types'
import { Upload, FileSpreadsheet, AlertTriangle, Flag, Trash2, RefreshCw, Users, Sparkles, X } from 'lucide-react'
import { Button } from '../ui/Button'
import { api } from '../../lib/api'
import { parseCsv } from '../../lib/csv'
import { leerExcelAFilas } from '../../lib/xlsx-loader'
import { cn } from '../../lib/cn'

const cop = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(
    isFinite(n) ? n : 0,
  )

type Filtro = 'todas' | 'significativas' | 'anomalias'
type Previa = { cuentas: CuentaImport[]; nombre: string; tamano: number; contenido: string }

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
  const [previa, setPrevia] = useState<Previa | null>(null)
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
    mutationFn: (p: Previa) =>
      api.post(`/auditorias/${auditoriaId}/balance`, {
        cuentas: p.cuentas,
        archivo: { nombre: p.nombre, tamano: p.tamano, contenido: p.contenido },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['balance', auditoriaId] })
      queryClient.invalidateQueries({ queryKey: ['progreso', auditoriaId] })
      setPrevia(null)
    },
  })

  const limpiar = useMutation({
    mutationFn: () => api.delete(`/auditorias/${auditoriaId}/balance`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['balance', auditoriaId] })
      queryClient.invalidateQueries({ queryKey: ['progreso', auditoriaId] })
    },
  })

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setErrorLectura(null)
    setLeyendo(true)
    try {
      const esExcel = /\.(xlsx|xlsm|xls)$/i.test(file.name)
      const matrix = esExcel
        ? await leerExcelAFilas(file)
        : parseCsv(await file.text())
      const cuentas = parseBalanceMatrix(matrix)
      if (cuentas.length === 0) {
        setErrorLectura('No se detectaron cuentas. Verifica que la primera columna sea el código de cuenta (PUC).')
        return
      }
      const contenido = await fileToBase64(file)
      setPrevia({ cuentas, nombre: file.name, tamano: file.size, contenido })
    } catch (err) {
      setErrorLectura(err instanceof Error ? err.message : 'No se pudo leer el archivo')
    } finally {
      setLeyendo(false)
    }
  }

  // ─── Vista previa (tras parsear, antes de importar) ──────────────────────────
  if (previa) {
    const cuentasN = previa.cuentas.filter((c) => c.nivel <= 6 && !c.tercero)
    const tercerosN = previa.cuentas.filter((c) => c.tercero).length
    const preview = cuentasN.slice(0, 8)
    return (
      <div className="space-y-5">
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-4">
          <p className="text-sm font-medium text-indigo-800">Revisión antes de importar</p>
          <p className="text-xs text-indigo-500 mt-1">
            Se detectaron <strong>{cuentasN.length}</strong> cuentas y <strong>{tercerosN}</strong> registros por
            tercero en <strong>{previa.nombre}</strong>. Revisa que los saldos se vean bien.
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60 text-xs text-gray-500">
                <th className="px-3 py-2 text-left">Cuenta</th>
                <th className="px-3 py-2 text-right">Saldo actual</th>
                <th className="px-3 py-2 text-right">Saldo anterior</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {preview.map((c, i) => (
                <tr key={i}>
                  <td className="px-3 py-2">
                    <span className="text-xs text-gray-400">{c.codigo}</span>
                    <p className="text-gray-800">{c.nombre ?? '—'}</p>
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700">{cop(c.saldoActual)}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{cop(c.saldoAnterior)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {importar.isError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {importar.error instanceof Error ? importar.error.message : 'Error al importar'}
          </p>
        )}

        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setPrevia(null)}>Cancelar</Button>
          <Button loading={importar.isPending} onClick={() => importar.mutate(previa)}>
            Importar balance
          </Button>
        </div>
      </div>
    )
  }

  const cuentas = analisis?.cuentas ?? []
  const cargado = cuentas.length > 0
  const r = analisis?.resumen
  const filtradas = cuentas.filter((c) =>
    filtro === 'significativas' ? c.significativa : filtro === 'anomalias' ? c.anomalia : true,
  )

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
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white py-16 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors"
        >
          <Upload size={30} className="text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-600">Subir balance de prueba</p>
          <p className="text-xs text-gray-400 mt-1">Excel (.xlsx) o CSV · detecta PUC y terceros</p>
        </button>
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

          {analisis?.archivo && (
            <p className="text-xs text-gray-400 flex items-center gap-1.5">
              <FileSpreadsheet size={12} /> Archivo guardado como evidencia: {analisis.archivo.nombre}
            </p>
          )}

          {r?.umbralSignificativa != null ? (
            <p className="text-xs text-gray-500">
              Significativa: saldo mayor a {cop(r.umbralSignificativa)} (materialidad de desempeño). Inusual: variación ±{r.umbralVariacionPct}% o más.
            </p>
          ) : (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>Aún no hay materialidad calculada, por lo que no se marcan cuentas significativas. Calcúlala para activarlo.</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-2">
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
              <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => fileRef.current?.click()}>
                <RefreshCw size={13} /> Reemplazar
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

          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60 text-xs text-gray-500">
                  <th className="px-3 py-2 text-left">Cuenta</th>
                  <th className="px-3 py-2 text-right">Actual</th>
                  <th className="px-3 py-2 text-right">Anterior</th>
                  <th className="px-3 py-2 text-right">Variación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtradas.map((c, i) => (
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
                    <td className="px-3 py-2 text-right text-gray-500 whitespace-nowrap">{cop(c.saldoAnterior)}</td>
                    <td className={cn('px-3 py-2 text-right whitespace-nowrap font-medium',
                      c.anomalia ? 'text-amber-700' : 'text-gray-600')}>
                      {c.variacionPct == null ? 'nuevo' : `${c.variacionPct > 0 ? '+' : ''}${c.variacionPct.toFixed(0)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
