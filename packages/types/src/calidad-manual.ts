/**
 * Manual del sistema de gestión de calidad: consolidado versionado de todo el sistema de la
 * firma (recomendación de la asesora de la JCC). Cada versión guarda una FOTO del sistema al
 * generarse, así se ve igual aunque después cambien los objetivos, riesgos o formatos.
 * Solo se genera con los 8 componentes cumplidos.
 */
import { COMPONENTES_CALIDAD, type ComponenteCalidad, type ResultadoEvaluacionCalidad, type SistemaCalidad } from './calidad'
import { cumplimientoComponente } from './calidad-formatos'

export type ManualCalidadSnapshot = {
  firma: {
    nombre: string
    nit: string
    ciudad: string
    direccion: string | null
    telefono: string | null
    email: string | null
    inscripcionJcc: string | null
  }
  responsable: string | null
  anio: number
  componentes: {
    clave: ComponenteCalidad
    titulo: string
    ref: string
    descripcion: string
    objetivos: {
      texto: string
      riesgos: {
        descripcion: string
        /** `evidencia`: cómo se cumple (función de AuditorYa, formato firmado, archivo o nada). */
        respuestas: { descripcion: string; evidencia: string | null }[]
      }[]
    }[]
  }[]
  formatos: {
    clave: string
    titulo: string
    version: number
    firmadoAt: string
    firmadoPor: string | null
    vigenteHasta: string | null
    /** Nombre del archivo si es un documento propio subido por la firma (sin texto). */
    archivoNombre: string | null
    /** Si lo cubre un documento que la firma ya tenía (versiones generadas desde la migración 0058). */
    cubiertoPor?: { nombre: string; referencia: string | null; aprobadoPor: string | null; fechaAprobacion: string } | null
    secciones: { label: string; contenido: string }[]
  }[]
  evaluacion: {
    fechaCorte: string
    resultado: ResultadoEvaluacionCalidad | null
    conclusion: string | null
    deficiencias: string | null
    concluidoPor: string | null
    concluidoAt: string | null
  }
  /** Cambios relevantes del año (acción cruda: la etiqueta se pone al exportar). */
  cambios: { fecha: string; accion: string; detalle: string | null; usuario: string | null }[]
  /** La versión a la que reemplaza este manual, si había una (propia o hecha fuera de AuditorYa). */
  reemplaza?: { version: number; fecha: string; externo: boolean } | null
  /** Cambios relevantes del año con su decisión (¶27). Las versiones anteriores a 0057 no lo traen. */
  cambiosRelevantes?: {
    fecha: string
    tipo: string
    descripcion: string
    componentes: string[]
    decision: string | null
    justificacion: string | null
  }[]
}

export type ManualCalidadResumen = {
  id: string
  version: number
  anio: number
  generadoAt: string
  generadoPorNombre: string | null
  hash: string
  /** Manual anterior hecho fuera de AuditorYa: se registra con su archivo, sin foto del sistema. */
  externo: boolean
  fechaAprobacion: string | null
  archivoNombre: string | null
}

export type ManualCalidad = ManualCalidadResumen & { contenido: ManualCalidadSnapshot }

/** Componentes que impiden generar el manual: todos deben estar cumplidos. */
export function componentesSinCumplir(
  sistema: Pick<SistemaCalidad, 'objetivos' | 'riesgos' | 'respuestas' | 'documentos' | 'evaluacion'>,
  hoy: string,
): { clave: ComponenteCalidad; titulo: string; falta: string }[] {
  return COMPONENTES_CALIDAD.flatMap((c) => {
    const cu = cumplimientoComponente(c.clave, sistema, hoy)
    return cu.estado === 'cumplido' ? [] : [{ clave: c.clave, titulo: c.titulo, falta: cu.resumen }]
  })
}
