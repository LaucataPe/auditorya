/**
 * Chequeo de completitud de la ejecución — función pura, sin IA.
 *
 * Es la "red de seguridad" transversal: recorre riesgos y papeles y señala
 * huecos que el auditor podría pasar por alto.
 *  - riesgo_alto_sin_prueba: un riesgo de nivel alto sin ningún papel que lo atienda.
 *  - papel_sin_evidencia: un papel en revisión o aprobado sin evidencia adjunta.
 *
 * Alimenta tanto la guía por fases (conteos) como un panel de detalle.
 */

import type { AreaRiesgo, NivelRiesgo } from './riesgo'

export type TipoHueco = 'riesgo_alto_sin_prueba' | 'papel_sin_evidencia'
export type SeveridadHueco = 'alta' | 'media'

export type Hueco = {
  tipo: TipoHueco
  severidad: SeveridadHueco
  titulo: string
  detalle: string
  /** id del riesgo o papel involucrado (para navegar/actuar). */
  refId: string
  /** pestaña donde se resuelve. */
  tab: string
}

export type RiesgoCompletitud = {
  id: string
  area: AreaRiesgo
  descripcion: string
  nivelCombinado: NivelRiesgo
}

export type PapelCompletitud = {
  id: string
  titulo: string
  area: AreaRiesgo
  riesgoId: string | null
  estado: 'borrador' | 'en_revision' | 'aprobado'
  numEvidencias: number
}

export type ResultadoCompletitud = {
  huecos: Hueco[]
  resumen: {
    riesgosAltosSinPrueba: number
    papelesSinEvidencia: number
    total: number
  }
}

export function evaluarCompletitud(
  riesgos: RiesgoCompletitud[],
  papeles: PapelCompletitud[],
): ResultadoCompletitud {
  const huecos: Hueco[] = []

  // Riesgos altos que ningún papel atiende (papel.riesgoId apunta al riesgo).
  const riesgosConPrueba = new Set(papeles.map((p) => p.riesgoId).filter((x): x is string => !!x))
  for (const r of riesgos) {
    if (r.nivelCombinado === 'alto' && !riesgosConPrueba.has(r.id)) {
      huecos.push({
        tipo: 'riesgo_alto_sin_prueba',
        severidad: 'alta',
        titulo: 'Riesgo alto sin prueba',
        detalle: r.descripcion,
        refId: r.id,
        tab: 'riesgos',
      })
    }
  }

  // Papeles en revisión / aprobados sin ninguna evidencia adjunta.
  for (const p of papeles) {
    if ((p.estado === 'en_revision' || p.estado === 'aprobado') && p.numEvidencias === 0) {
      huecos.push({
        tipo: 'papel_sin_evidencia',
        severidad: 'media',
        titulo: 'Papel sin evidencia',
        detalle: p.titulo,
        refId: p.id,
        tab: 'papeles',
      })
    }
  }

  const riesgosAltosSinPrueba = huecos.filter((h) => h.tipo === 'riesgo_alto_sin_prueba').length
  const papelesSinEvidencia = huecos.filter((h) => h.tipo === 'papel_sin_evidencia').length

  return {
    huecos,
    resumen: { riesgosAltosSinPrueba, papelesSinEvidencia, total: huecos.length },
  }
}
