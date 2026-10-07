/**
 * Procedimiento RI · Revisión agéntica de la declaración de retención de ICA
 * (reteICA) de un municipio — lógica PURA y determinista (0 tokens). Mismo
 * modelo que IVA y retención en la fuente: propuestas con bitácora y una cédula
 * por procedimiento con todo lo comparado; la conclusión es del auditor.
 * Spec: docs/agente/procedimiento-reteica-v1.md.
 *
 * Insumos: el borrador (cada municipio tiene su formulario; la lectura lo lleva a
 * los renglones ri-*), la 2368 por municipio y tarifa (agente-reteica-libros) y
 * la revisión del bimestre anterior. PENDIENTE DE VALIDAR: tarifas de Bogotá,
 * rango de tarifa implícita sin tabla del municipio y margen de la base.
 */
import { resolverCifras, type CifrasRevision, type Periodicidad, type ProgramaRevision } from './tributario'
import { CIFRAS_CATALOGO } from './tributario'
import type { CertezaPropuesta, ContenidoPropuesta, DatoPropuesta, LineaBitacora, SeveridadPropuesta, TipoPropuesta } from './agente'
import { huellaPropuesta, type PropuestaBorrador } from './agente-balance'
import { severidadPorProporcion, UMBRALES_IVA, type PasoAgenteIva, type ResultadoCorridaIva } from './agente-iva'
import { MUNICIPIOS_RETEICA, municipioPorClave, nombreMunicipio, type MapeoLibrosReteica } from './agente-reteica-libros'
import { cerrarCedula, nuevaCedula, tablaDeCedula, type CedulaBorrador, type ColumnaCedula, type EstadoFilaCedula, type FilaCedula } from './cedulas-tributarias'

type LineaBorrador = Omit<LineaBitacora, 'numero' | 'actor'> & { actor?: 'agente' }

export type EntradaCorridaReteica = {
  periodo: { desde: string; hasta: string; etiqueta: string; periodicidad: Periodicidad; anio: number }
  cifras: CifrasRevision
  libros?: MapeoLibrosReteica | null
  /** Obligación de la revisión: la ambigüedad del municipio se guarda en la memoria bajo `obligacion:<id>`. */
  obligacionId: string
  /** Municipios (claves) con obligación de reteICA de la empresa en la plataforma, para la territorialidad. */
  municipiosConObligacion?: string[] | null
  anterior?: { etiqueta: string; cifras: CifrasRevision } | null
  fuentes?: { nombre: string; archivo: string; registros: number; cuentas: number }[]
  fechaVencimiento?: string | null
  fechaPresentacion?: string | null
  numeracion?: { H?: number; J?: number; A?: number; D?: number }
  huellasDecididas?: string[]
  omitirReglas?: string[]
}

export const UMBRALES_RETEICA = {
  redondeo: UMBRALES_IVA.redondeoPorComponente,
  toleranciaMinima: UMBRALES_IVA.toleranciaMinima,
  /** Base declarada contra la base que explican las retenciones (créditos ÷ tarifa): margen del 5 %. */
  margenBasePct: 5,
  /** Tarifa implícita del formulario cuando el municipio no tiene tabla de tarifas (por mil). */
  rangoSinTabla: [1, 15] as [number, number],
  /** Tolerancia al reconocer una tarifa por mil admisible. */
  toleranciaTarifa: 0.05,
  variacionPct: 50,
  maxFilas: 300,
} as const

export const PROGRAMA_AGENTE_RETEICA: PasoAgenteIva[] = [
  { id: 'formulario', texto: 'Verificar la coherencia del formulario y la tarifa implícita', detalle: 'Total a pagar contra sus componentes; retenciones ÷ base por mil contra las tarifas del municipio; retención sin base, base sin retención y devoluciones.', reglas: ['RI-01', 'RI-02', 'RI-03', 'RI-04'], insumos: ['borrador'], checklistItem: 'tarifas-actividad' },
  { id: 'libros', texto: 'Conciliar retenciones, devoluciones y bases contra la 2368 del municipio', detalle: 'Retenciones practicadas contra los créditos de las subcuentas del municipio; devoluciones contra los débitos a proveedores; base declarada contra la base que explican las retenciones a su tarifa.', reglas: ['RI-05', 'RI-10', 'RI-11', 'RI-12', 'RI-13'], insumos: ['borrador', 'auxiliar'], checklistItem: 'bases-contabilidad' },
  { id: 'tarifas', texto: 'Verificar las tarifas aplicadas por subcuenta y por proveedor', detalle: 'Tarifa por mil de cada subcuenta del municipio contra las tarifas admisibles; detalle por proveedor cuando el libro trae terceros.', reglas: ['RI-15'], insumos: ['auxiliar'], checklistItem: 'tarifas-actividad' },
  { id: 'territorialidad', texto: 'Revisar la territorialidad de las retenciones contabilizadas', detalle: 'Retenciones de ICA de otros municipios en la 2368 y si la empresa tiene la declaración de esos municipios en la plataforma.', reglas: ['RI-20'], insumos: ['auxiliar'], checklistItem: 'territorialidad' },
  { id: 'periodo-anterior', texto: 'Comparar con la declaración del bimestre anterior', detalle: 'Variación de las retenciones y de la base frente al período anterior.', reglas: ['RI-30'], insumos: ['borrador', 'anterior'], checklistItem: null },
  { id: 'oportunidad', texto: 'Confirmar presentación, sanciones y pago', detalle: 'Fecha de presentación contra el vencimiento del calendario municipal; sanciones liquidadas; pago del total.', reglas: ['RI-31', 'RI-32'], insumos: ['borrador'], checklistItem: 'presentacion-pago' },
]

export function programaSugeridoReteica(): ProgramaRevision {
  return { pasos: PROGRAMA_AGENTE_RETEICA.map((p) => ({ id: p.id, texto: p.texto, origen: 'agente' as const, activo: true })) }
}

export function reglasOmitidasReteica(programa: ProgramaRevision | null): string[] {
  if (!programa) return []
  const inactivos = new Set(programa.pasos.filter((p) => p.origen === 'agente' && !p.activo).map((p) => p.id))
  return PROGRAMA_AGENTE_RETEICA.filter((p) => inactivos.has(p.id)).flatMap((p) => p.reglas)
}

const fmt = (n: number) => `$${Math.round(Math.abs(n)).toLocaleString('es-CO')}`
const porMil = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString('es-CO')} ‰`
const pct = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString('es-CO')} %`
const tol = (componentes = 1) => Math.max(UMBRALES_RETEICA.toleranciaMinima, componentes * UMBRALES_RETEICA.redondeo)
const ETIQUETA = new Map(CIFRAS_CATALOGO.reteica.flatMap((s) => s.renglones).map((r) => [r.id, r.label]))
const DIGITABLES = CIFRAS_CATALOGO.reteica.flatMap((s) => s.renglones).filter((r) => r.tipo === 'digitable').map((r) => r.id)

export function correrRevisionReteica(entrada: EntradaCorridaReteica): ResultadoCorridaIva {
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
      contenido: { ...p.contenido, tributario: { renglonId: p.renglonId, casilla: null, checklistItem: p.checklistItem, cuentaAuxiliar: p.cuenta ?? null, cedula: p.cedula, ...(p.contenido.tributario ?? {}) } },
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
  const R = resolverCifras('reteica', cifras)
  const dec = (id: string) => R[id]?.declarado ?? null
  const lib = (id: string) => R[id]?.libros ?? null
  const declarados = DIGITABLES.filter((id) => cifras[id].declarado !== null).length
  bit.push({ tipo: 'lectura', texto: `Declaración de reteICA ${entrada.periodo.etiqueta}: ${declarados} renglón(es) con valor declarado.`, referencia: { paso: 'P-01' } })
  const municipio = L?.municipio ? municipioPorClave(L.municipio) : null
  const nombreMun = L?.municipio ? nombreMunicipio(L.municipio) : null

  // ─── Cédulas ──────────────────────────────────────────────────────────────
  type Tabla = { id: string; titulo: string; columnas: ColumnaCedula[]; descripcion?: string }
  const fuenteBorrador = `Declaración de reteICA ${nombreMun ? `de ${nombreMun} ` : ''}de ${entrada.periodo.etiqueta} (columna Declarado)`
  const fuenteLibros = entrada.fuentes?.length ? entrada.fuentes.map((f) => `${f.nombre} (${f.archivo})`).join(', ') : 'Según libros guardado en la revisión'
  const cedulaDePaso = (id: string, fase: CedulaBorrador['fase'], objetivo: string, criterio: string, fuentes: string[]): CedulaBorrador => {
    const d = PROGRAMA_AGENTE_RETEICA.find((x) => x.id === id)!
    const c = nuevaCedula({ id, pasoId: id, fase, titulo: d.texto, objetivo, criterio, fuentes, reglas: d.reglas, checklistItem: d.checklistItem })
    if (d.reglas.every((r) => omitidas.has(r))) { c.estado = 'omitida'; c.motivo = 'Paso desactivado por el auditor en el programa.' }
    return c
  }
  const tolTexto = `Tolerancia: redondeo a miles del formulario (mínimo ${fmt(UMBRALES_RETEICA.toleranciaMinima)}).`
  const tarifasTexto = municipio?.tarifas ? `Tarifas admisibles de ${municipio.nombre}: ${municipio.tarifas.map((t) => t.toLocaleString('es-CO')).join(', ')} por mil.` : `Sin tabla de tarifas del municipio: se acepta una tarifa implícita entre ${UMBRALES_RETEICA.rangoSinTabla[0]} y ${UMBRALES_RETEICA.rangoSinTabla[1]} por mil.`
  const C = {
    formulario: cedulaDePaso('formulario', 'formulario', 'Comprobar que el borrador es coherente por sí mismo: que el total sale de sus componentes, que la retención corresponde a una tarifa posible sobre la base y que las devoluciones tienen sentido.', `Normativa del municipio sobre retención de ICA (en Bogotá, Acuerdo 65 de 2002 y Decreto 352 de 2002). ${tarifasTexto}`, [fuenteBorrador]),
    lectura: nuevaCedula({ id: 'lectura-libros', pasoId: null, fase: 'libros', titulo: 'Leer la 2368 por municipio y tarifa', objetivo: 'Dejar a la vista qué se leyó de la contabilidad: de qué municipio y a qué tarifa es cada subcuenta de ICA retenido, y cómo se separaron retenciones, devoluciones y pagos.', criterio: 'Municipio y tarifa por el nombre de la subcuenta (o de su cuenta), con la memoria de la empresa por encima. Créditos = retenciones del período; débitos a proveedores = devoluciones; débitos al municipio = pago de la declaración anterior.', fuentes: [fuenteLibros], reglas: ['P-02', 'P-03', 'RI-05'], checklistItem: null }),
    libros: cedulaDePaso('libros', 'cruce', `Verificar que las retenciones, devoluciones y bases declaradas${nombreMun ? ` a ${nombreMun}` : ''} son las que la contabilidad registró en el período.`, `${tolTexto} Base: margen del ${UMBRALES_RETEICA.margenBasePct} % contra la base que explican las retenciones a la tarifa de su subcuenta.`, [fuenteBorrador, fuenteLibros]),
    tarifas: cedulaDePaso('tarifas', 'detalle', 'Verificar que cada tarifa por mil aplicada es una de las admisibles del municipio y ver a qué proveedores se les retuvo.', tarifasTexto, [fuenteLibros]),
    territorialidad: cedulaDePaso('territorialidad', 'analitica', 'Identificar retenciones de ICA de otros municipios contabilizadas en el período y si la empresa tiene la declaración de cada uno.', 'La retención se declara en el municipio donde se ejecuta la actividad gravada; cada municipio con retenciones exige su propia declaración.', [fuenteLibros, 'Obligaciones de reteICA de la empresa en la plataforma']),
    anterior: cedulaDePaso('periodo-anterior', 'analitica', 'Comparar con el bimestre anterior para identificar variaciones que necesitan explicación.', `Procedimiento analítico (NIA 520): se espera una variación inferior al ${UMBRALES_RETEICA.variacionPct} %.`, [fuenteBorrador, entrada.anterior ? `Revisión de ${entrada.anterior.etiqueta} en la plataforma` : 'Sin revisión del período anterior']),
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

  // ─── Bloque A · formulario ────────────────────────────────────────────────
  const base = dec('ri-base')
  const ret = dec('ri-retenciones')
  const baseAr = dec('ri-base-autorretencion')
  const ar = dec('ri-autorretenciones')
  const devol = dec('ri-devoluciones')
  if (declarados === 0) limitaciones.push({ regla: 'P-01', motivo: 'Sin cifras declaradas: solo corren las reglas sobre libros.' })
  if (dec('ri-total') !== null) {
    itemsConDatos.add('tarifas-actividad')
    regla('RI-01', `RI-01: total a pagar recalculado ${fmt(dec('ri-total')!)} (retenciones + autorretenciones − devoluciones + sanciones).`)
    fila(C.formulario, T_PRUEBAS, { prueba: 'Total a pagar recalculado', dato: 'Retenciones + autorretenciones − devoluciones + sanciones', valor: dec('ri-total') }, 'informativo', { regla: 'RI-01' })
    C.formulario.limitaciones.push('Cada municipio tiene su formulario: el total se recalcula desde los renglones leídos, no se compara contra la casilla del total del formulario.')
  }
  const pares: [string, number | null, number | null, string, string][] = [['ri-retenciones', ret, base, 'retención', 'ri-base'], ['ri-autorretenciones', ar, baseAr, 'autorretención', 'ri-base-autorretencion']]
  for (const [id, valor, b, que, idBase] of pares) {
    if (valor === null && b === null) continue
    itemsConDatos.add('tarifas-actividad')
    if ((valor ?? 0) > 0 && !(b && b > 0)) {
      regla('RI-03', `RI-03: ${que} ${fmt(valor!)} sin base.`)
      const pr = proponer({
        cedula: 'formulario', tipo: 'hallazgo', reglasIds: ['RI-03'], titulo: `${que[0].toUpperCase()}${que.slice(1)} declarada sin base`, renglonId: id, monto: valor, severidad: 'media', certeza: 'verificado',
        datos: [{ etiqueta: que, valor: fmt(valor!) }, { etiqueta: 'base', valor: fmt(b ?? 0) }], checklistItem: 'tarifas-actividad',
        contenido: { descripcion: `La declaración trae ${fmt(valor!)} de ${que} y la base (${ETIQUETA.get(idBase)}) está en cero o vacía.`, norma: 'Formulario de retención de ICA del municipio: cada retención se declara con su base.', recomendacion: 'Completar la base en el borrador.' },
        bitacora: [{ tipo: 'regla', texto: `RI-03: ${que} sin base.`, referencia: { regla: 'RI-03' } }],
      })
      fila(C.formulario, T_PRUEBAS, { prueba: `${que[0].toUpperCase()}${que.slice(1)} con su base`, dato: 'Sin base declarada', valor }, 'diferencia', { regla: 'RI-03', propuesta: pr })
      continue
    }
    if ((b ?? 0) > 0 && !(valor && valor > 0)) {
      regla('RI-03', `RI-03: base ${fmt(b!)} sin ${que}.`)
      const pr = proponer({
        cedula: 'formulario', tipo: 'juicio', reglasIds: ['RI-03'], titulo: `Base declarada sin ${que}`, renglonId: idBase, monto: b, severidad: 'baja', certeza: 'requiere_evidencia',
        datos: [{ etiqueta: 'base', valor: fmt(b!) }], checklistItem: 'tarifas-actividad',
        contenido: { descripcion: `La declaración trae una base de ${fmt(b!)} y ninguna ${que}.`, para: 'Confirmar si los pagos estaban bajo la base mínima del municipio o si faltó practicar la retención.', opciones: [{ clave: 'ok', label: 'Es correcto' }, { clave: 'revisar', label: 'Hay que revisarlo' }] },
        bitacora: [{ tipo: 'regla', texto: `RI-03: base sin ${que}.`, referencia: { regla: 'RI-03' } }],
      })
      fila(C.formulario, T_PRUEBAS, { prueba: `${que[0].toUpperCase()}${que.slice(1)} con su base`, dato: `Base sin ${que}`, valor: b }, 'por_confirmar', { regla: 'RI-03', propuesta: pr })
      continue
    }
    if (id !== 'ri-retenciones' || !valor || !b) continue
    const implicita = (valor / b) * 1000
    const adm = municipio?.tarifas ?? null
    const [min, max] = adm ? [Math.min(...adm), Math.max(...adm)] : UMBRALES_RETEICA.rangoSinTabla
    const dentro = implicita >= min - UMBRALES_RETEICA.toleranciaTarifa && implicita <= max + UMBRALES_RETEICA.toleranciaTarifa
    regla('RI-02', `RI-02: retenciones ${fmt(valor)} ÷ base ${fmt(b)} = ${porMil(implicita)}; rango ${porMil(min)} a ${porMil(max)}.`)
    if (dentro) {
      fila(C.formulario, T_PRUEBAS, { prueba: 'Tarifa implícita (retenciones ÷ base)', dato: `${porMil(implicita)}, dentro de ${porMil(min)} a ${porMil(max)}`, valor }, 'conforme', { regla: 'RI-02', nota: 'Es un promedio ponderado de las tarifas aplicadas: el detalle por tarifa está en el procedimiento de tarifas.' })
    } else {
      const pr = proponer({
        cedula: 'formulario', tipo: 'juicio', reglasIds: ['RI-02'], titulo: `Tarifa implícita de ${porMil(implicita)} fuera del rango del municipio`, renglonId: 'ri-retenciones', monto: null, severidad: 'media', certeza: 'requiere_evidencia',
        datos: [{ etiqueta: 'retenciones', valor: fmt(valor) }, { etiqueta: 'base', valor: fmt(b) }, { etiqueta: 'tarifa implícita', valor: porMil(implicita) }, { etiqueta: 'rango', valor: `${porMil(min)} a ${porMil(max)}` }], checklistItem: 'tarifas-actividad',
        contenido: { descripcion: `Las retenciones declaradas equivalen al ${porMil(implicita)} de la base, fuera del rango de tarifas del municipio (${porMil(min)} a ${porMil(max)}).`, para: 'Revisar si la base incluye pagos no sujetos o si se aplicaron tarifas equivocadas.', opciones: [{ clave: 'ok', label: 'Explicado' }, { clave: 'revisar', label: 'Hay que revisarlo' }] },
        bitacora: [{ tipo: 'regla', texto: `RI-02: ${porMil(implicita)} fuera de ${porMil(min)}–${porMil(max)}.`, referencia: { regla: 'RI-02' } }],
      })
      fila(C.formulario, T_PRUEBAS, { prueba: 'Tarifa implícita (retenciones ÷ base)', dato: `${porMil(implicita)}, fuera de ${porMil(min)} a ${porMil(max)}`, valor }, 'por_confirmar', { regla: 'RI-02', propuesta: pr })
    }
  }
  if (devol !== null && devol > 0) {
    itemsConDatos.add('tarifas-actividad')
    const excede = ret !== null && devol > ret
    regla('RI-04', `RI-04: descuento por devoluciones ${fmt(devol)}${excede ? `, superior a las retenciones (${fmt(ret!)})` : ''}.`)
    const pr = proponer({
      cedula: 'formulario', tipo: excede ? 'hallazgo' : 'juicio', reglasIds: ['RI-04'], titulo: excede ? 'Devoluciones superiores a las retenciones del período' : 'Descuento por devolución de retenciones', renglonId: 'ri-devoluciones', monto: devol, severidad: excede ? 'alta' : 'baja', certeza: excede ? 'verificado' : 'requiere_evidencia',
      datos: [{ etiqueta: 'devoluciones', valor: fmt(devol) }, { etiqueta: 'retenciones', valor: fmt(ret ?? 0) }], checklistItem: 'tarifas-actividad',
      contenido: excede
        ? { descripcion: `El descuento por devoluciones (${fmt(devol)}) supera las retenciones practicadas (${fmt(ret ?? 0)}).`, norma: 'Las devoluciones solo se descuentan de las retenciones del mismo período.', recomendacion: 'Revisar el borrador.' }
        : { descripcion: `El borrador descuenta ${fmt(devol)} por devolución de retenciones. Solo procede por anulación, rescisión o resolución de la operación, o por retención en exceso, con soporte.`, para: 'Confirmar el soporte de las devoluciones (nota crédito, reintegro al proveedor).', opciones: [{ clave: 'ok', label: 'Soportadas' }, { clave: 'revisar', label: 'Pedir el soporte' }] },
      bitacora: [{ tipo: 'regla', texto: `RI-04: devoluciones ${fmt(devol)}.`, referencia: { regla: 'RI-04' } }],
    })
    fila(C.formulario, T_PRUEBAS, { prueba: 'Descuento por devolución de retenciones', dato: excede ? 'Supera las retenciones del período' : 'Requiere soporte', valor: devol }, excede ? 'diferencia' : 'por_confirmar', { regla: 'RI-04', propuesta: pr })
  }

  // ─── Lectura de libros ────────────────────────────────────────────────────
  const opcionesMunicipio = [
    ...(L?.municipios ?? []).map((m) => ({ clave: m.municipio, label: nombreMunicipio(m.municipio) })),
    ...MUNICIPIOS_RETEICA.filter((m) => !(L?.municipios ?? []).some((x) => x.municipio === m.clave)).map((m) => ({ clave: m.clave, label: m.nombre })),
  ]
  if (L) {
    for (const linea of L.bitacora) bit.push({ tipo: 'lectura', texto: linea, referencia: { paso: 'P-02' } })
    for (const f of entrada.fuentes ?? []) fila(C.lectura, { id: 'fuentes', titulo: 'Archivos leídos', columnas: [{ clave: 'nombre', titulo: 'Soporte', formato: 'texto' }, { clave: 'archivo', titulo: 'Archivo', formato: 'texto' }, { clave: 'registros', titulo: 'Registros del período', formato: 'numero' }, { clave: 'cuentas', titulo: 'Cuentas', formato: 'numero' }] }, { nombre: f.nombre, archivo: f.archivo, registros: f.registros, cuentas: f.cuentas }, 'informativo')
    // RI-05 municipio de la declaración.
    const origenTexto = { obligacion: 'por el nombre de la obligación', memoria: 'elegido por la firma', 'unico-en-libros': 'único municipio con retención en libros' } as const
    if (L.municipio) {
      regla('RI-05', `RI-05: la declaración es de ${nombreMun} (${origenTexto[L.municipioOrigen!]}).`)
      fila(C.lectura, T_PUNTOS, { punto: 'Municipio de la declaración', dato: `${nombreMun}, ${origenTexto[L.municipioOrigen!]}`, valor: null }, 'conforme', { regla: 'RI-05' })
    } else if (L.municipios.length > 1) {
      regla('RI-05', `RI-05: hay retención de ${L.municipios.length} municipios en libros y no se sabe de cuál es la declaración.`)
      const pr = proponer({
        cedula: 'lectura-libros', tipo: 'ambiguedad', reglasIds: ['RI-05'], titulo: '¿De qué municipio es esta declaración?', renglonId: null, monto: null, severidad: 'alta', certeza: 'no_verificable',
        datos: L.municipios.map((m) => ({ etiqueta: nombreMunicipio(m.municipio), valor: fmt(m.retencion) })), checklistItem: null, cuenta: `obligacion:${entrada.obligacionId}`,
        contenido: { descripcion: `La 2368 tiene retenciones de ${L.municipios.map((m) => nombreMunicipio(m.municipio)).join(', ')}, y ni el nombre de la obligación ni la memoria de la empresa dicen a qué municipio corresponde esta declaración.`, para: 'Sin el municipio no se puede cruzar contra libros. La respuesta queda en la memoria de la empresa para los siguientes bimestres; también puedes ponerle el municipio al nombre de la obligación.', opciones: opcionesMunicipio, destino: 'memoria', tributario: { memoriaClave: 'mapeo2368' } },
        bitacora: [{ tipo: 'regla', texto: 'RI-05: municipio de la declaración sin establecer.', referencia: { regla: 'RI-05' } }],
      })
      fila(C.lectura, T_PUNTOS, { punto: 'Municipio de la declaración', dato: 'Sin establecer: varios municipios en libros', valor: null }, 'por_confirmar', { regla: 'RI-05', propuesta: pr })
    } else {
      fila(C.lectura, T_PUNTOS, { punto: 'Municipio de la declaración', dato: 'Sin retenciones de ICA en libros', valor: null }, 'no_verificable', { regla: 'RI-05' })
    }
    const propSin = new Map<string, Prop>()
    for (const c of L.sinClasificar) {
      propSin.set(c.cuenta, proponer({
        cedula: 'lectura-libros', tipo: 'ambiguedad', reglasIds: ['P-03'], titulo: `Subcuenta ${c.cuenta} de ICA retenido sin municipio`, renglonId: null, monto: null, severidad: 'media', certeza: 'no_verificable',
        datos: [{ etiqueta: 'cuenta', valor: `${c.cuenta} ${c.nombre ?? ''}`.trim() }, { etiqueta: 'créditos', valor: fmt(c.creditos) }], checklistItem: null, cuenta: c.cuenta,
        contenido: { descripcion: `La subcuenta ${c.cuenta} "${c.nombre ?? ''}" mueve ${fmt(c.creditos)} en créditos y su nombre no dice de qué municipio es.`, para: 'Sin el municipio, esa retención no se cruza contra ninguna declaración.', opciones: [...opcionesMunicipio, { clave: 'ignorar', label: 'No es retención de ICA del período' }], destino: 'memoria', tributario: { memoriaClave: 'mapeo2368' } },
        bitacora: [{ tipo: 'clasificacion', texto: 'Ningún municipio en el nombre de la subcuenta ni de su cuenta (P-03).', referencia: { paso: 'P-03' } }],
      }))
    }
    const tSub: Tabla = { id: 'subcuentas', titulo: 'Clasificación de las subcuentas de 2368', descripcion: 'Municipio, tipo y tarifa de cada subcuenta, con lo que movió en el período.', columnas: [{ clave: 'cuenta', titulo: 'Subcuenta', formato: 'texto' }, { clave: 'nombre', titulo: 'Nombre', formato: 'texto' }, { clave: 'municipio', titulo: 'Municipio', formato: 'texto' }, { clave: 'tarifa', titulo: 'Tarifa ‰', formato: 'numero' }, { clave: 'creditos', titulo: 'Retenido', formato: 'moneda' }, { clave: 'debitos', titulo: 'Devuelto a proveedores', formato: 'moneda' }, { clave: 'pagos', titulo: 'Pagado al municipio', formato: 'moneda' }] }
    for (const s of L.subcuentas) {
      const saldo = s.tipo === 'saldo'
      fila(C.lectura, tSub, { cuenta: s.cuenta, nombre: s.nombre ?? '', municipio: s.municipio ? nombreMunicipio(s.municipio) : 'Sin municipio', tarifa: s.tarifa, creditos: saldo ? null : Math.round(s.creditos), debitos: saldo || !L.conTerceros ? null : Math.round(s.debitosTerceros), pagos: L.conTerceros ? Math.round(s.pagos) : null },
        !s.municipio && !saldo ? 'por_confirmar' : 'informativo', { regla: 'P-03', propuesta: propSin.get(s.cuenta) ?? null, nota: s.motivo })
    }
  } else {
    C.lectura.estado = 'sin_insumos'
    C.lectura.motivo = 'No se cargó auxiliar ni balance de prueba de la 2368 en este análisis.'
  }
  const hayLibros = !!L?.municipio || DIGITABLES.some((id) => cifras[id].libros !== null)
  if (!hayLibros) limitaciones.push({ regla: 'RI-10..RI-13', motivo: L ? 'No se estableció el municipio de la declaración: no se cruzó contra libros.' : 'Sin libros de la 2368: no se comparó contra la contabilidad.' })

  // ─── Bloque B · libros contra formulario ──────────────────────────────────
  const comparar = (reglaId: string, id: string, d: number | null, l: number | null, titulo: string, norma: string) => {
    if (d === null && l === null) return
    itemsConDatos.add('bases-contabilidad')
    const declarado = d ?? 0
    const libros = l ?? 0
    const dif = declarado - libros
    const t = tol()
    regla(reglaId, `${reglaId}: ${ETIQUETA.get(id)} declarado ${fmt(declarado)} vs libros ${fmt(libros)}; diferencia ${fmt(dif)}.`)
    const valores = { partida: ETIQUETA.get(id) ?? id, declarado, libros, diferencia: dif, tolerancia: t }
    if (Math.abs(dif) <= t) { fila(C.libros, T_CRUCE, valores, 'conforme', { regla: reglaId }); return }
    const sev = severidadPorProporcion(dif, Math.max(Math.abs(declarado), Math.abs(libros)))
    const pr = proponer({
      cedula: 'libros', tipo: 'hallazgo', reglasIds: [reglaId], titulo, renglonId: id, monto: Math.abs(dif), severidad: sev.severidad, certeza: 'verificado',
      datos: [{ etiqueta: 'declarado', valor: fmt(declarado) }, { etiqueta: 'según libros', valor: fmt(libros) }, { etiqueta: 'diferencia', valor: `${dif < 0 ? '−' : ''}${fmt(dif)}` }], checklistItem: 'bases-contabilidad',
      contenido: {
        descripcion: `${ETIQUETA.get(id)}: la declaración${nombreMun ? ` de ${nombreMun}` : ''} trae ${fmt(declarado)} y la 2368 registra ${fmt(libros)} en el período. Diferencia de ${fmt(dif)} (${pct(sev.proporcion)}).`,
        norma, recomendacion: dif < 0 ? 'Hay retenciones contabilizadas que no llegaron a la declaración: corregir el borrador antes de presentar.' : 'Hay valores declarados que no están en la contabilidad del municipio: identificar los asientos o corregir el borrador.',
      },
      bitacora: [{ tipo: 'contraste', texto: `${reglaId}: diferencia ${fmt(dif)} por encima de ${fmt(t)}.`, referencia: { regla: reglaId } }, { tipo: 'clasificacion', texto: `Severidad ${sev.severidad.toUpperCase()}: ${sev.explicacion}.` }],
    })
    fila(C.libros, T_CRUCE, valores, 'diferencia', { regla: reglaId, propuesta: pr })
  }
  if (hayLibros) {
    comparar('RI-10', 'ri-retenciones', ret, lib('ri-retenciones'), 'Retenciones declaradas y contabilizadas no coinciden', 'Retención de ICA del municipio: se declara lo retenido en el período.')
    if (L ? L.conTerceros : lib('ri-devoluciones') !== null) {
      comparar('RI-11', 'ri-devoluciones', devol, lib('ri-devoluciones'), 'Devoluciones declaradas y débitos a proveedores no coinciden', 'Las devoluciones de retención se descuentan con soporte y deben estar reversadas en la 2368.')
    } else if (devol) {
      C.libros.limitaciones.push('Sin detalle por tercero no se pueden separar las devoluciones a proveedores del pago al municipio: el descuento por devoluciones no se cruzó contra libros.')
    }
    if (ar !== null || lib('ri-autorretenciones') !== null) comparar('RI-12', 'ri-autorretenciones', ar, lib('ri-autorretenciones'), 'Autorretenciones declaradas y contabilizadas no coinciden', 'Autorretención de ICA del municipio.')
    // RI-13 base declarada vs base que explican las retenciones.
    if (base !== null && L?.municipio) {
      itemsConDatos.add('bases-contabilidad')
      const T_BASE: Tabla = { id: 'base', titulo: 'Base declarada contra la base que explican las retenciones', descripcion: 'Cada subcuenta del municipio retiene a una tarifa: retenido ÷ tarifa es la base de esa subcuenta.', columnas: [{ clave: 'partida', titulo: 'Concepto', formato: 'texto' }, { clave: 'declarado', titulo: 'Base declarada', formato: 'moneda' }, { clave: 'libros', titulo: 'Base explicada', formato: 'moneda' }, { clave: 'diferencia', titulo: 'Diferencia', formato: 'moneda' }, { clave: 'pct', titulo: '%', formato: 'porcentaje' }] }
      if (L.baseExplicada === null) {
        fila(C.libros, T_BASE, { partida: 'Base de retenciones', declarado: base, libros: null, diferencia: null, pct: null }, 'no_verificable', { regla: 'RI-13', nota: 'Alguna subcuenta del municipio no dice su tarifa en el nombre: no se puede reconstruir la base.' })
      } else {
        const dif = base - L.baseExplicada
        const p = L.baseExplicada ? (dif / L.baseExplicada) * 100 : 100
        regla('RI-13', `RI-13: base declarada ${fmt(base)} vs base explicada ${fmt(L.baseExplicada)} (${pct(p)}).`)
        const valores = { partida: 'Base de retenciones', declarado: base, libros: L.baseExplicada, diferencia: dif, pct: p }
        if (Math.abs(p) <= UMBRALES_RETEICA.margenBasePct) {
          fila(C.libros, T_BASE, valores, 'conforme', { regla: 'RI-13' })
        } else {
          const pr = proponer({
            cedula: 'libros', tipo: 'juicio', reglasIds: ['RI-13'], titulo: `La base declarada difiere ${pct(p)} de la que explican las retenciones`, renglonId: 'ri-base', monto: Math.abs(dif), severidad: 'media', certeza: 'requiere_evidencia',
            datos: [{ etiqueta: 'base declarada', valor: fmt(base) }, { etiqueta: 'base explicada', valor: fmt(L.baseExplicada) }], checklistItem: 'bases-contabilidad',
            contenido: { descripcion: `La base declarada (${fmt(base)}) difiere en ${fmt(dif)} (${pct(p)}) de la que resulta de dividir lo retenido en cada subcuenta por su tarifa (${fmt(L.baseExplicada)}).`, para: 'Puede ser una tarifa mal aplicada en algún pago o una base mal sumada en el borrador.', opciones: [{ clave: 'ok', label: 'Explicado' }, { clave: 'revisar', label: 'Revisar la base' }] },
            bitacora: [{ tipo: 'contraste', texto: `RI-13: ${pct(p)} fuera del margen de ${UMBRALES_RETEICA.margenBasePct} %.`, referencia: { regla: 'RI-13' } }],
          })
          fila(C.libros, T_BASE, valores, 'por_confirmar', { regla: 'RI-13', propuesta: pr })
        }
      }
    }
  } else {
    for (const c of [C.libros, C.tarifas, C.territorialidad]) if (c.estado === 'ejecutada') { c.estado = 'sin_insumos'; c.motivo = L ? 'No se estableció el municipio de la declaración.' : 'Sin libros de la 2368: no se comparó contra la contabilidad.' }
  }

  // ─── Tarifas por subcuenta y proveedor ────────────────────────────────────
  if (L?.municipio) {
    const propias = L.subcuentas.filter((s) => s.municipio === L.municipio && s.tipo === 'retencion' && (s.creditos || s.debitosTerceros))
    const adm = municipio?.tarifas ?? null
    const fuera = adm ? propias.filter((s) => s.tarifa !== null && !adm.some((t) => Math.abs(t - s.tarifa!) <= UMBRALES_RETEICA.toleranciaTarifa)) : []
    if (propias.length) itemsConDatos.add('tarifas-actividad')
    regla('RI-15', `RI-15: ${propias.length} subcuenta(s) de ${nombreMun}; ${adm ? `${fuera.length} con tarifa fuera de las admisibles` : 'sin tabla de tarifas del municipio'}.`)
    let prFuera: Prop | null = null
    if (fuera.length) {
      prFuera = proponer({
        cedula: 'tarifas', tipo: 'juicio', reglasIds: ['RI-15'], titulo: `${fuera.length} subcuenta(s) con tarifa que no es de las admisibles de ${nombreMun}`, renglonId: null, monto: fuera.reduce((x, s) => x + s.creditos, 0), severidad: 'media', certeza: 'requiere_evidencia',
        datos: fuera.map((s) => ({ etiqueta: `${s.cuenta} (${s.tarifa?.toLocaleString('es-CO')} ‰)`, valor: fmt(s.creditos) })), checklistItem: 'tarifas-actividad', cuenta: 'tarifas',
        contenido: { descripcion: `Estas subcuentas retienen a tarifas que no están entre las de ${nombreMun} (${adm!.map((t) => t.toLocaleString('es-CO')).join(', ')} por mil):\n${fuera.map((s) => `• ${s.cuenta} ${s.nombre ?? ''}: ${s.tarifa?.toLocaleString('es-CO')} por mil, ${fmt(s.creditos)}`).join('\n')}`, para: 'Puede ser una tarifa vigente que no está en la tabla de la plataforma, o una tarifa mal parametrizada en el software contable.', opciones: [{ clave: 'ok', label: 'Tarifa correcta' }, { clave: 'revisar', label: 'Revisar con el contador' }] },
        bitacora: [{ tipo: 'regla', texto: `RI-15: tarifas ${fuera.map((s) => s.tarifa).join(', ')} fuera de la tabla.`, referencia: { regla: 'RI-15' } }],
      })
    }
    const tTar: Tabla = { id: 'tarifas', titulo: `Subcuentas de ${nombreMun} por tarifa`, columnas: [{ clave: 'cuenta', titulo: 'Subcuenta', formato: 'texto' }, { clave: 'tarifa', titulo: 'Tarifa ‰', formato: 'numero' }, { clave: 'retencion', titulo: 'Retenido', formato: 'moneda' }, { clave: 'devoluciones', titulo: 'Devuelto', formato: 'moneda' }, { clave: 'base', titulo: 'Base explicada', formato: 'moneda' }] }
    for (const s of propias) {
      const admisible = s.tarifa === null ? null : adm ? adm.some((t) => Math.abs(t - s.tarifa!) <= UMBRALES_RETEICA.toleranciaTarifa) : null
      fila(C.tarifas, tTar, { cuenta: `${s.cuenta} ${s.nombre ?? ''}`.trim(), tarifa: s.tarifa, retencion: Math.round(s.creditos), devoluciones: L.conTerceros ? Math.round(s.debitosTerceros) : null, base: s.baseExplicada === null ? null : Math.round(s.baseExplicada) },
        admisible === null ? 'no_verificable' : admisible ? 'conforme' : 'por_confirmar', { regla: 'RI-15', propuesta: admisible === false ? prFuera : null, nota: s.tarifa === null ? 'El nombre no dice la tarifa.' : admisible === null ? `Sin tabla de tarifas de ${nombreMun}.` : admisible ? null : 'No está entre las tarifas admisibles.' })
    }
    if (L.terceros.length) {
      const tTer = tablaDeCedula(C.tarifas, 'proveedores', 'Retención por proveedor', [{ clave: 'tercero', titulo: 'Proveedor', formato: 'texto' }, { clave: 'nit', titulo: 'NIT', formato: 'texto' }, { clave: 'tarifa', titulo: 'Tarifa ‰', formato: 'numero' }, { clave: 'retencion', titulo: 'Retenido', formato: 'moneda' }, { clave: 'devolucion', titulo: 'Devuelto', formato: 'moneda' }, { clave: 'base', titulo: 'Base explicada', formato: 'moneda' }], 'Lo retenido a cada proveedor en el período, por subcuenta. La base es lo retenido neto dividido por la tarifa.')
      for (const t of L.terceros.slice(0, UMBRALES_RETEICA.maxFilas)) tTer.filas.push({ valores: { tercero: t.nombre ?? '', nit: t.tercero ?? '', tarifa: t.tarifa, retencion: t.retencion, devolucion: t.devolucion, base: t.baseExplicada }, estado: t.devolucion > 0 ? 'por_confirmar' : 'informativo', regla: 'RI-15', propuesta: null, nota: t.devolucion > 0 ? 'Tiene devolución de retención: verificar el soporte.' : null })
      if (L.terceros.length > UMBRALES_RETEICA.maxFilas) tTer.omitidas = L.terceros.length - UMBRALES_RETEICA.maxFilas
    } else {
      C.tarifas.limitaciones.push('El libro no trae el detalle por proveedor: carga el auxiliar o el balance por terceros para verlo.')
    }
    if (!adm) C.tarifas.limitaciones.push(`La plataforma no tiene la tabla de tarifas de ${nombreMun}: las tarifas se muestran pero no se califican.`)
  }

  // ─── Territorialidad ──────────────────────────────────────────────────────
  if (L?.municipio) {
    const otros = L.municipios.filter((m) => m.municipio !== L.municipio && (m.retencion > 0 || m.autorretencion > 0))
    const conObligacion = entrada.municipiosConObligacion ? new Set(entrada.municipiosConObligacion) : null
    itemsConDatos.add('territorialidad')
    const tTerr: Tabla = { id: 'municipios', titulo: 'Retenciones de ICA por municipio en libros', columnas: [{ clave: 'municipio', titulo: 'Municipio', formato: 'texto' }, { clave: 'retencion', titulo: 'Retenido', formato: 'moneda' }, { clave: 'autorretencion', titulo: 'Autorretenido', formato: 'moneda' }, { clave: 'declaracion', titulo: 'Declaración en la plataforma', formato: 'texto' }] }
    fila(C.territorialidad, tTerr, { municipio: `${nombreMun} (esta declaración)`, retencion: Math.round(L.municipios.find((m) => m.municipio === L.municipio)?.retencion ?? 0), autorretencion: Math.round(L.municipios.find((m) => m.municipio === L.municipio)?.autorretencion ?? 0), declaracion: 'Sí' }, 'conforme', { regla: 'RI-20' })
    const sinDecl = conObligacion ? otros.filter((m) => !conObligacion.has(m.municipio)) : []
    regla('RI-20', `RI-20: ${otros.length} municipio(s) más con retención en libros${conObligacion ? `; ${sinDecl.length} sin obligación de reteICA en la plataforma` : ''}.`)
    let prSin: Prop | null = null
    if (sinDecl.length) {
      prSin = proponer({
        cedula: 'territorialidad', tipo: 'juicio', reglasIds: ['RI-20'], titulo: `Retenciones de ICA de ${sinDecl.map((m) => nombreMunicipio(m.municipio)).join(', ')} sin declaración en la plataforma`, renglonId: null, monto: sinDecl.reduce((x, m) => x + m.retencion + m.autorretencion, 0), severidad: 'media', certeza: 'requiere_evidencia',
        datos: sinDecl.map((m) => ({ etiqueta: nombreMunicipio(m.municipio), valor: fmt(m.retencion + m.autorretencion) })), checklistItem: 'territorialidad', cuenta: 'territorialidad',
        contenido: { descripcion: `La 2368 registra retenciones de ICA del período en ${sinDecl.map((m) => `${nombreMunicipio(m.municipio)} (${fmt(m.retencion + m.autorretencion)})`).join(', ')}, y la empresa no tiene la obligación de reteICA de ese municipio en la plataforma.`, para: 'Cada municipio con retenciones exige su declaración. Confirmar que se declaró (y crear la obligación para revisarla) o que la retención se reclasifica.', opciones: [{ clave: 'declarada', label: 'Se declara: crear la obligación' }, { clave: 'revisar', label: 'Revisar la contabilización' }] },
        bitacora: [{ tipo: 'regla', texto: 'RI-20: municipio con retención y sin obligación en la plataforma.', referencia: { regla: 'RI-20' } }],
      })
    }
    for (const m of otros) {
      const tiene = conObligacion ? conObligacion.has(m.municipio) : null
      fila(C.territorialidad, tTerr, { municipio: nombreMunicipio(m.municipio), retencion: Math.round(m.retencion), autorretencion: Math.round(m.autorretencion), declaracion: tiene === null ? 'Sin dato' : tiene ? 'Sí' : 'No' }, tiene === false ? 'por_confirmar' : tiene ? 'conforme' : 'no_verificable', { regla: 'RI-20', propuesta: tiene === false ? prSin : null })
    }
  }

  // ─── Período anterior ─────────────────────────────────────────────────────
  if (entrada.anterior && ret !== null) {
    const RA = resolverCifras('reteica', entrada.anterior.cifras)
    const retAnt = RA['ri-retenciones']?.declarado ?? null
    if (retAnt !== null && retAnt > 0) {
      const T_VAR: Tabla = { id: 'variacion', titulo: `Comparativo con ${entrada.anterior.etiqueta}`, columnas: [{ clave: 'partida', titulo: 'Renglón', formato: 'texto' }, { clave: 'actual', titulo: 'Este período', formato: 'moneda' }, { clave: 'anterior', titulo: 'Período anterior', formato: 'moneda' }, { clave: 'variacion', titulo: 'Variación', formato: 'moneda' }, { clave: 'pct', titulo: '%', formato: 'porcentaje' }] }
      const v = ((ret - retAnt) / retAnt) * 100
      regla('RI-30', `RI-30: retenciones ${fmt(ret)} vs ${fmt(retAnt)} en ${entrada.anterior.etiqueta}: ${pct(v)}.`)
      let pr: Prop | null = null
      if (Math.abs(v) > UMBRALES_RETEICA.variacionPct) {
        pr = proponer({
          cedula: 'periodo-anterior', tipo: 'juicio', reglasIds: ['RI-30'], titulo: `Las retenciones variaron ${pct(v)} frente a ${entrada.anterior.etiqueta}`, renglonId: 'ri-retenciones', monto: Math.abs(ret - retAnt), severidad: 'baja', certeza: 'requiere_evidencia',
          datos: [{ etiqueta: 'este período', valor: fmt(ret) }, { etiqueta: entrada.anterior.etiqueta, valor: fmt(retAnt) }], checklistItem: null,
          contenido: { descripcion: `Las retenciones de ICA pasaron de ${fmt(retAnt)} en ${entrada.anterior.etiqueta} a ${fmt(ret)}: ${pct(v)}.`, para: 'Documentar la causa (pagos extraordinarios, proveedores nuevos, omisiones).', opciones: [{ clave: 'ok', label: 'Explicada por la operación' }, { clave: 'revisar', label: 'Revisar' }] },
          bitacora: [{ tipo: 'contraste', texto: `RI-30: ${pct(v)} > ${UMBRALES_RETEICA.variacionPct} %.`, referencia: { regla: 'RI-30' } }],
        })
      }
      for (const id of ['ri-base', 'ri-retenciones', 'ri-autorretenciones', 'ri-devoluciones', 'ri-total']) {
        const a = dec(id) ?? 0
        const b = RA[id]?.declarado ?? 0
        if (a === 0 && b === 0) continue
        const esRet = id === 'ri-retenciones'
        fila(C.anterior, T_VAR, { partida: ETIQUETA.get(id) ?? id, actual: a, anterior: b, variacion: a - b, pct: b ? ((a - b) / Math.abs(b)) * 100 : null }, esRet ? (pr ? 'por_confirmar' : 'conforme') : 'informativo', { regla: 'RI-30', propuesta: esRet ? pr : null })
      }
    }
  }
  if (C.anterior.estado === 'ejecutada' && C.anterior.tablas.length === 0) {
    C.anterior.estado = 'sin_insumos'
    C.anterior.motivo = 'No hay revisión del bimestre anterior con cifras declaradas en la plataforma.'
    limitaciones.push({ regla: 'RI-30', motivo: C.anterior.motivo })
  }

  // ─── Oportunidad ──────────────────────────────────────────────────────────
  if (entrada.fechaPresentacion && entrada.fechaVencimiento) {
    itemsConDatos.add('presentacion-pago')
    const dato = `Vencimiento ${entrada.fechaVencimiento} · presentación ${entrada.fechaPresentacion}`
    regla('RI-31', `RI-31: presentada ${entrada.fechaPresentacion}, vencía ${entrada.fechaVencimiento}.`)
    if (entrada.fechaPresentacion <= entrada.fechaVencimiento) {
      fila(C.oportunidad, T_PUNTOS, { punto: 'Presentación dentro del plazo', dato, valor: null }, 'conforme', { regla: 'RI-31' })
    } else {
      const pr = proponer({
        cedula: 'oportunidad', tipo: 'hallazgo', reglasIds: ['RI-31'], titulo: 'Declaración presentada después del vencimiento', renglonId: 'ri-sanciones', monto: dec('ri-sanciones'), severidad: 'alta', certeza: 'verificado',
        datos: [{ etiqueta: 'vencimiento', valor: entrada.fechaVencimiento }, { etiqueta: 'presentación', valor: entrada.fechaPresentacion }], checklistItem: 'presentacion-pago',
        contenido: { descripcion: `La declaración se presentó el ${entrada.fechaPresentacion}, después del vencimiento del ${entrada.fechaVencimiento}.${(dec('ri-sanciones') ?? 0) > 0 ? '' : ' No liquida sanción de extemporaneidad.'}`, norma: 'Régimen sancionatorio del municipio (sanción por extemporaneidad e intereses de mora).', recomendacion: 'Verificar la sanción y los intereses liquidados.' },
        bitacora: [{ tipo: 'regla', texto: 'RI-31: presentación > vencimiento.', referencia: { regla: 'RI-31' } }],
      })
      fila(C.oportunidad, T_PUNTOS, { punto: 'Presentación dentro del plazo', dato, valor: null }, 'diferencia', { regla: 'RI-31', propuesta: pr })
    }
  } else {
    fila(C.oportunidad, T_PUNTOS, { punto: 'Presentación dentro del plazo', dato: `Vencimiento ${entrada.fechaVencimiento ?? 'sin registrar'} · presentación ${entrada.fechaPresentacion ?? 'sin registrar'}`, valor: null }, 'no_verificable', { regla: 'RI-31', nota: 'Falta registrar la fecha en la revisión.' })
  }
  const sanciones = dec('ri-sanciones')
  if (sanciones !== null && sanciones > 0) {
    itemsConDatos.add('presentacion-pago')
    regla('RI-32', `RI-32: sanciones ${fmt(sanciones)}.`)
    const pr = proponer({
      cedula: 'oportunidad', tipo: 'juicio', reglasIds: ['RI-32'], titulo: 'Sanción liquidada en el formulario', renglonId: 'ri-sanciones', monto: sanciones, severidad: 'baja', certeza: 'requiere_evidencia',
      datos: [{ etiqueta: 'sanciones', valor: fmt(sanciones) }], checklistItem: 'presentacion-pago',
      contenido: { descripcion: `El borrador liquida ${fmt(sanciones)} de sanciones.`, para: 'Confirmar el motivo y el cálculo.', opciones: [{ clave: 'ok', label: 'Sanción verificada' }, { clave: 'revisar', label: 'Revisar la liquidación' }] },
      bitacora: [{ tipo: 'regla', texto: 'RI-32: sanciones > 0.', referencia: { regla: 'RI-32' } }],
    })
    fila(C.oportunidad, T_PUNTOS, { punto: 'Sanciones liquidadas', dato: 'Renglón de sanciones', valor: sanciones }, 'por_confirmar', { regla: 'RI-32', propuesta: pr })
  } else if (sanciones !== null) {
    fila(C.oportunidad, T_PUNTOS, { punto: 'Sanciones liquidadas', dato: 'Renglón de sanciones', valor: 0 }, 'informativo', { regla: 'RI-32' })
  }
  if ((dec('ri-total') ?? 0) > 0) {
    itemsConDatos.add('presentacion-pago')
    const pr = proponer({
      cedula: 'oportunidad', tipo: 'juicio', reglasIds: ['RI-32'], titulo: 'Confirmar el pago de la declaración', renglonId: 'ri-total', monto: dec('ri-total'), severidad: 'baja', certeza: 'requiere_evidencia',
      datos: [{ etiqueta: 'total a pagar', valor: fmt(dec('ri-total')!) }], checklistItem: 'presentacion-pago',
      contenido: { descripcion: `La declaración liquida ${fmt(dec('ri-total')!)} a pagar.`, para: 'Adjuntar el recibo de pago como soporte de la revisión. Revisar la norma del municipio sobre declaraciones de retención presentadas sin pago.', opciones: [{ clave: 'ok', label: 'Pago verificado' }, { clave: 'pendiente', label: 'Pago pendiente: hacer seguimiento' }], tributario: { nota: 'Pago de la declaración verificado con el recibo adjunto.' } },
      bitacora: [{ tipo: 'regla', texto: 'RI-32: total a pagar > 0 → pedir el soporte de pago.', referencia: { regla: 'RI-32' } }],
    })
    fila(C.oportunidad, T_PUNTOS, { punto: 'Pago del total', dato: 'Requiere el recibo de pago como soporte', valor: dec('ri-total') }, 'por_confirmar', { regla: 'RI-32', propuesta: pr })
  }

  const verificados = ['territorialidad', 'tarifas-actividad', 'bases-contabilidad', 'presentacion-pago'].filter((i) => itemsConDatos.has(i) && !itemsConPropuesta.has(i))
  if (omitidas.size) limitaciones.push({ regla: [...omitidas].sort().join(', '), motivo: `Pasos desactivados por el auditor en el programa: ${propuestasOmitidas} propuesta(s) no se muestran.` })
  limitaciones.push({ regla: 'RI-40', motivo: 'No se cruza contra la facturación electrónica recibida (universo de pagos a proveedores del municipio): etapa siguiente.' })

  const cedulas = [C.formulario, C.lectura, C.libros, C.tarifas, C.territorialidad, C.anterior, C.oportunidad].map(cerrarCedula)
  for (const c of cedulas) if (c.estado === 'ejecutada') bit.push({ tipo: 'regla', texto: `Cédula "${c.titulo}": ${c.resultado.filas} partida(s); ${c.resultado.conformes} conforme(s), ${c.resultado.diferencias} con diferencia, ${c.resultado.porConfirmar} por confirmar.`, referencia: { cedula: c.id } })
  const conteo = (t: TipoPropuesta) => propuestas.filter((p) => p.tipo === t).length
  return {
    propuestas, bitacora: bit, cifrasLibros, cedulas,
    resumen: { reglasEjecutadas: [...reglas].sort(), limitaciones, verificados, hallazgos: conteo('hallazgo'), juicios: conteo('juicio'), ambiguedades: conteo('ambiguedad'), documentos: conteo('documento') },
  }
}
