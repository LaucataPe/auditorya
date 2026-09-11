import { describe, expect, it } from 'vitest'
import {
  CIFRAS_CATALOGO,
  IMPUESTOS_CATALOGO,
  LECTURA_FORMULARIO,
  TIPOS_IMPUESTO,
  alcanceSugerido,
  aplicarLecturaFormulario,
  etiquetaPeriodo,
  hallazgoTributarioPendiente,
  nombreObligacion,
  periodosDeVigencia,
  presentacionExtemporanea,
  procedimientosSugeridos,
  resolverCifras,
} from './tributario'

describe('periodosDeVigencia', () => {
  it('genera los períodos según la periodicidad', () => {
    expect(periodosDeVigencia('mensual')).toHaveLength(12)
    expect(periodosDeVigencia('mensual')[0]).toBe('01')
    expect(periodosDeVigencia('mensual')[11]).toBe('12')
    expect(periodosDeVigencia('bimestral')).toEqual(['B1', 'B2', 'B3', 'B4', 'B5', 'B6'])
    expect(periodosDeVigencia('cuatrimestral')).toEqual(['C1', 'C2', 'C3'])
    expect(periodosDeVigencia('anual')).toEqual(['A'])
  })

  it('las claves de período ordenan cronológicamente como texto', () => {
    // La matriz y la clave única (obligación, período) dependen de este orden.
    const meses = periodosDeVigencia('mensual')
    expect([...meses].sort()).toEqual(meses)
    const bimestres = periodosDeVigencia('bimestral')
    expect([...bimestres].sort()).toEqual(bimestres)
  })
})

describe('etiquetaPeriodo', () => {
  it('etiqueta cada periodicidad', () => {
    expect(etiquetaPeriodo('mensual', '03')).toBe('Marzo')
    expect(etiquetaPeriodo('bimestral', 'B1')).toBe('Bim. 1 (ene–feb)')
    expect(etiquetaPeriodo('bimestral', 'B6')).toBe('Bim. 6 (nov–dic)')
    expect(etiquetaPeriodo('cuatrimestral', 'C3')).toBe('Cuat. 3 (sep–dic)')
    expect(etiquetaPeriodo('anual', 'A')).toBe('Anual')
  })

  it('devuelve la clave tal cual si el período es inválido', () => {
    expect(etiquetaPeriodo('bimestral', 'B9')).toBe('B9')
    expect(etiquetaPeriodo('mensual', 'xx')).toBe('xx')
  })
})

describe('catálogo de impuestos', () => {
  it('todos los tipos tienen catálogo con checklist e ids únicos', () => {
    for (const tipo of TIPOS_IMPUESTO) {
      const cat = IMPUESTOS_CATALOGO[tipo]
      expect(cat.checklist.length).toBeGreaterThan(0)
      const ids = cat.checklist.map((i) => i.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })
})

describe('catálogo de cifras', () => {
  it('todos los impuestos tienen renglones con ids únicos', () => {
    for (const tipo of TIPOS_IMPUESTO) {
      const renglones = CIFRAS_CATALOGO[tipo].flatMap((s) => s.renglones)
      expect(renglones.length).toBeGreaterThan(0)
      const ids = renglones.map((r) => r.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('las fórmulas solo referencian renglones anteriores (sin ciclos)', () => {
    for (const tipo of TIPOS_IMPUESTO) {
      const vistos = new Set<string>()
      for (const s of CIFRAS_CATALOGO[tipo]) {
        for (const r of s.renglones) {
          for (const t of r.formula ?? []) {
            expect(vistos.has(t.id), `${tipo}: ${r.id} referencia ${t.id} antes de definirlo`).toBe(true)
          }
          vistos.add(r.id)
        }
      }
    }
  })

  it('los renglones digitables no llevan fórmula y los calculados sí', () => {
    for (const tipo of TIPOS_IMPUESTO) {
      for (const r of CIFRAS_CATALOGO[tipo].flatMap((s) => s.renglones)) {
        if (r.tipo === 'digitable') expect(r.formula).toBeUndefined()
        else expect(r.formula?.length ?? 0).toBeGreaterThan(0)
      }
    }
  })
})

describe('resolverCifras', () => {
  it('reproduce un Formulario 300 real (todos los totales cuadran)', () => {
    // Cifras de una declaración de IVA cuatrimestral real (declarado).
    const d = (v: number) => ({ declarado: v, libros: null })
    const r = resolverCifras('iva', {
      'iva-ing-19': d(122_149_000), // c28
      'iva-ing-no-gravadas': d(252_000), // c40
      'iva-ing-devoluciones': d(7_788_000), // c42
      'iva-comp-19': d(93_924_000), // c51 + c53
      'iva-comp-5': d(602_000), // c50
      'iva-comp-devoluciones': d(38_000), // c56
      'iva-gen-19': d(23_208_000), // c59
      'iva-gen-recuperado': d(7_000), // c66
      'iva-desc-compras': d(2_126_000), // c71 + c72
      'iva-desc-servicios': d(15_749_000), // c75
      'iva-desc-devoluciones': d(1_480_000), // c79
    })
    expect(r['iva-ing-brutos'].declarado).toBe(122_401_000) // c41
    expect(r['iva-ing-netos'].declarado).toBe(114_613_000) // c43
    expect(r['iva-comp-brutas'].declarado).toBe(94_526_000) // c55
    expect(r['iva-comp-netas'].declarado).toBe(94_488_000) // c57
    expect(r['iva-generado'].declarado).toBe(23_215_000) // c67
    expect(r['iva-descontable'].declarado).toBe(19_355_000) // c81
    expect(r['iva-saldo'].declarado).toBe(3_860_000) // c82
    expect(r['iva-saldo-impuesto'].declarado).toBe(3_860_000) // c86
    expect(r['iva-total'].declarado).toBe(3_860_000) // c88
  })

  it('el saldo a favor anterior y el rete-IVA restan del saldo a pagar por impuesto', () => {
    const r = resolverCifras('iva', {
      'iva-gen-19': { declarado: 200, libros: 200 },
      'iva-desc-servicios': { declarado: 50, libros: 50 },
      'iva-retenido': { declarado: 30, libros: 30 },
      'iva-saldo-favor-ant': { declarado: 20, libros: 20 },
    })
    expect(r['iva-saldo'].declarado).toBe(150) // 200 − 50
    expect(r['iva-saldo-impuesto'].declarado).toBe(100) // 150 − 20 − 30
  })

  it('el ajuste de descontables resta del total', () => {
    const r = resolverCifras('iva', {
      'iva-desc-compras': { declarado: 100, libros: 100 },
      'iva-desc-ajustes': { declarado: 10, libros: 10 },
    })
    expect(r['iva-descontable'].declarado).toBe(90)
  })

  it('devuelve null cuando ningún término está diligenciado', () => {
    const r = resolverCifras('iva', {})
    expect(r['iva-ing-brutos'].declarado).toBeNull()
    expect(r['iva-saldo'].libros).toBeNull()
  })

  it('resuelve fórmulas que dependen de otros totales (retefuente)', () => {
    const r = resolverCifras('retefuente', {
      'rf-pj-honorarios': { declarado: 100, libros: 100 },
      'rf-pn-compras': { declarado: 200, libros: 250 },
      'rf-reteiva': { declarado: 30, libros: 30 },
    })
    // Los subtotales por tipo de beneficiario no se mezclan.
    expect(r['rf-pj-total'].declarado).toBe(100)
    expect(r['rf-pn-total'].declarado).toBe(200)
    expect(r['rf-total-renta'].declarado).toBe(300)
    expect(r['rf-total'].declarado).toBe(330) // total-renta + total-iva
    expect(r['rf-total'].libros).toBe(380)
  })
})

describe('aplicarLecturaFormulario (Formulario 300 real)', () => {
  // Casillas tal como vienen en una declaración de IVA cuatrimestral real.
  const casillas: Record<string, number | null> = {
    '27': 0, '28': 122_149_000, '29': 0, '30': 0, '31': 0, '32': 0, '33': 0, '34': 0,
    '35': 0, '36': 0, '37': 0, '38': 0, '39': 0, '40': 252_000, '41': 122_401_000,
    '42': 7_788_000, '43': 114_613_000, '44': 0, '45': 0, '46': 0, '47': 0, '48': 0,
    '49': 0, '50': 602_000, '51': 11_033_000, '52': 0, '53': 82_891_000, '54': 0,
    '55': 94_526_000, '56': 38_000, '57': 94_488_000, '58': 0, '59': 23_208_000,
    '60': 0, '61': 0, '62': 0, '63': 0, '64': 0, '65': 0, '66': 7_000, '67': 23_215_000,
    '68': 0, '69': 0, '70': 0, '71': 30_000, '72': 2_096_000, '73': 0, '74': 0,
    '75': 15_749_000, '76': 0, '77': 17_875_000, '78': 0, '79': 1_480_000, '80': 0,
    '81': 19_355_000, '82': 3_860_000, '83': 0, '84': 0, '85': 0, '86': 3_860_000,
    '87': 0, '88': 3_860_000, '89': 0,
  }

  it('mapea y suma las casillas a los renglones correctos', () => {
    const r = aplicarLecturaFormulario('iva', casillas)!
    expect(r.renglones['iva-ing-19']).toBe(122_149_000) // c28
    expect(r.renglones['iva-comp-19']).toBe(93_924_000) // c45 + c51 + c53
    expect(r.renglones['iva-comp-5']).toBe(602_000) // c44 + c50 + c52
    expect(r.renglones['iva-desc-compras']).toBe(2_126_000) // c68–72
    expect(r.renglones['iva-desc-servicios']).toBe(15_749_000) // c74 + c75
    expect(r.renglones['iva-gen-recuperado']).toBe(7_000)
  })

  it('un formulario que cuadra no genera ninguna advertencia', () => {
    const r = aplicarLecturaFormulario('iva', casillas)!
    // La casilla 77 (subtotal interno) está en la lista de ignoradas.
    expect(r.advertencias).toEqual([])
  })

  it('detecta un total del formulario que no cuadra', () => {
    const r = aplicarLecturaFormulario('iva', { ...casillas, '81': 20_000_000 })!
    expect(r.advertencias.some((a) => a.includes('Total impuestos descontables'))).toBe(true)
  })

  it('devuelve null para impuestos sin mapeo de casillas', () => {
    expect(aplicarLecturaFormulario('reteica', {})).toBeNull()
  })

})

describe('LECTURA_FORMULARIO (todos los formularios)', () => {
  it('todas las casillas apuntan a renglones existentes del tipo correcto', () => {
    for (const [tipo, cfg] of Object.entries(LECTURA_FORMULARIO)) {
      const renglones = CIFRAS_CATALOGO[tipo as keyof typeof CIFRAS_CATALOGO].flatMap((s) => s.renglones)
      const digitables = new Set(renglones.filter((r) => r.tipo === 'digitable').map((r) => r.id))
      const calculados = new Set(renglones.filter((r) => r.tipo !== 'digitable').map((r) => r.id))
      for (const id of Object.keys(cfg!.digitables)) expect(digitables.has(id), `${tipo}: ${id}`).toBe(true)
      for (const v of cfg!.verificaciones) expect(calculados.has(v.id), `${tipo}: ${v.id}`).toBe(true)
    }
  })

  it('ninguna casilla se suma en dos renglones ni se ignora a la vez que se usa', () => {
    for (const [tipo, cfg] of Object.entries(LECTURA_FORMULARIO)) {
      // Una casilla en dos renglones se contaría dos veces en los totales.
      const usadas = Object.values(cfg!.digitables).flat()
      expect(new Set(usadas).size, `${tipo}: casilla repetida`).toBe(usadas.length)
      const verificadas = cfg!.verificaciones.flatMap((v) => v.casillas.map((c) => c.casilla))
      for (const c of cfg!.ignorar ?? []) {
        expect(usadas.includes(c) || verificadas.includes(c), `${tipo}: casilla ${c} ignorada y usada`).toBe(false)
      }
    }
  })
})

describe('matrices del catálogo de cifras', () => {
  it('cada celda apunta a un renglón de su sección y cada digitable está en una sola celda', () => {
    for (const tipo of TIPOS_IMPUESTO) {
      for (const s of CIFRAS_CATALOGO[tipo]) {
        if (!s.matriz) continue
        const ids = new Set(s.renglones.map((r) => r.id))
        const columnas = s.matriz.grupos.reduce((n, g) => n + g.columnas.length, 0)
        const celdas = s.matriz.filas.flatMap((f) => {
          expect(f.celdas, `${s.titulo}: ${f.label}`).toHaveLength(columnas)
          return f.celdas.filter((c): c is string => c !== null)
        })
        const totales = (s.matriz.total?.celdas ?? []).filter((c): c is string => c !== null)
        for (const id of [...celdas, ...totales]) expect(ids.has(id), `${s.titulo}: ${id}`).toBe(true)
        // Ningún renglón digitable queda fuera de la matriz ni aparece dos veces.
        const digitables = s.renglones.filter((r) => r.tipo === 'digitable').map((r) => r.id)
        expect([...celdas].sort()).toEqual([...digitables].sort())
      }
    }
  })
})

describe('Formulario 350 real (retención en la fuente)', () => {
  // Casillas de valor de una declaración mensual real (período 4 de 2026). Solo
  // cifras: sin NIT, razón social ni número de formulario.
  const casillas: Record<string, number | null> = {
    // Las 110 casillas de valor (29–138) en cero y encima las que traen valor.
    ...Object.fromEntries(Array.from({ length: 110 }, (_, i) => [String(29 + i), 0])),
    '29': 2_628_000, '42': 289_000, // honorarios, personas jurídicas
    '31': 426_000, '44': 17_000, // servicios, personas jurídicas
    '59': 16_067_000, '68': 177_000, // autorretención especial
    '77': 47_200_000, '93': 2_595_000, // rentas de trabajo
    '79': 1_000_000, '95': 110_000, // honorarios, personas naturales
    '81': 12_230_000, '97': 437_000, // servicios, personas naturales
    '83': 4_855_000, '99': 180_000, // arrendamientos, personas naturales
    '86': 5_800_000, '102': 203_000, // compras, personas naturales
    '130': 4_008_000, '131': 57_000, '134': 57_000, '136': 4_065_000, '138': 4_065_000,
    // Encabezado y pie que el modelo suele transcribir: no deben generar advertencias.
    '3': 4, '27': 5911, '28': 1.1, '980': 0,
  }

  it('todas las casillas de valor (29–138) están mapeadas o verificadas, una sola vez', () => {
    const cfg = LECTURA_FORMULARIO.retefuente!
    const usadas = [
      ...Object.values(cfg.digitables).flat(),
      ...cfg.verificaciones.flatMap((v) => v.casillas.map((c) => c.casilla)),
    ]
    const esperadas = Array.from({ length: 110 }, (_, i) => String(29 + i))
    expect([...usadas].sort()).toEqual([...esperadas].sort())
  })

  it('mantiene separadas las personas jurídicas y las naturales', () => {
    const { renglones } = aplicarLecturaFormulario('retefuente', casillas)!
    expect(renglones['rf-pj-honorarios-base']).toBe(2_628_000) // c29
    expect(renglones['rf-pj-honorarios']).toBe(289_000) // c42
    expect(renglones['rf-pn-honorarios-base']).toBe(1_000_000) // c79
    expect(renglones['rf-pn-honorarios']).toBe(110_000) // c95
    expect(renglones['rf-pj-servicios']).toBe(17_000) // c44
    expect(renglones['rf-pn-servicios']).toBe(437_000) // c97
    expect(renglones['rf-pn-trabajo-base']).toBe(47_200_000) // c77
    expect(renglones['rf-pn-trabajo']).toBe(2_595_000) // c93
    expect(renglones['rf-pn-arrendamientos']).toBe(180_000) // c99
    expect(renglones['rf-pn-compras']).toBe(203_000) // c102
    expect(renglones['rf-ar-pj-exonerados-base']).toBe(16_067_000) // c59
    expect(renglones['rf-ar-pj-exonerados']).toBe(177_000) // c68
    expect(renglones['rf-reteiva']).toBe(57_000) // c131
  })

  it('reproduce todos los totales del formulario', () => {
    const { renglones } = aplicarLecturaFormulario('retefuente', casillas)!
    const r = resolverCifras(
      'retefuente',
      Object.fromEntries(Object.entries(renglones).map(([id, v]) => [id, { declarado: v, libros: null }])),
    )
    expect(r['rf-pj-total'].declarado).toBe(306_000) // c42 + c44
    expect(r['rf-pn-total'].declarado).toBe(3_525_000) // c93 + c95 + c97 + c99 + c102
    expect(r['rf-ar-pj-total'].declarado).toBe(177_000) // c68
    expect(r['rf-total-renta'].declarado).toBe(4_008_000) // c130
    expect(r['rf-total-iva'].declarado).toBe(57_000) // c134
    expect(r['rf-total'].declarado).toBe(4_065_000) // c136
    expect(r['rf-total-sanciones'].declarado).toBe(4_065_000) // c138
  })

  it('un formulario que cuadra no genera advertencias (encabezado y pago total ignorados)', () => {
    // La 28 (tarifa 1,1) y la 27 (actividad 5911) advertirían si no se ignoraran.
    expect(aplicarLecturaFormulario('retefuente', casillas)!.advertencias).toEqual([])
  })

  it('detecta un total de renta que no cuadra', () => {
    const r = aplicarLecturaFormulario('retefuente', { ...casillas, '130': 4_100_000 })!
    expect(r.advertencias.some((a) => a.includes('Total retenciones renta'))).toBe(true)
  })
})

describe('nombreObligacion', () => {
  it('prefiere la etiqueta propia y cae al catálogo', () => {
    expect(nombreObligacion({ tipo: 'iva', nombre: null })).toBe('IVA')
    expect(nombreObligacion({ tipo: 'otro', nombre: 'Estampilla' })).toBe('Estampilla')
    expect(nombreObligacion({ tipo: 'iva', nombre: '  ' })).toBe('IVA')
  })
})

describe('encabezado del papel de trabajo', () => {
  it('el alcance identifica empresa, impuesto y período', () => {
    const texto = alcanceSugerido({
      obligacion: { tipo: 'iva', nombre: null, periodicidad: 'bimestral', anioFiscal: 2026 },
      periodo: 'B2',
      empresaNombre: 'Comercial ABC S.A.S.',
    })
    expect(texto).toContain('Comercial ABC S.A.S.')
    expect(texto).toContain('IVA')
    expect(texto).toContain('Bim. 2 (mar–abr)')
    expect(texto).toContain('2026')
    // Delimitar la responsabilidad es el punto del alcance.
    expect(texto).toContain('No constituye una auditoría tributaria integral')
  })

  it('los procedimientos sugeridos son el checklist del impuesto, numerado', () => {
    for (const tipo of TIPOS_IMPUESTO) {
      const texto = procedimientosSugeridos(tipo)
      const items = IMPUESTOS_CATALOGO[tipo].checklist
      expect(texto.split('\n')).toHaveLength(items.length)
      for (const item of items) expect(texto).toContain(item.texto)
      expect(texto.startsWith('1. ')).toBe(true)
    }
  })
})

describe('hallazgoTributarioPendiente', () => {
  it('en trámite sigue pendiente: solo lo resuelto deja de bloquear la firma', () => {
    expect(hallazgoTributarioPendiente({ estado: 'abierto' })).toBe(true)
    expect(hallazgoTributarioPendiente({ estado: 'en_tramite' })).toBe(true)
    expect(hallazgoTributarioPendiente({ estado: 'resuelto' })).toBe(false)
  })
})

describe('presentacionExtemporanea', () => {
  it('solo es extemporánea si se presentó después del día de vencimiento', () => {
    const vence = '2026-03-16'
    expect(presentacionExtemporanea({ fechaVencimiento: vence, fechaPresentacion: '2026-03-15' })).toBe(false)
    // El mismo día del vencimiento está en plazo.
    expect(presentacionExtemporanea({ fechaVencimiento: vence, fechaPresentacion: '2026-03-16' })).toBe(false)
    expect(presentacionExtemporanea({ fechaVencimiento: vence, fechaPresentacion: '2026-03-17' })).toBe(true)
    // Cambio de mes: la comparación como texto sigue siendo cronológica.
    expect(presentacionExtemporanea({ fechaVencimiento: '2026-09-30', fechaPresentacion: '2026-10-01' })).toBe(true)
  })

  it('sin alguna de las dos fechas no se puede afirmar que fue extemporánea', () => {
    expect(presentacionExtemporanea({ fechaVencimiento: null, fechaPresentacion: '2026-03-17' })).toBe(false)
    expect(presentacionExtemporanea({ fechaVencimiento: '2026-03-16', fechaPresentacion: null })).toBe(false)
  })
})
