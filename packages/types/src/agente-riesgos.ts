/**
 * Corrida del procedimiento "Identificación de riesgos" (NIA 315) — lógica PURA y
 * determinista (0 tokens). Convierte lo que el encargo ya sabe en riesgos por área:
 *
 *   R-01  hallazgos del balance aprobados por una persona → un riesgo por área
 *   R-02  riesgo de control base desde la evaluación COSO (o medio si no hay)
 *   R-03  cambios del año reportados en el entendimiento → riesgos por área y control alto
 *   R-10  catálogo del sector, solo en áreas que no tienen riesgo todavía
 *
 * Devuelve BORRADORES de propuesta (tipo 'riesgo') con bitácora; el backend los
 * persiste y, al aprobarlos, escribe en la tabla `riesgos` de siempre.
 */
import type { CertezaPropuesta, ContenidoPropuesta, DatoPropuesta, SeveridadPropuesta } from './agente'
import type { PropuestaBorrador } from './agente-balance'
import { AREA_BASE_LABEL } from './areas'
import { PROGRAMA_AUDITORIA } from './prueba'
import { nivelCombinado, type NivelRiesgo, type RiesgoSugerido } from './riesgo'

// ─── Área por código PUC (siempre claves del catálogo base) ─────────────────

const AREA_POR_GRUPO: Record<string, string> = {
  '11': 'bancos', '12': 'inversiones', '13': 'cuentas_por_cobrar', '14': 'inventarios',
  '15': 'propiedad_planta_equipo', '16': 'intangibles', '17': 'diferidos', '18': 'otros_activos',
  '19': 'otros_activos', '21': 'obligaciones_financieras', '22': 'proveedores',
  '23': 'cuentas_por_pagar', '24': 'impuestos_por_pagar', '25': 'obligaciones_laborales',
  '26': 'otros_pasivos', '27': 'diferidos', '28': 'otros_pasivos',
  '41': 'ingresos_operacionales', '42': 'ingresos_no_operacionales',
  '51': 'gastos_de_administracion', '52': 'gastos_de_ventas', '53': 'gastos_no_operacionales',
  '54': 'impuestos_por_pagar', '61': 'costo_de_ventas', '62': 'costo_de_ventas',
}
const AREA_POR_CLASE: Record<string, string> = {
  '1': 'otros_activos', '2': 'otros_pasivos', '3': 'patrimonio', '4': 'ingresos_operacionales',
  '5': 'gastos_de_administracion', '6': 'costo_de_ventas', '7': 'costos_de_produccion',
}

/** Área/ciclo del catálogo base a la que pertenece una cuenta PUC. */
export function areaDesdeCodigoPuc(codigo: string): string {
  if (codigo.startsWith('1105')) return 'caja'
  const g = codigo.slice(0, 2)
  if (AREA_POR_GRUPO[g]) return AREA_POR_GRUPO[g]
  return AREA_POR_CLASE[codigo.charAt(0)] ?? 'otros_activos'
}

// ─── Entrada / salida ────────────────────────────────────────────────────────

export type HallazgoDecidido = {
  codigo: string | null
  titulo: string
  cuentaCodigo: string | null
  monto: number | null
  severidad: SeveridadPropuesta | null
  certeza: CertezaPropuesta | null
  reglas: string[]
  estado: 'aprobada' | 'ajustada'
}

export type EntradaCorridaRiesgos = {
  sector: string
  /** Hallazgos del balance aprobados (o ajustados) por una persona. */
  hallazgos: HallazgoDecidido[]
  /** Hallazgos del balance que siguen sin decisión (se informan, no se usan). */
  hallazgosPendientes: number
  /** Catálogo de riesgos típicos del sector (el backend lo carga de lib/ia). */
  catalogoSector: RiesgoSugerido[]
  entendimiento: { cambiosSignificativos: string | null; sinCambios: boolean; confirmado: boolean } | null
  coso: { componente: string; calificacion: 'efectivo' | 'con_deficiencias' | 'deficiente' }[]
  /** Riesgos que ya están en la matriz (de cualquier origen). */
  riesgosExistentes: { area: string; descripcion: string; origen: string }[]
  materialidad: { monto: number; aprobada: boolean } | null
  /** Riesgo de control por área desde el cuestionario de control interno (deficiencias por área). */
  controlPorArea?: Record<string, NivelRiesgo>
  /** Números R- ya usados en corridas anteriores del encargo. */
  numeracion?: { R?: number }
  /** Huellas (ver huellaRiesgo) ya decididas por una persona: no se vuelven a proponer. */
  huellasDecididas?: string[]
}

export type FuenteRiesgo = { tipo: 'hallazgo' | 'sector' | 'entendimiento'; codigos: string[] }

export type ContenidoRiesgo = {
  area: string
  riesgoInherente: NivelRiesgo
  riesgoControl: NivelRiesgo
  riesgoCombinado: NivelRiesgo
  respuestaPlaneada: string
  fuente: FuenteRiesgo
}

export type ResultadoCorridaRiesgos = {
  propuestas: PropuestaBorrador[]
  bitacora: PropuestaBorrador['bitacora']
  resumen: {
    riesgos: number
    porFuente: { hallazgo: number; sector: number; entendimiento: number }
    controlBase: NivelRiesgo
    controlPorEntendimiento: boolean
    areasCubiertas: string[]
    hallazgosUsados: number
    hallazgosPendientes: number
    hallazgosSinArea: number
    limitaciones: { regla: string; motivo: string }[]
  }
}

/** Identidad estable de un riesgo propuesto entre corridas: misma fuente y misma área. */
export function huellaRiesgo(r: { area: string; fuente: { tipo: string } }): string {
  return `riesgo|${r.fuente.tipo}|${r.area}`
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

const fmt = (n: number) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Math.round(n))
const nombreArea = (a: string) => AREA_BASE_LABEL[a] ?? a
const NIVEL_LABEL: Record<NivelRiesgo, string> = { alto: 'Alto', medio: 'Medio', bajo: 'Bajo' }
const SEV_A_NIVEL: Record<SeveridadPropuesta, NivelRiesgo> = { alta: 'alto', media: 'medio', baja: 'bajo' }
const NIVEL_A_SEV: Record<NivelRiesgo, SeveridadPropuesta> = { alto: 'alta', medio: 'media', bajo: 'baja' }
const PESO: Record<NivelRiesgo, number> = { bajo: 1, medio: 2, alto: 3 }
const mayor = (a: NivelRiesgo, b: NivelRiesgo): NivelRiesgo => (PESO[a] >= PESO[b] ? a : b)

/** Primera frase de una descripción, en minúscula inicial y sin punto final, para usar de título. */
function tituloCorto(descripcion: string): string {
  const frase = descripcion.split(/[.;]/)[0].trim()
  const corta = frase.length > 90 ? `${frase.slice(0, 87).trimEnd()}…` : frase
  return corta.charAt(0).toLowerCase() + corta.slice(1)
}

function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/** Respuesta planeada desde el programa estándar del área (NIA 330/500). */
function respuestaDesdePrograma(area: string, pista?: RegExp): string {
  const pruebas = PROGRAMA_AUDITORIA[area] ?? []
  if (pruebas.length === 0) return 'Diseñar pruebas sustantivas para el área según el riesgo identificado.'
  const elegida = (pista && pruebas.find((p) => pista.test(p.titulo))) ?? pruebas[0]
  const otras = pruebas.length - 1
  return `${elegida.titulo}: ${elegida.procedimiento}${otras > 0 ? ` (el programa del área tiene ${otras} prueba${otras === 1 ? '' : 's'} más).` : ''}`
}

/** Pista para elegir la prueba del programa según la regla que originó el hallazgo. */
const PISTA_POR_REGLA: Record<string, RegExp> = {
  'V-21': /conciliaci/i, 'V-22': /circulariz/i, 'V-23': /circulariz|confirmaci/i, 'V-24': /declaraci|impuesto/i,
  'V-25': /n[oó]mina|prestacion/i, 'V-26': /acta|patrimonio/i, 'V-40': /auxiliar|detalle|revisi/i,
  'V-74': /antig[uü]edad|deterioro/i, 'V-75': /toma f[ií]sica|inventario/i, 'V-80': /negocio en marcha|continuidad/i,
  'V-83': /confirmaci|obligaci/i, 'V-84': /negocio en marcha|continuidad/i,
}

// ─── Señales del entendimiento (R-03) ────────────────────────────────────────

type SenalEntendimiento = { clave: string; patron: RegExp; area: string | null; titulo: string; descripcion: string; inherente: NivelRiesgo }

const SENALES_ENTENDIMIENTO: SenalEntendimiento[] = [
  { clave: 'sistema', patron: /\b(software|sistema contable|erp|migraci|siigo|world office|helisa|sap\b|contador|contadora|outsourcing|firma contable|revisor)/, area: null, titulo: 'Cambio en el sistema o el equipo contable', descripcion: '', inherente: 'medio' },
  { clave: 'nomina', patron: /\b(nomina|personal|despid|liquidacion de|contratacion|empleados|trabajadores|planta de)/, area: 'obligaciones_laborales', titulo: 'Cambios en la planta de personal', descripcion: 'Reportaste cambios en el personal: riesgo en la causación de nómina, prestaciones sociales y liquidaciones del período.', inherente: 'medio' },
  { clave: 'inventario', patron: /\b(inventario|bodega|almacen|kardex|mercancia)/, area: 'inventarios', titulo: 'Cambios en inventarios reportados', descripcion: 'Reportaste cambios relacionados con inventarios: riesgo en existencia, valuación y corte de la mercancía.', inherente: 'alto' },
  { clave: 'financiacion', patron: /\b(credito|prestamo|leasing|deuda|financiaci|banco|refinanci|hipotec)/, area: 'obligaciones_financieras', titulo: 'Nueva financiación o cambios en la deuda', descripcion: 'Reportaste operaciones de financiación: riesgo en la integridad de las obligaciones, intereses causados y clasificación corriente / no corriente.', inherente: 'alto' },
  { clave: 'patrimonio', patron: /\b(fusion|escision|capital|socio|accionista|dividendo|reforma estatutaria|transformacion|liquidacion de la)/, area: 'patrimonio', titulo: 'Movimientos en el capital o los socios', descripcion: 'Reportaste cambios en el capital, los socios o la estructura societaria: riesgo en el registro patrimonial y su soporte legal (actas, escrituras).', inherente: 'alto' },
  { clave: 'cartera', patron: /\b(cliente|cartera|cobranza|recaudo|mora)/, area: 'cuentas_por_cobrar', titulo: 'Cambios en clientes o cartera', descripcion: 'Reportaste cambios en clientes o cartera: riesgo en la recuperabilidad y el deterioro de la cartera.', inherente: 'medio' },
  { clave: 'proveedores', patron: /\b(proveedor|importaci|compras)/, area: 'proveedores', titulo: 'Cambios en proveedores o compras', descripcion: 'Reportaste cambios en proveedores o compras: riesgo de integridad y corte en las cuentas por pagar.', inherente: 'medio' },
  { clave: 'activos', patron: /\b(activo fijo|activos fijos|maquinaria|sede|local|construccion|vehiculo|planta|equipo|inmueble|bodega nueva)/, area: 'propiedad_planta_equipo', titulo: 'Adquisición o cambios en activos fijos', descripcion: 'Reportaste movimientos en activos fijos: riesgo en la capitalización, depreciación y existencia de los activos.', inherente: 'medio' },
  { clave: 'ingresos', patron: /\b(ventas|ingreso|contrato|licitacion|linea de negocio|nuevo producto|sucursal|apertura|exportaci|tienda)/, area: 'ingresos_operacionales', titulo: 'Cambios en las fuentes de ingreso', descripcion: 'Reportaste cambios en ventas, contratos o líneas de negocio: riesgo en el reconocimiento y corte de los ingresos.', inherente: 'alto' },
  { clave: 'impuestos', patron: /\b(impuesto|dian|renta|iva\b|retencion|sancion|requerimiento|fiscaliz)/, area: 'impuestos_por_pagar', titulo: 'Situaciones tributarias reportadas', descripcion: 'Reportaste situaciones con impuestos o la DIAN: riesgo en la exactitud de las obligaciones tributarias y sus contingencias.', inherente: 'alto' },
  { clave: 'legal', patron: /\b(demanda|litigio|proceso judicial|abogado|tutela|conciliacion laboral|embargo)/, area: 'otros_pasivos', titulo: 'Contingencias legales reportadas', descripcion: 'Reportaste procesos o litigios: riesgo de provisiones no reconocidas o reveladas de forma insuficiente.', inherente: 'alto' },
]

// ─── Corrida ─────────────────────────────────────────────────────────────────

export function correrIdentificacionRiesgos(entrada: EntradaCorridaRiesgos): ResultadoCorridaRiesgos {
  const bit: PropuestaBorrador['bitacora'] = []
  const propuestas: PropuestaBorrador[] = []
  const limitaciones: { regla: string; motivo: string }[] = []

  // ── R-02 · riesgo de control base desde COSO ──
  let controlBase: NivelRiesgo = 'medio'
  if (entrada.coso.length > 0) {
    const calif = entrada.coso.map((c) => c.calificacion)
    controlBase = calif.includes('deficiente') ? 'alto' : calif.includes('con_deficiencias') ? 'medio' : 'bajo'
    bit.push({ tipo: 'lectura', texto: `Leí la evaluación de control interno (${entrada.coso.length} de 5 componentes COSO): riesgo de control base ${NIVEL_LABEL[controlBase].toUpperCase()}.`, referencia: { regla: 'R-02', norma: 'NIA 315' } })
  } else {
    bit.push({ tipo: 'lectura', texto: 'No hay evaluación de control interno todavía: uso riesgo de control MEDIO como base. Cuando evalúes COSO, vuelve a proponer y lo recalculo.', referencia: { regla: 'R-02', norma: 'NIA 315' } })
    limitaciones.push({ regla: 'R-02', motivo: 'Sin evaluación COSO el riesgo de control es medio por defecto.' })
  }

  // ── R-03 · señales del entendimiento ──
  const texto = entrada.entendimiento?.cambiosSignificativos ? normalizar(entrada.entendimiento.cambiosSignificativos) : ''
  const senales = texto ? SENALES_ENTENDIMIENTO.filter((s) => s.patron.test(texto)) : []
  const controlPorEntendimiento = senales.some((s) => s.area === null)
  let controlGlobal: NivelRiesgo = controlBase
  if (controlPorEntendimiento) {
    controlGlobal = 'alto'
    bit.push({ tipo: 'contraste', texto: 'En el entendimiento reportaste un cambio en el sistema o el equipo contable: subí el riesgo de control a ALTO para todos los riesgos de este año.', referencia: { regla: 'R-03', norma: 'NIA 315' } })
  }
  if (entrada.entendimiento && !entrada.entendimiento.confirmado && texto) {
    bit.push({ tipo: 'lectura', texto: 'El entendimiento del período aún no está confirmado; lo usé como está y lo digo en cada riesgo que salga de ahí.', referencia: { regla: 'R-03' } })
  }
  if (!texto) {
    bit.push({ tipo: 'lectura', texto: entrada.entendimiento?.sinCambios ? 'Entendimiento sin cambios del año: no salen riesgos de ahí.' : 'No hay cambios del año en el entendimiento: no salen riesgos de ahí.', referencia: { regla: 'R-03' } })
  } else {
    bit.push({ tipo: 'regla', texto: `Apliqué R-03 sobre los cambios del año reportados: ${senales.length} señal(es) reconocidas.`, referencia: { regla: 'R-03', norma: 'NIA 315' } })
  }

  // Riesgo de control de un área: el global del encargo, subido si el cuestionario COSO marcó deficiencias en esa área.
  const porArea = entrada.controlPorArea ?? {}
  const areasConDeficiencia = Object.keys(porArea)
  if (areasConDeficiencia.length) bit.push({ tipo: 'contraste', texto: `El cuestionario de control interno sube el riesgo de control en ${areasConDeficiencia.map((a) => `${nombreArea(a)} (${NIVEL_LABEL[porArea[a]].toLowerCase()})`).join(', ')}.`, referencia: { regla: 'R-02', norma: 'NIA 315' } })
  const controlDe = (area: string): NivelRiesgo => mayor(controlGlobal, porArea[area] ?? 'bajo')
  const motivoControl = (area: string) =>
    porArea[area] && PESO[porArea[area]] > PESO[controlGlobal] ? 'por las deficiencias de esta área en el cuestionario de control interno'
      : controlPorEntendimiento ? 'por el cambio de sistema o equipo contable del entendimiento'
        : entrada.coso.length ? 'desde la evaluación COSO' : 'valor por defecto sin evaluación COSO'
  const existentesPorArea = new Map<string, number>()
  for (const r of entrada.riesgosExistentes) existentesPorArea.set(r.area, (existentesPorArea.get(r.area) ?? 0) + 1)
  const propuestasPorArea = new Set<string>()
  const contexto = entrada.materialidad ? `materialidad ${entrada.materialidad.aprobada ? 'aprobada' : 'calculada'} ${fmt(entrada.materialidad.monto)}` : 'sin materialidad definida'

  // ── R-01 · hallazgos aprobados → un riesgo por área ──
  const conArea = entrada.hallazgos.filter((h) => h.cuentaCodigo)
  const sinArea = entrada.hallazgos.length - conArea.length
  bit.push({ tipo: 'lectura', texto: `Leí ${entrada.hallazgos.length} hallazgo(s) del balance aprobados${entrada.hallazgosPendientes > 0 ? ` (${entrada.hallazgosPendientes} siguen sin decisión y no los uso)` : ''}, con ${contexto}.`, referencia: { regla: 'R-01' } })
  if (sinArea > 0) bit.push({ tipo: 'clasificacion', texto: `${sinArea} hallazgo(s) de integridad del archivo no tienen cuenta: no se convierten en riesgo por área, quedan como hallazgos.`, referencia: { regla: 'R-01' } })
  const grupos = new Map<string, HallazgoDecidido[]>()
  for (const h of conArea) {
    const area = areaDesdeCodigoPuc(h.cuentaCodigo!)
    grupos.set(area, [...(grupos.get(area) ?? []), h])
  }
  bit.push({ tipo: 'regla', texto: `Apliqué R-01: agrupé los hallazgos por área del PUC → ${grupos.size} área(s) con riesgo.`, referencia: { regla: 'R-01', norma: 'NIA 315' } })

  for (const [area, hs] of grupos) {
    const control = controlDe(area)
    const ordenados = [...hs].sort((a, b) => Math.abs(b.monto ?? 0) - Math.abs(a.monto ?? 0))
    const inherente = ordenados.reduce<NivelRiesgo>((acc, h) => mayor(acc, SEV_A_NIVEL[h.severidad ?? 'media']), 'bajo')
    const combinado = nivelCombinado(inherente, control)
    const codigos = ordenados.map((h) => h.codigo).filter((c): c is string => !!c)
    const certeza: CertezaPropuesta = ordenados.some((h) => h.certeza === 'verificado') ? 'verificado' : 'requiere_evidencia'
    const reglaPista = ordenados.flatMap((h) => h.reglas).find((r) => PISTA_POR_REGLA[r])
    const respuesta = respuestaDesdePrograma(area, reglaPista ? PISTA_POR_REGLA[reglaPista] : undefined)
    const mayorMonto = ordenados.find((h) => h.monto != null)
    const lineas = ordenados.map((h) => `${h.codigo ? `${h.codigo} ` : ''}${h.titulo}${h.monto != null ? ` (${fmt(h.monto)})` : ''}`)
    const descripcion = `Del balance aprobado: ${lineas.join('; ')}. ${ordenados.length === 1 ? 'Este hallazgo indica' : 'Estos hallazgos indican'} riesgo de incorrección material en ${nombreArea(area).toLowerCase()}.`
    const datos: DatoPropuesta[] = [
      { etiqueta: 'Área', valor: nombreArea(area) },
      { etiqueta: 'Inherente', valor: NIVEL_LABEL[inherente] },
      { etiqueta: 'Control', valor: NIVEL_LABEL[control] },
      { etiqueta: 'Combinado', valor: NIVEL_LABEL[combinado] },
      { etiqueta: 'Viene de', valor: codigos.join(', ') || `${ordenados.length} hallazgo(s)` },
    ]
    if (mayorMonto?.monto != null) datos.push({ etiqueta: 'Monto mayor', valor: fmt(mayorMonto.monto) })
    const yaHay = existentesPorArea.get(area) ?? 0
    const bitac: PropuestaBorrador['bitacora'] = [
      { tipo: 'lectura', texto: `Tomé ${ordenados.length} hallazgo(s) aprobados con cuentas del área ${nombreArea(area)}: ${codigos.join(', ') || lineas[0]}.`, referencia: { regla: 'R-01' } },
      { tipo: 'clasificacion', texto: `Riesgo inherente ${NIVEL_LABEL[inherente].toUpperCase()}: la mayor severidad de los hallazgos (${ordenados.map((h) => h.severidad ?? 'media').join(', ')}).`, referencia: { regla: 'R-01', norma: 'NIA 315' } },
      { tipo: 'clasificacion', texto: `Riesgo de control ${NIVEL_LABEL[control].toUpperCase()}: ${motivoControl(area)}. Combinado ${NIVEL_LABEL[combinado].toUpperCase()}.`, referencia: { regla: 'R-02' } },
      { tipo: 'regla', texto: `Respuesta planeada desde el programa estándar del área (NIA 330): ${respuesta}`, referencia: { norma: 'NIA 330' } },
    ]
    if (yaHay > 0) bitac.push({ tipo: 'contraste', texto: `Ya hay ${yaHay} riesgo(s) en ${nombreArea(area)} en la matriz; este se suma porque viene de evidencia del balance.`, referencia: { regla: 'R-01' } })
    const riesgo: ContenidoRiesgo = { area, riesgoInherente: inherente, riesgoControl: control, riesgoCombinado: combinado, respuestaPlaneada: respuesta, fuente: { tipo: 'hallazgo', codigos } }
    propuestasPorArea.add(area)
    propuestas.push({
      clave: `R-01:${area}`, paso: 'riesgos', tipo: 'riesgo', codigo: null,
      titulo: `Riesgo en ${nombreArea(area)}: ${ordenados.length === 1 ? ordenados[0].titulo.replace(/^\d{4,}\s·\s/, '') : `${ordenados.length} hallazgos del balance`}`,
      cuentaCodigo: mayorMonto?.cuentaCodigo ?? ordenados[0].cuentaCodigo, monto: mayorMonto?.monto ?? null,
      severidad: NIVEL_A_SEV[combinado], certeza, reglas: ['R-01', ...codigos],
      datos, contenido: { descripcion, norma: 'NIA 315 · Identificación y valoración de los riesgos de incorrección material.', para: 'Al aprobarlo queda en la matriz de riesgos con su respuesta planeada; desde ahí generas las pruebas y los documentos a pedir.', recomendacion: respuesta, riesgo } as ContenidoPropuesta,
      desbloqueaClave: null, orden: 0, bitacora: bitac,
    })
  }

  // ── R-03 · riesgos por área desde el entendimiento ──
  for (const s of senales.filter((x) => x.area !== null)) {
    const area = s.area!
    const control = controlDe(area)
    if (propuestasPorArea.has(area)) {
      bit.push({ tipo: 'contraste', texto: `La señal "${s.titulo}" cae en ${nombreArea(area)}, que ya tiene riesgo desde el balance: la dejo anotada ahí.`, referencia: { regla: 'R-03' } })
      const p = propuestas.find((x) => x.clave === `R-01:${area}`)
      if (p) {
        p.contenido.descripcion = `${p.contenido.descripcion} Además, en el entendimiento reportaste: ${s.titulo.toLowerCase()}.`
        p.bitacora.push({ tipo: 'contraste', texto: `El entendimiento también apunta a esta área: ${s.titulo}.`, referencia: { regla: 'R-03' } })
      }
      continue
    }
    const combinado = nivelCombinado(s.inherente, control)
    const respuesta = respuestaDesdePrograma(area)
    const riesgo: ContenidoRiesgo = { area, riesgoInherente: s.inherente, riesgoControl: control, riesgoCombinado: combinado, respuestaPlaneada: respuesta, fuente: { tipo: 'entendimiento', codigos: [s.clave] } }
    propuestasPorArea.add(area)
    propuestas.push({
      clave: `R-03:${area}`, paso: 'riesgos', tipo: 'riesgo', codigo: null,
      titulo: `Riesgo en ${nombreArea(area)}: ${s.titulo.toLowerCase()}`,
      cuentaCodigo: null, monto: null, severidad: NIVEL_A_SEV[combinado], certeza: 'requiere_evidencia', reglas: ['R-03'],
      datos: [
        { etiqueta: 'Área', valor: nombreArea(area) }, { etiqueta: 'Inherente', valor: NIVEL_LABEL[s.inherente] },
        { etiqueta: 'Control', valor: NIVEL_LABEL[control] }, { etiqueta: 'Combinado', valor: NIVEL_LABEL[combinado] },
        { etiqueta: 'Viene de', valor: 'Entendimiento del período' },
      ],
      contenido: { descripcion: s.descripcion, norma: 'NIA 315 · Los cambios en la entidad y su entorno son fuente de riesgos de incorrección material.', para: 'Al aprobarlo queda en la matriz de riesgos; con evidencia del área lo confirmas o lo bajas.', recomendacion: respuesta, riesgo } as ContenidoPropuesta,
      desbloqueaClave: null, orden: 0,
      bitacora: [
        { tipo: 'lectura', texto: `En los cambios del año reconocí la señal "${s.titulo}".`, referencia: { regla: 'R-03', norma: 'NIA 315' } },
        { tipo: 'clasificacion', texto: `Riesgo inherente ${NIVEL_LABEL[s.inherente].toUpperCase()} (por el tipo de cambio), control ${NIVEL_LABEL[control].toUpperCase()}, combinado ${NIVEL_LABEL[combinado].toUpperCase()}. Requiere evidencia: viene de lo que reportaste, no del balance.`, referencia: { regla: 'R-03' } },
        { tipo: 'regla', texto: `Respuesta planeada desde el programa estándar del área (NIA 330): ${respuesta}`, referencia: { norma: 'NIA 330' } },
      ],
    })
  }

  // ── R-10 · catálogo del sector en áreas sin riesgo ──
  const TOPE_SECTOR = 8
  let sectorEmitidos = 0, sectorSaltados = 0
  for (const r of entrada.catalogoSector) {
    if (sectorEmitidos >= TOPE_SECTOR) break
    if (propuestasPorArea.has(r.area) || (existentesPorArea.get(r.area) ?? 0) > 0) { sectorSaltados++; continue }
    const control = controlDe(r.area)
    const combinado = nivelCombinado(r.riesgoInherente, control)
    const riesgo: ContenidoRiesgo = { area: r.area, riesgoInherente: r.riesgoInherente, riesgoControl: control, riesgoCombinado: combinado, respuestaPlaneada: r.respuestaPlaneada, fuente: { tipo: 'sector', codigos: [] } }
    propuestasPorArea.add(r.area)
    sectorEmitidos++
    propuestas.push({
      clave: `R-10:${r.area}`, paso: 'riesgos', tipo: 'riesgo', codigo: null,
      titulo: `Riesgo en ${nombreArea(r.area)}: ${tituloCorto(r.descripcion)}`,
      cuentaCodigo: null, monto: null, severidad: NIVEL_A_SEV[combinado], certeza: 'requiere_evidencia', reglas: ['R-10'],
      datos: [
        { etiqueta: 'Área', valor: nombreArea(r.area) }, { etiqueta: 'Inherente', valor: NIVEL_LABEL[r.riesgoInherente] },
        { etiqueta: 'Control', valor: NIVEL_LABEL[control] }, { etiqueta: 'Combinado', valor: NIVEL_LABEL[combinado] },
        { etiqueta: 'Viene de', valor: `Sector ${entrada.sector}` },
      ],
      contenido: { descripcion: r.descripcion, norma: 'NIA 315 · El sector y la naturaleza de la entidad orientan los riesgos esperados.', para: 'Al aprobarlo queda en la matriz de riesgos. Si el balance no muestra nada en esta área, puedes descartarlo con motivo.', recomendacion: r.respuestaPlaneada, riesgo } as ContenidoPropuesta,
      desbloqueaClave: null, orden: 0,
      bitacora: [
        { tipo: 'lectura', texto: `Del catálogo del sector ${entrada.sector}: ${nombreArea(r.area)} no tiene riesgo en la matriz ni salió del balance.`, referencia: { regla: 'R-10' } },
        { tipo: 'clasificacion', texto: `Riesgo inherente ${NIVEL_LABEL[r.riesgoInherente].toUpperCase()} (catálogo), control ${NIVEL_LABEL[control].toUpperCase()}, combinado ${NIVEL_LABEL[combinado].toUpperCase()}. Requiere evidencia: no viene del balance.`, referencia: { regla: 'R-10', norma: 'NIA 315' } },
      ],
    })
  }
  bit.push({ tipo: 'regla', texto: `Apliqué R-10 (catálogo del sector ${entrada.sector}): ${sectorEmitidos} riesgo(s) en áreas sin cobertura${sectorSaltados > 0 ? `, ${sectorSaltados} saltados porque el área ya tiene riesgo` : ''}.`, referencia: { regla: 'R-10' } })

  // ── Ya decididas por una persona en corridas anteriores: no se repiten ──
  const huellas = new Set(entrada.huellasDecididas ?? [])
  let yaDecididas = 0
  if (huellas.size > 0) {
    for (let i = propuestas.length - 1; i >= 0; i--) {
      const r = (propuestas[i].contenido as { riesgo?: ContenidoRiesgo }).riesgo
      if (r && huellas.has(huellaRiesgo(r))) { propuestas.splice(i, 1); yaDecididas++ }
    }
    if (yaDecididas > 0) bit.push({ tipo: 'contraste', texto: `Omití ${yaDecididas} riesgo(s) que ya decidiste en propuestas anteriores; se conservan con tu decisión.`, referencia: {} })
  }

  // ── Orden y códigos (la numeración continúa la del encargo) ──
  const peso = (s: SeveridadPropuesta | null) => (s === 'alta' ? 0 : s === 'media' ? 1 : 2)
  const pesoFuente = (p: PropuestaBorrador) => { const f = (p.contenido as { riesgo?: ContenidoRiesgo }).riesgo?.fuente.tipo; return f === 'hallazgo' ? 0 : f === 'entendimiento' ? 1 : 2 }
  propuestas.sort((a, b) => peso(a.severidad) - peso(b.severidad) || pesoFuente(a) - pesoFuente(b) || Math.abs(b.monto ?? 0) - Math.abs(a.monto ?? 0))
  const base = entrada.numeracion?.R ?? 0
  propuestas.forEach((p, i) => { p.codigo = `R-${String(base + i + 1).padStart(2, '0')}`; p.orden = i })

  const porFuente = { hallazgo: 0, sector: 0, entendimiento: 0 }
  for (const p of propuestas) { const f = (p.contenido as { riesgo?: ContenidoRiesgo }).riesgo?.fuente.tipo; if (f) porFuente[f]++ }
  bit.push({ tipo: 'clasificacion', texto: `Resultado: ${propuestas.length} riesgo(s) propuestos (${porFuente.hallazgo} del balance, ${porFuente.entendimiento} del entendimiento, ${porFuente.sector} del sector).`, referencia: {} })

  return {
    propuestas, bitacora: bit,
    resumen: {
      riesgos: propuestas.length, porFuente, controlBase, controlPorEntendimiento,
      areasCubiertas: [...propuestasPorArea], hallazgosUsados: conArea.length, hallazgosPendientes: entrada.hallazgosPendientes,
      hallazgosSinArea: sinArea, limitaciones,
    },
  }
}
