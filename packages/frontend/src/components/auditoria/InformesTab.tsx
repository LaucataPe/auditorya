import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  SECCIONES_INFORME, TIPO_INFORME_LABEL, TIPO_OPINION_LABEL,
  type TipoInforme, type TipoOpinion,
} from '@auditorya/types'
import { Lock, FileText, CheckCircle, Printer, FileDown, Sparkles, ShieldCheck } from 'lucide-react'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Select } from '../ui/Select'
import { Textarea } from '../ui/Textarea'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/auth.store'
import { cn } from '../../lib/cn'
import { construirHtmlInforme, imprimirInforme, descargarWord } from '../../lib/informe-export'

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
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center max-w-2xl">
        <Lock size={32} className="text-gray-300 mb-3" />
        <p className="text-sm font-medium text-gray-500">Informes no disponibles</p>
        <p className="text-xs text-gray-400 mt-1 max-w-sm">
          Completa la planificación (materialidad aprobada) para habilitar la generación de informes.
        </p>
      </div>
    )
  }

  const porTipo = (t: TipoInforme) => informes.find((i) => i.tipo === t)

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-4">
        <p className="text-sm font-medium text-indigo-800">Informes — NIA 700 / 265 / 580</p>
        <p className="text-xs text-indigo-500 mt-1">
          Genera un borrador a partir del trabajo realizado, edítalo y apruébalo (solo el socio).
          Exporta a PDF (imprimir) o Word.
        </p>
      </div>

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
  const { user } = useAuthStore()
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

  function exportarHtml() {
    return construirHtmlInforme({
      titulo: TIPO_INFORME_LABEL[tipo],
      empresaNombre,
      periodo,
      secciones: secciones.map((s) => ({ label: s.label, contenido: contenido[s.key] ?? '' })),
    })
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
              <div className="max-w-sm mx-auto text-left">
                <Select
                  id="op-gen" label="Tipo de opinión"
                  value={opinion} onChange={(e) => setOpinion(e.target.value as TipoOpinion)}
                  options={OPINION_OPTS}
                />
              </div>
            )}
            <Button className="gap-1.5" loading={generar.isPending} onClick={() => generar.mutate()}>
              <Sparkles size={14} /> Generar borrador
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
                    <Sparkles size={13} /> Regenerar
                  </Button>
                )}
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
              <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => imprimirInforme(exportarHtml())}>
                <Printer size={13} /> Imprimir / PDF
              </Button>
              <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => descargarWord(nombreArchivo, exportarHtml())}>
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
