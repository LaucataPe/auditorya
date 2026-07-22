/**
 * Hallazgos de auditoría (revisoría fiscal) — comunicación y seguimiento (NIA 260/265).
 *
 * Un hallazgo nace en un papel de trabajo, se comunica al contador (una o varias
 * rondas mediante la carta de recomendaciones), y se corrige o no. Lo que queda
 * sin corregir bifurca según su tipo:
 *   - incorreccion no corregida → hoja de ajustes (NIA 450) → opinión.
 *   - deficiencia de control no corregida → carta de control interno (NIA 265).
 *
 * `resumirHallazgos` es una función pura para alimentar la guía por fases.
 */

import type { AreaRiesgo } from './riesgo'

export type TipoHallazgo = 'incorreccion' | 'deficiencia'
export type EstadoHallazgo = 'abierto' | 'comunicado' | 'corregido' | 'no_corregido'
export type SeveridadHallazgo = 'alta' | 'media' | 'baja'

export const TIPO_HALLAZGO_LABEL: Record<TipoHallazgo, string> = {
  incorreccion: 'Incorrección (afecta cifras)',
  deficiencia: 'Deficiencia de control',
}

export const ESTADO_HALLAZGO_LABEL: Record<EstadoHallazgo, string> = {
  abierto: 'Abierto',
  comunicado: 'Comunicado',
  corregido: 'Corregido',
  no_corregido: 'No corregido',
}

export const SEVERIDAD_HALLAZGO_LABEL: Record<SeveridadHallazgo, string> = {
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
}

export type Hallazgo = {
  id: string
  auditoriaId: string
  papelTrabajoId: string | null
  area: AreaRiesgo
  cuentaCodigo: string | null
  /** Condición: la situación encontrada (núcleo del hallazgo). */
  descripcion: string
  /** Criterio: lo que debería ser (norma, política, marco). */
  criterio: string | null
  /** Causa: por qué ocurrió. */
  causa: string | null
  /** Efecto: la consecuencia o impacto. */
  efecto: string | null
  recomendacion: string | null
  monto: string | null
  tipo: TipoHallazgo
  severidad: SeveridadHallazgo
  estado: EstadoHallazgo
  /** Ajuste creado a partir del hallazgo (si se escaló a la hoja de ajustes). */
  ajusteId: string | null
  comunicadoAt: string | null
  corregidoAt: string | null
  createdAt: string
}

/** Hallazgo con datos del papel de origen (vista consolidada / carta). */
export type HallazgoConPapel = Hallazgo & {
  papelTitulo: string | null
}

export type ResumenHallazgos = {
  total: number
  abiertos: number
  comunicados: number
  corregidos: number
  noCorregidos: number
  /** Aún pendientes de decisión del contador (abiertos + comunicados). */
  sinResolver: number
}

export function resumirHallazgos(hallazgos: { estado: EstadoHallazgo }[]): ResumenHallazgos {
  const cuenta = (e: EstadoHallazgo) => hallazgos.filter((h) => h.estado === e).length
  const abiertos = cuenta('abierto')
  const comunicados = cuenta('comunicado')
  return {
    total: hallazgos.length,
    abiertos,
    comunicados,
    corregidos: cuenta('corregido'),
    noCorregidos: cuenta('no_corregido'),
    sinResolver: abiertos + comunicados,
  }
}
