/**
 * Modo agéntico — tipos compartidos. El agente produce PROPUESTAS con bitácora;
 * el humano decide (aprobar / ajustar / omitir / descartar). Nada se borra.
 */

export type TipoPropuesta = 'hallazgo' | 'materialidad' | 'documento' | 'juicio' | 'ambiguedad' | 'riesgo'
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
  /** Tabla de destino de un juicio: 'entendimiento' | 'coso' | … */
  destino?: string
  /** Calificación propuesta de un componente COSO (juicio con destino 'coso'); al aprobar se escribe en `controles_coso`. */
  coso?: {
    componente: 'ambiente_control' | 'evaluacion_riesgos' | 'actividades_control' | 'informacion_comunicacion' | 'supervision'
    calificacion: 'efectivo' | 'con_deficiencias' | 'deficiente'
    puntaje: number | null
    respondidas: number
    total: number
    respuestas: { pregunta: string; texto: string; respuesta: 'si' | 'parcial' | 'no' | 'no_aplica' | 'no_se'; nota: string | null }[]
    deficiencias: { pregunta: string; componente: string; texto: string; areas: string[]; grado: 'no' | 'parcial' }[]
    senales: string[]
    observaciones: string
  }
  /** Valores propuestos de un riesgo (tipo 'riesgo'); al aprobar se escriben en `riesgos`. */
  riesgo?: {
    area: string
    riesgoInherente: 'bajo' | 'medio' | 'alto'
    riesgoControl: 'bajo' | 'medio' | 'alto'
    riesgoCombinado: 'bajo' | 'medio' | 'alto'
    respuestaPlaneada: string
    fuente: { tipo: 'hallazgo' | 'sector' | 'entendimiento'; codigos: string[] }
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
  /** Última corrida de identificación de riesgos, si existe. */
  corridaRiesgos: CorridaAgente | null
  /** Última corrida de evaluación del control interno, si existe. */
  corridaControlInterno: CorridaAgente | null
}

export const TIPO_PROPUESTA_LABEL: Record<TipoPropuesta, string> = {
  hallazgo: 'Hallazgo para aprobar',
  materialidad: 'Requiere tu juicio',
  documento: 'Documento requerido',
  juicio: 'Requiere tu juicio',
  ambiguedad: 'Interpretación ambigua',
  riesgo: 'Riesgo para aprobar',
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

/** Estado del arranque guiado de un encargo con agente (GET /auditorias/:id/agente/arranque). */
export type ArranqueAgente = {
  completado: boolean
  empresa: {
    nombre: string
    sector: string
    ciiu: string | null
    actividadEconomica: string | null
    marcoContable: string
    ciudad: string | null
  }
  documentos: { rut: boolean; camaraComercio: boolean; estadosAnteriores: boolean }
  entendimiento: { cambiosSignificativos: string | null; sinCambios: boolean; confirmado: boolean } | null
  memoria: Record<string, unknown>
  balanceCargado: boolean
  comparativoCargado: boolean
  corrida: CorridaAgente | null
  teToca: number
  hallazgosAltos: number
  materialidadPropuesta: number | null
  documentosPedidos: number
  primeraDecision: { paso: string; codigo: string | null; titulo: string; severidad: SeveridadPropuesta | null; monto: number | null } | null
}

// ─── Ejecución por ciclo (modo agéntico) ─────────────────────────────────────

export type EstadoCiclo = 'listo' | 'decidir' | 'sin_iniciar' | 'esperando' | 'terminado'

export const ESTADO_CICLO_LABEL: Record<EstadoCiclo, string> = {
  listo: 'Puedes avanzar',
  decidir: 'Te toca decidir',
  sin_iniciar: 'Sin iniciar',
  esperando: 'Esperando documentos',
  terminado: 'Terminado',
}

export type PapelCiclo = {
  id: string
  indice: string
  titulo: string
  estado: 'borrador' | 'en_revision' | 'aprobado'
  pasosHechos: number
  pasosTotal: number
  evidencias: number
  pbcSolicitados: number
  pbcRecibidos: number
  hallazgosAbiertos: number
  tieneConclusion: boolean
}

export type CicloAgente = {
  area: string
  nombre: string
  prefijo: string
  estado: EstadoCiclo
  /** Por qué está en ese estado, en una frase. */
  motivo: string
  /** Lo primero que el agente sugiere hacer en este ciclo. */
  siguiente: string | null
  riesgos: number
  riesgoMaximo: 'alto' | 'medio' | 'bajo' | null
  papeles: PapelCiclo[]
  pendientes: number
  hallazgosAbiertos: number
  senalesBalance: number
  pbcPendientes: number
}

export type AccionCiclo = {
  tipo: 'decidir' | 'revisar_evidencia' | 'marcar_pasos' | 'concluir' | 'iniciar' | 'pedir' | 'hallazgo' | 'prueba'
  texto: string
  detalle?: string | null
  papelId?: string | null
  papelIndice?: string | null
  propuestaId?: string | null
  /** Riesgo aprobado sin prueba: crear la prueba o escribir la respuesta sin prueba. */
  riesgoId?: string | null
}

/** Riesgos de un ciclo: los que propone el agente (por decidir) y los que ya están en la matriz. */
export type RiesgoMatrizCiclo = {
  id: string
  descripcion: string
  riesgoInherente: 'alto' | 'medio' | 'bajo'
  riesgoControl: 'alto' | 'medio' | 'bajo'
  riesgoCombinado: 'alto' | 'medio' | 'bajo'
  respuestaPlaneada: string | null
  origen: 'manual' | 'sugerido' | 'analitico'
  papeles: { id: string; indice: string; titulo: string }[]
}

export type RiesgosCiclo = {
  area: string
  nombre: string
  prefijo: string
  riesgoMaximo: 'alto' | 'medio' | 'bajo' | null
  senalesBalance: number
  /** Propuestas de riesgo pendientes de decidir. */
  propuestas: PropuestaAgente[]
  /** Propuestas omitidas (no tomadas), retomables. */
  omitidas: { id: string; codigo: string | null; titulo: string }[]
  matriz: RiesgoMatrizCiclo[]
  /** Riesgos típicos del sector en este ciclo que no están en la matriz (para agregar en un clic). */
  catalogo: { descripcion: string; riesgoInherente: 'alto' | 'medio' | 'bajo'; respuestaPlaneada: string }[]
}

export type CicloDetalle = CicloAgente & {
  acciones: AccionCiclo[]
  papelesDetalle: (PapelCiclo & {
    pasos: { indice: number; texto: string; hecho: boolean; nota: string | null }[]
    evidenciasLista: { id: string; nombre: string; tipo: string; createdAt: string }[]
    pbc: { id: string; descripcion: string; estado: 'solicitado' | 'recibido' | 'no_aplica' }[]
    conclusion: string | null
  })[]
  riesgosLista: { id: string; descripcion: string; riesgoCombinado: 'alto' | 'medio' | 'bajo'; respuestaPlaneada: string | null }[]
  hallazgosLista: { id: string; descripcion: string; severidad: 'alta' | 'media' | 'baja'; estado: string; tipo: string; papelIndice: string | null }[]
  propuestas: PropuestaAgente[]
}
