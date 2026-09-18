/**
 * Procedimiento "Evaluación del control interno" (COSO · NIA 315) — lógica PURA y
 * determinista (0 tokens). Un cuestionario corto en lenguaje de pyme, un puntaje por
 * componente, señales del balance y del entendimiento que acotan la calificación, y
 * cada "no" convertido en una deficiencia (base de la carta NIA 265) y en riesgo de
 * control del área que toca. Devuelve BORRADORES de propuesta tipo 'juicio' con
 * destino 'coso'; al aprobar se escribe en `controles_coso` como siempre.
 */
import type { CertezaPropuesta, ContenidoPropuesta, DatoPropuesta } from './agente'
import type { PropuestaBorrador } from './agente-balance'
import { AREA_BASE_LABEL } from './areas'
import type { CalificacionCoso, ComponenteCoso } from './coso'
import { COMPONENTES_COSO } from './coso'
import type { NivelRiesgo } from './riesgo'

export type RespuestaCoso = 'si' | 'parcial' | 'no' | 'no_aplica' | 'no_se'

export type PreguntaCoso = {
  id: string
  componente: ComponenteCoso
  texto: string
  /** Por qué importa, en una línea. */
  ayuda: string
  /** Áreas del catálogo base cuyo riesgo de control sube si la respuesta es "no". */
  areas: string[]
  /** 2 = control clave (un "no" deja el componente al menos "con deficiencias"). */
  peso: 1 | 2
  /** Texto de la deficiencia cuando la respuesta es "no" (base de la carta NIA 265). */
  deficiencia: string
  /** Documento que confirma la respuesta cuando el auditor marca "no sé todavía". */
  documento: string | null
}

export const COMPONENTE_COSO_LABEL: Record<ComponenteCoso, string> = {
  ambiente_control: 'Ambiente de control',
  evaluacion_riesgos: 'Evaluación de riesgos',
  actividades_control: 'Actividades de control',
  informacion_comunicacion: 'Información y comunicación',
  supervision: 'Supervisión',
}

export const CALIFICACION_COSO_LABEL: Record<CalificacionCoso, string> = {
  efectivo: 'Efectivo',
  con_deficiencias: 'Con deficiencias',
  deficiente: 'Deficiente',
}

export const RESPUESTA_COSO_LABEL: Record<RespuestaCoso, string> = {
  si: 'Sí', parcial: 'En parte', no: 'No', no_aplica: 'No aplica', no_se: 'No sé todavía',
}

/** Cuestionario pyme: 15 preguntas, tres por componente salvo actividades de control. */
export const CUESTIONARIO_COSO_PYME: PreguntaCoso[] = [
  // Ambiente de control
  { id: 'AC-1', componente: 'ambiente_control', texto: '¿Las funciones de cada cargo están definidas por escrito (organigrama, manual de funciones o contratos con funciones)?', ayuda: 'Sin funciones claras nadie es responsable de un control.', areas: [], peso: 1, deficiencia: 'No existen funciones definidas por escrito para los cargos con responsabilidad financiera.', documento: 'Organigrama o manual de funciones' },
  { id: 'AC-2', componente: 'ambiente_control', texto: '¿La gerencia o la junta revisa los estados financieros por lo menos cada trimestre y deja constancia?', ayuda: 'Es el "tono desde arriba": si nadie mira las cifras, los errores no se detectan.', areas: [], peso: 2, deficiencia: 'La gerencia o la junta no revisa periódicamente los estados financieros.', documento: 'Actas de junta o de socios del período' },
  { id: 'AC-3', componente: 'ambiente_control', texto: '¿Hay un código de conducta o política de ética conocida por el personal, y un canal para reportar irregularidades?', ayuda: 'NIA 240: el ambiente ético reduce el riesgo de fraude.', areas: [], peso: 1, deficiencia: 'No hay política de ética ni canal para reportar irregularidades.', documento: 'Código de ética o reglamento interno de trabajo' },
  // Evaluación de riesgos
  { id: 'ER-1', componente: 'evaluacion_riesgos', texto: '¿Existe presupuesto anual y se compara contra lo ejecutado por lo menos cada trimestre?', ayuda: 'El presupuesto es la forma más simple en que una pyme detecta desviaciones.', areas: ['ingresos_operacionales', 'gastos_de_administracion'], peso: 1, deficiencia: 'No hay presupuesto o no se compara contra la ejecución real.', documento: 'Presupuesto del período y su seguimiento' },
  { id: 'ER-2', componente: 'evaluacion_riesgos', texto: '¿La gerencia identifica y discute los riesgos del negocio (flujo de caja, cartera, dependencia de clientes o proveedores)?', ayuda: 'NIA 315 exige entender cómo la entidad identifica sus propios riesgos.', areas: [], peso: 1, deficiencia: 'La gerencia no tiene un proceso para identificar y responder a los riesgos del negocio.', documento: null },
  { id: 'ER-3', componente: 'evaluacion_riesgos', texto: '¿Los cambios importantes del año (sistema, personal clave, líneas de negocio) se planearon y se les hizo seguimiento?', ayuda: 'Los cambios sin control son la fuente más común de errores contables.', areas: [], peso: 1, deficiencia: 'Los cambios significativos del período no tuvieron planeación ni seguimiento formal.', documento: null },
  // Actividades de control
  { id: 'ACT-1', componente: 'actividades_control', texto: '¿Los pagos los autoriza una persona distinta de quien los registra en contabilidad?', ayuda: 'Segregación de funciones: la base para prevenir pagos indebidos.', areas: ['bancos', 'proveedores', 'cuentas_por_pagar'], peso: 2, deficiencia: 'La misma persona autoriza y registra los pagos (falta segregación de funciones).', documento: 'Política de autorización de pagos o firmas autorizadas en bancos' },
  { id: 'ACT-2', componente: 'actividades_control', texto: '¿Se hacen conciliaciones bancarias todos los meses y las revisa alguien distinto de quien las prepara?', ayuda: 'La conciliación mensual es el control clave sobre el efectivo.', areas: ['bancos'], peso: 2, deficiencia: 'Las conciliaciones bancarias no se preparan mensualmente o no tienen revisión independiente.', documento: 'Conciliaciones bancarias de tres meses del período' },
  { id: 'ACT-3', componente: 'actividades_control', texto: '¿Quien maneja el efectivo o la caja menor es distinto de quien lo registra en contabilidad?', ayuda: 'Custodia y registro en la misma mano es el esquema clásico de faltantes.', areas: ['caja'], peso: 2, deficiencia: 'La custodia del efectivo y su registro contable están en la misma persona.', documento: 'Reglamento de caja menor y arqueos del período' },
  { id: 'ACT-4', componente: 'actividades_control', texto: '¿Se hace conteo físico de inventarios o de activos fijos al menos una vez al año y se ajustan los registros?', ayuda: 'Sin conteo, el saldo en libros es solo una estimación.', areas: ['inventarios', 'propiedad_planta_equipo'], peso: 2, deficiencia: 'No se realizan conteos físicos periódicos de inventarios o activos fijos.', documento: 'Acta del último conteo físico' },
  { id: 'ACT-5', componente: 'actividades_control', texto: '¿Toda venta se factura electrónicamente y las compras tienen orden o aprobación previa antes de pagarse?', ayuda: 'Integridad de ingresos y de compras: nada entra ni sale sin soporte aprobado.', areas: ['ingresos_operacionales', 'cuentas_por_cobrar', 'proveedores', 'costo_de_ventas'], peso: 2, deficiencia: 'Existen ventas sin facturar o compras pagadas sin aprobación previa.', documento: 'Muestra de facturas de venta y órdenes de compra del período' },
  { id: 'ACT-6', componente: 'actividades_control', texto: '¿La nómina la aprueba alguien distinto de quien la prepara y se cruza contra la planilla de seguridad social (PILA)?', ayuda: 'Nómina y PILA descuadradas son un hallazgo recurrente de la UGPP.', areas: ['obligaciones_laborales', 'provisiones_nomina'], peso: 1, deficiencia: 'La nómina no tiene aprobación independiente ni cruce con la PILA.', documento: 'Nómina y PILA de dos meses del período' },
  // Información y comunicación
  { id: 'IC-1', componente: 'informacion_comunicacion', texto: '¿El software contable tiene usuarios individuales con permisos por rol y copias de seguridad periódicas?', ayuda: 'Un solo usuario compartido borra la trazabilidad de quién hizo qué.', areas: [], peso: 1, deficiencia: 'El sistema contable no tiene usuarios individuales con permisos ni copias de seguridad verificadas.', documento: 'Listado de usuarios del software contable' },
  { id: 'IC-2', componente: 'informacion_comunicacion', texto: '¿Los cierres contables se hacen cada mes y la gerencia recibe los estados financieros dentro del mes siguiente?', ayuda: 'Información tardía no sirve para decidir ni para detectar errores a tiempo.', areas: [], peso: 2, deficiencia: 'Los cierres contables no son mensuales o la información llega tarde a la gerencia.', documento: 'Estados financieros intermedios entregados a la gerencia' },
  // Supervisión
  { id: 'SUP-1', componente: 'supervision', texto: '¿Alguien (revisor fiscal, auditoría interna o la gerencia) verifica periódicamente que los controles se cumplan y hace seguimiento a las recomendaciones anteriores?', ayuda: 'Un control que nadie supervisa deja de operar con el tiempo.', areas: [], peso: 2, deficiencia: 'No hay supervisión periódica del funcionamiento de los controles ni seguimiento a recomendaciones anteriores.', documento: 'Informes o cartas de control interno del año anterior y su seguimiento' },
]

export const PREGUNTAS_POR_COMPONENTE: Record<ComponenteCoso, PreguntaCoso[]> = Object.fromEntries(
  COMPONENTES_COSO.map((c) => [c, CUESTIONARIO_COSO_PYME.filter((p) => p.componente === c)]),
) as Record<ComponenteCoso, PreguntaCoso[]>

// ─── Entrada / salida ────────────────────────────────────────────────────────

export type RespuestaCosoRegistrada = { pregunta: string; respuesta: RespuestaCoso; nota: string | null }

export type EntradaCorridaControlInterno = {
  respuestas: RespuestaCosoRegistrada[]
  /** Hallazgos del balance aprobados por una persona (para acotar la calificación). */
  hallazgos: { codigo: string | null; titulo: string; cuentaCodigo: string | null; reglas: string[]; severidad: 'alta' | 'media' | 'baja' | null }[]
  entendimiento: { cambiosSignificativos: string | null; confirmado: boolean } | null
  /** Calificaciones que ya están guardadas en controles_coso (se informan; la propuesta no las pisa hasta aprobar). */
  existentes: { componente: ComponenteCoso; calificacion: CalificacionCoso }[]
  /** Respuestas del año anterior en la misma empresa (memoria). */
  memoria?: RespuestaCosoRegistrada[] | null
  numeracion?: { C?: number; D?: number }
  huellasDecididas?: string[]
}

export type DeficienciaCoso = { pregunta: string; componente: ComponenteCoso; texto: string; areas: string[]; grado: 'no' | 'parcial' }

export type ContenidoCoso = {
  componente: ComponenteCoso
  calificacion: CalificacionCoso
  puntaje: number | null
  respondidas: number
  total: number
  respuestas: { pregunta: string; texto: string; respuesta: RespuestaCoso; nota: string | null }[]
  deficiencias: DeficienciaCoso[]
  senales: string[]
  observaciones: string
}

export type ResultadoCorridaControlInterno = {
  propuestas: PropuestaBorrador[]
  bitacora: PropuestaBorrador['bitacora']
  deficiencias: DeficienciaCoso[]
  controlPorArea: Record<string, NivelRiesgo>
  resumen: {
    componentes: number
    respondidas: number
    total: number
    sinResponder: number
    deficiencias: number
    porCalificacion: Record<CalificacionCoso, number>
    limitaciones: { regla: string; motivo: string }[]
  }
}

export function huellaCoso(componente: ComponenteCoso): string {
  return `coso|${componente}`
}

// ─── Puntaje ─────────────────────────────────────────────────────────────────

const PUNTOS: Record<RespuestaCoso, number | null> = { si: 1, parcial: 0.5, no: 0, no_aplica: null, no_se: null }
const ORDEN_CALIF: CalificacionCoso[] = ['efectivo', 'con_deficiencias', 'deficiente']
const peor = (a: CalificacionCoso, b: CalificacionCoso): CalificacionCoso => (ORDEN_CALIF.indexOf(a) >= ORDEN_CALIF.indexOf(b) ? a : b)

/** Calificación de un componente desde sus respuestas. Null si no hay ninguna respuesta puntuable. */
export function calificarComponente(preguntas: PreguntaCoso[], respuestas: Map<string, RespuestaCoso>): { calificacion: CalificacionCoso; puntaje: number } | null {
  let puntos = 0, max = 0, claveEnNo = false
  for (const p of preguntas) {
    const r = respuestas.get(p.id)
    if (!r) continue
    const v = PUNTOS[r]
    if (v === null) continue
    puntos += v * p.peso; max += p.peso
    if (p.peso === 2 && r === 'no') claveEnNo = true
  }
  if (max === 0) return null
  const puntaje = puntos / max
  let calificacion: CalificacionCoso = puntaje >= 0.8 ? 'efectivo' : puntaje >= 0.5 ? 'con_deficiencias' : 'deficiente'
  if (claveEnNo) calificacion = peor(calificacion, 'con_deficiencias')
  return { calificacion, puntaje: Math.round(puntaje * 100) }
}

/**
 * Riesgo de control por área a partir de las respuestas: "no" en una pregunta clave → alto;
 * "no" en una pregunta simple o "en parte" en una clave → medio. Solo áreas con alguna señal.
 */
export function riesgoControlPorArea(respuestas: RespuestaCosoRegistrada[]): Record<string, NivelRiesgo> {
  const out: Record<string, NivelRiesgo> = {}
  const sube = (area: string, nivel: NivelRiesgo) => {
    const actual = out[area]
    if (!actual || (nivel === 'alto' && actual !== 'alto')) out[area] = nivel
  }
  const porId = new Map(CUESTIONARIO_COSO_PYME.map((p) => [p.id, p]))
  for (const r of respuestas) {
    const p = porId.get(r.pregunta)
    if (!p || p.areas.length === 0) continue
    if (r.respuesta === 'no') for (const a of p.areas) sube(a, p.peso === 2 ? 'alto' : 'medio')
    else if (r.respuesta === 'parcial' && p.peso === 2) for (const a of p.areas) sube(a, 'medio')
  }
  return out
}

// ─── Señales del balance y del entendimiento por componente ─────────────────

type Senal = { componente: ComponenteCoso; tope: CalificacionCoso; texto: string; regla: string }

function senalesDe(entrada: EntradaCorridaControlInterno): Senal[] {
  const out: Senal[] = []
  const conRegla = (pref: string[]) => entrada.hallazgos.filter((h) => h.reglas.some((r) => pref.includes(r)))
  const integridad = conRegla(['V-01', 'V-02', 'V-03', 'V-04', 'V-05'])
  if (integridad.length) out.push({ componente: 'informacion_comunicacion', tope: 'con_deficiencias', regla: 'CI-01', texto: `El balance tiene ${integridad.length} problema(s) de integridad aprobados (${integridad.map((h) => h.codigo).filter(Boolean).join(', ')}): el sistema no entrega información confiable.` })
  const efectivo = conRegla(['V-21'])
  if (efectivo.length) out.push({ componente: 'actividades_control', tope: 'con_deficiencias', regla: 'CI-02', texto: `Efectivo con saldo crédito aprobado (${efectivo.map((h) => h.codigo).filter(Boolean).join(', ')}): las conciliaciones bancarias no están operando.` })
  const bolsa = conRegla(['V-40'])
  if (bolsa.length) out.push({ componente: 'actividades_control', tope: 'con_deficiencias', regla: 'CI-03', texto: `Cuentas bolsa por encima de la materialidad de desempeño (${bolsa.map((h) => h.codigo).filter(Boolean).join(', ')}): hay registros sin clasificar ni revisar.` })
  const naturalezaAlta = entrada.hallazgos.filter((h) => h.reglas.includes('V-20') && h.severidad === 'alta')
  if (naturalezaAlta.length >= 3) out.push({ componente: 'supervision', tope: 'con_deficiencias', regla: 'CI-04', texto: `${naturalezaAlta.length} saldos contrarios a la naturaleza de severidad alta aprobados: nadie revisa los saldos antes del cierre.` })
  const cartera = conRegla(['V-74'])
  if (cartera.length) out.push({ componente: 'supervision', tope: 'con_deficiencias', regla: 'CI-05', texto: 'La cartera crece más que las ventas (V-74): la gestión de cobro no se supervisa.' })
  const texto = entrada.entendimiento?.cambiosSignificativos?.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') ?? ''
  if (/\b(software|sistema contable|erp|migraci|siigo|world office|helisa|sap\b)/.test(texto)) out.push({ componente: 'informacion_comunicacion', tope: 'con_deficiencias', regla: 'CI-06', texto: 'En el entendimiento reportaste cambio de software contable este año: el sistema nuevo aún no tiene historial de confiabilidad.' })
  if (/\b(contador|contadora|outsourcing|firma contable|revisor)/.test(texto)) out.push({ componente: 'ambiente_control', tope: 'con_deficiencias', regla: 'CI-07', texto: 'En el entendimiento reportaste cambio de contador o de firma contable: el conocimiento del negocio se reinicia.' })
  return out
}

// ─── Corrida ─────────────────────────────────────────────────────────────────

const fmtPct = (n: number) => `${n} %`

export function correrEvaluacionControlInterno(entrada: EntradaCorridaControlInterno): ResultadoCorridaControlInterno {
  const bit: PropuestaBorrador['bitacora'] = []
  const propuestas: PropuestaBorrador[] = []
  const limitaciones: { regla: string; motivo: string }[] = []
  const respMap = new Map(entrada.respuestas.map((r) => [r.pregunta, r.respuesta]))
  const notaMap = new Map(entrada.respuestas.map((r) => [r.pregunta, r.nota]))
  const total = CUESTIONARIO_COSO_PYME.length
  const respondidas = CUESTIONARIO_COSO_PYME.filter((p) => respMap.has(p.id)).length
  const sinSaber = CUESTIONARIO_COSO_PYME.filter((p) => respMap.get(p.id) === 'no_se')

  bit.push({ tipo: 'lectura', texto: `Leí el cuestionario de control interno: ${respondidas} de ${total} preguntas respondidas${sinSaber.length ? `, ${sinSaber.length} marcadas "no sé todavía"` : ''}.`, referencia: { norma: 'NIA 315' } })
  if (entrada.memoria?.length) bit.push({ tipo: 'lectura', texto: `Tenía ${entrada.memoria.length} respuestas del año anterior de esta empresa como punto de partida.`, referencia: {} })
  const senales = senalesDe(entrada)
  bit.push({ tipo: 'regla', texto: `Apliqué CI-01 a CI-07 sobre ${entrada.hallazgos.length} hallazgo(s) aprobados del balance y el entendimiento: ${senales.length} señal(es) que acotan la calificación.`, referencia: { regla: 'CI-01..CI-07', norma: 'NIA 315 · NIA 240' } })
  if (respondidas === 0 && senales.length === 0) limitaciones.push({ regla: 'CI', motivo: 'Sin respuestas ni señales no hay nada que calificar.' })

  const deficiencias: DeficienciaCoso[] = []
  const porCalificacion: Record<CalificacionCoso, number> = { efectivo: 0, con_deficiencias: 0, deficiente: 0 }
  const huellas = new Set(entrada.huellasDecididas ?? [])
  let omitidas = 0

  for (const componente of COMPONENTES_COSO) {
    const preguntas = PREGUNTAS_POR_COMPONENTE[componente]
    const puntaje = calificarComponente(preguntas, respMap)
    const senalesComp = senales.filter((s) => s.componente === componente)
    if (!puntaje && senalesComp.length === 0) {
      bit.push({ tipo: 'clasificacion', texto: `${COMPONENTE_COSO_LABEL[componente]}: sin respuestas ni señales, no propongo calificación.`, referencia: {} })
      continue
    }
    let calificacion: CalificacionCoso = puntaje?.calificacion ?? 'con_deficiencias'
    const acotadaPor: Senal[] = []
    for (const s of senalesComp) { const nueva = peor(calificacion, s.tope); if (nueva !== calificacion || !puntaje) acotadaPor.push(s); calificacion = nueva }
    if (huellas.has(huellaCoso(componente))) { omitidas++; continue }

    const respuestasComp = preguntas.filter((p) => respMap.has(p.id)).map((p) => ({ pregunta: p.id, texto: p.texto, respuesta: respMap.get(p.id)!, nota: notaMap.get(p.id) ?? null }))
    const defs: DeficienciaCoso[] = preguntas
      .filter((p) => respMap.get(p.id) === 'no' || respMap.get(p.id) === 'parcial')
      .map((p) => ({ pregunta: p.id, componente, texto: respMap.get(p.id) === 'no' ? p.deficiencia : `${p.deficiencia.replace(/\.$/, '')} (parcialmente).`, areas: p.areas, grado: respMap.get(p.id) as 'no' | 'parcial' }))
    deficiencias.push(...defs)
    const pendientes = preguntas.filter((p) => respMap.get(p.id) === 'no_se')
    const certeza: CertezaPropuesta = pendientes.length > 0 ? 'no_verificable' : senalesComp.length > 0 ? 'verificado' : 'requiere_evidencia'
    porCalificacion[calificacion]++

    const partes: string[] = []
    if (puntaje) partes.push(`Puntaje del cuestionario ${fmtPct(puntaje.puntaje)} (${respuestasComp.length} de ${preguntas.length} preguntas).`)
    if (defs.length) partes.push(`Deficiencias: ${defs.map((d) => d.texto.replace(/\.$/, '')).join('; ')}.`)
    if (senalesComp.length) partes.push(`Señales del encargo: ${senalesComp.map((s) => s.texto.replace(/\.$/, '')).join('; ')}.`)
    if (pendientes.length) partes.push(`Pendiente de confirmar: ${pendientes.map((p) => p.id).join(', ')}.`)
    const observaciones = partes.join(' ') || 'Sin deficiencias identificadas en el cuestionario.'
    const existente = entrada.existentes.find((e) => e.componente === componente)

    const datos: DatoPropuesta[] = [
      { etiqueta: 'Componente', valor: COMPONENTE_COSO_LABEL[componente] },
      { etiqueta: 'Calificación', valor: CALIFICACION_COSO_LABEL[calificacion] },
      { etiqueta: 'Cuestionario', valor: puntaje ? `${fmtPct(puntaje.puntaje)} · ${respuestasComp.length}/${preguntas.length}` : 'sin respuestas' },
      { etiqueta: 'Deficiencias', valor: String(defs.length) },
    ]
    if (senalesComp.length) datos.push({ etiqueta: 'Señales del balance', valor: String(senalesComp.length) })
    if (existente) datos.push({ etiqueta: 'Guardada hoy', valor: CALIFICACION_COSO_LABEL[existente.calificacion] })

    const bitac: PropuestaBorrador['bitacora'] = []
    if (puntaje) bitac.push({ tipo: 'regla', texto: `Puntaje ${fmtPct(puntaje.puntaje)}: ${respuestasComp.map((r) => `${r.pregunta} ${RESPUESTA_COSO_LABEL[r.respuesta].toLowerCase()}`).join(', ')}. Con 80 % o más es efectivo, con 50 % o más es con deficiencias, y un "no" en un control clave deja el componente al menos con deficiencias.`, referencia: { regla: 'CI-10', norma: 'COSO 2013' } })
    else bitac.push({ tipo: 'lectura', texto: 'No hay respuestas puntuables para este componente; la calificación sale solo de las señales del encargo.', referencia: { regla: 'CI-10' } })
    for (const s of acotadaPor) bitac.push({ tipo: 'contraste', texto: `${s.texto} Calificación acotada a "${CALIFICACION_COSO_LABEL[s.tope].toLowerCase()}" como máximo.`, referencia: { regla: s.regla } })
    for (const s of senalesComp.filter((x) => !acotadaPor.includes(x))) bitac.push({ tipo: 'contraste', texto: `${s.texto} Coincide con la calificación del cuestionario.`, referencia: { regla: s.regla } })
    for (const d of defs) bitac.push({ tipo: 'clasificacion', texto: `Deficiencia (${d.pregunta}): ${d.texto}${d.areas.length ? ` Sube el riesgo de control en ${d.areas.map((a) => AREA_BASE_LABEL[a] ?? a).join(', ')}.` : ''}`, referencia: { regla: d.pregunta, norma: 'NIA 265' } })
    if (existente && existente.calificacion !== calificacion) bitac.push({ tipo: 'contraste', texto: `Hoy está guardada como "${CALIFICACION_COSO_LABEL[existente.calificacion].toLowerCase()}"; si apruebas, la reemplazo.`, referencia: {} })
    bitac.push({ tipo: 'clasificacion', texto: `Calificación ${CALIFICACION_COSO_LABEL[calificacion].toUpperCase()} · certeza ${certeza === 'verificado' ? 'verificada por el balance' : certeza === 'requiere_evidencia' ? 'basada en tus respuestas, requiere evidencia' : 'con preguntas sin responder'}.`, referencia: { norma: 'NIA 315' } })

    const coso: ContenidoCoso = { componente, calificacion, puntaje: puntaje?.puntaje ?? null, respondidas: respuestasComp.length, total: preguntas.length, respuestas: respuestasComp, deficiencias: defs, senales: senalesComp.map((s) => s.texto), observaciones }
    const opciones = [calificacion, ...ORDEN_CALIF.filter((c) => c !== calificacion)].map((c) => ({ clave: c, label: c === calificacion ? `Confirmar: ${CALIFICACION_COSO_LABEL[c].toLowerCase()}` : CALIFICACION_COSO_LABEL[c] }))
    propuestas.push({
      clave: `C:${componente}`, paso: 'control_interno', tipo: 'juicio', codigo: null,
      titulo: `${COMPONENTE_COSO_LABEL[componente]}: ${CALIFICACION_COSO_LABEL[calificacion].toLowerCase()}`,
      cuentaCodigo: null, monto: null, severidad: calificacion === 'deficiente' ? 'alta' : calificacion === 'con_deficiencias' ? 'media' : 'baja', certeza,
      reglas: ['CI-10', ...acotadaPor.map((s) => s.regla)], datos,
      contenido: { descripcion: observaciones, norma: 'NIA 315 · COSO 2013. El auditor obtiene un entendimiento del control interno relevante para la auditoría; la calificación es su juicio.', para: 'Al confirmar queda en la evaluación COSO con estas observaciones; las deficiencias alimentan la carta de control interno (NIA 265) y el riesgo de control de cada área.', opciones, destino: 'coso', coso } as ContenidoPropuesta,
      desbloqueaClave: null, orden: COMPONENTES_COSO.indexOf(componente), bitacora: bitac,
    })

    // Documento para confirmar lo que marcaste "no sé todavía".
    for (const p of pendientes.filter((x) => x.documento)) {
      propuestas.push({
        clave: `D:${p.id}`, paso: 'pbc', tipo: 'documento', codigo: null, titulo: p.documento!,
        cuentaCodigo: null, monto: null, severidad: null, certeza: null, reglas: [p.id],
        datos: [{ etiqueta: 'Pregunta', valor: p.id }, { etiqueta: 'Componente', valor: COMPONENTE_COSO_LABEL[componente] }],
        contenido: { descripcion: p.texto, para: '' } as ContenidoPropuesta,
        desbloqueaClave: `C:${componente}`, orden: 0,
        bitacora: [{ tipo: 'solicitud', texto: `Marcaste "no sé todavía" en ${p.id}; con "${p.documento}" lo confirmo.`, referencia: { regla: p.id } }],
      })
    }
  }
  if (omitidas > 0) bit.push({ tipo: 'contraste', texto: `Omití ${omitidas} componente(s) que ya decidiste en propuestas anteriores; se conservan con tu decisión.`, referencia: {} })

  // Códigos: C- para componentes, D- para documentos (continúan la numeración del encargo).
  const numC = entrada.numeracion?.C ?? 0, numD = entrada.numeracion?.D ?? 0
  const comps = propuestas.filter((p) => p.tipo === 'juicio')
  comps.forEach((p, i) => { p.codigo = `C-${String(numC + i + 1).padStart(2, '0')}` })
  const docs = propuestas.filter((p) => p.tipo === 'documento')
  docs.forEach((d, i) => {
    d.codigo = `D-${String(numD + i + 1).padStart(2, '0')}`
    const c = comps.find((x) => x.clave === d.desbloqueaClave)
    d.orden = c ? c.orden : 999
    d.contenido.para = c ? `Desbloquea ${c.codigo} · ${c.titulo}` : d.contenido.para
  })

  const controlPorArea = riesgoControlPorArea(entrada.respuestas)
  bit.push({ tipo: 'clasificacion', texto: `Resultado: ${comps.length} componente(s) calificados (${porCalificacion.efectivo} efectivos, ${porCalificacion.con_deficiencias} con deficiencias, ${porCalificacion.deficiente} deficientes), ${deficiencias.length} deficiencia(s) para la carta de control interno, riesgo de control elevado en ${Object.keys(controlPorArea).length} área(s).`, referencia: { norma: 'NIA 265' } })

  return {
    propuestas, bitacora: bit, deficiencias, controlPorArea,
    resumen: { componentes: comps.length, respondidas, total, sinResponder: total - respondidas, deficiencias: deficiencias.length, porCalificacion, limitaciones },
  }
}
