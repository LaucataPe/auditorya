/**
 * Hoja de ajustes / sumario de incorrecciones (NIA 450) — funciones puras, sin IA.
 *
 * Acumula las incorrecciones (errores) encontradas y las compara con la
 * materialidad para SUGERIR el tipo de opinión del dictamen (NIA 700/705). Es
 * una sugerencia de apoyo: la decisión final es del juicio profesional del socio.
 *
 * Regla:
 *  - Solo las incorrecciones monetarias (efecto en resultado o patrimonio) suman
 *    para la comparación; las reclasificaciones se listan pero no acumulan monto.
 *  - Incorrecciones no corregidas por debajo de la materialidad → favorable.
 *  - Iguales o por encima de la materialidad, pero no generalizadas → con salvedades.
 *  - Muy por encima de la materialidad (≥ 3×, heurística de "generalizada") → negativa.
 */

export type TipoAjuste = 'factual' | 'juicio' | 'proyectado'
export type EfectoAjuste = 'resultado' | 'patrimonio' | 'reclasificacion'
export type OpinionSugerida = 'favorable' | 'con_salvedades' | 'negativa' | 'sin_base'

export const TIPO_AJUSTE_LABEL: Record<TipoAjuste, string> = {
  factual: 'Factual',
  juicio: 'De juicio',
  proyectado: 'Proyectado',
}

export const EFECTO_AJUSTE_LABEL: Record<EfectoAjuste, string> = {
  resultado: 'Resultado',
  patrimonio: 'Patrimonio',
  reclasificacion: 'Reclasificación',
}

export const OPINION_LABEL: Record<OpinionSugerida, string> = {
  favorable: 'Favorable (sin salvedades)',
  con_salvedades: 'Con salvedades',
  negativa: 'Negativa (adversa)',
  sin_base: 'Sin base para opinar',
}

export type Ajuste = {
  id: string
  auditoriaId: string
  descripcion: string
  cuentaCodigo: string | null
  monto: string // numeric como string
  tipo: TipoAjuste
  efecto: EfectoAjuste
  corregido: boolean
  createdAt: string
}

/** Entrada mínima para evaluar la opinión. */
export type AjusteCalc = { monto: number; corregido: boolean; efecto: EfectoAjuste }

export type EvaluacionOpinion = {
  totalNoCorregido: number
  totalCorregido: number
  totalReclasificaciones: number
  numAjustes: number
  numNoCorregidos: number
  materialidad: number | null
  umbralNegativa: number | null
  superaMaterialidad: boolean
  opinionSugerida: OpinionSugerida
  razon: string
}

/** Múltiplo de la materialidad a partir del cual se sugiere opinión negativa. */
export const FACTOR_OPINION_NEGATIVA = 3

const abs = (n: number) => Math.abs(Number(n) || 0)
const cop = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(
    isFinite(n) ? n : 0,
  )

export function evaluarOpinion(ajustes: AjusteCalc[], materialidad: number | null): EvaluacionOpinion {
  const monetarios = ajustes.filter((a) => a.efecto !== 'reclasificacion')
  const totalCorregido = monetarios.filter((a) => a.corregido).reduce((s, a) => s + abs(a.monto), 0)
  const noCorregidos = monetarios.filter((a) => !a.corregido)
  const totalNoCorregido = noCorregidos.reduce((s, a) => s + abs(a.monto), 0)
  const totalReclasificaciones = ajustes
    .filter((a) => a.efecto === 'reclasificacion')
    .reduce((s, a) => s + abs(a.monto), 0)

  const mat = materialidad != null && materialidad > 0 ? materialidad : null
  const umbralNegativa = mat !== null ? mat * FACTOR_OPINION_NEGATIVA : null
  const superaMaterialidad = mat !== null && totalNoCorregido >= mat

  let opinionSugerida: OpinionSugerida
  let razon: string
  if (mat === null) {
    opinionSugerida = 'sin_base'
    razon = 'Calcula y aprueba la materialidad para poder evaluar la opinión.'
  } else if (totalNoCorregido === 0) {
    opinionSugerida = 'favorable'
    razon = 'No hay incorrecciones sin corregir.'
  } else if (totalNoCorregido < mat) {
    opinionSugerida = 'favorable'
    razon = `Las incorrecciones no corregidas (${cop(totalNoCorregido)}) están por debajo de la materialidad (${cop(mat)}).`
  } else if (totalNoCorregido < (umbralNegativa as number)) {
    opinionSugerida = 'con_salvedades'
    razon = `Las incorrecciones no corregidas (${cop(totalNoCorregido)}) superan la materialidad (${cop(mat)}) pero no parecen generalizadas.`
  } else {
    opinionSugerida = 'negativa'
    razon = `Las incorrecciones no corregidas (${cop(totalNoCorregido)}) superan ampliamente la materialidad (≥ ${FACTOR_OPINION_NEGATIVA}×): posible efecto generalizado.`
  }

  return {
    totalNoCorregido,
    totalCorregido,
    totalReclasificaciones,
    numAjustes: ajustes.length,
    numNoCorregidos: noCorregidos.length,
    materialidad: mat,
    umbralNegativa,
    superaMaterialidad,
    opinionSugerida,
    razon,
  }
}
