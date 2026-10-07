/**
 * Motor de reteICA (RI-xx) sobre la 2368 real de Siesa por terceros (bimestre 4
 * de 2026, anonimizada) y los dos borradores reales: Bogotá (formulario 131) y Cali.
 */
import { describe, expect, it } from 'vitest'
import { parseBalancePeriodo } from './parse-balance-periodo'
import { clasificarSubcuentaReteica, esEntidadTerritorial, mapearLibrosReteica, municipioDeLaDeclaracion, municipioDeTexto, tarifaPorMilDelNombre } from './agente-reteica-libros'
import { correrRevisionReteica, programaSugeridoReteica, reglasOmitidasReteica, type EntradaCorridaReteica } from './agente-reteica'
import { AGENTES_TRIBUTARIOS, esTipoAgentico, insumosDelProgramaDe } from './agente-tributario'
import { IMPUESTOS_CATALOGO, nombreObligacion, resolverCifras, type CifrasRevision } from './tributario'
import { esImpuestoMunicipal, mismoMunicipio, normalizarMunicipio } from './municipios'
import { BALANCE_SIESA_TERCEROS_2368 } from './fixtures/balance-siesa-terceros-2368'

const cifras = (dec: Record<string, number>): CifrasRevision => Object.fromEntries(Object.entries(dec).map(([k, v]) => [k, { declarado: v, libros: null }]))
const periodo = { desde: '2026-07-01', hasta: '2026-08-31', etiqueta: 'Bim. 4 (jul–ago) 2026', periodicidad: 'bimestral' as const, anio: 2026 }
const porRegla = (r: ReturnType<typeof correrRevisionReteica>, regla: string) => r.propuestas.filter((p) => p.reglas.includes(regla))

const balance = parseBalancePeriodo(BALANCE_SIESA_TERCEROS_2368)!
const nombresCuentas = Object.fromEntries(balance.todas.map((c) => [c.cuenta, c.nombre]))
const mapear = (nombre: string | null, memoria: Record<string, string> = {}, conTerceros = true) =>
  mapearLibrosReteica({ cuentas: balance.cuentas }, [], { obligacion: { id: 'ob-1', nombre }, memoria, saldosTercero: conTerceros ? balance.terceros : [], nombresCuentas })

// Borradores reales del bimestre 4 de 2026.
const BOGOTA = { 'ri-base': 224_910_000, 'ri-retenciones': 2_307_000, 'ri-devoluciones': 12_000, 'ri-sanciones': 0 }
const CALI = { 'ri-base': 7_621_000, 'ri-base-autorretencion': 0, 'ri-retenciones': 57_000, 'ri-autorretenciones': 0, 'ri-sanciones': 0 }

describe('lectura de la 2368', () => {
  it('municipio y tarifa por el nombre de la subcuenta o de su cuenta', () => {
    expect(tarifaPorMilDelNombre('BOGOTA TARIFA 9,66/1000')).toBe(9.66)
    expect(tarifaPorMilDelNombre('RETEICA 6.9 X MIL')).toBe(6.9)
    expect(tarifaPorMilDelNombre('CALI TARIFA 10/1000')).toBe(10)
    expect(tarifaPorMilDelNombre('RETEICA BOGOTA')).toBeNull()
    expect(municipioDeTexto('ReteICA Bogotá D.C.')?.clave).toBe('bogota')
    expect(municipioDeTexto('Retención ICA Cali')?.clave).toBe('cali')
    expect(clasificarSubcuentaReteica('23680599', 'PAGO RETENCION ICA BOGOTA')).toMatchObject({ municipio: 'bogota', tipo: 'saldo' })
    expect(clasificarSubcuentaReteica('23680501', 'TARIFA 9,66/1000', ' BOGOTA')).toMatchObject({ municipio: 'bogota', tipo: 'retencion', tarifa: 9.66, regla: 'padre' })
    expect(esEntidadTerritorial('899999061', null)).toBe(true)
    expect(esEntidadTerritorial(null, 'SECRETARIA DE HACIENDA DE MEDELLIN')).toBe(true)
    expect(esEntidadTerritorial('900000501', 'PROVEEDOR AB SAS')).toBe(false)
  })
  it('Bogotá: retenciones, devoluciones a proveedores y pago al distrito separados', () => {
    const l = mapear('ReteICA Bogotá')
    expect(l.municipio).toBe('bogota')
    expect(l.municipioOrigen).toBe('obligacion')
    expect(l.cifras['ri-retenciones']).toEqual({ libros: 2_306_695 })
    expect(l.cifras['ri-devoluciones']).toEqual({ libros: 22_466 })
    expect(l.municipios.map((m) => m.municipio)).toEqual(['bogota', 'cali'])
    // El pago de la declaración anterior (23680599) no es retención ni devolución.
    expect(l.subcuentas.find((s) => s.cuenta === '23680599')).toMatchObject({ tipo: 'saldo' })
    expect(l.bitacora.some((x) => /no se descontaron/.test(x))).toBe(true)
    // Base que explican las retenciones a la tarifa de cada subcuenta.
    expect(l.baseExplicada).toBeGreaterThan(224_000_000)
    expect(l.baseExplicada).toBeLessThan(228_000_000)
    expect(l.terceros.length).toBeGreaterThan(20)
    expect(l.terceros.every((t) => !/BOGOTA DISTRITO/.test(t.nombre ?? ''))).toBe(true)
  })
  it('Cali: el traslado al municipio es pago, no devolución', () => {
    const l = mapear('ReteICA Cali')
    expect(l.cifras['ri-retenciones']).toEqual({ libros: 57_340 })
    expect(l.cifras['ri-devoluciones']).toEqual({ libros: 0 })
  })
  it('sin detalle por tercero no inventa devoluciones', () => {
    const l = mapear('ReteICA Bogotá', {}, false)
    expect(l.conTerceros).toBe(false)
    expect(l.cifras['ri-retenciones']).toEqual({ libros: 2_306_695 })
    expect(l.cifras['ri-devoluciones']).toBeUndefined()
  })
  it('municipio de la declaración: nombre, memoria o único en libros', () => {
    expect(municipioDeLaDeclaracion({ id: 'x', nombre: 'ReteICA', municipio: 'cali' }, { 'obligacion:x': 'bogota' }, ['bogota'])).toEqual({ municipio: 'cali', origen: 'obligacion' })
    expect(municipioDeLaDeclaracion({ id: 'x', nombre: 'ReteICA' }, { 'obligacion:x': 'cali' }, ['bogota', 'cali'])).toEqual({ municipio: 'cali', origen: 'memoria' })
    expect(municipioDeLaDeclaracion({ id: 'x', nombre: null }, {}, ['bogota'])).toEqual({ municipio: 'bogota', origen: 'unico-en-libros' })
    expect(municipioDeLaDeclaracion({ id: 'x', nombre: null }, {}, ['bogota', 'cali'])).toEqual({ municipio: null, origen: null })
  })
})

describe('motor RI-xx con los borradores reales', () => {
  const entradaBogota: EntradaCorridaReteica = { periodo, cifras: cifras(BOGOTA), libros: mapear('ReteICA Bogotá'), obligacionId: 'ob-1', municipiosConObligacion: ['bogota', 'cali'] }

  it('Bogotá: retenciones cuadran con libros y las devoluciones no', () => {
    const r = correrRevisionReteica(entradaBogota)
    const libros = r.cedulas!.find((c) => c.id === 'libros')!
    const cruce = libros.tablas.find((t) => t.id === 'cruce')!
    expect(cruce.filas.map((f) => [f.regla, f.estado])).toEqual([['RI-10', 'conforme'], ['RI-11', 'diferencia']])
    const h = porRegla(r, 'RI-11')[0]
    expect(h).toMatchObject({ tipo: 'hallazgo', monto: 10_466 })
    expect(cruce.filas[1].propuesta).toBe(h.codigo)
    // Base declarada contra base explicada: dentro del margen.
    expect(libros.tablas.find((t) => t.id === 'base')!.filas[0].estado).toBe('conforme')
    // Tarifa implícita 10,26 por mil: dentro del rango de Bogotá.
    expect(r.cedulas!.find((c) => c.id === 'formulario')!.tablas[0].filas.find((f) => f.regla === 'RI-02')!.estado).toBe('conforme')
    // Devoluciones declaradas piden soporte.
    expect(porRegla(r, 'RI-04')[0]).toMatchObject({ tipo: 'juicio' })
  })
  it('Bogotá: tarifas 7,66 y 8,66 por mil no son de la tabla del distrito', () => {
    const r = correrRevisionReteica(entradaBogota)
    const j = porRegla(r, 'RI-15')[0]
    expect(j.tipo).toBe('juicio')
    expect(j.datos.map((d) => d.etiqueta)).toEqual(['23680507 (7,66 ‰)', '23680509 (8,66 ‰)'])
    const tar = r.cedulas!.find((c) => c.id === 'tarifas')!
    expect(tar.tablas.find((t) => t.id === 'tarifas')!.filas.filter((f) => f.estado === 'por_confirmar')).toHaveLength(2)
    expect(tar.tablas.find((t) => t.id === 'proveedores')!.filas.length).toBeGreaterThan(20)
  })
  it('territorialidad: Cali tiene su obligación; sin ella se alerta', () => {
    const conAmbas = correrRevisionReteica(entradaBogota)
    expect(porRegla(conAmbas, 'RI-20')).toEqual([])
    const soloBogota = correrRevisionReteica({ ...entradaBogota, municipiosConObligacion: ['bogota'] })
    expect(porRegla(soloBogota, 'RI-20')[0].titulo).toMatch(/Santiago de Cali/)
  })
  it('Cali: todo cuadra y no hay tabla de tarifas, así que se muestran sin calificar', () => {
    const r = correrRevisionReteica({ periodo, cifras: cifras(CALI), libros: mapear('ReteICA Cali'), obligacionId: 'ob-2', municipiosConObligacion: ['bogota', 'cali'] })
    expect(r.resumen.hallazgos).toBe(0)
    const tar = r.cedulas!.find((c) => c.id === 'tarifas')!
    expect(tar.tablas.find((t) => t.id === 'tarifas')!.filas.every((f) => f.estado === 'no_verificable')).toBe(true)
    expect(tar.limitaciones.some((l) => /no tiene la tabla de tarifas/.test(l))).toBe(true)
  })
  it('sin municipio establecido pregunta de cuál es, con la memoria de la obligación', () => {
    const r = correrRevisionReteica({ periodo, cifras: cifras(BOGOTA), libros: mapear('ReteICA'), obligacionId: 'ob-9' })
    const a = porRegla(r, 'RI-05')[0]
    expect(a).toMatchObject({ tipo: 'ambiguedad', cuentaCodigo: 'obligacion:ob-9' })
    expect(a.contenido.tributario?.memoriaClave).toBe('mapeo2368')
    expect(a.contenido.opciones!.slice(0, 2).map((o) => o.clave)).toEqual(['bogota', 'cali'])
    expect(r.cedulas!.find((c) => c.id === 'libros')!.estado).toBe('sin_insumos')
  })
  it('formulario: retención sin base, devoluciones mayores que retenciones, presentación tardía', () => {
    const r = correrRevisionReteica({ periodo, cifras: cifras({ 'ri-retenciones': 100_000, 'ri-devoluciones': 150_000 }), obligacionId: 'x', fechaVencimiento: '2026-09-18', fechaPresentacion: '2026-09-20' })
    expect(porRegla(r, 'RI-03')[0].tipo).toBe('hallazgo')
    expect(porRegla(r, 'RI-04')[0]).toMatchObject({ tipo: 'hallazgo', severidad: 'alta' })
    expect(porRegla(r, 'RI-31')[0]).toMatchObject({ tipo: 'hallazgo' })
  })
  it('período anterior: variación mayor al 50 %', () => {
    const r = correrRevisionReteica({ ...entradaBogota, anterior: { etiqueta: 'Bim. 3 (may–jun) 2026', cifras: cifras({ 'ri-base': 100_000_000, 'ri-retenciones': 1_000_000 }) } })
    expect(porRegla(r, 'RI-30')).toHaveLength(1)
    expect(r.cedulas!.find((c) => c.id === 'periodo-anterior')!.estado).toBe('ejecutada')
  })
  it('programa y registro', () => {
    expect(esTipoAgentico('reteica')).toBe(true)
    expect(AGENTES_TRIBUTARIOS.reteica.memoriaClave).toBe('mapeo2368')
    expect(insumosDelProgramaDe('reteica', null)).toEqual(['borrador', 'auxiliar', 'anterior'])
    const p = programaSugeridoReteica()
    p.pasos.find((x) => x.id === 'tarifas')!.activo = false
    expect(reglasOmitidasReteica(p)).toEqual(['RI-15'])
    const r = correrRevisionReteica({ ...entradaBogota, omitirReglas: reglasOmitidasReteica(p) })
    expect(r.cedulas!.find((c) => c.id === 'tarifas')!.estado).toBe('omitida')
    expect(porRegla(r, 'RI-15')).toEqual([])
    expect(['territorialidad', 'tarifas-actividad', 'bases-contabilidad', 'presentacion-pago'].every((i) => IMPUESTOS_CATALOGO.reteica.checklist.some((c) => c.id === i))).toBe(true)
  })
  it('nombre de la obligación y municipios escritos a mano', () => {
    expect(nombreObligacion({ tipo: 'reteica', nombre: null, municipio: 'bogota' })).toBe('ReteICA · Bogotá D.C.')
    expect(nombreObligacion({ tipo: 'reteica', nombre: 'ReteICA Bogotá', municipio: 'bogota' })).toBe('ReteICA Bogotá')
    expect(nombreObligacion({ tipo: 'reteica', nombre: null, municipio: 'Girardot' })).toBe('ReteICA · Girardot')
    expect(normalizarMunicipio('Bogotá D.C.')).toBe('bogota')
    expect(normalizarMunicipio('  Girardot ')).toBe('Girardot')
    expect(mismoMunicipio('bogota', 'Bogotá')).toBe(true)
    expect(mismoMunicipio('girardot', 'Girardot')).toBe(true)
    expect(mismoMunicipio('cali', 'bogota')).toBe(false)
    expect(esImpuestoMunicipal('reteica') && esImpuestoMunicipal('ica') && !esImpuestoMunicipal('iva')).toBe(true)
  })
  it('catálogo: el total resta las devoluciones y suma autorretenciones', () => {
    const R = resolverCifras('reteica', cifras({ ...BOGOTA, 'ri-autorretenciones': 1_000 }))
    expect(R['ri-total'].declarado).toBe(2_307_000 + 1_000 - 12_000)
  })
})
