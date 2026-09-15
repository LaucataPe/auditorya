import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DecisionPropuesta, PropuestaAgente, ResumenAgente } from '@auditorya/types'
import { api } from '../lib/api'
import { toast } from '../store/toast.store'

export function useResumenAgente(auditoriaId: string | undefined, activado: boolean) {
  return useQuery<ResumenAgente>({
    queryKey: ['agente', 'resumen', auditoriaId],
    queryFn: () => api.get<ResumenAgente>(`/auditorias/${auditoriaId}/agente/resumen`),
    enabled: !!auditoriaId && activado,
    refetchInterval: (q) => (q.state.data?.corrida?.estado === 'corriendo' ? 2000 : false),
  })
}

export function usePropuestas(auditoriaId: string, paso: string, estado: 'propuesta' | 'todas' = 'propuesta') {
  return useQuery<PropuestaAgente[]>({
    queryKey: ['agente', 'propuestas', auditoriaId, paso, estado],
    queryFn: () => api.get<PropuestaAgente[]>(`/auditorias/${auditoriaId}/agente/propuestas?paso=${paso}&estado=${estado}`),
  })
}

export function useInvalidarAgente(auditoriaId: string) {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['agente', 'resumen', auditoriaId] })
    qc.invalidateQueries({ queryKey: ['agente', 'propuestas', auditoriaId] })
    qc.invalidateQueries({ queryKey: ['materialidad', auditoriaId] })
    qc.invalidateQueries({ queryKey: ['riesgos', auditoriaId] })
    qc.invalidateQueries({ queryKey: ['riesgos-respuestas', auditoriaId] })
    qc.invalidateQueries({ queryKey: ['auditoria', auditoriaId] })
    qc.invalidateQueries({ queryKey: ['progreso', auditoriaId] })
  }
}

export type AjustesDecision = {
  titulo?: string
  descripcion?: string
  severidad?: 'alta' | 'media' | 'baja'
  riesgo?: { area?: string; riesgoInherente?: 'bajo' | 'medio' | 'alto'; riesgoControl?: 'bajo' | 'medio' | 'alto'; respuestaPlaneada?: string }
}

export function useDecidir(auditoriaId: string) {
  const invalidar = useInvalidarAgente(auditoriaId)
  return useMutation({
    mutationFn: (v: { id: string; decision: DecisionPropuesta; motivo?: string; ajustes?: AjustesDecision }) =>
      api.post<PropuestaAgente>(`/propuestas/${v.id}/decidir`, { decision: v.decision, motivo: v.motivo, ajustes: v.ajustes }),
    onSuccess: (_d, v) => {
      invalidar()
      const msg: Record<DecisionPropuesta, string> = {
        aprobar: 'Aprobado', ajustar: 'Aprobado con ajustes', omitir: 'Omitido por ahora', descartar: 'Descartado', retomar: 'Retomado',
      }
      toast.success(msg[v.decision])
    },
  })
}

export function useCorrerRiesgos(auditoriaId: string) {
  const invalidar = useInvalidarAgente(auditoriaId)
  return useMutation({
    mutationFn: () => api.post<{ corridaId: string; propuestas: number; nuevas: number; conservadas: number }>(`/auditorias/${auditoriaId}/agente/corridas/riesgos`, {}),
    onSuccess: (d) => {
      invalidar()
      toast.success(d.propuestas === 0 ? 'No hay riesgos que proponer' : d.nuevas === 0 ? 'Sin cambios: los riesgos propuestos siguen igual' : `${d.nuevas} riesgo${d.nuevas === 1 ? '' : 's'} nuevo${d.nuevas === 1 ? '' : 's'} propuesto${d.nuevas === 1 ? '' : 's'}`)
    },
  })
}

export function useCorrerBalance(auditoriaId: string) {
  const invalidar = useInvalidarAgente(auditoriaId)
  return useMutation({
    mutationFn: () => api.post<{ corridaId: string; propuestas: number }>(`/auditorias/${auditoriaId}/agente/corridas`, {}),
    onSuccess: (d) => { invalidar(); toast.success(`Revisión terminada: ${d.propuestas} propuestas`) },
  })
}
