import { describe, expect, it } from 'vitest'
import { PROGRAMA_AGENTE_IVA, correrRevisionIva, huellaDeclarado, insumosDelPrograma, programaSugeridoIva, reglasOmitidas, severidadPorProporcion, type EntradaCorridaIva } from './agente-iva'
import type { MapeoLibrosIva } from './agente-iva-libros'
import type { ResumenDianPeriodo, SumaDocumentos } from './parse-reporte-dian'
import type { CifrasRevision } from './tributario'
import { inicioVentanaDescontables, periodoAnterior, rangoPeriodo, textoProcedimientos } from './tributario'

// ─── Constructores ───────────────────────────────────────────────────────────

/** Formulario 300 coherente: bases, IVA al 19 %, descontables y saldo a pagar. */
const DECLARADO: Record<string, number> = {
  'iva-ing-19': 48_000_000,
  'iva-ing-excluidos': 0,
  'iva-ing-devoluciones': 1_000_000,
  'iva-comp-19': 30_000_000,
  'iva-comp-no-gravadas': 2_000_000,
  'iva-gen-19': 9_120_000,
  'iva-desc-compras': 3_000_000,
  'iva-desc-servicios': 2_700_000,
  // IVA de las notas crédito del período (casilla 79).
  'iva-desc-devoluciones': 190_000,
  'iva-saldo-favor-ant': 0,
  'iva-retenido': 500_000,
  'iva-sanciones': 0,
}

function cifras(declarado: Record<string, number | null>, libros: Record<string, number> = {}): CifrasRevision {
  const out: CifrasRevision = {}
  for (const [id, v] of Object.entries(declarado)) out[id] = { declarado: v, libros: libros[id] ?? null }
  for (const [id, v] of Object.entries(libros)) if (!out[id]) out[id] = { declarado: null, libros: v }
  return out
}

function libros(valores: Record<string, number>, totales: MapeoLibrosIva['totales'] = {}, sinClasificar: MapeoLibrosIva['sinClasificar'] = []): MapeoLibrosIva {
  return {
    cifras: Object.fromEntries(Object.entries(valores).map(([id, v]) => [id, { libros: v }])),
    totales,
    cuentas: Object.keys(valores).map((id) => ({ cuenta: '2408', nombre: id, destino: id as never, total: null, neto: valores[id], regla: 'nombre', motivo: '' })),
    sinClasificar,
    bitacora: ['Mapeé cuentas.'],
  }
}

const suma = (n: number, base: number, iva: number): SumaDocumentos => ({ n, base, iva, total: base + iva })
const vacia = suma(0, 0, 0)
function dian(parcial: Partial<ResumenDianPeriodo> = {}): NonNullable<EntradaCorridaIva['dian']> {
  const ventas = parcial.ventas ?? suma(40, 48_000_000, 9_120_000)
  const nc = parcial.notasCreditoVentas ?? suma(2, 1_000_000, 190_000)
  const resumen: ResumenDianPeriodo = {
    desde: '2026-03-01', hasta: '2026-04-30',
    ventas, notasCreditoVentas: nc, notasDebitoVentas: vacia,
    compras: suma(20, 30_000_000, 5_700_000), comprasVentana: suma(24, 34_000_000, 6_000_000), notasCreditoCompras: vacia,
    comprasNoObligados: suma(3, 2_000_000, 0), recibidasTarde: 0, contingencia: 0, mesesSinEmitidos: [],
    ivaGeneradoNeto: ventas.iva - nc.iva, ingresosNetos: ventas.base - nc.base,
    ...parcial,
  }
  return { resumen, nitReporte: '900000001', nitEmpresa: '900000001-3', advertencias: [] }
}

const base: EntradaCorridaIva = {
  periodo: { desde: '2026-03-01', hasta: '2026-04-30', etiqueta: 'Bim. 2 (mar–abr) 2026', periodicidad: 'bimestral' },
  cifras: cifras(DECLARADO),
}
const LIBROS_IGUALES = { 'iva-gen-19': 9_120_000, 'iva-desc-compras': 3_000_000, 'iva-desc-servicios': 2_700_000, 'iva-ing-devoluciones': 1_000_000, 'iva-retenido': 500_000 }

const porRegla = (r: ReturnType<typeof correrRevisionIva>, regla: string) => r.propuestas.filter((p) => p.reglas.includes(regla))

// ─── Períodos ────────────────────────────────────────────────────────────────

describe('rangoPeriodo / periodoAnterior / ventana', () => {
  it('convierte la clave del período en fechas', () => {
    expect(rangoPeriodo('bimestral', 'B2', 2026)).toEqual({ desde: '2026-03-01', hasta: '2026-04-30' })
    expect(rangoPeriodo('bimestral', 'B1', 2028)).toEqual({ desde: '2028-01-01', hasta: '2028-02-29' })
    expect(rangoPeriodo('cuatrimestral', 'C3', 2026)).toEqual({ desde: '2026-09-01', hasta: '2026-12-31' })
    expect(rangoPeriodo('mensual', '02', 2026)).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' })
    expect(rangoPeriodo('anual', 'A', 2026)).toEqual({ desde: '2026-01-01', hasta: '2026-12-31' })
    expect(rangoPeriodo('bimestral', 'B7', 2026)).toBeNull()
  })
  it('período anterior dentro de la vigencia', () => {
    expect(periodoAnterior('bimestral', 'B3')).toBe('B2')
    expect(periodoAnterior('bimestral', 'B1')).toBeNull()
    expect(periodoAnterior('mensual', '10')).toBe('09')
    expect(periodoAnterior('anual', 'A')).toBeNull()
  })
  it('la ventana de descontables retrocede dos bimestres (art. 496)', () => {
    expect(inicioVentanaDescontables('bimestral', '2026-03-01')).toBe('2025-11-01')
    expect(inicioVentanaDescontables('cuatrimestral', '2026-05-01')).toBe('2026-01-01')
  })
})

describe('severidadPorProporcion', () => {
  it('ordena por proporción y aplica escaladores con tope alto', () => {
    expect(severidadPorProporcion(6, 100).severidad).toBe('alta')
    expect(severidadPorProporcion(2, 100).severidad).toBe('media')
    expect(severidadPorProporcion(0.5, 100).severidad).toBe('baja')
    expect(severidadPorProporcion(0.5, 100, ['omision']).severidad).toBe('media')
    expect(severidadPorProporcion(6, 100, ['omision']).severidad).toBe('alta')
    expect(severidadPorProporcion(10, 0).severidad).toBe('alta')
  })
})

// ─── Corrida ─────────────────────────────────────────────────────────────────

describe('correrRevisionIva: formulario coherente y libros iguales', () => {
  const r = correrRevisionIva({ ...base, libros: libros(LIBROS_IGUALES) })
  it('no produce hallazgos ni propone "marcar como verificado": el punto lo cierra la conclusión de la cédula', () => {
    expect(r.resumen.hallazgos).toBe(0)
    expect(r.resumen.verificados).toEqual(expect.arrayContaining(['ingresos-conciliados', 'iva-generado', 'iva-descontable', 'proporcionalidad']))
    expect(porRegla(r, 'I-90')).toEqual([])
    expect(r.propuestas).toEqual([])
  })
  it('cédulas: cada procedimiento muestra todo lo comparado, con su tolerancia', () => {
    const c = Object.fromEntries(r.cedulas!.map((x) => [x.id, x]))
    expect(r.cedulas!.map((x) => x.id)).toEqual(['formulario', 'lectura-libros', 'ingresos-libros', 'generado-libros', 'descontable-libros', 'retenciones-libros', 'lectura-dian', 'dian-ventas', 'dian-compras', 'saldo-favor', 'proporcionalidad', 'oportunidad'])
    // Formulario: tarifa, descontable contra compras y devoluciones, todas conformes.
    const pruebas = c.formulario.tablas.find((t) => t.id === 'pruebas')!
    expect(pruebas.filas.map((f) => [f.regla, f.estado])).toEqual([['I-02', 'conforme'], ['I-04', 'conforme'], ['I-06', 'conforme']])
    expect(pruebas.filas[0].valores).toMatchObject({ declarado: 9_120_000, referencia: 9_120_000, diferencia: 0 })
    // Cruce con libros: cada renglón comparado queda escrito en la cédula de su sección.
    expect(c['generado-libros'].tablas[0].filas.map((f) => [f.valores.casilla, f.estado])).toEqual([['59', 'conforme']])
    expect(c['descontable-libros'].tablas[0].filas).toHaveLength(2)
    expect(c['retenciones-libros'].tablas[0].filas[0].valores).toMatchObject({ casilla: '85', declarado: 500_000, referencia: 500_000 })
    expect(c['ingresos-libros'].tablas[0].filas[0].valores.casilla).toBe('42')
    expect(c['generado-libros'].conclusionSugerida).toMatch(/No se identificaron diferencias/)
    // Lectura: la clasificación de cada cuenta y lo que quedó por renglón.
    expect(c['lectura-libros'].tablas.map((t) => t.id)).toEqual(['clasificacion', 'renglones'])
    // Sin reporte DIAN ni período anterior: las cédulas existen y dicen por qué no corrieron.
    expect(c['dian-ventas']).toMatchObject({ estado: 'sin_insumos' })
    expect(c['lectura-dian'].motivo).toMatch(/No se cargó el reporte/)
    expect(c['saldo-favor'].estado).toBe('sin_insumos')
    expect(c.proporcionalidad.tablas[0].filas.at(-1)).toMatchObject({ estado: 'conforme' })
  })
  it('cédulas: la diferencia lleva el código de su propuesta y la propuesta sabe de qué cédula salió', () => {
    const d = correrRevisionIva({ ...base, libros: libros({ ...LIBROS_IGUALES, 'iva-gen-19': 9_500_000 }), fechaVencimiento: '2026-05-12', fechaPresentacion: '2026-05-15' })
    const gen = d.cedulas!.find((x) => x.id === 'generado-libros')!
    const h = porRegla(d, 'I-12')[0]
    expect(gen.tablas[0].filas[0]).toMatchObject({ estado: 'diferencia', propuesta: h.codigo })
    expect(h.contenido.tributario?.cedula).toBe('generado-libros')
    expect(gen.huella).not.toBe(r.cedulas!.find((x) => x.id === 'generado-libros')!.huella)
    // I-34: presentación posterior al vencimiento.
    expect(porRegla(d, 'I-34')[0]).toMatchObject({ tipo: 'hallazgo', severidad: 'alta' })
    expect(d.cedulas!.find((x) => x.id === 'oportunidad')!.resultado.diferencias).toBe(1)
  })
  it('cédulas del cruce con la DIAN: documentos por tipo y cada cruce con su resultado', () => {
    const d = correrRevisionIva({ ...base, dian: dian({ comprasVentana: suma(10, 20_000_000, 3_800_000) }) })
    const c = Object.fromEntries(d.cedulas!.map((x) => [x.id, x]))
    expect(c['lectura-dian'].tablas.find((t) => t.id === 'documentos')!.filas).toHaveLength(7)
    expect(c['lectura-dian'].tablas.find((t) => t.id === 'puntos')!.filas.map((f) => f.estado)).toEqual(['conforme', 'conforme'])
    expect(c['dian-ventas'].tablas[0].filas.map((f) => f.regla)).toEqual(['I-20', 'I-24', 'I-21', 'I-24'])
    expect(c['dian-ventas'].resultado.diferencias).toBe(0)
    const sop = c['dian-compras'].tablas.find((t) => t.id === 'soporte')!
    expect(sop.filas[0]).toMatchObject({ estado: 'diferencia', propuesta: porRegla(d, 'I-22')[0].codigo })
    // Reporte de otro NIT: la lectura lo marca y los cruces no corren.
    const otro = correrRevisionIva({ ...base, dian: { ...dian(), nitReporte: '800999999' } })
    expect(otro.cedulas!.find((x) => x.id === 'dian-ventas')!.estado).toBe('sin_insumos')
    expect(otro.cedulas!.find((x) => x.id === 'lectura-dian')!.tablas.find((t) => t.id === 'puntos')!.filas[0].estado).toBe('diferencia')
  })
  it('devuelve los libros a persistir y registra las limitaciones', () => {
    expect(r.cifrasLibros['iva-gen-19']).toEqual({ libros: 9_120_000 })
    expect(r.resumen.limitaciones.some((l) => l.regla.startsWith('I-20'))).toBe(true)
    expect(r.resumen.reglasEjecutadas).toEqual(expect.arrayContaining(['I-02', 'I-04', 'I-06', 'I-12', 'I-13', 'I-32']))
    expect(r.bitacora.at(-1)?.texto).toMatch(/Corrida terminada/)
  })
})

describe('bloque A: aritmética del formulario', () => {
  it('I-02: IVA generado que no es el 19 % de la base', () => {
    const r = correrRevisionIva({ ...base, cifras: cifras({ ...DECLARADO, 'iva-gen-19': 8_000_000 }) })
    const [h] = porRegla(r, 'I-02')
    expect(h.tipo).toBe('hallazgo')
    expect(h.codigo).toBe('H-01')
    expect(h.monto).toBe(1_120_000)
    expect(h.certeza).toBe('verificado')
    expect(h.cuentaCodigo).toBe('iva-gen-19')
    expect(h.contenido.tributario).toMatchObject({ casilla: '59', checklistItem: 'iva-generado' })
    expect(h.severidad).toBe('alta')
    // El punto del checklist no se propone como verificado si tiene hallazgos.
    expect(r.resumen.verificados).not.toContain('iva-generado')
  })
  it('I-02 tolera el redondeo a miles del formulario', () => {
    const r = correrRevisionIva({ ...base, cifras: cifras({ ...DECLARADO, 'iva-gen-19': 9_121_000 }) })
    expect(porRegla(r, 'I-02')).toEqual([])
  })
  it('I-04: descontable sin compras declaradas', () => {
    const r = correrRevisionIva({ ...base, cifras: cifras({ ...DECLARADO, 'iva-comp-19': 0, 'iva-comp-no-gravadas': 0 }) })
    const [h] = porRegla(r, 'I-04')
    expect(h.severidad).toBe('alta')
    expect(h.titulo).toMatch(/sin compras/)
  })
  it('I-01: cada advertencia de lectura es una ambigüedad', () => {
    const r = correrRevisionIva({ ...base, advertenciasLectura: ['"Total ingresos brutos": el formulario trae 1 pero sus componentes suman 2'] })
    const [a] = porRegla(r, 'I-01')
    expect(a.tipo).toBe('ambiguedad')
    expect(a.codigo).toBe('A-01')
    expect(a.contenido.opciones).toHaveLength(2)
  })
  it('I-06: devoluciones por encima del 5 % de los ingresos', () => {
    const r = correrRevisionIva({ ...base, cifras: cifras({ ...DECLARADO, 'iva-ing-devoluciones': 5_000_000 }) })
    expect(porRegla(r, 'I-06')[0]).toMatchObject({ tipo: 'hallazgo', severidad: 'baja', certeza: 'requiere_evidencia' })
  })
})

describe('bloque B: libros vs formulario', () => {
  it('I-13: descontable declarado mayor que libros escala la severidad', () => {
    const r = correrRevisionIva({ ...base, libros: libros({ ...LIBROS_IGUALES, 'iva-desc-servicios': 2_650_000 }) })
    const [h] = porRegla(r, 'I-13')
    expect(h.monto).toBe(50_000)
    expect(h.cuentaCodigo).toBe('iva-desc-servicios')
    // 1,85 % → media, más el escalador por descontable sin soporte → alta.
    expect(h.severidad).toBe('alta')
    expect(h.contenido.recomendacion).toMatch(/771-2/)
    expect(r.resumen.verificados).not.toContain('iva-descontable')
    expect(r.resumen.verificados).toContain('iva-generado')
  })
  it('I-12: libros mayor que declarado en generado es omisión', () => {
    const r = correrRevisionIva({ ...base, libros: libros({ ...LIBROS_IGUALES, 'iva-gen-19': 9_140_000 }) })
    const [h] = porRegla(r, 'I-12')
    expect(h.datos.find((d) => d.etiqueta === 'diferencia')?.valor).toMatch(/^−/)
    expect(h.bitacora.some((l) => /omision/.test(l.texto))).toBe(true)
  })
  it('I-10 sobre el total: ingresos sin tarifa en el nombre solo se comparan en bruto', () => {
    const r = correrRevisionIva({ ...base, libros: libros(LIBROS_IGUALES, { 'iva-ing-brutos': 47_000_000 }) })
    const [h] = porRegla(r, 'I-10')
    expect(h.cuentaCodigo).toBe('iva-ing-brutos')
    expect(h.monto).toBe(1_000_000)
  })
  it('la materialidad del encargo es solo referencia en la descripción', () => {
    const r = correrRevisionIva({ ...base, libros: libros({ ...LIBROS_IGUALES, 'iva-gen-19': 9_000_000 }), materialidadReferencia: { desempeno: 600_000, encargo: '2025' } })
    expect(porRegla(r, 'I-12')[0].contenido.descripcion).toMatch(/0\.20× la materialidad de desempeño del encargo 2025/)
  })
  it('I-16: ingresos en libros sin IVA generado es un juicio', () => {
    const r = correrRevisionIva({ ...base, cifras: cifras({}), libros: libros({ 'iva-desc-compras': 10 }, { 'iva-ing-brutos': 5_000_000 }) })
    const [j] = porRegla(r, 'I-16')
    expect(j.tipo).toBe('juicio')
    expect(j.contenido.opciones?.[0].label).toMatch(/excluidas/)
  })
  it('P-03: subcuentas sin clasificar son ambigüedades con opciones de mapeo', () => {
    const r = correrRevisionIva({ ...base, libros: libros(LIBROS_IGUALES, {}, [{ cuenta: '24089901', nombre: 'IVA REGIMEN', debitos: 0, creditos: 7_000, movimientos: 1, cierres: [] }]) })
    const [a] = porRegla(r, 'P-03')
    expect(a.tipo).toBe('ambiguedad')
    expect(a.contenido.destino).toBe('memoria')
    expect(a.contenido.opciones?.map((o) => o.clave)).toContain('ignorar')
  })
})

describe('bloque C: DIAN vs formulario', () => {
  it('sin diferencias no propone nada y corren I-20, I-21, I-22, I-24', () => {
    const r = correrRevisionIva({ ...base, dian: dian() })
    expect(r.resumen.reglasEjecutadas).toEqual(expect.arrayContaining(['I-20', 'I-21', 'I-22', 'I-24']))
    expect(r.resumen.hallazgos).toBe(0)
  })
  it('I-20: IVA facturado mayor que el declarado es omisión (el generado del formulario es bruto)', () => {
    const r = correrRevisionIva({ ...base, dian: dian({ ventas: suma(41, 50_000_000, 9_500_000), ivaGeneradoNeto: 9_500_000 - 190_000, ingresosNetos: 49_000_000 }) })
    const [h] = porRegla(r, 'I-20')
    expect(h.monto).toBe(380_000)
    expect(h.certeza).toBe('verificado')
    // 4 % → media, más el escalador de omisión → alta.
    expect(h.severidad).toBe('alta')
    expect(h.contenido.descripcion).toMatch(/casilla 79/)
    // I-21 también cambia (ingresos facturados 49 M vs 47 M declarados).
    expect(porRegla(r, 'I-21')[0].monto).toBe(2_000_000)
  })
  it('I-24 sobre el IVA: las notas crédito deben estar en la casilla 79', () => {
    const r = correrRevisionIva({ ...base, cifras: cifras({ ...DECLARADO, 'iva-desc-devoluciones': 0 }), dian: dian() })
    const h = porRegla(r, 'I-24').find((p) => p.cuentaCodigo === 'iva-desc-devoluciones')!
    expect(h.monto).toBe(190_000)
  })
  it('I-22: descontable por encima del IVA de las facturas recibidas en la ventana', () => {
    const r = correrRevisionIva({ ...base, dian: dian({ comprasVentana: suma(10, 20_000_000, 3_800_000) }) })
    const [h] = porRegla(r, 'I-22')
    expect(h.titulo).toMatch(/sin soporte/)
    expect(h.monto).toBe(5_700_000 - 3_800_000)
    expect(h.severidad).toBe('alta')
  })
  it('I-22 informativo: IVA recibido que no se tomó', () => {
    const r = correrRevisionIva({ ...base, dian: dian({ compras: suma(20, 40_000_000, 7_600_000), comprasVentana: suma(24, 44_000_000, 8_000_000) }) })
    const [h] = porRegla(r, 'I-22')
    expect(h.titulo).toMatch(/no tomado/)
    expect(h.severidad).toBe('baja')
  })
  it('I-24: notas crédito vs devoluciones declaradas', () => {
    const r = correrRevisionIva({ ...base, dian: dian({ notasCreditoVentas: suma(3, 1_500_000, 285_000), ivaGeneradoNeto: 9_120_000 - 285_000, ingresosNetos: 46_500_000 }) })
    expect(porRegla(r, 'I-24').find((p) => p.cuentaCodigo === 'iva-ing-devoluciones')?.monto).toBe(500_000)
  })
  it('I-25: facturas recibidas después del cierre es un juicio', () => {
    const r = correrRevisionIva({ ...base, dian: dian({ recibidasTarde: 2 }) })
    expect(porRegla(r, 'I-25')[0]).toMatchObject({ tipo: 'juicio', severidad: 'baja' })
  })
  it('P-06: reporte de otro NIT bloquea el bloque C', () => {
    const d = dian()
    const r = correrRevisionIva({ ...base, cifras: cifras({ ...DECLARADO, 'iva-gen-19': 1 }), dian: { ...d, nitReporte: '800000000' } })
    expect(porRegla(r, 'P-06')[0]).toMatchObject({ tipo: 'ambiguedad', severidad: 'alta' })
    expect(porRegla(r, 'I-20')).toEqual([])
    expect(r.resumen.limitaciones.some((l) => l.motivo.includes('otro NIT'))).toBe(true)
  })
  it('acepta el NIT de la empresa con dígito de verificación', () => {
    const r = correrRevisionIva({ ...base, dian: { ...dian(), nitReporte: '901878495', nitEmpresa: '901.878.495-1' } })
    expect(porRegla(r, 'P-06')).toEqual([])
  })
})

describe('bloque D: continuidad y juicio', () => {
  const anterior = (total: number) => ({ etiqueta: 'Bim. 1 (ene–feb) 2026', cifras: cifras({ 'iva-gen-19': 0, 'iva-desc-compras': -total }) })
  it('I-30: el saldo a favor arrastrado no coincide con la declaración anterior', () => {
    const r = correrRevisionIva({ ...base, cifras: cifras({ ...DECLARADO, 'iva-saldo-favor-ant': 300_000 }), anterior: anterior(-500_000) })
    const [h] = porRegla(r, 'I-30')
    expect(h).toMatchObject({ tipo: 'hallazgo', severidad: 'alta', monto: 200_000, certeza: 'verificado' })
  })
  it('I-31: saldo a favor anterior sin imputar es un juicio', () => {
    const r = correrRevisionIva({ ...base, anterior: anterior(-500_000) })
    expect(porRegla(r, 'I-30')).toEqual([])
    expect(porRegla(r, 'I-31')[0]).toMatchObject({ tipo: 'juicio', monto: 500_000 })
  })
  it('I-30 sin revisión anterior pide la declaración anterior como documento', () => {
    const r = correrRevisionIva({ ...base, cifras: cifras({ ...DECLARADO, 'iva-saldo-favor-ant': 300_000 }) })
    expect(porRegla(r, 'I-30')[0]).toMatchObject({ tipo: 'documento', codigo: 'D-01' })
  })
  it('I-32: excluidos con descontables y sin ajuste pide juicio de proporcionalidad', () => {
    const r = correrRevisionIva({ ...base, cifras: cifras({ ...DECLARADO, 'iva-ing-excluidos': 3_000_000 }) })
    const [j] = porRegla(r, 'I-32')
    expect(j).toMatchObject({ tipo: 'juicio', severidad: 'media' })
    expect(j.contenido.tributario?.checklistItem).toBe('proporcionalidad')
    expect(r.resumen.verificados).not.toContain('proporcionalidad')
  })
  it('I-35: sanciones liquidadas', () => {
    const r = correrRevisionIva({ ...base, cifras: cifras({ ...DECLARADO, 'iva-sanciones': 400_000 }) })
    expect(porRegla(r, 'I-35')[0].contenido.tributario?.checklistItem).toBe('presentacion-pago')
  })
})

describe('programa del agente: pasos, insumos y reglas omitidas', () => {
  it('todas las reglas I-xx del motor pertenecen a exactamente un paso del programa', () => {
    const todas = PROGRAMA_AGENTE_IVA.flatMap((p) => p.reglas)
    expect(new Set(todas).size).toBe(todas.length)
    const r = correrRevisionIva({ ...base, libros: libros(LIBROS_IGUALES), dian: dian(), anterior: { etiqueta: 'B1', cifras: cifras({ 'iva-gen-19': 10 }) } })
    for (const regla of r.resumen.reglasEjecutadas.filter((x) => /^I-\d/.test(x))) expect(todas).toContain(regla)
  })
  it('el programa sugerido activa todos los pasos y pide los cuatro insumos', () => {
    const programa = programaSugeridoIva()
    expect(programa.pasos.every((p) => p.activo && p.origen === 'agente')).toBe(true)
    expect(insumosDelPrograma(programa)).toEqual(['borrador', 'auxiliar', 'dian', 'anterior'])
    expect(reglasOmitidas(programa)).toEqual([])
    expect(reglasOmitidas(null)).toEqual([])
  })
  it('desactivar los pasos de la DIAN quita ese insumo y sus reglas', () => {
    const programa = programaSugeridoIva()
    for (const p of programa.pasos) if (p.id.startsWith('dian-')) p.activo = false
    expect(insumosDelPrograma(programa)).toEqual(['borrador', 'auxiliar', 'anterior'])
    expect(reglasOmitidas(programa)).toEqual(expect.arrayContaining(['I-20', 'I-22']))
  })
  it('una regla omitida no propone ni da por verificado su punto del checklist', () => {
    const entrada: EntradaCorridaIva = { ...base, cifras: cifras({ ...DECLARADO, 'iva-gen-19': 8_000_000 }) }
    const con = correrRevisionIva(entrada)
    expect(porRegla(con, 'I-02')).toHaveLength(1)
    const sin = correrRevisionIva({ ...entrada, omitirReglas: ['I-02', 'I-03'] })
    expect(porRegla(sin, 'I-02')).toEqual([])
    expect(sin.resumen.verificados).not.toContain('iva-generado')
    expect(sin.resumen.limitaciones.some((l) => l.motivo.includes('desactivados'))).toBe(true)
  })
  it('textoProcedimientos imprime solo los pasos activos, numerados', () => {
    const texto = textoProcedimientos({ pasos: [
      { id: 'a', texto: 'Primero', origen: 'agente', activo: true },
      { id: 'b', texto: 'Apagado', origen: 'agente', activo: false },
      { id: 'c', texto: 'Propio del auditor.', origen: 'propio', activo: true },
    ] })
    expect(texto).toBe('1. Primero.\n2. Propio del auditor.')
  })
})

describe('numeración y huellas', () => {
  it('continúa la numeración y no repite lo ya decidido', () => {
    const entrada: EntradaCorridaIva = { ...base, cifras: cifras({ ...DECLARADO, 'iva-gen-19': 8_000_000, 'iva-sanciones': 100 }) }
    const primera = correrRevisionIva(entrada)
    expect(primera.propuestas.map((p) => p.codigo)).toEqual(expect.arrayContaining(['H-01', 'J-01']))
    const huella = `hallazgo|I-02|iva-gen-19`
    const segunda = correrRevisionIva({ ...entrada, numeracion: { H: 1, J: 1 }, huellasDecididas: [huella] })
    expect(porRegla(segunda, 'I-02')).toEqual([])
    expect(segunda.propuestas.find((p) => p.tipo === 'juicio')?.codigo).toBe('J-02')
    expect(segunda.bitacora.some((l) => /ya decidido/.test(l.texto))).toBe(true)
  })

  it('un juicio ya decidido no vuelve a proponerse y su fila queda anotada en la cédula', () => {
    // Con operaciones excluidas y descontables sin ajuste, I-32 propone revisar la proporcionalidad.
    const entrada: EntradaCorridaIva = { ...base, cifras: cifras({ ...DECLARADO, 'iva-ing-excluidos': 2_000_000 }) }
    const primera = correrRevisionIva(entrada)
    const prop = primera.propuestas.find((p) => p.reglas.includes('I-32'))!
    expect(prop.cuentaCodigo).toBe('iva-descontable')
    expect(prop.contenido.tributario?.cedula).toBe('proporcionalidad')
    const segunda = correrRevisionIva({ ...entrada, huellasDecididas: ['juicio|I-32|iva-descontable'] })
    expect(segunda.propuestas.some((p) => p.reglas.includes('I-32'))).toBe(false)
    const filaAjuste = segunda.cedulas!.find((c) => c.id === 'proporcionalidad')!.tablas[0].filas.at(-1)!
    expect(filaAjuste).toMatchObject({ estado: 'por_confirmar', propuesta: null })
    expect(filaAjuste.nota).toMatch(/Ya decidido/)
  })
})

describe('ambigüedades de clasificación', () => {
  it('cada subcuenta sin clasificar tiene su propia huella y lleva la cuenta en el contenido', () => {
    const libros = {
      cifras: {}, totales: {}, cuentas: [], bitacora: [],
      sinClasificar: [
        { cuenta: '24089001', nombre: 'IVA VARIOS', debitos: 100, creditos: 300, movimientos: 2, cierres: [] },
        { cuenta: '24089002', nombre: 'IVA OTROS', debitos: 50, creditos: 0, movimientos: 1, cierres: [] },
      ],
    }
    const r = correrRevisionIva({ ...base, libros })
    const amb = r.propuestas.filter((p) => p.tipo === 'ambiguedad')
    expect(amb.map((p) => p.cuentaCodigo)).toEqual(['24089001', '24089002'])
    expect(amb.map((p) => p.contenido.tributario?.cuentaAuxiliar)).toEqual(['24089001', '24089002'])
    // Decidida una, la otra sigue saliendo.
    const r2 = correrRevisionIva({ ...base, libros, huellasDecididas: ['ambiguedad|P-03|24089001'] })
    expect(r2.propuestas.filter((p) => p.tipo === 'ambiguedad').map((p) => p.cuentaCodigo)).toEqual(['24089002'])
  })
})

describe('huellaDeclarado', () => {
  it('ignora libros y ordena por renglón para que la huella sea estable', () => {
    const a = huellaDeclarado({ 'iva-gen-19': { declarado: 100, libros: 90 }, 'iva-desc-compras': { declarado: 20, libros: null } })
    const b = huellaDeclarado({ 'iva-desc-compras': { declarado: 20, libros: 5 }, 'iva-gen-19': { declarado: 100, libros: null } })
    expect(a).toBe(b)
    expect(a).toBe('iva-desc-compras=20|iva-gen-19=100')
  })
  it('cambia cuando cambia una cifra declarada', () => {
    expect(huellaDeclarado({ 'iva-gen-19': { declarado: 100, libros: null } })).not.toBe(huellaDeclarado({ 'iva-gen-19': { declarado: 101, libros: null } }))
  })
})
