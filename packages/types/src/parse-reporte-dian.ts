/**
 * "Reporte de documentos electrónicos" del portal de facturación electrónica de
 * la DIAN (hoja Rp_Doc_<fecha>, encabezado en la fila 1, 32 columnas fijas).
 * Lógica pura sobre la matriz de strings de leerExcelAFilas.
 *
 * Lo que el archivo real condiciona (ver docs/agente/procedimiento-iva-v1.md §7):
 *  - No trae base gravable ni subtotal: la base se ESTIMA como Total − impuestos
 *    (+ retenciones si vienen, porque entonces el Total viene neto).
 *  - Mezcla documentos con eventos "Application response" (Total 0): se excluyen.
 *  - El grupo "Emitido" no significa venta: el documento soporte con no obligados
 *    lo emite el comprador. La clase se decide por TIPO de documento.
 */

export const COLUMNAS_REPORTE_DIAN = [
  'Tipo de documento', 'CUFE/CUDE', 'Folio', 'Prefijo', 'Divisa', 'Forma de Pago', 'Medio de Pago',
  'Fecha Emisión', 'Fecha Recepción', 'NIT Emisor', 'Nombre Emisor', 'NIT Receptor', 'Nombre Receptor',
  'IVA', 'ICA', 'IC', 'INC', 'Timbre', 'INC Bolsas', 'IN Carbono', 'IN Combustibles', 'IC Datos', 'ICL',
  'INPP', 'IBUA', 'ICUI', 'Rete IVA', 'Rete Renta', 'Rete ICA', 'Total', 'Estado', 'Grupo',
] as const

/** Columnas mínimas para que el archivo sirva. */
const COLUMNAS_REQUERIDAS = ['Tipo de documento', 'Fecha Emisión', 'NIT Emisor', 'NIT Receptor', 'IVA', 'Total', 'Grupo'] as const

/** Impuestos distintos del IVA que el reporte desglosa y que se restan del Total para estimar la base. */
const OTROS_IMPUESTOS = ['ICA', 'IC', 'INC', 'Timbre', 'INC Bolsas', 'IN Carbono', 'IN Combustibles', 'IC Datos', 'ICL', 'INPP', 'IBUA', 'ICUI'] as const

export type ClaseDocumentoDian =
  | 'venta'
  | 'compra'
  | 'nota_credito_venta'
  | 'nota_debito_venta'
  | 'nota_credito_compra'
  | 'nota_debito_compra'
  /** Documento soporte con no obligados: compra sin IVA que emite el comprador. */
  | 'compra_no_obligado'
  /** Nota de ajuste del documento soporte: resta de las compras a no obligados. */
  | 'ajuste_no_obligado'
  /** Application response: acuse, aceptación, reclamo. No es un documento. */
  | 'evento'
  | 'otro'

export type DocumentoDian = {
  clase: ClaseDocumentoDian
  tipo: string
  cufe: string | null
  folio: string | null
  prefijo: string | null
  /** YYYY-MM-DD */
  fechaEmision: string
  /** YYYY-MM-DD (sin la hora) */
  fechaRecepcion: string | null
  nitEmisor: string
  nombreEmisor: string | null
  nitReceptor: string
  nombreReceptor: string | null
  iva: number
  inc: number
  /** Suma de los demás impuestos desglosados (ICA, IC, timbre, saludables, etc.). */
  otrosImpuestos: number
  reteIva: number
  reteRenta: number
  reteIca: number
  total: number
  /** Total − IVA − INC − otros impuestos + retenciones. Siempre estimada. */
  baseEstimada: number
  estado: string
  grupo: 'emitido' | 'recibido'
  contingencia: boolean
}

export type ReporteDianParseado = {
  documentos: DocumentoDian[]
  /** NIT de la empresa dueña del reporte: emisor de lo emitido y receptor de lo recibido. */
  nitEmpresa: string | null
  excluidos: {
    eventos: number
    /** Documentos con estado distinto de aprobado. */
    noAprobados: number
    /** Tipos de documento que no se supieron clasificar, con su conteo. */
    tiposDesconocidos: Record<string, number>
  }
  advertencias: string[]
}

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** dd-mm-yyyy[ hh:mm:ss] → YYYY-MM-DD; también acepta ISO y dd/mm/yyyy. */
export function fechaDian(raw: string): string | null {
  const s = (raw ?? '').toString().trim()
  let m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(s)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return null
}

function numero(raw: string | undefined): number {
  const s = (raw ?? '').toString().trim()
  if (!s) return 0
  const n = Number(s.replace(/[^\d.\-]/g, ''))
  return isFinite(n) ? n : 0
}

/** Clasifica por tipo de documento; el grupo solo decide el sentido de facturas y notas. */
export function clasificarDocumentoDian(tipo: string, grupo: 'emitido' | 'recibido'): ClaseDocumentoDian {
  const t = sinAcentos(tipo)
  if (t.includes('application response')) return 'evento'
  if (t.includes('documento soporte')) return t.includes('nota') || t.includes('ajuste') ? 'ajuste_no_obligado' : 'compra_no_obligado'
  if (/nota\s*cr/.test(t)) return grupo === 'emitido' ? 'nota_credito_venta' : 'nota_credito_compra'
  if (/nota\s*de?b/.test(t)) return grupo === 'emitido' ? 'nota_debito_venta' : 'nota_debito_compra'
  if (t.includes('factura')) return grupo === 'emitido' ? 'venta' : 'compra'
  return 'otro'
}

export function parseReporteDian(filas: string[][]): ReporteDianParseado | null {
  const hi = filas.findIndex((f) => f.some((c) => sinAcentos(c ?? '') === 'tipo de documento'))
  if (hi < 0) return null
  const hdr = filas[hi].map((c) => sinAcentos(c ?? ''))
  const col = (nombre: string): number | null => {
    const i = hdr.indexOf(sinAcentos(nombre))
    return i >= 0 ? i : null
  }
  const faltan = COLUMNAS_REQUERIDAS.filter((c) => col(c) === null)
  if (faltan.length) return null

  const advertencias: string[] = []
  const desconocidas = filas[hi].filter((c) => c && !(COLUMNAS_REPORTE_DIAN as readonly string[]).some((k) => sinAcentos(k) === sinAcentos(c)))
  if (desconocidas.length) advertencias.push(`Columnas que no reconozco y no uso: ${desconocidas.join(', ')}.`)

  const celda = (f: string[], nombre: string) => {
    const i = col(nombre)
    return i === null ? '' : (f[i] ?? '').toString().trim()
  }

  const documentos: DocumentoDian[] = []
  let eventos = 0
  let noAprobados = 0
  const tiposDesconocidos: Record<string, number> = {}
  const emisores = new Map<string, number>()
  const receptores = new Map<string, number>()

  for (const f of filas.slice(hi + 1)) {
    const tipo = celda(f, 'Tipo de documento')
    if (!tipo) continue
    const grupoRaw = sinAcentos(celda(f, 'Grupo'))
    const grupo: 'emitido' | 'recibido' = grupoRaw.startsWith('recib') ? 'recibido' : 'emitido'
    const clase = clasificarDocumentoDian(tipo, grupo)
    if (clase === 'evento') {
      eventos++
      continue
    }
    const estado = celda(f, 'Estado')
    if (estado && !sinAcentos(estado).startsWith('aprobado')) {
      noAprobados++
      continue
    }
    if (clase === 'otro') tiposDesconocidos[tipo] = (tiposDesconocidos[tipo] ?? 0) + 1

    const fechaEmision = fechaDian(celda(f, 'Fecha Emisión'))
    if (!fechaEmision) {
      advertencias.push(`Documento ${celda(f, 'Prefijo')}${celda(f, 'Folio')} sin fecha de emisión legible: se omitió.`)
      continue
    }
    const iva = numero(celda(f, 'IVA'))
    const inc = numero(celda(f, 'INC'))
    const otrosImpuestos = OTROS_IMPUESTOS.filter((k) => k !== 'INC').reduce((s, k) => s + numero(celda(f, k)), 0)
    const reteIva = numero(celda(f, 'Rete IVA'))
    const reteRenta = numero(celda(f, 'Rete Renta'))
    const reteIca = numero(celda(f, 'Rete ICA'))
    const total = numero(celda(f, 'Total'))
    const nitEmisor = celda(f, 'NIT Emisor')
    const nitReceptor = celda(f, 'NIT Receptor')
    if (grupo === 'emitido') emisores.set(nitEmisor, (emisores.get(nitEmisor) ?? 0) + 1)
    else receptores.set(nitReceptor, (receptores.get(nitReceptor) ?? 0) + 1)

    documentos.push({
      clase,
      tipo,
      cufe: celda(f, 'CUFE/CUDE') || null,
      folio: celda(f, 'Folio') || null,
      prefijo: celda(f, 'Prefijo') || null,
      fechaEmision,
      fechaRecepcion: fechaDian(celda(f, 'Fecha Recepción')),
      nitEmisor,
      nombreEmisor: celda(f, 'Nombre Emisor') || null,
      nitReceptor,
      nombreReceptor: celda(f, 'Nombre Receptor') || null,
      iva,
      inc,
      otrosImpuestos,
      reteIva,
      reteRenta,
      reteIca,
      total,
      baseEstimada: total - iva - inc - otrosImpuestos + reteIva + reteRenta + reteIca,
      estado,
      grupo,
      contingencia: sinAcentos(tipo).includes('contingencia'),
    })
  }

  const masComun = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  const nitEmitidos = masComun(emisores)
  const nitRecibidos = masComun(receptores)
  let nitEmpresa = nitEmitidos ?? nitRecibidos
  if (nitEmitidos && nitRecibidos && nitEmitidos !== nitRecibidos) {
    advertencias.push(`El emisor de lo emitido (${nitEmitidos}) no coincide con el receptor de lo recibido (${nitRecibidos}): el reporte parece mezclar dos NIT.`)
    nitEmpresa = nitEmitidos
  }
  if (eventos) advertencias.push(`${eventos} evento(s) "Application response" excluidos: son acuses, no documentos.`)
  if (noAprobados) advertencias.push(`${noAprobados} documento(s) con estado distinto de aprobado excluidos.`)
  for (const [t, n] of Object.entries(tiposDesconocidos)) advertencias.push(`${n} documento(s) de tipo "${t}" no clasificados: se leyeron pero no suman en ventas ni compras.`)
  if (documentos.some((d) => d.reteIva || d.reteRenta || d.reteIca)) {
    advertencias.push('Hay documentos con retenciones: la base estimada asume que el Total viene neto de retenciones y las suma de vuelta.')
  }

  return { documentos, nitEmpresa, excluidos: { eventos, noAprobados, tiposDesconocidos }, advertencias }
}

// ─── Resumen por período ─────────────────────────────────────────────────────

export type SumaDocumentos = { n: number; base: number; iva: number; total: number }

export type ResumenDianPeriodo = {
  desde: string
  hasta: string
  /** Facturas de venta emitidas en el período. Ingresos = Σ base estimada (criterio de la usuaria). */
  ventas: SumaDocumentos
  /** Notas crédito emitidas: devoluciones en ventas. */
  notasCreditoVentas: SumaDocumentos
  notasDebitoVentas: SumaDocumentos
  /** Facturas recibidas con fecha de emisión en el período. */
  compras: SumaDocumentos
  /** Facturas recibidas en la ventana ampliada (período + anteriores, art. 496 ET): soporte del descontable. */
  comprasVentana: SumaDocumentos
  notasCreditoCompras: SumaDocumentos
  /** Documentos soporte menos sus notas de ajuste: compras a no obligados. */
  comprasNoObligados: SumaDocumentos
  /** Recibidas con emisión en el período pero recepción después del cierre. */
  recibidasTarde: number
  contingencia: number
  /** Meses del período sin ningún documento emitido. */
  mesesSinEmitidos: string[]
  /** IVA generado neto según DIAN: ventas − notas crédito + notas débito. */
  ivaGeneradoNeto: number
  /** Ingresos netos según DIAN: base de ventas − base de notas crédito + notas débito. */
  ingresosNetos: number
}

const vacio = (): SumaDocumentos => ({ n: 0, base: 0, iva: 0, total: 0 })
function sumar(docs: DocumentoDian[], signo: 1 | -1 = 1): SumaDocumentos {
  return docs.reduce(
    (s, d) => ({ n: s.n + 1, base: s.base + signo * d.baseEstimada, iva: s.iva + signo * d.iva, total: s.total + signo * d.total }),
    vacio(),
  )
}

/** Lista de meses YYYY-MM entre dos fechas, inclusive. */
export function mesesEntre(desde: string, hasta: string): string[] {
  const out: string[] = []
  let [a, m] = desde.slice(0, 7).split('-').map(Number)
  const fin = hasta.slice(0, 7)
  while (`${a}-${String(m).padStart(2, '0')}` <= fin) {
    out.push(`${a}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; a++ }
  }
  return out
}

export function resumirReporteDianPeriodo(
  reporte: Pick<ReporteDianParseado, 'documentos'>,
  periodo: { desde: string; hasta: string; /** Inicio de la ventana de descontables (art. 496); por defecto = desde. */ ventanaDesde?: string },
): ResumenDianPeriodo {
  const en = (d: DocumentoDian, desde: string) => d.fechaEmision >= desde && d.fechaEmision <= periodo.hasta
  const enPeriodo = reporte.documentos.filter((d) => en(d, periodo.desde))
  const enVentana = reporte.documentos.filter((d) => en(d, periodo.ventanaDesde ?? periodo.desde))
  const de = (clase: ClaseDocumentoDian, lista = enPeriodo) => lista.filter((d) => d.clase === clase)

  const ventas = sumar(de('venta'))
  const notasCreditoVentas = sumar(de('nota_credito_venta'))
  const notasDebitoVentas = sumar(de('nota_debito_venta'))
  const ds = sumar(de('compra_no_obligado'))
  const ajustes = sumar(de('ajuste_no_obligado'), -1)
  const emitidos = enPeriodo.filter((d) => d.grupo === 'emitido')
  const mesesConEmitidos = new Set(emitidos.map((d) => d.fechaEmision.slice(0, 7)))

  return {
    desde: periodo.desde,
    hasta: periodo.hasta,
    ventas,
    notasCreditoVentas,
    notasDebitoVentas,
    compras: sumar(de('compra')),
    comprasVentana: sumar(de('compra', enVentana)),
    notasCreditoCompras: sumar(de('nota_credito_compra')),
    comprasNoObligados: { n: ds.n + ajustes.n, base: ds.base + ajustes.base, iva: ds.iva + ajustes.iva, total: ds.total + ajustes.total },
    recibidasTarde: de('compra').filter((d) => d.fechaRecepcion !== null && d.fechaRecepcion > periodo.hasta).length,
    contingencia: enPeriodo.filter((d) => d.contingencia).length,
    mesesSinEmitidos: mesesEntre(periodo.desde, periodo.hasta).filter((m) => !mesesConEmitidos.has(m)),
    ivaGeneradoNeto: ventas.iva - notasCreditoVentas.iva + notasDebitoVentas.iva,
    ingresosNetos: ventas.base - notasCreditoVentas.base + notasDebitoVentas.base,
  }
}
