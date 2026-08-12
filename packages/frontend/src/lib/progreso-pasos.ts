import type { SignalsProgreso } from '@auditorya/types'

export type EstadoPaso = 'done' | 'partial' | 'none'

/** Deriva el avance de cada paso desde las señales crudas del backend (GET /auditorias/:id/progreso). */
export function estadoPaso(id: string, s: SignalsProgreso): EstadoPaso {
  switch (id) {
    case 'carta_encargo':
      if (!s.informes.carta_encargo) return 'none'
      return s.informes.carta_encargo === 'aprobado' ? 'done' : 'partial'
    case 'cierre':
      if (s.cierreCerrado) return 'done'
      return s.cierreChecklistCompleto ? 'partial' : 'none'
    case 'entendimiento': return s.entendimientoConfirmado ? 'done' : 'none'
    case 'balance': return s.balanceCargado ? 'done' : 'none'
    case 'riesgos':
      if (s.riesgosTotal === 0) return 'none'
      return s.riesgosAltosSinRespuesta === 0 ? 'done' : 'partial'
    case 'control_interno':
      if (s.cosoEvaluados === 0) return 'none'
      return s.cosoEvaluados >= 5 ? 'done' : 'partial'
    case 'materialidad':
      if (s.materialidadAprobada) return 'done'
      return s.materialidadCalculada ? 'partial' : 'none'
    case 'cronograma':
      if (s.cronogramaItems === 0 || s.cronogramaProgramados === 0) return 'none'
      return s.cronogramaProgramados === s.cronogramaItems ? 'done' : 'partial'
    case 'memo':
      if (!s.informes.memo_planeacion) return 'none'
      return s.informes.memo_planeacion === 'aprobado' ? 'done' : 'partial'
    case 'tareas':
      if (s.tareasTotal === 0) return 'none'
      return s.tareasCompletadas === s.tareasTotal ? 'done' : 'partial'
    case 'papeles':
      if (s.papelesTotal === 0) return 'none'
      return s.papelesAprobados === s.papelesTotal ? 'done' : 'partial'
    case 'pbc':
      if (s.pbcTotal === 0) return 'none'
      return s.pbcPendientes === 0 ? 'done' : 'partial'
    case 'informes':
      if (!s.informes.dictamen) return 'none'
      return s.informes.dictamen === 'aprobado' ? 'done' : 'partial'
    // Auditoría interna
    case 'alcance': return s.programasTotal > 0 ? 'done' : 'none'
    case 'programas':
      if (s.programasTotal === 0) return 'none'
      return s.programasCompletados === s.programasTotal ? 'done' : s.programasCompletados > 0 ? 'partial' : 'none'
    case 'hallazgos': return s.hallazgosTotal > 0 ? 'done' : 'none'
    case 'informe_ai':
      if (!s.informes.informe_ai) return 'none'
      return s.informes.informe_ai === 'aprobado' ? 'done' : 'partial'
    default: return 'none'
  }
}
