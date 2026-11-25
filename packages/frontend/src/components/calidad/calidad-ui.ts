import {
  COMPONENTES_CALIDAD,
  type EstadoCumplimiento,
  type EstadoFormato,
} from '@auditorya/types'
import type { useCalidad } from '../../hooks/useCalidad'

/** Estado y mutaciones del sistema de calidad (lo que devuelve useCalidad). */
export type Calidad = ReturnType<typeof useCalidad>

export type TipoElemento = 'objetivos' | 'riesgos' | 'respuestas'

/** Formulario único para agregar, editar o desactivar objetivos, riesgos y respuestas. */
export type Edicion = {
  modo: 'crear' | 'editar' | 'desactivar' | 'reactivar'
  tipo: TipoElemento
  titulo: string
  id?: string
  padre?: { campo: 'componente' | 'objetivoId' | 'riesgoId'; valor: string }
  texto?: string
}

/** Colores por estado de cumplimiento del componente (tarjetas del Resumen y leyenda). */
export const CUMPLIMIENTO_UI: Record<
  EstadoCumplimiento,
  { label: string; leyenda: string; tarjeta: string; icono: string; badge: string; barra: string; punto: string }
> = {
  cumplido: {
    label: 'Cumplido',
    leyenda: 'Cumplido: revisado y con sus formatos firmados',
    tarjeta: 'border-emerald-200 bg-emerald-50',
    icono: 'bg-emerald-500 text-white',
    badge: 'bg-emerald-100 text-emerald-800',
    barra: 'bg-emerald-500',
    punto: 'bg-emerald-500',
  },
  progreso: {
    label: 'En progreso',
    leyenda: 'En progreso: le falta algo',
    tarjeta: 'border-amber-200 bg-amber-50',
    icono: 'bg-amber-500 text-white',
    badge: 'bg-amber-100 text-amber-800',
    barra: 'bg-amber-500',
    punto: 'bg-amber-500',
  },
  atencion: {
    label: 'Atención',
    leyenda: 'Atención: riesgo sin respuesta o formato vencido',
    tarjeta: 'border-red-200 bg-red-50',
    icono: 'bg-red-500 text-white',
    badge: 'bg-red-100 text-red-800',
    barra: 'bg-red-500',
    punto: 'bg-red-500',
  },
  sin_empezar: {
    label: 'Sin empezar',
    leyenda: 'Sin empezar',
    tarjeta: 'border-gray-200 bg-white',
    icono: 'bg-gray-200 text-gray-600',
    badge: 'bg-gray-100 text-gray-600',
    barra: 'bg-gray-400',
    punto: 'bg-gray-400',
  },
}

export const FORMATO_UI: Record<EstadoFormato, { label: string; sello: string; accion: string }> = {
  sin_crear: { label: 'Sin crear', sello: 'bg-gray-200 text-gray-700', accion: 'Crear' },
  borrador: { label: 'Borrador', sello: 'bg-amber-100 text-amber-800', accion: 'Continuar' },
  firmado: { label: 'Firmado', sello: 'bg-emerald-100 text-emerald-800', accion: 'Ver' },
  vencido: { label: 'Vencido', sello: 'bg-red-100 text-red-800', accion: 'Renovar' },
}

export const ACCION_LABEL: Record<string, string> = {
  'calidad.responsable.designar': 'Designó al responsable del sistema',
  'calidad.objetivo.crear': 'Agregó un objetivo',
  'calidad.objetivo.editar': 'Editó un objetivo',
  'calidad.riesgo.crear': 'Agregó un riesgo',
  'calidad.riesgo.editar': 'Editó un riesgo',
  'calidad.respuesta.crear': 'Agregó una respuesta',
  'calidad.respuesta.editar': 'Editó una respuesta',
  'calidad.respuesta.evidencia': 'Adjuntó evidencia',
  'calidad.evaluacion.fecha_corte': 'Cambió la fecha de corte',
  'calidad.componente.revisar': 'Marcó un componente como revisado',
  'calidad.componente.desmarcar': 'Desmarcó un componente',
  'calidad.evaluacion.concluir': 'Concluyó la evaluación anual',
  'calidad.evaluacion.reabrir': 'Reabrió la evaluación anual',
  'calidad.documento.firmar': 'Firmó un formato',
  'calidad.documento.subir': 'Subió su propio formato firmado',
  'calidad.manual.generar': 'Generó el manual de calidad',
  'calidad.cambio.registrar': 'Registró un cambio relevante',
  'calidad.cambio.evaluar': 'Evaluó un cambio relevante',
  'calidad.documento_firma.subir': 'Subió un documento de la firma',
  'calidad.documento.cubrir': 'Cubrió un formato con un documento de la firma',
  'calidad.manual.externo': 'Registró un manual anterior',
}

/** Fecha de hoy en Colombia (YYYY-MM-DD) para comparar vigencias. */
export const hoyISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

export const tituloComponente = (clave: string) =>
  COMPONENTES_CALIDAD.find((c) => c.clave === clave)?.titulo ?? clave

/** Fecha corta; las fechas sin hora se leen como locales para no correr un día. */
export const fecha = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
