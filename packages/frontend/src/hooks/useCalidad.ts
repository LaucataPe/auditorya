import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  COMPONENTES_CALIDAD,
  cumplimientoComponente,
  type ComponenteCalidad,
  type DecisionCambioRelevante,
  type DocumentoCalidad,
  type TipoCambioRelevante,
  type ManualCalidad,
  type ResultadoEvaluacionCalidad,
  type SistemaCalidad,
} from '@auditorya/types'
import { api, BASE_URL } from '../lib/api'
import { toast } from '../store/toast.store'

const BASE = '/firmas/mia/calidad'

/**
 * Sistema de gestión de calidad de la firma (NIGC 1): objetivos → riesgos → respuestas
 * y la evaluación anual del año elegido. Todas las mutaciones refrescan el sistema completo.
 */
export function useCalidad(anio: number) {
  const queryClient = useQueryClient()
  const query = useQuery<SistemaCalidad>({
    queryKey: ['calidad', anio],
    queryFn: () => api.get<SistemaCalidad>(`${BASE}?anio=${anio}`),
  })

  const useMutar = <V, R>(fn: (v: V) => Promise<R>, ok?: string) =>
    useMutation({
      mutationFn: fn,
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['calidad'] })
        if (ok) toast.success(ok)
      },
      onError: (e: Error) => toast.error(e.message),
    })

  const designarResponsable = useMutar(
    (usuarioId: string | null) => api.put(`${BASE}/responsable`, { usuarioId }),
    'Responsable actualizado',
  )

  const crear = useMutar(
    (v: { tipo: 'objetivos' | 'riesgos' | 'respuestas'; body: Record<string, string> }) =>
      api.post(`${BASE}/${v.tipo}`, v.body),
    'Agregado al sistema de calidad',
  )

  const editar = useMutar(
    (v: { tipo: 'objetivos' | 'riesgos' | 'respuestas'; id: string; body: Record<string, unknown> }) =>
      api.patch(`${BASE}/${v.tipo}/${v.id}`, v.body),
    'Cambio guardado',
  )

  const subirEvidencia = useMutar((v: { respuestaId: string; archivo: File }) => {
    const fd = new FormData()
    fd.append('archivo', v.archivo)
    return api.upload(`${BASE}/respuestas/${v.respuestaId}/evidencia`, fd)
  }, 'Evidencia adjuntada')

  const cambiarFechaCorte = useMutar(
    (fechaCorte: string) => api.put(`${BASE}/evaluaciones/${anio}`, { fechaCorte }),
    'Fecha de corte actualizada',
  )

  const marcarComponente = useMutar((v: { componente: ComponenteCalidad; revisado: boolean; nota?: string }) =>
    v.revisado
      ? api.post(`${BASE}/evaluaciones/${anio}/componentes/${v.componente}`, { nota: v.nota || null })
      : api.delete(`${BASE}/evaluaciones/${anio}/componentes/${v.componente}`),
  )

  const concluir = useMutar(
    (v: { resultado: ResultadoEvaluacionCalidad; conclusion: string; deficiencias: string | null }) =>
      api.post(`${BASE}/evaluaciones/${anio}/concluir`, v),
    'Evaluación concluida',
  )

  const reabrir = useMutar(
    (motivo: string) => api.post(`${BASE}/evaluaciones/${anio}/reabrir`, { motivo }),
    'Evaluación reabierta',
  )

  // Formatos prellenados: crear devuelve el documento para abrirlo de inmediato.
  const crearDocumento = useMutar((formato: string) => api.post<DocumentoCalidad>(`${BASE}/documentos`, { formato }))

  const guardarDocumento = useMutar((v: { id: string; contenido: Record<string, string> }) =>
    api.put<DocumentoCalidad>(`${BASE}/documentos/${v.id}`, { contenido: v.contenido }),
  )

  const firmarDocumento = useMutar(
    (id: string) => api.post<DocumentoCalidad>(`${BASE}/documentos/${id}/firmar`, {}),
    'Documento firmado',
  )

  const descartarDocumento = useMutar(
    (id: string) => api.delete(`${BASE}/documentos/${id}`),
    'Borrador descartado',
  )

  // Formato propio de la firma, ya firmado: queda como la versión firmada siguiente.
  const subirFormato = useMutar((v: { formato: string; archivo: File; fecha: string }) => {
    const fd = new FormData()
    fd.append('formato', v.formato)
    fd.append('archivo', v.archivo)
    fd.append('fecha', v.fecha)
    return api.upload<DocumentoCalidad>(`${BASE}/documentos/subir`, fd)
  }, 'Documento subido')

  const generarManual = useMutar(
    (anioManual: number) => api.post<ManualCalidad>(`${BASE}/manuales`, { anio: anioManual }),
    'Manual de calidad generado',
  )

  const registrarCambio = useMutar(
    (v: {
      fecha: string
      tipo: TipoCambioRelevante
      descripcion: string
      componentes: ComponenteCalidad[]
      decision?: { decision: DecisionCambioRelevante; justificacion: string }
    }) => api.post<{ id: string }>(`${BASE}/cambios`, v),
    'Cambio relevante registrado',
  )

  const evaluarCambio = useMutar(
    (v: { id: string; decision: DecisionCambioRelevante; justificacion: string }) =>
      api.post(`${BASE}/cambios/${v.id}/evaluar`, { decision: v.decision, justificacion: v.justificacion }),
    'Decisión registrada',
  )

  const subirDocumentoFirma = useMutar(
    (v: { archivo: File; nombre: string; fechaAprobacion: string; aprobadoPor: string }) => {
      const fd = new FormData()
      fd.append('archivo', v.archivo)
      fd.append('nombre', v.nombre)
      fd.append('fechaAprobacion', v.fechaAprobacion)
      fd.append('aprobadoPor', v.aprobadoPor)
      return api.upload<{ id: string }>(`${BASE}/documentos-firma`, fd)
    },
  )

  const cubrirFormatos = useMutar(
    (v: { documentoFirmaId: string; formatos: { formato: string; referencia: string | null }[] }) =>
      api.post<{ formatos: string[] }>(`${BASE}/documentos-firma/${v.documentoFirmaId}/cubrir`, { formatos: v.formatos }),
    'Formatos cubiertos con el documento de la firma',
  )

  const registrarManualExterno = useMutar((v: { archivo: File; version: number; fechaAprobacion: string }) => {
    const fd = new FormData()
    fd.append('archivo', v.archivo)
    fd.append('version', String(v.version))
    fd.append('fechaAprobacion', v.fechaAprobacion)
    return api.upload<{ id: string }>(`${BASE}/manuales/externo`, fd)
  }, 'Manual anterior registrado')

  /** Abre en otra pestaña un archivo del sistema de calidad por su URL firmada de 15 minutos. */
  async function abrirArchivo(ruta: string) {
    try {
      const { url } = await api.get<{ url: string }>(`${BASE}${ruta}`)
      window.open(`${BASE_URL}${url}`, '_blank')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  /** Trae una versión del manual con su foto completa (para exportarla). */
  function cargarManual(id: string) {
    return queryClient.fetchQuery({
      queryKey: ['calidad-manual', id],
      queryFn: () => api.get<ManualCalidad>(`${BASE}/manuales/${id}`),
      staleTime: Infinity, // una versión del manual no cambia
    })
  }

  async function abrirArchivoDocumento(documentoId: string) {
    try {
      const { url } = await api.get<{ url: string }>(`${BASE}/documentos/${documentoId}/archivo`)
      window.open(`${BASE_URL}${url}`, '_blank')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function abrirEvidencia(respuestaId: string) {
    try {
      const { url } = await api.get<{ url: string }>(`${BASE}/respuestas/${respuestaId}/evidencia`)
      window.open(`${BASE_URL}${url}`, '_blank')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return {
    ...query,
    designarResponsable,
    crear,
    editar,
    subirEvidencia,
    cambiarFechaCorte,
    marcarComponente,
    concluir,
    reabrir,
    abrirEvidencia,
    crearDocumento,
    guardarDocumento,
    firmarDocumento,
    descartarDocumento,
    subirFormato,
    abrirArchivoDocumento,
    generarManual,
    cargarManual,
    registrarCambio,
    evaluarCambio,
    subirDocumentoFirma,
    cubrirFormatos,
    registrarManualExterno,
    abrirDocumentoFirma: (id: string) => abrirArchivo(`/documentos-firma/${id}/archivo`),
    abrirManualExterno: (id: string) => abrirArchivo(`/manuales/${id}/archivo`),
  }
}

/**
 * Componentes del sistema de calidad que aún no están cumplidos este año (contador del
 * menú lateral). Comparte la caché con useCalidad para no pedir el sistema dos veces.
 */
export function useCalidadPendientes(): number | undefined {
  const anio = new Date().getFullYear()
  const { data } = useQuery<SistemaCalidad>({
    queryKey: ['calidad', anio],
    queryFn: () => api.get<SistemaCalidad>(`${BASE}?anio=${anio}`),
    staleTime: 60_000,
  })
  if (!data) return undefined
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  return COMPONENTES_CALIDAD.filter((c) => cumplimientoComponente(c.clave, data, hoy).estado !== 'cumplido').length
}

/** Una versión de un formato con su contenido e historial. */
export function useDocumentoCalidad(id: string | null) {
  return useQuery<DocumentoCalidad>({
    queryKey: ['calidad-documento', id],
    queryFn: () => api.get<DocumentoCalidad>(`${BASE}/documentos/${id}`),
    enabled: !!id,
  })
}
