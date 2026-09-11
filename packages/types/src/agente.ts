/**
 * Modo agéntico — tipos compartidos. El agente produce PROPUESTAS con bitácora;
 * el humano decide (aprobar / ajustar / omitir / descartar). Nada se borra.
 */

export type TipoPropuesta = 'hallazgo' | 'materialidad' | 'documento' | 'juicio' | 'ambiguedad'
export type EstadoPropuesta = 'propuesta' | 'aprobada' | 'ajustada' | 'omitida' | 'descartada'
export type CertezaPropuesta = 'verificado' | 'requiere_evidencia' | 'no_verificable'
export type SeveridadPropuesta = 'alta' | 'media' | 'baja'
export type TipoBitacora = 'lectura' | 'regla' | 'contraste' | 'clasificacion' | 'solicitud' | 'llm' | 'humano'
export type DecisionPropuesta = 'aprobar' | 'ajustar' | 'omitir' | 'descartar' | 'retomar'

export type LineaBitacora = {
  numero: number
  tipo: TipoBitacora
  texto: string
  /** Rastreabilidad: { regla: 'V-21', norma: 'NIA 315', paso: 'P-03', … } */
  referencia?: Record<string, unknown> | null
  actor: 'agente' | 'usuario'
  usuarioNombre?: string | null
  createdAt?: string
}

/** Los "datos" de la tarjeta: siempre calculados por el motor, nunca por el LLM. */
export type DatoPropuesta = { etiqueta: string; valor: string }

export type ContenidoPropuesta = {
  descripcion?: string
  norma?: string
  /** Para qué sirve / qué desbloquea (regla no negociable: nunca pedir sin decir para qué). */
  para?: string
  recomendacion?: string
  /** Opciones de un juicio o ambigüedad. La primera es la recomendada. */
  opciones?: { clave: string; label: string }[]
  /** Valores propuestos de materialidad (tipo 'materialidad'). */
  materialidad?: {
    baseCalculo: 'activos' | 'ingresos' | 'utilidad_antes_impuestos' | 'patrimonio'
    montoBase: number
    porcentaje: number
    porcentajeDesempeno: number
    materialidad: number
    materialidadDesempeno: number
    justificacion: string
  }
}

export type PropuestaAgente = {
  id: string
  auditoriaId: string
  corridaId: string | null
  paso: string
  tipo: TipoPropuesta
  codigo: string | null
  titulo: string
  cuentaCodigo: string | null
  monto: number | null
  severidad: SeveridadPropuesta | null
  certeza: CertezaPropuesta | null
  reglas: string[]
  datos: DatoPropuesta[]
  contenido: ContenidoPropuesta
  estado: EstadoPropuesta
  desbloqueaId: string | null
  /** Título de la propuesta que desbloquea (para mostrar "Desbloquea H-03 · …"). */
  desbloqueaTitulo?: string | null
  desbloqueaCodigo?: string | null
  entidadDestino: string | null
  entidadDestinoId: string | null
  decididaPor: string | null
  decididaAt: string | null
  motivoDecision: string | null
  orden: number
  createdAt: string
  bitacora: LineaBitacora[]
}

export type CorridaAgente = {
  id: string
  procedimiento: string
  estado: 'en_cola' | 'corriendo' | 'completada' | 'error'
  archivoNombre: string | null
  filas: number | null
  filasHoja: number | null
  filasResumen: number | null
  parametros: Record<string, unknown>
  resultado: Record<string, unknown> | null
  error: string | null
  iniciadaAt: string | null
  terminadaAt: string | null
  createdAt: string
  bitacora: LineaBitacora[]
}

export type ResumenAgente = {
  activado: boolean
  /** Propuestas pendientes de decisión en todo el encargo. */
  teToca: number
  /** Líneas de bitácora del agente + decisiones tomadas: lo que "ya hizo". */
  hecho: number
  porPaso: Record<string, { pendientes: number; decididas: number }>
  /** Última corrida del procedimiento de balance, si existe. */
  corrida: CorridaAgente | null
}

export const TIPO_PROPUESTA_LABEL: Record<TipoPropuesta, string> = {
  hallazgo: 'Hallazgo para aprobar',
  materialidad: 'Requiere tu juicio',
  documento: 'Documento requerido',
  juicio: 'Requiere tu juicio',
  ambiguedad: 'Interpretación ambigua',
}

export const CERTEZA_LABEL: Record<CertezaPropuesta, string> = {
  verificado: 'Verificado',
  requiere_evidencia: 'Requiere evidencia',
  no_verificable: 'No verificable',
}

export const ESTADO_PROPUESTA_LABEL: Record<EstadoPropuesta, string> = {
  propuesta: 'Pendiente',
  aprobada: 'Aprobada',
  ajustada: 'Ajustada',
  omitida: 'Omitida',
  descartada: 'Descartada',
}
