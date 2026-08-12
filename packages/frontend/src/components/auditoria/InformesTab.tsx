import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  SECCIONES_INFORME, TIPO_INFORME_LABEL, TIPO_OPINION_LABEL, OPINION_LABEL,
  ESTADO_HALLAZGO_LABEL,
  type TipoInforme, type TipoOpinion, type EvaluacionOpinion, type OpinionSugerida,
  type HallazgoConPapel,
} from '@auditorya/types'
import { FileText, CheckCircle, Printer, FileDown, ShieldCheck, Mail, FilePlus2, RefreshCw } from 'lucide-react'
import { BloqueoMaterialidad } from './BloqueoMaterialidad'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Select } from '../ui/Select'
import { Textarea } from '../ui/Textarea'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/auth.store'
import { cn } from '../../lib/cn'
import { construirHtmlInforme, imprimirInforme, descargarDocx } from '../../lib/informe-export'

type EstadoInforme = 'borrador' | 'aprobado'
type Informe = {
  id: string
  tipo: TipoInforme
  tipoOpinion: TipoOpinion | null
  contenido: Record<string, string>
  estado: EstadoInforme
  aprobadoAt: string | null
}

const TIPOS: TipoInforme[] = ['dictamen', 'carta_control_interno', 'carta_representaciones']

const OPINION_OPTS = (Object.keys(TIPO_OPINION_LABEL) as TipoOpinion[]).map((v) => ({
  value: v, label: TIPO_OPINION_LABEL[v],
}))

// Mapea la opinión sugerida por la hoja de ajustes al tipo de opinión del dictamen.
const SUGERIDA_A_OPINION: Record<OpinionSugerida, TipoOpinion | null> = {
  favorable: 'limpia',
  con_salvedades: 'con_salvedades',
  negativa: 'negativa',
  sin_base: null,
}

function SugerenciaOpinion({
  auditoriaId, opinionActual, onAplicar, disabled,
}: {
  auditoriaId: string
  opinionActual: TipoOpinion
  onAplicar: (o: TipoOpinion) => void
  disabled?: boolean
}) {
  const { data } = useQuery<{ evaluacion: EvaluacionOpinion }>({
    queryKey: ['ajustes', auditoriaId],
    queryFn: () => api.get<{ evaluacion: EvaluacionOpinion }>(`/auditorias/${auditoriaId}/ajustes`),
  })
  const ev = data?.evaluacion
  if (!ev || ev.opinionSugerida === 'sin_base') return null

  const sugerida = SUGERIDA_A_OPINION[ev.opinionSugerida]
  const coincide = sugerida === opinionActual
  return (
    <div className={cn('rounded-lg border px-3 py-2 text-xs',
      coincide ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800')}>
      <p>
        La hoja de ajustes sugiere: <strong>{OPINION_LABEL[ev.opinionSugerida]}</strong>.{' '}
        {coincide ? 'Coincide con la opción seleccionada.' : 'No coincide con la opción seleccionada.'}
      </p>
      {!coincide && sugerida && !disabled && (
        <button onClick={() => onAplicar(sugerida)} className="mt-1 text-indigo-600 hover:underline font-medium">
          Aplicar sugerencia
        </button>
      )}
    </div>
  )
}

export function InformesTab({
  auditoriaId, materialidadAprobada, empresaNombre, periodo,
}: {
  auditoriaId: string
  materialidadAprobada: boolean
  empresaNombre: string
  periodo: string
}) {
  const [abierto, setAbierto] = useState<TipoInforme | null>(null)

  const { data: informes = [], isLoading } = useQuery<Informe[]>({
    queryKey: ['informes', auditoriaId],
    queryFn: () => api.get<Informe[]>(`/auditorias/${auditoriaId}/informes`),
    enabled: materialidadAprobada,
  })

  if (!materialidadAprobada) {
    return (
      <BloqueoMaterialidad
        titulo="Informes no disponibles"
        descripcion="Completa la planificación (materialidad aprobada) para habilitar la generación de informes."
      />
    )
  }

  const porTipo = (t: TipoInforme) => informes.find((i) => i.tipo === t)

  return (
    <div className="space-y-5">

      <CartaRecomendaciones auditoriaId={auditoriaId} empresaNombre={empresaNombre} periodo={periodo} />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-3">
          {TIPOS.map((t) => {
            const inf = porTipo(t)
            return (
              <div
                key={t}
                onClick={() => setAbierto(t)}
                className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 cursor-pointer hover:border-indigo-200 hover:shadow-md transition-all flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 shrink-0">
                    <FileText size={16} />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{TIPO_INFORME_LABEL[t]}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {!inf
                        ? 'Sin generar'
                        : inf.estado === 'aprobado'
                          ? 'Aprobado'
                          : 'Borrador'}
                      {t === 'dictamen' && inf?.tipoOpinion ? ` · ${TIPO_OPINION_LABEL[inf.tipoOpinion]}` : ''}
                    </p>
                  </div>
                </div>
                {inf?.estado === 'aprobado'
                  ? <CheckCircle size={16} className="text-emerald-500" />
                  : inf
                    ? <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">Borrador</span>
                    : <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">Generar</span>}
              </div>
            )
          })}
        </div>
      )}

      {abierto && (
        <InformeEditor
          tipo={abierto}
          auditoriaId={auditoriaId}
          informe={porTipo(abierto) ?? null}
          empresaNombre={empresaNombre}
          periodo={periodo}
          onClose={() => setAbierto(null)}
        />
      )}
    </div>
  )
}

const AREA_LABEL_CARTA: Record<string, string> = {
  efectivo: 'Efectivo', cartera: 'Cartera', inventarios: 'Inventarios',
  propiedad_planta_equipo: 'Propiedad, planta y equipo', proveedores: 'Proveedores', nomina: 'Nómina',
  impuestos: 'Impuestos', ingresos: 'Ingresos', gastos: 'Gastos', patrimonio: 'Patrimonio', otro: 'Otros',
}

function CartaRecomendaciones({
  auditoriaId, empresaNombre, periodo,
}: {
  auditoriaId: string
  empresaNombre: string
  periodo: string
}) {
  const { firma } = useAuthStore()

  const { data: hallazgos = [] } = useQuery<HallazgoConPapel[]>({
    queryKey: ['hallazgos', auditoriaId],
    queryFn: () => api.get<HallazgoConPapel[]>(`/auditorias/${auditoriaId}/hallazgos`),
  })

  // La carta comunica lo que aún requiere acción del contador (no lo ya corregido).
  const pendientes = hallazgos.filter((h) => h.estado !== 'corregido')

  function secciones() {
    const areas = Array.from(new Set(pendientes.map((h) => h.area)))
    return areas.map((area) => ({
      label: AREA_LABEL_CARTA[area] ?? area,
      contenido: pendientes
        .filter((h) => h.area === area)
        .map((h) => {
          const rec = h.recomendacion ? `\n   Recomendación: ${h.recomendacion}` : ''
          const est = ` [${ESTADO_HALLAZGO_LABEL[h.estado]}]`
          return `• ${h.descripcion}${est}${rec}`
        })
        .join('\n\n'),
    }))
  }

  function exportOpts() {
    const intro = {
      label: 'Presentación',
      contenido:
        `Apreciado equipo contable de ${empresaNombre}:\n\n` +
        `En desarrollo de nuestra revisión del período ${periodo}, presentamos a continuación las observaciones ` +
        `y recomendaciones identificadas, para su análisis y corrección. Agradecemos su gestión sobre los siguientes puntos.`,
    }
    return {
      titulo: 'Carta de recomendaciones',
      empresaNombre,
      periodo,
      firma,
      secciones: [intro, ...secciones()],
    }
  }

  const pdf = () => imprimirInforme(construirHtmlInforme(exportOpts()))
  const word = () => descargarDocx(`Carta_recomendaciones_${empresaNombre.replace(/[^\w]+/g, '_')}`, exportOpts())

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600 shrink-0">
            <Mail size={16} />
          </div>
          <div>
            <p className="font-semibold text-gray-900">Carta de recomendaciones</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {pendientes.length === 0
                ? 'Sin hallazgos pendientes de comunicar'
                : `${pendientes.length} hallazgo${pendientes.length !== 1 ? 's' : ''} para el contador (NIA 260)`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" className="gap-1.5" disabled={pendientes.length === 0} onClick={pdf}>
            <Printer size={13} /> PDF
          </Button>
          <Button size="sm" variant="secondary" className="gap-1.5" disabled={pendientes.length === 0} onClick={word}>
            <FileDown size={13} /> Word
          </Button>
        </div>
      </div>
    </div>
  )
}

function InformeEditor({
  tipo, auditoriaId, informe, empresaNombre, periodo, onClose,
}: {
  tipo: TipoInforme
  auditoriaId: string
  informe: Informe | null
  empresaNombre: string
  periodo: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { user, firma } = useAuthStore()
  const esSocio = user?.rol === 'socio'
  const secciones = SECCIONES_INFORME[tipo]

  const [contenido, setContenido] = useState<Record<string, string>>(informe?.contenido ?? {})
  const [opinion, setOpinion] = useState<TipoOpinion>(informe?.tipoOpinion ?? 'limpia')

  useEffect(() => {
    if (informe) {
      setContenido(informe.contenido ?? {})
      if (informe.tipoOpinion) setOpinion(informe.tipoOpinion)
    }
  }, [informe])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['informes', auditoriaId] })

  const generar = useMutation({
    mutationFn: () =>
      api.post<Informe>(`/auditorias/${auditoriaId}/informes/${tipo}/generar`,
        tipo === 'dictamen' ? { tipoOpinion: opinion } : {}),
    onSuccess: (data) => { setContenido(data.contenido); invalidate() },
  })
  const guardar = useMutation({
    mutationFn: () =>
      api.put(`/informes/${informe!.id}`, {
        contenido,
        ...(tipo === 'dictamen' ? { tipoOpinion: opinion } : {}),
      }),
    onSuccess: invalidate,
  })
  const aprobar = useMutation({
    mutationFn: () => api.post(`/informes/${informe!.id}/aprobar`, {}),
    onSuccess: invalidate,
  })
  const reabrir = useMutation({
    mutationFn: () => api.post(`/informes/${informe!.id}/reabrir`, {}),
    onSuccess: invalidate,
  })

  const aprobado = informe?.estado === 'aprobado'

  function exportOpts() {
    return {
      titulo: TIPO_INFORME_LABEL[tipo],
      empresaNombre,
      periodo,
      firma,
      secciones: secciones.map((s) => ({ label: s.label, contenido: contenido[s.key] ?? '' })),
    }
  }

  const nombreArchivo = `${TIPO_INFORME_LABEL[tipo].replace(/[^\w]+/g, '_')}_${empresaNombre.replace(/[^\w]+/g, '_')}`

  return (
    <Modal open onClose={onClose} title={TIPO_INFORME_LABEL[tipo]} size="lg">
      <div className="space-y-4 max-h-[72vh] overflow-y-auto pr-1">
        {/* Sin generar */}
        {!informe ? (
          <div className="text-center py-6 space-y-4">
            <p className="text-sm text-gray-500">
              Aún no has generado este documento. Crea un borrador con la redacción estándar y luego edítalo.
            </p>
            {tipo === 'dictamen' && (
              <div className="max-w-sm mx-auto text-left space-y-2">
                <Select
                  id="op-gen" label="Tipo de opinión"
                  value={opinion} onChange={(e) => setOpinion(e.target.value as TipoOpinion)}
                  options={OPINION_OPTS}
                />
                <SugerenciaOpinion auditoriaId={auditoriaId} opinionActual={opinion} onAplicar={setOpinion} />
              </div>
            )}
            <Button className="gap-1.5" loading={generar.isPending} onClick={() => generar.mutate()}>
              <FilePlus2 size={14} /> Generar borrador
            </Button>
            {generar.isError && (
              <p className="text-sm text-red-600">
                {generar.error instanceof Error ? generar.error.message : 'Error al generar'}
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full',
                aprobado ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600')}>
                {aprobado ? 'Aprobado' : 'Borrador'}
              </span>
              {aprobado && informe.aprobadoAt && (
                <span className="text-xs text-gray-400">
                  el {new Date(informe.aprobadoAt).toLocaleDateString('es-CO')}
                </span>
              )}
            </div>

            {tipo === 'dictamen' && (
              <div className="space-y-2">
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Select
                      id="op-edit" label="Tipo de opinión"
                      value={opinion} disabled={aprobado}
                      onChange={(e) => setOpinion(e.target.value as TipoOpinion)}
                      options={OPINION_OPTS}
                    />
                  </div>
                  {!aprobado && (
                    <Button size="sm" variant="secondary" className="gap-1.5"
                      loading={generar.isPending} onClick={() => generar.mutate()}>
                      <RefreshCw size={13} /> Regenerar
                    </Button>
                  )}
                </div>
                <SugerenciaOpinion auditoriaId={auditoriaId} opinionActual={opinion} onAplicar={setOpinion} disabled={aprobado} />
              </div>
            )}

            {secciones.map((s) => (
              <Textarea
                key={s.key}
                id={`inf-${s.key}`}
                label={s.label}
                rows={s.key === 'firma' || s.key === 'destinatario' ? 3 : 5}
                value={contenido[s.key] ?? ''}
                disabled={aprobado}
                onChange={(e) => setContenido((prev) => ({ ...prev, [s.key]: e.target.value }))}
              />
            ))}

            {/* Acciones */}
            <div className="border-t border-gray-100 pt-4 flex flex-wrap items-center gap-2">
              {!aprobado && (
                <Button size="sm" loading={guardar.isPending} onClick={() => guardar.mutate()}>
                  Guardar
                </Button>
              )}
              <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => imprimirInforme(construirHtmlInforme(exportOpts()))}>
                <Printer size={13} /> Imprimir / PDF
              </Button>
              <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => descargarDocx(nombreArchivo, exportOpts())}>
                <FileDown size={13} /> Word
              </Button>

              <div className="ml-auto flex items-center gap-2">
                {!aprobado ? (
                  <div className="flex flex-col items-end gap-1">
                    <Button size="sm" variant="secondary" className="gap-1.5"
                      disabled={!esSocio || aprobar.isPending} loading={aprobar.isPending}
                      onClick={() => aprobar.mutate()}>
                      <ShieldCheck size={13} /> Aprobar
                    </Button>
                    {!esSocio && <p className="text-xs text-gray-400">Solo el socio aprueba</p>}
                  </div>
                ) : (
                  esSocio && (
                    <Button size="sm" variant="secondary" loading={reabrir.isPending} onClick={() => reabrir.mutate()}>
                      Reabrir
                    </Button>
                  )
                )}
              </div>
            </div>
            {guardar.isError && (
              <p className="text-xs text-red-600">
                {guardar.error instanceof Error ? guardar.error.message : 'Error al guardar'}
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
