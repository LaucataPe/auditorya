/**
 * Procedimiento I · Revisión agéntica de la declaración de IVA — lógica PURA y
 * determinista (0 tokens). Implementa las reglas I-xx de
 * docs/agente/procedimiento-iva-v1.md sobre tres insumos ya leídos: el
 * formulario (columna Declarado), el auxiliar contable (columna Según libros,
 * vía agente-iva-libros) y el reporte de documentos electrónicos de la DIAN
 * (parse-reporte-dian). Devuelve BORRADORES de propuesta con bitácora, en la
 * misma forma que el procedimiento de balances, para que el mismo motor de
 * decisiones los persista o el frontend los muestre.
 *
 * Criterio de la usuaria: se audita toda diferencia por encima del redondeo del
 * formulario; la severidad por proporción solo ordena las tarjetas.
 */
import { CIFRAS_CATALOGO, resolverCifras, type CifrasRevision, type Periodicidad, type ProgramaRevision } from './tributario'
import type { MapeoLibrosIva, RenglonLibrosIva } from './agente-iva-libros'
import type { ResumenDianPeriodo } from './parse-reporte-dian'
import type { CertezaPropuesta, ContenidoPropuesta, CorridaAgente, DatoPropuesta, EstadoPropuesta, LineaBitacora, PropuestaAgente, SeveridadPropuesta, TipoPropuesta } from './agente'
import { huellaPropuesta, type PropuestaBorrador } from './agente-balance'
import { cerrarCedula, nuevaCedula, tablaDeCedula, type CedulaBorrador, type CedulaProcedimiento, type ColumnaCedula, type ConclusionesCedulas, type EstadoFilaCedula, type FilaCedula } from './cedulas-tributarias'

// ─── Persistencia de la corrida (etapa 2) ────────────────────────────────────
// El navegador lee los archivos (SheetJS) y manda al backend los resúmenes ya
// calculados; el backend corre el motor, guarda corrida + propuestas + bitácora
// en las tablas del agente (corridas_agente, propuestas_agente, bitacora_agente
// con revision_tributaria_id) y devuelve el estado. Así el análisis queda como
// registro de la revisión y no depende de volver a cargar los archivos.

/** Con qué archivos se corrió el análisis (queda en `resultado.insumos` de la corrida). */
export type InsumosCorridaIva = {
  auxiliares: { adjuntoId: string | null; nombre: string; archivo: string; enPeriodo: number; cuentas: string[]; cierres: number }[]
  dian: { adjuntoId: string | null; archivo: string; documentos: number } | null
  /** Etiqueta de la revisión anterior usada para el arrastre, si existía en la plataforma. */
  anterior: string | null
}

/**
 * Memoria de la empresa para el IVA (memoria_empresa_agente, clave MEMORIA_IVA_CLAVE):
 * lo que la firma ya decidió una vez y no debe volver a preguntarse.
 */
export type MemoriaIvaEmpresa = {
  /** Subcuenta del auxiliar → renglón de libros (o 'ignorar' si no es IVA del período). */
  mapeo2408: Record<string, RenglonLibrosIva | 'ignorar'>
  /** Retención en la fuente: subcuenta de 2365/2367 → concepto del 350 (ver agente-retefuente-libros). */
  mapeo2365?: Record<string, string>
  /** ReteICA: subcuenta de 2368 → municipio (o 'ignorar'); `obligacion:<id>` → municipio de esa declaración. */
  mapeo2368?: Record<string, string>
  /** ICA: cuenta de ingresos → 'gravado' | 'no-sujeto' | 'exento' (ver agente-ica-libros). */
  mapeoIca?: Record<string, string>
  /** Tipos de comprobante del asiento de cierre del IVA (p. ej. ['CI']). */
  tiposDocCierre: string[]
  actualizadoAt?: string | null
}
export const MEMORIA_IVA_CLAVE = 'iva_memoria'
export const MEMORIA_IVA_VACIA: MemoriaIvaEmpresa = { mapeo2408: {}, tiposDocCierre: [] }

/** Cuerpo del POST /tributario/revisiones/:id/agente/corridas. */
export type EntradaCorridaIvaCliente = {
  /** Tipos de comprobante de los cierres detectados en esta lectura: se aprenden en la memoria de la empresa. */
  tiposDocCierre?: string[]
  /** Según libros ya mapeado en el navegador, según el tipo de la obligación. */
  libros: MapeoLibrosIva | import('./agente-retefuente-libros').MapeoLibrosRetefuente | import('./agente-reteica-libros').MapeoLibrosReteica | import('./agente-ica-libros').MapeoLibrosIca | null
  dian: { resumen: ResumenDianPeriodo; nitReporte: string | null; advertencias: string[] } | null
  insumos: InsumosCorridaIva
  /** Bitácora de la lectura hecha en el navegador (archivos leídos, cierres excluidos). Se guarda antes de la del motor. */
  lecturas: string[]
}

/** Lo que queda en `corridas_agente.resultado` para una corrida de IVA. */
export type ResultadoPersistidoIva = ResultadoCorridaIva['resumen'] & {
  insumos: InsumosCorridaIva
  /** Huella de las cifras declaradas al correr: si cambian, el análisis está desactualizado. */
  declaradoHuella: string
  /** Mapeo de la memoria con el que se corrió: si la memoria cambia, hay que volver a analizar. */
  memoriaMapeo?: Record<string, string>
  propuestas: number
  cedulas?: CedulaProcedimiento[]
}

/** Estado del agente de una revisión: última corrida y sus propuestas (GET …/agente). */
export type EstadoAgenteIva = {
  corrida: (CorridaAgente & { resultado: ResultadoPersistidoIva | null }) | null
  propuestas: PropuestaAgente[]
  /** Conclusiones del auditor por cédula (revisiones_tributarias.conclusiones_cedulas). */
  conclusiones: ConclusionesCedulas
  memoria: MemoriaIvaEmpresa
}

/** Resumen del trabajo del agente que viaja con el detalle de la revisión y se sella en el snapshot (constancia). */
export type ResumenAgenteRevision = {
  corridaId: string
  terminadaAt: string | null
  iniciadaNombre: string | null
  reglasEjecutadas: string[]
  limitaciones: { regla: string; motivo: string }[]
  verificados: string[]
  insumos: InsumosCorridaIva
  /** Bitácora de la corrida (solo textos), en orden. */
  bitacora: string[]
  /** Cédulas por procedimiento y la conclusión del auditor sobre cada una. */
  cedulas: CedulaProcedimiento[]
  conclusiones: ConclusionesCedulas
  propuestas: {
    id: string
    codigo: string | null
    tipo: TipoPropuesta
    titulo: string
    monto: number | null
    severidad: SeveridadPropuesta | null
    certeza: CertezaPropuesta | null
    reglas: string[]
    estado: EstadoPropuesta
    decididaNombre: string | null
    decididaAt: string | null
    motivoDecision: string | null
    entidadDestino: string | null
    entidadDestinoId: string | null
  }[]
}

/** id del hallazgo → código de la propuesta del agente que lo originó. */
export function hallazgosDelAgente(agente: ResumenAgenteRevision | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of agente?.propuestas ?? []) {
    if (p.entidadDestino === 'hallazgo_tributario' && p.entidadDestinoId) out[p.entidadDestinoId] = p.codigo ?? 'agente'
  }
  return out
}

/** Huella estable de la columna Declarado (para saber si el análisis guardado sigue vigente). */
export function huellaDeclarado(cifras: CifrasRevision): string {
  return Object.entries(cifras)
    .filter(([, v]) => typeof v.declarado === 'number')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, v]) => `${id}=${v.declarado}`)
    .join('|')
}

export type EntradaCorridaIva = {
  periodo: { desde: string; hasta: string; etiqueta: string; periodicidad: Periodicidad }
  /** Cifras guardadas en la revisión: declarado (borrador) y libros ya persistidos. */
  cifras: CifrasRevision
  /** Según libros recién mapeado desde el auxiliar; si viene, pisa el `libros` guardado. */
  libros?: MapeoLibrosIva | null
  dian?: {
    resumen: ResumenDianPeriodo
    /** NIT que domina el reporte (parseReporteDian.nitEmpresa). */
    nitReporte: string | null
    /** NIT de la empresa en la plataforma, para verificar pertenencia (P-06). */
    nitEmpresa: string | null
    advertencias: string[]
  } | null
  /** Revisión de IVA del período anterior, para el arrastre del saldo a favor (I-30, I-31). */
  anterior?: { etiqueta: string; cifras: CifrasRevision } | null
  /** Advertencias de aplicarLecturaFormulario (totales del formulario que no cuadran). */
  advertenciasLectura?: string[]
  /** Materialidad de desempeño del último encargo: solo referencia en la bitácora, nunca filtra. */
  materialidadReferencia?: { desempeno: number; encargo: string } | null
  numeracion?: { H?: number; J?: number; A?: number; D?: number }
  huellasDecididas?: string[]
  /** Reglas que el auditor dejó fuera del programa (ver reglasOmitidas): no producen propuestas. */
  omitirReglas?: string[]
  /** Archivos leídos en el navegador, para la cédula de lectura de libros. */
  fuentes?: { nombre: string; archivo: string; registros: number; cuentas: number }[]
  /** Fechas registradas en la revisión, para la oportunidad de la presentación. */
  fechaVencimiento?: string | null
  fechaPresentacion?: string | null
}

// ─── Programa del agente: los pasos que el auditor decide antes de analizar ──
// Cada paso agrupa reglas y dice qué insumo necesita. La revisión guiada lo
// presenta como programa sugerido; lo que el auditor desactive no corre, y lo
// que agregue por su cuenta queda como paso propio (manual) del programa.

export type InsumoIva = 'borrador' | 'auxiliar' | 'dian' | 'anterior'

export const INSUMO_IVA_LABEL: Record<InsumoIva, { nombre: string; para: string }> = {
  borrador: { nombre: 'Borrador del Formulario 300', para: 'Llena la columna Declarado. Sin él no hay nada que verificar.' },
  auxiliar: { nombre: 'Auxiliar contable o balance de prueba del período (2408, ingresos y 1355)', para: 'Llena Según libros y permite conciliar el formulario con la contabilidad. Sirve el libro auxiliar por movimientos o el balance de prueba del período, tal como lo exporta el programa contable.' },
  dian: { nombre: 'Reporte de documentos electrónicos de la DIAN', para: 'Cruza ventas, notas crédito y compras con lo facturado electrónicamente.' },
  anterior: { nombre: 'Declaración de IVA del período anterior', para: 'Verifica el arrastre del saldo a favor (casilla 84). Si la revisión anterior está en la plataforma, no hace falta.' },
}

export type PasoAgenteIva = {
  id: string
  texto: string
  detalle: string
  reglas: string[]
  insumos: InsumoIva[]
  checklistItem: string | null
}

export const PROGRAMA_AGENTE_IVA: PasoAgenteIva[] = [
  { id: 'formulario', texto: 'Verificar la aritmética del formulario y las tarifas aplicadas sobre las bases declaradas', detalle: 'Totales del 300 contra sus componentes; IVA generado al 19 % y al 5 % contra su base; descontables frente a las compras gravadas; devoluciones desproporcionadas.', reglas: ['I-01', 'I-02', 'I-03', 'I-04', 'I-05', 'I-06'], insumos: ['borrador'], checklistItem: 'iva-generado' },
  { id: 'ingresos-libros', texto: 'Conciliar los ingresos y las devoluciones declarados contra la contabilidad del período', detalle: 'Clase 4 y 4175 del auxiliar contra las casillas 27 a 43.', reglas: ['I-10', 'I-11', 'I-16'], insumos: ['borrador', 'auxiliar'], checklistItem: 'ingresos-conciliados' },
  { id: 'generado-libros', texto: 'Conciliar el IVA generado contra los créditos de 2408', detalle: 'Subcuentas de IVA generado por tarifa contra las casillas 58 a 67.', reglas: ['I-12'], insumos: ['borrador', 'auxiliar'], checklistItem: 'iva-generado' },
  { id: 'descontable-libros', texto: 'Conciliar el IVA descontable contra los débitos de 2408', detalle: 'Descontable por compras y servicios contra las casillas 68 a 81; devoluciones de descontable en la 66.', reglas: ['I-13', 'I-15'], insumos: ['borrador', 'auxiliar'], checklistItem: 'iva-descontable' },
  { id: 'retenciones-libros', texto: 'Cruzar las retenciones de IVA que le practicaron contra 1355', detalle: 'Casilla 85 contra el anticipo de impuestos por retención de IVA.', reglas: ['I-14'], insumos: ['borrador', 'auxiliar'], checklistItem: 'saldos-favor' },
  { id: 'dian-ventas', texto: 'Cruzar las ventas, las notas crédito y el IVA generado con la facturación electrónica', detalle: 'Facturas de venta y notas crédito del reporte DIAN contra las casillas 41, 42, 67 y 79.', reglas: ['I-20', 'I-21', 'I-24'], insumos: ['borrador', 'dian'], checklistItem: 'iva-generado' },
  { id: 'dian-compras', texto: 'Verificar que el descontable tenga soporte en facturas electrónicas recibidas', detalle: 'IVA de las facturas recibidas en la ventana del art. 496 contra la casilla 81; documentos soporte contra compras no gravadas; oportunidad de recepción.', reglas: ['I-22', 'I-23', 'I-25', 'I-26'], insumos: ['borrador', 'dian'], checklistItem: 'iva-descontable' },
  { id: 'saldo-favor', texto: 'Verificar el arrastre del saldo a favor del período anterior', detalle: 'Casilla 84 contra la casilla 89 de la declaración anterior.', reglas: ['I-30', 'I-31'], insumos: ['borrador', 'anterior'], checklistItem: 'saldos-favor' },
  { id: 'proporcionalidad', texto: 'Evaluar si aplica la proporcionalidad del IVA descontable', detalle: 'Operaciones excluidas o no gravadas con descontables y sin ajuste en la casilla 80 (art. 490 ET).', reglas: ['I-32'], insumos: ['borrador'], checklistItem: 'proporcionalidad' },
  { id: 'oportunidad', texto: 'Confirmar periodicidad, presentación, pago y sanciones', detalle: 'Vencimiento, presentación registrada y sanciones liquidadas en la casilla 87.', reglas: ['I-33', 'I-34', 'I-35'], insumos: ['borrador'], checklistItem: 'presentacion-pago' },
]

/** Programa sugerido para una revisión de IVA: todos los pasos del agente activos, sin pasos propios. */
export function programaSugeridoIva(): ProgramaRevision {
  return { pasos: PROGRAMA_AGENTE_IVA.map((p) => ({ id: p.id, texto: p.texto, origen: 'agente' as const, activo: true })) }
}

/** Reglas que no deben correr porque su paso del agente está desactivado. */
export function reglasOmitidas(programa: ProgramaRevision | null): string[] {
  if (!programa) return []
  // Solo lo que el auditor desactivó: un paso agregado al programa después de que él lo guardó corre por defecto.
  const inactivos = new Set(programa.pasos.filter((p) => p.origen === 'agente' && !p.activo).map((p) => p.id))
  return PROGRAMA_AGENTE_IVA.filter((p) => inactivos.has(p.id)).flatMap((p) => p.reglas)
}

/** Insumos que piden los pasos activos del programa, en orden de prioridad. */
export function insumosDelPrograma(programa: ProgramaRevision | null): InsumoIva[] {
  const activos = new Set((programa ?? programaSugeridoIva()).pasos.filter((p) => p.origen === 'agente' && p.activo).map((p) => p.id))
  const set = new Set<InsumoIva>()
  for (const p of PROGRAMA_AGENTE_IVA) if (activos.has(p.id)) for (const i of p.insumos) set.add(i)
  return (['borrador', 'auxiliar', 'dian', 'anterior'] as InsumoIva[]).filter((i) => set.has(i))
}

export type ResultadoCorridaIva = {
  propuestas: PropuestaBorrador[]
  bitacora: LineaBorrador[]
  /** Valores de libros que el frontend/backend deben persistir en `cifras` (solo si vino `libros`). */
  cifrasLibros: Record<string, { libros: number }>
  /** Cédulas por procedimiento con todo lo comparado. */
  cedulas?: CedulaProcedimiento[]
  resumen: {
    reglasEjecutadas: string[]
    limitaciones: { regla: string; motivo: string }[]
    /** Ítems del checklist que quedaron verificados sin diferencias (propuestos como juicio). */
    verificados: string[]
    hallazgos: number
    juicios: number
    ambiguedades: number
    documentos: number
  }
}

type LineaBorrador = Omit<LineaBitacora, 'numero' | 'actor'> & { actor?: 'agente' }

export const UMBRALES_IVA = {
  /** El formulario va en miles: cada componente puede aportar hasta $500 de redondeo. */
  redondeoPorComponente: 500,
  /** Tolerancia mínima de cualquier cruce (libros, DIAN). */
  toleranciaMinima: 1000,
  /** Cruce libros / DIAN: 0,1 % del renglón. */
  toleranciaCrucePct: 0.1,
  /** Tarifa aplicada sobre la base declarada: 0,5 % del IVA esperado y mínimo $2.000. */
  toleranciaTarifaPct: 0.5,
  toleranciaTarifaMin: 2000,
  altoPct: 5,
  medioPct: 1,
  devolucionesPct: 5,
  tarifas: { general: 0.19, reducida: 0.05 },
} as const

const fmt = (n: number) => `$${Math.round(Math.abs(n)).toLocaleString('es-CO')}`
const pct = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString('es-CO')} %`
const ORDEN_SEV: SeveridadPropuesta[] = ['baja', 'media', 'alta']
const subir = (s: SeveridadPropuesta): SeveridadPropuesta => ORDEN_SEV[Math.min(ORDEN_SEV.indexOf(s) + 1, 2)]

type Escalador = 'omision' | 'descontable_sin_soporte' | 'saldo_favor'

/** §4: severidad por proporción de la base; nada queda por debajo de "baja". */
export function severidadPorProporcion(
  diferencia: number,
  base: number,
  escaladores: Escalador[] = [],
): { severidad: SeveridadPropuesta; proporcion: number; explicacion: string } {
  const proporcion = base === 0 ? 100 : (Math.abs(diferencia) / Math.abs(base)) * 100
  let severidad: SeveridadPropuesta = proporcion >= UMBRALES_IVA.altoPct ? 'alta' : proporcion >= UMBRALES_IVA.medioPct ? 'media' : 'baja'
  const base_ = `${pct(proporcion)} del renglón`
  const aplicados: Escalador[] = []
  for (const e of escaladores) {
    if (severidad !== 'alta') {
      severidad = subir(severidad)
      aplicados.push(e)
    }
  }
  return { severidad, proporcion, explicacion: aplicados.length ? `${base_} · escalador ${aplicados.join(', ')} (+1)` : base_ }
}

const toleranciaCruce = (base: number) => Math.max(UMBRALES_IVA.toleranciaMinima, (Math.abs(base) * UMBRALES_IVA.toleranciaCrucePct) / 100)
const toleranciaRedondeo = (componentes: number) => Math.max(UMBRALES_IVA.toleranciaMinima, componentes * UMBRALES_IVA.redondeoPorComponente)

/** Sección del catálogo (y con ella el ítem del checklist y la norma) de cada renglón. */
type SeccionIva = 'ingresos' | 'compras' | 'generado' | 'descontable' | 'liquidacion'
const SECCION_DE: Record<string, SeccionIva> = {}
for (const s of CIFRAS_CATALOGO.iva) {
  const clave: SeccionIva = /^Ingresos/.test(s.titulo) ? 'ingresos' : /^Compras/.test(s.titulo) ? 'compras' : /generado/.test(s.titulo) ? 'generado' : /descontable/.test(s.titulo) ? 'descontable' : 'liquidacion'
  for (const r of s.renglones) SECCION_DE[r.id] = clave
}
const CHECKLIST_DE: Record<SeccionIva, string> = {
  ingresos: 'ingresos-conciliados', compras: 'iva-descontable', generado: 'iva-generado', descontable: 'iva-descontable', liquidacion: 'saldos-favor',
}
const NORMA_DE: Record<SeccionIva, string> = {
  ingresos: 'Arts. 420, 429 y 617 ET',
  compras: 'Arts. 485 y 771-2 ET',
  generado: 'Arts. 447 y 468 ET',
  descontable: 'Arts. 485, 488, 496 y 771-2 ET',
  liquidacion: 'Arts. 437-1, 815 y 850 ET',
}
const ETIQUETA = new Map(CIFRAS_CATALOGO.iva.flatMap((s) => s.renglones).map((r) => [r.id, r.label]))
const CASILLA: Record<string, string> = {
  'iva-ing-19': '28', 'iva-ing-5': '27', 'iva-ing-brutos': '41', 'iva-ing-devoluciones': '42', 'iva-ing-netos': '43',
  'iva-comp-brutas': '55', 'iva-comp-no-gravadas': '46-49, 54',
  'iva-gen-19': '59', 'iva-gen-5': '58', 'iva-gen-recuperado': '66', 'iva-generado': '67',
  'iva-desc-ajustes': '80', 'iva-descontable': '81',
  'iva-saldo-favor-ant': '84', 'iva-retenido': '85', 'iva-sanciones': '87', 'iva-total': '88/89',
}

// ─── Corrida ─────────────────────────────────────────────────────────────────

export function correrRevisionIva(entrada: EntradaCorridaIva): ResultadoCorridaIva {
  const bit: LineaBorrador[] = []
  const propuestas: PropuestaBorrador[] = []
  const limitaciones: { regla: string; motivo: string }[] = []
  const reglas = new Set<string>()
  const huellas = new Set(entrada.huellasDecididas ?? [])
  const omitidas = new Set(entrada.omitirReglas ?? [])
  const num = { H: entrada.numeracion?.H ?? 0, J: entrada.numeracion?.J ?? 0, A: entrada.numeracion?.A ?? 0, D: entrada.numeracion?.D ?? 0 }
  /** Ítems del checklist con alguna regla que corrió con datos, y los que recibieron propuestas. */
  const itemsConDatos = new Set<string>()
  const itemsConPropuesta = new Set<string>()
  let orden = 0
  let propuestasOmitidas = 0

  const lectura = (texto: string, referencia?: Record<string, unknown>) => bit.push({ tipo: 'lectura', texto, referencia })
  const regla = (id: string, texto: string) => {
    reglas.add(id)
    bit.push({ tipo: 'regla', texto, referencia: { regla: id } })
  }

  const proponer = (p: {
    tipo: TipoPropuesta
    reglasIds: string[]
    titulo: string
    renglonId: string | null
    monto: number | null
    severidad: SeveridadPropuesta | null
    certeza: CertezaPropuesta
    datos: DatoPropuesta[]
    contenido: ContenidoPropuesta
    checklistItem: string | null
    /** Subcuenta del auxiliar (ambigüedades de clasificación): ancla de la huella y destino de la memoria. */
    cuenta?: string | null
    bitacora: LineaBorrador[]
    /** Cédula donde nace la propuesta (para decidirla en su contexto). */
    cedula: string
  }): { codigo: string | null; nota: string | null } => {
    if (p.reglasIds.some((r) => omitidas.has(r))) {
      // El auditor dejó este paso fuera del programa: lo que encuentre no se propone,
      // y su punto del checklist tampoco se da por verificado.
      propuestasOmitidas++
      if (p.checklistItem) itemsConPropuesta.add(p.checklistItem)
      return { codigo: null, nota: 'Paso desactivado en el programa: no se propone.' }
    }
    // La huella distingue renglón; si la propuesta no tiene renglón (p. ej. "marcar como
    // verificado"), distingue por ítem del checklist: si no, todas compartirían huella y
    // decidir una suprimiría las demás en la corrida siguiente.
    const ancla = p.renglonId ?? p.cuenta ?? p.checklistItem
    const huella = huellaPropuesta({ tipo: p.tipo, reglas: p.reglasIds, cuentaCodigo: ancla })
    if (huellas.has(huella)) {
      bit.push({ tipo: 'regla', texto: `${p.reglasIds.join(', ')}: ya decidido por una persona en una corrida anterior (${ancla ?? p.titulo}); no se vuelve a proponer.`, referencia: { regla: p.reglasIds[0] } })
      // El punto del checklist ya fue atendido por esa decisión.
      if (p.checklistItem) itemsConPropuesta.add(p.checklistItem)
      return { codigo: null, nota: 'Ya decidido por una persona en un análisis anterior.' }
    }
    const prefijo = p.tipo === 'hallazgo' ? 'H' : p.tipo === 'ambiguedad' ? 'A' : p.tipo === 'documento' ? 'D' : 'J'
    num[prefijo]++
    const codigo = `${prefijo}-${String(num[prefijo]).padStart(2, '0')}`
    if (p.checklistItem) itemsConPropuesta.add(p.checklistItem)
    propuestas.push({
      clave: codigo,
      paso: 'cifras',
      tipo: p.tipo,
      codigo,
      titulo: p.titulo,
      // Misma ancla que la huella: el backend recalcula la huella desde esta columna.
      cuentaCodigo: ancla,
      monto: p.monto === null ? null : Math.round(p.monto),
      severidad: p.severidad,
      certeza: p.certeza,
      reglas: p.reglasIds,
      datos: p.datos,
      contenido: {
        ...p.contenido,
        tributario: { renglonId: p.renglonId, casilla: p.renglonId ? CASILLA[p.renglonId] ?? null : null, checklistItem: p.checklistItem, cuentaAuxiliar: p.cuenta ?? null, cedula: p.cedula, ...(p.contenido.tributario ?? {}) },
      },
      desbloqueaClave: null,
      orden: orden++,
      bitacora: p.bitacora,
    })
    return { codigo, nota: null }
  }

  // ─── Cédulas: una por procedimiento, con todo lo comparado ────────────────
  type Tabla = { id: string; titulo: string; columnas: ColumnaCedula[]; descripcion?: string }
  type Prop = { codigo: string | null; nota: string | null }
  const fuenteBorrador = `Formulario 300 de ${entrada.periodo.etiqueta} (columna Declarado)`
  const fuenteLibros = entrada.fuentes?.length ? entrada.fuentes.map((f) => `${f.nombre} (${f.archivo})`).join(', ') : 'Según libros guardado en la revisión'
  const fuenteDian = `Reporte de documentos electrónicos de la DIAN (${entrada.periodo.desde} a ${entrada.periodo.hasta})`
  const cedulaDePaso = (id: string, fase: CedulaBorrador['fase'], objetivo: string, criterio: string, fuentes: string[]): CedulaBorrador => {
    const d = PROGRAMA_AGENTE_IVA.find((x) => x.id === id)!
    const c = nuevaCedula({ id, pasoId: id, fase, titulo: d.texto, objetivo, criterio, fuentes, reglas: d.reglas, checklistItem: d.checklistItem })
    if (d.reglas.every((r) => omitidas.has(r))) { c.estado = 'omitida'; c.motivo = 'Paso desactivado por el auditor en el programa.' }
    return c
  }
  const tolRedondeo = `Tolerancia: redondeo a miles del formulario (${fmt(UMBRALES_IVA.redondeoPorComponente)} por componente, mínimo ${fmt(UMBRALES_IVA.toleranciaMinima)}).`
  const tolCruce = `Tolerancia: ${UMBRALES_IVA.toleranciaCrucePct} % del renglón, mínimo ${fmt(UMBRALES_IVA.toleranciaMinima)}.`
  const C = {
    formulario: cedulaDePaso('formulario', 'formulario', 'Comprobar que el borrador es coherente por sí mismo antes de compararlo con nada: que los totales salen de sus componentes, que el IVA generado corresponde a la tarifa sobre su base y que el descontable cabe en las compras gravadas declaradas.', `Arts. 447, 468, 468-1, 484, 485 y 488 ET. Tarifa sobre la base: tolerancia de ${UMBRALES_IVA.toleranciaTarifaPct} % del IVA esperado, mínimo ${fmt(UMBRALES_IVA.toleranciaTarifaMin)}. Devoluciones: atención por encima del ${UMBRALES_IVA.devolucionesPct} % de los ingresos brutos.`, [fuenteBorrador]),
    lectura: nuevaCedula({ id: 'lectura-libros', pasoId: null, fase: 'libros', titulo: 'Leer los libros y clasificar las cuentas de IVA, ingresos y retenciones', objetivo: 'Dejar a la vista qué se leyó de la contabilidad, a qué renglón del formulario se llevó cada cuenta de 2408, ingresos (41, 42) y 1355, y por qué, antes de cruzar nada.', criterio: 'Clasificación por el nombre de la subcuenta y el prefijo PUC, con la memoria de la empresa por encima de ambos. Los asientos de cierre del IVA se excluyen del movimiento del período.', fuentes: [fuenteLibros], reglas: ['P-02', 'P-03'], checklistItem: null }),
    ingresos: cedulaDePaso('ingresos-libros', 'cruce', 'Verificar que los ingresos y las devoluciones declarados son los que la contabilidad registró en el período.', `Arts. 420, 429 y 617 ET. ${tolRedondeo}`, [fuenteBorrador, fuenteLibros]),
    generado: cedulaDePaso('generado-libros', 'cruce', 'Verificar que el IVA generado declarado corresponde a los créditos de 2408 del período.', `Arts. 447 y 468 ET. ${tolRedondeo}`, [fuenteBorrador, fuenteLibros]),
    descontable: cedulaDePaso('descontable-libros', 'cruce', 'Verificar que el IVA descontable declarado corresponde a los débitos de 2408 del período.', `Arts. 485, 488, 496 y 771-2 ET. ${tolRedondeo}`, [fuenteBorrador, fuenteLibros]),
    retenciones: cedulaDePaso('retenciones-libros', 'cruce', 'Verificar que las retenciones de IVA que le practicaron a la empresa corresponden a lo registrado en 1355.', `Art. 437-1 ET. ${tolRedondeo}`, [fuenteBorrador, fuenteLibros]),
    lecturaDian: nuevaCedula({ id: 'lectura-dian', pasoId: null, fase: 'dian', titulo: 'Leer el reporte de documentos electrónicos de la DIAN', objetivo: 'Dejar a la vista qué documentos electrónicos se tomaron del reporte, por tipo, y si el reporte es de esta empresa y cubre el período.', criterio: 'Documentos con fecha de emisión dentro del período. El reporte no trae base gravable: la base es estimada (total menos impuestos). Las respuestas de aplicación se excluyen; el documento soporte emitido es una compra.', fuentes: [fuenteDian], reglas: ['P-05', 'P-06', 'I-27'], checklistItem: null }),
    dianVentas: cedulaDePaso('dian-ventas', 'dian', 'Verificar que las ventas, las devoluciones y el IVA generado declarados corresponden a lo facturado electrónicamente en el período.', `Arts. 429, 447, 484 y 617 ET; Resolución DIAN 000042 de 2020. ${tolCruce}`, [fuenteBorrador, fuenteDian]),
    dianCompras: cedulaDePaso('dian-compras', 'dian', 'Verificar que el IVA descontable declarado tiene soporte en facturas electrónicas recibidas dentro de la ventana de oportunidad.', `Arts. 488, 496 y 771-2 ET; Resolución DIAN 000167 de 2021. Ventana: el período y los dos anteriores. ${tolCruce}`, [fuenteBorrador, fuenteDian]),
    saldo: cedulaDePaso('saldo-favor', 'analitica', 'Verificar que el saldo a favor imputado es el que dejó la declaración del período anterior.', `Arts. 815 y 850 ET. ${tolRedondeo}`, [fuenteBorrador, entrada.anterior ? `Revisión de ${entrada.anterior.etiqueta} en la plataforma` : 'Sin revisión del período anterior']),
    proporcionalidad: cedulaDePaso('proporcionalidad', 'analitica', 'Evaluar si, habiendo operaciones excluidas o no gravadas, el descontable debía limitarse en proporción a las operaciones gravadas.', 'Art. 490 ET. Se alerta cuando hay operaciones excluidas o no gravadas, hay descontables y no hay ajuste en la casilla 80.', [fuenteBorrador]),
    oportunidad: cedulaDePaso('oportunidad', 'oportunidad', 'Confirmar que la declaración se presentó a tiempo y revisar las sanciones liquidadas.', 'Arts. 639, 640, 641 y 644 ET.', [fuenteBorrador, 'Fechas registradas en la revisión']),
  }
  const COL_CRUCE = (segun: string): ColumnaCedula[] => [
    { clave: 'partida', titulo: 'Renglón', formato: 'texto' }, { clave: 'casilla', titulo: 'Casilla', formato: 'texto' }, { clave: 'declarado', titulo: 'Declarado', formato: 'moneda' },
    { clave: 'referencia', titulo: segun, formato: 'moneda' }, { clave: 'diferencia', titulo: 'Diferencia', formato: 'moneda' }, { clave: 'tolerancia', titulo: 'Tolerancia', formato: 'moneda' },
  ]
  const T_LIBROS: Tabla = { id: 'cruce', titulo: 'Declarado contra libros', descripcion: 'Cada renglón con valor en el formulario y en la contabilidad del período.', columnas: COL_CRUCE('Según libros') }
  const T_DIAN: Tabla = { id: 'cruce', titulo: 'Declarado contra facturación electrónica', columnas: COL_CRUCE('Según DIAN') }
  const T_PRUEBAS: Tabla = { id: 'pruebas', titulo: 'Pruebas sobre las cifras declaradas', columnas: [{ clave: 'prueba', titulo: 'Prueba', formato: 'texto' }, { clave: 'casillas', titulo: 'Casillas', formato: 'texto' }, { clave: 'declarado', titulo: 'Declarado', formato: 'moneda' }, { clave: 'referencia', titulo: 'Valor de referencia', formato: 'moneda' }, { clave: 'diferencia', titulo: 'Diferencia', formato: 'moneda' }, { clave: 'tolerancia', titulo: 'Tolerancia', formato: 'moneda' }] }
  const T_PUNTOS: Tabla = { id: 'puntos', titulo: 'Puntos verificados', columnas: [{ clave: 'punto', titulo: 'Punto verificado', formato: 'texto' }, { clave: 'dato', titulo: 'Dato', formato: 'texto' }, { clave: 'valor', titulo: 'Valor', formato: 'moneda' }] }
  const fila = (cedula: CedulaBorrador, tabla: Tabla, valores: FilaCedula['valores'], estado: EstadoFilaCedula, extra: { regla?: string; nota?: string | null; propuesta?: Prop | null } = {}) => {
    tablaDeCedula(cedula, tabla.id, tabla.titulo, tabla.columnas, tabla.descripcion).filas.push({
      valores, estado, regla: extra.regla ?? null, propuesta: extra.propuesta?.codigo ?? null, nota: extra.nota ?? extra.propuesta?.nota ?? null,
    })
  }
  const CEDULA_DE_SECCION: Record<SeccionIva, CedulaBorrador> = { ingresos: C.ingresos, compras: C.descontable, generado: C.generado, descontable: C.descontable, liquidacion: C.retenciones }

  // ─── P-01 · cifras combinadas ─────────────────────────────────────────────
  const cifras: CifrasRevision = {}
  const ids = CIFRAS_CATALOGO.iva.flatMap((s) => s.renglones).filter((r) => r.tipo === 'digitable').map((r) => r.id)
  for (const id of ids) {
    const guardado = entrada.cifras[id]
    const libros = entrada.libros ? entrada.libros.cifras[id]?.libros ?? null : (typeof guardado?.libros === 'number' ? guardado.libros : null)
    cifras[id] = { declarado: typeof guardado?.declarado === 'number' ? guardado.declarado : null, libros }
  }
  const cifrasLibros: Record<string, { libros: number }> = {}
  if (entrada.libros) for (const [id, v] of Object.entries(entrada.libros.cifras)) if (ids.includes(id)) cifrasLibros[id] = v
  const R = resolverCifras('iva', cifras)
  if (entrada.libros?.totales['iva-ing-brutos'] !== undefined) {
    R['iva-ing-brutos'] = { ...R['iva-ing-brutos'], libros: entrada.libros.totales['iva-ing-brutos'] }
  }
  const dec = (id: string): number | null => R[id]?.declarado ?? null
  const lib = (id: string): number | null => R[id]?.libros ?? null
  const declarados = ids.filter((id) => cifras[id].declarado !== null).length
  lectura(`Formulario ${entrada.periodo.etiqueta}: ${declarados} renglón(es) con valor declarado.`, { paso: 'P-01' })
  if (declarados === 0) limitaciones.push({ regla: 'P-01', motivo: 'Sin cifras declaradas: solo corren las reglas sobre libros y DIAN.' })

  if (entrada.libros) {
    const l = entrada.libros
    lectura(`Auxiliar contable: ${l.cuentas.filter((c) => c.destino).length} cuenta(s) mapeadas a ${Object.keys(l.cifras).length} renglón(es) de libros.`, { paso: 'P-02' })
    for (const linea of l.bitacora) lectura(linea, { paso: 'P-03' })
    const propSinClasificar = new Map<string, Prop>()
    if (l.sinClasificar.length) {
      for (const c of l.sinClasificar) {
        const pr = proponer({
          cedula: 'lectura-libros',
          tipo: 'ambiguedad', reglasIds: ['P-03'], titulo: `Subcuenta ${c.cuenta} sin clasificar`, renglonId: null, monto: null, severidad: 'media', certeza: 'no_verificable',
          datos: [{ etiqueta: 'cuenta', valor: `${c.cuenta} ${c.nombre ?? ''}`.trim() }, { etiqueta: 'débitos', valor: fmt(c.debitos) }, { etiqueta: 'créditos', valor: fmt(c.creditos) }],
          contenido: {
            descripcion: `La subcuenta ${c.cuenta} "${c.nombre ?? ''}" de 2408 mueve ${fmt(c.debitos)} en débitos y ${fmt(c.creditos)} en créditos, pero su nombre no dice si es IVA generado, descontable o un saldo.`,
            para: 'Sin clasificarla, "Según libros" queda incompleto y las diferencias contra el formulario no son confiables.',
            opciones: [
              { clave: 'iva-gen-19', label: 'IVA generado 19 %' }, { clave: 'iva-gen-5', label: 'IVA generado 5 %' },
              { clave: 'iva-desc-compras', label: 'Descontable por compras' }, { clave: 'iva-desc-servicios', label: 'Descontable por servicios' },
              { clave: 'iva-gen-recuperado', label: 'IVA recuperado en devoluciones en compras' }, { clave: 'ignorar', label: 'No es IVA del período (saldo)' },
            ],
            destino: 'memoria',
          },
          checklistItem: null,
          cuenta: c.cuenta,
          bitacora: [{ tipo: 'lectura', texto: `Leí la subcuenta ${c.cuenta} con ${c.movimientos} movimiento(s) en el período.` }, { tipo: 'clasificacion', texto: 'Ninguna palabra clave del nombre permite clasificarla (P-03).', referencia: { paso: 'P-03' } }],
        })
        propSinClasificar.set(c.cuenta, pr)
      }
    }
    for (const f of entrada.fuentes ?? []) {
      fila(C.lectura, { id: 'fuentes', titulo: 'Archivos leídos', columnas: [{ clave: 'nombre', titulo: 'Soporte', formato: 'texto' }, { clave: 'archivo', titulo: 'Archivo', formato: 'texto' }, { clave: 'registros', titulo: 'Registros del período', formato: 'numero' }, { clave: 'cuentas', titulo: 'Cuentas', formato: 'numero' }] },
        { nombre: f.nombre, archivo: f.archivo, registros: f.registros, cuentas: f.cuentas }, 'informativo')
    }
    const tClasif: Tabla = { id: 'clasificacion', titulo: 'Clasificación de las cuentas', descripcion: 'Cada cuenta con movimiento en el período, el renglón del formulario al que se llevó y por qué.', columnas: [{ clave: 'cuenta', titulo: 'Cuenta', formato: 'texto' }, { clave: 'nombre', titulo: 'Nombre', formato: 'texto' }, { clave: 'renglon', titulo: 'Renglón del 300', formato: 'texto' }, { clave: 'como', titulo: 'Cómo se clasificó', formato: 'texto' }, { clave: 'neto', titulo: 'Movimiento del período', formato: 'moneda' }] }
    for (const c of l.cuentas) {
      const sin = propSinClasificar.has(c.cuenta) || l.sinClasificar.some((x) => x.cuenta === c.cuenta)
      const destino = c.destino ? `${ETIQUETA.get(c.destino) ?? c.destino}${CASILLA[c.destino] ? ` (c. ${CASILLA[c.destino]})` : ''}` : c.total ? 'Solo al total de ingresos brutos (c. 41)' : sin ? 'Sin clasificar' : 'No se usa'
      fila(C.lectura, tClasif, { cuenta: c.cuenta, nombre: c.nombre ?? '', renglon: destino, como: c.motivo, neto: c.destino || c.total ? Math.round(c.neto) : null },
        sin ? 'por_confirmar' : c.destino || c.total ? 'conforme' : 'informativo', { regla: 'P-03', propuesta: sin ? propSinClasificar.get(c.cuenta) ?? null : null })
    }
    const tRenglones: Tabla = { id: 'renglones', titulo: 'Según libros por renglón', descripcion: 'Lo que la contabilidad registra en el período para cada renglón. Es la cifra que después se cruza contra el formulario.', columnas: [{ clave: 'renglon', titulo: 'Renglón', formato: 'texto' }, { clave: 'casilla', titulo: 'Casilla', formato: 'texto' }, { clave: 'libros', titulo: 'Según libros', formato: 'moneda' }, { clave: 'cuentas', titulo: 'Cuentas', formato: 'numero' }] }
    for (const [id, v] of Object.entries(l.cifras)) fila(C.lectura, tRenglones, { renglon: ETIQUETA.get(id) ?? id, casilla: CASILLA[id] ?? null, libros: v.libros, cuentas: l.cuentas.filter((c) => c.destino === id).length }, 'informativo', { regla: 'P-02' })
    if (l.totales['iva-ing-brutos'] !== undefined) fila(C.lectura, tRenglones, { renglon: 'Total ingresos brutos (clase 4 sin devoluciones)', casilla: '41', libros: l.totales['iva-ing-brutos'], cuentas: l.cuentas.filter((c) => /^4[12]/.test(c.cuenta) && !c.cuenta.startsWith('4175')).length }, 'informativo', { regla: 'P-02' })
  } else {
    C.lectura.estado = 'sin_insumos'
    C.lectura.motivo = 'No se cargó auxiliar ni balance de prueba en este análisis.'
  }
  // Libros: los recién mapeados o los ya guardados en la revisión (recarga de la página).
  const hayLibros = !!entrada.libros || ids.some((id) => cifras[id].libros !== null)
  if (!entrada.libros && hayLibros) lectura('Según libros: uso los valores ya guardados en la revisión.', { paso: 'P-02' })
  if (!hayLibros) limitaciones.push({ regla: 'I-10..I-16', motivo: 'Sin auxiliar contable: no se comparó contra libros.' })

  // ─── Bloque A · aritmética del formulario ─────────────────────────────────
  const T_ARIT: Tabla = { id: 'aritmetica', titulo: 'Totales del formulario', descripcion: 'Totales recalculados a partir de los renglones declarados. Si la lectura del borrador encontró un total que no cuadra, aparece como diferencia.', columnas: [{ clave: 'total', titulo: 'Total', formato: 'texto' }, { clave: 'casilla', titulo: 'Casilla', formato: 'texto' }, { clave: 'valor', titulo: 'Valor', formato: 'moneda' }] }
  for (const adv of entrada.advertenciasLectura ?? []) {
    regla('I-01', `I-01: ${adv}`)
    const pr = proponer({
      cedula: 'formulario',
      tipo: 'ambiguedad', reglasIds: ['I-01'], titulo: 'Un total del formulario no cuadra con sus componentes', renglonId: null, monto: null, severidad: 'media', certeza: 'verificado',
      datos: [], checklistItem: null,
      contenido: {
        descripcion: adv,
        para: 'Si el formulario no cuadra, las diferencias contra libros heredan el error. Hay que saber si es la lectura o el borrador.',
        opciones: [{ clave: 'lectura', label: 'Fue la lectura: corregir la casilla' }, { clave: 'formulario', label: 'El borrador viene así: revisarlo con el contador' }],
      },
      bitacora: [{ tipo: 'regla', texto: adv, referencia: { regla: 'I-01' } }],
    })
    fila(C.formulario, T_ARIT, { total: adv, casilla: null, valor: null }, 'diferencia', { regla: 'I-01', propuesta: pr })
  }
  for (const id of ['iva-ing-brutos', 'iva-ing-netos', 'iva-comp-brutas', 'iva-comp-netas', 'iva-generado', 'iva-descontable', 'iva-saldo', 'iva-saldo-impuesto', 'iva-total']) {
    const v = dec(id)
    if (v === null) continue
    fila(C.formulario, T_ARIT, { total: ETIQUETA.get(id) ?? id, casilla: CASILLA[id] ?? null, valor: v }, 'informativo', { regla: 'I-01', nota: 'Recalculado desde sus componentes.' })
  }

  const tarifa = (id: string, gen: string, ing: string, casillaGen: string, casillaIng: string, t: number, tarifaTxt: string) => {
    const g = dec(gen)
    const b = dec(ing)
    if (g === null || b === null) return
    itemsConDatos.add('iva-generado')
    const esperado = b * t
    const dif = g - esperado
    const tol = Math.max(UMBRALES_IVA.toleranciaTarifaMin, (esperado * UMBRALES_IVA.toleranciaTarifaPct) / 100)
    regla(id, `${id}: casilla ${casillaGen} ${fmt(g)} vs ${tarifaTxt} de la casilla ${casillaIng} (${fmt(b)}) = ${fmt(esperado)}; diferencia ${fmt(dif)}, tolerancia ${fmt(tol)}.`)
    const valores = { prueba: `IVA generado al ${tarifaTxt} contra el ${tarifaTxt} de su base`, casillas: `${casillaGen} / ${casillaIng}`, declarado: g, referencia: Math.round(esperado), diferencia: Math.round(dif), tolerancia: Math.round(tol) }
    if (Math.abs(dif) <= tol) { fila(C.formulario, T_PRUEBAS, valores, 'conforme', { regla: id }); return }
    const sev = severidadPorProporcion(dif, esperado)
    const pr = proponer({
      cedula: 'formulario',
      tipo: 'hallazgo', reglasIds: [id], titulo: `IVA generado al ${tarifaTxt} no corresponde a la base declarada`, renglonId: gen, monto: Math.abs(dif), severidad: sev.severidad, certeza: 'verificado',
      datos: [{ etiqueta: 'declarado', valor: fmt(g) }, { etiqueta: 'base declarada', valor: fmt(b) }, { etiqueta: `${tarifaTxt} de la base`, valor: fmt(esperado) }, { etiqueta: 'diferencia', valor: fmt(dif) }],
      checklistItem: 'iva-generado',
      contenido: {
        descripcion: `El IVA generado al ${tarifaTxt} declarado (${fmt(g)}, casilla ${casillaGen}) ${dif > 0 ? 'supera' : 'es inferior a'} el ${tarifaTxt} de la base gravada declarada (${fmt(b)}, casilla ${casillaIng}), que da ${fmt(esperado)}. Diferencia de ${fmt(dif)} (${pct(sev.proporcion)}).`,
        norma: 'Arts. 447 y 468 ET (base gravable y tarifa general) · art. 468-1 ET (tarifa del 5 %)',
        recomendacion: dif > 0 ? 'Verificar si se incluyó IVA de operaciones cuya base no quedó en la casilla, o si hay error de transcripción en la base.' : 'Verificar si hay ventas gravadas cuya base se declaró pero cuyo IVA no se liquidó, o ventas a otra tarifa mal clasificadas.',
      },
      bitacora: [
        { tipo: 'lectura', texto: `Leí la casilla ${casillaGen} (${fmt(g)}) y la casilla ${casillaIng} (${fmt(b)}) del borrador.` },
        { tipo: 'regla', texto: `${id}: ${tarifaTxt} de ${fmt(b)} = ${fmt(esperado)}; el declarado difiere en ${fmt(dif)}, más que la tolerancia de ${fmt(tol)}.`, referencia: { regla: id } },
        { tipo: 'clasificacion', texto: `Severidad ${sev.severidad.toUpperCase()}: ${sev.explicacion}.` },
      ],
    })
    fila(C.formulario, T_PRUEBAS, valores, 'diferencia', { regla: id, propuesta: pr })
  }
  tarifa('I-02', 'iva-gen-19', 'iva-ing-19', '59', '28', UMBRALES_IVA.tarifas.general, '19 %')
  tarifa('I-03', 'iva-gen-5', 'iva-ing-5', '58', '27', UMBRALES_IVA.tarifas.reducida, '5 %')

  {
    // El IVA de devoluciones en ventas (c79) suma en descontables pero no nace de compras.
    const desc = dec('iva-descontable') === null ? null : (dec('iva-descontable') ?? 0) - (dec('iva-desc-devoluciones') ?? 0)
    const comprasBrutas = dec('iva-comp-brutas')
    const c19 = dec('iva-comp-19') ?? 0
    const c5 = dec('iva-comp-5') ?? 0
    if (desc !== null && desc > 0) {
      itemsConDatos.add('iva-descontable')
      const maximo = c19 * UMBRALES_IVA.tarifas.general + c5 * UMBRALES_IVA.tarifas.reducida
      const sinCompras = comprasBrutas === null || comprasBrutas === 0
      const excede = !sinCompras && desc > maximo + toleranciaRedondeo(4)
      regla('I-04', `I-04: descontable ${fmt(desc)} vs compras gravadas declaradas ${fmt(c19)} al 19 % y ${fmt(c5)} al 5 % (IVA máximo ${fmt(maximo)}).`)
      const valores = { prueba: 'Descontable (sin devoluciones en ventas) contra el IVA máximo de las compras gravadas declaradas', casillas: '81 − 79 / 44, 45', declarado: desc, referencia: Math.round(maximo), diferencia: Math.round(desc - maximo), tolerancia: toleranciaRedondeo(4) }
      if (!(sinCompras || excede)) fila(C.formulario, T_PRUEBAS, valores, 'conforme', { regla: 'I-04', nota: 'El descontable cabe en las compras gravadas declaradas.' })
      if (sinCompras || excede) {
        const pr = proponer({
          cedula: 'formulario',
          tipo: 'hallazgo', reglasIds: ['I-04'], titulo: sinCompras ? 'IVA descontable sin compras declaradas' : 'IVA descontable superior al IVA de las compras gravadas declaradas', renglonId: 'iva-descontable', monto: sinCompras ? desc : desc - maximo, severidad: 'alta', certeza: 'verificado',
          datos: [{ etiqueta: 'descontable (c81)', valor: fmt(desc) }, { etiqueta: 'compras 19 % (c45)', valor: fmt(c19) }, { etiqueta: 'compras 5 % (c44)', valor: fmt(c5) }, { etiqueta: 'IVA máximo de esas compras', valor: fmt(maximo) }],
          checklistItem: 'iva-descontable',
          contenido: {
            descripcion: sinCompras
              ? `Se declaran ${fmt(desc)} de impuestos descontables (casilla 81) sin compras ni importaciones en la sección de compras del formulario.`
              : `Los impuestos descontables declarados (${fmt(desc)}, casilla 81) superan el IVA máximo que generarían las compras gravadas declaradas (${fmt(maximo)}) en ${fmt(desc - maximo)}.`,
            norma: 'Arts. 485 y 488 ET (descontables solo sobre compras gravadas imputables a operaciones gravadas)',
            recomendacion: 'Revisar las casillas 44 a 55 del borrador: las compras gravadas deben estar declaradas con su base, y el descontable no puede exceder la tarifa sobre esa base.',
          },
          bitacora: [{ tipo: 'regla', texto: `I-04: ${sinCompras ? 'compras brutas en cero o sin declarar' : `descontable excede el máximo en ${fmt(desc - maximo)}`}.`, referencia: { regla: 'I-04' } }],
        })
        fila(C.formulario, T_PRUEBAS, valores, 'diferencia', { regla: 'I-04', propuesta: pr, nota: pr.nota ?? (sinCompras ? 'Descontable sin compras declaradas.' : 'Excede el IVA máximo de las compras gravadas.') })
      }
    }
  }

  {
    const dev = dec('iva-ing-devoluciones')
    const brutos = dec('iva-ing-brutos')
    if (dev !== null && brutos !== null && brutos > 0) {
      itemsConDatos.add('ingresos-conciliados')
      const p = (dev / brutos) * 100
      regla('I-06', `I-06: devoluciones ${fmt(dev)} = ${pct(p)} de los ingresos brutos ${fmt(brutos)} (umbral ${UMBRALES_IVA.devolucionesPct} %).`)
      const valores = { prueba: `Devoluciones en ventas: ${pct(p)} de los ingresos brutos (umbral ${UMBRALES_IVA.devolucionesPct} %)`, casillas: '42 / 41', declarado: dev, referencia: Math.round((brutos * UMBRALES_IVA.devolucionesPct) / 100), diferencia: Math.round(dev - (brutos * UMBRALES_IVA.devolucionesPct) / 100), tolerancia: null }
      if (p <= UMBRALES_IVA.devolucionesPct) fila(C.formulario, T_PRUEBAS, valores, 'conforme', { regla: 'I-06' })
      if (p > UMBRALES_IVA.devolucionesPct) {
        const pr = proponer({
          cedula: 'formulario',
          tipo: 'hallazgo', reglasIds: ['I-06'], titulo: 'Devoluciones en ventas desproporcionadas', renglonId: 'iva-ing-devoluciones', monto: dev, severidad: 'baja', certeza: 'requiere_evidencia',
          datos: [{ etiqueta: 'devoluciones (c42)', valor: fmt(dev) }, { etiqueta: 'ingresos brutos (c41)', valor: fmt(brutos) }, { etiqueta: 'proporción', valor: pct(p) }],
          checklistItem: 'ingresos-conciliados',
          contenido: {
            descripcion: `Las devoluciones, rescisiones y anulaciones en ventas (${fmt(dev)}, casilla 42) representan el ${pct(p)} de los ingresos brutos del período; el umbral de atención es ${UMBRALES_IVA.devolucionesPct} %.`,
            norma: 'Art. 484 ET (disminución del impuesto por devoluciones, anulaciones y rescisiones)',
            recomendacion: 'Verificar que cada devolución esté soportada en nota crédito electrónica del período y que el IVA correspondiente se haya restado del generado.',
            para: 'Notas crédito emitidas del período (reporte DIAN o listado del software).',
          },
          bitacora: [{ tipo: 'regla', texto: `I-06: ${pct(p)} supera el ${UMBRALES_IVA.devolucionesPct} %.`, referencia: { regla: 'I-06' } }],
        })
        fila(C.formulario, T_PRUEBAS, valores, 'por_confirmar', { regla: 'I-06', propuesta: pr })
      }
    }
  }
  limitaciones.push({ regla: 'I-05', motivo: 'El saldo a pagar y a favor simultáneos (c82/c83, c88/c89) solo se verifica sobre las casillas del borrador, no sobre los renglones.' })
  C.formulario.limitaciones.push('El saldo a pagar y a favor simultáneos (casillas 82/83 y 88/89) solo se verifica al leer el borrador, no aquí.')

  // ─── Bloque B · libros vs formulario ───────────────────────────────────────
  if (hayLibros) {
    const comparadas = new Set<string>()
    const comparar = (id: string, reglaId: string, d: number, l: number, opts: { componentes?: number; titulo?: string } = {}) => {
      const sec = SECCION_DE[id] ?? 'liquidacion'
      const item = CHECKLIST_DE[sec]
      itemsConDatos.add(item)
      const dif = d - l
      const tol = toleranciaRedondeo(opts.componentes ?? 1)
      regla(reglaId, `${reglaId}: ${ETIQUETA.get(id) ?? id} declarado ${fmt(d)} vs libros ${fmt(l)}; diferencia ${fmt(dif)}, tolerancia ${fmt(tol)}.`)
      const ced = CEDULA_DE_SECCION[sec]
      const valores = { partida: ETIQUETA.get(id) ?? id, casilla: CASILLA[id] ?? null, declarado: d, referencia: l, diferencia: dif, tolerancia: tol }
      if (Math.abs(dif) <= tol) { fila(ced, T_LIBROS, valores, 'conforme', { regla: reglaId }); return }
      const escaladores: Escalador[] = []
      if (sec === 'descontable' && dif > 0) escaladores.push('descontable_sin_soporte')
      if ((sec === 'generado' || sec === 'ingresos') && dif < 0 && id !== 'iva-ing-devoluciones') escaladores.push('omision')
      const sev = severidadPorProporcion(dif, Math.max(Math.abs(d), Math.abs(l)), escaladores)
      const ref = entrada.materialidadReferencia
      const referencia = ref && ref.desempeno > 0 ? ` Equivale a ${(Math.abs(dif) / ref.desempeno).toFixed(2)}× la materialidad de desempeño del encargo ${ref.encargo} (solo referencia).` : ''
      const pr = proponer({
        cedula: ced.id,
        tipo: 'hallazgo', reglasIds: [reglaId], titulo: opts.titulo ?? `${ETIQUETA.get(id) ?? id}: declarado y libros no coinciden`, renglonId: id, monto: Math.abs(dif), severidad: sev.severidad, certeza: 'verificado',
        datos: [{ etiqueta: 'declarado', valor: fmt(d) }, { etiqueta: 'según libros', valor: fmt(l) }, { etiqueta: 'diferencia', valor: `${dif < 0 ? '−' : ''}${fmt(dif)}` }, { etiqueta: 'proporción', valor: pct(sev.proporcion) }],
        checklistItem: item,
        contenido: {
          descripcion: `${ETIQUETA.get(id) ?? id}${CASILLA[id] ? ` (casilla ${CASILLA[id]})` : ''}: el formulario declara ${fmt(d)} y la contabilidad del período registra ${fmt(l)}. Diferencia de ${fmt(dif)} (${pct(sev.proporcion)}), ${dif > 0 ? 'declarado mayor que libros' : 'libros mayor que declarado'}.${referencia}`,
          norma: NORMA_DE[sec],
          recomendacion: sec === 'descontable' && dif > 0
            ? 'Identificar el descontable declarado que no está en la contabilidad: sin soporte en factura electrónica no procede (art. 771-2 ET). Corregir el borrador o registrar la factura.'
            : dif < 0 && (sec === 'generado' || sec === 'ingresos')
              ? 'Hay ingresos o IVA generado en libros que no llegaron al formulario: revisar facturas del período no incluidas y corregir el borrador antes de presentar.'
              : 'Conciliar el renglón contra el auxiliar del período e identificar los asientos que explican la diferencia; ajustar el borrador o la contabilidad según corresponda.',
        },
        bitacora: [
          { tipo: 'lectura', texto: `Leí el renglón en el borrador (${fmt(d)}) y lo calculé desde el auxiliar (${fmt(l)}).` },
          { tipo: 'contraste', texto: `${reglaId}: diferencia ${fmt(dif)}, por encima del redondeo del formulario (${fmt(tol)}).`, referencia: { regla: reglaId } },
          { tipo: 'clasificacion', texto: `Severidad ${sev.severidad.toUpperCase()}: ${sev.explicacion}.` },
        ],
      })
      fila(ced, T_LIBROS, valores, 'diferencia', { regla: reglaId, propuesta: pr })
    }
    const REGLA_SECCION: Record<SeccionIva, string> = { ingresos: 'I-10', compras: 'I-15', generado: 'I-12', descontable: 'I-13', liquidacion: 'I-14' }
    for (const id of ids) {
      const d = cifras[id].declarado
      const l = cifras[id].libros
      if (d === null || l === null) continue
      comparadas.add(id)
      comparar(id, id === 'iva-ing-devoluciones' ? 'I-11' : id === 'iva-retenido' ? 'I-14' : REGLA_SECCION[SECCION_DE[id]], d, l)
    }
    // Totales: solo donde ninguno de sus componentes digitables se pudo comparar
    // (p. ej. ingresos sin tarifa en el nombre de la subcuenta).
    const formulaDe = (id: string) => CIFRAS_CATALOGO.iva.flatMap((s) => s.renglones).find((r) => r.id === id)?.formula?.map((t) => t.id) ?? []
    for (const [total, reglaId] of [['iva-ing-brutos', 'I-10'], ['iva-generado', 'I-12'], ['iva-descontable', 'I-13']] as [string, string][]) {
      const componentes = formulaDe(total)
      if (componentes.some((c) => comparadas.has(c))) continue
      const d = dec(total)
      const l = lib(total)
      if (d === null || l === null) continue
      comparar(total, reglaId, d, l, { componentes: componentes.length, titulo: `${ETIQUETA.get(total)}: declarado y libros no coinciden` })
    }
    // I-16: ingresos en libros sin IVA generado en libros.
    const brutosL = lib('iva-ing-brutos')
    const genL = lib('iva-generado')
    if (brutosL !== null && brutosL > 0 && (genL === null || genL === 0)) {
      regla('I-16', `I-16: ingresos según libros ${fmt(brutosL)} sin IVA generado en 2408.`)
      itemsConDatos.add('ingresos-conciliados')
      const pr = proponer({
        cedula: 'ingresos-libros',
        tipo: 'juicio', reglasIds: ['I-16'], titulo: 'Ingresos sin IVA generado en la contabilidad', renglonId: 'iva-ing-brutos', monto: brutosL, severidad: 'media', certeza: 'requiere_evidencia',
        datos: [{ etiqueta: 'ingresos según libros', valor: fmt(brutosL) }, { etiqueta: 'IVA generado según libros', valor: fmt(genL ?? 0) }],
        checklistItem: 'ingresos-conciliados',
        contenido: {
          descripcion: `La contabilidad registra ${fmt(brutosL)} de ingresos en el período y ninguna subcuenta de IVA generado con movimiento.`,
          para: 'Decide si la empresa vende excluido o exento (y así queda verificado) o si debió generar IVA.',
          opciones: [{ clave: 'excluido', label: 'Ventas excluidas o exentas: verificado' }, { clave: 'revisar', label: 'Debió generar IVA: revisar facturación' }],
          norma: 'Arts. 424, 476 y 481 ET (bienes y servicios excluidos y exentos) · RUT responsabilidad 48',
          destino: 'checklist', tributario: { nota: 'Ingresos del período sin IVA generado: la empresa factura operaciones excluidas o exentas.' },
        },
        bitacora: [{ tipo: 'regla', texto: 'I-16: clase 4 con movimiento y 2408 generado sin movimiento.', referencia: { regla: 'I-16' } }],
      })
      fila(C.ingresos, T_PUNTOS, { punto: 'Ingresos en libros sin IVA generado en 2408', dato: 'Clase 4 con movimiento y ninguna subcuenta de IVA generado', valor: brutosL }, 'por_confirmar', { regla: 'I-16', propuesta: pr })
    }
  } else {
    for (const c of [C.ingresos, C.generado, C.descontable, C.retenciones]) if (c.estado === 'ejecutada') { c.estado = 'sin_insumos'; c.motivo = 'Sin auxiliar ni balance de prueba: no se comparó contra libros.' }
  }

  // ─── Bloque C · DIAN vs formulario ─────────────────────────────────────────
  if (entrada.dian) {
    const { resumen: D, nitReporte, nitEmpresa } = entrada.dian
    const soloDigitos = (s: string | null) => (s ?? '').replace(/\D/g, '').replace(/^(\d{9,10})\d$/, (_, base: string) => base)
    const nitOk = !nitReporte || !nitEmpresa || soloDigitos(nitReporte) === soloDigitos(nitEmpresa) || soloDigitos(nitReporte) === (nitEmpresa ?? '').replace(/\D/g, '')
    lectura(`Reporte DIAN: ${D.ventas.n} factura(s) de venta, ${D.notasCreditoVentas.n} nota(s) crédito, ${D.compras.n} factura(s) recibidas en el período (${D.comprasVentana.n} en la ventana de descontables), ${D.comprasNoObligados.n} documento(s) soporte.`, { paso: 'P-05' })
    for (const a of entrada.dian.advertencias) lectura(a, { paso: 'P-05' })
    const tDocs: Tabla = { id: 'documentos', titulo: 'Documentos electrónicos del período por tipo', descripcion: 'Lo que se tomó del reporte. La base es estimada: total menos impuestos.', columnas: [{ clave: 'tipo', titulo: 'Tipo de documento', formato: 'texto' }, { clave: 'n', titulo: 'Documentos', formato: 'numero' }, { clave: 'base', titulo: 'Base estimada', formato: 'moneda' }, { clave: 'iva', titulo: 'IVA', formato: 'moneda' }, { clave: 'total', titulo: 'Total', formato: 'moneda' }] }
    for (const [tipo, v, nota] of [
      ['Facturas de venta emitidas', D.ventas, null], ['Notas crédito de venta emitidas', D.notasCreditoVentas, 'Su IVA va a la casilla 79; no resta del generado.'], ['Notas débito de venta emitidas', D.notasDebitoVentas, null],
      ['Facturas de compra recibidas en el período', D.compras, null], ['Facturas de compra recibidas en la ventana de descontables', D.comprasVentana, 'El período y los dos anteriores (art. 496 ET).'],
      ['Notas crédito de compra recibidas', D.notasCreditoCompras, null], ['Documentos soporte con no obligados', D.comprasNoObligados, 'Emitidos por la empresa: son compras.'],
    ] as [string, typeof D.ventas, string | null][]) {
      fila(C.lecturaDian, tDocs, { tipo, n: v.n, base: Math.round(v.base), iva: Math.round(v.iva), total: Math.round(v.total) }, 'informativo', { regla: 'P-05', nota })
    }
    fila(C.lecturaDian, T_PUNTOS, { punto: 'El reporte es de esta empresa', dato: `NIT del reporte ${nitReporte ?? 'sin identificar'} · NIT de la empresa ${nitEmpresa ?? 'sin registrar'}`, valor: null }, !nitReporte || !nitEmpresa ? 'no_verificable' : nitOk ? 'conforme' : 'diferencia', { regla: 'P-06' })
    fila(C.lecturaDian, T_PUNTOS, { punto: 'El reporte cubre todo el período', dato: D.mesesSinEmitidos.length ? `Sin documentos emitidos en ${D.mesesSinEmitidos.join(', ')}` : 'Hay documentos emitidos en todos los meses', valor: null }, D.mesesSinEmitidos.length ? 'por_confirmar' : 'conforme', { regla: 'I-27' })
    for (const a of entrada.dian.advertencias) C.lecturaDian.limitaciones.push(a)
    if (!nitOk) {
      regla('P-06', `P-06: el reporte es del NIT ${nitReporte}; la empresa es ${nitEmpresa}.`)
      proponer({
        cedula: 'lectura-dian',
        tipo: 'ambiguedad', reglasIds: ['P-06'], titulo: 'El reporte DIAN no parece ser de esta empresa', renglonId: null, monto: null, severidad: 'alta', certeza: 'verificado',
        datos: [{ etiqueta: 'NIT del reporte', valor: nitReporte ?? '—' }, { etiqueta: 'NIT de la empresa', valor: nitEmpresa ?? '—' }], checklistItem: null,
        contenido: { descripcion: `Los documentos emitidos del reporte tienen como emisor el NIT ${nitReporte}, y la empresa está registrada con el NIT ${nitEmpresa}.`, para: 'Con el reporte de otro NIT, ningún cruce contra la DIAN es válido: el bloque C no corrió.', opciones: [{ clave: 'otro', label: 'Es otro archivo: volver a cargar' }, { clave: 'confirmar', label: 'Es esta empresa (NIT distinto en la plataforma): corregir el NIT' }] },
        bitacora: [{ tipo: 'regla', texto: 'P-06: NIT del reporte distinto del NIT de la empresa.', referencia: { regla: 'P-06' } }],
      })
      limitaciones.push({ regla: 'I-20..I-27', motivo: 'El reporte DIAN es de otro NIT.' })
      for (const c of [C.dianVentas, C.dianCompras]) if (c.estado === 'ejecutada') { c.estado = 'sin_insumos'; c.motivo = 'El reporte DIAN cargado es de otro NIT: no se cruzó.' }
    } else {
      const cruce = (reglaId: string, id: string, d: number | null, dianValor: number, opts: { titulo: string; certeza: CertezaPropuesta; descripcion: (dif: number) => string; norma: string; recomendacion: (dif: number) => string; escaladorSi?: (dif: number) => Escalador[]; datosExtra?: DatoPropuesta[]; severidadFija?: SeveridadPropuesta; item: string }) => {
        itemsConDatos.add(opts.item)
        const declarado = d ?? 0
        const dif = declarado - dianValor
        const tol = toleranciaCruce(Math.max(declarado, dianValor))
        regla(reglaId, `${reglaId}: ${ETIQUETA.get(id) ?? id} declarado ${fmt(declarado)} vs DIAN ${fmt(dianValor)}; diferencia ${fmt(dif)}, tolerancia ${fmt(tol)}.`)
        const valores = { partida: ETIQUETA.get(id) ?? id, casilla: CASILLA[id] ?? (id === 'iva-desc-devoluciones' ? '79' : null), declarado, referencia: Math.round(dianValor), diferencia: Math.round(dif), tolerancia: Math.round(tol) }
        if (Math.abs(dif) <= tol) { fila(C.dianVentas, T_DIAN, valores, 'conforme', { regla: reglaId }); return }
        const sev = opts.severidadFija ? { severidad: opts.severidadFija, proporcion: (Math.abs(dif) / Math.max(Math.abs(declarado), Math.abs(dianValor), 1)) * 100, explicacion: 'severidad fija de la regla' } : severidadPorProporcion(dif, Math.max(Math.abs(declarado), Math.abs(dianValor)), opts.escaladorSi?.(dif) ?? [])
        const pr = proponer({
          cedula: 'dian-ventas',
          tipo: 'hallazgo', reglasIds: [reglaId], titulo: opts.titulo, renglonId: id, monto: Math.abs(dif), severidad: sev.severidad, certeza: opts.certeza,
          datos: [{ etiqueta: 'declarado', valor: fmt(declarado) }, { etiqueta: 'según DIAN', valor: fmt(dianValor) }, { etiqueta: 'diferencia', valor: `${dif < 0 ? '−' : ''}${fmt(dif)}` }, ...(opts.datosExtra ?? [])],
          checklistItem: opts.item,
          contenido: { descripcion: opts.descripcion(dif), norma: opts.norma, recomendacion: opts.recomendacion(dif) },
          bitacora: [
            { tipo: 'lectura', texto: `Sumé los documentos electrónicos del período (${entrada.periodo.desde} a ${entrada.periodo.hasta}).` },
            { tipo: 'contraste', texto: `${reglaId}: diferencia ${fmt(dif)} frente a una tolerancia de ${fmt(tol)}.`, referencia: { regla: reglaId } },
            { tipo: 'clasificacion', texto: `Severidad ${sev.severidad.toUpperCase()}: ${sev.explicacion}.` },
          ],
        })
        fila(C.dianVentas, T_DIAN, valores, opts.certeza === 'verificado' ? 'diferencia' : 'por_confirmar', { regla: reglaId, propuesta: pr, nota: pr.nota ?? (opts.certeza === 'verificado' ? null : 'La base DIAN es estimada.') })
      }
      if (D.ventas.n + D.notasCreditoVentas.n > 0 || dec('iva-generado') !== null) {
        // El generado del formulario (c67) es bruto: el IVA de las notas crédito
        // no lo resta, va a la casilla 79 como IVA resultante por devoluciones.
        const ivaFacturado = D.ventas.iva + D.notasDebitoVentas.iva
        cruce('I-20', 'iva-generado', dec('iva-generado'), ivaFacturado, {
          titulo: 'IVA generado declarado y facturado electrónicamente no coinciden', certeza: 'verificado', item: 'iva-generado',
          descripcion: (dif) => `El IVA generado declarado (${fmt(dec('iva-generado') ?? 0)}, casilla 67) ${dif > 0 ? 'supera' : 'es inferior a'} el IVA de las ${D.ventas.n} factura(s) de venta emitidas en el período (${fmt(ivaFacturado)}${D.notasDebitoVentas.n ? ', incluidas notas débito' : ''}). Diferencia de ${fmt(dif)}. Las notas crédito no restan aquí: su IVA va a la casilla 79.`,
          norma: 'Arts. 429, 447 y 617 ET · Resolución DIAN 000042 de 2020 (factura electrónica)',
          recomendacion: (dif) => dif < 0 ? 'Hay IVA facturado electrónicamente que no llegó al formulario: revisar facturas del período omitidas o mal fechadas.' : 'Hay IVA declarado sin factura electrónica que lo respalde: verificar ventas por otros medios (POS, tiquetes) o error en el borrador.',
          escaladorSi: (dif) => (dif < 0 ? ['omision'] : []),
          datosExtra: [{ etiqueta: 'facturas de venta', valor: String(D.ventas.n) }, { etiqueta: 'notas crédito (van a c79)', valor: String(D.notasCreditoVentas.n) }],
        })
        if (D.notasCreditoVentas.n > 0 || (dec('iva-desc-devoluciones') ?? 0) > 0) {
          cruce('I-24', 'iva-desc-devoluciones', dec('iva-desc-devoluciones'), D.notasCreditoVentas.iva, {
            titulo: 'IVA de las notas crédito y casilla 79 no coinciden', certeza: 'verificado', item: 'ingresos-conciliados',
            descripcion: (dif) => `El IVA resultante por devoluciones en ventas (${fmt(dec('iva-desc-devoluciones') ?? 0)}, casilla 79) difiere en ${fmt(dif)} del IVA de las ${D.notasCreditoVentas.n} nota(s) crédito emitidas en el período (${fmt(D.notasCreditoVentas.iva)}).`,
            norma: 'Art. 484 ET (disminución del impuesto por devoluciones, anulaciones y rescisiones)',
            recomendacion: () => 'El IVA de cada nota crédito del período se lleva a la casilla 79; ajustar el borrador o las notas que falten.',
          })
        }
        cruce('I-21', 'iva-ing-netos', dec('iva-ing-netos'), D.ingresosNetos, {
          titulo: 'Ingresos declarados y facturados electrónicamente no coinciden', certeza: 'requiere_evidencia', item: 'ingresos-conciliados',
          descripcion: (dif) => `Los ingresos netos declarados (${fmt(dec('iva-ing-netos') ?? 0)}, casilla 43) difieren en ${fmt(dif)} de la base estimada de las facturas de venta del período netas de notas crédito (${fmt(D.ingresosNetos)}). La base DIAN es estimada: el reporte no trae base gravable, se calcula como total menos impuestos.`,
          norma: 'Arts. 420 y 429 ET',
          recomendacion: (dif) => dif < 0 ? 'Facturado mayor que declarado: revisar ingresos omitidos en el formulario.' : 'Declarado mayor que facturado: identificar los ingresos sin factura electrónica (POS, documentos equivalentes) y su soporte.',
          escaladorSi: (dif) => (dif < 0 ? ['omision'] : []),
        })
        cruce('I-24', 'iva-ing-devoluciones', dec('iva-ing-devoluciones'), D.notasCreditoVentas.base, {
          titulo: 'Devoluciones declaradas y notas crédito emitidas no coinciden', certeza: 'verificado', item: 'ingresos-conciliados',
          descripcion: (dif) => `Las devoluciones declaradas (${fmt(dec('iva-ing-devoluciones') ?? 0)}, casilla 42) difieren en ${fmt(dif)} de la base de las ${D.notasCreditoVentas.n} nota(s) crédito emitidas en el período (${fmt(D.notasCreditoVentas.base)}).`,
          norma: 'Art. 484 ET · art. 1.6.1.4.6 DUR 1625 de 2016 (notas crédito)',
          recomendacion: () => 'Cada devolución declarada debe tener su nota crédito electrónica del período; ajustar el borrador o emitir las notas que falten.',
        })
      }
      {
        // Descontable que nace de compras: sin el IVA de devoluciones en ventas (c79).
        const desc = dec('iva-descontable') === null ? null : (dec('iva-descontable') ?? 0) - (dec('iva-desc-devoluciones') ?? 0)
        if (desc !== null) {
          itemsConDatos.add('iva-descontable')
          const soporte = D.comprasVentana.iva - D.notasCreditoCompras.iva
          const tol = toleranciaCruce(Math.max(desc, soporte))
          regla('I-22', `I-22: descontable declarado ${fmt(desc)} vs IVA de facturas recibidas en la ventana ${fmt(soporte)} (período: ${fmt(D.compras.iva)}); tolerancia ${fmt(tol)}.`)
          const T_SOP: Tabla = { id: 'soporte', titulo: 'Descontable declarado contra facturas electrónicas recibidas', columnas: COL_CRUCE('Según DIAN') }
          const vSop = { partida: 'Descontable (sin devoluciones en ventas) contra el IVA de facturas recibidas en la ventana', casilla: '81 − 79', declarado: desc, referencia: Math.round(soporte), diferencia: Math.round(desc - soporte), tolerancia: Math.round(tol) }
          const vPer = { partida: 'IVA de facturas recibidas en el período no tomado como descontable', casilla: '81 − 79', declarado: desc, referencia: Math.round(D.compras.iva), diferencia: Math.round(desc - D.compras.iva), tolerancia: Math.round(tol) }
          if (!(desc > soporte + tol)) fila(C.dianCompras, T_SOP, vSop, 'conforme', { regla: 'I-22', nota: 'Todo el descontable tiene factura electrónica en la ventana.' })
          if (!(desc > soporte + tol) && !(desc < D.compras.iva - tol)) fila(C.dianCompras, T_SOP, vPer, 'conforme', { regla: 'I-22' })
          if (desc > soporte + tol) {
            const dif = desc - soporte
            const sev = severidadPorProporcion(dif, Math.max(desc, soporte), ['descontable_sin_soporte'])
            const pr = proponer({
              cedula: 'dian-compras',
              tipo: 'hallazgo', reglasIds: ['I-22'], titulo: 'IVA descontable sin soporte en factura electrónica', renglonId: 'iva-descontable', monto: dif, severidad: sev.severidad, certeza: 'verificado',
              datos: [{ etiqueta: 'descontable declarado (c81)', valor: fmt(desc) }, { etiqueta: 'IVA facturas recibidas (ventana art. 496)', valor: fmt(soporte) }, { etiqueta: 'sin soporte', valor: fmt(dif) }],
              checklistItem: 'iva-descontable',
              contenido: {
                descripcion: `Se declaran ${fmt(desc)} de impuestos descontables (casilla 81), pero las facturas electrónicas recibidas en el período y los dos anteriores solo soportan ${fmt(soporte)} de IVA. ${fmt(dif)} no tienen factura electrónica que los respalde.`,
                norma: 'Art. 771-2 ET (factura como requisito del descontable) · art. 496 ET (oportunidad) · art. 617 ET',
                recomendacion: 'Identificar los descontables sin factura electrónica: si provienen de documentos soporte, importaciones o facturas de talonario, verificar su procedencia; si no, retirarlos del borrador antes de presentar.',
              },
              bitacora: [{ tipo: 'contraste', texto: `I-22: ${fmt(dif)} por encima del IVA soportado.`, referencia: { regla: 'I-22' } }, { tipo: 'clasificacion', texto: `Severidad ${sev.severidad.toUpperCase()}: ${sev.explicacion}.` }],
            })
            fila(C.dianCompras, T_SOP, vSop, 'diferencia', { regla: 'I-22', propuesta: pr })
          } else if (desc < D.compras.iva - tol) {
            const dif = D.compras.iva - desc
            const pr = proponer({
              cedula: 'dian-compras',
              tipo: 'hallazgo', reglasIds: ['I-22'], titulo: 'IVA de facturas recibidas no tomado como descontable', renglonId: 'iva-descontable', monto: dif, severidad: 'baja', certeza: 'verificado',
              datos: [{ etiqueta: 'descontable declarado (c81)', valor: fmt(desc) }, { etiqueta: 'IVA facturas recibidas del período', valor: fmt(D.compras.iva) }, { etiqueta: 'no tomado', valor: fmt(dif) }],
              checklistItem: 'iva-descontable',
              contenido: {
                descripcion: `Las facturas recibidas en el período traen ${fmt(D.compras.iva)} de IVA y el formulario solo toma ${fmt(desc)} como descontable: ${fmt(dif)} quedan sin descontar.`,
                norma: 'Arts. 488 y 496 ET (puede tomarse en los dos períodos siguientes)',
                recomendacion: 'Verificar si el IVA no tomado corresponde a compras no imputables a operaciones gravadas (no procede) o si se dejó de descontar por omisión (puede tomarse hasta dos períodos después).',
              },
              bitacora: [{ tipo: 'contraste', texto: `I-22: ${fmt(dif)} de IVA recibido no descontado (informativo).`, referencia: { regla: 'I-22' } }],
            })
            fila(C.dianCompras, T_SOP, vPer, 'por_confirmar', { regla: 'I-22', propuesta: pr })
          }
        }
      }
      if (D.comprasNoObligados.base > 0) {
        const ng = dec('iva-comp-no-gravadas') ?? 0
        const tol = toleranciaCruce(Math.max(ng, D.comprasNoObligados.base))
        regla('I-23', `I-23: compras a no obligados según DIAN ${fmt(D.comprasNoObligados.base)} vs compras no gravadas declaradas ${fmt(ng)}.`)
        itemsConDatos.add('iva-descontable')
        const T_NO: Tabla = { id: 'no-obligados', titulo: 'Compras no gravadas contra documentos soporte', columnas: COL_CRUCE('Según DIAN') }
        const vNo = { partida: 'Compras no gravadas declaradas contra documentos soporte con no obligados', casilla: CASILLA['iva-comp-no-gravadas'], declarado: ng, referencia: Math.round(D.comprasNoObligados.base), diferencia: Math.round(ng - D.comprasNoObligados.base), tolerancia: Math.round(tol) }
        if (!(ng + tol < D.comprasNoObligados.base)) fila(C.dianCompras, T_NO, vNo, 'conforme', { regla: 'I-23' })
        if (ng + tol < D.comprasNoObligados.base) {
          const pr = proponer({
            cedula: 'dian-compras',
            tipo: 'hallazgo', reglasIds: ['I-23'], titulo: 'Compras a no obligados por debajo de los documentos soporte emitidos', renglonId: 'iva-comp-no-gravadas', monto: D.comprasNoObligados.base - ng, severidad: 'baja', certeza: 'requiere_evidencia',
            datos: [{ etiqueta: 'documentos soporte (netos)', valor: fmt(D.comprasNoObligados.base) }, { etiqueta: 'compras no gravadas declaradas', valor: fmt(ng) }],
            checklistItem: 'iva-descontable',
            contenido: {
              descripcion: `La empresa emitió ${D.comprasNoObligados.n} documento(s) soporte con no obligados por ${fmt(D.comprasNoObligados.base)} en el período, pero las compras no gravadas declaradas (casillas 46 a 49 y 54) suman ${fmt(ng)}.`,
              norma: 'Art. 771-2 ET · Resolución DIAN 000167 de 2021 (documento soporte con no obligados)',
              recomendacion: 'Las compras a no obligados a facturar son compras sin IVA y deben declararse en la sección de compras no gravadas.',
            },
            bitacora: [{ tipo: 'contraste', texto: `I-23: faltan ${fmt(D.comprasNoObligados.base - ng)} en compras no gravadas.`, referencia: { regla: 'I-23' } }],
          })
          fila(C.dianCompras, T_NO, vNo, 'por_confirmar', { regla: 'I-23', propuesta: pr })
        }
      }
      if (D.recibidasTarde > 0) {
        regla('I-25', `I-25: ${D.recibidasTarde} factura(s) con fecha de emisión en el período recibidas después del cierre.`)
        const pr = proponer({
          cedula: 'dian-compras',
          tipo: 'juicio', reglasIds: ['I-25'], titulo: 'Facturas del período recibidas después del cierre', renglonId: 'iva-descontable', monto: null, severidad: 'baja', certeza: 'requiere_evidencia',
          datos: [{ etiqueta: 'facturas', valor: String(D.recibidasTarde) }], checklistItem: 'iva-descontable',
          contenido: {
            descripcion: `${D.recibidasTarde} factura(s) recibidas tienen fecha de emisión dentro del período pero fecha de recepción posterior a su cierre.`,
            para: 'Decide si su IVA se tomó en este período o en el de recepción.',
            opciones: [{ clave: 'periodo_recepcion', label: 'Se tomaron en el período de recepción: verificado' }, { clave: 'revisar', label: 'Revisar oportunidad' }],
            norma: 'Art. 496 ET (oportunidad de los descontables)', destino: 'checklist', tributario: { nota: 'Facturas recibidas después del cierre: IVA tomado en el período de recepción.' },
          },
          bitacora: [{ tipo: 'regla', texto: 'I-25: emisión en el período, recepción posterior.', referencia: { regla: 'I-25' } }],
        })
        fila(C.dianCompras, T_PUNTOS, { punto: 'Facturas del período recibidas después del cierre', dato: `${D.recibidasTarde} factura(s)`, valor: null }, 'por_confirmar', { regla: 'I-25', propuesta: pr })
      } else {
        fila(C.dianCompras, T_PUNTOS, { punto: 'Facturas del período recibidas después del cierre', dato: 'Ninguna', valor: null }, 'conforme', { regla: 'I-25' })
      }
      if (D.contingencia > 0) regla('I-26', `I-26: ${D.contingencia} factura(s) de contingencia en el período: verificar su transmisión.`)
      fila(C.dianCompras, T_PUNTOS, { punto: 'Facturas de contingencia en el período', dato: D.contingencia > 0 ? `${D.contingencia} factura(s): verificar su transmisión` : 'Ninguna', valor: null }, D.contingencia > 0 ? 'por_confirmar' : 'conforme', { regla: 'I-26' })
      if (D.mesesSinEmitidos.length) limitaciones.push({ regla: 'I-27', motivo: `El reporte no trae documentos emitidos en ${D.mesesSinEmitidos.join(', ')}: puede no cubrir todo el período.` })
    }
  } else {
    limitaciones.push({ regla: 'I-20..I-27', motivo: 'Sin reporte de documentos electrónicos de la DIAN: no se cruzó contra facturación electrónica.' })
    for (const c of [C.lecturaDian, C.dianVentas, C.dianCompras]) if (c.estado === 'ejecutada') { c.estado = 'sin_insumos'; c.motivo = 'No se cargó el reporte de documentos electrónicos de la DIAN.' }
  }

  // ─── Bloque D · continuidad y juicio ───────────────────────────────────────
  {
    const c84 = dec('iva-saldo-favor-ant')
    if (entrada.anterior) {
      const totalAnt = resolverCifras('iva', entrada.anterior.cifras)['iva-total']?.declarado ?? null
      if (totalAnt === null) {
        limitaciones.push({ regla: 'I-30', motivo: `La revisión de ${entrada.anterior.etiqueta} no tiene cifras: no se verificó el arrastre del saldo a favor.` })
      } else {
        itemsConDatos.add('saldos-favor')
        const saldoFavorAnt = totalAnt < 0 ? -totalAnt : 0
        const declarado = c84 ?? 0
        const dif = declarado - saldoFavorAnt
        regla('I-30', `I-30: saldo a favor del período anterior (${entrada.anterior.etiqueta}) ${fmt(saldoFavorAnt)} vs casilla 84 ${fmt(declarado)}.`)
        const T_SALDO: Tabla = { id: 'arrastre', titulo: `Arrastre del saldo a favor de ${entrada.anterior.etiqueta}`, columnas: COL_CRUCE('Declaración anterior') }
        const vSaldo = { partida: 'Saldo a favor del período anterior imputado', casilla: '84', declarado, referencia: saldoFavorAnt, diferencia: dif, tolerancia: toleranciaRedondeo(1) }
        if (Math.abs(dif) <= toleranciaRedondeo(1)) fila(C.saldo, T_SALDO, vSaldo, 'conforme', { regla: 'I-30' })
        if (Math.abs(dif) > toleranciaRedondeo(1) && !(saldoFavorAnt > 0 && declarado === 0)) {
          const pr = proponer({
            cedula: 'saldo-favor',
            tipo: 'hallazgo', reglasIds: ['I-30'], titulo: 'El saldo a favor arrastrado no coincide con la declaración anterior', renglonId: 'iva-saldo-favor-ant', monto: Math.abs(dif), severidad: 'alta', certeza: 'verificado',
            datos: [{ etiqueta: 'casilla 84 declarada', valor: fmt(declarado) }, { etiqueta: `saldo a favor ${entrada.anterior.etiqueta}`, valor: fmt(saldoFavorAnt) }, { etiqueta: 'diferencia', valor: fmt(dif) }],
            checklistItem: 'saldos-favor',
            contenido: {
              descripcion: `La casilla 84 declara ${fmt(declarado)} como saldo a favor del período anterior, pero la declaración de ${entrada.anterior.etiqueta} cerró con ${fmt(saldoFavorAnt)} a favor.`,
              norma: 'Arts. 815 y 850 ET (imputación del saldo a favor)',
              recomendacion: 'Imputar exactamente el saldo a favor de la declaración anterior, salvo que se haya solicitado en devolución o compensación (en ese caso la casilla 84 debe ir en cero).',
            },
            bitacora: [{ tipo: 'contraste', texto: `I-30: diferencia ${fmt(dif)} contra la revisión anterior de la plataforma.`, referencia: { regla: 'I-30' } }],
          })
          fila(C.saldo, T_SALDO, vSaldo, 'diferencia', { regla: 'I-30', propuesta: pr })
        }
        if (saldoFavorAnt > 0 && declarado === 0) {
          regla('I-31', `I-31: saldo a favor anterior ${fmt(saldoFavorAnt)} sin imputar.`)
          const pr = proponer({
            cedula: 'saldo-favor',
            tipo: 'juicio', reglasIds: ['I-31'], titulo: 'Saldo a favor del período anterior sin imputar', renglonId: 'iva-saldo-favor-ant', monto: saldoFavorAnt, severidad: 'media', certeza: 'requiere_evidencia',
            datos: [{ etiqueta: `saldo a favor ${entrada.anterior.etiqueta}`, valor: fmt(saldoFavorAnt) }, { etiqueta: 'casilla 84', valor: fmt(0) }],
            checklistItem: 'saldos-favor',
            contenido: {
              descripcion: `La declaración de ${entrada.anterior.etiqueta} cerró con ${fmt(saldoFavorAnt)} a favor y este formulario no lo imputa en la casilla 84.`,
              para: 'Decide si se pidió en devolución o compensación, o si debe imputarse.',
              opciones: [{ clave: 'devolucion', label: 'Se solicitó en devolución o compensación: verificado' }, { clave: 'imputar', label: 'Debe imputarse: corregir el borrador' }],
              norma: 'Arts. 815 y 850 ET', destino: 'checklist', tributario: { nota: 'Saldo a favor anterior no imputado: solicitado en devolución o compensación.' },
            },
            bitacora: [{ tipo: 'regla', texto: 'I-31: saldo a favor anterior > 0 y casilla 84 en cero.', referencia: { regla: 'I-31' } }],
          })
          fila(C.saldo, T_SALDO, vSaldo, 'por_confirmar', { regla: 'I-31', propuesta: pr, nota: pr.nota ?? 'Saldo a favor anterior sin imputar.' })
        }
      }
    } else if (c84 !== null && c84 > 0) {
      regla('I-30', `I-30: casilla 84 ${fmt(c84)} sin revisión anterior en la plataforma para contrastar.`)
      const pr = proponer({
        cedula: 'saldo-favor',
        tipo: 'documento', reglasIds: ['I-30'], titulo: 'Declaración de IVA del período anterior', renglonId: 'iva-saldo-favor-ant', monto: c84, severidad: 'media', certeza: 'requiere_evidencia',
        datos: [{ etiqueta: 'casilla 84 declarada', valor: fmt(c84) }], checklistItem: 'saldos-favor',
        contenido: {
          descripcion: `El formulario imputa ${fmt(c84)} de saldo a favor del período anterior y la plataforma no tiene la revisión de ese período.`,
          para: `Verificar que la casilla 84 coincida con el saldo a favor (casilla 89) de la declaración anterior.`,
          norma: 'Arts. 815 y 850 ET',
        },
        bitacora: [{ tipo: 'solicitud', texto: 'I-30: se pide la declaración anterior para contrastar la casilla 84.', referencia: { regla: 'I-30' } }],
      })
      fila(C.saldo, T_PUNTOS, { punto: 'Saldo a favor del período anterior imputado', dato: 'Casilla 84, sin declaración anterior para contrastar', valor: c84 }, 'no_verificable', { regla: 'I-30', propuesta: pr })
    } else {
      limitaciones.push({ regla: 'I-30', motivo: 'Sin revisión del período anterior en la plataforma.' })
      if (C.saldo.estado === 'ejecutada') { C.saldo.estado = 'sin_insumos'; C.saldo.motivo = 'El formulario no imputa saldo a favor anterior y no hay revisión del período anterior en la plataforma.' }
    }
    if (C.saldo.estado === 'ejecutada' && C.saldo.tablas.length === 0) { C.saldo.estado = 'sin_insumos'; C.saldo.motivo = `La revisión de ${entrada.anterior?.etiqueta ?? 'el período anterior'} no tiene cifras declaradas.` }
  }
  {
    const excl = (dec('iva-ing-excluidos') ?? 0) + (dec('iva-ing-no-gravadas') ?? 0)
    const desc = dec('iva-descontable')
    const ajuste = dec('iva-desc-ajustes') ?? 0
    if (desc !== null && dec('iva-ing-brutos') !== null) {
      itemsConDatos.add('proporcionalidad')
      const T_PROP: Tabla = { id: 'proporcionalidad', titulo: 'Operaciones excluidas, descontables y ajuste', columnas: [{ clave: 'dato', titulo: 'Dato', formato: 'texto' }, { clave: 'casilla', titulo: 'Casilla', formato: 'texto' }, { clave: 'valor', titulo: 'Valor', formato: 'moneda' }] }
      const aplica = excl > 0 && desc > 0 && ajuste === 0
      fila(C.proporcionalidad, T_PROP, { dato: 'Operaciones excluidas y no gravadas', casilla: '39, 40', valor: excl }, 'informativo', { regla: 'I-32' })
      fila(C.proporcionalidad, T_PROP, { dato: 'Impuestos descontables', casilla: '81', valor: desc }, 'informativo', { regla: 'I-32' })
      const filaAjuste = (pr: Prop | null) => fila(C.proporcionalidad, T_PROP, { dato: 'Ajuste de descontables por prorrata', casilla: '80', valor: ajuste }, aplica ? 'por_confirmar' : 'conforme', { regla: 'I-32', propuesta: pr, nota: pr?.nota ?? (aplica ? 'Hay excluidos y descontables, y no hay ajuste.' : excl > 0 ? 'El formulario trae ajuste de descontables.' : 'Sin operaciones excluidas: la proporcionalidad no aplica.') })
      if (!aplica) filaAjuste(null)
      if (excl > 0 && desc > 0 && ajuste === 0) {
        regla('I-32', `I-32: operaciones excluidas/no gravadas ${fmt(excl)}, descontables ${fmt(desc)} y sin ajuste de descontables (c80).`)
        filaAjuste(proponer({
          cedula: 'proporcionalidad',
          tipo: 'juicio', reglasIds: ['I-32'], titulo: 'Proporcionalidad del IVA descontable', renglonId: 'iva-descontable', monto: null, severidad: 'media', certeza: 'requiere_evidencia',
          datos: [{ etiqueta: 'operaciones excluidas y no gravadas', valor: fmt(excl) }, { etiqueta: 'descontables (c81)', valor: fmt(desc) }, { etiqueta: 'ajuste de descontables (c80)', valor: fmt(ajuste) }],
          checklistItem: 'proporcionalidad',
          contenido: {
            descripcion: `El período tiene ${fmt(excl)} en operaciones excluidas o no gravadas y ${fmt(desc)} de descontables, sin ajuste por prorrata en la casilla 80.`,
            para: 'El IVA de costos comunes a operaciones gravadas y excluidas solo se descuenta en proporción a las gravadas.',
            opciones: [{ clave: 'documentada', label: 'Aplicó prorrata y está documentada: verificado' }, { clave: 'no_aplica', label: 'Los costos son imputables solo a gravadas: verificado' }, { clave: 'revisar', label: 'Revisar la proporcionalidad' }],
            norma: 'Art. 490 ET', destino: 'checklist', tributario: { nota: 'Proporcionalidad del art. 490 ET revisada.' },
          },
          bitacora: [{ tipo: 'regla', texto: 'I-32: hay excluidos, descontables y no hay ajuste.', referencia: { regla: 'I-32' } }],
        }))
      } else {
        regla('I-32', excl > 0 ? 'I-32: hay operaciones excluidas y el formulario trae ajuste de descontables.' : 'I-32: sin operaciones excluidas ni no gravadas, la proporcionalidad no aplica.')
      }
    }
  }
  {
    // I-34 presentación contra vencimiento (fechas registradas en la revisión).
    if (entrada.fechaPresentacion && entrada.fechaVencimiento) {
      itemsConDatos.add('presentacion-pago')
      const datoFechas = `Vencimiento ${entrada.fechaVencimiento} · presentación ${entrada.fechaPresentacion}`
      regla('I-34', `I-34: presentada ${entrada.fechaPresentacion}, vencía ${entrada.fechaVencimiento}.`)
      if (entrada.fechaPresentacion <= entrada.fechaVencimiento) {
        fila(C.oportunidad, T_PUNTOS, { punto: 'Presentación dentro del plazo', dato: datoFechas, valor: null }, 'conforme', { regla: 'I-34' })
      } else {
        const pr = proponer({
          cedula: 'oportunidad',
          tipo: 'hallazgo', reglasIds: ['I-34'], titulo: 'Declaración presentada después del vencimiento', renglonId: 'iva-sanciones', monto: dec('iva-sanciones'), severidad: 'alta', certeza: 'verificado',
          datos: [{ etiqueta: 'vencimiento', valor: entrada.fechaVencimiento }, { etiqueta: 'presentación', valor: entrada.fechaPresentacion }, { etiqueta: 'sanción declarada (c. 87)', valor: fmt(dec('iva-sanciones') ?? 0) }], checklistItem: 'presentacion-pago',
          contenido: { descripcion: `La declaración se presentó el ${entrada.fechaPresentacion}, después del vencimiento del ${entrada.fechaVencimiento}.${(dec('iva-sanciones') ?? 0) > 0 ? '' : ' La casilla 87 no liquida sanción de extemporaneidad.'}`, norma: 'Art. 641 ET (extemporaneidad) · art. 634 ET (intereses de mora)', recomendacion: 'Verificar la liquidación de la sanción de extemporaneidad y de los intereses de mora.' },
          bitacora: [{ tipo: 'regla', texto: 'I-34: presentación > vencimiento.', referencia: { regla: 'I-34' } }],
        })
        fila(C.oportunidad, T_PUNTOS, { punto: 'Presentación dentro del plazo', dato: datoFechas, valor: null }, 'diferencia', { regla: 'I-34', propuesta: pr, nota: pr.nota ?? 'Presentada después del vencimiento.' })
      }
    } else {
      fila(C.oportunidad, T_PUNTOS, { punto: 'Presentación dentro del plazo', dato: `Vencimiento ${entrada.fechaVencimiento ?? 'sin registrar'} · presentación ${entrada.fechaPresentacion ?? 'sin registrar'}`, valor: null }, 'no_verificable', { regla: 'I-34', nota: 'Falta registrar la fecha en la revisión.' })
    }
    const sanciones = dec('iva-sanciones')
    if (sanciones !== null && sanciones <= 0) fila(C.oportunidad, T_PUNTOS, { punto: 'Sanciones liquidadas', dato: 'Casilla 87', valor: 0 }, 'informativo', { regla: 'I-35' })
    if (sanciones !== null && sanciones > 0) {
      regla('I-35', `I-35: sanciones declaradas ${fmt(sanciones)}.`)
      itemsConDatos.add('presentacion-pago')
      const pr = proponer({
        cedula: 'oportunidad',
        tipo: 'juicio', reglasIds: ['I-35'], titulo: 'Sanción liquidada en el formulario', renglonId: 'iva-sanciones', monto: sanciones, severidad: 'baja', certeza: 'requiere_evidencia',
        datos: [{ etiqueta: 'sanciones (c87)', valor: fmt(sanciones) }], checklistItem: 'presentacion-pago',
        contenido: {
          descripcion: `El borrador liquida ${fmt(sanciones)} de sanciones en la casilla 87.`,
          para: 'Confirmar si es extemporaneidad o corrección y que el cálculo respete la sanción mínima y la reducción aplicable.',
          opciones: [{ clave: 'verificada', label: 'Liquidación verificada' }, { clave: 'revisar', label: 'Revisar la liquidación' }],
          norma: 'Arts. 639, 641, 644 y 640 ET', destino: 'checklist', tributario: { nota: 'Sanción de la casilla 87 verificada.' },
        },
        bitacora: [{ tipo: 'regla', texto: 'I-35: casilla 87 mayor que cero.', referencia: { regla: 'I-35' } }],
      })
      fila(C.oportunidad, T_PUNTOS, { punto: 'Sanciones liquidadas', dato: 'Casilla 87', valor: sanciones }, 'por_confirmar', { regla: 'I-35', propuesta: pr })
    }
  }
  C.oportunidad.limitaciones.push('La periodicidad según los ingresos del año anterior no se verifica aquí.')
  limitaciones.push({ regla: 'I-33', motivo: 'La periodicidad según ingresos del año anterior se verifica con el comparativo del encargo (etapa 3).' })

  // ─── Verificados: ítems del checklist con reglas que corrieron y sin propuestas ──
  // Puntos del checklist cuyas reglas corrieron sin producir propuestas. Ya no se propone
  // "marcar como verificado": el punto se cierra con la conclusión del auditor en la cédula.
  const verificados = ['ingresos-conciliados', 'iva-generado', 'iva-descontable', 'proporcionalidad', 'saldos-favor', 'presentacion-pago'].filter((item) => itemsConDatos.has(item) && !itemsConPropuesta.has(item))

  if (omitidas.size) {
    limitaciones.push({ regla: [...omitidas].sort().join(', '), motivo: `Pasos desactivados por el auditor en el programa: ${propuestasOmitidas} propuesta(s) no se muestran.` })
  }
  const conteo = (t: TipoPropuesta) => propuestas.filter((p) => p.tipo === t).length
  const cedulas = [C.formulario, C.lectura, C.ingresos, C.generado, C.descontable, C.retenciones, C.lecturaDian, C.dianVentas, C.dianCompras, C.saldo, C.proporcionalidad, C.oportunidad].map(cerrarCedula)
  for (const c of cedulas) if (c.estado === 'ejecutada') bit.push({ tipo: 'regla', texto: `Cédula "${c.titulo}": ${c.resultado.filas} partida(s); ${c.resultado.conformes} conforme(s), ${c.resultado.diferencias} con diferencia, ${c.resultado.porConfirmar} por confirmar.`, referencia: { cedula: c.id } })
  bit.push({ tipo: 'regla', texto: `Corrida terminada: ${conteo('hallazgo')} hallazgo(s), ${conteo('juicio')} juicio(s), ${conteo('ambiguedad')} ambigüedad(es), ${conteo('documento')} documento(s); ${limitaciones.length} limitación(es).` })

  return {
    propuestas,
    bitacora: bit,
    cifrasLibros,
    cedulas,
    resumen: {
      reglasEjecutadas: [...reglas].sort(),
      limitaciones,
      verificados,
      hallazgos: conteo('hallazgo'),
      juicios: conteo('juicio'),
      ambiguedades: conteo('ambiguedad'),
      documentos: conteo('documento'),
    },
  }
}
