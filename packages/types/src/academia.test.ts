import { describe, expect, it } from 'vitest'
import {
  LECCIONES_CURSO, MODULOS_CURSO, PROGRESO_VACIO, avanceCurso, checkpointAprobado, estadoBloqueo, leccionPorId, siguientePaso,
  type Leccion, type ProgresoAcademia,
} from './academia'
import { EXPEDIENTE_CASO } from './academia-caso'
import {
  EJERCICIOS_CASO, evaluarCalculo, evaluarDocumento, leerNumero, llenarPlantilla, normalizarRespuesta,
} from './academia-ejercicios'

/** Progreso con las lecciones dadas completas (leídas + práctica o ejercicio hechos). */
function completas(lecciones: Leccion[], repasos: ProgresoAcademia['repasos'] = {}): ProgresoAcademia {
  return {
    leidas: lecciones.map((l) => l.id),
    practicadas: lecciones.filter((l) => l.practica).map((l) => l.id),
    ejercicios: lecciones.filter((l) => l.ejercicio).map((l) => l.id),
    repasos,
  }
}

describe('catálogo de la Academia', () => {
  it('las lecciones tienen ids únicos con el número de su fase', () => {
    const ids = LECCIONES_CURSO.map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const m of MODULOS_CURSO) {
      for (const l of m.lecciones) expect(l.id.startsWith(`${m.numero}.`)).toBe(true)
    }
  })

  it('cada fase (salvo la inducción) cierra con un checkpoint completo de cinco preguntas', () => {
    for (const m of MODULOS_CURSO) {
      if (m.id === 'induccion') {
        expect(m.checkpoint).toBeUndefined()
        continue
      }
      const cp = m.checkpoint!
      expect(cp, m.id).toBeDefined()
      expect(cp.aprendido.length, m.id).toBeGreaterThanOrEqual(4)
      expect(cp.caso.hitos.length, m.id).toBeGreaterThanOrEqual(3)
      expect(cp.caso.cifras.length, m.id).toBeGreaterThan(0)
      expect(cp.preguntas, m.id).toHaveLength(5)
      for (const p of cp.preguntas) expect(p.opciones[p.correcta], p.pregunta).toBeDefined()
    }
  })

  it('el checkpoint se aprueba con 4 de 5', () => {
    expect(checkpointAprobado({ aciertos: 3, total: 5 })).toBe(false)
    expect(checkpointAprobado({ aciertos: 4, total: 5 })).toBe(true)
    expect(checkpointAprobado(undefined)).toBe(false)
  })

  it('el playground está en la carta de encargo, la planeación y el informe', () => {
    const conPractica = LECCIONES_CURSO.filter((l) => l.practica).map((l) => l.id)
    expect(conPractica).toEqual(['1.7', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7', '2.8', '4.1', '4.5'])
  })

  it('toda lección con ficha técnica abre con su porqué y su objetivo', () => {
    for (const l of LECCIONES_CURSO.filter((x) => !x.narrativa)) {
      expect(l.porQue?.length ?? 0, l.id).toBeGreaterThan(120)
      expect(l.objetivo, l.id).toBeTruthy()
    }
  })

  it('toda lección tiene su parte práctica: playground o ejercicio del caso', () => {
    for (const l of LECCIONES_CURSO) expect(!!l.practica !== !!l.ejercicio, l.id).toBe(true)
  })

  it('calcula el avance del curso', () => {
    expect(avanceCurso(PROGRESO_VACIO).pct).toBe(0)
    const todo = completas(LECCIONES_CURSO, Object.fromEntries(MODULOS_CURSO.map((m) => [m.id, { aciertos: 5, total: 5 }])))
    expect(avanceCurso(todo).pct).toBe(100)
  })

  it('encuentra una lección con su fase', () => {
    expect(leccionPorId('2.5')?.modulo.id).toBe('planeacion')
    expect(leccionPorId('0.2')?.modulo.id).toBe('induccion')
    expect(leccionPorId('9.9')).toBeNull()
  })
})

describe('desbloqueo de lecciones', () => {
  const fase = (id: string) => MODULOS_CURSO.find((m) => m.id === id)!.lecciones

  it('arranca con solo la clase 0 abierta', () => {
    expect(estadoBloqueo('0.1', PROGRESO_VACIO).desbloqueada).toBe(true)
    expect(estadoBloqueo('0.2', PROGRESO_VACIO)).toMatchObject({ desbloqueada: false, motivo: 'leccion' })
    expect(siguientePaso(PROGRESO_VACIO)).toMatchObject({ tipo: 'leccion', leccion: { id: '0.1' } })
  })

  it('leer no basta: hay que resolver el ejercicio', () => {
    expect(estadoBloqueo('0.2', { ...PROGRESO_VACIO, leidas: ['0.1'] }).desbloqueada).toBe(false)
    expect(estadoBloqueo('0.2', { ...PROGRESO_VACIO, leidas: ['0.1'], ejercicios: ['0.1'] }).desbloqueada).toBe(true)
  })

  it('la clase 0 no tiene checkpoint: al completarla se abre la Fase 1', () => {
    expect(estadoBloqueo('1.1', completas(fase('induccion'))).desbloqueada).toBe(true)
  })

  it('una lección con playground exige practicarla para abrir la siguiente', () => {
    const hasta22 = completas(LECCIONES_CURSO.slice(0, LECCIONES_CURSO.findIndex((l) => l.id === '2.2')), { aceptacion: { aciertos: 5, total: 5 } })
    const leida22 = { ...hasta22, leidas: [...hasta22.leidas, '2.2'] }
    expect(estadoBloqueo('2.3', leida22).desbloqueada).toBe(false)
    expect(estadoBloqueo('2.3', { ...leida22, practicadas: [...leida22.practicadas, '2.2'] }).desbloqueada).toBe(true)
  })

  it('la primera lección de una fase exige el checkpoint de la anterior', () => {
    const hechoF1 = completas([...fase('induccion'), ...fase('aceptacion')])
    expect(estadoBloqueo('2.1', hechoF1)).toMatchObject({ desbloqueada: false, motivo: 'checkpoint' })
    expect(siguientePaso(hechoF1)).toMatchObject({ tipo: 'checkpoint', modulo: { id: 'aceptacion' } })
    expect(estadoBloqueo('2.1', { ...hechoF1, repasos: { aceptacion: { aciertos: 3, total: 5 } } }).desbloqueada).toBe(false)
    const aprobado = { ...hechoF1, repasos: { aceptacion: { aciertos: 4, total: 5 } } }
    expect(estadoBloqueo('2.1', aprobado).desbloqueada).toBe(true)
    expect(siguientePaso(aprobado)).toMatchObject({ tipo: 'leccion', leccion: { id: '2.1' } })
  })

  it('no hay siguiente paso con todo el curso hecho', () => {
    const todo = completas(LECCIONES_CURSO, Object.fromEntries(MODULOS_CURSO.map((m) => [m.id, { aciertos: 5, total: 5 }])))
    expect(siguientePaso(todo)).toBeNull()
  })
})

describe('ejercicios del caso', () => {
  const idsExpediente = new Set([...EXPEDIENTE_CASO.map((d) => d.id), 'balance'])

  it('están bien construidos', () => {
    for (const [id, e] of Object.entries(EJERCICIOS_CASO)) {
      for (const ref of e.expediente ?? []) expect(idsExpediente.has(ref), `${id} cita ${ref}`).toBe(true)
      if (e.tipo === 'decision') {
        expect(e.opciones.filter((o) => o.correcta).length, id).toBe(1)
      } else if (e.tipo === 'clasificar') {
        for (const it of e.items) expect(e.categorias, `${id}/${it.id}`).toContain(it.correcta)
      } else if (e.tipo === 'documento') {
        const campos = new Set(e.documento.campos.map((c) => c.id))
        const usados = new Set(e.documento.secciones.flatMap((s) => [...s.texto.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1])))
        for (const u of usados) expect(campos.has(u), `${id} usa {{${u}}}`).toBe(true)
        for (const c of campos) expect(usados.has(c), `${id} no usa ${c}`).toBe(true)
        for (const c of e.documento.campos.filter((x) => x.tipo === 'opcion')) {
          // La opción correcta debe existir entre las opciones.
          expect(c.opciones!.some((o) => c.esperado!.some((x) => normalizarRespuesta(o).includes(normalizarRespuesta(x)))), `${id}/${c.id}`).toBe(true)
        }
      } else {
        for (const it of e.items) expect(evaluarCalculo(it, String(it.respuesta)), `${id}/${it.id}`).toBe(true)
        if (e.total) expect(e.items.reduce((acc, it) => acc + it.respuesta, 0), `${id} total`).toBe(e.total.valor)
      }
    }
  })

  it('normaliza respuestas y números como los escribe un usuario', () => {
    expect(normalizarRespuesta('$25.000.000')).toBe('25000000')
    expect(normalizarRespuesta('Héctor Salazar')).toBe('hectorsalazar')
    expect(leerNumero('10,5')).toBe(10.5)
    expect(leerNumero('13.3')).toBe(13.3)
    expect(leerNumero('1.000')).toBe(1000)
    expect(leerNumero('-95')).toBe(-95)
    expect(leerNumero('abc')).toBeNull()
  })

  it('evalúa un documento contra el expediente', () => {
    const e = EJERCICIOS_CASO['3.3']
    if (e.tipo !== 'documento') throw new Error('3.3 debe ser documento')
    const valores = {
      tercero: 'Comercial Andina S.A.S.', nit: '900.111.222', saldo: '25.000.000', fecha: '31 de diciembre de 2026',
      respuesta: 'A la gerencia de la Comercializadora, que la reenvía al auditor.',
    }
    const errores = evaluarDocumento(e.documento.campos, valores)
    expect(errores.tercero).toBeNull()
    expect(errores.respuesta).not.toBeNull()
    expect(llenarPlantilla('Saldo ${{saldo}} de {{x}}', valores)).toBe('Saldo $25.000.000 de ______')
  })

  it('acepta los cálculos con tolerancia', () => {
    const e = EJERCICIOS_CASO['3.2']
    if (e.tipo !== 'calculo') throw new Error('3.2 debe ser cálculo')
    expect(evaluarCalculo(e.items[0], '700')).toBe(true)
    expect(evaluarCalculo(e.items[0], '595')).toBe(false)
  })
})

/**
 * Pistas que delatan la respuesta sin saber el tema: la correcta siempre la más larga o siempre en
 * la misma posición. Con las opciones así, el quiz se aprueba sin estudiar.
 */
describe('las preguntas no se adivinan por la forma', () => {
  type Pregunta = { id: string; opciones: string[]; correcta: number }
  const quiz: Pregunta[] = MODULOS_CURSO.flatMap((m) =>
    (m.checkpoint?.preguntas ?? []).map((p, i) => ({ id: `${m.id}#${i + 1}`, opciones: p.opciones, correcta: p.correcta })),
  )
  const decisiones: Pregunta[] = Object.entries(EJERCICIOS_CASO).flatMap(([id, e]) =>
    e.tipo === 'decision' ? [{ id, opciones: e.opciones.map((o) => o.texto), correcta: e.opciones.findIndex((o) => o.correcta) }] : [],
  )

  /** La correcta es la más larga por un margen que se nota (más de 15 % sobre la siguiente). */
  const delataLargo = (p: Pregunta) => {
    const largo = p.opciones[p.correcta].length
    const otras = p.opciones.filter((_, i) => i !== p.correcta).map((o) => o.length)
    return largo > Math.max(...otras) * 1.15
  }

  for (const [nombre, preguntas] of [['quiz de los checkpoints', quiz], ['ejercicios de decisión', decisiones]] as const) {
    it(`${nombre}: la correcta casi nunca es la más larga`, () => {
      const delatadas = preguntas.filter(delataLargo).map((p) => p.id)
      expect(delatadas.length / preguntas.length, `delatadas por el largo: ${delatadas.join(', ')}`).toBeLessThanOrEqual(0.2)
    })

    it(`${nombre}: la correcta aparece en todas las posiciones`, () => {
      const posiciones = new Set(preguntas.map((p) => p.correcta))
      expect([...posiciones].sort()).toEqual([0, 1, 2])
      for (const pos of [0, 1, 2]) {
        const veces = preguntas.filter((p) => p.correcta === pos).length
        expect(veces / preguntas.length, `posición ${pos + 1}`).toBeLessThanOrEqual(0.5)
      }
    })
  }
})
