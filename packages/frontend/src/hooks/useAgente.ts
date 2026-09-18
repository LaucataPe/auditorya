import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CicloAgente, CicloDetalle, CorridaAgente, DecisionPropuesta, PropuestaAgente, ResumenAgente, RespuestaCoso, RespuestaCosoRegistrada, RiesgosCiclo } from '@auditorya/types'
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

/** Todas las propuestas del encargo (todos los pasos y estados), para el panel del agente. */
export function usePropuestasEncargo(auditoriaId: string) {
  return useQuery<PropuestaAgente[]>({
    queryKey: ['agente', 'propuestas', auditoriaId, '__todas__', 'todas'],
    queryFn: () => api.get<PropuestaAgente[]>(`/auditorias/${auditoriaId}/agente/propuestas?estado=todas`),
  })
}

export function useInvalidarAgente(auditoriaId: string) {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['agente', 'resumen', auditoriaId] })
    qc.invalidateQueries({ queryKey: ['agente', 'propuestas', auditoriaId] })
    qc.invalidateQueries({ queryKey: ['materialidad', auditoriaId] })
    qc.invalidateQueries({ queryKey: ['riesgos', auditoriaId] })
    qc.invalidateQueries({ queryKey: ['coso', auditoriaId] })
    qc.invalidateQueries({ queryKey: ['hallazgos', auditoriaId] })
    qc.invalidateQueries({ queryKey: ['papeles', auditoriaId] })
    qc.invalidateQueries({ queryKey: ['pbc', auditoriaId] })
    qc.invalidateQueries({ queryKey: ['agente', 'ciclos', auditoriaId] })
    qc.invalidateQueries({ queryKey: ['agente', 'riesgos-por-ciclo', auditoriaId] })
    qc.invalidateQueries({ queryKey: ['riesgos-respuestas', auditoriaId] })
    qc.invalidateQueries({ queryKey: ['agente', 'control-interno', auditoriaId] })
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
  materialidad?: { baseCalculo?: 'activos' | 'ingresos' | 'utilidad_antes_impuestos' | 'patrimonio'; montoBase: number; porcentaje: number; porcentajeDesempeno: number; justificacion?: string }
  coso?: { calificacion?: 'efectivo' | 'con_deficiencias' | 'deficiente'; observaciones?: string }
}

export type ControlInternoAgente = {
  respuestas: RespuestaCosoRegistrada[]
  memoria: { respuestas: RespuestaCosoRegistrada[]; fecha: string } | null
  evaluados: { componente: string; calificacion: string }[]
  corrida: CorridaAgente | null
  total: number
}

export function useControlInternoAgente(auditoriaId: string) {
  return useQuery<ControlInternoAgente>({
    queryKey: ['agente', 'control-interno', auditoriaId],
    queryFn: () => api.get<ControlInternoAgente>(`/auditorias/${auditoriaId}/agente/control-interno`),
  })
}

export function useGuardarRespuestasCoso(auditoriaId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (respuestas: { pregunta: string; respuesta: RespuestaCoso; nota?: string }[]) =>
      api.put<{ guardadas: number; total: number; de: number }>(`/auditorias/${auditoriaId}/agente/control-interno/respuestas`, { respuestas }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agente', 'control-interno', auditoriaId] }),
  })
}

export type ListaCiclos = { ciclos: CicloAgente[]; otros: { area: string; nombre: string; prefijo: string }[]; sugerido: string | null }

export function useCiclos(auditoriaId: string) {
  return useQuery<ListaCiclos>({
    queryKey: ['agente', 'ciclos', auditoriaId],
    queryFn: () => api.get<ListaCiclos>(`/auditorias/${auditoriaId}/agente/ciclos`),
  })
}

export function useCiclo(auditoriaId: string, area: string | null) {
  return useQuery<CicloDetalle>({
    queryKey: ['agente', 'ciclos', auditoriaId, area],
    queryFn: () => api.get<CicloDetalle>(`/auditorias/${auditoriaId}/agente/ciclos/${area}`),
    enabled: !!area,
  })
}

export function useIniciarCiclo(auditoriaId: string) {
  const invalidar = useInvalidarAgente(auditoriaId)
  return useMutation({
    mutationFn: (area: string) => api.post<{ riesgoId: string; riesgoCreado: boolean; prueba: { creado: boolean; indice?: string; titulo?: string; documentos?: number; motivo?: string } }>(`/auditorias/${auditoriaId}/agente/ciclos/${area}/iniciar`, {}),
    onSuccess: (d) => {
      invalidar()
      toast.success(d.prueba.creado ? `Listo: ${d.riesgoCreado ? 'riesgo y ' : ''}prueba ${d.prueba.indice} creada${d.prueba.documentos ? ` con ${d.prueba.documentos} documentos pedidos` : ''}` : d.prueba.motivo === 'materialidad_no_aprobada' ? 'Riesgo creado. La prueba se crea al aprobar la materialidad' : 'El ciclo ya tenía su prueba')
    },
  })
}

export function useProponerConclusion(auditoriaId: string) {
  const invalidar = useInvalidarAgente(auditoriaId)
  return useMutation({
    mutationFn: (papelId: string) => api.post<{ propuestaId: string; codigo: string }>(`/auditorias/${auditoriaId}/agente/papeles/${papelId}/conclusion`, {}),
    onSuccess: (d) => { invalidar(); toast.success(`Conclusión propuesta (${d.codigo}): confírmala o ajústala`) },
  })
}

export function useRiesgosPorCiclo(auditoriaId: string) {
  return useQuery<{ ciclos: RiesgosCiclo[]; otros: { area: string; nombre: string; prefijo: string }[] }>({
    queryKey: ['agente', 'riesgos-por-ciclo', auditoriaId],
    queryFn: () => api.get(`/auditorias/${auditoriaId}/agente/riesgos-por-ciclo`),
  })
}

export function useCrearPruebaRiesgo(auditoriaId: string) {
  const invalidar = useInvalidarAgente(auditoriaId)
  return useMutation({
    mutationFn: (riesgoId: string) => api.post<{ creado: boolean; indice?: string; titulo?: string; documentos?: number; motivo?: string }>(`/auditorias/${auditoriaId}/agente/riesgos/${riesgoId}/prueba`, {}),
    onSuccess: (d) => {
      invalidar()
      toast.success(d.creado ? `Prueba ${d.indice} creada${d.documentos ? ` con ${d.documentos} documentos pedidos` : ''}` : d.motivo === 'materialidad_no_aprobada' ? 'La prueba se crea al aprobar la materialidad' : d.motivo === 'ya_existe' ? 'Este riesgo ya tiene prueba' : 'No hay programa estándar para esta área')
    },
  })
}

export function useAgregarRiesgo(auditoriaId: string) {
  const invalidar = useInvalidarAgente(auditoriaId)
  return useMutation({
    mutationFn: (v: { area: string; descripcion: string; riesgoInherente: 'alto' | 'medio' | 'bajo'; riesgoControl: 'alto' | 'medio' | 'bajo'; respuestaPlaneada?: string }) =>
      api.post(`/auditorias/${auditoriaId}/riesgos`, v),
    onSuccess: () => { invalidar(); toast.success('Riesgo agregado a la matriz') },
  })
}

export function useResponderRiesgo(auditoriaId: string) {
  const invalidar = useInvalidarAgente(auditoriaId)
  return useMutation({
    mutationFn: (v: { riesgoId: string; respuestaPlaneada: string }) => api.put(`/auditorias/${auditoriaId}/riesgos/${v.riesgoId}`, { respuestaPlaneada: v.respuestaPlaneada }),
    onSuccess: () => { invalidar(); toast.success('Respuesta guardada en el riesgo') },
  })
}

export function useCorrerControlInterno(auditoriaId: string) {
  const invalidar = useInvalidarAgente(auditoriaId)
  return useMutation({
    mutationFn: () => api.post<{ corridaId: string; propuestas: number; componentes: number; deficiencias: number }>(`/auditorias/${auditoriaId}/agente/corridas/control-interno`, {}),
    onSuccess: (d) => {
      invalidar()
      toast.success(d.componentes === 0 ? 'Aún no hay con qué calificar: responde el cuestionario' : `${d.componentes} componente${d.componentes === 1 ? '' : 's'} calificado${d.componentes === 1 ? '' : 's'}, ${d.deficiencias} deficiencia${d.deficiencias === 1 ? '' : 's'}`)
    },
  })
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
