/**
 * Procedimiento IC · Revisión agéntica de la declaración de ICA (Formulario
 * Único Nacional) de un municipio — lógica PURA y determinista (0 tokens). Mismo
 * modelo que IVA, retención en la fuente y reteICA: propuestas con bitácora y
 * una cédula por procedimiento con todo lo comparado; la conclusión es del
 * auditor. Spec: docs/agente/procedimiento-ica-v1.md.
 *
 * Insumos: el borrador (renglones 8 a 38 y la discriminación de actividades),
 * los libros del período (clase 4, 135518, 2412 y gasto; agente-ica-libros) y la
 * revisión del período anterior. PENDIENTE DE VALIDAR: tarifas del ICA de
 * Bogotá, rango sin tabla del municipio y el tratamiento de las devoluciones de
 * exportaciones.
 */
import { CIFRAS_CATALOGO, ACTIVIDADES_ICA, idActividadIca, resolverCifras, type CifrasRevision, type Periodicidad, type ProgramaRevision } from './tributario'
import type { CertezaPropuesta, ContenidoPropuesta, DatoPropuesta, LineaBitacora, SeveridadPropuesta, TipoPropuesta } from './agente'
import { huellaPropuesta, type PropuestaBorrador } from './agente-balance'
import { severidadPorProporcion, UMBRALES_IVA, type PasoAgenteIva, type ResultadoCorridaIva } from './agente-iva'
import { CLASE_CUENTA_ICA_LABEL, OPCIONES_CUENTA_ICA, type ClaseCuentaIca, type CuentaIca, type MapeoLibrosIca } from './agente-ica-libros'
import { municipioPorClave, nombreMunicipio, normalizarMunicipio } from './municipios'
import { cerrarCedula, nuevaCedula, tablaDeCedula, type CedulaBorrador, type ColumnaCedula, type EstadoFilaCedula, type FilaCedula } from './cedulas-tributarias'

type LineaBorrador = Omit<LineaBitacora, 'numero' | 'actor'> & { actor?: 'agente' }

export type EntradaCorridaIca = {
  periodo: { desde: string; hasta: string; etiqueta: string; periodicidad: Periodicidad; anio: number }
  cifras: CifrasRevision
  libros?: MapeoLibrosIca | null
  /** Municipio de la declaración (campo de la obligación); los libros lo traen también. */
  municipio?: string | null
  /** Municipios (claves) con obligación de ICA de la empresa en la vigencia, para la territorialidad. */
  municipiosConObligacion?: string[] | null
  anterior?: { etiqueta: string; cifras: CifrasRevision } | null
  fuentes?: { nombre: string; archivo: string; registros: number; cuentas: number }[]
  fechaVencimiento?: string | null
  fechaPresentacion?: string | null
  numeracion?: { H?: number; J?: number; A?: number; D?: number }
  huellasDecididas?: string[]
  omitirReglas?: string[]
}

export const UMBRALES_ICA = {
  redondeo: UMBRALES_IVA.redondeoPorComponente,
  toleranciaMinima: UMBRALES_IVA.toleranciaMinima,
  /** Avisos y tableros: 15 % del renglón 20. */
  avisosPct: 15,
  /** Tarifas por mil del ICA cuando el municipio no tiene tabla (Ley 14 de 1983 y tarifas especiales). */
  rangoSinTabla: [2, 14] as [number, number],
  toleranciaTarifa: 0.05,
  variacionPct: 50,
  /** Cuentas no operacionales que se preguntan como no sujetas: las que pesan al menos esto del renglón 14. */
  noSujetoMinPct: 5,
  maxAmbiguedades: 8,
  maxFilas: 300,
} as const

export const PROGRAMA_AGENTE_ICA: PasoAgenteIva[] = [
  { id: 'formulario', texto: 'Verificar la coherencia del formulario: actividades, tarifas, avisos y sobretasas', detalle: 'Totales recalculados; ingresos e impuesto por actividad contra los renglones 16 y 17; tarifa por mil de cada actividad contra las del municipio; avisos y tableros al 15 %; sobretasas.', reglas: ['IC-01', 'IC-02', 'IC-03', 'IC-04', 'IC-05', 'IC-06'], insumos: ['borrador'], checklistItem: 'actividad-tarifa' },
  { id: 'ingresos-libros', texto: 'Conciliar los ingresos y las deducciones declarados contra la contabilidad', detalle: 'Ingresos brutos (8), fuera del municipio (9), devoluciones (11), exportaciones (12) y venta de activos fijos (13) contra la clase 4 del período; base gravable que resulta de los libros.', reglas: ['IC-10', 'IC-11', 'IC-12', 'IC-13', 'IC-14'], insumos: ['borrador', 'auxiliar'], checklistItem: 'ingresos-municipio' },
  { id: 'deducciones', texto: 'Revisar los ingresos restados como no sujetos, excluidos o exentos', detalle: 'Renglones 14 y 15: qué cuentas los explican (la firma las clasifica una vez y queda en la memoria) y su soporte normativo.', reglas: ['IC-09', 'IC-15', 'IC-16'], insumos: ['borrador', 'auxiliar'], checklistItem: 'deducciones' },
  { id: 'territorialidad', texto: 'Revisar la distribución territorial de los ingresos', detalle: 'Ingresos de otros municipios en los libros y si la empresa tiene la declaración de ICA de cada uno en la plataforma.', reglas: ['IC-20'], insumos: ['borrador', 'auxiliar'], checklistItem: 'ingresos-municipio' },
  { id: 'retenciones', texto: 'Cruzar retenciones, anticipos, saldo a favor e impuesto causado', detalle: 'Retenciones (27) y autorretenciones (28) contra la 135518; anticipos (29, 30); saldo a favor anterior (32) contra la declaración anterior; impuesto a cargo contra la causación en 2412.', reglas: ['IC-21', 'IC-22', 'IC-23', 'IC-24', 'IC-25'], insumos: ['borrador', 'auxiliar', 'anterior'], checklistItem: 'retenciones-anticipos' },
  { id: 'periodo-anterior', texto: 'Comparar con la declaración del período anterior', detalle: 'Variación de la base gravable y del impuesto a cargo frente al período anterior.', reglas: ['IC-30'], insumos: ['borrador', 'anterior'], checklistItem: null },
  { id: 'oportunidad', texto: 'Confirmar presentación, sanciones y pago', detalle: 'Fecha de presentación contra el vencimiento del calendario municipal; sanciones liquidadas; pago del total.', reglas: ['IC-40', 'IC-41'], insumos: ['borrador'], checklistItem: 'presentacion-pago' },
]

export function programaSugeridoIca(): ProgramaRevision {
  return { pasos: PROGRAMA_AGENTE_ICA.map((p) => ({ id: p.id, texto: p.texto, origen: 'agente' as const, activo: true })) }
}

export function reglasOmitidasIca(programa: ProgramaRevision | null): string[] {
  if (!programa) return []
  const inactivos = new Set(programa.pasos.filter((p) => p.origen === 'agente' && !p.activo).map((p) => p.id))
  return PROGRAMA_AGENTE_ICA.filter((p) => inactivos.has(p.id)).flatMap((p) => p.reglas)
}

/** Tarifas por mil del ICA admisibles del municipio; null si la plataforma no las tiene. */
export function tarifasIcaDe(municipio: string | null | undefined): number[] | null {
  const m = municipioPorClave(municipio)
  return m ? m.tarifasIca ?? m.tarifas : null
}

const fmt = (n: number) => `$${Math.round(Math.abs(n)).toLocaleString('es-CO')}`
const porMil = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString('es-CO')} ‰`
const pct = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString('es-CO')} %`
const tol = (componentes = 1) => Math.max(UMBRALES_ICA.toleranciaMinima, componentes * UMBRALES_ICA.redondeo)
const ETIQUETA = new Map(CIFRAS_CATALOGO.ica.flatMap((s) => s.renglones).map((r) => [r.id, r.label]))
const DIGITABLES = CIFRAS_CATALOGO.ica.flatMap((s) => s.renglones).filter((r) => r.tipo === 'digitable').map((r) => r.id)
const RENGLON: Record<string, string> = {
  'ica-ingresos': '8', 'ica-fuera-municipio': '9', 'ica-ingresos-municipio': '10', 'ica-devoluciones': '11', 'ica-exportaciones': '12', 'ica-activos-fijos': '13',
  'ica-no-sujetos': '14', 'ica-exentos': '15', 'ica-base': '16', 'ica-impuesto': '17', 'ica-total-ica': '20', 'ica-avisos': '21', 'ica-bomberil': '23', 'ica-seguridad': '24',
  'ica-impuesto-cargo': '25', 'ica-exencion': '26', 'ica-retenciones': '27', 'ica-autorretenciones': '28', 'ica-anticipo-ant': '29', 'ica-anticipo-sig': '30', 'ica-sanciones': '31',
  'ica-saldo-favor-ant': '32', 'ica-saldo': '33/34', 'ica-total-pagar': '38',
}
const conRenglon = (id: string) => `${RENGLON[id] ? `${RENGLON[id]} · ` : ''}${ETIQUETA.get(id) ?? id}`

export function correrRevisionIca(entrada: EntradaCorridaIca): ResultadoCorridaIva {
  const bit: LineaBorrador[] = []
  const propuestas: PropuestaBorrador[] = []
  const limitaciones: { regla: string; motivo: string }[] = []
  const reglas = new Set<string>()
  const huellas = new Set(entrada.huellasDecididas ?? [])
  const omitidas = new Set(entrada.omitirReglas ?? [])
  const num = { H: entrada.numeracion?.H ?? 0, J: entrada.numeracion?.J ?? 0, A: entrada.numeracion?.A ?? 0, D: entrada.numeracion?.D ?? 0 }
  const itemsConDatos = new Set<string>()
  const itemsConPropuesta = new Set<string>()
  let orden = 0
  let propuestasOmitidas = 0
  type Prop = { codigo: string | null; nota: string | null }

  const regla = (id: string, texto: string) => { reglas.add(id); bit.push({ tipo: 'regla', texto, referencia: { regla: id } }) }
  const proponer = (p: {
    tipo: TipoPropuesta; reglasIds: string[]; titulo: string; renglonId: string | null; monto: number | null; severidad: SeveridadPropuesta | null
    certeza: CertezaPropuesta; datos: DatoPropuesta[]; contenido: ContenidoPropuesta; checklistItem: string | null; cuenta?: string | null; bitacora: LineaBorrador[]; cedula: string
  }): Prop => {
    if (p.reglasIds.some((r) => omitidas.has(r))) { propuestasOmitidas++; if (p.checklistItem) itemsConPropuesta.add(p.checklistItem); return { codigo: null, nota: 'Paso desactivado en el programa: no se propone.' } }
    const ancla = p.renglonId ?? p.cuenta ?? p.checklistItem
    if (huellas.has(huellaPropuesta({ tipo: p.tipo, reglas: p.reglasIds, cuentaCodigo: ancla }))) {
      bit.push({ tipo: 'regla', texto: `${p.reglasIds.join(', ')}: ya decidido por una persona en una corrida anterior (${ancla ?? p.titulo}); no se vuelve a proponer.`, referencia: { regla: p.reglasIds[0] } })
      if (p.checklistItem) itemsConPropuesta.add(p.checklistItem)
      return { codigo: null, nota: 'Ya decidido por una persona en un análisis anterior.' }
    }
    const prefijo = p.tipo === 'hallazgo' ? 'H' : p.tipo === 'ambiguedad' ? 'A' : p.tipo === 'documento' ? 'D' : 'J'
    num[prefijo]++
    const codigo = `${prefijo}-${String(num[prefijo]).padStart(2, '0')}`
    if (p.checklistItem) itemsConPropuesta.add(p.checklistItem)
    propuestas.push({
      clave: codigo, paso: 'cifras', tipo: p.tipo, codigo, titulo: p.titulo, cuentaCodigo: ancla, monto: p.monto === null ? null : Math.round(p.monto),
      severidad: p.severidad, certeza: p.certeza, reglas: p.reglasIds, datos: p.datos,
      contenido: { ...p.contenido, tributario: { renglonId: p.renglonId, casilla: p.renglonId ? RENGLON[p.renglonId] ?? null : null, checklistItem: p.checklistItem, cuentaAuxiliar: p.cuenta ?? null, cedula: p.cedula, ...(p.contenido.tributario ?? {}) } },
      desbloqueaClave: null, orden: orden++, bitacora: p.bitacora,
    })
    return { codigo, nota: null }
  }

  // ─── Cifras ───────────────────────────────────────────────────────────────
  const L = entrada.libros ?? null
  const cifras: CifrasRevision = {}
  for (const id of DIGITABLES) {
    const g = entrada.cifras[id]
    cifras[id] = { declarado: typeof g?.declarado === 'number' ? g.declarado : null, libros: L ? L.cifras[id]?.libros ?? null : typeof g?.libros === 'number' ? g.libros : null }
  }
  const cifrasLibros: Record<string, { libros: number }> = {}
  if (L) for (const [id, v] of Object.entries(L.cifras)) if (DIGITABLES.includes(id)) cifrasLibros[id] = v
  const R = resolverCifras('ica', cifras)
  const dec = (id: string) => R[id]?.declarado ?? null
  const lib = (id: string) => R[id]?.libros ?? null
  const declarados = DIGITABLES.filter((id) => cifras[id].declarado !== null).length
  const municipio = normalizarMunicipio(entrada.municipio) ?? L?.municipio ?? null
  const nombreMun = municipio ? nombreMunicipio(municipio) : null
  bit.push({ tipo: 'lectura', texto: `Declaración de ICA${nombreMun ? ` de ${nombreMun}` : ''} ${entrada.periodo.etiqueta}: ${declarados} renglón(es) con valor declarado.`, referencia: { paso: 'P-01' } })
  if (declarados === 0) limitaciones.push({ regla: 'P-01', motivo: 'Sin cifras declaradas: solo corren las reglas sobre libros.' })
  const adm = tarifasIcaDe(municipio)

  // ─── Cédulas ──────────────────────────────────────────────────────────────
  type Tabla = { id: string; titulo: string; columnas: ColumnaCedula[]; descripcion?: string }
  const fuenteBorrador = `Declaración de ICA ${nombreMun ? `de ${nombreMun} ` : ''}de ${entrada.periodo.etiqueta} (columna Declarado)`
  const fuenteLibros = entrada.fuentes?.length ? entrada.fuentes.map((f) => `${f.nombre} (${f.archivo})`).join(', ') : 'Según libros guardado en la revisión'
  const cedulaDePaso = (id: string, fase: CedulaBorrador['fase'], objetivo: string, criterio: string, fuentes: string[]): CedulaBorrador => {
    const d = PROGRAMA_AGENTE_ICA.find((x) => x.id === id)!
    const c = nuevaCedula({ id, pasoId: id, fase, titulo: d.texto, objetivo, criterio, fuentes, reglas: d.reglas, checklistItem: d.checklistItem })
    if (d.reglas.every((r) => omitidas.has(r))) { c.estado = 'omitida'; c.motivo = 'Paso desactivado por el auditor en el programa.' }
    return c
  }
  const tolTexto = `Tolerancia: redondeo a miles del formulario (mínimo ${fmt(UMBRALES_ICA.toleranciaMinima)}).`
  const tarifasTexto = adm ? `Tarifas del ICA admisibles de ${nombreMun}: ${adm.map((t) => t.toLocaleString('es-CO')).join(', ')} por mil.` : `Sin tabla de tarifas del municipio: se acepta una tarifa entre ${UMBRALES_ICA.rangoSinTabla[0]} y ${UMBRALES_ICA.rangoSinTabla[1]} por mil.`
  const C = {
    formulario: cedulaDePaso('formulario', 'formulario', 'Comprobar que el borrador es coherente por sí mismo: que los ingresos e impuestos por actividad cuadran con los totales, que cada actividad tributa a una tarifa del municipio y que avisos y sobretasas están bien liquidados.', `Formulario Único Nacional de ICA (Resolución 4056 de 2016); Ley 14 de 1983 y acuerdo municipal. ${tarifasTexto} Avisos y tableros: ${UMBRALES_ICA.avisosPct} % del renglón 20.`, [fuenteBorrador]),
    lectura: nuevaCedula({ id: 'lectura-libros', pasoId: null, fase: 'libros', titulo: 'Leer los ingresos y las cuentas del ICA en los libros', objetivo: 'Dejar a la vista qué se leyó de la contabilidad: a qué renglón del formulario va cada cuenta de ingresos, retenciones y causación del impuesto.', criterio: 'Clase 4 por código y nombre (devoluciones 4175 o por el nombre; exportaciones y otros municipios por el nombre; activos fijos 4245), 135518 para el ICA retenido, 2412 y el gasto de industria y comercio para la causación. La memoria de la empresa manda sobre el nombre.', fuentes: [fuenteLibros], reglas: ['P-02', 'P-03'], checklistItem: null }),
    ingresos: cedulaDePaso('ingresos-libros', 'cruce', `Verificar que los ingresos y las deducciones declarados${nombreMun ? ` a ${nombreMun}` : ''} son los que la contabilidad registró en el período.`, `${tolTexto} Renglón 8 = créditos de la clase 4 del período; exportaciones netas de sus devoluciones y anulaciones.`, [fuenteBorrador, fuenteLibros]),
    deducciones: cedulaDePaso('deducciones', 'detalle', 'Identificar qué ingresos explican lo restado como no sujeto, excluido o exento, y que tenga soporte normativo.', 'Ley 14 de 1983 (art. 39: actividades no sujetas) y acuerdo municipal (exenciones). La clasificación de cada cuenta la decide la firma y queda en la memoria de la empresa.', [fuenteBorrador, fuenteLibros]),
    territorialidad: cedulaDePaso('territorialidad', 'analitica', 'Identificar ingresos de otros municipios en los libros y si la empresa tiene la declaración de ICA de cada uno.', 'El ICA se declara donde se realiza la actividad (Ley 1819 de 2016, art. 343): los ingresos de otros municipios se restan en el renglón 9 y se declaran allá.', [fuenteBorrador, fuenteLibros, 'Obligaciones de ICA de la empresa en la plataforma']),
    retenciones: cedulaDePaso('retenciones', 'cruce', 'Verificar que los descuentos de la liquidación (retenciones, autorretenciones, anticipos, saldo a favor) están soportados y que el impuesto quedó causado.', `${tolTexto} Retenciones contra los débitos del período en la 135518; saldo a favor contra el renglón 34 del período anterior.`, [fuenteBorrador, fuenteLibros, entrada.anterior ? `Revisión de ${entrada.anterior.etiqueta} en la plataforma` : 'Sin revisión del período anterior']),
    anterior: cedulaDePaso('periodo-anterior', 'analitica', 'Comparar con el período anterior para identificar variaciones que necesitan explicación.', `Procedimiento analítico (NIA 520): se espera una variación inferior al ${UMBRALES_ICA.variacionPct} %.`, [fuenteBorrador, entrada.anterior ? `Revisión de ${entrada.anterior.etiqueta} en la plataforma` : 'Sin revisión del período anterior']),
    oportunidad: cedulaDePaso('oportunidad', 'oportunidad', 'Confirmar que la declaración se presentó a tiempo, revisar las sanciones y que el total se pagó.', 'Calendario tributario del municipio; régimen sancionatorio municipal.', [fuenteBorrador, 'Fechas registradas en la revisión']),
  }
  const fila = (c: CedulaBorrador, t: Tabla, valores: FilaCedula['valores'], estado: EstadoFilaCedula, extra: { regla?: string; nota?: string | null; propuesta?: Prop | null } = {}) =>
    tablaDeCedula(c, t.id, t.titulo, t.columnas, t.descripcion).filas.push({ valores, estado, regla: extra.regla ?? null, propuesta: extra.propuesta?.codigo ?? null, nota: extra.nota ?? extra.propuesta?.nota ?? null })
  const COL_CRUCE: ColumnaCedula[] = [
    { clave: 'partida', titulo: 'Renglón', formato: 'texto' }, { clave: 'declarado', titulo: 'Declarado', formato: 'moneda' }, { clave: 'libros', titulo: 'Según libros', formato: 'moneda' },
    { clave: 'diferencia', titulo: 'Diferencia', formato: 'moneda' }, { clave: 'tolerancia', titulo: 'Tolerancia', formato: 'moneda' },
  ]
  const T_CRUCE: Tabla = { id: 'cruce', titulo: 'Declarado contra libros', columnas: COL_CRUCE }
  const T_PRUEBAS: Tabla = { id: 'pruebas', titulo: 'Pruebas sobre las cifras declaradas', columnas: [{ clave: 'prueba', titulo: 'Prueba', formato: 'texto' }, { clave: 'dato', titulo: 'Dato', formato: 'texto' }, { clave: 'valor', titulo: 'Valor', formato: 'moneda' }] }
  const T_PUNTOS: Tabla = { id: 'puntos', titulo: 'Puntos verificados', columnas: [{ clave: 'punto', titulo: 'Punto verificado', formato: 'texto' }, { clave: 'dato', titulo: 'Dato', formato: 'texto' }, { clave: 'valor', titulo: 'Valor', formato: 'moneda' }] }
  const cuentasDe = (...clases: ClaseCuentaIca[]) => (L?.cuentas ?? []).filter((x) => clases.includes(x.clase) && Math.round(x.valor) !== 0)
  const listar = (lista: CuentaIca[], max = 8) => lista.slice().sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor)).slice(0, max).map((x) => `• ${x.cuenta} ${x.nombre ?? ''}: ${fmt(x.valor)}`).join('\n') + (lista.length > max ? `\n• … y ${lista.length - max} cuenta(s) más` : '')

  // ─── Bloque A · formulario ────────────────────────────────────────────────
  if (dec('ica-base') !== null || dec('ica-impuesto') !== null) {
    itemsConDatos.add('actividad-tarifa')
    regla('IC-01', `IC-01: base gravable ${fmt(dec('ica-base') ?? 0)}, impuesto a cargo ${fmt(dec('ica-impuesto-cargo') ?? 0)}, saldo ${dec('ica-saldo') !== null && dec('ica-saldo')! < 0 ? 'a favor' : 'a cargo'} ${fmt(dec('ica-saldo') ?? 0)} (recalculados desde los renglones).`)
    for (const id of ['ica-ingresos-municipio', 'ica-base', 'ica-total-ica', 'ica-impuesto-cargo', 'ica-saldo', 'ica-total-pagar']) {
      if (dec(id) === null) continue
      fila(C.formulario, T_PRUEBAS, { prueba: `Renglón ${RENGLON[id]} recalculado`, dato: ETIQUETA.get(id) ?? id, valor: dec(id) }, 'informativo', { regla: 'IC-01' })
    }
    C.formulario.limitaciones.push('Los totales que trae el formulario se verificaron al leer el borrador (cuadre de los renglones 10, 16, 20, 25, 33/34 y 38); aquí se recalculan desde los renglones guardados.')
  }

  // IC-02 / IC-03 / IC-04 · discriminación de actividades.
  const actividades = Array.from({ length: ACTIVIDADES_ICA }, (_, i) => ({ n: i + 1, ingresos: dec(idActividadIca(i + 1, 'ingresos')), impuesto: dec(idActividadIca(i + 1, 'impuesto')) }))
    .filter((a) => (a.ingresos ?? 0) !== 0 || (a.impuesto ?? 0) !== 0)
  const base = dec('ica-base')
  const impuesto = dec('ica-impuesto')
  if (actividades.length === 0) {
    if (base !== null) {
      fila(C.formulario, T_PRUEBAS, { prueba: 'Ingresos por actividad contra el renglón 16', dato: 'Sin discriminación de actividades en la revisión', valor: null }, 'no_verificable', { regla: 'IC-02' })
      C.formulario.limitaciones.push('La revisión no tiene la discriminación de actividades (sección C): léela del borrador o digítala para verificar tarifas por actividad.')
    }
  } else {
    itemsConDatos.add('actividad-tarifa')
    const sumaIng = actividades.reduce((s, a) => s + (a.ingresos ?? 0), 0)
    const sumaImp = actividades.reduce((s, a) => s + (a.impuesto ?? 0), 0)
    if (base !== null) {
      const dif = sumaIng - base
      regla('IC-02', `IC-02: ingresos por actividad ${fmt(sumaIng)} vs renglón 16 ${fmt(base)}; diferencia ${fmt(dif)}.`)
      if (Math.abs(dif) <= tol()) {
        fila(C.formulario, T_PRUEBAS, { prueba: 'Ingresos por actividad contra el renglón 16', dato: `${actividades.length} actividad(es)`, valor: sumaIng }, 'conforme', { regla: 'IC-02' })
      } else {
        const sev = severidadPorProporcion(dif, base)
        const pr = proponer({
          cedula: 'formulario', tipo: 'hallazgo', reglasIds: ['IC-02'], titulo: 'Los ingresos por actividad no suman el total de ingresos gravables', renglonId: 'ica-base', monto: Math.abs(dif), severidad: sev.severidad, certeza: 'verificado',
          datos: [{ etiqueta: 'por actividad', valor: fmt(sumaIng) }, { etiqueta: 'renglón 16', valor: fmt(base) }, { etiqueta: 'diferencia', valor: `${dif < 0 ? '−' : ''}${fmt(dif)}` }], checklistItem: 'actividad-tarifa',
          contenido: { descripcion: `La discriminación de actividades suma ${fmt(sumaIng)} y el total de ingresos gravables (renglón 16) es ${fmt(base)}: diferencia de ${fmt(dif)}.`, norma: 'Formulario Único Nacional de ICA: el total de ingresos gravados por actividad es el renglón 16.', recomendacion: 'Corregir la discriminación de actividades o la depuración de la base en el borrador.' },
          bitacora: [{ tipo: 'contraste', texto: `IC-02: diferencia ${fmt(dif)}.`, referencia: { regla: 'IC-02' } }],
        })
        fila(C.formulario, T_PRUEBAS, { prueba: 'Ingresos por actividad contra el renglón 16', dato: `Diferencia de ${fmt(dif)}`, valor: sumaIng }, 'diferencia', { regla: 'IC-02', propuesta: pr })
      }
    }
    if (impuesto !== null) {
      const dif = sumaImp - impuesto
      regla('IC-03', `IC-03: impuesto por actividad ${fmt(sumaImp)} vs renglón 17 ${fmt(impuesto)}; diferencia ${fmt(dif)}.`)
      if (Math.abs(dif) <= tol()) {
        fila(C.formulario, T_PRUEBAS, { prueba: 'Impuesto por actividad contra el renglón 17', dato: 'Diferencia dentro del redondeo a miles', valor: sumaImp }, 'conforme', { regla: 'IC-03' })
      } else {
        const sev = severidadPorProporcion(dif, impuesto)
        const pr = proponer({
          cedula: 'formulario', tipo: 'hallazgo', reglasIds: ['IC-03'], titulo: 'El impuesto por actividad no suma el renglón 17', renglonId: 'ica-impuesto', monto: Math.abs(dif), severidad: sev.severidad, certeza: 'verificado',
          datos: [{ etiqueta: 'por actividad', valor: fmt(sumaImp) }, { etiqueta: 'renglón 17', valor: fmt(impuesto) }], checklistItem: 'actividad-tarifa',
          contenido: { descripcion: `El impuesto de las actividades suma ${fmt(sumaImp)} y el renglón 17 trae ${fmt(impuesto)}: diferencia de ${fmt(dif)}.`, norma: 'El renglón 17 es la suma del impuesto de cada actividad.', recomendacion: 'Corregir el renglón 17 o la liquidación por actividad.' },
          bitacora: [{ tipo: 'contraste', texto: `IC-03: diferencia ${fmt(dif)}.`, referencia: { regla: 'IC-03' } }],
        })
        fila(C.formulario, T_PRUEBAS, { prueba: 'Impuesto por actividad contra el renglón 17', dato: `Diferencia de ${fmt(dif)}`, valor: sumaImp }, 'diferencia', { regla: 'IC-03', propuesta: pr })
      }
    }
    // IC-04 · tarifa de cada actividad.
    const [min, max] = UMBRALES_ICA.rangoSinTabla
    const admisible = (t: number) => adm ? adm.some((x) => Math.abs(x - t) <= UMBRALES_ICA.toleranciaTarifa) : t >= min - UMBRALES_ICA.toleranciaTarifa && t <= max + UMBRALES_ICA.toleranciaTarifa
    const conTarifa = actividades.map((a) => ({ ...a, tarifa: a.ingresos ? ((a.impuesto ?? 0) / a.ingresos) * 1000 : null }))
    const fuera = conTarifa.filter((a) => a.tarifa === null || !admisible(a.tarifa))
    regla('IC-04', `IC-04: ${actividades.length} actividad(es); ${fuera.length} con tarifa fuera de ${adm ? `las de ${nombreMun}` : `${min}–${max} por mil`}.`)
    let prFuera: Prop | null = null
    if (fuera.length) {
      prFuera = proponer({
        cedula: 'formulario', tipo: 'juicio', reglasIds: ['IC-04'], titulo: `${fuera.length} actividad(es) con una tarifa que no es de las ${adm ? `de ${nombreMun}` : 'esperadas'}`, renglonId: null, monto: null, severidad: 'media', certeza: 'requiere_evidencia',
        datos: fuera.map((a) => ({ etiqueta: `Actividad ${a.n}`, valor: a.tarifa === null ? 'impuesto sin ingresos' : porMil(a.tarifa) })), checklistItem: 'actividad-tarifa', cuenta: 'actividades',
        contenido: { descripcion: `Estas actividades tributan a una tarifa que no está entre ${adm ? `las del ICA de ${nombreMun} (${adm.map((t) => t.toLocaleString('es-CO')).join(', ')} por mil)` : `el rango esperado (${min} a ${max} por mil)`}:\n${fuera.map((a) => `• Actividad ${a.n}: ingresos ${fmt(a.ingresos ?? 0)}, impuesto ${fmt(a.impuesto ?? 0)}${a.tarifa === null ? '' : `, ${porMil(a.tarifa)}`}`).join('\n')}`, para: 'Verificar el código de actividad declarado y su tarifa en el acuerdo municipal vigente.', opciones: [{ clave: 'ok', label: 'Tarifa correcta' }, { clave: 'revisar', label: 'Revisar el código de actividad' }] },
        bitacora: [{ tipo: 'regla', texto: `IC-04: ${fuera.map((a) => (a.tarifa === null ? 's/t' : porMil(a.tarifa))).join(', ')}.`, referencia: { regla: 'IC-04' } }],
      })
    }
    const tAct: Tabla = { id: 'actividades', titulo: 'Discriminación de actividades gravadas', descripcion: 'La tarifa es el impuesto de la actividad dividido por sus ingresos gravados. El código de actividad está en el borrador adjunto.', columnas: [{ clave: 'actividad', titulo: 'Actividad', formato: 'texto' }, { clave: 'ingresos', titulo: 'Ingresos gravados', formato: 'moneda' }, { clave: 'impuesto', titulo: 'Impuesto', formato: 'moneda' }, { clave: 'tarifa', titulo: 'Tarifa ‰', formato: 'numero' }] }
    for (const a of conTarifa) {
      const ok = a.tarifa !== null && admisible(a.tarifa)
      fila(C.formulario, tAct, { actividad: a.n === 1 ? 'Actividad principal' : `Actividad ${a.n}`, ingresos: a.ingresos, impuesto: a.impuesto, tarifa: a.tarifa === null ? null : Math.round(a.tarifa * 100) / 100 }, ok ? 'conforme' : 'por_confirmar', { regla: 'IC-04', propuesta: ok ? null : prFuera, nota: ok ? null : 'No es una tarifa admisible del municipio.' })
    }
    if (!adm) C.formulario.limitaciones.push(`La plataforma no tiene la tabla de tarifas del ICA de ${nombreMun ?? 'este municipio'}: las tarifas se califican contra el rango de ${min} a ${max} por mil.`)
    C.formulario.limitaciones.push('No se verifica que el código de actividad corresponda a la actividad real ni a la tarifa: la plataforma no tiene la tabla de códigos del municipio.')
  }

  // IC-05 · avisos y tableros.
  const totalIca = dec('ica-total-ica')
  const avisos = dec('ica-avisos')
  if (totalIca !== null && totalIca > 0) {
    itemsConDatos.add('actividad-tarifa')
    if (avisos !== null && avisos > 0) {
      const esperado = Math.round((totalIca * UMBRALES_ICA.avisosPct) / 100)
      const dif = avisos - esperado
      regla('IC-05', `IC-05: avisos ${fmt(avisos)} vs ${UMBRALES_ICA.avisosPct} % del renglón 20 (${fmt(esperado)}).`)
      if (Math.abs(dif) <= tol()) {
        fila(C.formulario, T_PRUEBAS, { prueba: 'Avisos y tableros al 15 % del renglón 20', dato: `Esperado ${fmt(esperado)}`, valor: avisos }, 'conforme', { regla: 'IC-05' })
      } else {
        const pr = proponer({
          cedula: 'formulario', tipo: 'hallazgo', reglasIds: ['IC-05'], titulo: 'Avisos y tableros no corresponden al 15 % del impuesto', renglonId: 'ica-avisos', monto: Math.abs(dif), severidad: severidadPorProporcion(dif, esperado).severidad, certeza: 'verificado',
          datos: [{ etiqueta: 'declarado', valor: fmt(avisos) }, { etiqueta: '15 % del renglón 20', valor: fmt(esperado) }], checklistItem: 'actividad-tarifa',
          contenido: { descripcion: `El renglón 21 trae ${fmt(avisos)} y el 15 % del impuesto de industria y comercio (renglón 20, ${fmt(totalIca)}) es ${fmt(esperado)}.`, norma: 'Ley 14 de 1983, art. 37: el impuesto de avisos y tableros es el 15 % del ICA.', recomendacion: 'Recalcular el renglón 21.' },
          bitacora: [{ tipo: 'contraste', texto: `IC-05: diferencia ${fmt(dif)}.`, referencia: { regla: 'IC-05' } }],
        })
        fila(C.formulario, T_PRUEBAS, { prueba: 'Avisos y tableros al 15 % del renglón 20', dato: `Esperado ${fmt(esperado)}`, valor: avisos }, 'diferencia', { regla: 'IC-05', propuesta: pr })
      }
    } else {
      fila(C.formulario, T_PRUEBAS, { prueba: 'Avisos y tableros', dato: 'No liquida avisos y tableros', valor: 0 }, 'informativo', { regla: 'IC-05', nota: 'Correcto solo si la empresa no tiene avisos visibles al público en el municipio.' })
    }
    // IC-06 · sobretasas: la tarifa depende del acuerdo municipal.
    for (const [id, nombre] of [['ica-bomberil', 'Sobretasa bomberil'], ['ica-seguridad', 'Sobretasa de seguridad']] as const) {
      const v = dec(id)
      if (!v) continue
      const p = (v / totalIca) * 100
      regla('IC-06', `IC-06: ${nombre.toLowerCase()} ${fmt(v)} = ${pct(p)} del renglón 20.`)
      const pr = proponer({
        cedula: 'formulario', tipo: 'juicio', reglasIds: ['IC-06'], titulo: `${nombre} liquidada al ${pct(p)} del impuesto`, renglonId: id, monto: v, severidad: 'baja', certeza: 'requiere_evidencia',
        datos: [{ etiqueta: nombre.toLowerCase(), valor: fmt(v) }, { etiqueta: 'sobre el renglón 20', valor: pct(p) }], checklistItem: 'actividad-tarifa',
        contenido: { descripcion: `El borrador liquida ${fmt(v)} de ${nombre.toLowerCase()}, el ${pct(p)} del impuesto de industria y comercio.`, para: `Confirmar que el acuerdo de ${nombreMun ?? 'el municipio'} establece la sobretasa, sobre qué base y a qué tarifa.`, opciones: [{ clave: 'ok', label: 'Verificada con el acuerdo' }, { clave: 'revisar', label: 'Revisar la liquidación' }] },
        bitacora: [{ tipo: 'regla', texto: `IC-06: ${pct(p)}.`, referencia: { regla: 'IC-06' } }],
      })
      fila(C.formulario, T_PRUEBAS, { prueba: nombre, dato: `${pct(p)} del renglón 20`, valor: v }, 'por_confirmar', { regla: 'IC-06', propuesta: pr })
    }
  }

  // ─── Lectura de libros ────────────────────────────────────────────────────
  if (L) {
    for (const linea of L.bitacora) bit.push({ tipo: 'lectura', texto: linea, referencia: { paso: 'P-02' } })
    for (const f of entrada.fuentes ?? []) fila(C.lectura, { id: 'fuentes', titulo: 'Archivos leídos', columnas: [{ clave: 'nombre', titulo: 'Soporte', formato: 'texto' }, { clave: 'archivo', titulo: 'Archivo', formato: 'texto' }, { clave: 'registros', titulo: 'Registros del período', formato: 'numero' }, { clave: 'cuentas', titulo: 'Cuentas', formato: 'numero' }] }, { nombre: f.nombre, archivo: f.archivo, registros: f.registros, cuentas: f.cuentas }, 'informativo')
    const tCuentas: Tabla = { id: 'cuentas', titulo: 'Cuentas leídas y renglón al que van', descripcion: 'Valor = créditos para ingresos y causación; débitos menos créditos para devoluciones; débitos para retenciones, anticipos y gasto.', columnas: [{ clave: 'cuenta', titulo: 'Cuenta', formato: 'texto' }, { clave: 'nombre', titulo: 'Nombre', formato: 'texto' }, { clave: 'clase', titulo: 'Va a', formato: 'texto' }, { clave: 'debitos', titulo: 'Débitos', formato: 'moneda' }, { clave: 'creditos', titulo: 'Créditos', formato: 'moneda' }, { clave: 'valor', titulo: 'Valor', formato: 'moneda' }] }
    const conMovimiento = L.cuentas.filter((x) => x.debitos || x.creditos)
    for (const x of conMovimiento.slice(0, UMBRALES_ICA.maxFilas)) {
      fila(C.lectura, tCuentas, { cuenta: x.cuenta, nombre: x.nombre ?? '', clase: CLASE_CUENTA_ICA_LABEL[x.clase], debitos: Math.round(x.debitos), creditos: Math.round(x.creditos), valor: Math.round(x.valor) }, 'informativo', { regla: 'P-03', nota: x.regla === 'memoria' ? x.motivo : x.municipio ? x.motivo : null })
    }
    const t = C.lectura.tablas.find((x) => x.id === 'cuentas')
    if (t && conMovimiento.length > UMBRALES_ICA.maxFilas) t.omitidas = conMovimiento.length - UMBRALES_ICA.maxFilas
    if (L.debitosEnIngresos > 0) C.lectura.limitaciones.push(`Las cuentas de ingreso tienen ${fmt(L.debitosEnIngresos)} en débitos que no se restaron del renglón 8 (pueden ser anulaciones registradas en la misma cuenta o el cierre del ejercicio).`)
  } else {
    C.lectura.estado = 'sin_insumos'
    C.lectura.motivo = 'No se cargó auxiliar ni balance de prueba del período en este análisis.'
  }
  const hayIngresosLibros = !!L && L.cuentas.some((x) => x.cuenta.startsWith('4'))
  if (!hayIngresosLibros) limitaciones.push({ regla: 'IC-10..IC-14', motivo: L ? 'El libro cargado no trae cuentas de ingresos (clase 4): no se cruzaron los ingresos contra la contabilidad.' : 'Sin libros del período: no se comparó contra la contabilidad.' })

  // ─── Bloque B · ingresos contra libros ────────────────────────────────────
  const comparar = (cedula: CedulaBorrador, cedulaId: string, item: string, reglaId: string, id: string, titulo: string, norma: string, detalle?: string) => {
    const d = dec(id)
    const l = lib(id)
    if (d === null && l === null) return
    itemsConDatos.add(item)
    const declarado = d ?? 0
    const libros = l ?? 0
    const dif = declarado - libros
    const t = tol()
    regla(reglaId, `${reglaId}: ${conRenglon(id)} declarado ${fmt(declarado)} vs libros ${fmt(libros)}; diferencia ${fmt(dif)}.`)
    const valores = { partida: conRenglon(id), declarado, libros, diferencia: dif, tolerancia: t }
    if (Math.abs(dif) <= t) { fila(cedula, T_CRUCE, valores, 'conforme', { regla: reglaId }); return }
    const sev = severidadPorProporcion(dif, Math.max(Math.abs(declarado), Math.abs(libros)))
    const pr = proponer({
      cedula: cedulaId, tipo: 'hallazgo', reglasIds: [reglaId], titulo, renglonId: id, monto: Math.abs(dif), severidad: sev.severidad, certeza: 'verificado',
      datos: [{ etiqueta: 'declarado', valor: fmt(declarado) }, { etiqueta: 'según libros', valor: fmt(libros) }, { etiqueta: 'diferencia', valor: `${dif < 0 ? '−' : ''}${fmt(dif)}` }], checklistItem: item,
      contenido: {
        descripcion: `Renglón ${RENGLON[id]} (${ETIQUETA.get(id)}): la declaración${nombreMun ? ` de ${nombreMun}` : ''} trae ${fmt(declarado)} y los libros del período registran ${fmt(libros)}. Diferencia de ${fmt(dif)} (${pct(sev.proporcion)}).${detalle ? `\n\n${detalle}` : ''}`,
        norma, recomendacion: 'Identificar las cuentas que explican la diferencia y corregir el borrador antes de presentarlo, o documentar la partida conciliatoria.',
      },
      bitacora: [{ tipo: 'contraste', texto: `${reglaId}: diferencia ${fmt(dif)} por encima de ${fmt(t)}.`, referencia: { regla: reglaId } }, { tipo: 'clasificacion', texto: `Severidad ${sev.severidad.toUpperCase()}: ${sev.explicacion}.` }],
    })
    fila(cedula, T_CRUCE, valores, 'diferencia', { regla: reglaId, propuesta: pr })
  }
  if (hayIngresosLibros) {
    const NORMA_BASE = 'Ley 14 de 1983, art. 33, y Ley 1819 de 2016, art. 342: la base gravable son los ingresos ordinarios y extraordinarios del período, menos devoluciones, exportaciones, venta de activos fijos y actividades exentas o no sujetas.'
    comparar(C.ingresos, 'ingresos-libros', 'ingresos-municipio', 'IC-10', 'ica-ingresos', 'Ingresos brutos declarados y contabilizados no coinciden', NORMA_BASE, `Cuentas de ingresos con más movimiento:\n${listar(cuentasDe('ingreso', 'fuera', 'exportacion', 'activo-fijo', 'no-sujeto', 'exento'))}`)
    const devExp = cuentasDe('devolucion-exportacion').reduce((s, x) => s + x.valor, 0)
    const pistaDobles = devExp > 0 && (dec('ica-devoluciones') ?? 0) > (lib('ica-devoluciones') ?? 0)
      ? `\n\nOjo: las devoluciones y anulaciones de exportaciones (${fmt(devExp)}) se restan en las exportaciones (renglón 12, netas). Si el borrador también las incluyó aquí, quedaron restadas dos veces y la base está subestimada.` : ''
    comparar(C.ingresos, 'ingresos-libros', 'ingresos-municipio', 'IC-11', 'ica-devoluciones', 'Devoluciones declaradas y contabilizadas no coinciden', NORMA_BASE, `Cuentas de devoluciones, rebajas y anulaciones:\n${listar(cuentasDe('devolucion'))}${pistaDobles}`)
    comparar(C.ingresos, 'ingresos-libros', 'ingresos-municipio', 'IC-12', 'ica-exportaciones', 'Exportaciones declaradas y contabilizadas no coinciden', `${NORMA_BASE} Las exportaciones se soportan con la declaración de exportación o el certificado al proveedor.`, `Ventas al exterior:\n${listar(cuentasDe('exportacion'))}${cuentasDe('devolucion-exportacion').length ? `\nMenos sus devoluciones y anulaciones:\n${listar(cuentasDe('devolucion-exportacion'))}` : ''}`)
    if (L!.otrosMunicipios.some((o) => o.ingresos > 0) || !(dec('ica-fuera-municipio') ?? 0)) {
      comparar(C.ingresos, 'ingresos-libros', 'ingresos-municipio', 'IC-13', 'ica-fuera-municipio', 'Ingresos fuera del municipio declarados y contabilizados no coinciden', 'Ley 1819 de 2016, art. 343: territorialidad del ICA.', cuentasDe('fuera').length ? `Cuentas de ingresos de otros municipios:\n${listar(cuentasDe('fuera'))}` : 'Ninguna cuenta de ingresos nombra otro municipio.')
    } else {
      itemsConDatos.add('ingresos-municipio')
      fila(C.ingresos, T_CRUCE, { partida: conRenglon('ica-fuera-municipio'), declarado: dec('ica-fuera-municipio'), libros: null, diferencia: null, tolerancia: null }, 'no_verificable', { regla: 'IC-13', nota: 'Ninguna cuenta de ingresos nombra otro municipio: la distribución territorial se revisa en la cédula de territorialidad.' })
    }
    if ((dec('ica-activos-fijos') ?? 0) || (lib('ica-activos-fijos') ?? 0)) comparar(C.ingresos, 'ingresos-libros', 'ingresos-municipio', 'IC-14', 'ica-activos-fijos', 'Venta de activos fijos declarada y contabilizada no coincide', NORMA_BASE, `Cuentas de venta de activos fijos:\n${listar(cuentasDe('activo-fijo'))}`)
    // Base gravable que resulta de los libros (14 y 15 del borrador si la firma no clasificó cuentas).
    const baseD = dec('ica-base')
    if (baseD !== null) {
      const v = (id: string) => lib(id) ?? dec(id) ?? 0
      const baseL = v('ica-ingresos') - v('ica-fuera-municipio') - v('ica-devoluciones') - v('ica-exportaciones') - v('ica-activos-fijos') - v('ica-no-sujetos') - v('ica-exentos')
      const dif = baseD - baseL
      const tarifaProm = impuesto && baseD ? impuesto / baseD : null
      const T_BASE: Tabla = { id: 'base', titulo: 'Base gravable según libros', descripcion: 'Efecto conjunto de los cruces anteriores. Los renglones 14 y 15 se toman del borrador cuando la firma no ha clasificado cuentas como no sujetas o exentas.', columnas: [{ clave: 'partida', titulo: 'Concepto', formato: 'texto' }, { clave: 'declarado', titulo: 'Declarado', formato: 'moneda' }, { clave: 'libros', titulo: 'Según libros', formato: 'moneda' }, { clave: 'diferencia', titulo: 'Diferencia', formato: 'moneda' }, { clave: 'impacto', titulo: 'Impuesto estimado', formato: 'moneda' }] }
      regla('IC-10', `IC-10: base gravable declarada ${fmt(baseD)} vs ${fmt(baseL)} según libros; diferencia ${fmt(dif)}.`)
      fila(C.ingresos, T_BASE, { partida: '16 · Total ingresos gravables', declarado: baseD, libros: baseL, diferencia: dif, impacto: tarifaProm !== null && Math.abs(dif) > tol() ? Math.round(-dif * tarifaProm) : null }, Math.abs(dif) <= tol(3) ? 'conforme' : 'informativo', { regla: 'IC-10', nota: Math.abs(dif) <= tol(3) ? null : `Impuesto estimado a la tarifa promedio declarada (${tarifaProm !== null ? porMil(tarifaProm * 1000) : 'sin dato'}): ${dif < 0 ? 'mayor impuesto' : 'menor impuesto'} si se corrige.` })
    }
  } else {
    for (const c of [C.ingresos]) if (c.estado === 'ejecutada') { c.estado = 'sin_insumos'; c.motivo = L ? 'El libro cargado no trae cuentas de ingresos (clase 4).' : 'Sin libros del período: no se comparó contra la contabilidad.' }
  }

  // ─── Deducciones: no sujetos y exentos ────────────────────────────────────
  const noSujetos = dec('ica-no-sujetos') ?? 0
  const exentos = dec('ica-exentos') ?? 0
  const tCand: Tabla = { id: 'candidatas', titulo: 'Ingresos no operacionales y su clasificación', descripcion: 'Cuentas de la clase 42 del período. Las que la firma marque como no sujetas o exentas pasan a los renglones 14 y 15 según libros.', columnas: [{ clave: 'cuenta', titulo: 'Cuenta', formato: 'texto' }, { clave: 'nombre', titulo: 'Nombre', formato: 'texto' }, { clave: 'creditos', titulo: 'Créditos del período', formato: 'moneda' }, { clave: 'clase', titulo: 'Clasificación', formato: 'texto' }] }
  if (L && (noSujetos > 0 || exentos > 0)) {
    itemsConDatos.add('deducciones')
    const umbral = (noSujetos + exentos) * UMBRALES_ICA.noSujetoMinPct / 100
    const candidatas = L.porClasificar.filter((c) => c.creditos >= umbral).sort((a, b) => b.creditos - a.creditos).slice(0, UMBRALES_ICA.maxAmbiguedades)
    regla('IC-09', `IC-09: ${L.porClasificar.length} cuenta(s) no operacionales sin clasificar; se pregunta por ${candidatas.length} (las que pesan ≥ ${UMBRALES_ICA.noSujetoMinPct} % de lo restado).`)
    const propCand = new Map<string, Prop>()
    for (const c of candidatas) {
      propCand.set(c.cuenta, proponer({
        cedula: 'deducciones', tipo: 'ambiguedad', reglasIds: ['IC-09'], titulo: `¿La cuenta ${c.cuenta} es un ingreso gravado con ICA?`, renglonId: null, monto: c.creditos, severidad: 'media', certeza: 'no_verificable',
        datos: [{ etiqueta: 'cuenta', valor: `${c.cuenta} ${c.nombre ?? ''}`.trim() }, { etiqueta: 'créditos del período', valor: fmt(c.creditos) }, { etiqueta: 'restado en el borrador', valor: fmt(noSujetos + exentos) }], checklistItem: null, cuenta: c.cuenta,
        contenido: { descripcion: `El borrador resta ${fmt(noSujetos)} como no sujetos${exentos ? ` y ${fmt(exentos)} como exentos` : ''}. La cuenta ${c.cuenta} "${c.nombre ?? ''}" tuvo ${fmt(c.creditos)} de ingresos en el período y su nombre no dice si está gravada.`, para: 'La clasificación queda en la memoria de la empresa: desde el próximo análisis la cuenta va sola al renglón que elijas y "Según libros" de los renglones 14 y 15 sale de ahí.', opciones: OPCIONES_CUENTA_ICA.map((o) => ({ clave: o.clave, label: o.label })), destino: 'memoria', tributario: { memoriaClave: 'mapeoIca' } },
        bitacora: [{ tipo: 'clasificacion', texto: 'Cuenta no operacional sin clasificar en la memoria (IC-09).', referencia: { regla: 'IC-09' } }],
      }))
    }
    for (const c of [...L.cuentas.filter((x) => x.cuenta.startsWith('42') && x.creditos)].sort((a, b) => b.creditos - a.creditos).slice(0, UMBRALES_ICA.maxFilas)) {
      const pr = propCand.get(c.cuenta) ?? null
      fila(C.deducciones, tCand, { cuenta: c.cuenta, nombre: c.nombre ?? '', creditos: Math.round(c.creditos), clase: c.regla === 'memoria' ? CLASE_CUENTA_ICA_LABEL[c.clase] : 'Gravado (sin clasificar)' }, pr ? 'por_confirmar' : 'informativo', { regla: 'IC-09', propuesta: pr, nota: c.regla === 'memoria' ? 'Clasificada por la firma.' : null })
    }
  }
  for (const [id, reglaId, que, norma] of [
    ['ica-no-sujetos', 'IC-15', 'no sujetos, excluidos o no gravados', 'Ley 14 de 1983, art. 39, y normas especiales que excluyen la actividad del ICA.'],
    ['ica-exentos', 'IC-16', 'exentos por acuerdo municipal', 'Acuerdo municipal que concede la exención (con su término y requisitos).'],
  ] as const) {
    const d = dec(id)
    const l = lib(id)
    if (!d && !l) continue
    itemsConDatos.add('deducciones')
    if (l !== null) {
      comparar(C.deducciones, 'deducciones', 'deducciones', reglaId, id, `Ingresos ${que} declarados y clasificados en libros no coinciden`, norma, `Cuentas clasificadas por la firma:\n${listar(cuentasDe(id === 'ica-no-sujetos' ? 'no-sujeto' : 'exento'))}`)
      continue
    }
    regla(reglaId, `${reglaId}: el borrador resta ${fmt(d!)} como ${que}; sin clasificación en libros.`)
    const pr = proponer({
      cedula: 'deducciones', tipo: 'juicio', reglasIds: [reglaId], titulo: `Soporte de los ingresos ${que} (${fmt(d!)})`, renglonId: id, monto: d, severidad: 'media', certeza: 'requiere_evidencia',
      datos: [{ etiqueta: `renglón ${RENGLON[id]}`, valor: fmt(d!) }], checklistItem: 'deducciones',
      contenido: { descripcion: `El borrador resta ${fmt(d!)} de la base como ingresos ${que} y los libros no dicen qué cuentas son${L ? ' (clasifícalas en las preguntas de esta cédula)' : ''}.`, para: `Identificar los ingresos y la norma que los ${id === 'ica-exentos' ? 'exime' : 'excluye'}: ${norma}`, opciones: [{ clave: 'ok', label: 'Soportado' }, { clave: 'revisar', label: 'Pedir el soporte' }] },
      bitacora: [{ tipo: 'regla', texto: `${reglaId}: deducción sin clasificación en libros.`, referencia: { regla: reglaId } }],
    })
    fila(C.deducciones, T_PUNTOS, { punto: `Renglón ${RENGLON[id]} · ingresos ${que}`, dato: 'Requiere la norma y las cuentas que lo explican', valor: d }, 'por_confirmar', { regla: reglaId, propuesta: pr })
  }

  // ─── Territorialidad ──────────────────────────────────────────────────────
  const fueraDec = dec('ica-fuera-municipio') ?? 0
  const otros = (L?.otrosMunicipios ?? []).filter((o) => o.ingresos > 0 || o.retenciones > 0)
  const conObligacion = entrada.municipiosConObligacion ? new Set(entrada.municipiosConObligacion) : null
  if (otros.length || fueraDec > 0) {
    itemsConDatos.add('ingresos-municipio')
    const tTerr: Tabla = { id: 'municipios', titulo: 'Ingresos por municipio en libros', columnas: [{ clave: 'municipio', titulo: 'Municipio', formato: 'texto' }, { clave: 'ingresos', titulo: 'Ingresos', formato: 'moneda' }, { clave: 'devoluciones', titulo: 'Devoluciones', formato: 'moneda' }, { clave: 'retenciones', titulo: 'ICA retenido', formato: 'moneda' }, { clave: 'declaracion', titulo: 'Declaración en la plataforma', formato: 'texto' }] }
    if (L && hayIngresosLibros) {
      const ingresosOtros = otros.reduce((s, o) => s + o.ingresos, 0)
      fila(C.territorialidad, tTerr, { municipio: `${nombreMun ?? 'Este municipio'} (esta declaración)`, ingresos: Math.round((lib('ica-ingresos') ?? 0) - ingresosOtros), devoluciones: null, retenciones: null, declaracion: 'Sí' }, 'informativo', { regla: 'IC-20' })
    }
    const sinDecl = conObligacion ? otros.filter((o) => !conObligacion.has(o.municipio)) : []
    regla('IC-20', `IC-20: ${otros.length} municipio(s) más en los libros${conObligacion ? `; ${sinDecl.length} sin obligación de ICA en la plataforma` : ''}; renglón 9 declarado ${fmt(fueraDec)}.`)
    let prSin: Prop | null = null
    if (sinDecl.length) {
      prSin = proponer({
        cedula: 'territorialidad', tipo: 'juicio', reglasIds: ['IC-20'], titulo: `Ingresos en ${sinDecl.map((o) => nombreMunicipio(o.municipio)).join(', ')} sin declaración de ICA en la plataforma`, renglonId: null, monto: sinDecl.reduce((s, o) => s + o.ingresos, 0), severidad: 'media', certeza: 'requiere_evidencia',
        datos: sinDecl.map((o) => ({ etiqueta: nombreMunicipio(o.municipio), valor: fmt(o.ingresos) })), checklistItem: 'ingresos-municipio', cuenta: 'territorialidad',
        contenido: { descripcion: `Los libros registran ingresos del período en ${sinDecl.map((o) => `${nombreMunicipio(o.municipio)} (${fmt(o.ingresos)})`).join(', ')}, que se restan como ingresos fuera del municipio, y la empresa no tiene la obligación de ICA de ese municipio en la plataforma.`, para: 'Esos ingresos deben declararse en el municipio donde se realizó la actividad. Confirmar la declaración (y crear la obligación para revisarla) o la contabilización.', opciones: [{ clave: 'declarada', label: 'Se declara allá: crear la obligación' }, { clave: 'revisar', label: 'Revisar la contabilización' }] },
        bitacora: [{ tipo: 'regla', texto: 'IC-20: municipio con ingresos y sin obligación en la plataforma.', referencia: { regla: 'IC-20' } }],
      })
    }
    for (const o of otros) {
      const tiene = conObligacion ? conObligacion.has(o.municipio) : null
      fila(C.territorialidad, tTerr, { municipio: nombreMunicipio(o.municipio), ingresos: Math.round(o.ingresos), devoluciones: Math.round(o.devoluciones), retenciones: Math.round(o.retenciones), declaracion: tiene === null ? 'Sin dato' : tiene ? 'Sí' : 'No' }, tiene === false ? 'por_confirmar' : tiene ? 'conforme' : 'no_verificable', { regla: 'IC-20', propuesta: tiene === false ? prSin : null })
    }
    if (fueraDec > 0 && !otros.some((o) => o.ingresos > 0)) {
      const pr = proponer({
        cedula: 'territorialidad', tipo: 'juicio', reglasIds: ['IC-20'], titulo: `Soporte de los ingresos fuera del municipio (${fmt(fueraDec)})`, renglonId: 'ica-fuera-municipio', monto: fueraDec, severidad: 'media', certeza: 'requiere_evidencia',
        datos: [{ etiqueta: 'renglón 9', valor: fmt(fueraDec) }], checklistItem: 'ingresos-municipio',
        contenido: { descripcion: `El borrador resta ${fmt(fueraDec)} como ingresos de otros municipios y ninguna cuenta de los libros dice de qué municipio son.`, para: 'Pedir la distribución territorial de los ingresos (por centro de costos, sede o cliente) y las declaraciones de ICA de esos municipios.', opciones: [{ clave: 'ok', label: 'Distribución soportada' }, { clave: 'revisar', label: 'Pedir el soporte' }] },
        bitacora: [{ tipo: 'regla', texto: 'IC-20: renglón 9 sin cuentas de otros municipios.', referencia: { regla: 'IC-20' } }],
      })
      fila(C.territorialidad, T_PUNTOS, { punto: 'Ingresos fuera del municipio', dato: 'Sin cuentas por municipio en los libros', valor: fueraDec }, 'por_confirmar', { regla: 'IC-20', propuesta: pr })
    }
  }

  // ─── Retenciones, anticipos, saldo a favor y causación ────────────────────
  const ret = dec('ica-retenciones')
  if (ret !== null || lib('ica-retenciones') !== null) {
    itemsConDatos.add('retenciones-anticipos')
    // Sin municipio en las subcuentas, solo es diferencia cierta si la empresa no tiene ingresos de otros municipios.
    const soloEste = !!L && (L.retencionesPorMunicipio || (!L.otrosMunicipios.some((o) => o.ingresos > 0) && (conObligacion ? [...conObligacion].every((m) => m === municipio) : false)))
    const d = ret ?? 0
    const l = lib('ica-retenciones')
    if (l === null) {
      fila(C.retenciones, T_CRUCE, { partida: conRenglon('ica-retenciones'), declarado: d, libros: null, diferencia: null, tolerancia: null }, 'no_verificable', { regla: 'IC-21', nota: L ? 'El libro no trae la 135518.' : 'Sin libros del período.' })
    } else if (soloEste) {
      comparar(C.retenciones, 'retenciones', 'retenciones-anticipos', 'IC-21', 'ica-retenciones', 'Retenciones de ICA declaradas y contabilizadas no coinciden', 'Las retenciones que le practicaron se descuentan con el certificado del agente retenedor y deben estar en la 135518 del período.', `Subcuentas de ICA retenido:\n${listar(cuentasDe('retencion'))}`)
    } else {
      const dif = d - l
      regla('IC-21', `IC-21: retenciones declaradas ${fmt(d)} vs ${fmt(l)} debitados en la 135518 (sin municipio en las subcuentas).`)
      const valores = { partida: conRenglon('ica-retenciones'), declarado: d, libros: l, diferencia: dif, tolerancia: tol() }
      if (Math.abs(dif) <= tol()) {
        fila(C.retenciones, T_CRUCE, valores, 'conforme', { regla: 'IC-21' })
      } else {
        const pr = proponer({
          cedula: 'retenciones', tipo: 'juicio', reglasIds: ['IC-21'], titulo: `Retenciones de ICA: declarado ${fmt(d)} y en la 135518 ${fmt(l)}`, renglonId: 'ica-retenciones', monto: Math.abs(dif), severidad: severidadPorProporcion(dif, Math.max(d, l)).severidad, certeza: 'requiere_evidencia',
          datos: [{ etiqueta: 'declarado', valor: fmt(d) }, { etiqueta: 'débitos 135518', valor: fmt(l) }, { etiqueta: 'diferencia', valor: `${dif < 0 ? '−' : ''}${fmt(dif)}` }], checklistItem: 'retenciones-anticipos',
          contenido: { descripcion: `La declaración descuenta ${fmt(d)} de retenciones y en el período se debitaron ${fmt(l)} en la 135518. Las subcuentas no dicen de qué municipio es cada retención y la empresa tiene ingresos en más de un municipio, así que la diferencia puede ser de otro municipio o de otro período.\n\n${listar(cuentasDe('retencion'))}`, para: 'Cruzar contra los certificados de reteICA de los clientes de este municipio.', opciones: [{ clave: 'ok', label: 'Cuadra con los certificados' }, { clave: 'revisar', label: 'Revisar las retenciones' }] },
          bitacora: [{ tipo: 'contraste', texto: `IC-21: diferencia ${fmt(dif)} sin municipio en las subcuentas.`, referencia: { regla: 'IC-21' } }],
        })
        fila(C.retenciones, T_CRUCE, valores, 'por_confirmar', { regla: 'IC-21', propuesta: pr, nota: 'Las subcuentas de la 135518 no separan municipios.' })
      }
    }
  }
  if ((dec('ica-autorretenciones') ?? 0) || (lib('ica-autorretenciones') ?? 0)) comparar(C.retenciones, 'retenciones', 'retenciones-anticipos', 'IC-22', 'ica-autorretenciones', 'Autorretenciones de ICA declaradas y contabilizadas no coinciden', 'Autorretención de ICA del municipio.', listar(cuentasDe('autorretencion')))
  for (const [id, texto] of [['ica-anticipo-ant', 'Debe ser igual al anticipo liquidado (renglón 30) en la declaración del año anterior.'], ['ica-anticipo-sig', `Porcentaje del acuerdo de ${nombreMun ?? 'el municipio'} sobre el impuesto; no todos los municipios lo exigen.`]] as const) {
    const v = dec(id)
    if (!v) continue
    itemsConDatos.add('retenciones-anticipos')
    regla('IC-23', `IC-23: ${conRenglon(id)} ${fmt(v)}.`)
    const pr = proponer({
      cedula: 'retenciones', tipo: 'juicio', reglasIds: ['IC-23'], titulo: `${ETIQUETA.get(id)} (${fmt(v)})`, renglonId: id, monto: v, severidad: 'baja', certeza: 'requiere_evidencia',
      datos: [{ etiqueta: `renglón ${RENGLON[id]}`, valor: fmt(v) }], checklistItem: 'retenciones-anticipos',
      contenido: { descripcion: `El borrador trae ${fmt(v)} en el renglón ${RENGLON[id]}. ${texto}`, para: 'Verificar contra la declaración del año anterior o el acuerdo municipal.', opciones: [{ clave: 'ok', label: 'Verificado' }, { clave: 'revisar', label: 'Revisar' }] },
      bitacora: [{ tipo: 'regla', texto: `IC-23: ${id}.`, referencia: { regla: 'IC-23' } }],
    })
    fila(C.retenciones, T_PUNTOS, { punto: conRenglon(id), dato: texto, valor: v }, 'por_confirmar', { regla: 'IC-23', propuesta: pr })
  }
  // IC-24 · saldo a favor del período anterior.
  const sfa = dec('ica-saldo-favor-ant') ?? 0
  const saldoAnt = entrada.anterior ? resolverCifras('ica', entrada.anterior.cifras)['ica-saldo']?.declarado ?? null : null
  const favorAnt = saldoAnt !== null && saldoAnt < 0 ? -saldoAnt : saldoAnt !== null ? 0 : null
  if (sfa > 0 || (favorAnt ?? 0) > 0) {
    itemsConDatos.add('retenciones-anticipos')
    if (favorAnt !== null) {
      const dif = sfa - favorAnt
      regla('IC-24', `IC-24: saldo a favor imputado ${fmt(sfa)} vs saldo a favor de ${entrada.anterior!.etiqueta} ${fmt(favorAnt)}.`)
      const valores = { partida: conRenglon('ica-saldo-favor-ant'), declarado: sfa, libros: favorAnt, diferencia: dif, tolerancia: tol() }
      if (Math.abs(dif) <= tol()) fila(C.retenciones, T_CRUCE, valores, 'conforme', { regla: 'IC-24', nota: `"Según libros" = renglón 34 de ${entrada.anterior!.etiqueta}.` })
      else {
        const pr = proponer({
          cedula: 'retenciones', tipo: dif > 0 ? 'hallazgo' : 'juicio', reglasIds: ['IC-24'], titulo: dif > 0 ? 'Saldo a favor imputado mayor que el de la declaración anterior' : 'Saldo a favor de la declaración anterior sin imputar', renglonId: 'ica-saldo-favor-ant', monto: Math.abs(dif), severidad: dif > 0 ? 'alta' : 'baja', certeza: dif > 0 ? 'verificado' : 'requiere_evidencia',
          datos: [{ etiqueta: 'imputado', valor: fmt(sfa) }, { etiqueta: `saldo a favor ${entrada.anterior!.etiqueta}`, valor: fmt(favorAnt) }], checklistItem: 'retenciones-anticipos',
          contenido: dif > 0
            ? { descripcion: `El borrador imputa ${fmt(sfa)} de saldo a favor y la declaración de ${entrada.anterior!.etiqueta} solo dejó ${fmt(favorAnt)}.`, norma: 'Solo se imputa el saldo a favor liquidado en la declaración anterior que no se haya pedido en devolución o compensación.', recomendacion: 'Corregir el renglón 32.' }
            : { descripcion: `La declaración de ${entrada.anterior!.etiqueta} dejó ${fmt(favorAnt)} de saldo a favor y el borrador imputa ${fmt(sfa)}.`, para: 'Confirmar si el saldo se pidió en devolución o compensación; si no, se puede imputar.', opciones: [{ clave: 'ok', label: 'Explicado' }, { clave: 'revisar', label: 'Imputar el saldo' }] },
          bitacora: [{ tipo: 'contraste', texto: `IC-24: diferencia ${fmt(dif)}.`, referencia: { regla: 'IC-24' } }],
        })
        fila(C.retenciones, T_CRUCE, valores, dif > 0 ? 'diferencia' : 'por_confirmar', { regla: 'IC-24', propuesta: pr })
      }
    } else {
      regla('IC-24', `IC-24: saldo a favor imputado ${fmt(sfa)} sin la declaración anterior en la plataforma.`)
      const pr = proponer({
        cedula: 'retenciones', tipo: 'juicio', reglasIds: ['IC-24'], titulo: `Saldo a favor del período anterior (${fmt(sfa)})`, renglonId: 'ica-saldo-favor-ant', monto: sfa, severidad: 'baja', certeza: 'requiere_evidencia',
        datos: [{ etiqueta: 'renglón 32', valor: fmt(sfa) }], checklistItem: 'retenciones-anticipos',
        contenido: { descripcion: `El borrador imputa ${fmt(sfa)} de saldo a favor y la declaración anterior no está en la plataforma.`, para: 'Verificar contra el renglón 34 de la declaración anterior.', opciones: [{ clave: 'ok', label: 'Verificado' }, { clave: 'revisar', label: 'Pedir la declaración anterior' }] },
        bitacora: [{ tipo: 'regla', texto: 'IC-24: sin declaración anterior.', referencia: { regla: 'IC-24' } }],
      })
      fila(C.retenciones, T_PUNTOS, { punto: conRenglon('ica-saldo-favor-ant'), dato: 'Sin la declaración anterior en la plataforma', valor: sfa }, 'por_confirmar', { regla: 'IC-24', propuesta: pr })
    }
  }
  // IC-25 · impuesto causado en libros.
  const cargo = dec('ica-impuesto-cargo')
  if (L?.causado && cargo !== null) {
    itemsConDatos.add('retenciones-anticipos')
    const neto = cargo - (dec('ica-exencion') ?? 0)
    const causado = L.causado.creditos2412
    regla('IC-25', `IC-25: impuesto a cargo ${fmt(neto)} vs ${fmt(causado)} causado en 2412 (gasto ${fmt(L.causado.debitosGasto)}).`)
    if (causado === 0) {
      fila(C.retenciones, T_PUNTOS, { punto: 'Impuesto causado en el período (2412)', dato: `Sin causación; gasto del período ${fmt(L.causado.debitosGasto)}`, valor: 0 }, 'informativo', { regla: 'IC-25', nota: 'El impuesto del período aún no está causado: es normal si los libros se cortaron antes de contabilizar la declaración.' })
      C.retenciones.limitaciones.push('El impuesto del período no está causado en los libros cargados: no se cruzó el impuesto a cargo contra la contabilidad.')
    } else {
      const dif = neto - causado
      const valores = { partida: '25 − 26 · Impuesto a cargo neto contra 2412', declarado: neto, libros: causado, diferencia: dif, tolerancia: tol() }
      if (Math.abs(dif) <= tol()) fila(C.retenciones, T_CRUCE, valores, 'conforme', { regla: 'IC-25' })
      else {
        const pr = proponer({
          cedula: 'retenciones', tipo: 'juicio', reglasIds: ['IC-25'], titulo: 'El impuesto a cargo no coincide con lo causado en 2412', renglonId: 'ica-impuesto-cargo', monto: Math.abs(dif), severidad: 'baja', certeza: 'requiere_evidencia',
          datos: [{ etiqueta: 'impuesto a cargo', valor: fmt(neto) }, { etiqueta: 'créditos 2412', valor: fmt(causado) }], checklistItem: 'retenciones-anticipos',
          contenido: { descripcion: `La declaración liquida ${fmt(neto)} de impuesto a cargo (neto de exenciones) y en el período se causaron ${fmt(causado)} en la 2412.`, para: 'La 2412 puede incluir el ICA de otros municipios o una causación estimada: confirmar y ajustar la provisión si hace falta.', opciones: [{ clave: 'ok', label: 'Explicado' }, { clave: 'revisar', label: 'Ajustar la causación' }] },
          bitacora: [{ tipo: 'contraste', texto: `IC-25: diferencia ${fmt(dif)}.`, referencia: { regla: 'IC-25' } }],
        })
        fila(C.retenciones, T_CRUCE, valores, 'por_confirmar', { regla: 'IC-25', propuesta: pr })
      }
    }
  }

  // ─── Período anterior ─────────────────────────────────────────────────────
  if (entrada.anterior && (base !== null || cargo !== null)) {
    const RA = resolverCifras('ica', entrada.anterior.cifras)
    const T_VAR: Tabla = { id: 'variacion', titulo: `Comparativo con ${entrada.anterior.etiqueta}`, columnas: [{ clave: 'partida', titulo: 'Renglón', formato: 'texto' }, { clave: 'actual', titulo: 'Este período', formato: 'moneda' }, { clave: 'anterior', titulo: 'Período anterior', formato: 'moneda' }, { clave: 'variacion', titulo: 'Variación', formato: 'moneda' }, { clave: 'pct', titulo: '%', formato: 'porcentaje' }] }
    for (const id of ['ica-ingresos', 'ica-base', 'ica-impuesto-cargo', 'ica-retenciones', 'ica-saldo']) {
      const a = dec(id) ?? 0
      const b = RA[id]?.declarado ?? 0
      if (a === 0 && b === 0) continue
      const v = b ? ((a - b) / Math.abs(b)) * 100 : null
      const clave = id === 'ica-base' || id === 'ica-impuesto-cargo'
      let pr: Prop | null = null
      if (clave && v !== null && Math.abs(v) > UMBRALES_ICA.variacionPct) {
        regla('IC-30', `IC-30: ${conRenglon(id)} ${fmt(a)} vs ${fmt(b)} en ${entrada.anterior.etiqueta}: ${pct(v)}.`)
        pr = proponer({
          cedula: 'periodo-anterior', tipo: 'juicio', reglasIds: ['IC-30'], titulo: `${ETIQUETA.get(id)} varió ${pct(v)} frente a ${entrada.anterior.etiqueta}`, renglonId: id, monto: Math.abs(a - b), severidad: 'baja', certeza: 'requiere_evidencia',
          datos: [{ etiqueta: 'este período', valor: fmt(a) }, { etiqueta: entrada.anterior.etiqueta, valor: fmt(b) }], checklistItem: null,
          contenido: { descripcion: `${ETIQUETA.get(id)} pasó de ${fmt(b)} en ${entrada.anterior.etiqueta} a ${fmt(a)}: ${pct(v)}.`, para: 'Documentar la causa (estacionalidad, actividades nuevas, cambios en la depuración de la base).', opciones: [{ clave: 'ok', label: 'Explicada por la operación' }, { clave: 'revisar', label: 'Revisar' }] },
          bitacora: [{ tipo: 'contraste', texto: `IC-30: ${pct(v)} > ${UMBRALES_ICA.variacionPct} %.`, referencia: { regla: 'IC-30' } }],
        })
      } else if (clave) {
        regla('IC-30', `IC-30: ${conRenglon(id)} ${v === null ? 'sin base de comparación' : pct(v)}.`)
      }
      fila(C.anterior, T_VAR, { partida: conRenglon(id), actual: a, anterior: b, variacion: a - b, pct: v }, pr ? 'por_confirmar' : clave ? 'conforme' : 'informativo', { regla: 'IC-30', propuesta: pr })
    }
  }
  if (C.anterior.estado === 'ejecutada' && C.anterior.tablas.length === 0) {
    C.anterior.estado = 'sin_insumos'
    C.anterior.motivo = 'No hay revisión del período anterior con cifras declaradas en la plataforma.'
    limitaciones.push({ regla: 'IC-30', motivo: C.anterior.motivo })
  }

  // ─── Oportunidad ──────────────────────────────────────────────────────────
  if (entrada.fechaPresentacion && entrada.fechaVencimiento) {
    itemsConDatos.add('presentacion-pago')
    const dato = `Vencimiento ${entrada.fechaVencimiento} · presentación ${entrada.fechaPresentacion}`
    regla('IC-40', `IC-40: presentada ${entrada.fechaPresentacion}, vencía ${entrada.fechaVencimiento}.`)
    if (entrada.fechaPresentacion <= entrada.fechaVencimiento) {
      fila(C.oportunidad, T_PUNTOS, { punto: 'Presentación dentro del plazo', dato, valor: null }, 'conforme', { regla: 'IC-40' })
    } else {
      const pr = proponer({
        cedula: 'oportunidad', tipo: 'hallazgo', reglasIds: ['IC-40'], titulo: 'Declaración presentada después del vencimiento', renglonId: 'ica-sanciones', monto: dec('ica-sanciones'), severidad: 'alta', certeza: 'verificado',
        datos: [{ etiqueta: 'vencimiento', valor: entrada.fechaVencimiento }, { etiqueta: 'presentación', valor: entrada.fechaPresentacion }], checklistItem: 'presentacion-pago',
        contenido: { descripcion: `La declaración se presentó el ${entrada.fechaPresentacion}, después del vencimiento del ${entrada.fechaVencimiento}.${(dec('ica-sanciones') ?? 0) > 0 ? '' : ' No liquida sanción de extemporaneidad.'}`, norma: 'Régimen sancionatorio del municipio (sanción por extemporaneidad e intereses de mora).', recomendacion: 'Verificar la sanción (renglón 31) y los intereses (renglón 37).' },
        bitacora: [{ tipo: 'regla', texto: 'IC-40: presentación > vencimiento.', referencia: { regla: 'IC-40' } }],
      })
      fila(C.oportunidad, T_PUNTOS, { punto: 'Presentación dentro del plazo', dato, valor: null }, 'diferencia', { regla: 'IC-40', propuesta: pr })
    }
  } else {
    fila(C.oportunidad, T_PUNTOS, { punto: 'Presentación dentro del plazo', dato: `Vencimiento ${entrada.fechaVencimiento ?? 'sin registrar'} · presentación ${entrada.fechaPresentacion ?? 'sin registrar'}`, valor: null }, 'no_verificable', { regla: 'IC-40', nota: 'Falta registrar la fecha en la revisión.' })
  }
  const sanciones = dec('ica-sanciones')
  if (sanciones !== null && sanciones > 0) {
    itemsConDatos.add('presentacion-pago')
    regla('IC-41', `IC-41: sanciones ${fmt(sanciones)}.`)
    const pr = proponer({
      cedula: 'oportunidad', tipo: 'juicio', reglasIds: ['IC-41'], titulo: 'Sanción liquidada en el formulario', renglonId: 'ica-sanciones', monto: sanciones, severidad: 'baja', certeza: 'requiere_evidencia',
      datos: [{ etiqueta: 'sanciones', valor: fmt(sanciones) }], checklistItem: 'presentacion-pago',
      contenido: { descripcion: `El borrador liquida ${fmt(sanciones)} de sanciones (renglón 31).`, para: 'Confirmar el motivo y el cálculo.', opciones: [{ clave: 'ok', label: 'Sanción verificada' }, { clave: 'revisar', label: 'Revisar la liquidación' }] },
      bitacora: [{ tipo: 'regla', texto: 'IC-41: sanciones > 0.', referencia: { regla: 'IC-41' } }],
    })
    fila(C.oportunidad, T_PUNTOS, { punto: 'Sanciones liquidadas', dato: 'Renglón 31', valor: sanciones }, 'por_confirmar', { regla: 'IC-41', propuesta: pr })
  } else if (sanciones !== null) {
    fila(C.oportunidad, T_PUNTOS, { punto: 'Sanciones liquidadas', dato: 'Renglón 31', valor: 0 }, 'informativo', { regla: 'IC-41' })
  }
  const total = dec('ica-total-pagar')
  if ((total ?? 0) > 0) {
    itemsConDatos.add('presentacion-pago')
    const pr = proponer({
      cedula: 'oportunidad', tipo: 'juicio', reglasIds: ['IC-41'], titulo: 'Confirmar el pago de la declaración', renglonId: 'ica-total-pagar', monto: total, severidad: 'baja', certeza: 'requiere_evidencia',
      datos: [{ etiqueta: 'total a pagar', valor: fmt(total!) }], checklistItem: 'presentacion-pago',
      contenido: { descripcion: `La declaración liquida ${fmt(total!)} a pagar (renglón 38).`, para: 'Adjuntar el recibo de pago como soporte de la revisión.', opciones: [{ clave: 'ok', label: 'Pago verificado' }, { clave: 'pendiente', label: 'Pago pendiente: hacer seguimiento' }], tributario: { nota: 'Pago de la declaración verificado con el recibo adjunto.' } },
      bitacora: [{ tipo: 'regla', texto: 'IC-41: total a pagar > 0 → pedir el soporte de pago.', referencia: { regla: 'IC-41' } }],
    })
    fila(C.oportunidad, T_PUNTOS, { punto: 'Pago del total', dato: 'Requiere el recibo de pago como soporte', valor: total }, 'por_confirmar', { regla: 'IC-41', propuesta: pr })
  }

  const verificados = ['ingresos-municipio', 'actividad-tarifa', 'deducciones', 'retenciones-anticipos', 'presentacion-pago'].filter((i) => itemsConDatos.has(i) && !itemsConPropuesta.has(i))
  if (omitidas.size) limitaciones.push({ regla: [...omitidas].sort().join(', '), motivo: `Pasos desactivados por el auditor en el programa: ${propuestasOmitidas} propuesta(s) no se muestran.` })
  limitaciones.push({ regla: 'IC-50', motivo: 'No se cruzan los ingresos contra la facturación electrónica emitida (reporte de la DIAN): etapa siguiente.' })

  const cedulas = [C.formulario, C.lectura, C.ingresos, C.deducciones, C.territorialidad, C.retenciones, C.anterior, C.oportunidad].map(cerrarCedula)
  for (const c of cedulas) if (c.estado === 'ejecutada') bit.push({ tipo: 'regla', texto: `Cédula "${c.titulo}": ${c.resultado.filas} partida(s); ${c.resultado.conformes} conforme(s), ${c.resultado.diferencias} con diferencia, ${c.resultado.porConfirmar} por confirmar.`, referencia: { cedula: c.id } })
  const conteo = (t: TipoPropuesta) => propuestas.filter((p) => p.tipo === t).length
  return {
    propuestas, bitacora: bit, cifrasLibros, cedulas,
    resumen: { reglasEjecutadas: [...reglas].sort(), limitaciones, verificados, hallazgos: conteo('hallazgo'), juicios: conteo('juicio'), ambiguedades: conteo('ambiguedad'), documentos: conteo('documento') },
  }
}
