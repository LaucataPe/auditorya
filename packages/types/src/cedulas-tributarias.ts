/**
 * Cédulas de la revisión tributaria agéntica (NIA 230): el análisis del agente
 * abierto procedimiento por procedimiento. Cada cédula dice qué se verificó,
 * contra qué criterio, con qué fuente, y muestra TODO lo comparado (lo que
 * cuadró y lo que no), no solo las excepciones. El agente prepara; la
 * conclusión de cada cédula la escribe y la firma el auditor.
 *
 * Las cédulas viajan en el resultado de la corrida (corridas_agente.resultado)
 * y las conclusiones en revisiones_tributarias.conclusiones_cedulas.
 */

export type FaseCedula = 'formulario' | 'libros' | 'cruce' | 'dian' | 'detalle' | 'analitica' | 'oportunidad'

export const FASE_CEDULA_LABEL: Record<FaseCedula, string> = {
  formulario: 'El borrador por sí solo',
  libros: 'Los libros por sí solos',
  cruce: 'Cruce de libros contra el formulario',
  dian: 'Cruce con la facturación electrónica',
  detalle: 'Prueba de detalle',
  analitica: 'Pruebas analíticas',
  oportunidad: 'Oportunidad',
}
export const ORDEN_FASES_CEDULA: FaseCedula[] = ['formulario', 'libros', 'cruce', 'dian', 'detalle', 'analitica', 'oportunidad']

/** Resultado de cada partida comparada. */
export type EstadoFilaCedula = 'conforme' | 'diferencia' | 'por_confirmar' | 'informativo' | 'no_verificable'

export const ESTADO_FILA_LABEL: Record<EstadoFilaCedula, string> = {
  conforme: 'Conforme',
  diferencia: 'Diferencia',
  por_confirmar: 'Por confirmar',
  informativo: 'Informativo',
  no_verificable: 'No verificable',
}

export type FormatoColumnaCedula = 'texto' | 'moneda' | 'porcentaje' | 'numero'
export type ColumnaCedula = { clave: string; titulo: string; formato: FormatoColumnaCedula }

export type FilaCedula = {
  valores: Record<string, string | number | null>
  estado: EstadoFilaCedula
  /** Por qué quedó en ese estado, cuando no es evidente por las cifras. */
  nota?: string | null
  regla?: string | null
  /** Código de la propuesta (H-01, J-02…) que salió de esta fila. */
  propuesta?: string | null
}

export type TablaCedula = {
  id: string
  titulo: string
  descripcion?: string
  columnas: ColumnaCedula[]
  filas: FilaCedula[]
  /** Filas que no se guardaron por tamaño (la población completa está en el archivo fuente). */
  omitidas?: number
}

export type ResultadoCedula = { filas: number; conformes: number; diferencias: number; porConfirmar: number; noVerificables: number }

export type CedulaProcedimiento = {
  id: string
  /** Paso del programa al que corresponde; null para la lectura de libros (no es un paso que se pueda desactivar). */
  pasoId: string | null
  fase: FaseCedula
  titulo: string
  objetivo: string
  /** Norma y tolerancia con las que se juzga cada partida. */
  criterio: string
  fuentes: string[]
  reglas: string[]
  checklistItem: string | null
  /** ejecutada: corrió con datos; sin_insumos: faltó el documento; omitida: el auditor desactivó el paso. */
  estado: 'ejecutada' | 'sin_insumos' | 'omitida'
  motivo?: string | null
  tablas: TablaCedula[]
  limitaciones: string[]
  resultado: ResultadoCedula
  /** Códigos de las propuestas que nacieron en esta cédula. */
  propuestas: string[]
  /** Borrador de conclusión: el auditor lo usa, lo edita o lo descarta. */
  conclusionSugerida: string
  /** Huella del contenido: si cambia tras un análisis nuevo, la conclusión debe reconfirmarse. */
  huella: string
}

export const RESULTADOS_CONCLUSION_CEDULA = ['satisfactorio', 'con_excepciones', 'no_concluyente'] as const
export type ResultadoConclusionCedula = (typeof RESULTADOS_CONCLUSION_CEDULA)[number]

export const RESULTADO_CONCLUSION_LABEL: Record<ResultadoConclusionCedula, string> = {
  satisfactorio: 'Satisfactorio',
  con_excepciones: 'Con excepciones',
  no_concluyente: 'No concluyente',
}

export type ConclusionCedula = {
  texto: string
  resultado: ResultadoConclusionCedula
  /** Huella de la cédula sobre la que se concluyó. */
  huella: string
  corridaId: string
  porId: string
  porNombre: string | null
  at: string
}

/** Clave = id de la cédula. */
export type ConclusionesCedulas = Record<string, ConclusionCedula>

export type EstadoConclusionCedula = 'sin_concluir' | 'vigente' | 'por_reconfirmar'

/** ¿La cédula tiene conclusión, y sigue siendo sobre el mismo contenido? */
export function estadoConclusionCedula(cedula: Pick<CedulaProcedimiento, 'id' | 'huella'>, conclusiones: ConclusionesCedulas | null | undefined): EstadoConclusionCedula {
  const c = conclusiones?.[cedula.id]
  if (!c || !c.texto.trim()) return 'sin_concluir'
  return c.huella === cedula.huella ? 'vigente' : 'por_reconfirmar'
}

/** Cédulas ejecutadas que aún necesitan la conclusión del auditor (lo que impide firmar). */
export function cedulasSinConcluir(cedulas: CedulaProcedimiento[] | null | undefined, conclusiones: ConclusionesCedulas | null | undefined): CedulaProcedimiento[] {
  return (cedulas ?? []).filter((c) => c.estado === 'ejecutada' && estadoConclusionCedula(c, conclusiones) !== 'vigente')
}

/** FNV-1a de 32 bits en hexadecimal: huella estable y barata del contenido de una cédula. */
export function huellaTexto(texto: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

// ─── Construcción (la usan los motores) ──────────────────────────────────────

export type CedulaBorrador = Omit<CedulaProcedimiento, 'resultado' | 'conclusionSugerida' | 'huella' | 'propuestas'>

export function nuevaCedula(def: Omit<CedulaBorrador, 'tablas' | 'limitaciones' | 'estado' | 'fuentes'> & { fuentes?: string[] }): CedulaBorrador {
  return { ...def, fuentes: def.fuentes ?? [], estado: 'ejecutada', motivo: null, tablas: [], limitaciones: [] }
}

/** Devuelve la tabla de la cédula, creándola la primera vez. */
export function tablaDeCedula(cedula: CedulaBorrador, id: string, titulo: string, columnas: ColumnaCedula[], descripcion?: string): TablaCedula {
  let t = cedula.tablas.find((x) => x.id === id)
  if (!t) {
    t = { id, titulo, columnas, filas: [], ...(descripcion ? { descripcion } : {}) }
    cedula.tablas.push(t)
  }
  return t
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** Cierra la cédula: cuenta resultados, redacta la conclusión sugerida y calcula la huella. */
export function cerrarCedula(borrador: CedulaBorrador): CedulaProcedimiento {
  const tablas = borrador.estado === 'ejecutada' ? borrador.tablas.filter((t) => t.filas.length > 0) : []
  const filas = tablas.flatMap((t) => t.filas)
  const cuenta = (e: EstadoFilaCedula) => filas.filter((f) => f.estado === e).length
  const resultado: ResultadoCedula = {
    filas: filas.length, conformes: cuenta('conforme'), diferencias: cuenta('diferencia'), porConfirmar: cuenta('por_confirmar'), noVerificables: cuenta('no_verificable'),
  }
  const propuestas = [...new Set(filas.map((f) => f.propuesta).filter((p): p is string => !!p))]
  // Sin partidas que comparar no hubo procedimiento, aunque el paso estuviera activo.
  const estado = borrador.estado === 'ejecutada' && filas.length === 0 ? 'sin_insumos' : borrador.estado
  const motivo = estado === 'sin_insumos' && !borrador.motivo ? 'No hubo partidas que comparar con los documentos disponibles.' : borrador.motivo ?? null

  let conclusionSugerida = ''
  if (estado === 'ejecutada') {
    const verificadas = resultado.conformes + resultado.diferencias + resultado.porConfirmar
    const partes = [`Se ejecutó el procedimiento sobre ${plural(verificadas || resultado.filas, 'partida', 'partidas')}${borrador.fuentes.length ? `, con base en ${borrador.fuentes.join('; ')}` : ''}.`]
    if (resultado.diferencias === 0 && resultado.porConfirmar === 0) {
      partes.push('No se identificaron diferencias por encima de la tolerancia definida.')
    } else {
      const hallado = [
        resultado.diferencias ? plural(resultado.diferencias, 'diferencia', 'diferencias') : null,
        resultado.porConfirmar ? plural(resultado.porConfirmar, 'punto por confirmar', 'puntos por confirmar') : null,
      ].filter(Boolean).join(' y ')
      partes.push(`Se ${resultado.diferencias + resultado.porConfirmar === 1 ? 'identificó' : 'identificaron'} ${hallado}${propuestas.length ? ` (${propuestas.join(', ')})` : ''}.`)
    }
    if (resultado.noVerificables) partes.push(`${plural(resultado.noVerificables, 'partida no se pudo', 'partidas no se pudieron')} verificar con los documentos disponibles.`)
    if (borrador.limitaciones.length) partes.push(`Limitaciones: ${borrador.limitaciones.join(' ')}`)
    conclusionSugerida = partes.join(' ')
  }

  const huella = huellaTexto(JSON.stringify([estado, tablas.map((t) => [t.id, t.omitidas ?? 0, t.filas.map((f) => [f.estado, f.valores])])]))
  return { ...borrador, estado, motivo, tablas, resultado, propuestas, conclusionSugerida, huella }
}

/** Texto de una celda según el formato de su columna (interfaz y exportación usan el mismo). */
export function formatoCeldaCedula(valor: string | number | null | undefined, formato: FormatoColumnaCedula): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  if (typeof valor === 'string') return valor
  if (formato === 'moneda') return `${valor < 0 ? '-' : ''}$${Math.round(Math.abs(valor)).toLocaleString('es-CO')}`
  if (formato === 'porcentaje') return `${(Math.round(valor * 100) / 100).toLocaleString('es-CO')} %`
  return valor.toLocaleString('es-CO')
}
