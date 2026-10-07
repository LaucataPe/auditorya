/**
 * Motor de retención en la fuente (R-xx) sobre el auxiliar real de World Office
 * (anonimizado) y escenarios sintéticos del 350.
 */
import { describe, expect, it } from 'vitest'
import { parseAuxiliarMovimientos, resumirAuxiliarPeriodo } from './parse-auxiliar'
import { beneficiarioDeTercero, clasificarSubcuentaRetefuente, digitoVerificacionNit, mapearLibrosRetefuente, normalizarNit } from './agente-retefuente-libros'
import { correrRevisionRetefuente, PROGRAMA_AGENTE_RETEFUENTE, programaSugeridoRetefuente, reglasOmitidasRetefuente, RENGLONES_RETEFUENTE, type EntradaCorridaRetefuente } from './agente-retefuente'
import { cuantiaMinima, tarifaAdmisible } from './tarifas-retefuente'
import { cedulasSinConcluir, estadoConclusionCedula } from './cedulas-tributarias'
import { parseBalancePeriodo } from './parse-balance-periodo'
import { conceptoDeCuentaBase } from './agente-retefuente-terceros'
import { insumosDelProgramaDe, programaSugerido, reglasOmitidasDe } from './agente-tributario'
import { IMPUESTOS_CATALOGO, type CifrasRevision } from './tributario'
import { AUXILIAR_WORLDOFFICE_RETEFUENTE } from './fixtures/auxiliar-worldoffice-retefuente'

const cifras = (dec: Record<string, number>, lib: Record<string, number> = {}): CifrasRevision => {
  const out: CifrasRevision = {}
  for (const [k, v] of Object.entries(dec)) out[k] = { declarado: v, libros: lib[k] ?? null }
  for (const [k, v] of Object.entries(lib)) out[k] = { declarado: out[k]?.declarado ?? null, libros: v }
  return out
}
const periodo = { desde: '2026-08-01', hasta: '2026-08-31', etiqueta: 'Agosto 2026', periodicidad: 'mensual' as const, anio: 2025 }
const porRegla = (r: ReturnType<typeof correrRevisionRetefuente>, regla: string) => r.propuestas.filter((p) => p.reglas.includes(regla))

describe('clasificación de subcuentas y terceros', () => {
  it('reconoce los conceptos por nombre y por PUC', () => {
    expect(clasificarSubcuentaRetefuente('23651502', 'HONORARIOS DECLARANTES 11%')).toBe('honorarios')
    expect(clasificarSubcuentaRetefuente('23652503', 'SERVICIOS TRANSPORTE DE CARGA 1%')).toBe('servicios')
    expect(clasificarSubcuentaRetefuente('23654008', 'RTE FTE 2,5% COMPRA DE ENERGIA')).toBe('compras')
    expect(clasificarSubcuentaRetefuente('236405', 'SALARIOS Y PAGOS LABORALES')).toBe('trabajo')
    expect(clasificarSubcuentaRetefuente('23657501', 'AUTORRETENCION DE RENTA')).toBe('ar:exonerados')
    expect(clasificarSubcuentaRetefuente('23671001', 'RETEIVA 15% A RST')).toBe('reteiva')
    expect(clasificarSubcuentaRetefuente('23679005', 'RETENCION IVA POR PAGAR')).toBe('saldo')
    expect(clasificarSubcuentaRetefuente('236540', 'XYZ')).toBe('compras') // por PUC
    expect(clasificarSubcuentaRetefuente('23659901', 'VARIOS')).toBeNull()
  })
  it('separa jurídicas y naturales por NIT o por el nombre', () => {
    expect(beneficiarioDeTercero('900582595', null)).toBe('pj')
    expect(beneficiarioDeTercero('79456123', null)).toBe('pn')
    expect(beneficiarioDeTercero(null, 'CONTABILIDADYA SAS')).toBe('pj')
    expect(beneficiarioDeTercero(null, 'NEU ENERGY S.A.S. E.S.P.')).toBe('pj')
    expect(beneficiarioDeTercero(null, 'SERPA SERPA TOMAS DEL CRISTO')).toBe('pn')
    expect(beneficiarioDeTercero(null, 'CONSUMIDOR FINAL')).toBeNull()
  })
  it('tarifas y cuantías mínimas de referencia', () => {
    expect(tarifaAdmisible('compras', 2.5)).toBe(true)
    expect(tarifaAdmisible('compras', 4)).toBe(false)
    expect(tarifaAdmisible('servicios', 1)).toBe(true)
    expect(tarifaAdmisible('trabajo', 19)).toBeNull()
    expect(cuantiaMinima('compras', 2025)).toBe(27 * 49_799)
    expect(cuantiaMinima('compras', 2026)).toBeNull() // sin UVT configurada
    expect(cuantiaMinima('honorarios', 2025)).toBeNull()
  })
})

describe('mapeo del auxiliar World Office al 350', () => {
  const aux = parseAuxiliarMovimientos(AUXILIAR_WORLDOFFICE_RETEFUENTE)!
  const resumen = resumirAuxiliarPeriodo(aux, periodo)
  const mapeo = mapearLibrosRetefuente(resumen, aux.movimientos, {}, { renglonesValidos: RENGLONES_RETEFUENTE })

  it('lleva cada subcuenta a su concepto y separa por beneficiario con base', () => {
    expect(mapeo.sinClasificar).toHaveLength(0)
    expect(mapeo.conceptos.trabajo).toMatchObject({ retencion: 1283000, beneficiarioConocido: true })
    expect(mapeo.cifras['rf-pn-trabajo'].libros).toBe(1283000)
    expect(mapeo.cifras['rf-pn-trabajo-base'].libros).toBe(15821470)
    // Compras: el tercero es persona natural (dos apellidos) → pn.
    expect(mapeo.cifras['rf-pn-compras'].libros).toBe(538800)
    expect(mapeo.cifras['rf-pn-compras-base'].libros).toBe(21552000)
    expect(mapeo.cifras['rf-pj-compras']).toBeUndefined()
    // Servicios no declarante 6 %.
    expect(mapeo.cifras['rf-pn-servicios'].libros).toBe(23730)
    // Autorretención especial (0,55 %) → ar:exonerados a jurídicas (la propia empresa).
    expect(mapeo.conceptos['ar:exonerados'].retencion).toBeGreaterThan(0)
    expect(mapeo.asientos.length).toBeGreaterThan(5)
  })
  it('verifica retención = base × tarifa asiento por asiento (sin anomalías en el archivo real)', () => {
    expect(mapeo.anomalias.filter((a) => a.tipo === 'calculo')).toHaveLength(0)
    const compras = mapeo.asientos.filter((a) => a.concepto === 'compras')
    expect(compras.every((a) => a.tarifaRegistrada === 2.5 && Math.abs(a.tarifa - 2.5) < 0.01)).toBe(true)
  })
  it('rentas de trabajo siempre a naturales y autorretención siempre a jurídicas, sin importar el tercero', () => {
    const movs = aux.movimientos.map((m) => (m.cuenta === '236405' ? { ...m, terceroNombre: 'NOMINA SAS' } : m))
    const m2 = mapearLibrosRetefuente(resumen, movs, {}, { renglonesValidos: RENGLONES_RETEFUENTE })
    expect(m2.cifras['rf-pj-trabajo']).toBeUndefined()
    expect(m2.cifras['rf-pn-trabajo'].libros).toBe(1283000)
    expect(m2.cifras['rf-ar-pn-exonerados']).toBeUndefined()
    expect(m2.cifras['rf-ar-pj-exonerados']).toBeDefined()
    // Un concepto sin casilla para el beneficiario queda solo en el total del concepto y se avisa.
    const m3 = mapearLibrosRetefuente(resumen, aux.movimientos, { mapeo: { '23644001': 'ar:ventas' } }, { renglonesValidos: RENGLONES_RETEFUENTE })
    expect(m3.cifras['rf-ar-pj-ventas'].libros).toBe(538800)
    expect(m3.conceptos['ar:ventas'].retencion).toBe(538800)
  })
  it('la memoria de la empresa manda sobre el nombre', () => {
    const m3 = mapearLibrosRetefuente(resumen, aux.movimientos, { mapeo: { '23644001': 'servicios' } }, { renglonesValidos: RENGLONES_RETEFUENTE })
    expect(m3.cuentas.find((c) => c.cuenta === '23644001')).toMatchObject({ destino: 'servicios', regla: 'memoria' })
  })
})

describe('motor R-xx', () => {
  const aux = parseAuxiliarMovimientos(AUXILIAR_WORLDOFFICE_RETEFUENTE)!
  const resumen = resumirAuxiliarPeriodo(aux, periodo)
  const libros = mapearLibrosRetefuente(resumen, aux.movimientos, {}, { renglonesValidos: RENGLONES_RETEFUENTE })
  const arLibros = Math.round(libros.conceptos['ar:exonerados'].retencion)
  // Formulario coherente con libros (redondeado a miles) → sin hallazgos de libros.
  const declaradoOk = {
    'rf-pn-trabajo-base': 15_821_000, 'rf-pn-trabajo': 1_283_000,
    'rf-pn-compras-base': 21_552_000, 'rf-pn-compras': 539_000,
    'rf-pn-servicios-base': 396_000, 'rf-pn-servicios': 24_000,
    'rf-pj-honorarios-base': 2_764_000, 'rf-pj-honorarios': 304_000,
    'rf-ar-pj-exonerados-base': Math.round((libros.conceptos['ar:exonerados'].base ?? 0) / 1000) * 1000, 'rf-ar-pj-exonerados': Math.round(arLibros / 1000) * 1000,
    'rf-exceso-renta': 0, 'rf-reteiva': 0, 'rf-reteiva-no-residentes': 0, 'rf-reteiva-exceso': 0, 'rf-timbre': 0, 'rf-sanciones': 0,
  }
  const base: EntradaCorridaRetefuente = { periodo, cifras: cifras(declaradoOk), libros }

  it('con formulario y libros coherentes no propone hallazgos de conciliación y da por verificados los puntos', () => {
    const r = correrRevisionRetefuente(base)
    expect(porRegla(r, 'R-10')).toEqual([])
    expect(porRegla(r, 'R-11')).toEqual([])
    expect(porRegla(r, 'R-14')).toEqual([])
    expect(r.resumen.verificados).toContain('bases-contabilidad')
    expect(r.resumen.reglasEjecutadas).toEqual(expect.arrayContaining(['R-02', 'R-10', 'R-11', 'R-14', 'R-15', 'R-16']))
    expect(r.cifrasLibros['rf-pn-compras'].libros).toBe(538800)
  })
  it('R-10/R-11: retención declarada de más contra libros', () => {
    const r = correrRevisionRetefuente({ ...base, cifras: cifras({ ...declaradoOk, 'rf-pn-compras': 2_539_000 }) })
    const h = porRegla(r, 'R-11').find((p) => p.cuentaCodigo === 'rf-pn-compras')!
    expect(h.tipo).toBe('hallazgo')
    expect(h.monto).toBe(2_000_200)
    expect(porRegla(r, 'R-10')).toHaveLength(1)
    expect(h.contenido.tributario?.casilla).toBe('102')
  })
  it('R-02: tarifa implícita fuera de las admisibles es hallazgo; entre ellas es juicio', () => {
    const r = correrRevisionRetefuente({ periodo, cifras: cifras({ 'rf-pj-honorarios-base': 10_000_000, 'rf-pj-honorarios': 400_000, 'rf-pj-compras-base': 10_000_000, 'rf-pj-compras': 300_000 }) })
    const hon = porRegla(r, 'R-02').find((p) => p.cuentaCodigo === 'rf-pj-honorarios')!
    expect(hon.tipo).toBe('hallazgo') // 4 % no es honorarios
    const com = porRegla(r, 'R-02').find((p) => p.cuentaCodigo === 'rf-pj-compras')!
    expect(com.tipo).toBe('juicio') // 3 % entre 2,5 y 3,5: mezcla
  })
  it('R-03: retención sin base es hallazgo; base sin retención es juicio', () => {
    const r = correrRevisionRetefuente({ periodo, cifras: cifras({ 'rf-pj-servicios': 400_000, 'rf-pn-compras-base': 5_000_000 }) })
    expect(porRegla(r, 'R-03').map((p) => [p.cuentaCodigo, p.tipo])).toEqual([['rf-pj-servicios', 'hallazgo'], ['rf-pn-compras', 'juicio']])
  })
  it('R-11: concepto contabilizado y no declarado es hallazgo (omisión)', () => {
    const sinHonorarios = { ...declaradoOk }
    delete (sinHonorarios as Record<string, number>)['rf-pj-honorarios']
    delete (sinHonorarios as Record<string, number>)['rf-pj-honorarios-base']
    const r = correrRevisionRetefuente({ ...base, cifras: cifras(sinHonorarios) })
    const h = porRegla(r, 'R-11').find((p) => /no declarado/.test(p.titulo))!
    expect(h).toMatchObject({ tipo: 'hallazgo', monto: 304040, cuentaCodigo: 'rf-pj-honorarios' })
  })
  it('R-11: concepto declarado sin subcuenta en libros', () => {
    const r = correrRevisionRetefuente({ ...base, cifras: cifras({ ...declaradoOk, 'rf-pj-arrendamientos-base': 10_000_000, 'rf-pj-arrendamientos': 350_000 }) })
    expect(porRegla(r, 'R-11').some((p) => p.cuentaCodigo === 'rf-pj-arrendamientos' && /sin contrapartida/.test(p.titulo))).toBe(true)
  })
  it('R-12: rete-IVA declarada vs 2367', () => {
    const conReteIva = mapearLibrosRetefuente({ cuentas: [...resumen.cuentas, { cuenta: '23671001', nombre: 'RETEIVA 15% A RST', debitos: 0, creditos: 25_346, movimientos: 0, cierres: [] }] }, aux.movimientos, {}, { renglonesValidos: RENGLONES_RETEFUENTE })
    const r = correrRevisionRetefuente({ ...base, libros: conReteIva, cifras: cifras({ ...declaradoOk, 'rf-reteiva': 125_000 }) })
    expect(porRegla(r, 'R-12')).toHaveLength(1)
    expect(porRegla(r, 'R-12')[0].monto).toBe(99_654)
  })
  it('R-15: asientos con retención ≠ base × tarifa registrada', () => {
    const movs = aux.movimientos.map((m, i) => (m.cuenta === '23644001' && i % 2 === 0 ? { ...m, credito: m.credito + 5_000 } : m))
    const l2 = mapearLibrosRetefuente(resumen, movs, {}, { renglonesValidos: RENGLONES_RETEFUENTE })
    expect(l2.anomalias.filter((a) => a.tipo === 'calculo').length).toBeGreaterThan(0)
    const r = correrRevisionRetefuente({ ...base, libros: l2 })
    expect(porRegla(r, 'R-15').some((p) => /no es base × tarifa/.test(p.titulo))).toBe(true)
  })
  it('R-16: cuantía mínima solo con UVT del año; sin UVT queda como limitación', () => {
    const r26 = correrRevisionRetefuente({ ...base, periodo: { ...periodo, anio: 2026 } })
    expect(r26.resumen.limitaciones.some((l) => l.regla === 'R-16')).toBe(true)
    // 2025: las compras del archivo (bases de 4 a 5 millones) están sobre 27 UVT → nada; salarios no tienen mínima.
    const r25 = correrRevisionRetefuente(base)
    expect(porRegla(r25, 'R-16')).toEqual([])
  })
  it('R-30: variación mes a mes > 50 % es juicio', () => {
    const r = correrRevisionRetefuente({ ...base, cifras: cifras({ ...declaradoOk }), anterior: { etiqueta: 'Julio 2026', cifras: cifras({ 'rf-pn-compras': 5_000_000, 'rf-pn-compras-base': 200_000_000 }) } })
    expect(porRegla(r, 'R-30')).toHaveLength(1)
    expect(porRegla(r, 'R-30')[0].tipo).toBe('juicio')
  })
  it('R-31/R-32: presentación tardía es hallazgo; total a pagar pide el soporte de pago', () => {
    const r = correrRevisionRetefuente({ ...base, fechaVencimiento: '2026-09-10', fechaPresentacion: '2026-09-15' })
    expect(porRegla(r, 'R-31')).toHaveLength(1)
    expect(porRegla(r, 'R-31')[0].severidad).toBe('alta')
    expect(porRegla(r, 'R-32').some((p) => /pago total/.test(p.titulo))).toBe(true)
  })
  it('programa: pasos desactivados no producen propuestas y el punto no se da por verificado', () => {
    const programa = programaSugeridoRetefuente()
    programa.pasos.find((p) => p.id === 'libros-renta')!.activo = false
    const r = correrRevisionRetefuente({ ...base, cifras: cifras({ ...declaradoOk, 'rf-pn-compras': 2_539_000 }), omitirReglas: reglasOmitidasRetefuente(programa) })
    expect(porRegla(r, 'R-11')).toEqual([])
    expect(r.resumen.verificados).not.toContain('bases-contabilidad')
    expect(PROGRAMA_AGENTE_RETEFUENTE.every((p) => !p.checklistItem || IMPUESTOS_CATALOGO.retefuente.checklist.some((i) => i.id === p.checklistItem))).toBe(true)
  })
  it('cédulas: cada procedimiento muestra todo lo comparado, no solo las excepciones', () => {
    const r = correrRevisionRetefuente({ ...base, fuentes: [{ nombre: 'Auxiliar 2365', archivo: 'aux.xlsx', registros: aux.movimientos.length, cuentas: resumen.cuentas.length }] })
    const c = Object.fromEntries(r.cedulas!.map((x) => [x.id, x]))
    expect(r.cedulas!.map((x) => x.id)).toEqual(['formulario', 'lectura-libros', 'libros-renta', 'libros-reteiva', 'autorretencion', 'tarifas-asientos', 'terceros-gasto', 'periodo-anterior', 'oportunidad'])
    // Formulario: una fila por pareja base/retención declarada, conforme cuando la tarifa es admisible.
    const tarifas = c.formulario.tablas.find((t) => t.id === 'tarifas')!
    expect(tarifas.filas.some((f) => f.estado === 'conforme' && f.valores.partida === 'Compras a personas naturales')).toBe(true)
    // Lectura: todas las subcuentas clasificadas con su motivo.
    const clasif = c['lectura-libros'].tablas.find((t) => t.id === 'clasificacion')!
    expect(clasif.filas.length).toBe(libros.cuentas.length)
    expect(clasif.filas.every((f) => typeof f.valores.como === 'string' && f.valores.como.length > 0)).toBe(true)
    // Cruce: lo que cuadró también queda escrito, con su tolerancia.
    const conceptos = c['libros-renta'].tablas.find((t) => t.id === 'conceptos')!
    expect(conceptos.filas.length).toBeGreaterThan(2)
    expect(conceptos.filas.every((f) => f.estado === 'conforme' && typeof f.valores.tolerancia === 'number')).toBe(true)
    expect(c['libros-renta'].resultado.diferencias).toBe(0)
    expect(c['libros-renta'].conclusionSugerida).toMatch(/No se identificaron diferencias/)
    // Detalle: la población recalculada suma todos los asientos con base.
    const pob = c['tarifas-asientos'].tablas.find((t) => t.id === 'poblacion')!
    expect(pob.filas.reduce((s, f) => s + (f.valores.asientos as number), 0)).toBe(libros.asientos.length)
    expect(c['tarifas-asientos'].tablas.find((t) => t.id === 'mayores')!.filas.length).toBeLessThanOrEqual(25)
    // Sin mes anterior ni rete-IVA: las cédulas existen pero dicen por qué no se ejecutaron.
    expect(c['periodo-anterior']).toMatchObject({ estado: 'sin_insumos' })
    expect(c['libros-reteiva'].estado).toBe('sin_insumos')
    // Ya no se propone "marcar como verificado": el punto lo cierra la conclusión del auditor.
    expect(porRegla(r, 'R-90')).toEqual([])
  })
  it('cédulas: la diferencia queda en la fila con el código de su propuesta, y la huella cambia con el contenido', () => {
    const ok = correrRevisionRetefuente(base)
    const r = correrRevisionRetefuente({ ...base, cifras: cifras({ ...declaradoOk, 'rf-pn-compras': 2_539_000 }) })
    const renta = r.cedulas!.find((x) => x.id === 'libros-renta')!
    const f = renta.tablas.find((t) => t.id === 'conceptos')!.filas.find((x) => x.estado === 'diferencia')!
    const h = porRegla(r, 'R-11').find((p) => p.cuentaCodigo === 'rf-pn-compras')!
    expect(f.propuesta).toBe(h.codigo)
    expect(h.contenido.tributario?.cedula).toBe('libros-renta')
    expect(renta.propuestas).toContain(h.codigo)
    expect(renta.huella).not.toBe(ok.cedulas!.find((x) => x.id === 'libros-renta')!.huella)
    expect(correrRevisionRetefuente(base).cedulas!.find((x) => x.id === 'libros-renta')!.huella).toBe(ok.cedulas!.find((x) => x.id === 'libros-renta')!.huella)
  })
  it('cédulas: un paso desactivado queda como omitido y sin tablas; la conclusión exige huella vigente', () => {
    const programa = programaSugeridoRetefuente()
    programa.pasos.find((p) => p.id === 'libros-renta')!.activo = false
    const r = correrRevisionRetefuente({ ...base, omitirReglas: reglasOmitidasRetefuente(programa) })
    const renta = r.cedulas!.find((x) => x.id === 'libros-renta')!
    expect(renta).toMatchObject({ estado: 'omitida', tablas: [] })
    const form = r.cedulas!.find((x) => x.id === 'formulario')!
    const concl = { texto: 'Conforme.', resultado: 'satisfactorio' as const, corridaId: 'c', porId: 'u', porNombre: 'Ana', at: '2026-09-29' }
    expect(cedulasSinConcluir(r.cedulas, {}).map((x) => x.id)).not.toContain('libros-renta')
    expect(estadoConclusionCedula(form, { formulario: { ...concl, huella: form.huella } })).toBe('vigente')
    expect(estadoConclusionCedula(form, { formulario: { ...concl, huella: 'otra' } })).toBe('por_reconfirmar')
    expect(cedulasSinConcluir(r.cedulas, { formulario: { ...concl, huella: form.huella } }).map((x) => x.id)).not.toContain('formulario')
  })
  it('R-17: con un balance por terceros compara lo causado a cada tercero con lo que se le retuvo', () => {
    // Balance de prueba por terceros (formato World Office): honorarios, servicios, compras, nómina y la 2365.
    const H = ['CODIGO', 'NOMBRE CUENTA', 'TERCERO', 'SALDO INICIAL', 'DEBITOS', 'CREDITOS', 'SALDO FINAL']
    const cuenta = (c: string, n: string, d: number, h: number) => [c, n, '', '0', String(d), String(h), String(d - h)]
    const ter = (c: string, n: string, nit: string, d: number, h: number) => [c, n, `NIT  ${nit}`, '0', String(d), String(h), String(d - h)]
    const balance = parseBalancePeriodo([
      ['EMPRESA EJEMPLO S.A.S'], ['Balance de Prueba entre el 01/08/2025 y el 31/08/2025'], H,
      cuenta('23651501', 'RETEFUENTE HONORARIOS 11%', 0, 1_100_000),
      ter('23651501', 'ASESORES UNO SAS', '900000101', 0, 1_100_000),
      cuenta('23652501', 'RETEFUENTE SERVICIOS 4%', 0, 200_000),
      ter('23652501', 'ASEO DOS SAS', '900000102', 0, 150_000),
      ter('23652501', 'TRANSPORTES CINCO SAS', '900000105', 0, 50_000),
      cuenta('23654001', 'RETEFUENTE COMPRAS 2.5%', 0, 300_000),
      ter('23654001', 'PROVEEDOR TRES SAS', '900000103', 0, 100_000),
      ter('23654001', 'FERRETERIA SEIS SAS', '900000106', 0, 200_000),
      cuenta('51050601', 'SUELDOS', 9_000_000, 0),
      ter('51050601', 'PEREZ GOMEZ ANA', '52000111', 9_000_000, 0),
      cuenta('51100501', 'HONORARIOS ASESORIA JURIDICA', 10_000_000, 0),
      ter('51100501', 'ASESORES UNO SAS', '900000101', 10_000_000, 0),
      cuenta('51352501', 'SERVICIO DE ASEO', 10_000_000, 0),
      ter('51352501', 'ASEO DOS SAS', '900000102', 10_000_000, 0),
      cuenta('51355001', 'TRANSPORTE FLETES Y ACARREOS', 5_000_000, 0),
      ter('51355001', 'TRANSPORTES CINCO SAS', '900000105', 5_000_000, 0),
      cuenta('62050101', 'COMPRA DE MERCANCIAS', 28_000_000, 0),
      ter('62050101', 'PROVEEDOR TRES SAS', '900000103', 4_000_000, 0),
      ter('62050101', 'MAYORISTA CUATRO SAS', '900000104', 24_000_000, 0),
    ])!
    expect(balance.terceros).toHaveLength(11)
    const l = mapearLibrosRetefuente({ cuentas: balance.cuentas }, [], {}, { renglonesValidos: RENGLONES_RETEFUENTE, saldosTercero: balance.terceros, anio: 2025 })
    const pt = l.terceros!
    const de = (nit: string) => pt.filas.find((f) => f.tercero === nit)
    expect(de('900000101')).toMatchObject({ base: 10_000_000, retencion: 1_100_000, alerta: null }) // 11 % honorarios
    expect(de('900000102')).toMatchObject({ retencion: 150_000, baseRetenida: 3_750_000, diferencia: 6_250_000, alerta: 'retencion_baja' }) // al 4 % solo explica 3,75 de los 10 millones
    expect(de('900000105')).toMatchObject({ tarifaImplicita: 1, alerta: 'retencion_baja' }) // fletes al 1 % en una subcuenta del 4 %: revisable
    expect(de('900000103')).toMatchObject({ base: 4_000_000, retencion: 100_000, alerta: null }) // 2,5 %
    expect(de('900000104')).toMatchObject({ base: 24_000_000, retencion: 0, alerta: 'sin_retencion' })
    expect(de('900000106')).toMatchObject({ base: 0, retencion: 200_000, alerta: 'retencion_sin_base' })
    expect(de('52000111')).toBeUndefined() // nómina: no es base por tarifa
    expect(pt.excluidas.map((e) => e.cuenta)).toEqual(['51050601'])
    expect(conceptoDeCuentaBase('51352501', 'SERVICIO DE ASEO')).toEqual({ concepto: 'servicios' })
    // Casos del balance real de Siesa: costos en la 6170, compras en diferidos, y depreciación con nombre de activo.
    expect(conceptoDeCuentaBase('61709592', 'ALQUILER DE EQUIPOS')).toEqual({ concepto: 'arrendamientos' })
    expect(conceptoDeCuentaBase('17100103', 'DOTACION Y SUMINISTRO A TRABAJADORES')).toEqual({ concepto: 'compras' })
    expect(conceptoDeCuentaBase('52051801', 'COMISIONES')).toHaveProperty('excluir')
    expect(conceptoDeCuentaBase('15921001', 'MAQUINARIA Y EQUIPO')).toHaveProperty('excluir')
    expect(conceptoDeCuentaBase('51601001', 'MAQUINARIA Y EQUIPO')).toHaveProperty('excluir')
    expect(conceptoDeCuentaBase('23350101', 'CUENTAS POR PAGAR')).toBeNull()

    const r = correrRevisionRetefuente({ periodo, cifras: cifras({ 'rf-pj-honorarios-base': 10_000_000, 'rf-pj-honorarios': 1_100_000 }), libros: l })
    const ced = r.cedulas!.find((c) => c.id === 'terceros-gasto')!
    expect(ced.estado).toBe('ejecutada')
    expect(ced.tablas.find((t) => t.id === 'terceros')!.filas.filter((f) => f.estado === 'por_confirmar').length).toBe(pt.alertas.sin_retencion + pt.alertas.retencion_baja + pt.alertas.retencion_sin_base)
    expect(porRegla(r, 'R-17').every((p) => p.tipo === 'juicio' && p.contenido.tributario?.cedula === 'terceros-gasto')).toBe(true)
    expect(porRegla(r, 'R-17').map((p) => p.cuentaCodigo).sort()).toEqual(['terceros:retencion_sin_base', 'terceros:sin_retencion'].concat(pt.alertas.retencion_baja ? ['terceros:retencion_baja'] : []).sort())
    // La prueba de detalle no corre con un balance, y lo dice remitiendo a esta.
    expect(r.cedulas!.find((c) => c.id === 'tarifas-asientos')).toMatchObject({ estado: 'sin_insumos' })
  })
  it('balance por terceros: separa la 2365 en jurídicas y naturales y cruza casilla por casilla', () => {
    const H = ['CODIGO', 'NOMBRE CUENTA', 'TERCERO', 'SALDO INICIAL', 'DEBITOS', 'CREDITOS', 'SALDO FINAL']
    const cuenta = (c: string, n: string, d: number, h: number) => [c, n, '', '0', String(d), String(h), String(d - h)]
    const ter = (c: string, n: string, nit: string, d: number, h: number) => [c, n, `NIT  ${nit}`, '0', String(d), String(h), String(d - h)]
    const b = parseBalancePeriodo([
      ['Balance de Prueba entre el 01/08/2025 y el 31/08/2025'], H,
      cuenta('23651501', 'RETEFUENTE HONORARIOS', 0, 1_300_000),
      ter('23651501', 'ASESORES UNO SAS', '900000101', 0, 1_100_000),
      ter('23651501', 'GOMEZ RUIZ LUIS', '79555111', 0, 200_000),
      cuenta('23650501', 'RETEFUENTE SALARIOS', 0, 500_000),
      ter('23650501', 'CONSTRUCTORA X SAS', '900000999', 0, 500_000), // mal tercero en nómina: igual va a naturales
      cuenta('23652501', 'RETEFUENTE SERVICIOS 4%', 900_000, 400_000),
      ter('23652501', 'DIRECCION DE IMPUESTOS Y ADUANAS NACIONALES', '800197268', 900_000, 0), // pago de la declaración anterior
      ter('23652501', 'ASEO DOS SAS', '900000102', 0, 400_000),
    ])!
    const l = mapearLibrosRetefuente({ cuentas: b.cuentas }, [], {}, { renglonesValidos: RENGLONES_RETEFUENTE, saldosTercero: b.terceros, anio: 2025 })
    expect(l.cifras['rf-pj-honorarios']).toEqual({ libros: 1_100_000 })
    expect(l.cifras['rf-pn-honorarios']).toEqual({ libros: 200_000 })
    expect(l.cifras['rf-pn-trabajo']).toEqual({ libros: 500_000 })
    expect(l.conceptos.honorarios.beneficiarioConocido).toBe(true)
    // El pago a la DIAN no resta de lo retenido en el período.
    expect(l.conceptos.servicios.retencion).toBe(400_000)
    expect(l.cifras['rf-pj-servicios']).toEqual({ libros: 400_000 })
    expect(l.bitacora.some((x) => /debitados a la DIAN/.test(x))).toBe(true)
    // Honorarios de la persona natural declarados en la casilla de jurídicas: el cruce por casilla lo detecta.
    const r = correrRevisionRetefuente({ periodo, cifras: cifras({ 'rf-pj-honorarios-base': 12_000_000, 'rf-pj-honorarios': 1_300_000 }), libros: l })
    expect(porRegla(r, 'R-11').map((p) => p.cuentaCodigo).sort()).toEqual(['rf-pj-honorarios', 'rf-pj-servicios', 'rf-pn-honorarios', 'rf-pn-trabajo'])
    const lectura = r.cedulas!.find((c) => c.id === 'lectura-libros')!.tablas.find((t) => t.id === 'conceptos')!
    expect(lectura.filas.find((f) => f.valores.concepto === 'Honorarios')!.valores).toMatchObject({ pj: 1_100_000, pn: 200_000, sin: 0 })
  })
  it('NIT con dígito de verificación pegado se reconoce como persona jurídica', () => {
    expect(digitoVerificacionNit('900123456')).toBe(8)
    expect(digitoVerificacionNit('860034313')).toBe(7)
    expect(normalizarNit('9001234568')).toBe('900123456')
    expect(normalizarNit('900.123.456-8')).toBe('900123456')
    expect(beneficiarioDeTercero('9001234568', null)).toBe('pj')
    expect(beneficiarioDeTercero('1020304050', null)).toBe('pn') // cédula de 10 dígitos
    expect(beneficiarioDeTercero('9001234560', null)).toBeNull() // 10 dígitos sin DV válido: ni NIT ni cédula, decide el nombre
    expect(beneficiarioDeTercero('9001234560', 'DISTRIBUIDORA ANDINA SAS')).toBe('pj')
  })
  it('R-17: sin detalle por tercero la cédula dice qué documento hace falta', () => {
    const r = correrRevisionRetefuente(base)
    const ced = r.cedulas!.find((c) => c.id === 'terceros-gasto')!
    expect(ced.estado).toBe('sin_insumos')
    expect(ced.motivo).toMatch(/balance de prueba por terceros/)
  })
  it('registro por impuesto', () => {
    expect(programaSugerido('retefuente').pasos.map((p) => p.id)).toContain('libros-reteiva')
    expect(insumosDelProgramaDe('retefuente', null)).toEqual(['borrador', 'auxiliar', 'anterior'])
    expect(reglasOmitidasDe('iva', null)).toEqual([])
  })
})
