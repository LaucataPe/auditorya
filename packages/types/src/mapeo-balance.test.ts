import { describe, expect, it } from 'vitest'
import {
  detectarMapeo, aplicarMapeo, aplicarPerfil, validarBalance,
  normalizarEncabezado, type MapeoColumnas, type PerfilBalance,
} from './mapeo-balance'

// ─── Archivos de ejemplo ─────────────────────────────────────────────────────

/** Export típico con encabezados y columnas separadas de cuenta y tercero. */
function archivoConEncabezados(): string[][] {
  return [
    ['Balance de prueba a diciembre 2025', '', '', '', '', '', '', ''],
    ['Código Cuenta', 'Nombre Cuenta', 'NIT Tercero', 'Nombre Tercero', 'Saldo Inicial', 'Débito', 'Crédito', 'Saldo Final'],
    ['1', 'Activo', '', '', '900', '600', '500', '1000'],
    ['11', 'Disponible', '', '', '620', '300', '220', '700'],
    ['13', 'Deudores', '', '', '280', '300', '280', '300'],
    ['1305', 'Clientes', '', '', '280', '300', '280', '300'],
    ['130505', 'Clientes nacionales', '', '', '280', '300', '280', '300'],
    ['130505', 'Clientes nacionales', '900123456', 'Comercializadora XYZ SAS', '180', '200', '190', '190'],
    ['130505', 'Clientes nacionales', '830987654', 'Distribuciones ABC LTDA', '100', '100', '90', '110'],
    ['2', 'Pasivo', '', '', '400', '100', '200', '500'],
    ['3', 'Patrimonio', '', '', '500', '0', '0', '500'],
    ['TOTALES', '', '', '', '1800', '700', '700', '2000'],
  ]
}

/** Formato clásico sin encabezados: una sola columna de texto, NIT antes de los saldos. */
function archivoSinEncabezados(): string[][] {
  return [
    ['1', 'Activo', '', '900', '600', '500', '1000'],
    ['13', 'Deudores', '', '280', '300', '280', '300'],
    ['1305', 'Clientes', '', '280', '300', '280', '300'],
    ['130505', 'Clientes nacionales', '', '280', '300', '280', '300'],
    ['13050501', 'Comercializadora XYZ SAS', '900123456', '180', '200', '190', '190'],
    ['13050501', 'Distribuciones ABC LTDA', '830987654', '100', '100', '90', '110'],
  ]
}

// ─── Detección ───────────────────────────────────────────────────────────────

describe('detectarMapeo', () => {
  it('detecta la fila de encabezados y mapea cada columna por nombre', () => {
    const d = detectarMapeo(archivoConEncabezados())
    expect(d.filaEncabezado).toBe(1)
    expect(d.filaDatos).toBe(2)
    expect(d.mapeo).toEqual([
      'codigo', 'nombreCuenta', 'nitTercero', 'nombreTercero',
      'saldoInicial', 'debito', 'credito', 'saldoFinal',
    ])
  })

  it('distingue "nombre tercero" de "nombre cuenta" aunque ambos digan nombre', () => {
    const d = detectarMapeo([
      ['Cuenta', 'Nombre', 'Nit', 'Nombre tercero', 'Saldo final'],
      ['1105', 'Caja', '', '', '100'],
    ])
    expect(d.mapeo).toEqual(['codigo', 'nombreCuenta', 'nitTercero', 'nombreTercero', 'saldoFinal'])
  })

  it('sin encabezados sugiere por contenido: código, texto, NIT y bloque de saldos', () => {
    const d = detectarMapeo(archivoSinEncabezados())
    expect(d.filaEncabezado).toBeNull()
    expect(d.filaDatos).toBe(0)
    expect(d.mapeo[0]).toBe('codigo')
    expect(d.mapeo[1]).toBe('nombreCuenta')
    expect(d.mapeo[2]).toBe('nitTercero')
    expect(d.mapeo.slice(3)).toEqual(['saldoInicial', 'debito', 'credito', 'saldoFinal'])
  })

  it('normaliza encabezados con tildes y símbolos', () => {
    expect(normalizarEncabezado('  Código de la Cuenta ')).toBe('codigo de la cuenta')
    expect(normalizarEncabezado('DÉBITOS ($)')).toBe('debitos')
  })
})

// ─── Aplicación del mapeo ────────────────────────────────────────────────────

describe('aplicarMapeo', () => {
  it('separa nombre de cuenta y nombre de tercero cuando hay columnas propias', () => {
    const d = detectarMapeo(archivoConEncabezados())
    const cuentas = aplicarMapeo(archivoConEncabezados(), d.mapeo, d.filaDatos)

    const resumen = cuentas.find((c) => c.codigo === '130505' && !c.tercero)
    expect(resumen?.nombre).toBe('Clientes nacionales')
    expect(resumen?.terceroNombre).toBeNull()

    const tercero = cuentas.find((c) => c.tercero === '900123456')
    expect(tercero?.terceroNombre).toBe('Comercializadora XYZ SAS')
    expect(tercero?.nombre).toBe('Clientes nacionales') // el nombre de la cuenta no se contamina
  })

  it('con una sola columna de texto, en filas con NIT el texto es del tercero y la cuenta cae al PUC', () => {
    const mapeo: MapeoColumnas = ['codigo', 'nombreCuenta', 'nitTercero', 'saldoInicial', 'debito', 'credito', 'saldoFinal']
    const cuentas = aplicarMapeo(archivoSinEncabezados(), mapeo, 0)

    const tercero = cuentas.find((c) => c.tercero === '900123456')
    expect(tercero?.terceroNombre).toBe('Comercializadora XYZ SAS')
    expect(tercero?.nombre).toBe('Clientes') // ancestro 1305 del diccionario PUC, no la razón social

    const resumen = cuentas.find((c) => c.codigo === '1305')
    expect(resumen?.nombre).toBe('Clientes')
    expect(resumen?.terceroNombre).toBeNull()
  })

  it('ignora títulos, totales y filas sin código', () => {
    const d = detectarMapeo(archivoConEncabezados())
    const cuentas = aplicarMapeo(archivoConEncabezados(), d.mapeo, d.filaDatos)
    expect(cuentas.some((c) => c.codigo === 'TOTALES')).toBe(false)
    expect(cuentas).toHaveLength(9)
  })

  it('parsea números en formato local y deja null los movimientos sin columna', () => {
    const mapeo: MapeoColumnas = ['codigo', 'nombreCuenta', null, 'saldoFinal']
    const cuentas = aplicarMapeo([['1105', 'Caja', 'x', '1.234.567,89']], mapeo, 0)
    expect(cuentas[0].saldoActual).toBeCloseTo(1234567.89)
    expect(cuentas[0].saldoInicial).toBe(0)
    expect(cuentas[0].debito).toBeNull()
    expect(cuentas[0].credito).toBeNull()
  })

  it('toma el nivel de la columna mapeada o de la longitud del código', () => {
    const conNivel: MapeoColumnas = ['codigo', 'nivel', 'saldoFinal']
    expect(aplicarMapeo([['130505', '3', '10']], conNivel, 0)[0].nivel).toBe(3)
    const sinNivel: MapeoColumnas = ['codigo', null, 'saldoFinal']
    expect(aplicarMapeo([['130505', '', '10']], sinNivel, 0)[0].nivel).toBe(6)
  })
})

// ─── Perfil reutilizable ─────────────────────────────────────────────────────

describe('aplicarPerfil', () => {
  it('re-aplica el mapeo por nombre de encabezado aunque cambie el orden de columnas', () => {
    const original = detectarMapeo(archivoConEncabezados())
    const perfil: PerfilBalance = { mapeo: original.mapeo, encabezados: original.encabezados }

    const reordenado: string[][] = [
      ['Saldo Final', 'Código Cuenta', 'Nombre Cuenta'],
      ['1105', '', ''],
    ]
    const d = detectarMapeo(reordenado)
    expect(aplicarPerfil(perfil, d)).toEqual(['saldoFinal', 'codigo', 'nombreCuenta'])
  })

  it('sin encabezados exige el mismo número de columnas', () => {
    const perfil: PerfilBalance = { mapeo: ['codigo', 'nombreCuenta', 'saldoFinal'], encabezados: null }
    const igual = detectarMapeo([['1105', 'Caja', '100']])
    expect(aplicarPerfil(perfil, igual)).toEqual(['codigo', 'nombreCuenta', 'saldoFinal'])
    const distinto = detectarMapeo([['1105', 'Caja', '1', '100']])
    expect(aplicarPerfil(perfil, distinto)).toBeNull()
  })
})

// ─── Validación ──────────────────────────────────────────────────────────────

describe('validarBalance', () => {
  function cuentasDe(filas: string[][], mapeo?: MapeoColumnas) {
    const d = detectarMapeo(filas)
    return aplicarMapeo(filas, mapeo ?? d.mapeo, d.filaDatos)
  }

  it('acepta un balance que cuadra', () => {
    const v = validarBalance(cuentasDe(archivoConEncabezados()))
    expect(v.ok).toBe(true)
    expect(v.problemas).toHaveLength(0)
  })

  it('marca error cuando ninguna fila tiene código válido', () => {
    const v = validarBalance([])
    expect(v.ok).toBe(false)
    expect(v.problemas[0].clave).toBe('sin_cuentas')
  })

  it('detecta filas donde inicial + movimientos no da el final', () => {
    const filas = archivoConEncabezados()
    filas[4] = ['13', 'Deudores', '', '', '280', '300', '280', '999'] // debería ser 300
    const v = validarBalance(cuentasDe(filas))
    expect(v.problemas.some((p) => p.clave === 'ecuacion_fila')).toBe(true)
  })

  it('detecta padres que no cuadran con la suma de sus hijos', () => {
    const filas: string[][] = [
      ['Cuenta', 'Nombre', 'Saldo final'],
      ['13', 'Deudores', '500'],
      ['1305', 'Clientes', '300'], // 1305 solo suma 300 ≠ 500
    ]
    const v = validarBalance(cuentasDe(filas))
    expect(v.problemas.some((p) => p.clave === 'jerarquia')).toBe(true)
  })

  it('detecta códigos duplicados con el mismo tercero', () => {
    const filas: string[][] = [
      ['Cuenta', 'Nombre', 'Saldo final'],
      ['1105', 'Caja', '100'],
      ['1105', 'Caja', '100'],
    ]
    const v = validarBalance(cuentasDe(filas))
    expect(v.problemas.some((p) => p.clave === 'duplicados')).toBe(true)
  })

  it('advierte cuando el activo no cuadra con pasivo + patrimonio + resultado', () => {
    const filas: string[][] = [
      ['Cuenta', 'Nombre', 'Saldo final'],
      ['1', 'Activo', '1000'],
      ['2', 'Pasivo', '300'],
      ['3', 'Patrimonio', '100'],
      ['4', 'Ingresos', '50'],
    ]
    const v = validarBalance(cuentasDe(filas))
    expect(v.problemas.some((p) => p.clave === 'ecuacion_patrimonial')).toBe(true)
  })
})
