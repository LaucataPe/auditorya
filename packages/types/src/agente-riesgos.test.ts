import { describe, expect, it } from 'vitest'
import { areaDesdeCodigoPuc, correrIdentificacionRiesgos, huellaRiesgo, type EntradaCorridaRiesgos } from './agente-riesgos'

const base: EntradaCorridaRiesgos = {
  sector: 'Comercio',
  hallazgos: [
    { codigo: 'H-01', titulo: '1110 · Saldo crédito en bancos', cuentaCodigo: '111005', monto: -12_000_000, severidad: 'alta', certeza: 'verificado', reglas: ['V-20', 'V-21'], estado: 'aprobada' },
    { codigo: 'H-02', titulo: '1120 · Saldo crédito en cuentas de ahorro', cuentaCodigo: '112005', monto: -500_000, severidad: 'baja', certeza: 'verificado', reglas: ['V-20', 'V-21'], estado: 'ajustada' },
    { codigo: 'H-03', titulo: '1380 · Deudores varios: cuenta bolsa', cuentaCodigo: '1380', monto: 30_000_000, severidad: 'media', certeza: 'requiere_evidencia', reglas: ['V-40'], estado: 'aprobada' },
    { codigo: 'H-04', titulo: 'El balance no cuadra', cuentaCodigo: null, monto: null, severidad: 'alta', certeza: 'verificado', reglas: ['V-01'], estado: 'aprobada' },
  ],
  hallazgosPendientes: 2,
  catalogoSector: [
    { area: 'inventarios', descripcion: 'Inventario obsoleto o sobrevaluado.', riesgoInherente: 'alto', respuestaPlaneada: 'Toma física y pruebas de valuación.' },
    { area: 'bancos', descripcion: 'Conciliaciones con partidas antiguas.', riesgoInherente: 'medio', respuestaPlaneada: 'Revisar conciliaciones.' },
    { area: 'ingresos_operacionales', descripcion: 'Corte de ventas.', riesgoInherente: 'alto', respuestaPlaneada: 'Prueba de corte.' },
  ],
  entendimiento: { cambiosSignificativos: 'Cambiamos de software contable a Siigo en marzo y abrimos una sucursal en Cali.', sinCambios: false, confirmado: true },
  coso: [],
  riesgosExistentes: [{ area: 'ingresos_operacionales', descripcion: 'Ya lo agregó el auditor', origen: 'manual' }],
  materialidad: { monto: 20_000_000, aprobada: true },
}

describe('areaDesdeCodigoPuc', () => {
  it('mapea caja, bancos y grupos comunes', () => {
    expect(areaDesdeCodigoPuc('110505')).toBe('caja')
    expect(areaDesdeCodigoPuc('111005')).toBe('bancos')
    expect(areaDesdeCodigoPuc('1380')).toBe('cuentas_por_cobrar')
    expect(areaDesdeCodigoPuc('2105')).toBe('obligaciones_financieras')
    expect(areaDesdeCodigoPuc('3605')).toBe('patrimonio')
    expect(areaDesdeCodigoPuc('9999')).toBe('otros_activos')
  })
})

describe('correrIdentificacionRiesgos', () => {
  it('agrupa hallazgos por área, sube el control por el entendimiento y completa con el sector', () => {
    const r = correrIdentificacionRiesgos(base)
    const porArea = Object.fromEntries(r.propuestas.map((p) => [p.contenido.riesgo!.area, p]))

    // R-01: bancos agrupa H-01 y H-02; cuentas_por_cobrar viene de H-03; H-04 (sin cuenta) no genera riesgo.
    expect(porArea.bancos).toBeDefined()
    expect(porArea.bancos.contenido.riesgo!.fuente).toEqual({ tipo: 'hallazgo', codigos: ['H-01', 'H-02'] })
    expect(porArea.bancos.contenido.riesgo!.riesgoInherente).toBe('alto')
    expect(porArea.bancos.certeza).toBe('verificado')
    expect(porArea.bancos.reglas).toEqual(['R-01', 'H-01', 'H-02'])
    expect(porArea.cuentas_por_cobrar.certeza).toBe('requiere_evidencia')
    expect(r.resumen.hallazgosSinArea).toBe(1)

    // R-03: "software contable" sube el control a alto; "sucursal" cae en ingresos, que ya tiene riesgo manual → sector lo salta,
    // pero el entendimiento sí propone porque el área no salió del balance.
    expect(r.resumen.controlPorEntendimiento).toBe(true)
    expect(porArea.bancos.contenido.riesgo!.riesgoControl).toBe('alto')
    expect(porArea.bancos.contenido.riesgo!.riesgoCombinado).toBe('alto')
    expect(porArea.ingresos_operacionales.contenido.riesgo!.fuente.tipo).toBe('entendimiento')

    // R-10: inventarios entra (área libre); bancos no (ya viene del balance); ingresos no (ya tiene riesgo manual y del entendimiento).
    expect(porArea.inventarios.contenido.riesgo!.fuente.tipo).toBe('sector')
    expect(r.propuestas.filter((p) => p.contenido.riesgo!.fuente.tipo === 'sector')).toHaveLength(1)

    // Todos son tipo riesgo, paso riesgos, con código R-xx consecutivo y severidad = combinado.
    expect(r.propuestas.every((p) => p.tipo === 'riesgo' && p.paso === 'riesgos')).toBe(true)
    expect(r.propuestas.map((p) => p.codigo)).toEqual(['R-01', 'R-02', 'R-03', 'R-04'])
    expect(r.propuestas[0].severidad).toBe('alta')
    expect(r.propuestas.every((p) => p.bitacora.length >= 2)).toBe(true)
    expect(r.resumen.riesgos).toBe(4)
  })

  it('usa COSO como control base y medio sin evaluación', () => {
    const sinCoso = correrIdentificacionRiesgos({ ...base, entendimiento: null })
    expect(sinCoso.resumen.controlBase).toBe('medio')
    expect(sinCoso.resumen.limitaciones.map((l) => l.regla)).toContain('R-02')
    const conCoso = correrIdentificacionRiesgos({ ...base, entendimiento: null, coso: [{ componente: 'ambiente_control', calificacion: 'efectivo' }, { componente: 'supervision', calificacion: 'efectivo' }] })
    expect(conCoso.resumen.controlBase).toBe('bajo')
    expect(conCoso.propuestas.find((p) => p.contenido.riesgo!.area === 'bancos')!.contenido.riesgo!.riesgoControl).toBe('bajo')
  })

  it('continúa la numeración y no repite lo ya decidido', () => {
    const primera = correrIdentificacionRiesgos(base)
    const decidida = primera.propuestas.find((p) => p.contenido.riesgo!.area === 'bancos')!
    const segunda = correrIdentificacionRiesgos({ ...base, numeracion: { R: 4 }, huellasDecididas: [huellaRiesgo(decidida.contenido.riesgo!)] })
    expect(segunda.propuestas.some((p) => p.contenido.riesgo!.area === 'bancos')).toBe(false)
    expect(segunda.propuestas[0].codigo).toBe('R-05')
    expect(segunda.bitacora.some((l) => l.texto.includes('Omití 1 riesgo'))).toBe(true)
  })

  it('sin hallazgos ni entendimiento solo propone el sector', () => {
    const r = correrIdentificacionRiesgos({ ...base, hallazgos: [], entendimiento: { cambiosSignificativos: null, sinCambios: true, confirmado: true }, riesgosExistentes: [] })
    expect(r.propuestas.every((p) => p.contenido.riesgo!.fuente.tipo === 'sector')).toBe(true)
    expect(r.propuestas).toHaveLength(3)
    expect(r.propuestas.every((p) => p.contenido.riesgo!.riesgoControl === 'medio')).toBe(true)
  })
})
