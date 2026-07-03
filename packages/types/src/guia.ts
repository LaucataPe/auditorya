import type { TipoServicio } from './auditoria'

/** Señales crudas de avance que produce el backend (GET /auditorias/:id/progreso). */
export type SignalsProgreso = {
  tipoServicio: TipoServicio
  estado: string
  entendimientoConfirmado: boolean
  balanceCargado: boolean
  // Revisoría fiscal
  riesgosTotal: number
  riesgosAltos: number
  riesgosAltosSinRespuesta: number
  materialidadCalculada: boolean
  materialidadAprobada: boolean
  papelesTotal: number
  papelesAprobados: number
  cosoEvaluados: number
  tareasTotal: number
  tareasCompletadas: number
  informes: Record<string, 'borrador' | 'aprobado'>
  // Auditoría interna
  programasTotal: number
  programasCompletados: number
  hallazgosTotal: number
}

export type GuiaItem = {
  label: string
  hecho: boolean
  requerido: boolean
  tab: string
  hint?: string
}

export type EstadoFase = 'completa' | 'actual' | 'pendiente'

export type GuiaFase = {
  id: string
  label: string
  items: GuiaItem[]
  estado: EstadoFase
  progreso: number // 0..1 sobre items requeridos
}

export type Guia = {
  fases: GuiaFase[]
  siguientePaso: { label: string; tab: string } | null
  progresoGlobal: number // 0..100
  completa: boolean
}

type FaseDef = { id: string; label: string; items: GuiaItem[] }

function fasesRevisoriaFiscal(s: SignalsProgreso): FaseDef[] {
  const inf = s.informes
  return [
    {
      id: 'planificacion',
      label: 'Planificación',
      items: [
        { label: 'Entendimiento del período confirmado', hecho: s.entendimientoConfirmado, requerido: true, tab: 'entendimiento', hint: 'Base para los riesgos' },
        { label: 'Balance de prueba cargado', hecho: s.balanceCargado, requerido: false, tab: 'balance', hint: 'Habilita los analíticos' },
        { label: 'Riesgos identificados', hecho: s.riesgosTotal > 0, requerido: true, tab: 'riesgos', hint: `${s.riesgosTotal} riesgos` },
        { label: 'Riesgos altos con respuesta planeada', hecho: s.riesgosAltosSinRespuesta === 0, requerido: false, tab: 'riesgos', hint: s.riesgosAltos > 0 ? `${s.riesgosAltos} altos` : undefined },
        { label: 'Materialidad calculada', hecho: s.materialidadCalculada, requerido: true, tab: 'materialidad' },
        { label: 'Materialidad aprobada por el socio', hecho: s.materialidadAprobada, requerido: true, tab: 'materialidad', hint: 'Desbloquea ejecución' },
      ],
    },
    {
      id: 'ejecucion',
      label: 'Ejecución',
      items: [
        { label: 'Papeles de trabajo creados', hecho: s.papelesTotal > 0, requerido: true, tab: 'papeles', hint: `${s.papelesTotal}` },
        { label: 'Control interno COSO evaluado', hecho: s.cosoEvaluados >= 5, requerido: true, tab: 'control_interno', hint: `${s.cosoEvaluados}/5` },
        { label: 'Papeles aprobados por el socio', hecho: s.papelesTotal > 0 && s.papelesAprobados === s.papelesTotal, requerido: true, tab: 'papeles', hint: `${s.papelesAprobados}/${s.papelesTotal}` },
        { label: 'Tareas completadas', hecho: s.tareasTotal === 0 ? true : s.tareasCompletadas === s.tareasTotal, requerido: false, tab: 'tareas', hint: s.tareasTotal > 0 ? `${s.tareasCompletadas}/${s.tareasTotal}` : undefined },
      ],
    },
    {
      id: 'informes',
      label: 'Informes',
      items: [
        { label: 'Dictamen generado', hecho: !!inf.dictamen, requerido: true, tab: 'informes' },
        { label: 'Dictamen aprobado por el socio', hecho: inf.dictamen === 'aprobado', requerido: true, tab: 'informes' },
        { label: 'Carta de control interno', hecho: !!inf.carta_control_interno, requerido: false, tab: 'informes' },
        { label: 'Carta de representaciones', hecho: !!inf.carta_representaciones, requerido: false, tab: 'informes' },
      ],
    },
  ]
}

function fasesAuditoriaInterna(s: SignalsProgreso): FaseDef[] {
  const inf = s.informes
  return [
    {
      id: 'planificacion',
      label: 'Planificación',
      items: [
        { label: 'Programas de trabajo definidos', hecho: s.programasTotal > 0, requerido: true, tab: 'alcance', hint: `${s.programasTotal} áreas` },
      ],
    },
    {
      id: 'ejecucion',
      label: 'Ejecución',
      items: [
        { label: 'Programas en ejecución o completados', hecho: s.programasCompletados > 0, requerido: true, tab: 'programas', hint: `${s.programasCompletados}/${s.programasTotal} completados` },
        { label: 'Hallazgos documentados', hecho: s.hallazgosTotal > 0, requerido: false, tab: 'hallazgos', hint: `${s.hallazgosTotal}` },
      ],
    },
    {
      id: 'informes',
      label: 'Informe',
      items: [
        { label: 'Informe generado', hecho: !!inf.informe_ai, requerido: true, tab: 'informe_ai' },
        { label: 'Informe aprobado', hecho: inf.informe_ai === 'aprobado', requerido: true, tab: 'informe_ai' },
      ],
    },
  ]
}

/** Construye la guía (fases + checklist + siguiente paso) a partir de las señales. */
export function construirGuia(s: SignalsProgreso): Guia {
  const defs = s.tipoServicio === 'auditoria_interna'
    ? fasesAuditoriaInterna(s)
    : fasesRevisoriaFiscal(s)

  const requeridos = (items: GuiaItem[]) => items.filter((i) => i.requerido)
  const faseCompleta = (items: GuiaItem[]) => {
    const req = requeridos(items)
    return req.length > 0 ? req.every((i) => i.hecho) : items.every((i) => i.hecho)
  }

  // Primera fase no completa → "actual"; anteriores "completa"; siguientes "pendiente".
  let idxActual = defs.findIndex((f) => !faseCompleta(f.items))
  if (idxActual === -1) idxActual = defs.length // todo completo

  const fases: GuiaFase[] = defs.map((f, i) => {
    const req = requeridos(f.items)
    const base = req.length > 0 ? req : f.items
    const hechos = base.filter((x) => x.hecho).length
    const estado: EstadoFase = i < idxActual ? 'completa' : i === idxActual ? 'actual' : 'pendiente'
    return { id: f.id, label: f.label, items: f.items, estado, progreso: base.length ? hechos / base.length : 1 }
  })

  // Siguiente paso = primer item requerido no hecho, en orden de fases.
  let siguientePaso: Guia['siguientePaso'] = null
  for (const f of defs) {
    const pend = f.items.find((i) => i.requerido && !i.hecho)
    if (pend) { siguientePaso = { label: pend.label, tab: pend.tab }; break }
  }

  const totReq = defs.flatMap((f) => requeridos(f.items))
  const progresoGlobal = totReq.length
    ? Math.round((totReq.filter((i) => i.hecho).length / totReq.length) * 100)
    : 0

  return { fases, siguientePaso, progresoGlobal, completa: siguientePaso === null }
}
