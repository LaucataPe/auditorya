import { describe, it, expect } from 'vitest'
import { correrValidacionBalance, huellaPropuesta, severidadPorMonto } from './agente-balance'
import type { CuentaImport } from './balance'

const fila = (codigo: string, saldoActual: number, extra: Partial<CuentaImport> = {}): CuentaImport => ({
  codigo, nombre: null, nivel: codigo.length, tercero: null, terceroNombre: null,
  saldoActual, saldoInicial: 0, debito: null, credito: null, ...extra,
})

/** Balance mínimo cuadrado en convención natural: activo 1.000 = pasivo 400 + patrimonio 500 + resultado 100. */
function balanceBase(): CuentaImport[] {
  return [
    fila('1', 1000), fila('11', 300), fila('1105', 100), fila('1110', 200), fila('13', 700), fila('1305', 700),
    fila('2', 400), fila('22', 400), fila('2205', 400),
    fila('3', 500), fila('31', 500), fila('3105', 500),
    fila('4', 600), fila('41', 600), fila('4135', 600),
    fila('5', 500), fila('51', 500), fila('5105', 500),
  ]
}

const M = { monto: 50, desempeno: 37.5, trivial: 2.5 }

describe('severidadPorMonto', () => {
  it('clasifica por M, MD y T', () => {
    expect(severidadPorMonto(60, M).severidad).toBe('alta')
    expect(severidadPorMonto(40, M).severidad).toBe('media')
    expect(severidadPorMonto(5, M).severidad).toBe('baja')
    expect(severidadPorMonto(1, M).severidad).toBe('trivial')
  })
  it('los escaladores suben un nivel con tope alto', () => {
    expect(severidadPorMonto(5, M, ['efectivo']).severidad).toBe('media')
    expect(severidadPorMonto(40, M, ['impuestos']).severidad).toBe('alta')
    expect(severidadPorMonto(60, M, ['efectivo', 'fraude']).severidad).toBe('alta')
  })
  it('sin materialidad devuelve media provisional', () => {
    expect(severidadPorMonto(999, null).severidad).toBe('media')
  })
})

describe('correrValidacionBalance', () => {
  it('un balance limpio no produce hallazgos y propone materialidad preliminar', () => {
    const r = correrValidacionBalance({
      archivoNombre: 'b.xlsx', filas: balanceBase(), comparativo: [], materialidad: null,
      bases: { activos: 1000, ingresos: 600, utilidad_antes_impuestos: 100, patrimonio: 500 }, periodo: { desde: null, hasta: null },
    })
    expect(r.propuestas.filter((p) => p.tipo === 'hallazgo')).toHaveLength(0)
    const mat = r.propuestas.find((p) => p.tipo === 'materialidad')
    expect(mat?.contenido.materialidad?.baseCalculo).toBe('utilidad_antes_impuestos')
    expect(mat?.contenido.materialidad?.materialidad).toBe(5)
    expect(r.resumen.convencion).toBe('natural')
    expect(r.resumen.limitaciones.some((l) => l.regla.startsWith('V-70'))).toBe(true)
  })

  it('detecta bancos en crédito como V-21 alta y pide el extracto', () => {
    const filas = balanceBase().map((f) => (f.codigo === '1110' ? { ...f, saldoActual: -200 } : f.codigo === '1105' ? { ...f, saldoActual: 500 } : f))
    const r = correrValidacionBalance({
      archivoNombre: null, filas, comparativo: [], materialidad: { monto: 50, desempeno: 37.5, aprobada: true },
      bases: { activos: 1000, ingresos: 600, utilidad_antes_impuestos: 100, patrimonio: 500 }, periodo: { desde: null, hasta: null },
    })
    const h = r.propuestas.find((p) => p.reglas.includes('V-21'))
    expect(h?.severidad).toBe('alta')
    expect(h?.certeza).toBe('verificado')
    expect(h?.codigo).toBe('H-01')
    const d = r.propuestas.find((p) => p.tipo === 'documento' && p.desbloqueaClave === h?.clave)
    expect(d?.contenido.para).toContain('H-01')
    expect(r.propuestas.some((p) => p.tipo === 'materialidad')).toBe(false)
  })

  it('normaliza la convención firmada y no marca crédito como contrario', () => {
    const filas = balanceBase().map((f) => (['2', '3', '4'].includes(f.codigo.charAt(0)) ? { ...f, saldoActual: -f.saldoActual } : f))
    const r = correrValidacionBalance({
      archivoNombre: null, filas, comparativo: [], materialidad: { monto: 50, desempeno: 37.5, aprobada: true },
      bases: { activos: 1000, ingresos: 600, utilidad_antes_impuestos: 100, patrimonio: 500 }, periodo: { desde: null, hasta: null },
    })
    expect(r.resumen.convencion).toBe('firmada')
    expect(r.propuestas.filter((p) => p.reglas.includes('V-20'))).toHaveLength(0)
  })

  it('con comparativo reporta variaciones por encima del 30 % con severidad por monto', () => {
    const r = correrValidacionBalance({
      archivoNombre: null, filas: balanceBase(), comparativo: [{ codigo: '1305', saldo: 400 }, { codigo: '2205', saldo: 400 }],
      materialidad: { monto: 50, desempeno: 37.5, aprobada: true },
      bases: { activos: 1000, ingresos: 600, utilidad_antes_impuestos: 100, patrimonio: 500 }, periodo: { desde: null, hasta: null },
    })
    const v = r.propuestas.find((p) => p.reglas.includes('V-70') && p.cuentaCodigo === '1305')
    expect(v?.severidad).toBe('alta')
    expect(v?.monto).toBe(300)
    expect(r.propuestas.some((p) => p.cuentaCodigo === '2205' && p.reglas.includes('V-70'))).toBe(false)
  })

  it('reporta la cuenta bolsa 5195 cuando supera la materialidad de desempeño', () => {
    const filas = balanceBase().map((f) => (f.codigo === '5105' ? { ...f, codigo: '5195' } : f))
    const r = correrValidacionBalance({
      archivoNombre: null, filas, comparativo: [], materialidad: { monto: 50, desempeno: 37.5, aprobada: true },
      bases: { activos: 1000, ingresos: 600, utilidad_antes_impuestos: 100, patrimonio: 500 }, periodo: { desde: null, hasta: null },
    })
    const b = r.propuestas.find((p) => p.reglas.includes('V-40'))
    expect(b?.cuentaCodigo).toBe('5195')
    expect(b?.certeza).toBe('requiere_evidencia')
  })

  it('continúa la numeración y no repite lo ya decidido por una persona', () => {
    const filas = balanceBase().map((f) => (f.codigo === '1110' ? { ...f, saldoActual: -200 } : f.codigo === '1105' ? { ...f, saldoActual: 500 } : f))
    const entrada = {
      archivoNombre: null, filas, comparativo: [], materialidad: { monto: 50, desempeno: 37.5, aprobada: true },
      bases: { activos: 1000, ingresos: 600, utilidad_antes_impuestos: 100, patrimonio: 500 }, periodo: { desde: null, hasta: null },
    }
    const primera = correrValidacionBalance(entrada)
    const bancos = primera.propuestas.find((p) => p.reglas.includes('V-21'))!
    const segunda = correrValidacionBalance({ ...entrada, numeracion: { H: 3, D: 2 }, huellasDecididas: [huellaPropuesta(bancos)] })
    expect(segunda.propuestas.some((p) => p.reglas.includes('V-21'))).toBe(false)
    expect(segunda.propuestas.some((p) => p.tipo === 'documento' && p.desbloqueaClave === bancos.clave)).toBe(false)
    const codigos = segunda.propuestas.filter((p) => p.tipo === 'hallazgo').map((p) => p.codigo)
    expect(codigos.every((c) => Number(c!.slice(2)) > 3)).toBe(true)
  })
})
