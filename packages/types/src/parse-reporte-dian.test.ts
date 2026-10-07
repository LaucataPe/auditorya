import { describe, expect, it } from 'vitest'
import { clasificarDocumentoDian, fechaDian, mesesEntre, parseReporteDian, resumirReporteDianPeriodo } from './parse-reporte-dian'
import { REPORTE_DIAN_DOCUMENTOS } from './fixtures/reporte-dian-documentos'

const rep = parseReporteDian(REPORTE_DIAN_DOCUMENTOS)!
const conteo = (clase: string) => rep.documentos.filter((d) => d.clase === clase).length

describe('fechaDian', () => {
  it('convierte dd-mm-yyyy con o sin hora', () => {
    expect(fechaDian('17-07-2026')).toBe('2026-07-17')
    expect(fechaDian('17-07-2026 09:29:30')).toBe('2026-07-17')
    expect(fechaDian('5/2/2026')).toBe('2026-02-05')
    expect(fechaDian('2026-07-17')).toBe('2026-07-17')
    expect(fechaDian('')).toBeNull()
  })
})

describe('clasificarDocumentoDian: por tipo, no por grupo', () => {
  it('facturas y notas según el grupo', () => {
    expect(clasificarDocumentoDian('Factura electrónica', 'emitido')).toBe('venta')
    expect(clasificarDocumentoDian('Factura electrónica de contingencia', 'recibido')).toBe('compra')
    expect(clasificarDocumentoDian('Nota Crédito', 'emitido')).toBe('nota_credito_venta')
    expect(clasificarDocumentoDian('Nota crédito electrónica', 'recibido')).toBe('nota_credito_compra')
    expect(clasificarDocumentoDian('Nota Débito', 'emitido')).toBe('nota_debito_venta')
  })
  it('el documento soporte es compra aunque venga como emitido', () => {
    expect(clasificarDocumentoDian('Documento soporte con no obligados', 'emitido')).toBe('compra_no_obligado')
    expect(clasificarDocumentoDian('Nota de ajuste del documento soporte', 'emitido')).toBe('ajuste_no_obligado')
  })
  it('los eventos y lo desconocido se separan', () => {
    expect(clasificarDocumentoDian('Application response', 'recibido')).toBe('evento')
    expect(clasificarDocumentoDian('Nómina electrónica', 'emitido')).toBe('otro')
  })
})

describe('parseReporteDian (reporte real)', () => {
  it('excluye los Application response y clasifica el resto', () => {
    expect(rep.excluidos.eventos).toBe(6)
    expect(rep.documentos).toHaveLength(38)
    expect(conteo('venta')).toBe(12)
    expect(conteo('compra')).toBe(14)
    expect(conteo('compra_no_obligado')).toBe(11)
    expect(conteo('ajuste_no_obligado')).toBe(1)
    expect(rep.excluidos.tiposDesconocidos).toEqual({})
  })
  it('identifica el NIT de la empresa dueña del reporte', () => {
    expect(rep.nitEmpresa).toBe('900000001')
    expect(rep.advertencias.some((a) => a.includes('Application response'))).toBe(true)
  })
  it('estima la base restando IVA e impuesto al consumo', () => {
    const conInc = rep.documentos.find((d) => d.inc > 0)!
    expect(conInc.baseEstimada).toBeCloseTo(conInc.total - conInc.iva - conInc.inc, 2)
    const sinImpuestos = rep.documentos.find((d) => d.clase === 'venta')!
    expect(sinImpuestos.baseEstimada).toBe(sinImpuestos.total)
    expect(rep.documentos.find((d) => d.contingencia)?.clase).toBe('compra')
  })
  it('devuelve null si faltan las columnas del reporte', () => {
    expect(parseReporteDian([['Tipo de documento', 'Folio'], ['Factura electrónica', '1']])).toBeNull()
    expect(parseReporteDian([['1105', 'Caja', '100']])).toBeNull()
  })
})

describe('resumirReporteDianPeriodo', () => {
  it('suma ventas, compras y compras a no obligados del período', () => {
    const r = resumirReporteDianPeriodo(rep, { desde: '2026-03-01', hasta: '2026-04-30' })
    expect(r.ventas.n).toBe(0)
    expect(r.compras.n).toBe(5)
    expect(r.compras.total).toBeCloseTo(406_800.08, 2)
    expect(r.compras.iva).toBeCloseTo(1_995.8, 2)
    expect(r.comprasNoObligados).toMatchObject({ n: 6, total: 1_132_100 })
    expect(r.comprasVentana.n).toBe(5)
  })
  it('la ventana de descontables amplía las compras hacia atrás (art. 496)', () => {
    const r = resumirReporteDianPeriodo(rep, { desde: '2026-03-01', hasta: '2026-04-30', ventanaDesde: '2025-11-01' })
    expect(r.comprasVentana.n).toBeGreaterThan(r.compras.n)
    expect(r.compras.n).toBe(5)
  })
  it('ingresos = suma de facturas de venta; devoluciones = suma de notas crédito', () => {
    const r = resumirReporteDianPeriodo(rep, { desde: '2026-01-01', hasta: '2026-08-31' })
    expect(r.ventas.n).toBe(12)
    expect(r.ventas.total).toBe(2_379_829)
    expect(r.ingresosNetos).toBe(r.ventas.base - r.notasCreditoVentas.base + r.notasDebitoVentas.base)
    expect(r.ivaGeneradoNeto).toBe(0)
    expect(r.compras).toMatchObject({ n: 14 })
    expect(r.compras.total).toBeCloseTo(904_511.1, 2)
    // Los 11 documentos soporte menos la nota de ajuste.
    expect(r.comprasNoObligados).toMatchObject({ n: 12, total: 2_612_627 - 311_502 })
    // El subconjunto del fixture no trae documentos emitidos en junio.
    expect(r.mesesSinEmitidos).toEqual(['2026-06'])
  })
  it('mesesEntre lista los meses del período', () => {
    expect(mesesEntre('2026-11-01', '2027-02-28')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
  })
})
