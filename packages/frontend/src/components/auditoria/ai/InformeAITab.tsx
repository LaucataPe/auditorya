import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { SECCIONES_INFORME, TIPO_INFORME_LABEL } from '@auditorya/types'
import { FileCheck, FilePlus2, RefreshCw, CheckCircle, ShieldCheck, Printer, FileDown } from 'lucide-react'
import { Button } from '../../ui/Button'
import { Textarea } from '../../ui/Textarea'
import { api } from '../../../lib/api'
import { useAuthStore } from '../../../store/auth.store'
import { construirHtmlInforme, imprimirInforme, descargarDocx } from '../../../lib/informe-export'

type EstadoInforme = 'borrador' | 'aprobado'
type Informe = {
  id: string
  tipo: 'informe_ai'
  contenido: Record<string, string>
  estado: EstadoInforme
  aprobadoAt: string | null
}

export function InformeAITab({
  auditoriaId,
  empresaNombre = '',
  periodo = '',
}: {
  auditoriaId: string
  empresaNombre?: string
  periodo?: string
}) {
  const { user, firma } = useAuthStore()
  const queryClient = useQueryClient()
  const [contenidoLocal, setContenidoLocal] = useState<Record<string, string>>({})

  const { data: informes = [], isLoading } = useQuery<Informe[]>({
    queryKey: ['informes', auditoriaId],
    queryFn: () => api.get<{ tipo: string }[]>(`/auditorias/${auditoriaId}/informes`).then(
      (r) => r.filter((i) => i.tipo === 'informe_ai') as Informe[]
    ),
  })

  const informe = informes[0] ?? null
  const aprobado = informe?.estado === 'aprobado'
  const secciones = SECCIONES_INFORME['informe_ai']

  const exportOpts = () => ({
    titulo: TIPO_INFORME_LABEL['informe_ai'],
    empresaNombre,
    periodo,
    firma,
    secciones: secciones.map((s) => ({ label: s.label, contenido: contenidoLocal[s.key] ?? '' })),
  })
  const nombreArchivo = `${TIPO_INFORME_LABEL['informe_ai'].replace(/[^\w]+/g, '_')}_${empresaNombre.replace(/[^\w]+/g, '_')}`

  useEffect(() => {
    if (informe) setContenidoLocal(informe.contenido)
  }, [informe?.id])

  const generarMutation = useMutation({
    mutationFn: () => api.post<Informe>(`/auditorias/${auditoriaId}/informes/informe_ai/generar`, {}),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['informes', auditoriaId] })
      setContenidoLocal(data.contenido)
    },
  })

  const guardarMutation = useMutation({
    mutationFn: () => api.put(`/informes/${informe!.id}`, { contenido: contenidoLocal }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['informes', auditoriaId] }),
  })

  const aprobarMutation = useMutation({
    mutationFn: () => api.post(`/informes/${informe!.id}/aprobar`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['informes', auditoriaId] }),
  })

  const reabrirMutation = useMutation({
    mutationFn: () => api.post(`/informes/${informe!.id}/reabrir`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['informes', auditoriaId] }),
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-purple-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {!informe ? (
        /* Sin informe generado aún */
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center">
          <FileCheck size={36} className="text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-500">Informe no generado</p>
          <p className="text-xs text-gray-400 mt-1 max-w-sm">
            Genera el borrador cuando hayas registrado los hallazgos. El sistema los incluirá automáticamente.
          </p>
          <Button
            size="sm"
            className="mt-5 gap-2"
            loading={generarMutation.isPending}
            onClick={() => generarMutation.mutate()}
          >
            <FilePlus2 size={14} /> Generar informe de auditoría
          </Button>
          {generarMutation.isError && (
            <p className="text-sm text-red-600 mt-3">
              {generarMutation.error instanceof Error ? generarMutation.error.message : 'Error al generar'}
            </p>
          )}
        </div>
      ) : (
        <>
          {/* Estado del informe */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {aprobado ? (
                <>
                  <CheckCircle size={16} className="text-emerald-500" />
                  <span className="text-sm font-medium text-emerald-700">Aprobado</span>
                  {informe.aprobadoAt && (
                    <span className="text-xs text-gray-400">
                      {new Date(informe.aprobadoAt).toLocaleDateString('es-CO')}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                  Borrador
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="gap-1.5"
                onClick={() => imprimirInforme(construirHtmlInforme(exportOpts()))}
              >
                <Printer size={13} /> Imprimir / PDF
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="gap-1.5"
                onClick={() => descargarDocx(nombreArchivo, exportOpts())}
              >
                <FileDown size={13} /> Word
              </Button>
              {!aprobado && (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={generarMutation.isPending}
                  onClick={() => generarMutation.mutate()}
                >
                  <RefreshCw size={13} className="mr-1" /> Regenerar
                </Button>
              )}
              {user?.rol === 'socio' && (
                aprobado ? (
                  <Button size="sm" variant="secondary" loading={reabrirMutation.isPending} onClick={() => reabrirMutation.mutate()}>
                    Reabrir
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                    loading={aprobarMutation.isPending}
                    onClick={() => aprobarMutation.mutate()}
                  >
                    <ShieldCheck size={14} /> Aprobar informe
                  </Button>
                )
              )}
            </div>
          </div>

          {/* Secciones editables */}
          <div className="space-y-4">
            {secciones.map((sec) => (
              <div key={sec.key} className="bg-white rounded-xl border border-gray-200 p-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{sec.label}</p>
                <Textarea
                  id={`ai-sec-${sec.key}`}
                  label=""
                  value={contenidoLocal[sec.key] ?? ''}
                  rows={sec.key === 'hallazgos_consolidados' ? 10 : 4}
                  disabled={aprobado}
                  onChange={(e) =>
                    setContenidoLocal((prev) => ({ ...prev, [sec.key]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>

          {/* Guardar */}
          {!aprobado && (
            <div className="flex justify-end gap-3">
              {guardarMutation.isSuccess && (
                <span className="text-xs text-emerald-600 self-center">Guardado</span>
              )}
              <Button
                size="sm"
                loading={guardarMutation.isPending}
                onClick={() => guardarMutation.mutate()}
                disabled={JSON.stringify(contenidoLocal) === JSON.stringify(informe.contenido)}
              >
                Guardar cambios
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
