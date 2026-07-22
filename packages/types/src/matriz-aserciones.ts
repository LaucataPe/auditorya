/**
 * Matriz de cobertura de aserciones (NIA 315/330) — función pura, sin IA.
 *
 * Vista transversal del encargo: cruza las áreas/ciclos en alcance (filas) con
 * las aserciones relevantes (columnas) y marca, por celda, si esa aserción tiene
 * una prueba que la atienda. Es la red de seguridad conceptual que evita concluir
 * sobre una cuenta habiendo probado solo algunas aserciones.
 *
 * Nivel básico: las aserciones relevantes de cada área y las que cubre cada papel
 * se derivan del catálogo `PROGRAMA_AUDITORIA` (por coincidencia de título). Los
 * papeles a la medida (sin match en el catálogo) no aportan cobertura derivable.
 */

import { PROGRAMA_AUDITORIA } from './prueba'
import type { AreaRiesgo, NivelRiesgo } from './riesgo'

export type EstadoCobertura = 'cubierta' | 'en_proceso' | 'descubierta'

/** Orden canónico de aserciones (NIA 315). Lo desconocido va al final. */
export const ASERCION_ORDEN = [
  'existencia', 'derechos', 'obligaciones', 'integridad',
  'valuación', 'exactitud', 'ocurrencia', 'corte', 'presentación', 'cumplimiento',
] as const

export const ASERCION_LABEL: Record<string, string> = {
  existencia: 'Existencia',
  derechos: 'Derechos',
  obligaciones: 'Obligaciones',
  integridad: 'Integridad',
  valuación: 'Valuación',
  exactitud: 'Exactitud',
  ocurrencia: 'Ocurrencia',
  corte: 'Corte',
  presentación: 'Presentación',
  cumplimiento: 'Cumplimiento',
}

/** Abreviatura para encabezados compactos de columna. */
export const ASERCION_ABBR: Record<string, string> = {
  existencia: 'Exist.',
  derechos: 'Derec.',
  obligaciones: 'Oblig.',
  integridad: 'Integr.',
  valuación: 'Valua.',
  exactitud: 'Exact.',
  ocurrencia: 'Ocurr.',
  corte: 'Corte',
  presentación: 'Present.',
  cumplimiento: 'Cumpl.',
}

export type PapelMatriz = { area: AreaRiesgo; titulo: string; estado: 'borrador' | 'en_revision' | 'aprobado' }
export type RiesgoMatriz = { area: AreaRiesgo; riesgoCombinado: NivelRiesgo }

export type FilaMatriz = {
  area: AreaRiesgo
  /** Nivel de riesgo más alto identificado en el área (para priorizar), o null. */
  nivelMax: NivelRiesgo | null
  /** Aserciones relevantes del área (según el catálogo). */
  relevantes: string[]
  /** Estado de cobertura por aserción relevante. */
  celdas: Record<string, EstadoCobertura>
  /** Aserciones relevantes sin ninguna prueba (huecos). */
  descubiertas: string[]
}

export type MatrizAserciones = {
  columnas: string[]
  filas: FilaMatriz[]
  resumen: { relevantes: number; cubiertas: number; enProceso: number; descubiertas: number }
}

const PESO_NIVEL: Record<NivelRiesgo, number> = { bajo: 1, medio: 2, alto: 3 }
const ORDEN_AREA: AreaRiesgo[] = [
  'efectivo', 'cartera', 'inventarios', 'propiedad_planta_equipo', 'proveedores',
  'nomina', 'impuestos', 'ingresos', 'gastos', 'patrimonio', 'otro',
]

function ordenarAserciones(set: Set<string>): string[] {
  const conocidas = ASERCION_ORDEN.filter((a) => set.has(a))
  const otras = [...set].filter((a) => !ASERCION_ORDEN.includes(a as (typeof ASERCION_ORDEN)[number])).sort()
  return [...conocidas, ...otras]
}

/** Aserciones relevantes de un área = unión de las aserciones de sus pruebas estándar. */
function asercionesRelevantes(area: AreaRiesgo): Set<string> {
  const set = new Set<string>()
  for (const p of PROGRAMA_AUDITORIA[area] ?? []) for (const a of p.aserciones) set.add(a)
  return set
}

/**
 * Construye la matriz de cobertura. Filas = áreas en alcance (con riesgo o papel).
 * Determinística y pura: mismas entradas → misma matriz.
 */
export function construirMatrizAserciones(
  papeles: PapelMatriz[],
  riesgos: RiesgoMatriz[],
): MatrizAserciones {
  // Áreas en alcance: las que tienen al menos un riesgo o un papel.
  const areas = new Set<AreaRiesgo>()
  for (const p of papeles) areas.add(p.area)
  for (const r of riesgos) areas.add(r.area)

  const filas: FilaMatriz[] = []
  const columnasSet = new Set<string>()
  let cubiertas = 0
  let enProceso = 0
  let descubiertas = 0
  let relevantesTotal = 0

  for (const area of ORDEN_AREA) {
    if (!areas.has(area)) continue

    const relevantesSet = asercionesRelevantes(area)
    const relevantes = ordenarAserciones(relevantesSet)
    if (relevantes.length === 0) continue

    const papelesArea = papeles.filter((p) => p.area === area)
    // Por aserción: ¿qué papeles la cubren y alguno está aprobado?
    const cubreAprobado = new Set<string>()
    const cubreAlguno = new Set<string>()
    for (const papel of papelesArea) {
      const prueba = (PROGRAMA_AUDITORIA[area] ?? []).find((p) => p.titulo === papel.titulo)
      if (!prueba) continue
      for (const a of prueba.aserciones) {
        cubreAlguno.add(a)
        if (papel.estado === 'aprobado') cubreAprobado.add(a)
      }
    }

    const celdas: Record<string, EstadoCobertura> = {}
    const descubiertasArea: string[] = []
    for (const a of relevantes) {
      let estado: EstadoCobertura
      if (cubreAprobado.has(a)) estado = 'cubierta'
      else if (cubreAlguno.has(a)) estado = 'en_proceso'
      else estado = 'descubierta'
      celdas[a] = estado
      columnasSet.add(a)
      relevantesTotal++
      if (estado === 'cubierta') cubiertas++
      else if (estado === 'en_proceso') enProceso++
      else descubiertasArea.push(a)
    }
    descubiertas += descubiertasArea.length

    const nivelesArea = riesgos.filter((r) => r.area === area).map((r) => r.riesgoCombinado)
    const nivelMax = nivelesArea.length
      ? nivelesArea.reduce((max, n) => (PESO_NIVEL[n] > PESO_NIVEL[max] ? n : max), 'bajo' as NivelRiesgo)
      : null

    filas.push({ area, nivelMax, relevantes, celdas, descubiertas: descubiertasArea })
  }

  // Prioriza filas por nivel de riesgo (alto primero); conserva el orden de área como desempate.
  filas.sort((a, b) => (PESO_NIVEL[b.nivelMax ?? 'bajo'] - PESO_NIVEL[a.nivelMax ?? 'bajo']))

  return {
    columnas: ordenarAserciones(columnasSet),
    filas,
    resumen: { relevantes: relevantesTotal, cubiertas, enProceso, descubiertas },
  }
}
