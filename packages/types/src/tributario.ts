/**
 * Módulo tributario — revisión recurrente de impuestos por la revisoría fiscal.
 * Vive a NIVEL DE EMPRESA (no del encargo) organizado por año fiscal (vigencia):
 * los encargos pueden ser bimestrales/trimestrales/anuales, pero las obligaciones
 * tributarias de la empresa cubren todo el año calendario.
 *
 * Modelo: una `ObligacionTributaria` por impuesto × vigencia (según el RUT de la
 * empresa) genera una `RevisionTributaria` por período (según la periodicidad).
 * Cada revisión lleva un checklist estándar por impuesto, cifras declarado vs.
 * libros, adjuntos (declaración, pago, conciliación) y se sella con la firma del
 * revisor (snapshot inmutable) para dejar constancia.
 */
import type { ResumenAgenteRevision } from './agente-iva'
import { municipioDeTexto, nombreMunicipio, normalizarMunicipio } from './municipios'

// ─── Impuestos y periodicidades ──────────────────────────────────────────────

export const TIPOS_IMPUESTO = [
  'retefuente',
  'iva',
  'reteica',
  'ica',
  'renta',
  'exogena',
  'otro',
] as const
export type TipoImpuesto = (typeof TIPOS_IMPUESTO)[number]

export const PERIODICIDADES = ['mensual', 'bimestral', 'cuatrimestral', 'anual'] as const
export type Periodicidad = (typeof PERIODICIDADES)[number]

export const PERIODICIDAD_LABELS: Record<Periodicidad, string> = {
  mensual: 'Mensual',
  bimestral: 'Bimestral',
  cuatrimestral: 'Cuatrimestral',
  anual: 'Anual',
}

// ─── Períodos de la vigencia ─────────────────────────────────────────────────
// Claves estables por periodicidad: mensual '01'..'12' · bimestral 'B1'..'B6' ·
// cuatrimestral 'C1'..'C3' · anual 'A'. Se usan como columna de la matriz y
// como clave única (obligación, período).

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export function periodosDeVigencia(periodicidad: Periodicidad): string[] {
  switch (periodicidad) {
    case 'mensual':
      return MESES.map((_, i) => String(i + 1).padStart(2, '0'))
    case 'bimestral':
      return ['B1', 'B2', 'B3', 'B4', 'B5', 'B6']
    case 'cuatrimestral':
      return ['C1', 'C2', 'C3']
    case 'anual':
      return ['A']
  }
}

/** Etiqueta legible de un período: 'Marzo', 'Bim. 2 (mar–abr)', 'Cuat. 1 (ene–abr)', 'Anual'. */
export function etiquetaPeriodo(periodicidad: Periodicidad, periodo: string): string {
  if (periodicidad === 'mensual') {
    const mes = Number(periodo)
    return MESES[mes - 1] ?? periodo
  }
  if (periodicidad === 'bimestral') {
    const n = Number(periodo.slice(1))
    if (!n || n < 1 || n > 6) return periodo
    return `Bim. ${n} (${MESES_CORTOS[(n - 1) * 2]}–${MESES_CORTOS[(n - 1) * 2 + 1]})`
  }
  if (periodicidad === 'cuatrimestral') {
    const n = Number(periodo.slice(1))
    if (!n || n < 1 || n > 3) return periodo
    return `Cuat. ${n} (${MESES_CORTOS[(n - 1) * 4]}–${MESES_CORTOS[(n - 1) * 4 + 3]})`
  }
  return 'Anual'
}

/** Meses (1–12) que cubre un período; vacío si la clave no es válida. */
export function mesesDePeriodo(periodicidad: Periodicidad, periodo: string): number[] {
  if (periodicidad === 'mensual') {
    const m = Number(periodo)
    return m >= 1 && m <= 12 ? [m] : []
  }
  if (periodicidad === 'anual') return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
  const n = Number(periodo.slice(1))
  const tam = periodicidad === 'bimestral' ? 2 : 4
  if (!n || n < 1 || n * tam > 12) return []
  return Array.from({ length: tam }, (_, i) => (n - 1) * tam + i + 1)
}

/** Rango de fechas YYYY-MM-DD (inclusive) de un período de la vigencia. */
export function rangoPeriodo(
  periodicidad: Periodicidad,
  periodo: string,
  anio: number,
): { desde: string; hasta: string } | null {
  const meses = mesesDePeriodo(periodicidad, periodo)
  if (meses.length === 0) return null
  const m1 = meses[0]
  const m2 = meses[meses.length - 1]
  const ultimoDia = new Date(Date.UTC(anio, m2, 0)).getUTCDate()
  const mm = (m: number) => String(m).padStart(2, '0')
  return { desde: `${anio}-${mm(m1)}-01`, hasta: `${anio}-${mm(m2)}-${mm(ultimoDia)}` }
}

/** Clave del período anterior dentro de la misma vigencia; null si es el primero. */
export function periodoAnterior(periodicidad: Periodicidad, periodo: string): string | null {
  if (periodicidad === 'anual') return null
  if (periodicidad === 'mensual') {
    const m = Number(periodo)
    return m > 1 ? String(m - 1).padStart(2, '0') : null
  }
  const n = Number(periodo.slice(1))
  return n > 1 ? `${periodo[0]}${n - 1}` : null
}

/**
 * Inicio de la ventana en la que una factura recibida soporta el descontable
 * del período (art. 496 ET): el período más los dos anteriores si es bimestral,
 * más el anterior si es cuatrimestral. Devuelve YYYY-MM-DD.
 */
export function inicioVentanaDescontables(periodicidad: Periodicidad, desde: string): string {
  const [a, m] = desde.split('-').map(Number)
  const atras = periodicidad === 'bimestral' ? 4 : periodicidad === 'cuatrimestral' ? 4 : periodicidad === 'mensual' ? 2 : 0
  const total = a * 12 + (m - 1) - atras
  const anio = Math.floor(total / 12)
  const mes = (total % 12) + 1
  return `${anio}-${String(mes).padStart(2, '0')}-01`
}

/** Etiqueta corta para la cabecera de la matriz: 'Ene', 'B2', 'C1', 'Año'. */
export function etiquetaPeriodoCorta(periodicidad: Periodicidad, periodo: string): string {
  if (periodicidad === 'mensual') {
    const corto = MESES_CORTOS[Number(periodo) - 1]
    return corto ? corto[0].toUpperCase() + corto.slice(1) : periodo
  }
  if (periodicidad === 'anual') return 'Año'
  return periodo
}

// ─── Catálogo de impuestos con su checklist de revisión ──────────────────────
// El checklist es la guía estándar de lo que el revisor fiscal verifica antes de
// firmar cada declaración. `ayuda` da el contexto normativo/contable del paso.

export type ChecklistItemTributario = {
  id: string
  texto: string
  ayuda?: string
}

export type ImpuestoCatalogo = {
  tipo: TipoImpuesto
  nombre: string
  periodicidadDefault: Periodicidad
  descripcion: string
  checklist: ChecklistItemTributario[]
}

export const IMPUESTOS_CATALOGO: Record<TipoImpuesto, ImpuestoCatalogo> = {
  retefuente: {
    tipo: 'retefuente',
    nombre: 'Retención en la fuente',
    periodicidadDefault: 'mensual',
    descripcion: 'Declaración mensual de retenciones en la fuente a título de renta, IVA y timbre.',
    checklist: [
      {
        id: 'bases-contabilidad',
        texto: 'Conciliar bases y retenciones declaradas contra la contabilidad',
        ayuda: 'Cuentas 2365 (retefuente), 2367 (rete-IVA) y auxiliares por concepto. La diferencia debe ser cero o estar explicada.',
      },
      {
        id: 'tarifas-conceptos',
        texto: 'Verificar tarifas aplicadas por concepto',
        ayuda: 'Compras, servicios, honorarios, arrendamientos, pagos laborales: tarifa y cuantía mínima vigentes para el período.',
      },
      {
        id: 'autorretencion',
        texto: 'Verificar la autorretención especial de renta, si aplica',
        ayuda: 'Decreto 2201 de 2016: sociedades exoneradas de aportes (art. 114-1 ET) autorretienen sobre ingresos brutos.',
      },
      {
        id: 'soportes-terceros',
        texto: 'Revisar selectivamente terceros y soportes de las retenciones practicadas',
        ayuda: 'Muestra de facturas del período: que la retención practicada corresponda al concepto y al tercero.',
      },
      {
        id: 'presentacion-pago',
        texto: 'Confirmar presentación y pago oportunos',
        ayuda: 'Plazo según el último dígito del NIT (calendario DIAN). Una declaración de retefuente presentada sin pago total es ineficaz (art. 580-1 ET).',
      },
      {
        id: 'periodo-anterior',
        texto: 'Cruzar con el período anterior',
        ayuda: 'Correcciones pendientes, imputaciones y consistencia de las bases mes a mes.',
      },
    ],
  },
  iva: {
    tipo: 'iva',
    nombre: 'IVA',
    periodicidadDefault: 'bimestral',
    descripcion: 'Declaración del impuesto sobre las ventas (bimestral o cuatrimestral según ingresos).',
    checklist: [
      {
        id: 'ingresos-conciliados',
        texto: 'Conciliar ingresos gravados, exentos y excluidos contra la contabilidad',
        ayuda: 'Total de ingresos de la declaración vs. cuentas de ingreso del período. Clasificación correcta por tipo de operación.',
      },
      {
        id: 'iva-generado',
        texto: 'Verificar el IVA generado por tarifa',
        ayuda: 'Tarifas 19% y 5% aplicadas sobre las bases correctas; cruce con la cuenta 2408.',
      },
      {
        id: 'iva-descontable',
        texto: 'Revisar el IVA descontable y sus soportes',
        ayuda: 'Facturas electrónicas válidas (art. 771-2 ET), imputable a operaciones gravadas, dentro de la oportunidad para descontarlo.',
      },
      {
        id: 'proporcionalidad',
        texto: 'Verificar la proporcionalidad del IVA descontable, si aplica',
        ayuda: 'Si hay ingresos gravados y excluidos, el IVA de costos comunes se descuenta a prorrata (art. 490 ET).',
      },
      {
        id: 'saldos-favor',
        texto: 'Validar arrastre de saldos a favor del período anterior',
        ayuda: 'Que el saldo a favor imputado coincida con el de la declaración anterior o con la solicitud de devolución.',
      },
      {
        id: 'presentacion-pago',
        texto: 'Confirmar presentación y pago oportunos',
        ayuda: 'Plazo según el último dígito del NIT (calendario DIAN) y periodicidad correcta según ingresos del año anterior.',
      },
    ],
  },
  reteica: {
    tipo: 'reteica',
    nombre: 'ReteICA',
    periodicidadDefault: 'bimestral',
    descripcion: 'Retenciones de industria y comercio practicadas como agente retenedor municipal.',
    checklist: [
      {
        id: 'territorialidad',
        texto: 'Verificar la territorialidad de las retenciones practicadas',
        ayuda: 'La retención se practica en el municipio donde se ejecuta la actividad gravada, no donde se factura.',
      },
      {
        id: 'tarifas-actividad',
        texto: 'Verificar tarifas por código de actividad del municipio',
        ayuda: 'Cada municipio define códigos y tarifas propias (por mil). Confirmar el código CIIU homologado del proveedor.',
      },
      {
        id: 'bases-contabilidad',
        texto: 'Conciliar bases y retenciones contra la contabilidad',
        ayuda: 'Cuenta 2368 (impuesto de industria y comercio retenido) y auxiliares por municipio.',
      },
      {
        id: 'presentacion-pago',
        texto: 'Confirmar presentación y pago oportunos',
        ayuda: 'Calendario del municipio (en Bogotá, resolución distrital anual; periodicidad bimestral).',
      },
    ],
  },
  ica: {
    tipo: 'ica',
    nombre: 'ICA',
    periodicidadDefault: 'anual',
    descripcion: 'Declaración del impuesto de industria y comercio por municipio.',
    checklist: [
      {
        id: 'ingresos-municipio',
        texto: 'Conciliar los ingresos declarados por municipio contra la contabilidad',
        ayuda: 'Distribución territorial de los ingresos (dónde se ejecuta la actividad); total igual a los ingresos del año.',
      },
      {
        id: 'actividad-tarifa',
        texto: 'Verificar código de actividad y tarifa aplicada',
        ayuda: 'Código de actividad del municipio y tarifa por mil correspondiente; avisos y tableros (15% del ICA).',
      },
      {
        id: 'deducciones',
        texto: 'Revisar deducciones, exclusiones y devoluciones restadas de la base',
        ayuda: 'Exportaciones, devoluciones, ingresos por actividades no sujetas o gravadas en otro municipio.',
      },
      {
        id: 'retenciones-anticipos',
        texto: 'Cruzar retenciones de ICA que le practicaron y anticipos',
        ayuda: 'Certificados de reteICA de los clientes y anticipo liquidado el año anterior.',
      },
      {
        id: 'presentacion-pago',
        texto: 'Confirmar presentación y pago oportunos',
        ayuda: 'Calendario del municipio correspondiente.',
      },
    ],
  },
  renta: {
    tipo: 'renta',
    nombre: 'Renta',
    periodicidadDefault: 'anual',
    descripcion: 'Declaración anual del impuesto sobre la renta y complementarios.',
    checklist: [
      {
        id: 'conciliacion-fiscal',
        texto: 'Revisar la conciliación contable–fiscal (utilidad contable → renta líquida)',
        ayuda: 'Formato 2516/2517 de conciliación fiscal (art. 772-1 ET): partidas conciliatorias documentadas.',
      },
      {
        id: 'partidas-no-deducibles',
        texto: 'Verificar partidas no deducibles y diferencias temporales',
        ayuda: 'Gastos sin soporte o sin retención, GMF (50%), provisiones contables, límites de deducibilidad; impuesto diferido.',
      },
      {
        id: 'retenciones-anticipos',
        texto: 'Cruzar retenciones a favor, autorretenciones y anticipos',
        ayuda: 'Certificados de retención de clientes, autorretenciones pagadas y anticipo del año anterior vs. lo imputado.',
      },
      {
        id: 'patrimonio-fiscal',
        texto: 'Conciliar el patrimonio fiscal contra el contable',
        ayuda: 'Variación patrimonial justificada frente al año anterior (renta por comparación patrimonial, art. 236 ET).',
      },
      {
        id: 'beneficios',
        texto: 'Verificar beneficios, descuentos tributarios y rentas exentas aplicados',
        ayuda: 'Requisitos y límites de cada beneficio (descuentos art. 255-259 ET, límite del 25% en algunos casos).',
      },
      {
        id: 'certificacion-libros',
        texto: 'Verificar que la contabilidad esté al día y las operaciones registradas',
        ayuda: 'La firma del revisor fiscal certifica libros al día y operaciones sometidas a retención practicadas (art. 581 ET).',
      },
      {
        id: 'presentacion-pago',
        texto: 'Confirmar presentación y pago oportunos',
        ayuda: 'Plazo según el último dígito del NIT (calendario DIAN); cuotas de pago para grandes contribuyentes.',
      },
    ],
  },
  exogena: {
    tipo: 'exogena',
    nombre: 'Información exógena',
    periodicidadDefault: 'anual',
    descripcion: 'Reporte anual de información en medios magnéticos a la DIAN (y exógena distrital si aplica).',
    checklist: [
      {
        id: 'resolucion-formatos',
        texto: 'Identificar la resolución vigente y los formatos que aplican',
        ayuda: 'Resolución anual de la DIAN: obligados, formatos (1001, 1003, 1005, 1006, 1007, 1008, 1009, 2276…) y topes.',
      },
      {
        id: 'cruces-contabilidad',
        texto: 'Cruzar los formatos contra la contabilidad y las declaraciones',
        ayuda: 'Pagos (1001) vs. costos y gastos y retenciones declaradas; ingresos (1007) vs. ingresos de renta e IVA.',
      },
      {
        id: 'terceros',
        texto: 'Verificar identificación de terceros y cuantías mínimas',
        ayuda: 'NIT/documento válido de cada tercero; reporte por cuantías menores agrupado correctamente.',
      },
      {
        id: 'consistencia-formatos',
        texto: 'Verificar consistencia entre formatos',
        ayuda: 'Las retenciones del 1001 deben cuadrar con lo declarado en retefuente; los saldos del 1008/1009 con el balance.',
      },
      {
        id: 'presentacion',
        texto: 'Confirmar presentación oportuna y sin errores de validación',
        ayuda: 'Sanción por no enviar o enviar con errores (art. 651 ET). Guardar los acuses de recibo.',
      },
    ],
  },
  otro: {
    tipo: 'otro',
    nombre: 'Otro impuesto',
    periodicidadDefault: 'anual',
    descripcion: 'Otra obligación tributaria de la empresa (estampillas, sobretasas, impuestos al consumo, etc.).',
    checklist: [
      {
        id: 'base-liquidacion',
        texto: 'Conciliar la base y la liquidación contra la contabilidad',
      },
      {
        id: 'tarifas',
        texto: 'Verificar las tarifas aplicadas según la norma que regula el tributo',
      },
      {
        id: 'soportes',
        texto: 'Revisar los soportes de la declaración o liquidación',
      },
      {
        id: 'presentacion-pago',
        texto: 'Confirmar presentación y pago oportunos',
      },
    ],
  },
}

// ─── Cifras del período: mini-formulario espejo del formulario oficial ───────
// Cada impuesto trae sus renglones clave agrupados en secciones. El revisor
// digita "declarado" (el borrador/formulario) y "libros" (la contabilidad) por
// renglón; los renglones calculados y totales se resuelven con fórmulas de
// términos con signo (solo sumas/restas: las tarifas variables —por mil de ICA,
// tarifas por concepto— quedan digitables con su ayuda). Las fórmulas son datos
// (no funciones) para que el snapshot de la firma las congele tal cual.

export type RenglonCifra = {
  id: string
  label: string
  /** Referencia al renglón del formulario o a la cuenta contable a cruzar. */
  ayuda?: string
  tipo: 'digitable' | 'calculado' | 'total'
  /** Casilla del formulario oficial cuando el renglón es exactamente una (se muestra en la matriz). */
  casilla?: string
  /** Solo calculado/total: términos con signo sobre otros renglones. */
  formula?: Array<{ id: string; signo: 1 | -1 }>
}

/**
 * Presentación en matriz de una sección (Formulario 350): conceptos en filas y
 * columnas agrupadas (base y retención por tipo de beneficiario). Es solo
 * presentación: los valores siguen viviendo en `renglones`, así que fórmulas,
 * lectura del borrador, informe y snapshot no cambian.
 */
export type MatrizCifras = {
  /** Encabezado agrupado; cada grupo abarca tantas columnas como etiquetas tenga. */
  grupos: Array<{ label: string; columnas: string[] }>
  /** Una celda por columna: id del renglón, o null si la casilla no existe (celda gris). */
  filas: Array<{ label: string; ayuda?: string; celdas: Array<string | null> }>
  /** Fila de totales al pie; null en las columnas que no suman. */
  total?: { label: string; celdas: Array<string | null> }
  /** Muestra solo las filas con valor y una vacía para seguir digitando (actividades del ICA). */
  compacta?: boolean
}

export type SeccionCifras = {
  titulo: string
  renglones: RenglonCifra[]
  matriz?: MatrizCifras
}

/** Valores digitados por renglón. Solo se persisten los renglones digitables. */
export type CifrasRevision = Record<string, { declarado: number | null; libros: number | null }>

// ─── Formulario 350 como matriz ──────────────────────────────────────────────
// El 350 es una matriz (concepto × base/retención × persona jurídica/natural) y
// así lo llevan los programas contables. Cada celda es exactamente una casilla:
// los renglones, la matriz y el mapeo de la lectura del borrador se generan de
// estas tablas, así no pueden desalinearse.

type Concepto350 = {
  clave: string
  label: string
  ayuda?: string
  /** Casillas [base, retención] por tipo de beneficiario; null = no existe en el formulario. */
  pj: [string, string] | null
  pn: [string, string] | null
}

const CONCEPTOS_RENTA_350: Concepto350[] = [
  { clave: 'trabajo', label: 'Rentas de trabajo', pj: null, pn: ['77', '93'], ayuda: 'Procedimiento 1 o 2 (art. 383 y ss. ET); cruzar nómina y subcuenta 236505.' },
  { clave: 'pensiones', label: 'Rentas de pensiones', pj: null, pn: ['78', '94'] },
  { clave: 'honorarios', label: 'Honorarios', pj: ['29', '42'], pn: ['79', '95'], ayuda: 'Personas jurídicas 11%; naturales según sean o no declarantes (o tabla del art. 383 ET). Cruzar subcuenta 236515.' },
  { clave: 'comisiones', label: 'Comisiones', pj: ['30', '43'], pn: ['80', '96'], ayuda: 'Cruzar subcuenta 236520.' },
  { clave: 'servicios', label: 'Servicios', pj: ['31', '44'], pn: ['81', '97'], ayuda: 'General 4% (6% a no declarantes), con tarifas especiales según el servicio; verificar cuantías mínimas. Cruzar subcuenta 236525.' },
  { clave: 'rendimientos', label: 'Rendimientos financieros e intereses', pj: ['32', '45'], pn: ['82', '98'], ayuda: 'Cruzar subcuenta 236535.' },
  { clave: 'arrendamientos', label: 'Arrendamientos (muebles e inmuebles)', pj: ['33', '46'], pn: ['83', '99'], ayuda: 'Muebles 4% · inmuebles 3,5%. Cruzar subcuenta 236530.' },
  { clave: 'regalias', label: 'Regalías y explotación de la propiedad intelectual', pj: ['34', '47'], pn: ['84', '100'] },
  { clave: 'dividendos', label: 'Dividendos y participaciones', pj: ['35', '48'], pn: ['85', '101'], ayuda: 'Cruzar subcuenta 236510.' },
  { clave: 'compras', label: 'Compras', pj: ['36', '49'], pn: ['86', '102'], ayuda: 'General 2,5% (3,5% a no declarantes); verificar cuantía mínima. Cruzar subcuenta 236540.' },
  { clave: 'tarjetas', label: 'Transacciones con tarjetas débito y crédito', pj: ['37', '50'], pn: ['87', '103'] },
  { clave: 'construccion', label: 'Contratos de construcción', pj: ['38', '51'], pn: ['88', '104'] },
  { clave: 'enajenacion', label: 'Enajenación de activos fijos (ante notarios y autoridades de tránsito)', pj: null, pn: ['89', '105'] },
  { clave: 'loterias', label: 'Loterías, rifas, apuestas y similares', pj: ['39', '52'], pn: ['90', '106'] },
  { clave: 'hidrocarburos', label: 'Hidrocarburos, carbón y demás productos mineros', pj: ['40', '53'], pn: ['91', '107'] },
  { clave: 'otros', label: 'Otros pagos sujetos a retención', pj: ['41', '54'], pn: ['92', '108'], ayuda: 'Cruzar subcuenta 236570.' },
  { clave: 'exterior-sin-convenio', label: 'Pagos al exterior a países sin convenio', pj: ['55', '57'], pn: ['109', '111'], ayuda: 'Tarifas de los arts. 406 a 408 ET. Cruzar subcuenta 236550.' },
  { clave: 'exterior-con-convenio', label: 'Pagos al exterior a países con convenio vigente', pj: ['56', '58'], pn: ['110', '112'], ayuda: 'Tarifa del convenio para evitar la doble imposición. Cruzar subcuenta 236550.' },
]

const CONCEPTOS_AUTORRETENCION_350: Concepto350[] = [
  { clave: 'exonerados', label: 'Contribuyentes exonerados de aportes (art. 114-1 ET)', pj: ['59', '68'], pn: null, ayuda: 'Autorretención especial sobre ingresos brutos; tarifa según la actividad económica (casillas 27 y 28 del formulario).' },
  { clave: 'ventas', label: 'Ventas', pj: ['60', '69'], pn: ['113', '121'] },
  { clave: 'honorarios', label: 'Honorarios', pj: ['61', '70'], pn: ['114', '122'] },
  { clave: 'comisiones', label: 'Comisiones', pj: ['62', '71'], pn: ['115', '123'] },
  { clave: 'servicios', label: 'Servicios', pj: ['63', '72'], pn: ['116', '124'] },
  { clave: 'rendimientos', label: 'Rendimientos financieros', pj: ['64', '73'], pn: ['117', '125'] },
  { clave: 'provisionales', label: 'Pagos mensuales provisionales voluntarios (hidrocarburos y demás productos mineros)', pj: ['65', '74'], pn: ['118', '126'] },
  { clave: 'exportacion', label: 'Exportación de hidrocarburos, carbón y demás productos mineros', pj: ['66', '75'], pn: ['119', '127'] },
  { clave: 'otros', label: 'Otros conceptos', pj: ['67', '76'], pn: ['120', '128'] },
]

const BENEFICIARIOS_350 = [
  { clave: 'pj', label: 'personas jurídicas' },
  { clave: 'pn', label: 'personas naturales' },
] as const

/**
 * Arma una sección matriz del 350: un renglón digitable por casilla (base y
 * valor por concepto y beneficiario) y un total calculado por columna de valor.
 */
function seccionMatriz350(opts: {
  titulo: string
  prefijo: string
  conceptos: Concepto350[]
  /** Nombre de la columna de valor: "Retención" o "Autorretención". */
  parte: string
  /** Etiqueta del renglón fuera de la matriz (informe, hallazgos): debe decir concepto y beneficiario. */
  etiqueta: (concepto: string, beneficiario: string, columna: string) => string
  total: { label: string; ayuda: (beneficiario: string) => string }
}): SeccionCifras {
  const renglones: RenglonCifra[] = []
  const filas: MatrizCifras['filas'] = []
  const valoresPorBeneficiario: Record<'pj' | 'pn', string[]> = { pj: [], pn: [] }

  for (const c of opts.conceptos) {
    const celdas: Array<string | null> = []
    for (const b of BENEFICIARIOS_350) {
      const casillas = c[b.clave]
      if (!casillas) {
        celdas.push(null, null)
        continue
      }
      const id = `${opts.prefijo}-${b.clave}-${c.clave}`
      renglones.push(
        { id: `${id}-base`, label: opts.etiqueta(c.label, b.label, 'base'), tipo: 'digitable', casilla: casillas[0], ayuda: c.ayuda },
        { id, label: opts.etiqueta(c.label, b.label, opts.parte.toLowerCase()), tipo: 'digitable', casilla: casillas[1], ayuda: c.ayuda },
      )
      valoresPorBeneficiario[b.clave].push(id)
      celdas.push(`${id}-base`, id)
    }
    filas.push({ label: c.label, ayuda: c.ayuda, celdas })
  }

  const totales = BENEFICIARIOS_350.map((b) => {
    const id = `${opts.prefijo}-${b.clave}-total`
    renglones.push({
      id,
      label: `${opts.total.label} — ${b.label}`,
      tipo: 'calculado',
      formula: valoresPorBeneficiario[b.clave].map((v) => ({ id: v, signo: 1 as const })),
      ayuda: opts.total.ayuda(b.label),
    })
    return id
  })

  return {
    titulo: opts.titulo,
    renglones,
    matriz: {
      grupos: BENEFICIARIOS_350.map((b) => ({ label: `A ${b.label}`, columnas: ['Base sujeta a retención', opts.parte] })),
      filas,
      total: { label: opts.total.label, celdas: [null, totales[0], null, totales[1]] },
    },
  }
}

/** Mapeo de lectura para catálogos cuyos renglones digitables son exactamente una casilla. */
function digitablesPorCasilla(tipo: TipoImpuesto): Record<string, string[]> {
  return Object.fromEntries(
    CIFRAS_CATALOGO[tipo]
      .flatMap((s) => s.renglones)
      .filter((r) => r.tipo === 'digitable' && r.casilla)
      .map((r) => [r.id, [r.casilla as string]]),
  )
}

// ─── ICA: discriminación de actividades gravadas (sección C del formulario) ──
// El Formulario Único Nacional trae 3 actividades en la primera hoja y 12 más
// en la de "otras actividades". De cada una se guardan los ingresos gravados y
// el impuesto; la tarifa por mil sale de dividirlos (el código de actividad no
// es una cifra y queda en el borrador adjunto).

export const ACTIVIDADES_ICA = 15
export const idActividadIca = (n: number, campo: 'ingresos' | 'impuesto') => `ica-act-${n}-${campo}`

function seccionActividadesIca(): SeccionCifras {
  const renglones: RenglonCifra[] = []
  const filas: MatrizCifras['filas'] = []
  for (let n = 1; n <= ACTIVIDADES_ICA; n++) {
    const etiqueta = n === 1 ? 'Actividad principal' : `Actividad ${n}`
    renglones.push(
      { id: idActividadIca(n, 'ingresos'), label: `${etiqueta}: ingresos gravados`, tipo: 'digitable', ayuda: 'Sección C del formulario.' },
      { id: idActividadIca(n, 'impuesto'), label: `${etiqueta}: impuesto`, tipo: 'digitable', ayuda: 'Ingresos gravados × tarifa por mil de la actividad.' },
    )
    filas.push({ label: etiqueta, celdas: [idActividadIca(n, 'ingresos'), idActividadIca(n, 'impuesto')] })
  }
  const suma = (campo: 'ingresos' | 'impuesto') => Array.from({ length: ACTIVIDADES_ICA }, (_, i) => ({ id: idActividadIca(i + 1, campo), signo: 1 as const }))
  renglones.push(
    { id: 'ica-act-ingresos', label: 'Total ingresos gravados por actividad', tipo: 'total', formula: suma('ingresos'), ayuda: 'Debe ser igual al renglón 16.' },
    { id: 'ica-act-impuesto', label: 'Total impuesto por actividad', tipo: 'total', formula: suma('impuesto'), ayuda: 'Debe ser igual al renglón 17 (redondeado a miles).' },
  )
  return {
    titulo: 'Discriminación de actividades gravadas (sección C)',
    renglones,
    matriz: {
      grupos: [{ label: 'Actividades gravadas', columnas: ['Ingresos gravados', 'Impuesto'] }],
      filas,
      total: { label: 'Total', celdas: ['ica-act-ingresos', 'ica-act-impuesto'] },
      compacta: true,
    },
  }
}

export const CIFRAS_CATALOGO: Record<TipoImpuesto, SeccionCifras[]> = {
  // Espejo del Formulario 350 de la DIAN en matriz, uno a uno con sus casillas
  // (ver seccionMatriz350). Personas jurídicas y naturales separadas: es
  // obligatorio y muchas empresas lo llevan en subcuentas aparte, así que cada
  // columna tiene su total para cruzarlo. Las etiquetas de los renglones nombran
  // concepto y beneficiario para que el informe y los hallazgos lo digan.
  retefuente: [
    seccionMatriz350({
      titulo: 'Retenciones a título de renta (casillas 29–58 y 77–112)',
      prefijo: 'rf',
      conceptos: CONCEPTOS_RENTA_350,
      parte: 'Retención',
      etiqueta: (concepto, beneficiario, columna) => `${concepto} a ${beneficiario} — ${columna}`,
      total: {
        label: 'Total retenciones',
        ayuda: (b) => `No es casilla del formulario: cruzar contra las subcuentas 2365 de ${b}.`,
      },
    }),
    seccionMatriz350({
      titulo: 'Autorretenciones (casillas 59–76 y 113–128)',
      prefijo: 'rf-ar',
      conceptos: CONCEPTOS_AUTORRETENCION_350,
      parte: 'Autorretención',
      etiqueta: (concepto, beneficiario, columna) => `Autorretenciones: ${concepto} (${beneficiario}) — ${columna}`,
      total: {
        label: 'Total autorretenciones',
        ayuda: (b) => `No es casilla del formulario: cruzar contra la subcuenta 236575 (${b}).`,
      },
    }),
    {
      titulo: 'Total retenciones de renta (casillas 129–130)',
      renglones: [
        { id: 'rf-exceso-renta', label: 'Menos: retenciones en exceso, indebidas o por operaciones anuladas', tipo: 'digitable', casilla: '129', ayuda: 'Casilla 129. Debe tener soporte del reintegro al tercero.' },
        { id: 'rf-total-renta', label: 'Total retenciones renta y complementario', tipo: 'total', casilla: '130', formula: [
          { id: 'rf-pj-total', signo: 1 }, { id: 'rf-pn-total', signo: 1 },
          { id: 'rf-ar-pj-total', signo: 1 }, { id: 'rf-ar-pn-total', signo: 1 },
          { id: 'rf-exceso-renta', signo: -1 },
        ], ayuda: 'Casilla 130. Cruzar contra el total de la cuenta 2365 del período.' },
      ],
    },
    {
      titulo: 'Retenciones a título de IVA (casillas 131–134)',
      renglones: [
        { id: 'rf-reteiva', label: 'Retenciones de IVA a responsables del impuesto sobre las ventas', tipo: 'digitable', casilla: '131', ayuda: 'Casilla 131. 15% del IVA en compras a responsables; cruzar cuenta 2367.' },
        { id: 'rf-reteiva-no-residentes', label: 'Retenciones de IVA por servicios a no residentes o no domiciliados', tipo: 'digitable', casilla: '132', ayuda: 'Casilla 132.' },
        { id: 'rf-reteiva-exceso', label: 'Menos: retenciones de IVA en exceso, indebidas o por operaciones anuladas', tipo: 'digitable', casilla: '133', ayuda: 'Casilla 133.' },
        { id: 'rf-total-iva', label: 'Total retenciones IVA', tipo: 'total', casilla: '134', formula: [
          { id: 'rf-reteiva', signo: 1 }, { id: 'rf-reteiva-no-residentes', signo: 1 }, { id: 'rf-reteiva-exceso', signo: -1 },
        ], ayuda: 'Casilla 134.' },
      ],
    },
    {
      titulo: 'Timbre, sanciones y total (casillas 135–138)',
      renglones: [
        { id: 'rf-timbre', label: 'Retenciones impuesto de timbre nacional', tipo: 'digitable', casilla: '135', ayuda: 'Casilla 135. Solo si la sociedad es agente de retención del impuesto de timbre.' },
        { id: 'rf-total', label: 'Total retenciones', tipo: 'calculado', casilla: '136', formula: [
          { id: 'rf-total-renta', signo: 1 }, { id: 'rf-total-iva', signo: 1 }, { id: 'rf-timbre', signo: 1 },
        ], ayuda: 'Casilla 136.' },
        { id: 'rf-sanciones', label: 'Sanciones', tipo: 'digitable', casilla: '137', ayuda: 'Casilla 137. Extemporaneidad o corrección (arts. 641 y 644 ET).' },
        { id: 'rf-total-sanciones', label: 'Total retenciones más sanciones', tipo: 'total', casilla: '138', formula: [
          { id: 'rf-total', signo: 1 }, { id: 'rf-sanciones', signo: 1 },
        ], ayuda: 'Casilla 138. Debe pagarse completo, en la casilla 980 o con recibo 490: sin pago total la declaración de retención es ineficaz (art. 580-1 ET).' },
      ],
    },
  ],
  // Espejo del Formulario 300 de la DIAN: cada renglón cita las casillas que
  // cubre (agrupando las afines) para que la lectura del borrador y la revisión
  // manual mapeen sin ambigüedad. Los totales replican los del formulario.
  iva: [
    {
      titulo: 'Ingresos del período (casillas 27–43)',
      renglones: [
        { id: 'iva-ing-19', label: 'Operaciones gravadas a la tarifa general', tipo: 'digitable', ayuda: 'Casilla 28. Cruzar contra las cuentas de ingreso gravadas al 19%.' },
        { id: 'iva-ing-5', label: 'Operaciones gravadas al 5%', tipo: 'digitable', ayuda: 'Casilla 27.' },
        { id: 'iva-ing-exportaciones', label: 'Exportaciones de bienes y servicios', tipo: 'digitable', ayuda: 'Casillas 30 y 31. Exentas con derecho a descontables (art. 481 ET).' },
        { id: 'iva-ing-exentos', label: 'Demás operaciones exentas (SCI, zonas francas, exentas)', tipo: 'digitable', ayuda: 'Casillas 32, 33 y 35.' },
        { id: 'iva-ing-excluidos', label: 'Operaciones excluidas', tipo: 'digitable', ayuda: 'Casilla 39.' },
        { id: 'iva-ing-no-gravadas', label: 'Operaciones no gravadas', tipo: 'digitable', ayuda: 'Casilla 40.' },
        { id: 'iva-ing-otras', label: 'Otras operaciones (A.I.U., juegos, cerveza, gaseosas, licores)', tipo: 'digitable', ayuda: 'Casillas 29, 34, 36, 37 y 38.' },
        { id: 'iva-ing-brutos', label: 'Total ingresos brutos', tipo: 'total', formula: [
          { id: 'iva-ing-19', signo: 1 }, { id: 'iva-ing-5', signo: 1 }, { id: 'iva-ing-exportaciones', signo: 1 },
          { id: 'iva-ing-exentos', signo: 1 }, { id: 'iva-ing-excluidos', signo: 1 },
          { id: 'iva-ing-no-gravadas', signo: 1 }, { id: 'iva-ing-otras', signo: 1 },
        ], ayuda: 'Casilla 41. Debe cuadrar con los ingresos contables del período.' },
        { id: 'iva-ing-devoluciones', label: 'Devoluciones en ventas anuladas, rescindidas o resueltas', tipo: 'digitable', ayuda: 'Casilla 42.' },
        { id: 'iva-ing-netos', label: 'Total ingresos netos del período', tipo: 'calculado', formula: [
          { id: 'iva-ing-brutos', signo: 1 }, { id: 'iva-ing-devoluciones', signo: -1 },
        ], ayuda: 'Casilla 43.' },
      ],
    },
    {
      titulo: 'Compras del período (casillas 44–57)',
      renglones: [
        { id: 'iva-comp-19', label: 'Compras y servicios gravados a la tarifa general', tipo: 'digitable', ayuda: 'Casillas 45, 51 y 53 (nacionales e importaciones).' },
        { id: 'iva-comp-5', label: 'Compras y servicios gravados al 5%', tipo: 'digitable', ayuda: 'Casillas 44, 50 y 52.' },
        { id: 'iva-comp-no-gravadas', label: 'Compras no gravadas, excluidas y exentas', tipo: 'digitable', ayuda: 'Casillas 46, 47, 48, 49 y 54.' },
        { id: 'iva-comp-brutas', label: 'Total compras e importaciones brutas', tipo: 'total', formula: [
          { id: 'iva-comp-19', signo: 1 }, { id: 'iva-comp-5', signo: 1 }, { id: 'iva-comp-no-gravadas', signo: 1 },
        ], ayuda: 'Casilla 55. Cruzar contra costos y gastos del período.' },
        { id: 'iva-comp-devoluciones', label: 'Devoluciones en compras anuladas, rescindidas o resueltas', tipo: 'digitable', ayuda: 'Casilla 56.' },
        { id: 'iva-comp-netas', label: 'Total compras netas del período', tipo: 'calculado', formula: [
          { id: 'iva-comp-brutas', signo: 1 }, { id: 'iva-comp-devoluciones', signo: -1 },
        ], ayuda: 'Casilla 57.' },
      ],
    },
    {
      titulo: 'Impuesto generado (casillas 58–67)',
      renglones: [
        { id: 'iva-gen-19', label: 'IVA generado a la tarifa general', tipo: 'digitable', ayuda: 'Casilla 59. Cruzar crédito de la cuenta 2408.' },
        { id: 'iva-gen-5', label: 'IVA generado al 5%', tipo: 'digitable', ayuda: 'Casilla 58.' },
        { id: 'iva-gen-otros', label: 'Otros IVA generado (A.I.U., juegos, bebidas, retiros de inventario)', tipo: 'digitable', ayuda: 'Casillas 60 a 65.' },
        { id: 'iva-gen-recuperado', label: 'IVA recuperado en devoluciones en compras', tipo: 'digitable', ayuda: 'Casilla 66.' },
        { id: 'iva-generado', label: 'Total impuesto generado', tipo: 'total', formula: [
          { id: 'iva-gen-19', signo: 1 }, { id: 'iva-gen-5', signo: 1 },
          { id: 'iva-gen-otros', signo: 1 }, { id: 'iva-gen-recuperado', signo: 1 },
        ], ayuda: 'Casilla 67.' },
      ],
    },
    {
      titulo: 'Impuesto descontable (casillas 68–81)',
      renglones: [
        { id: 'iva-desc-compras', label: 'IVA descontable por compras de bienes (incluye importaciones)', tipo: 'digitable', ayuda: 'Casillas 68 a 72. Soportado en factura electrónica (art. 771-2 ET).' },
        { id: 'iva-desc-servicios', label: 'IVA descontable por servicios', tipo: 'digitable', ayuda: 'Casillas 74 y 75.' },
        { id: 'iva-desc-otros', label: 'Otros descontables (licores, no domiciliados, descuentos especiales)', tipo: 'digitable', ayuda: 'Casillas 73, 76 y 78.' },
        { id: 'iva-desc-devoluciones', label: 'IVA resultante por devoluciones en ventas anuladas', tipo: 'digitable', ayuda: 'Casilla 79.' },
        { id: 'iva-desc-ajustes', label: 'Menos: ajuste de descontables (pérdidas, hurto, castigo de inventarios)', tipo: 'digitable', ayuda: 'Casilla 80.' },
        { id: 'iva-descontable', label: 'Total impuestos descontables', tipo: 'total', formula: [
          { id: 'iva-desc-compras', signo: 1 }, { id: 'iva-desc-servicios', signo: 1 },
          { id: 'iva-desc-otros', signo: 1 }, { id: 'iva-desc-devoluciones', signo: 1 },
          { id: 'iva-desc-ajustes', signo: -1 },
        ], ayuda: 'Casilla 81. Débito de la cuenta 2408.' },
      ],
    },
    {
      titulo: 'Liquidación privada (casillas 82–89)',
      renglones: [
        { id: 'iva-saldo', label: 'Saldo a pagar por el período fiscal (o a favor si es negativo)', tipo: 'calculado', formula: [
          { id: 'iva-generado', signo: 1 }, { id: 'iva-descontable', signo: -1 },
        ], ayuda: 'Casillas 82/83.' },
        { id: 'iva-saldo-favor-ant', label: 'Menos: saldo a favor del período anterior', tipo: 'digitable', ayuda: 'Casilla 84. Debe coincidir con la declaración anterior.' },
        { id: 'iva-retenido', label: 'Menos: retenciones de IVA que le practicaron', tipo: 'digitable', ayuda: 'Casilla 85. Cruzar certificados de rete-IVA y auxiliar 1355.' },
        { id: 'iva-saldo-impuesto', label: 'Saldo a pagar por impuesto', tipo: 'calculado', formula: [
          { id: 'iva-saldo', signo: 1 }, { id: 'iva-saldo-favor-ant', signo: -1 }, { id: 'iva-retenido', signo: -1 },
        ], ayuda: 'Casilla 86.' },
        { id: 'iva-sanciones', label: 'Sanciones', tipo: 'digitable', ayuda: 'Casilla 87.' },
        { id: 'iva-total', label: 'Total saldo a pagar (o a favor si es negativo)', tipo: 'total', formula: [
          { id: 'iva-saldo-impuesto', signo: 1 }, { id: 'iva-sanciones', signo: 1 },
        ], ayuda: 'Casillas 88/89. Debe coincidir con el pago total del formulario.' },
      ],
    },
  ],
  // Cada municipio tiene su formulario (Bogotá 131, Cali bimestral…), pero todos
  // traen lo mismo: bases, retenciones, autorretenciones, descuento por
  // devoluciones y sanciones. Los renglones nuevos (2026-10-01) son aditivos.
  reteica: [
    {
      titulo: 'Bases de retención',
      renglones: [
        { id: 'ri-base', label: 'Base de retenciones del período', tipo: 'digitable', ayuda: 'Pagos gravados a proveedores por actividades en el municipio (Bogotá renglón 6, Cali renglón 10).' },
        { id: 'ri-base-autorretencion', label: 'Base de autorretenciones', tipo: 'digitable', ayuda: 'Solo si la empresa es autorretenedora de ICA en el municipio (Cali renglón 11).' },
      ],
    },
    {
      titulo: 'Retenciones de ICA practicadas',
      renglones: [
        { id: 'ri-retenciones', label: 'Retenciones practicadas', tipo: 'digitable', ayuda: 'Base × tarifa por mil de la actividad del proveedor; cruzar con los créditos de la 2368 del municipio (Bogotá renglón 7, Cali renglón 13).' },
        { id: 'ri-autorretenciones', label: 'Autorretenciones practicadas', tipo: 'digitable', ayuda: 'Cali renglón 14.' },
        { id: 'ri-devoluciones', label: 'Menos: descuento por devolución de retenciones', tipo: 'digitable', ayuda: 'Retenciones devueltas por anulaciones o rescisiones (Bogotá renglón 8). Debe tener soporte.' },
        { id: 'ri-sanciones', label: 'Sanciones e intereses', tipo: 'digitable' },
        { id: 'ri-total', label: 'Total a pagar', tipo: 'total', formula: [
          { id: 'ri-retenciones', signo: 1 }, { id: 'ri-autorretenciones', signo: 1 }, { id: 'ri-devoluciones', signo: -1 }, { id: 'ri-sanciones', signo: 1 },
        ] },
      ],
    },
  ],
  // Espejo del Formulario Único Nacional de declaración y pago del ICA
  // (Resolución 4056 de 2016 de MinHacienda), que usan Bogotá y los demás
  // municipios: renglones 8 a 38, con la discriminación de actividades
  // gravadas (sección C) en matriz. Se conservan los ids anteriores donde el
  // renglón significa lo mismo (8, 16, 17, 21, 22, 27, 33/34).
  ica: [
    {
      titulo: 'Base gravable (renglones 8–16)',
      renglones: [
        { id: 'ica-ingresos', label: 'Total ingresos ordinarios y extraordinarios del período en todo el país', tipo: 'digitable', casilla: '8', ayuda: 'Renglón 8. Todos los ingresos brutos del período, incluidos los de otros municipios: créditos de la clase 4.' },
        { id: 'ica-fuera-municipio', label: 'Menos: ingresos fuera del municipio o distrito', tipo: 'digitable', casilla: '9', ayuda: 'Renglón 9. Ingresos de actividades ejecutadas en otros municipios (allá se declaran).' },
        { id: 'ica-ingresos-municipio', label: 'Total ingresos ordinarios y extraordinarios en el municipio', tipo: 'calculado', formula: [
          { id: 'ica-ingresos', signo: 1 }, { id: 'ica-fuera-municipio', signo: -1 },
        ], ayuda: 'Renglón 10 (8 − 9).' },
        { id: 'ica-devoluciones', label: 'Menos: ingresos por devoluciones, rebajas y descuentos', tipo: 'digitable', casilla: '11', ayuda: 'Renglón 11. Cuenta 4175 y equivalentes.' },
        { id: 'ica-exportaciones', label: 'Menos: ingresos por exportaciones', tipo: 'digitable', casilla: '12', ayuda: 'Renglón 12. Soportados con la declaración de exportación o el certificado al proveedor.' },
        { id: 'ica-activos-fijos', label: 'Menos: ingresos por venta de activos fijos', tipo: 'digitable', casilla: '13', ayuda: 'Renglón 13.' },
        { id: 'ica-no-sujetos', label: 'Menos: ingresos por actividades excluidas o no sujetas y otros ingresos no gravados', tipo: 'digitable', casilla: '14', ayuda: 'Renglón 14. Requiere la norma que excluye cada ingreso.' },
        { id: 'ica-exentos', label: 'Menos: ingresos por actividades exentas en el municipio (por acuerdo)', tipo: 'digitable', casilla: '15', ayuda: 'Renglón 15. Requiere el acuerdo municipal que la exime.' },
        { id: 'ica-base', label: 'Total ingresos gravables', tipo: 'total', formula: [
          { id: 'ica-ingresos-municipio', signo: 1 }, { id: 'ica-devoluciones', signo: -1 }, { id: 'ica-exportaciones', signo: -1 },
          { id: 'ica-activos-fijos', signo: -1 }, { id: 'ica-no-sujetos', signo: -1 }, { id: 'ica-exentos', signo: -1 },
        ], ayuda: 'Renglón 16 (10 − 11 − 12 − 13 − 14 − 15). Debe ser igual al total de ingresos gravados por actividad.' },
      ],
    },
    seccionActividadesIca(),
    {
      titulo: 'Liquidación privada (renglones 17–34)',
      renglones: [
        { id: 'ica-impuesto', label: 'Total impuestos por actividades', tipo: 'digitable', casilla: '17', ayuda: 'Renglón 17. Suma del impuesto de cada actividad (ingresos gravados × tarifa por mil del municipio).' },
        { id: 'ica-ley56', label: 'Impuesto Ley 56 de 1981 (generación de energía)', tipo: 'digitable', casilla: '19', ayuda: 'Renglón 19. Solo generadoras de energía (renglón 18: capacidad instalada en kW).' },
        { id: 'ica-total-ica', label: 'Total impuesto de industria y comercio', tipo: 'calculado', formula: [
          { id: 'ica-impuesto', signo: 1 }, { id: 'ica-ley56', signo: 1 },
        ], ayuda: 'Renglón 20 (17 + 19).' },
        { id: 'ica-avisos', label: 'Impuesto de avisos y tableros', tipo: 'digitable', casilla: '21', ayuda: 'Renglón 21. 15 % del renglón 20 si tiene avisos.' },
        { id: 'ica-unidades', label: 'Pago por unidades comerciales adicionales del sector financiero', tipo: 'digitable', casilla: '22', ayuda: 'Renglón 22.' },
        { id: 'ica-bomberil', label: 'Sobretasa bomberil', tipo: 'digitable', casilla: '23', ayuda: 'Renglón 23. Según el acuerdo municipal (Ley 1575 de 2012).' },
        { id: 'ica-seguridad', label: 'Sobretasa de seguridad', tipo: 'digitable', casilla: '24', ayuda: 'Renglón 24. Según el acuerdo municipal (Ley 1421 de 2010).' },
        { id: 'ica-impuesto-cargo', label: 'Total impuesto a cargo', tipo: 'total', formula: [
          { id: 'ica-total-ica', signo: 1 }, { id: 'ica-avisos', signo: 1 }, { id: 'ica-unidades', signo: 1 },
          { id: 'ica-bomberil', signo: 1 }, { id: 'ica-seguridad', signo: 1 },
        ], ayuda: 'Renglón 25 (20 + 21 + 22 + 23 + 24). Cruzar con la causación en 2412.' },
        { id: 'ica-exencion', label: 'Menos: exención o exoneración sobre el impuesto', tipo: 'digitable', casilla: '26', ayuda: 'Renglón 26. Exenciones sobre el impuesto, no sobre los ingresos.' },
        { id: 'ica-retenciones', label: 'Menos: retenciones que le practicaron a favor del municipio', tipo: 'digitable', casilla: '27', ayuda: 'Renglón 27. Certificados de reteICA de los clientes; cuenta 135518.' },
        { id: 'ica-autorretenciones', label: 'Menos: autorretenciones practicadas a favor del municipio', tipo: 'digitable', casilla: '28', ayuda: 'Renglón 28.' },
        { id: 'ica-anticipo-ant', label: 'Menos: anticipo liquidado en el año anterior', tipo: 'digitable', casilla: '29', ayuda: 'Renglón 29. Debe coincidir con el renglón 30 de la declaración del año anterior.' },
        { id: 'ica-anticipo-sig', label: 'Anticipo del año siguiente', tipo: 'digitable', casilla: '30', ayuda: 'Renglón 30. Si el municipio lo exige (porcentaje del acuerdo municipal).' },
        { id: 'ica-sanciones', label: 'Sanciones', tipo: 'digitable', casilla: '31', ayuda: 'Renglón 31. Extemporaneidad, corrección, inexactitud u otra.' },
        { id: 'ica-saldo-favor-ant', label: 'Menos: saldo a favor del período anterior sin solicitud de devolución o compensación', tipo: 'digitable', casilla: '32', ayuda: 'Renglón 32. Debe coincidir con el renglón 34 de la declaración anterior.' },
        { id: 'ica-saldo', label: 'Total saldo a cargo (o a favor si es negativo)', tipo: 'total', formula: [
          { id: 'ica-impuesto-cargo', signo: 1 }, { id: 'ica-exencion', signo: -1 }, { id: 'ica-retenciones', signo: -1 },
          { id: 'ica-autorretenciones', signo: -1 }, { id: 'ica-anticipo-ant', signo: -1 }, { id: 'ica-anticipo-sig', signo: 1 },
          { id: 'ica-sanciones', signo: 1 }, { id: 'ica-saldo-favor-ant', signo: -1 },
        ], ayuda: 'Renglones 33/34 (25 − 26 − 27 − 28 − 29 + 30 + 31 − 32).' },
      ],
    },
    {
      titulo: 'Pago (renglones 35–38)',
      renglones: [
        { id: 'ica-descuento-pronto-pago', label: 'Menos: descuento por pronto pago', tipo: 'digitable', casilla: '36', ayuda: 'Renglón 36. Si el acuerdo municipal lo prevé.' },
        { id: 'ica-intereses-mora', label: 'Intereses de mora', tipo: 'digitable', casilla: '37', ayuda: 'Renglón 37.' },
        { id: 'ica-total-pagar', label: 'Total a pagar (o saldo a favor si es negativo)', tipo: 'total', formula: [
          { id: 'ica-saldo', signo: 1 }, { id: 'ica-descuento-pronto-pago', signo: -1 }, { id: 'ica-intereses-mora', signo: 1 },
        ], ayuda: 'Renglón 38 (35 − 36 + 37). El pago voluntario (39–40) no hace parte de la revisión.' },
      ],
    },
  ],
  renta: [
    {
      titulo: 'Conciliación contable–fiscal (Formulario 110 / formato 2516)',
      renglones: [
        { id: 'r-utilidad', label: 'Utilidad contable antes de impuestos', tipo: 'digitable', ayuda: 'Del estado de resultados del año.' },
        { id: 'r-no-deducibles', label: 'Más: partidas no deducibles', tipo: 'digitable', ayuda: 'Gastos sin soporte o sin retención, GMF 50%, provisiones contables, sanciones, límites.' },
        { id: 'r-menos-fiscales', label: 'Menos: ingresos no gravados y deducciones fiscales', tipo: 'digitable', ayuda: 'Ingresos no constitutivos, rentas exentas, deducciones especiales, diferencias temporales.' },
        { id: 'r-renta-liquida', label: 'Renta líquida gravable', tipo: 'calculado', formula: [
          { id: 'r-utilidad', signo: 1 }, { id: 'r-no-deducibles', signo: 1 }, { id: 'r-menos-fiscales', signo: -1 },
        ] },
      ],
    },
    {
      titulo: 'Liquidación privada',
      renglones: [
        { id: 'r-impuesto', label: 'Impuesto neto de renta', tipo: 'digitable', ayuda: 'Renta líquida × tarifa (35% general) − descuentos tributarios.' },
        { id: 'r-retenciones', label: 'Menos: retenciones y autorretenciones del año', tipo: 'digitable', ayuda: 'Certificados de clientes + autorretenciones pagadas; cruzar cuenta 1355.' },
        { id: 'r-anticipo-ant', label: 'Menos: anticipo del año anterior', tipo: 'digitable' },
        { id: 'r-anticipo-sig', label: 'Más: anticipo para el año siguiente', tipo: 'digitable', ayuda: '75% del promedio del impuesto (25%/50% en los dos primeros años).' },
        { id: 'r-saldo', label: 'Saldo a pagar (o a favor si es negativo)', tipo: 'calculado', formula: [
          { id: 'r-impuesto', signo: 1 }, { id: 'r-retenciones', signo: -1 },
          { id: 'r-anticipo-ant', signo: -1 }, { id: 'r-anticipo-sig', signo: 1 },
        ] },
      ],
    },
  ],
  exogena: [
    {
      titulo: 'Cruces por formato (reportado vs. contabilidad)',
      renglones: [
        { id: 'ex-1001', label: 'Formato 1001 — pagos y retenciones', tipo: 'digitable', ayuda: 'Total pagos del 1001 vs. costos y gastos contables del año.' },
        { id: 'ex-1007', label: 'Formato 1007 — ingresos', tipo: 'digitable', ayuda: 'Total ingresos reportados vs. ingresos contables (y renglones de renta).' },
        { id: 'ex-1005', label: 'Formato 1005 — IVA descontable', tipo: 'digitable', ayuda: 'Vs. lo declarado como descontable en las declaraciones de IVA del año.' },
        { id: 'ex-1006', label: 'Formato 1006 — IVA generado', tipo: 'digitable', ayuda: 'Vs. lo declarado como generado en IVA.' },
        { id: 'ex-retenciones', label: 'Retenciones del 1001', tipo: 'digitable', ayuda: 'Vs. el total declarado en retefuente durante el año.' },
        { id: 'ex-1008', label: 'Formato 1008/1009 — saldos de cuentas por cobrar y pagar', tipo: 'digitable', ayuda: 'Vs. los saldos del balance a 31 de diciembre.' },
      ],
    },
  ],
  otro: [
    {
      titulo: 'Liquidación',
      renglones: [
        { id: 'ot-base', label: 'Base gravable', tipo: 'digitable' },
        { id: 'ot-impuesto', label: 'Impuesto o contribución liquidada', tipo: 'digitable', ayuda: 'Base × tarifa de la norma que regula el tributo.' },
        { id: 'ot-sanciones', label: 'Sanciones e intereses', tipo: 'digitable' },
        { id: 'ot-total', label: 'Total a pagar', tipo: 'total', formula: [
          { id: 'ot-impuesto', signo: 1 }, { id: 'ot-sanciones', signo: 1 },
        ] },
      ],
    },
  ],
}

// ─── Lectura del borrador por casillas ───────────────────────────────────────
// Para los formularios DIAN con casillas numeradas, la IA solo TRANSCRIBE
// casilla → valor; el mapeo a renglones (con sus sumas) y la verificación de
// totales se hacen aquí de forma determinista. `digitables` dice qué casillas
// suma cada renglón; `verificaciones` compara el total que trae el formulario
// contra el renglón calculado para detectar formularios mal sumados o lecturas
// incompletas.

export type VerificacionFormulario = {
  /** Renglón calculado/total del catálogo a comparar. */
  id: string
  /** Casillas del formulario que expresan ese total (con signo, p. ej. saldo a favor resta). */
  casillas: Array<{ casilla: string; signo: 1 | -1 }>
}

export type LecturaFormulario = {
  digitables: Record<string, string[]>
  verificaciones: VerificacionFormulario[]
  /** Casillas conocidas del formulario que no se mapean ni ameritan advertencia (subtotales internos). */
  ignorar?: string[]
}

export const LECTURA_FORMULARIO: Partial<Record<TipoImpuesto, LecturaFormulario>> = {
  // Formulario 300 (IVA).
  iva: {
    digitables: {
      'iva-ing-19': ['28'],
      'iva-ing-5': ['27'],
      'iva-ing-exportaciones': ['30', '31'],
      'iva-ing-exentos': ['32', '33', '35'],
      'iva-ing-excluidos': ['39'],
      'iva-ing-no-gravadas': ['40'],
      'iva-ing-otras': ['29', '34', '36', '37', '38'],
      'iva-ing-devoluciones': ['42'],
      'iva-comp-19': ['45', '51', '53'],
      'iva-comp-5': ['44', '50', '52'],
      'iva-comp-no-gravadas': ['46', '47', '48', '49', '54'],
      'iva-comp-devoluciones': ['56'],
      'iva-gen-19': ['59'],
      'iva-gen-5': ['58'],
      'iva-gen-otros': ['60', '61', '62', '63', '64', '65'],
      'iva-gen-recuperado': ['66'],
      'iva-desc-compras': ['68', '69', '70', '71', '72'],
      'iva-desc-servicios': ['74', '75'],
      'iva-desc-otros': ['73', '76', '78'],
      'iva-desc-devoluciones': ['79'],
      'iva-desc-ajustes': ['80'],
      'iva-saldo-favor-ant': ['84'],
      'iva-retenido': ['85'],
      'iva-sanciones': ['87'],
    },
    verificaciones: [
      { id: 'iva-ing-brutos', casillas: [{ casilla: '41', signo: 1 }] },
      { id: 'iva-ing-netos', casillas: [{ casilla: '43', signo: 1 }] },
      { id: 'iva-comp-brutas', casillas: [{ casilla: '55', signo: 1 }] },
      { id: 'iva-comp-netas', casillas: [{ casilla: '57', signo: 1 }] },
      { id: 'iva-generado', casillas: [{ casilla: '67', signo: 1 }] },
      { id: 'iva-descontable', casillas: [{ casilla: '81', signo: 1 }] },
      // El formulario parte el saldo en dos casillas excluyentes (a pagar / a favor).
      { id: 'iva-saldo', casillas: [{ casilla: '82', signo: 1 }, { casilla: '83', signo: -1 }] },
      { id: 'iva-saldo-impuesto', casillas: [{ casilla: '86', signo: 1 }] },
      { id: 'iva-total', casillas: [{ casilla: '88', signo: 1 }, { casilla: '89', signo: -1 }] },
    ],
    // c77 es el subtotal "total impuesto pagado o facturado" (suma de 68–76): ruido, no hallazgo.
    ignorar: ['77'],
  },
  // Formulario 350 (retención en la fuente). Cada renglón digitable es
  // exactamente una casilla, así que el mapeo sale del propio catálogo.
  retefuente: {
    digitables: digitablesPorCasilla('retefuente'),
    verificaciones: [
      { id: 'rf-total-renta', casillas: [{ casilla: '130', signo: 1 }] },
      { id: 'rf-total-iva', casillas: [{ casilla: '134', signo: 1 }] },
      { id: 'rf-total', casillas: [{ casilla: '136', signo: 1 }] },
      { id: 'rf-total-sanciones', casillas: [{ casilla: '138', signo: 1 }] },
    ],
    // Encabezado (año, período, número, NIT, actividad y tarifa de autorretención)
    // y pie que el modelo a veces transcribe. La 980 (pago total) puede venir en
    // cero legítimamente si se pagó con recibo 490: no se verifica contra la 138.
    ignorar: ['1', '3', '4', '5', '6', '12', '25', '26', '27', '28', '139', '140', '980', '981', '982', '983', '994', '996', '997'],
  },
  // Formulario Único Nacional del ICA: la "casilla" es el número de renglón. Las
  // actividades de la sección C no tienen número: se transcriben con las claves
  // actN_ingresos / actN_impuesto (ver CASILLAS_ACTIVIDADES_ICA).
  ica: {
    digitables: {
      'ica-ingresos': ['8'],
      'ica-fuera-municipio': ['9'],
      'ica-devoluciones': ['11'],
      'ica-exportaciones': ['12'],
      'ica-activos-fijos': ['13'],
      'ica-no-sujetos': ['14'],
      'ica-exentos': ['15'],
      'ica-impuesto': ['17'],
      'ica-ley56': ['19'],
      'ica-avisos': ['21'],
      'ica-unidades': ['22'],
      'ica-bomberil': ['23'],
      'ica-seguridad': ['24'],
      'ica-exencion': ['26'],
      'ica-retenciones': ['27'],
      'ica-autorretenciones': ['28'],
      'ica-anticipo-ant': ['29'],
      'ica-anticipo-sig': ['30'],
      'ica-sanciones': ['31'],
      'ica-saldo-favor-ant': ['32'],
      'ica-descuento-pronto-pago': ['36'],
      'ica-intereses-mora': ['37'],
      ...Object.fromEntries(Array.from({ length: ACTIVIDADES_ICA }, (_, i) => [
        [idActividadIca(i + 1, 'ingresos'), [`act${i + 1}_ingresos`]],
        [idActividadIca(i + 1, 'impuesto'), [`act${i + 1}_impuesto`]],
      ]).flat()),
    },
    verificaciones: [
      { id: 'ica-ingresos-municipio', casillas: [{ casilla: '10', signo: 1 }] },
      { id: 'ica-base', casillas: [{ casilla: '16', signo: 1 }] },
      // Cuadre de la sección C contra el renglón 16 (solo si se transcribieron las actividades).
      { id: 'ica-act-ingresos', casillas: [{ casilla: '16', signo: 1 }] },
      { id: 'ica-total-ica', casillas: [{ casilla: '20', signo: 1 }] },
      { id: 'ica-impuesto-cargo', casillas: [{ casilla: '25', signo: 1 }] },
      // Saldo a cargo y a favor son excluyentes; el total a pagar va en cero cuando hay saldo a favor.
      { id: 'ica-saldo', casillas: [{ casilla: '33', signo: 1 }, { casilla: '34', signo: -1 }] },
      { id: 'ica-total-pagar', casillas: [{ casilla: '38', signo: 1 }, { casilla: '34', signo: -1 }] },
    ],
    // Identificación (1–7), capacidad instalada en kW (18), valor a pagar (35 = 33) y pago voluntario (39–40).
    // El impuesto por actividad no se redondea y el 17 sí: ese cuadre lo hace el agente con tolerancia.
    ignorar: ['1', '2', '3', '4', '5', '6', '7', '18', '35', '39', '40'],
  },
}

/** Claves con que la lectura transcribe la sección C del ICA (actividades sin número de renglón). */
export const CASILLAS_ACTIVIDADES_ICA = Array.from({ length: ACTIVIDADES_ICA }, (_, i) => [`act${i + 1}_ingresos`, `act${i + 1}_impuesto`]).flat()

/**
 * Convierte las casillas transcritas del formulario en cifras por renglón y
 * verifica los totales que el propio formulario declara. Las advertencias
 * incluyen totales que no cuadran y casillas con valor no mapeadas.
 */
export function aplicarLecturaFormulario(
  tipo: TipoImpuesto,
  casillas: Record<string, number | null>,
): { renglones: Record<string, number | null>; advertencias: string[] } | null {
  const cfg = LECTURA_FORMULARIO[tipo]
  if (!cfg) return null

  const renglones: Record<string, number | null> = {}
  for (const [id, lista] of Object.entries(cfg.digitables)) {
    const presentes = lista.filter((c) => typeof casillas[c] === 'number')
    renglones[id] = presentes.length
      ? presentes.reduce((suma, c) => suma + Math.round(casillas[c] as number), 0)
      : null
  }

  const etiquetas = new Map(
    CIFRAS_CATALOGO[tipo].flatMap((s) => s.renglones).map((r) => [r.id, r.label]),
  )
  const advertencias: string[] = []

  // Totales del formulario vs. lo que suman sus componentes.
  const resueltas = resolverCifras(
    tipo,
    Object.fromEntries(Object.entries(renglones).map(([id, v]) => [id, { declarado: v, libros: null }])),
  )
  for (const v of cfg.verificaciones) {
    const presentes = v.casillas.filter((c) => typeof casillas[c.casilla] === 'number')
    if (presentes.length === 0) continue
    const enFormulario = presentes.reduce((s, c) => s + c.signo * Math.round(casillas[c.casilla] as number), 0)
    const calculado = resueltas[v.id]?.declarado
    if (calculado !== null && calculado !== undefined && enFormulario !== calculado) {
      advertencias.push(
        `"${etiquetas.get(v.id) ?? v.id}": el formulario trae ${enFormulario.toLocaleString('es-CO')} pero sus componentes suman ${calculado.toLocaleString('es-CO')} — revisa la lectura o el formulario.`,
      )
    }
  }

  // Casillas con valor que no pertenecen a ningún renglón ni total conocido.
  const conocidas = new Set([
    ...Object.values(cfg.digitables).flat(),
    ...cfg.verificaciones.flatMap((v) => v.casillas.map((c) => c.casilla)),
    ...(cfg.ignorar ?? []),
  ])
  for (const [casilla, valor] of Object.entries(casillas)) {
    if (!conocidas.has(casilla) && typeof valor === 'number' && Math.round(valor) !== 0) {
      advertencias.push(`Casilla ${casilla} con valor ${Math.round(valor).toLocaleString('es-CO')} no corresponde a ningún renglón del catálogo.`)
    }
  }

  return { renglones, advertencias }
}

/**
 * Resuelve los renglones calculados/totales de un impuesto a partir de los
 * valores digitados. Devuelve declarado y libros por renglón (null si ningún
 * término de la fórmula está diligenciado, para no mostrar ceros fantasma).
 */
export function resolverCifras(
  tipo: TipoImpuesto,
  cifras: CifrasRevision,
): Record<string, { declarado: number | null; libros: number | null }> {
  const resultado: Record<string, { declarado: number | null; libros: number | null }> = {}

  const valorDe = (id: string, lado: 'declarado' | 'libros'): number | null => {
    if (resultado[id]) return resultado[id][lado]
    return cifras[id]?.[lado] ?? null
  }

  for (const seccion of CIFRAS_CATALOGO[tipo]) {
    for (const r of seccion.renglones) {
      if (r.tipo === 'digitable' || !r.formula) {
        resultado[r.id] = {
          declarado: cifras[r.id]?.declarado ?? null,
          libros: cifras[r.id]?.libros ?? null,
        }
        continue
      }
      // Las fórmulas solo referencian renglones anteriores (lo valida el test).
      const suma = (lado: 'declarado' | 'libros'): number | null => {
        let total = 0
        let alguno = false
        for (const t of r.formula!) {
          const v = valorDe(t.id, lado)
          if (v !== null) {
            alguno = true
            total += t.signo * v
          }
        }
        return alguno ? total : null
      }
      resultado[r.id] = { declarado: suma('declarado'), libros: suma('libros') }
    }
  }
  return resultado
}

export const ESTADOS_REVISION_TRIBUTARIA = ['pendiente', 'en_revision', 'revisada'] as const
export type EstadoRevisionTributaria = (typeof ESTADOS_REVISION_TRIBUTARIA)[number]

export const RESULTADOS_REVISION_TRIBUTARIA = ['sin_observaciones', 'con_observaciones'] as const
export type ResultadoRevisionTributaria = (typeof RESULTADOS_REVISION_TRIBUTARIA)[number]

/**
 * ¿La declaración se presentó después del vencimiento? Las fechas viajan como
 * 'YYYY-MM-DD', así que se comparan como texto sin pasar por Date (evita el
 * corrimiento de un día por zona horaria). Si falta alguna de las dos → false.
 */
export function presentacionExtemporanea(r: {
  fechaPresentacion: string | null
  fechaVencimiento: string | null
}): boolean {
  return !!r.fechaPresentacion && !!r.fechaVencimiento && r.fechaPresentacion > r.fechaVencimiento
}

/** Mismo patrón que `pasosEstado` de papeles de trabajo: clave = id del ítem del catálogo. */
export type ChecklistEstadoTributario = Record<string, { hecho: boolean; nota: string | null }>

// ─── Tipos de la API ─────────────────────────────────────────────────────────

export type ObligacionTributaria = {
  id: string
  empresaId: string
  anioFiscal: number
  tipo: TipoImpuesto
  /** Etiqueta libre; obligatoria para tipo 'otro', opcional para personalizar las demás. */
  nombre: string | null
  /** Impuestos municipales (reteICA, ICA): clave de MUNICIPIOS_RETEICA o el nombre escrito. Una obligación por municipio. */
  municipio: string | null
  periodicidad: Periodicidad
  asignadoA: string | null
  asignadoNombre: string | null
  createdAt: string
}

// ─── Programa de trabajo dinámico (revisión guiada) ──────────────────────────
// El auditor decide, antes de analizar, qué pasos sigue el agente y cuáles
// agrega por su cuenta. Los pasos del agente traen sus reglas; los propios son
// manuales y se marcan a mano. Al guardarse se materializa también como texto
// en `procedimientos`, así el informe y la constancia lo imprimen igual.

export type PasoPrograma = {
  id: string
  texto: string
  /** 'agente' = lo ejecuta el motor de reglas; 'propio' = lo agregó el auditor y lo marca a mano. */
  origen: 'agente' | 'propio'
  activo: boolean
  /** Solo pasos propios: hecho a mano por el auditor. */
  hecho?: boolean
  nota?: string | null
}

export type ProgramaRevision = {
  pasos: PasoPrograma[]
  actualizadoAt?: string
}

/** El programa como texto numerado (solo pasos activos): lo que imprime el informe. */
export function textoProcedimientos(programa: ProgramaRevision): string {
  return programa.pasos
    .filter((p) => p.activo)
    .map((p, i) => `${i + 1}. ${p.texto.replace(/\.?$/, '.')}`)
    .join('\n')
}

export type RevisionTributaria = {
  id: string
  obligacionId: string
  periodo: string
  /** Programa de trabajo decidido por el auditor (revisión guiada). null = aún no se ha definido. */
  programa: ProgramaRevision | null
  fechaVencimiento: string | null
  /** Fecha de presentación (YYYY-MM-DD). Solo se registra con la revisión firmada. */
  fechaPresentacion: string | null
  estado: EstadoRevisionTributaria
  resultado: ResultadoRevisionTributaria | null
  /** Encabezado del papel de trabajo. null = aún sin editar: se usa el borrador sugerido. */
  alcance: string | null
  procedimientos: string | null
  checklistEstado: ChecklistEstadoTributario
  /** Mini-formulario espejo del formulario oficial (CIFRAS_CATALOGO); solo renglones digitables. */
  cifras: CifrasRevision
  // Legado (los totales ahora salen de `cifras`); numeric de Postgres viaja como string.
  valorDeclarado: string | null
  valorLibros: string | null
  observaciones: string | null
  conclusion: string | null
  revisadoPor: string | null
  revisadoNombre: string | null
  revisadoAt: string | null
  createdAt: string
}

// ─── Adjuntos (soportes) ─────────────────────────────────────────────────────

export const TIPOS_ADJUNTO_TRIBUTARIO = [
  'declaracion',
  'pago',
  'conciliacion',
  'certificado',
  'evidencia',
  // Insumos del agente de IVA: el auxiliar contable del período y el reporte de
  // documentos electrónicos de la DIAN (ver docs/agente/procedimiento-iva-v1.md).
  'auxiliar',
  'reporte_dian',
  'otro',
] as const
export type TipoAdjuntoTributario = (typeof TIPOS_ADJUNTO_TRIBUTARIO)[number]

export const TIPO_ADJUNTO_LABELS: Record<TipoAdjuntoTributario, string> = {
  declaracion: 'Declaración presentada',
  pago: 'Recibo de pago',
  conciliacion: 'Conciliación',
  certificado: 'Certificado',
  evidencia: 'Evidencia de hallazgo',
  auxiliar: 'Auxiliar contable del período',
  reporte_dian: 'Reporte de documentos electrónicos (DIAN)',
  otro: 'Otro soporte',
}

/**
 * Tipos que se ofrecen al adjuntar evidencia de un hallazgo; el primero es el
 * predeterminado. "Declaración presentada" y "Recibo de pago" quedan fuera:
 * son soportes de la revisión, no de un hallazgo.
 */
export const TIPOS_ADJUNTO_EVIDENCIA: readonly TipoAdjuntoTributario[] = [
  'evidencia',
  'certificado',
  'conciliacion',
  'otro',
]

/**
 * Soportes que se pueden incorporar con la revisión ya firmada: la declaración
 * presentada y el recibo de pago existen solo después de la firma del revisor.
 * No entran al snapshot sellado; la constancia los marca como posteriores.
 */
export const TIPOS_ADJUNTO_POST_FIRMA: readonly TipoAdjuntoTributario[] = ['declaracion', 'pago']

export type AdjuntoTributario = {
  id: string
  revisionId: string
  /** Evidencia de ese hallazgo; null = soporte de la revisión. */
  hallazgoId: string | null
  nombre: string
  tipo: TipoAdjuntoTributario
  archivoNombre: string
  archivoMime: string
  archivoTamano: number
  subidoPor: string | null
  createdAt: string
  /** true si se subió con la revisión ya firmada (no está en el snapshot): se puede quitar. */
  posteriorAFirma: boolean
}

// ─── Hallazgos y recomendaciones ─────────────────────────────────────────────
// A diferencia de los hallazgos de ejecución del encargo, aquí NO hay criterio
// como campo aparte: el hallazgo tributario se documenta como situación
// encontrada + recomendación, y la norma aplicable se cita dentro del texto.
// El seguimiento puede continuar después de firmada la revisión (solo estado
// + seguimiento).

export const SEVERIDADES_HALLAZGO_TRIBUTARIO = ['alta', 'media', 'baja'] as const
export type SeveridadHallazgoTributario = (typeof SEVERIDADES_HALLAZGO_TRIBUTARIO)[number]

// Abierto → en trámite (ya se gestiona con el cliente pero no está cerrado) →
// resuelto. "Pendiente" es todo lo que no está resuelto: es lo que impide
// firmar "sin observaciones" y lo que el informe reporta en seguimiento.
export const ESTADOS_HALLAZGO_TRIBUTARIO = ['abierto', 'en_tramite', 'resuelto'] as const
export type EstadoHallazgoTributario = (typeof ESTADOS_HALLAZGO_TRIBUTARIO)[number]

export const ESTADO_HALLAZGO_TRIBUTARIO_LABELS: Record<EstadoHallazgoTributario, string> = {
  abierto: 'Abierto',
  en_tramite: 'En trámite',
  resuelto: 'Resuelto',
}

/** Única regla de "pendiente" para firma, badges e informe: todo lo no resuelto. */
export function hallazgoTributarioPendiente(h: Pick<HallazgoTributario, 'estado'>): boolean {
  return h.estado !== 'resuelto'
}

export type HallazgoTributario = {
  id: string
  revisionId: string
  /** La situación encontrada. */
  descripcion: string
  recomendacion: string | null
  // numeric de Postgres viaja como string; null = sin cuantificar.
  monto: string | null
  severidad: SeveridadHallazgoTributario
  estado: EstadoHallazgoTributario
  /** Nota de seguimiento / cómo se resolvió. Editable incluso con la revisión firmada. */
  seguimiento: string | null
  resueltoAt: string | null
  creadoPor: string | null
  createdAt: string
}

export type ObligacionConRevisiones = ObligacionTributaria & {
  revisiones: RevisionTributaria[]
}

export type RevisionTributariaDetalle = RevisionTributaria & {
  obligacion: ObligacionTributaria
  adjuntos: AdjuntoTributario[]
  hallazgos: HallazgoTributario[]
  /** Último análisis del agente (revisiones de IVA en modo agéntico); null si nunca corrió. */
  agente?: ResumenAgenteRevision | null
}

/**
 * Nombre a mostrar de una obligación: la etiqueta propia o el nombre del
 * catálogo, con el municipio en los impuestos municipales ("ReteICA · Bogotá D.C.")
 * salvo que la etiqueta ya lo diga.
 */
export function nombreObligacion(o: Pick<ObligacionTributaria, 'tipo' | 'nombre'> & { municipio?: string | null }): string {
  const base = o.nombre?.trim() || IMPUESTOS_CATALOGO[o.tipo].nombre
  if (!o.municipio) return base
  const yaLoDice = municipioDeTexto(o.nombre)?.clave === normalizarMunicipio(o.municipio)
  return yaLoDice ? base : `${base} · ${nombreMunicipio(o.municipio)}`
}

// ─── Encabezado del papel de trabajo (NIA 230) ───────────────────────────────
// La revisión se documenta como papel de trabajo: primero qué se propuso
// revisar (alcance) y con qué procedimientos, y solo después el resultado.
// Ambos son texto libre del revisor; estas funciones dan el borrador estándar
// para no escribirlo desde cero cada período. Al firmar se materializan en la
// fila, de modo que la constancia no dependa del catálogo vigente después.

export function alcanceSugerido(args: {
  obligacion: Pick<ObligacionTributaria, 'tipo' | 'nombre' | 'periodicidad' | 'anioFiscal'>
  periodo: string
  empresaNombre: string
}): string {
  const { obligacion, periodo, empresaNombre } = args
  const etiqueta = etiquetaPeriodo(obligacion.periodicidad, periodo)
  return [
    `Revisión de ${nombreObligacion(obligacion)} de ${empresaNombre} correspondiente a ${etiqueta} de ${obligacion.anioFiscal}, adelantada en desarrollo de las funciones de revisoría fiscal (arts. 207 y 209 del Código de Comercio).`,
    'El alcance comprende la verificación de la declaración del período frente a los registros de contabilidad, la razonabilidad de las bases y tarifas aplicadas, la consistencia con los períodos anteriores y la oportunidad en la presentación y el pago.',
    'No constituye una auditoría tributaria integral ni una revisión de la totalidad de las transacciones del período, y no releva a la administración de su responsabilidad por la preparación y presentación de la declaración.',
  ].join('\n\n')
}

/**
 * Los procedimientos son el checklist del impuesto: el programa de trabajo y
 * lo que se ejecuta son lo mismo, así que el borrador se deriva del catálogo
 * en lugar de duplicarse como texto aparte.
 */
export function procedimientosSugeridos(tipo: TipoImpuesto): string {
  return IMPUESTOS_CATALOGO[tipo].checklist.map((item, i) => `${i + 1}. ${item.texto}.`).join('\n')
}
