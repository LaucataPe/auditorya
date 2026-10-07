/**
 * Procedimiento R · Revisión agéntica de la declaración de retención en la
 * fuente (Formulario 350) — lógica PURA y determinista (0 tokens). Implementa
 * las reglas R-xx de docs/agente/procedimiento-retefuente-v1.md sobre el
 * formulario (columna Declarado), el auxiliar o balance de 2365/2367 (Según
 * libros, vía agente-retefuente-libros) y la revisión del mes anterior.
 * Devuelve BORRADORES de propuesta con bitácora, en la misma forma que el
 * procedimiento de IVA, para que el mismo backend los persista, y las CÉDULAS
 * de cada procedimiento (cedulas-tributarias.ts) con todo lo comparado.
 *
 * Criterio de la firma: se audita toda diferencia por encima del redondeo a
 * miles del formulario; la severidad por proporción solo ordena las tarjetas.
 * Supuestos marcados PENDIENTE DE VALIDAR en la spec: jurídica/natural por NIT,
 * rete-IVA practicada en 2367, autorretención en 236575, tarifas 2025.
 */
import { CIFRAS_CATALOGO, resolverCifras, type CifrasRevision, type Periodicidad, type ProgramaRevision } from './tributario'
import type { MapeoLibrosRetefuente } from './agente-retefuente-libros'
import { OPCIONES_CONCEPTO_RETEFUENTE } from './agente-retefuente-libros'
import { TARIFAS_RETEFUENTE, UVT_POR_ANIO, cuantiaMinima, tarifaAdmisible } from './tarifas-retefuente'
import type { CertezaPropuesta, ContenidoPropuesta, DatoPropuesta, LineaBitacora, SeveridadPropuesta, TipoPropuesta } from './agente'
import { huellaPropuesta, type PropuestaBorrador } from './agente-balance'
import { severidadPorProporcion, UMBRALES_IVA, type PasoAgenteIva, type ResultadoCorridaIva } from './agente-iva'
import { ALERTA_TERCERO_LABEL, CONCEPTO_BASE_LABEL, UMBRALES_TERCEROS, type AlertaTercero } from './agente-retefuente-terceros'
import { cerrarCedula, nuevaCedula, tablaDeCedula, type CedulaBorrador, type ColumnaCedula, type EstadoFilaCedula, type FilaCedula } from './cedulas-tributarias'

type LineaBorrador = Omit<LineaBitacora, 'numero' | 'actor'> & { actor?: 'agente' }

export type EntradaCorridaRetefuente = {
  periodo: { desde: string; hasta: string; etiqueta: string; periodicidad: Periodicidad; anio: number }
  cifras: CifrasRevision
  libros?: MapeoLibrosRetefuente | null
  /** Revisión del mes anterior (misma obligación), para la consistencia mes a mes. */
  anterior?: { etiqueta: string; cifras: CifrasRevision } | null
  advertenciasLectura?: string[]
  /** Archivos leídos en el navegador, para la cédula de lectura de libros. */
  fuentes?: { nombre: string; archivo: string; registros: number; cuentas: number }[]
  /** Fechas registradas en la revisión, para la oportunidad (art. 580-1 ET). */
  fechaVencimiento?: string | null
  fechaPresentacion?: string | null
  numeracion?: { H?: number; J?: number; A?: number; D?: number }
  huellasDecididas?: string[]
  omitirReglas?: string[]
}

export type ResultadoCorridaRetefuente = ResultadoCorridaIva

export const UMBRALES_RETEFUENTE = {
  redondeoPorComponente: UMBRALES_IVA.redondeoPorComponente,
  toleranciaMinima: UMBRALES_IVA.toleranciaMinima,
  /** Tarifa implícita del formulario (retención / base): 0,1 punto porcentual. */
  toleranciaTarifaPuntos: 0.1,
  /** Variación mes a mes del total retenido que amerita explicación. */
  variacionMensualPct: 50,
} as const

// ─── Programa del agente para el 350 ─────────────────────────────────────────

export const PROGRAMA_AGENTE_RETEFUENTE: PasoAgenteIva[] = [
  { id: 'formulario', texto: 'Verificar la aritmética del formulario y la tarifa implícita de cada casilla', detalle: 'Totales del 350 contra sus componentes; retención ÷ base por concepto y beneficiario contra las tarifas admisibles; bases sin retención y retenciones sin base.', reglas: ['R-01', 'R-02', 'R-03'], insumos: ['borrador'], checklistItem: 'tarifas-conceptos' },
  { id: 'libros-renta', texto: 'Conciliar las retenciones a título de renta contra la 2365 por concepto y beneficiario', detalle: 'Total de la casilla 130 y cada concepto (honorarios, servicios, compras…) contra las subcuentas de 2365; bases cuando el auxiliar las trae.', reglas: ['R-10', 'R-11', 'R-14'], insumos: ['borrador', 'auxiliar'], checklistItem: 'bases-contabilidad' },
  { id: 'libros-reteiva', texto: 'Conciliar las retenciones de IVA practicadas contra la 2367', detalle: 'Casillas 131 y 132 contra los créditos de 2367 del período.', reglas: ['R-12'], insumos: ['borrador', 'auxiliar'], checklistItem: 'bases-contabilidad' },
  { id: 'autorretencion', texto: 'Verificar la autorretención de renta contra la 236575', detalle: 'Casillas 59 a 76 y 113 a 128 contra la subcuenta de autorretención; tarifa uniforme sobre los ingresos.', reglas: ['R-13'], insumos: ['borrador', 'auxiliar'], checklistItem: 'autorretencion' },
  { id: 'tarifas-asientos', texto: 'Verificar tarifa y cuantía mínima asiento por asiento', detalle: 'Con la base de cada asiento: retención = base × tarifa; tarifa admisible para el concepto; retenciones sobre pagos por debajo de la cuantía mínima.', reglas: ['R-15', 'R-16'], insumos: ['auxiliar'], checklistItem: 'soportes-terceros' },
  { id: 'terceros-gasto', texto: 'Comparar lo causado a cada tercero con lo que se le retuvo', detalle: 'Con un balance por terceros: el gasto, costo o compra del período por tercero como base presunta contra su retención en 2365. Alerta terceros sin retención o con retención inferior a la tarifa del concepto.', reglas: ['R-17'], insumos: ['auxiliar'], checklistItem: 'soportes-terceros' },
  { id: 'periodo-anterior', texto: 'Comparar con la declaración del mes anterior', detalle: 'Variación del total retenido y conceptos que aparecen o desaparecen de un mes a otro.', reglas: ['R-30'], insumos: ['borrador', 'anterior'], checklistItem: 'periodo-anterior' },
  { id: 'oportunidad', texto: 'Confirmar presentación y pago total oportunos (art. 580-1 ET)', detalle: 'Fecha de presentación contra el vencimiento; sanciones liquidadas; pago total, sin el cual la declaración es ineficaz.', reglas: ['R-31', 'R-32'], insumos: ['borrador'], checklistItem: 'presentacion-pago' },
]

export function programaSugeridoRetefuente(): ProgramaRevision {
  return { pasos: PROGRAMA_AGENTE_RETEFUENTE.map((p) => ({ id: p.id, texto: p.texto, origen: 'agente' as const, activo: true })) }
}

export function reglasOmitidasRetefuente(programa: ProgramaRevision | null): string[] {
  if (!programa) return []
  // Solo lo que el auditor desactivó: un paso agregado al programa después de que él lo guardó corre por defecto.
  const inactivos = new Set(programa.pasos.filter((p) => p.origen === 'agente' && !p.activo).map((p) => p.id))
  return PROGRAMA_AGENTE_RETEFUENTE.filter((p) => inactivos.has(p.id)).flatMap((p) => p.reglas)
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

const fmt = (n: number) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Math.round(n))
const pct = (n: number) => `${Math.round(n * 100) / 100} %`
const toleranciaRedondeo = (componentes: number) => Math.max(UMBRALES_RETEFUENTE.toleranciaMinima, componentes * UMBRALES_RETEFUENTE.redondeoPorComponente)

/** Etiqueta, casilla y concepto de cada renglón del catálogo del 350. */
const RENGLONES = CIFRAS_CATALOGO.retefuente.flatMap((s) => s.renglones)
const ETIQUETA = new Map(RENGLONES.map((r) => [r.id, r.label]))
const CASILLA = new Map(RENGLONES.filter((r) => r.casilla).map((r) => [r.id, r.casilla as string]))
const RENGLONES_VALIDOS = new Set(RENGLONES.filter((r) => r.tipo === 'digitable').map((r) => r.id))
export { RENGLONES_VALIDOS as RENGLONES_RETEFUENTE }

/** `rf-pj-honorarios` → { beneficiario: 'pj', concepto: 'honorarios', autorretencion: false }. */
export function descomponerRenglonRf(id: string): { beneficiario: 'pj' | 'pn'; concepto: string; autorretencion: boolean } | null {
  const m = /^rf-(ar-)?(pj|pn)-(.+?)(-base)?$/.exec(id)
  if (!m || m[3] === 'total') return null
  return { beneficiario: m[2] as 'pj' | 'pn', concepto: m[3], autorretencion: !!m[1] }
}
const CONCEPTO_LABEL = new Map<string, string>()
for (const r of RENGLONES) {
  const d = descomponerRenglonRf(r.id)
  if (d && !r.id.endsWith('-base')) CONCEPTO_LABEL.set(`${d.autorretencion ? 'ar:' : ''}${d.concepto}`, r.label.split(' a personas')[0].replace(/^Autorretenciones: /, '').replace(/ \(.*$/, ''))
}
CONCEPTO_LABEL.set('reteiva', 'Retención de IVA a responsables')
CONCEPTO_LABEL.set('reteiva-no-residentes', 'Retención de IVA a no residentes')
const nombreConcepto = (c: string) => `${c.startsWith('ar:') ? 'Autorretención: ' : ''}${CONCEPTO_LABEL.get(c) ?? c}`

// ─── Corrida ─────────────────────────────────────────────────────────────────

export function correrRevisionRetefuente(entrada: EntradaCorridaRetefuente): ResultadoCorridaRetefuente {
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

  const lectura = (texto: string, referencia?: Record<string, unknown>) => bit.push({ tipo: 'lectura', texto, referencia })
  const regla = (id: string, texto: string) => { reglas.add(id); bit.push({ tipo: 'regla', texto, referencia: { regla: id } }) }

  const proponer = (p: {
    tipo: TipoPropuesta; reglasIds: string[]; titulo: string; renglonId: string | null; monto: number | null; severidad: SeveridadPropuesta | null
    certeza: CertezaPropuesta; datos: DatoPropuesta[]; contenido: ContenidoPropuesta; checklistItem: string | null; cuenta?: string | null; bitacora: LineaBorrador[]
    /** Cédula donde nace la propuesta (para decidirla en su contexto). */
    cedula: string
  }): { codigo: string | null; nota: string | null } => {
    if (p.reglasIds.some((r) => omitidas.has(r))) { propuestasOmitidas++; if (p.checklistItem) itemsConPropuesta.add(p.checklistItem); return { codigo: null, nota: 'Paso desactivado en el programa: no se propone.' } }
    const ancla = p.renglonId ?? p.cuenta ?? p.checklistItem
    const huella = huellaPropuesta({ tipo: p.tipo, reglas: p.reglasIds, cuentaCodigo: ancla })
    if (huellas.has(huella)) {
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
      contenido: { ...p.contenido, tributario: { renglonId: p.renglonId, casilla: p.renglonId ? CASILLA.get(p.renglonId) ?? null : null, checklistItem: p.checklistItem, cuentaAuxiliar: p.cuenta ?? null, cedula: p.cedula, ...(p.contenido.tributario ?? {}) } },
      desbloqueaClave: null, orden: orden++, bitacora: p.bitacora,
    })
    return { codigo, nota: null }
  }

  // ─── Cédulas: una por procedimiento, con todo lo comparado ────────────────
  const fuenteBorrador = `Formulario 350 de ${entrada.periodo.etiqueta} (columna Declarado)`
  const fuenteLibros = entrada.fuentes?.length ? entrada.fuentes.map((f) => `${f.nombre} (${f.archivo})`).join(', ') : 'Según libros guardado en la revisión'
  const paso = (id: string) => PROGRAMA_AGENTE_RETEFUENTE.find((x) => x.id === id)!
  const cedulaDePaso = (id: string, fase: CedulaBorrador['fase'], objetivo: string, criterio: string, fuentes: string[]): CedulaBorrador => {
    const d = paso(id)
    const c = nuevaCedula({ id, pasoId: id, fase, titulo: d.texto, objetivo, criterio, fuentes, reglas: d.reglas, checklistItem: d.checklistItem })
    if (d.reglas.every((r) => omitidas.has(r))) { c.estado = 'omitida'; c.motivo = 'Paso desactivado por el auditor en el programa.' }
    return c
  }
  const tolTexto = `Tolerancia: redondeo a miles del formulario ($${fmt(UMBRALES_RETEFUENTE.redondeoPorComponente)} por componente, mínimo $${fmt(UMBRALES_RETEFUENTE.toleranciaMinima)}).`
  const C = {
    formulario: cedulaDePaso('formulario', 'formulario', 'Comprobar que el borrador es coherente por sí mismo antes de compararlo con nada: que los totales salen de sus componentes y que la retención de cada casilla corresponde a una tarifa posible para su concepto.', `Art. 606 ET e instructivo del Formulario 350. Tarifas admisibles por concepto (arts. 392, 395 y 401 ET; DUR 1625/2016), con tolerancia de ${UMBRALES_RETEFUENTE.toleranciaTarifaPuntos} puntos porcentuales.`, [fuenteBorrador]),
    lectura: nuevaCedula({ id: 'lectura-libros', pasoId: null, fase: 'libros', titulo: 'Leer los libros y clasificar las subcuentas de retención', objetivo: 'Dejar a la vista qué se leyó de la contabilidad, cómo se clasificó cada subcuenta de 2365, 2364 y 2367 en un concepto del formulario y cómo se separaron personas jurídicas de naturales, antes de cruzar nada.', criterio: 'Clasificación por el nombre de la subcuenta, con el PUC como respaldo y la memoria de la empresa por encima de ambos. Persona jurídica: NIT de 9 dígitos que empieza por 8 o 9, o razón social; natural: cédula o nombre de persona.', fuentes: [fuenteLibros], reglas: ['P-02', 'P-03', 'P-04'], checklistItem: null }),
    renta: cedulaDePaso('libros-renta', 'cruce', 'Verificar que lo declarado a título de renta, en total y concepto por concepto, es lo que la contabilidad registró como retenido en el período.', `Arts. 375, 382 y 606 ET; art. 647 ET (inexactitud). ${tolTexto}`, [fuenteBorrador, fuenteLibros]),
    reteiva: cedulaDePaso('libros-reteiva', 'cruce', 'Verificar que las retenciones de IVA declaradas corresponden a las practicadas según la cuenta 2367.', `Arts. 437-1 y 437-2 ET. ${tolTexto}`, [fuenteBorrador, fuenteLibros]),
    autorretencion: cedulaDePaso('autorretencion', 'cruce', 'Verificar que la autorretención declarada corresponde a la contabilizada en su subcuenta.', `Art. 114-1 ET y DUR 1.2.6.6 y siguientes. ${tolTexto} No se valida la tarifa por actividad económica.`, [fuenteBorrador, fuenteLibros]),
    detalle: cedulaDePaso('tarifas-asientos', 'detalle', 'Recalcular la retención de cada asiento del período (base por tarifa) y comprobar que la tarifa aplicada es admisible para su concepto y que el pago superaba la cuantía mínima.', 'Arts. 392 y 401 ET; DUR 1625/2016. Un asiento es excepción si la retención difiere de base por tarifa en más de $100 o del 1 %. Rentas de trabajo, pensiones y dividendos no se recalculan: no son tarifa plana. El recálculo cubre el 100 % de los asientos con base; no reemplaza la inspección de soportes.', [fuenteLibros]),
    terceros: cedulaDePaso('terceros-gasto', 'analitica', 'Evaluar si la retención practicada a cada tercero es razonable frente a lo que se le causó en gasto, costo o compras en el período, y detectar terceros a los que no se les retuvo.', `Arts. 392 y 401 ET; DUR 1625/2016. Base presunta: lo causado al tercero en el período. La retención de cada subcuenta se divide por su tarifa para obtener la base que explica, y esa base se compara con lo causado, con un margen del ${UMBRALES_TERCEROS.margenPct} %. Es una prueba analítica (NIA 520): sus alertas son puntos por confirmar, no diferencias probadas.`, [fuenteLibros]),
    anterior: cedulaDePaso('periodo-anterior', 'analitica', 'Comparar lo declarado con el mes anterior para identificar variaciones que necesitan explicación.', `Procedimiento analítico (NIA 520). Se espera una variación del total inferior al ${UMBRALES_RETEFUENTE.variacionMensualPct} %; lo que la supere debe explicarse.`, [fuenteBorrador, entrada.anterior ? `Revisión de ${entrada.anterior.etiqueta} en la plataforma` : 'Sin revisión del mes anterior']),
    oportunidad: cedulaDePaso('oportunidad', 'oportunidad', 'Confirmar que la declaración se presentó a tiempo y con pago total, condición para que produzca efectos.', 'Arts. 580-1 y 641 ET.', [fuenteBorrador, 'Fechas registradas en la revisión']),
  }
  const COL = {
    cruce: [
      { clave: 'partida', titulo: 'Partida', formato: 'texto' }, { clave: 'casilla', titulo: 'Casilla', formato: 'texto' }, { clave: 'declarado', titulo: 'Declarado', formato: 'moneda' },
      { clave: 'libros', titulo: 'Según libros', formato: 'moneda' }, { clave: 'diferencia', titulo: 'Diferencia', formato: 'moneda' }, { clave: 'tolerancia', titulo: 'Tolerancia', formato: 'moneda' },
    ] as ColumnaCedula[],
  }
  const fila = (cedula: CedulaBorrador, tabla: { id: string; titulo: string; columnas: ColumnaCedula[]; descripcion?: string }, valores: FilaCedula['valores'], estado: EstadoFilaCedula, extra: { regla?: string; nota?: string | null; propuesta?: { codigo: string | null; nota: string | null } | null } = {}) => {
    tablaDeCedula(cedula, tabla.id, tabla.titulo, tabla.columnas, tabla.descripcion).filas.push({
      valores, estado, regla: extra.regla ?? null, propuesta: extra.propuesta?.codigo ?? null, nota: extra.nota ?? extra.propuesta?.nota ?? null,
    })
  }

  // ─── P-01 · cifras combinadas ─────────────────────────────────────────────
  const cifras: CifrasRevision = {}
  const ids = [...RENGLONES_VALIDOS]
  for (const id of ids) {
    const guardado = entrada.cifras[id]
    const libros = entrada.libros ? entrada.libros.cifras[id]?.libros ?? null : (typeof guardado?.libros === 'number' ? guardado.libros : null)
    cifras[id] = { declarado: typeof guardado?.declarado === 'number' ? guardado.declarado : null, libros }
  }
  const cifrasLibros: Record<string, { libros: number }> = {}
  if (entrada.libros) for (const [id, v] of Object.entries(entrada.libros.cifras)) if (RENGLONES_VALIDOS.has(id)) cifrasLibros[id] = v
  const R = resolverCifras('retefuente', cifras)
  const dec = (id: string): number | null => R[id]?.declarado ?? null
  const lib = (id: string): number | null => R[id]?.libros ?? null
  const declarados = ids.filter((id) => cifras[id].declarado !== null).length
  lectura(`Formulario 350 ${entrada.periodo.etiqueta}: ${declarados} casilla(s) con valor declarado.`, { paso: 'P-01' })
  if (declarados === 0) limitaciones.push({ regla: 'P-01', motivo: 'Sin cifras declaradas: solo corren las reglas sobre libros.' })

  const L = entrada.libros ?? null
  if (L) {
    lectura(`Libros: ${L.cuentas.filter((c) => c.destino && c.destino !== 'saldo' && c.destino !== 'ignorar').length} subcuenta(s) mapeadas a ${Object.keys(L.conceptos).length} concepto(s); ${L.asientos.length} asiento(s) con base.`, { paso: 'P-02' })
    for (const linea of L.bitacora.slice(1)) lectura(linea, { paso: 'P-03' })
    const propSinClasificar = new Map<string, { codigo: string | null; nota: string | null }>()
    for (const c of L.sinClasificar) {
      const pr = proponer({
        cedula: 'lectura-libros',
        tipo: 'ambiguedad', reglasIds: ['P-03'], titulo: `Subcuenta ${c.cuenta} sin concepto del 350`, renglonId: null, monto: null, severidad: 'media', certeza: 'no_verificable',
        datos: [{ etiqueta: 'cuenta', valor: `${c.cuenta} ${c.nombre ?? ''}`.trim() }, { etiqueta: 'créditos', valor: fmt(c.creditos) }, { etiqueta: 'débitos', valor: fmt(c.debitos) }],
        contenido: {
          descripcion: `La subcuenta ${c.cuenta} "${c.nombre ?? ''}" mueve ${fmt(c.creditos - c.debitos)} en el período, pero ni el nombre ni el código dicen a qué concepto del 350 corresponde.`,
          para: 'Sin clasificarla, la conciliación por concepto queda incompleta y la diferencia contra el formulario no es confiable.',
          opciones: OPCIONES_CONCEPTO_RETEFUENTE.map((o) => ({ clave: o.clave, label: o.label })),
          destino: 'memoria',
          tributario: { memoriaClave: 'mapeo2365' },
        },
        checklistItem: null, cuenta: c.cuenta,
        bitacora: [{ tipo: 'lectura', texto: `Leí la subcuenta ${c.cuenta} con ${c.movimientos} movimiento(s).` }, { tipo: 'clasificacion', texto: 'Ninguna palabra clave ni subcuenta PUC conocida (P-03).', referencia: { paso: 'P-03' } }],
      })
      propSinClasificar.set(c.cuenta, pr)
    }

    // Cédula de lectura: archivos, clasificación de cada subcuenta y lo que quedó por concepto.
    for (const f of entrada.fuentes ?? []) {
      fila(C.lectura, { id: 'fuentes', titulo: 'Archivos leídos', columnas: [{ clave: 'nombre', titulo: 'Soporte', formato: 'texto' }, { clave: 'archivo', titulo: 'Archivo', formato: 'texto' }, { clave: 'registros', titulo: 'Registros del período', formato: 'numero' }, { clave: 'cuentas', titulo: 'Cuentas', formato: 'numero' }] },
        { nombre: f.nombre, archivo: f.archivo, registros: f.registros, cuentas: f.cuentas }, 'informativo')
    }
    const tClasif = { id: 'clasificacion', titulo: 'Clasificación de las subcuentas', descripcion: 'Cada subcuenta de retención con movimiento en el período, el concepto del formulario al que se llevó y por qué.', columnas: [{ clave: 'cuenta', titulo: 'Subcuenta', formato: 'texto' }, { clave: 'nombre', titulo: 'Nombre', formato: 'texto' }, { clave: 'concepto', titulo: 'Concepto del 350', formato: 'texto' }, { clave: 'como', titulo: 'Cómo se clasificó', formato: 'texto' }, { clave: 'neto', titulo: 'Retención del período', formato: 'moneda' }] as ColumnaCedula[] }
    for (const c of L.cuentas) {
      const sin = c.destino === null
      const aparte = c.destino === 'saldo' || c.destino === 'ignorar'
      fila(C.lectura, tClasif, { cuenta: c.cuenta, nombre: c.nombre ?? '', concepto: sin ? 'Sin clasificar' : aparte ? (c.destino === 'saldo' ? 'Saldo por pagar (no se usa)' : 'No es retención (no se usa)') : nombreConcepto(c.destino as string), como: c.motivo, neto: sin || aparte ? null : c.neto },
        sin ? 'por_confirmar' : aparte ? 'informativo' : 'conforme', { regla: 'P-03', propuesta: sin ? propSinClasificar.get(c.cuenta) ?? null : null })
    }
    const tConceptos = { id: 'conceptos', titulo: 'Según libros por concepto y beneficiario', descripcion: 'Lo que la contabilidad registra como retenido en el período. Es la cifra que después se cruza contra el formulario.', columnas: [{ clave: 'concepto', titulo: 'Concepto', formato: 'texto' }, { clave: 'pj', titulo: 'A jurídicas', formato: 'moneda' }, { clave: 'pn', titulo: 'A naturales', formato: 'moneda' }, { clave: 'sin', titulo: 'Sin beneficiario', formato: 'moneda' }, { clave: 'total', titulo: 'Total retenido', formato: 'moneda' }, { clave: 'base', titulo: 'Base', formato: 'moneda' }, { clave: 'asientos', titulo: 'Asientos con base', formato: 'numero' }] as ColumnaCedula[] }
    for (const [concepto, v] of Object.entries(L.conceptos)) {
      const esReteIva = concepto.startsWith('reteiva')
      const pref = concepto.startsWith('ar:') ? 'rf-ar-' : 'rf-'
      const clave = concepto.replace(/^ar:/, '')
      const pj = esReteIva ? v.retencion : L.cifras[`${pref}pj-${clave}`]?.libros ?? 0
      const pn = esReteIva ? 0 : L.cifras[`${pref}pn-${clave}`]?.libros ?? 0
      const sinB = v.beneficiarioConocido ? Math.round(v.retencion - pj - pn) : Math.round(v.retencion)
      fila(C.lectura, tConceptos, { concepto: nombreConcepto(concepto), pj: v.beneficiarioConocido ? pj : null, pn: v.beneficiarioConocido ? pn : null, sin: Math.abs(sinB) > 1 ? sinB : 0, total: Math.round(v.retencion), base: v.base === null ? null : Math.round(v.base), asientos: L.asientos.filter((a) => a.concepto === concepto).length },
        Math.abs(sinB) > 1 && v.beneficiarioConocido ? 'no_verificable' : 'informativo', { regla: 'P-04', nota: !v.beneficiarioConocido ? 'El libro no trae el tercero de esta cuenta: no se separa jurídicas de naturales (carga el balance por terceros o el auxiliar).' : Math.abs(sinB) > 1 ? 'Parte de la retención no tiene un tercero identificable como jurídica o natural.' : null })
    }
    if (L.sinBeneficiario) C.lectura.limitaciones.push(`${L.sinBeneficiario} asiento(s) sin poder establecer si el tercero es persona jurídica o natural.`)
  } else {
    C.lectura.estado = 'sin_insumos'
    C.lectura.motivo = 'No se cargó auxiliar ni balance de prueba de 2365/2367 en este análisis.'
  }
  const hayLibros = !!L || ids.some((id) => cifras[id].libros !== null)
  if (!L && hayLibros) lectura('Según libros: uso los valores ya guardados en la revisión.', { paso: 'P-02' })
  if (!hayLibros) limitaciones.push({ regla: 'R-10..R-16', motivo: 'Sin auxiliar ni balance de 2365/2367: no se comparó contra libros.' })

  // ─── Bloque A · formulario ────────────────────────────────────────────────
  const T_ARIT = { id: 'aritmetica', titulo: 'Totales del formulario', descripcion: 'Totales recalculados a partir de las casillas declaradas. Si la lectura del borrador encontró un total que no cuadra, aparece como diferencia.', columnas: [{ clave: 'total', titulo: 'Total', formato: 'texto' }, { clave: 'casilla', titulo: 'Casilla', formato: 'texto' }, { clave: 'valor', titulo: 'Valor', formato: 'moneda' }] as ColumnaCedula[] }
  const T_TARIFA = { id: 'tarifas', titulo: 'Tarifa implícita por casilla', descripcion: 'Retención declarada dividida por su base, contra las tarifas que el concepto admite.', columnas: [{ clave: 'partida', titulo: 'Concepto y beneficiario', formato: 'texto' }, { clave: 'casillas', titulo: 'Casillas', formato: 'texto' }, { clave: 'base', titulo: 'Base', formato: 'moneda' }, { clave: 'retencion', titulo: 'Retención', formato: 'moneda' }, { clave: 'implicita', titulo: 'Tarifa implícita', formato: 'porcentaje' }, { clave: 'admisibles', titulo: 'Tarifas admisibles', formato: 'texto' }] as ColumnaCedula[] }
  for (const adv of entrada.advertenciasLectura ?? []) {
    regla('R-01', `R-01: ${adv}`)
    const pr = proponer({
      cedula: 'formulario',
      tipo: 'ambiguedad', reglasIds: ['R-01'], titulo: 'Un total del formulario no cuadra con sus componentes', renglonId: null, monto: null, severidad: 'media', certeza: 'verificado', datos: [], checklistItem: null,
      contenido: { descripcion: adv, para: 'Si el formulario no cuadra, las diferencias contra libros heredan el error.', opciones: [{ clave: 'lectura', label: 'Fue la lectura: corregir la casilla' }, { clave: 'formulario', label: 'El borrador viene así: revisarlo con el contador' }] },
      bitacora: [{ tipo: 'regla', texto: adv, referencia: { regla: 'R-01' } }],
    })
    fila(C.formulario, T_ARIT, { total: adv, casilla: null, valor: null }, 'diferencia', { regla: 'R-01', propuesta: pr })
  }
  // Totales recalculados desde las casillas: lo que el auditor compara contra el borrador.
  for (const id of ['rf-pj-total', 'rf-pn-total', 'rf-ar-pj-total', 'rf-ar-pn-total', 'rf-total-renta', 'rf-total-iva', 'rf-total', 'rf-total-sanciones']) {
    const v = dec(id)
    if (v === null) continue
    fila(C.formulario, T_ARIT, { total: ETIQUETA.get(id) ?? id, casilla: CASILLA.get(id) ?? null, valor: v }, 'informativo', { regla: 'R-01', nota: CASILLA.get(id) ? 'Recalculado desde sus componentes.' : 'Subtotal de control: no es casilla del formulario.' })
  }

  // R-02 / R-03: por cada pareja base/retención declarada.
  for (const id of ids) {
    if (id.endsWith('-base')) continue
    const d = descomponerRenglonRf(id)
    if (!d) continue
    const ret = dec(id)
    const base = dec(`${id}-base`)
    if (ret === null && base === null) continue
    itemsConDatos.add('tarifas-conceptos')
    const cas = CASILLA.get(id) ?? '?'
    const casBase = CASILLA.get(`${id}-base`) ?? '?'
    const etiqueta = ETIQUETA.get(id) ?? id
    const tAdm = TARIFAS_RETEFUENTE[d.concepto]
    const filaTarifa = (estado: EstadoFilaCedula, regla_: string, extra: { nota?: string | null; propuesta?: { codigo: string | null; nota: string | null } | null } = {}) =>
      fila(C.formulario, T_TARIFA, { partida: etiqueta.replace(/ — .*$/, ''), casillas: `${casBase} / ${cas}`, base: base ?? 0, retencion: ret ?? 0, implicita: base && ret ? (ret / base) * 100 : null, admisibles: d.autorretencion ? 'Según actividad económica' : tAdm ? `${tAdm.admisibles.join(' %, ')} %` : 'Tarifa variable' }, estado, { regla: regla_, ...extra })
    if ((ret ?? 0) > 0 && !(base && base > 0)) {
      regla('R-03', `R-03: casilla ${cas} declara ${fmt(ret!)} de retención sin base en la casilla ${casBase}.`)
      const pr = proponer({
        cedula: 'formulario',
        tipo: 'hallazgo', reglasIds: ['R-03'], titulo: `Retención sin base: ${etiqueta}`, renglonId: id, monto: ret, severidad: 'media', certeza: 'verificado',
        datos: [{ etiqueta: `retención (c. ${cas})`, valor: fmt(ret!) }, { etiqueta: `base (c. ${casBase})`, valor: fmt(base ?? 0) }], checklistItem: 'tarifas-conceptos',
        contenido: { descripcion: `La casilla ${cas} declara ${fmt(ret!)} de retención por ${etiqueta.toLowerCase()} pero la base de la casilla ${casBase} está en cero o vacía.`, norma: 'Art. 606 ET · instructivo del Formulario 350: cada retención se declara con su base.', recomendacion: 'Completar la base o revisar si la retención está en el concepto equivocado.' },
        bitacora: [{ tipo: 'regla', texto: `R-03: retención ${fmt(ret!)} con base ${fmt(base ?? 0)}.`, referencia: { regla: 'R-03' } }],
      })
      filaTarifa('diferencia', 'R-03', { propuesta: pr, nota: pr.nota ?? 'Retención declarada sin base.' })
      continue
    }
    if ((base ?? 0) > 0 && !(ret && ret > 0)) {
      regla('R-03', `R-03: casilla ${casBase} declara base ${fmt(base!)} sin retención en la casilla ${cas}.`)
      const pr = proponer({
        cedula: 'formulario',
        tipo: 'juicio', reglasIds: ['R-03'], titulo: `Base sin retención: ${etiqueta}`, renglonId: id, monto: base, severidad: 'baja', certeza: 'requiere_evidencia',
        datos: [{ etiqueta: `base (c. ${casBase})`, valor: fmt(base!) }, { etiqueta: `retención (c. ${cas})`, valor: fmt(ret ?? 0) }], checklistItem: 'tarifas-conceptos',
        contenido: { descripcion: `La casilla ${casBase} declara una base de ${fmt(base!)} por ${etiqueta.toLowerCase()} sin retención en la casilla ${cas}. Puede ser legítimo (pagos bajo la cuantía mínima) o una omisión.`, para: 'Confirmar si los pagos estaban por debajo de la cuantía mínima o si faltó practicar la retención.', opciones: [{ clave: 'ok', label: 'Es correcto: pagos sin retención' }, { clave: 'revisar', label: 'Hay que revisarlo' }] },
        bitacora: [{ tipo: 'regla', texto: `R-03: base ${fmt(base!)} con retención cero.`, referencia: { regla: 'R-03' } }],
      })
      filaTarifa('por_confirmar', 'R-03', { propuesta: pr, nota: pr.nota ?? 'Base declarada sin retención.' })
      continue
    }
    if (ret && base && ret > 0 && base > 0 && d.autorretencion) {
      filaTarifa('informativo', 'R-02', { nota: 'La tarifa de autorretención depende de la actividad económica: no se verifica aquí.' })
    }
    if (ret && base && ret > 0 && base > 0 && !d.autorretencion) {
      const implicita = (ret / base) * 100
      const t = TARIFAS_RETEFUENTE[d.concepto]
      if (!t) { regla('R-02', `R-02: casilla ${cas}: tarifa implícita ${pct(implicita)} (${nombreConcepto(d.concepto)} tiene tarifa variable: no se verifica).`); filaTarifa('no_verificable', 'R-02', { nota: 'Concepto de tarifa variable: no se verifica por tarifa.' }); continue }
      const admisible = t.admisibles.some((a) => Math.abs(a - implicita) <= UMBRALES_RETEFUENTE.toleranciaTarifaPuntos)
      regla('R-02', `R-02: casilla ${cas} ${fmt(ret)} ÷ casilla ${casBase} ${fmt(base)} = ${pct(implicita)}; admisibles para ${nombreConcepto(d.concepto)}: ${t.admisibles.join(' %, ')} %.`)
      if (admisible) { filaTarifa('conforme', 'R-02'); continue }
      // Mezcla de tarifas dentro del concepto (p. ej. declarantes y no declarantes en una casilla) da una tarifa intermedia: se avisa, no se acusa.
      const entreMinMax = implicita > Math.min(...t.admisibles) && implicita < Math.max(...t.admisibles)
      const sev = severidadPorProporcion(ret - base * (t.general ?? t.admisibles[0]) / 100, ret)
      const pr = proponer({
        cedula: 'formulario',
        tipo: entreMinMax ? 'juicio' : 'hallazgo', reglasIds: ['R-02'], titulo: `Tarifa implícita ${pct(implicita)} en ${etiqueta}`, renglonId: id, monto: Math.abs(ret - base * (t.general ?? t.admisibles[0]) / 100),
        severidad: entreMinMax ? 'baja' : sev.severidad, certeza: entreMinMax ? 'requiere_evidencia' : 'verificado',
        datos: [{ etiqueta: 'retención', valor: fmt(ret) }, { etiqueta: 'base', valor: fmt(base) }, { etiqueta: 'tarifa implícita', valor: pct(implicita) }, { etiqueta: 'admisibles', valor: `${t.admisibles.join(' %, ')} %` }],
        checklistItem: 'tarifas-conceptos',
        contenido: {
          descripcion: entreMinMax
            ? `La retención declarada por ${etiqueta.toLowerCase()} equivale al ${pct(implicita)} de su base, entre las tarifas admisibles (${t.admisibles.join(' %, ')} %): parece una mezcla de terceros con tarifas distintas en la misma casilla.`
            : `La retención declarada por ${etiqueta.toLowerCase()} (${fmt(ret)}) equivale al ${pct(implicita)} de la base (${fmt(base)}); ninguna tarifa del concepto (${t.admisibles.join(' %, ')} %) la explica.`,
          norma: t.nota, para: entreMinMax ? 'Confirmar con el detalle por tercero que la mezcla es la esperada.' : undefined,
          recomendacion: entreMinMax ? undefined : 'Revisar la clasificación del concepto o la tarifa aplicada a los terceros de esa casilla.',
          ...(entreMinMax ? { opciones: [{ clave: 'ok', label: 'Mezcla esperada de tarifas' }, { clave: 'revisar', label: 'Revisar el detalle por tercero' }] } : {}),
        },
        bitacora: [{ tipo: 'regla', texto: `R-02: ${fmt(ret)} ÷ ${fmt(base)} = ${pct(implicita)}, fuera de ${t.admisibles.join('/')} % ± ${UMBRALES_RETEFUENTE.toleranciaTarifaPuntos}.`, referencia: { regla: 'R-02' } }],
      })
      filaTarifa(entreMinMax ? 'por_confirmar' : 'diferencia', 'R-02', { propuesta: pr, nota: pr.nota ?? (entreMinMax ? 'Entre dos tarifas admisibles: posible mezcla de terceros.' : 'Ninguna tarifa del concepto la explica.') })
    }
  }

  // ─── Bloque B · libros contra formulario ──────────────────────────────────
  type Tabla = { id: string; titulo: string; columnas: ColumnaCedula[]; descripcion?: string }
  const T_TOTAL: Tabla = { id: 'total', titulo: 'Total del período', columnas: COL.cruce }
  const T_CONCEPTO: Tabla = { id: 'conceptos', titulo: 'Por concepto y beneficiario', descripcion: 'Cada concepto con movimiento en el formulario o en los libros. Cuando el auxiliar no trae tercero, la comparación es por el total del concepto.', columnas: COL.cruce }
  const T_BASES: Tabla = { id: 'bases', titulo: 'Bases declaradas contra bases contabilizadas', descripcion: 'Solo cuando el auxiliar trae la base de cada asiento.', columnas: COL.cruce }
  const comparar = (reglaId: string, id: string, declarado: number | null, libros: number | null, componentes: number, titulo: string, checklist: string, descripcion: (dif: number) => string, norma: string, donde: { cedula: CedulaBorrador; tabla: Tabla; partida: string; casilla: string | null }) => {
    if (declarado === null || libros === null) return false
    itemsConDatos.add(checklist)
    const dif = declarado - libros
    const tol = toleranciaRedondeo(componentes)
    const valores = { partida: donde.partida, casilla: donde.casilla, declarado, libros, diferencia: dif, tolerancia: tol }
    regla(reglaId, `${reglaId}: ${titulo}: declarado ${fmt(declarado)} vs libros ${fmt(libros)}; diferencia ${fmt(dif)}, tolerancia ${fmt(tol)}.`)
    if (Math.abs(dif) <= tol) { fila(donde.cedula, donde.tabla, valores, 'conforme', { regla: reglaId }); return true }
    const sev = severidadPorProporcion(dif, libros || declarado)
    const pr = proponer({
      cedula: donde.cedula.id,
      tipo: 'hallazgo', reglasIds: [reglaId], titulo, renglonId: RENGLONES_VALIDOS.has(id) || R[id] ? id : null, monto: Math.abs(dif), severidad: sev.severidad, certeza: 'verificado',
      datos: [{ etiqueta: 'declarado', valor: fmt(declarado) }, { etiqueta: 'según libros', valor: fmt(libros) }, { etiqueta: 'diferencia', valor: fmt(dif) }], checklistItem: checklist,
      contenido: { descripcion: descripcion(dif), norma, recomendacion: dif > 0 ? 'Verificar si se declaró retención que no está contabilizada (o está en otra subcuenta) o si falta causar en libros.' : 'Verificar si hay retenciones contabilizadas que no se declararon: la omisión genera sanción por inexactitud (art. 647 ET).' },
      bitacora: [{ tipo: 'contraste', texto: `${reglaId}: diferencia ${fmt(dif)} (${pct(sev.proporcion)}) por encima del redondeo de ${fmt(tol)}.`, referencia: { regla: reglaId } }, { tipo: 'clasificacion', texto: `Severidad ${sev.severidad.toUpperCase()}: ${sev.explicacion}.` }],
    })
    fila(donde.cedula, donde.tabla, valores, 'diferencia', { regla: reglaId, propuesta: pr })
    return true
  }

  if (hayLibros) {
    // R-10 total renta (c130) vs Σ 2365 (renta + autorretención − excesos no están en libros).
    const totalLibrosRenta = L ? Object.entries(L.conceptos).filter(([c]) => !c.startsWith('reteiva')).reduce((s, [, v]) => s + v.retencion, 0) : lib('rf-total-renta')
    const componentes130 = ids.filter((id) => !id.endsWith('-base') && /^rf-(ar-)?(pj|pn)-/.test(id) && (dec(id) ?? 0) !== 0).length + 1
    comparar('R-10', 'rf-total-renta', dec('rf-total-renta') !== null ? (dec('rf-total-renta') ?? 0) + (dec('rf-exceso-renta') ?? 0) : null, totalLibrosRenta, componentes130,
      'Total retenciones de renta (casilla 130) vs la cuenta 2365', 'bases-contabilidad',
      (dif) => `La casilla 130 más los excesos de la 129 (${fmt((dec('rf-total-renta') ?? 0) + (dec('rf-exceso-renta') ?? 0))}) ${dif > 0 ? 'supera' : 'es inferior a'} las retenciones a título de renta contabilizadas en 2365 en el período (${fmt(totalLibrosRenta ?? 0)}). Diferencia ${fmt(dif)}.`,
      'Art. 375 y 382 ET (obligación de retener y declarar) · art. 647 ET (inexactitud)',
      { cedula: C.renta, tabla: T_TOTAL, partida: 'Total retenciones de renta más excesos (130 + 129) contra la cuenta 2365', casilla: '130' })

    // R-11 por concepto: con beneficiario conocido, por renglón; si no, por total del concepto.
    if (L) {
      for (const [concepto, v] of Object.entries(L.conceptos)) {
        if (concepto.startsWith('reteiva')) continue
        const pref = concepto.startsWith('ar:') ? `rf-ar-` : 'rf-'
        const clave = concepto.replace(/^ar:/, '')
        const idPj = `${pref}pj-${clave}`
        const idPn = `${pref}pn-${clave}`
        const decPj = RENGLONES_VALIDOS.has(idPj) ? dec(idPj) : null
        const decPn = RENGLONES_VALIDOS.has(idPn) ? dec(idPn) : null
        const cedConcepto = concepto.startsWith('ar:') ? C.autorretencion : C.renta
        const etiquetaConcepto = nombreConcepto(concepto)
        if (decPj === null && decPn === null && v.retencion === 0) continue
        if (decPj === null && decPn === null && Math.abs(v.retencion) > toleranciaRedondeo(1)) {
          // Retención contabilizada en un concepto que el formulario no declara: omisión.
          itemsConDatos.add('bases-contabilidad')
          regla('R-11', `R-11: ${nombreConcepto(concepto)}: libros ${fmt(v.retencion)} y ninguna casilla declarada para el concepto.`)
          const sev = severidadPorProporcion(v.retencion, (dec('rf-total-renta') ?? v.retencion) || 1)
          const pr = proponer({
            cedula: cedConcepto.id,
            tipo: 'hallazgo', reglasIds: ['R-11'], titulo: `${nombreConcepto(concepto)} contabilizado y no declarado`, renglonId: RENGLONES_VALIDOS.has(idPj) ? idPj : idPn, monto: Math.abs(v.retencion), severidad: sev.severidad, certeza: 'verificado',
            datos: [{ etiqueta: 'según libros', valor: fmt(v.retencion) }, { etiqueta: 'declarado', valor: fmt(0) }], checklistItem: 'bases-contabilidad',
            contenido: { descripcion: `La contabilidad registra ${fmt(v.retencion)} de retención por ${nombreConcepto(concepto).toLowerCase()} en el período y el formulario no declara nada en ese concepto.`, norma: 'Arts. 375 y 382 ET · art. 647 ET (inexactitud por omisión)', recomendacion: 'Incluir el concepto en el formulario o, si está declarado en otra casilla, reclasificar la subcuenta.' },
            bitacora: [{ tipo: 'contraste', texto: `R-11: libros ${fmt(v.retencion)} vs declarado 0.`, referencia: { regla: 'R-11' } }],
          })
          fila(cedConcepto, T_CONCEPTO, { partida: etiquetaConcepto, casilla: null, declarado: 0, libros: Math.round(v.retencion), diferencia: -Math.round(v.retencion), tolerancia: toleranciaRedondeo(1) }, 'diferencia', { regla: 'R-11', propuesta: pr, nota: pr.nota ?? 'Contabilizado y no declarado.' })
          continue
        }
        if (v.beneficiarioConocido && (decPj !== null || decPn !== null)) {
          for (const [id, d] of [[idPj, decPj], [idPn, decPn]] as [string, number | null][]) {
            if (!RENGLONES_VALIDOS.has(id)) continue
            const l = lib(id) ?? (cifras[id] ? 0 : null)
            if (d === null && (l ?? 0) === 0) continue
            comparar('R-11', id, d ?? 0, l ?? 0, 1, `${ETIQUETA.get(id) ?? id}: declarado vs libros`, 'bases-contabilidad',
              (dif) => `${ETIQUETA.get(id) ?? id}: el formulario declara ${fmt(d ?? 0)} (casilla ${CASILLA.get(id) ?? '?'}) y la 2365 registra ${fmt(l ?? 0)} para ese concepto y beneficiario. Diferencia ${fmt(dif)}.`, 'Art. 606 ET · instructivo del 350',
              { cedula: cedConcepto, tabla: T_CONCEPTO, partida: (ETIQUETA.get(id) ?? id).replace(/ — .*$/, ''), casilla: CASILLA.get(id) ?? null })
          }
        } else {
          const declaradoConcepto = (decPj ?? 0) + (decPn ?? 0)
          comparar('R-11', idPj, decPj === null && decPn === null ? null : declaradoConcepto, v.retencion, 2, `${nombreConcepto(concepto)}: declarado (jurídicas + naturales) vs libros`, 'bases-contabilidad',
            (dif) => `${nombreConcepto(concepto)}: el formulario declara ${fmt(declaradoConcepto)} sumando jurídicas y naturales y la contabilidad registra ${fmt(v.retencion)} en el período. Diferencia ${fmt(dif)}.${v.beneficiarioConocido ? '' : ' Sin asientos con tercero no se puede separar jurídicas de naturales: la comparación es por concepto.'}`, 'Art. 606 ET · instructivo del 350',
            { cedula: cedConcepto, tabla: T_CONCEPTO, partida: `${etiquetaConcepto} (jurídicas + naturales)`, casilla: [CASILLA.get(idPj), CASILLA.get(idPn)].filter(Boolean).join(' + ') || null })
        }
        // R-14 base declarada vs base en libros (solo con asientos con base).
        if (v.base !== null && v.base > 0) {
          const decBase = (RENGLONES_VALIDOS.has(`${idPj}-base`) ? dec(`${idPj}-base`) ?? 0 : 0) + (RENGLONES_VALIDOS.has(`${idPn}-base`) ? dec(`${idPn}-base`) ?? 0 : 0)
          if (decPj !== null || decPn !== null) {
            comparar('R-14', `${idPj}-base`, decBase, v.base, 2, `${nombreConcepto(concepto)}: base declarada vs base en libros`, 'bases-contabilidad',
              (dif) => `${nombreConcepto(concepto)}: la base declarada (${fmt(decBase)}) difiere de la base de los asientos del período (${fmt(v.base ?? 0)}) en ${fmt(dif)}.`, 'Art. 606 ET · la base declarada debe ser la sujeta a retención del período',
              { cedula: cedConcepto, tabla: T_BASES, partida: `${etiquetaConcepto}: base`, casilla: [CASILLA.get(`${idPj}-base`), CASILLA.get(`${idPn}-base`)].filter(Boolean).join(' + ') || null })
          }
        }
      }
      // Conceptos declarados sin nada en libros.
      for (const id of ids) {
        if (id.endsWith('-base')) continue
        const d = descomponerRenglonRf(id)
        if (!d || (dec(id) ?? 0) <= 0) continue
        const clave = `${d.autorretencion ? 'ar:' : ''}${d.concepto}`
        if (!L.conceptos[clave]) {
          itemsConDatos.add('bases-contabilidad')
          regla('R-11', `R-11: ${ETIQUETA.get(id)} declara ${fmt(dec(id)!)} y no hay subcuenta de ese concepto en libros.`)
          const pr = proponer({
            cedula: d.autorretencion ? 'autorretencion' : 'libros-renta',
            tipo: 'hallazgo', reglasIds: ['R-11'], titulo: `${ETIQUETA.get(id) ?? id} sin contrapartida en libros`, renglonId: id, monto: dec(id), severidad: severidadPorProporcion(dec(id)!, (dec('rf-total-renta') ?? dec(id)!) || 1).severidad, certeza: 'verificado',
            datos: [{ etiqueta: 'declarado', valor: fmt(dec(id)!) }, { etiqueta: 'según libros', valor: fmt(0) }], checklistItem: 'bases-contabilidad',
            contenido: { descripcion: `La casilla ${CASILLA.get(id) ?? '?'} declara ${fmt(dec(id)!)} por ${(ETIQUETA.get(id) ?? id).toLowerCase()} y en 2365 no hay ninguna subcuenta clasificada en ese concepto.`, norma: 'Art. 606 ET', recomendacion: 'Revisar si el concepto está en otra subcuenta (clasificarla) o si la casilla está mal ubicada.' },
            bitacora: [{ tipo: 'contraste', texto: `R-11: declarado ${fmt(dec(id)!)} vs libros 0.`, referencia: { regla: 'R-11' } }],
          })
          fila(d.autorretencion ? C.autorretencion : C.renta, T_CONCEPTO, { partida: (ETIQUETA.get(id) ?? id).replace(/ — .*$/, ''), casilla: CASILLA.get(id) ?? null, declarado: dec(id), libros: 0, diferencia: dec(id), tolerancia: toleranciaRedondeo(1) }, 'diferencia', { regla: 'R-11', propuesta: pr, nota: pr.nota ?? 'Declarado sin subcuenta del concepto en libros.' })
        }
      }
    }

    // R-12 rete-IVA (c131 + c132 − c133) vs 2367.
    const reteIvaLibros = L ? (L.conceptos['reteiva']?.retencion ?? 0) + (L.conceptos['reteiva-no-residentes']?.retencion ?? 0) : (lib('rf-reteiva') ?? 0) + (lib('rf-reteiva-no-residentes') ?? 0)
    const hayReteIvaLibros = L ? !!(L.conceptos['reteiva'] || L.conceptos['reteiva-no-residentes']) : lib('rf-reteiva') !== null
    if (hayReteIvaLibros || (dec('rf-reteiva') ?? 0) > 0) {
      comparar('R-12', 'rf-reteiva', dec('rf-total-iva'), reteIvaLibros, 3, 'Retenciones de IVA practicadas (casilla 134) vs la cuenta 2367', 'bases-contabilidad',
        (dif) => `El total de retenciones de IVA declarado (${fmt(dec('rf-total-iva') ?? 0)}, casilla 134) ${dif > 0 ? 'supera' : 'es inferior a'} lo contabilizado en 2367 en el período (${fmt(reteIvaLibros)}). Diferencia ${fmt(dif)}.`,
        'Art. 437-1 y 437-2 ET (agentes de retención de IVA) · tarifa del 15 %',
        { cedula: C.reteiva, tabla: T_TOTAL, partida: 'Total retenciones de IVA (131 + 132 − 133) contra la cuenta 2367', casilla: '134' })
    }

    // R-13 autorretención declarada vs 236575.
    const arLibros = L ? Object.entries(L.conceptos).filter(([c]) => c.startsWith('ar:')).reduce((s, [, v]) => s + v.retencion, 0) : null
    const arDeclarado = (dec('rf-ar-pj-total') ?? 0) + (dec('rf-ar-pn-total') ?? 0)
    // Sin ninguna casilla de autorretención declarada, la omisión ya la reporta R-11 por concepto.
    const hayArDeclarada = ids.some((id) => id.startsWith('rf-ar-') && !id.endsWith('-base') && dec(id) !== null)
    if (arLibros !== null && hayArDeclarada && (arLibros !== 0 || arDeclarado !== 0)) {
      comparar('R-13', 'rf-ar-pj-total', arDeclarado, arLibros, 4, 'Autorretenciones declaradas vs la subcuenta de autorretención', 'autorretencion',
        (dif) => `Las autorretenciones declaradas (casillas 59 a 76 y 113 a 128: ${fmt(arDeclarado)}) ${dif > 0 ? 'superan' : 'son inferiores a'} lo contabilizado como autorretención en el período (${fmt(arLibros)}). Diferencia ${fmt(dif)}.`,
        'Art. 114-1 ET · Decreto 2201 de 2016 y DUR 1.2.6.6 y ss. (autorretención especial)',
        { cedula: C.autorretencion, tabla: T_TOTAL, partida: 'Total autorretenciones declaradas contra su subcuenta', casilla: '59–76, 113–128' })
    }

    // R-15 / R-16 asiento por asiento.
    if (L && L.asientos.length > 0) {
      itemsConDatos.add('soportes-terceros')
      const calc = L.anomalias.filter((a) => a.tipo === 'calculo')
      const tarifa = L.anomalias.filter((a) => a.tipo === 'tarifa')
      regla('R-15', `R-15: ${L.asientos.length} asiento(s) con base; ${calc.length} con retención ≠ base × tarifa; ${tarifa.length} con tarifa no admisible para su concepto.`)
      const MAX_FILAS = 200
      const colAsiento: ColumnaCedula[] = [{ clave: 'fecha', titulo: 'Fecha', formato: 'texto' }, { clave: 'doc', titulo: 'Documento', formato: 'texto' }, { clave: 'tercero', titulo: 'Tercero', formato: 'texto' }, { clave: 'concepto', titulo: 'Concepto', formato: 'texto' }, { clave: 'base', titulo: 'Base', formato: 'moneda' }, { clave: 'tarifa', titulo: 'Tarifa', formato: 'porcentaje' }, { clave: 'retencion', titulo: 'Retención', formato: 'moneda' }, { clave: 'esperado', titulo: 'Base × tarifa', formato: 'moneda' }]
      const valoresAsiento = (a: (typeof L.asientos)[number]) => ({ fecha: a.fecha, doc: a.numeroDoc ?? '', tercero: a.terceroNombre ?? a.tercero ?? '', concepto: nombreConcepto(a.concepto), base: Math.round(a.base), tarifa: a.tarifaRegistrada ?? a.tarifa, retencion: Math.round(a.retencion), esperado: Math.round(a.base * ((a.tarifaRegistrada ?? a.tarifa) / 100)) })
      const T_EXC: Tabla = { id: 'excepciones', titulo: 'Asientos con excepción', descripcion: 'Asientos cuya retención no es base por tarifa, o cuya tarifa no es admisible para el concepto.', columnas: colAsiento }
      const propAnomalia: Partial<Record<'calculo' | 'tarifa', { codigo: string | null; nota: string | null }>> = {}
      const proponerAnomalias = (lista: typeof L.anomalias, tipo: 'calculo' | 'tarifa') => {
        if (!lista.length) return
        const monto = lista.reduce((s, a) => s + Math.abs(a.asiento.retencion), 0)
        const ejemplos = lista.slice(0, 5).map((a) => `${a.asiento.fecha} ${a.asiento.numeroDoc ?? ''} ${a.asiento.terceroNombre ?? a.asiento.tercero ?? ''}: ${a.detalle}`.trim())
        propAnomalia[tipo] = proponer({
          cedula: 'tarifas-asientos',
          tipo: 'hallazgo', reglasIds: ['R-15'], titulo: tipo === 'calculo' ? `${lista.length} asiento(s) con retención que no es base × tarifa` : `${lista.length} asiento(s) con tarifa no admisible para su concepto`,
          renglonId: null, monto, severidad: lista.length > 10 ? 'alta' : 'media', certeza: 'verificado',
          datos: [{ etiqueta: 'asientos', valor: String(lista.length) }, { etiqueta: 'retención involucrada', valor: fmt(monto) }, { etiqueta: 'conceptos', valor: [...new Set(lista.map((a) => nombreConcepto(a.asiento.concepto)))].join(', ') }],
          checklistItem: 'soportes-terceros', cuenta: tipo,
          contenido: {
            descripcion: (tipo === 'calculo' ? 'En estos asientos la retención contabilizada no corresponde a la base por la tarifa registrada:\n' : 'En estos asientos la tarifa aplicada no es ninguna de las admisibles para el concepto:\n') + ejemplos.map((e) => `• ${e}`).join('\n') + (lista.length > 5 ? `\n… y ${lista.length - 5} más.` : ''),
            norma: 'Arts. 392 y 401 ET · DUR 1625/2016 (tarifas por concepto)', recomendacion: 'Revisar los soportes de esos asientos con el contador; si la tarifa aplicada fue menor, hay retención dejada de practicar (art. 370 ET: el agente responde por ella).',
          },
          bitacora: [{ tipo: 'regla', texto: `R-15: ${lista.length} anomalía(s) de ${tipo}.`, referencia: { regla: 'R-15' } }],
        })
      }
      proponerAnomalias(calc, 'calculo')
      proponerAnomalias(tarifa, 'tarifa')

      // Población completa resumida por concepto y tarifa: lo que se recalculó, no solo lo que falló.
      const T_POB: Tabla = { id: 'poblacion', titulo: 'Población recalculada por concepto y tarifa', descripcion: `${L.asientos.length} asiento(s) con base en el período: el 100 % se recalculó.`, columnas: [{ clave: 'concepto', titulo: 'Concepto', formato: 'texto' }, { clave: 'tarifa', titulo: 'Tarifa', formato: 'porcentaje' }, { clave: 'asientos', titulo: 'Asientos', formato: 'numero' }, { clave: 'base', titulo: 'Base', formato: 'moneda' }, { clave: 'retencion', titulo: 'Retención', formato: 'moneda' }, { clave: 'esperado', titulo: 'Base × tarifa', formato: 'moneda' }, { clave: 'diferencia', titulo: 'Diferencia', formato: 'moneda' }, { clave: 'excepciones', titulo: 'Excepciones', formato: 'numero' }] }
      const conAnomalia = new Set(L.anomalias.map((a) => a.asiento))
      const grupos = new Map<string, { concepto: string; tarifa: number; n: number; base: number; ret: number; esp: number; exc: number }>()
      for (const a of L.asientos) {
        const t = Math.round((a.tarifaRegistrada ?? a.tarifa) * 100) / 100
        const noPlana = a.concepto === 'trabajo' || a.concepto === 'pensiones' || a.concepto === 'dividendos'
        const k = noPlana ? a.concepto : `${a.concepto}|${t}`
        const g = grupos.get(k) ?? { concepto: a.concepto, tarifa: noPlana ? NaN : t, n: 0, base: 0, ret: 0, esp: 0, exc: 0 }
        g.n++; g.base += a.base; g.ret += a.retencion; g.esp += a.base * (t / 100)
        if (conAnomalia.has(a)) g.exc++
        grupos.set(k, g)
      }
      for (const g of [...grupos.values()].sort((x, y) => x.concepto.localeCompare(y.concepto) || x.tarifa - y.tarifa)) {
        const noPlana = Number.isNaN(g.tarifa)
        fila(C.detalle, T_POB, { concepto: nombreConcepto(g.concepto), tarifa: noPlana ? null : g.tarifa, asientos: g.n, base: Math.round(g.base), retencion: Math.round(g.ret), esperado: noPlana ? null : Math.round(g.esp), diferencia: noPlana ? null : Math.round(g.ret - g.esp), excepciones: g.exc },
          noPlana ? 'no_verificable' : g.exc ? 'diferencia' : 'conforme', { regla: 'R-15', nota: noPlana ? 'No es tarifa plana (tabla del art. 383 ET): no se recalcula.' : null })
      }
      const tExc = tablaDeCedula(C.detalle, T_EXC.id, T_EXC.titulo, T_EXC.columnas, T_EXC.descripcion)
      for (const a of L.anomalias.slice(0, MAX_FILAS)) tExc.filas.push({ valores: valoresAsiento(a.asiento), estado: 'diferencia', regla: 'R-15', nota: propAnomalia[a.tipo]?.nota ?? a.detalle, propuesta: propAnomalia[a.tipo]?.codigo ?? null })
      if (L.anomalias.length > MAX_FILAS) tExc.omitidas = L.anomalias.length - MAX_FILAS
      // Partidas de mayor valor: referencia para que el auditor escoja qué soportes inspeccionar.
      const T_MAY: Tabla = { id: 'mayores', titulo: 'Partidas de mayor valor', descripcion: 'Los 25 asientos de mayor base del período, como referencia para seleccionar soportes a inspeccionar. La población completa está en el auxiliar adjunto.', columnas: colAsiento }
      for (const a of [...L.asientos].sort((x, y) => Math.abs(y.base) - Math.abs(x.base)).slice(0, 25)) fila(C.detalle, T_MAY, valoresAsiento(a), conAnomalia.has(a) ? 'diferencia' : 'informativo', { regla: 'R-15' })

      // R-16 cuantía mínima.
      const uvt = UVT_POR_ANIO[entrada.periodo.anio]
      if (!uvt) {
        limitaciones.push({ regla: 'R-16', motivo: `Sin UVT configurada para ${entrada.periodo.anio}: no se verificó la cuantía mínima (agregarla en tarifas-retefuente.ts).` })
        C.detalle.limitaciones.push(`No se verificó la cuantía mínima: falta la UVT de ${entrada.periodo.anio}.`)
      } else {
        const bajoMinimo = L.asientos.filter((a) => { const min = cuantiaMinima(a.concepto, entrada.periodo.anio); return min !== null && a.retencion > 0 && a.base > 0 && a.base < min })
        regla('R-16', `R-16: UVT ${entrada.periodo.anio} ${fmt(uvt)}; ${bajoMinimo.length} asiento(s) con retención sobre pagos bajo la cuantía mínima de su concepto.`)
        if (bajoMinimo.length) {
          const pr = proponer({
            cedula: 'tarifas-asientos',
            tipo: 'juicio', reglasIds: ['R-16'], titulo: `${bajoMinimo.length} retención(es) practicadas bajo la cuantía mínima`, renglonId: null, monto: bajoMinimo.reduce((s, a) => s + a.retencion, 0), severidad: 'baja', certeza: 'requiere_evidencia',
            datos: [{ etiqueta: 'asientos', valor: String(bajoMinimo.length) }, { etiqueta: 'conceptos', valor: [...new Set(bajoMinimo.map((a) => nombreConcepto(a.concepto)))].join(', ') }], checklistItem: 'soportes-terceros',
            contenido: { descripcion: `Hay pagos por debajo de la cuantía mínima del concepto (${bajoMinimo.slice(0, 3).map((a) => `${a.terceroNombre ?? a.tercero ?? ''} base ${fmt(a.base)}`).join('; ')}) a los que se les practicó retención. Es válido si el pago hace parte de una factura mayor o de pagos acumulados al mismo tercero.`, para: 'Confirmar si la retención bajo la cuantía mínima se justifica por acumulación de pagos o si se retuvo de más.', opciones: [{ clave: 'ok', label: 'Justificado (pagos acumulados)' }, { clave: 'revisar', label: 'Retención de más: revisar' }] },
            bitacora: [{ tipo: 'regla', texto: `R-16: base < ${bajoMinimo.length ? fmt(cuantiaMinima(bajoMinimo[0].concepto, entrada.periodo.anio) ?? 0) : ''} en ${bajoMinimo.length} asiento(s).`, referencia: { regla: 'R-16' } }],
          })
          const tMin = tablaDeCedula(C.detalle, 'cuantia', 'Retenciones sobre pagos bajo la cuantía mínima', [...colAsiento.slice(0, 7), { clave: 'minima', titulo: 'Cuantía mínima', formato: 'moneda' }], `UVT ${entrada.periodo.anio}: $${fmt(uvt)}.`)
          for (const a of bajoMinimo.slice(0, MAX_FILAS)) tMin.filas.push({ valores: { ...valoresAsiento(a), minima: cuantiaMinima(a.concepto, entrada.periodo.anio) }, estado: 'por_confirmar', regla: 'R-16', propuesta: pr.codigo, nota: pr.nota })
          if (bajoMinimo.length > MAX_FILAS) tMin.omitidas = bajoMinimo.length - MAX_FILAS
        }
      }
    } else if (L) {
      limitaciones.push({ regla: 'R-15, R-16', motivo: 'El libro no trae la base por asiento: no se verificó tarifa ni cuantía mínima asiento por asiento.' })
      if (C.detalle.estado === 'ejecutada') { C.detalle.estado = 'sin_insumos'; C.detalle.motivo = `El libro cargado no trae la base de cada asiento (es un balance o un auxiliar sin columna de base).${L.terceros ? ' En su lugar se corrió la prueba de razonabilidad por tercero.' : ''}` }
    }

    // R-17 razonabilidad por tercero: lo causado en gasto, costo o compras contra lo retenido.
    const PT = L?.terceros ?? null
    if (PT) {
      itemsConDatos.add('soportes-terceros')
      const nAlertas = PT.alertas.sin_retencion + PT.alertas.retencion_baja + PT.alertas.retencion_alta + PT.alertas.retencion_sin_base
      regla('R-17', `R-17: ${PT.terceros} tercero(s); base presunta ${fmt(PT.baseTotal)}, retención ${fmt(PT.retencionTotal)}; ${PT.alertas.sin_retencion} sin retención, ${PT.alertas.retencion_baja} con retención inferior, ${PT.alertas.retencion_alta} superior, ${PT.alertas.retencion_sin_base} con retención sin base.`)
      const propAlerta: Partial<Record<AlertaTercero, { codigo: string | null; nota: string | null }>> = {}
      const textos: Record<AlertaTercero, { titulo: (n: number) => string; descripcion: string; para: string }> = {
        sin_retencion: { titulo: (n) => `${n} tercero(s) con gasto o compra y sin retención`, descripcion: 'A estos terceros se les causó gasto, costo o compras por encima de la cuantía mínima del concepto y no tienen retención en la 2365 en el período:', para: 'Confirmar con el RUT o la factura si el tercero es autorretenedor, del régimen simple o no sujeto; si no, hay retención dejada de practicar (art. 370 ET).' },
        retencion_baja: { titulo: (n) => `${n} tercero(s) con parte de lo causado sin retención`, descripcion: 'A estos terceros se les causó más de lo que explica la retención que se les practicó:', para: 'Revisar las facturas de estos terceros: parte de lo causado pudo no estar sujeto, o se aplicó una tarifa menor a la debida.' },
        retencion_alta: { titulo: (n) => `${n} tercero(s) con retención superior a lo causado`, descripcion: 'La retención practicada a estos terceros corresponde a una base mayor que lo causado en el período:', para: 'Confirmar si la base está en otra cuenta u otro período, o si se retuvo de más.' },
        retencion_sin_base: { titulo: (n) => `${n} tercero(s) con retención y sin gasto ni compra`, descripcion: 'Estos terceros tienen retención en la 2365 y nada causado en gasto, costo o compras en el período:', para: 'Ubicar la base: puede estar en una cuenta que el libro no trae (activos, anticipos) o en otro período.' },
      }
      for (const tipo of ['sin_retencion', 'retencion_baja', 'retencion_alta', 'retencion_sin_base'] as AlertaTercero[]) {
        const lista = PT.filas.filter((f) => f.alerta === tipo)
        if (!PT.alertas[tipo] || !lista.length) continue
        const monto = lista.reduce((s, f) => s + Math.abs(tipo === 'retencion_sin_base' ? f.baseRetenida : f.diferencia), 0)
        const ejemplos = lista.slice(0, 5).map((f) => `• ${f.nombre ?? f.tercero ?? 'Tercero'}${f.tercero ? ` (${f.tercero})` : ''}: causado ${fmt(f.base)}, retenido ${fmt(f.retencion)}, base que explica la retención ${fmt(f.baseRetenida)}`)
        propAlerta[tipo] = proponer({
          cedula: 'terceros-gasto',
          tipo: 'juicio', reglasIds: ['R-17'], titulo: textos[tipo].titulo(PT.alertas[tipo]), renglonId: null, monto, severidad: tipo === 'sin_retencion' || tipo === 'retencion_baja' ? 'media' : 'baja', certeza: 'requiere_evidencia',
          datos: [{ etiqueta: 'terceros', valor: String(PT.alertas[tipo]) }, { etiqueta: 'base por explicar', valor: fmt(monto) }],
          checklistItem: 'soportes-terceros', cuenta: `terceros:${tipo}`,
          contenido: {
            descripcion: `${textos[tipo].descripcion}\n${ejemplos.join('\n')}${PT.alertas[tipo] > 5 ? `\n… y ${PT.alertas[tipo] - 5} más, en la cédula.` : ''}\nEs una prueba de razonabilidad: lo causado en el período es una base presunta, no la base exacta de retención.`,
            para: textos[tipo].para,
            opciones: [{ clave: 'ok', label: 'Revisado: tiene explicación' }, { clave: 'revisar', label: 'Hay que revisarlo con el contador' }],
          },
          bitacora: [{ tipo: 'contraste', texto: `R-17: ${PT.alertas[tipo]} tercero(s) con alerta "${ALERTA_TERCERO_LABEL[tipo]}".`, referencia: { regla: 'R-17' } }],
        })
      }
      const T_TER: Tabla = { id: 'terceros', titulo: 'Causado contra retenido por tercero', descripcion: `${PT.terceros} tercero(s) del período. Primero los que tienen alerta, de mayor a menor efecto.`, columnas: [{ clave: 'tercero', titulo: 'Tercero', formato: 'texto' }, { clave: 'nit', titulo: 'NIT', formato: 'texto' }, { clave: 'concepto', titulo: 'Concepto', formato: 'texto' }, { clave: 'base', titulo: 'Causado (base presunta)', formato: 'moneda' }, { clave: 'retencion', titulo: 'Retenido', formato: 'moneda' }, { clave: 'implicita', titulo: 'Tarifa implícita', formato: 'porcentaje' }, { clave: 'baseRetenida', titulo: 'Base que explica la retención', formato: 'moneda' }, { clave: 'diferencia', titulo: 'Causado sin explicar', formato: 'moneda' }] }
      const tTer = tablaDeCedula(C.terceros, T_TER.id, T_TER.titulo, T_TER.columnas, T_TER.descripcion)
      for (const f of PT.filas) {
        tTer.filas.push({
          valores: { tercero: f.nombre ?? '', nit: f.tercero ?? '', concepto: f.conceptos.map((c) => CONCEPTO_BASE_LABEL[c]).join(', '), base: f.base, retencion: f.retencion, implicita: f.tarifaImplicita, baseRetenida: f.baseRetenida, diferencia: f.diferencia },
          estado: f.alerta ? 'por_confirmar' : f.base > 0 && f.retencion > 0 ? 'conforme' : 'informativo', regla: 'R-17',
          propuesta: f.alerta ? propAlerta[f.alerta]?.codigo ?? null : null, nota: f.alerta ? `${ALERTA_TERCERO_LABEL[f.alerta]}. ${propAlerta[f.alerta]?.nota ?? f.nota ?? ''}`.trim() : f.nota,
        })
      }
      if (PT.omitidas) tTer.omitidas = PT.omitidas
      for (const c of PT.cuentasBase) fila(C.terceros, { id: 'cuentas-base', titulo: 'Cuentas tomadas como base presunta', columnas: [{ clave: 'cuenta', titulo: 'Cuenta', formato: 'texto' }, { clave: 'nombre', titulo: 'Nombre', formato: 'texto' }, { clave: 'concepto', titulo: 'Concepto', formato: 'texto' }, { clave: 'terceros', titulo: 'Terceros', formato: 'numero' }, { clave: 'neto', titulo: 'Causado en el período', formato: 'moneda' }] },
        { cuenta: c.cuenta, nombre: c.nombre ?? '', concepto: CONCEPTO_BASE_LABEL[c.concepto], terceros: c.terceros, neto: c.neto }, 'informativo', { regla: 'R-17' })
      for (const c of PT.excluidas) fila(C.terceros, { id: 'excluidas', titulo: 'Cuentas de gasto o costo que no se tomaron como base', columnas: [{ clave: 'cuenta', titulo: 'Cuenta', formato: 'texto' }, { clave: 'nombre', titulo: 'Nombre', formato: 'texto' }, { clave: 'motivo', titulo: 'Por qué se excluyó', formato: 'texto' }, { clave: 'neto', titulo: 'Movimiento del período', formato: 'moneda' }] },
        { cuenta: c.cuenta, nombre: c.nombre ?? '', motivo: c.motivo, neto: c.neto }, 'informativo', { regla: 'R-17' })
      C.terceros.limitaciones.push('Lo causado en el período es una base presunta: no distingue pagos individuales bajo la cuantía mínima ni terceros autorretenedores o del régimen simple.')
      if (PT.uvt?.deReferencia) C.terceros.limitaciones.push(`La cuantía mínima se midió con la UVT de ${PT.uvt.anio} porque la de ${entrada.periodo.anio} no está configurada.`)
      if (nAlertas === 0) regla('R-17', 'R-17: ningún tercero con alerta.')
    } else if (C.terceros.estado === 'ejecutada') {
      C.terceros.estado = 'sin_insumos'
      C.terceros.motivo = `${L?.tercerosPorQue ?? 'Se usó el Según libros guardado en la revisión, sin detalle por tercero.'} Esta prueba necesita un balance de prueba por terceros (o un auxiliar) que incluya las cuentas de gasto y costo y la 2365.`
      limitaciones.push({ regla: 'R-17', motivo: C.terceros.motivo })
    }
  }
  if (!hayLibros) {
    for (const c of [C.renta, C.reteiva, C.autorretencion, C.detalle, C.terceros]) if (c.estado === 'ejecutada') { c.estado = 'sin_insumos'; c.motivo = 'Sin auxiliar ni balance de 2365/2367: no se comparó contra libros.' }
  } else if (!L && C.detalle.estado === 'ejecutada') {
    C.detalle.estado = 'sin_insumos'; C.detalle.motivo = 'Se usó el Según libros guardado en la revisión: sin asientos no hay prueba de detalle.'
  }

  // ─── Bloque D · continuidad y oportunidad ────────────────────────────────
  const totalActual = dec('rf-total')
  if (entrada.anterior && totalActual !== null) {
    const RA = resolverCifras('retefuente', entrada.anterior.cifras)
    const totalAnt = RA['rf-total']?.declarado ?? null
    if (totalAnt !== null && totalAnt > 0) {
      itemsConDatos.add('periodo-anterior')
      const var_ = ((totalActual - totalAnt) / totalAnt) * 100
      const T_VAR: Tabla = { id: 'variacion', titulo: `Comparativo con ${entrada.anterior.etiqueta}`, descripcion: 'Lo declarado en este período contra el anterior. El total se evalúa contra el umbral; los conceptos marcan las variaciones que lo explican.', columnas: [{ clave: 'partida', titulo: 'Partida', formato: 'texto' }, { clave: 'casilla', titulo: 'Casilla', formato: 'texto' }, { clave: 'actual', titulo: 'Este período', formato: 'moneda' }, { clave: 'anterior', titulo: 'Período anterior', formato: 'moneda' }, { clave: 'variacion', titulo: 'Variación', formato: 'moneda' }, { clave: 'pct', titulo: '%', formato: 'porcentaje' }] }
      const filasConcepto: { id: string; a: number; b: number }[] = []
      for (const id of ids) {
        if (id.endsWith('-base')) continue
        const a = dec(id) ?? 0
        const b = RA[id]?.declarado ?? 0
        if (a !== 0 || b !== 0) filasConcepto.push({ id, a, b })
      }
      const filaVariacion = (partida: string, casilla: string | null, a: number, b: number, estado: EstadoFilaCedula, extra: Parameters<typeof fila>[4] = {}) =>
        fila(C.anterior, T_VAR, { partida, casilla, actual: a, anterior: b, variacion: a - b, pct: b !== 0 ? ((a - b) / Math.abs(b)) * 100 : null }, estado, { regla: 'R-30', ...extra })
      const registrarConceptos = () => {
        for (const f of filasConcepto) {
          const fuerte = f.b === 0 || f.a === 0 || Math.abs((f.a - f.b) / f.b) * 100 > UMBRALES_RETEFUENTE.variacionMensualPct
          filaVariacion((ETIQUETA.get(f.id) ?? f.id).replace(/ — .*$/, ''), CASILLA.get(f.id) ?? null, f.a, f.b, fuerte && Math.abs(f.a - f.b) > toleranciaRedondeo(1) ? 'por_confirmar' : 'informativo',
            { nota: f.b === 0 ? 'Aparece este período.' : f.a === 0 ? 'Desaparece este período.' : fuerte ? `Variación superior al ${UMBRALES_RETEFUENTE.variacionMensualPct} %.` : null })
        }
      }
      regla('R-30', `R-30: total retenido ${fmt(totalActual)} vs ${fmt(totalAnt)} en ${entrada.anterior.etiqueta}: variación ${pct(var_)}.`)
      if (Math.abs(var_) <= UMBRALES_RETEFUENTE.variacionMensualPct) filaVariacion('Total retenciones', '136', totalActual, totalAnt, 'conforme')
      if (Math.abs(var_) > UMBRALES_RETEFUENTE.variacionMensualPct) {
        const pr = proponer({
          cedula: 'periodo-anterior',
          tipo: 'juicio', reglasIds: ['R-30'], titulo: `El total retenido varió ${pct(var_)} frente a ${entrada.anterior.etiqueta}`, renglonId: 'rf-total', monto: Math.abs(totalActual - totalAnt), severidad: 'media', certeza: 'requiere_evidencia',
          datos: [{ etiqueta: 'este período', valor: fmt(totalActual) }, { etiqueta: entrada.anterior.etiqueta, valor: fmt(totalAnt) }, { etiqueta: 'variación', valor: pct(var_) }], checklistItem: 'periodo-anterior',
          contenido: { descripcion: `El total de retenciones (casilla 136) pasó de ${fmt(totalAnt)} en ${entrada.anterior.etiqueta} a ${fmt(totalActual)}: ${pct(var_)}. Una variación así amerita explicación (estacionalidad, pagos extraordinarios, omisiones).`, para: 'Documentar la causa de la variación en el papel de trabajo.', opciones: [{ clave: 'ok', label: 'Explicada por la operación' }, { clave: 'revisar', label: 'Revisar conceptos que cambiaron' }] },
          bitacora: [{ tipo: 'contraste', texto: `R-30: variación ${pct(var_)} > ${UMBRALES_RETEFUENTE.variacionMensualPct} %.`, referencia: { regla: 'R-30' } }],
        })
        filaVariacion('Total retenciones', '136', totalActual, totalAnt, 'por_confirmar', { propuesta: pr, nota: pr.nota ?? `Variación superior al ${UMBRALES_RETEFUENTE.variacionMensualPct} %.` })
      }
      registrarConceptos()
    }
  } else if (totalActual !== null) {
    limitaciones.push({ regla: 'R-30', motivo: 'Sin revisión del mes anterior en la plataforma: no se comparó la variación.' })
  }
  if (C.anterior.estado === 'ejecutada' && C.anterior.tablas.length === 0) { C.anterior.estado = 'sin_insumos'; C.anterior.motivo = 'No hay revisión del mes anterior con cifras declaradas en la plataforma.' }

  // R-31 presentación tardía; R-32 sanciones y pago total (art. 580-1).
  const T_OPO: Tabla = { id: 'oportunidad', titulo: 'Presentación, sanciones y pago', columnas: [{ clave: 'punto', titulo: 'Punto verificado', formato: 'texto' }, { clave: 'dato', titulo: 'Dato', formato: 'texto' }, { clave: 'valor', titulo: 'Valor', formato: 'moneda' }] }
  if (!entrada.fechaPresentacion || !entrada.fechaVencimiento) {
    fila(C.oportunidad, T_OPO, { punto: 'Presentación dentro del plazo', dato: `Vencimiento ${entrada.fechaVencimiento ?? 'sin registrar'} · presentación ${entrada.fechaPresentacion ?? 'sin registrar'}`, valor: null }, 'no_verificable', { regla: 'R-31', nota: 'Falta registrar la fecha en la revisión.' })
  }
  if (entrada.fechaPresentacion && entrada.fechaVencimiento) {
    itemsConDatos.add('presentacion-pago')
    regla('R-31', `R-31: presentada ${entrada.fechaPresentacion}, vencía ${entrada.fechaVencimiento}.`)
    const datoFechas = `Vencimiento ${entrada.fechaVencimiento} · presentación ${entrada.fechaPresentacion}`
    if (entrada.fechaPresentacion <= entrada.fechaVencimiento) fila(C.oportunidad, T_OPO, { punto: 'Presentación dentro del plazo', dato: datoFechas, valor: null }, 'conforme', { regla: 'R-31' })
    if (entrada.fechaPresentacion > entrada.fechaVencimiento) {
      const pr = proponer({
        cedula: 'oportunidad',
        tipo: 'hallazgo', reglasIds: ['R-31'], titulo: 'Declaración presentada después del vencimiento', renglonId: 'rf-sanciones', monto: dec('rf-sanciones'), severidad: 'alta', certeza: 'verificado',
        datos: [{ etiqueta: 'vencimiento', valor: entrada.fechaVencimiento }, { etiqueta: 'presentación', valor: entrada.fechaPresentacion }, { etiqueta: 'sanción declarada (c. 137)', valor: fmt(dec('rf-sanciones') ?? 0) }], checklistItem: 'presentacion-pago',
        contenido: { descripcion: `La declaración se presentó el ${entrada.fechaPresentacion}, después del vencimiento del ${entrada.fechaVencimiento}.${(dec('rf-sanciones') ?? 0) > 0 ? '' : ' La casilla 137 no liquida sanción de extemporaneidad.'}`, norma: 'Art. 641 ET (extemporaneidad) · art. 580-1 ET (ineficacia sin pago total)', recomendacion: 'Verificar la liquidación de la sanción e intereses y el pago total dentro de los dos meses siguientes para que la declaración produzca efectos.' },
        bitacora: [{ tipo: 'regla', texto: 'R-31: presentación > vencimiento.', referencia: { regla: 'R-31' } }],
      })
      fila(C.oportunidad, T_OPO, { punto: 'Presentación dentro del plazo', dato: datoFechas, valor: null }, 'diferencia', { regla: 'R-31', propuesta: pr, nota: pr.nota ?? 'Presentada después del vencimiento.' })
    }
  }
  const sanciones = dec('rf-sanciones')
  if (sanciones !== null && sanciones > 0) {
    itemsConDatos.add('presentacion-pago')
    regla('R-32', `R-32: casilla 137 liquida sanción por ${fmt(sanciones)}.`)
    const pr = proponer({
      cedula: 'oportunidad',
      tipo: 'juicio', reglasIds: ['R-32'], titulo: 'Sanción liquidada en el formulario', renglonId: 'rf-sanciones', monto: sanciones, severidad: 'baja', certeza: 'requiere_evidencia',
      datos: [{ etiqueta: 'sanción (c. 137)', valor: fmt(sanciones) }], checklistItem: 'presentacion-pago',
      contenido: { descripcion: `El formulario liquida ${fmt(sanciones)} de sanción en la casilla 137. Debe corresponder a extemporaneidad o corrección y pagarse completo con la declaración.`, para: 'Confirmar el motivo y que el pago total incluya la sanción.', opciones: [{ clave: 'ok', label: 'Sanción correcta y pagada' }, { clave: 'revisar', label: 'Revisar la liquidación' }] },
      bitacora: [{ tipo: 'regla', texto: 'R-32: sanción > 0.', referencia: { regla: 'R-32' } }],
    })
    fila(C.oportunidad, T_OPO, { punto: 'Sanciones liquidadas', dato: 'Casilla 137', valor: sanciones }, 'por_confirmar', { regla: 'R-32', propuesta: pr })
  } else if (sanciones !== null) {
    fila(C.oportunidad, T_OPO, { punto: 'Sanciones liquidadas', dato: 'Casilla 137', valor: 0 }, 'informativo', { regla: 'R-32' })
  }
  if ((dec('rf-total-sanciones') ?? 0) > 0) {
    itemsConDatos.add('presentacion-pago')
    regla('R-32', `R-32: total a pagar ${fmt(dec('rf-total-sanciones')!)}: la declaración solo produce efectos con el pago total (art. 580-1 ET).`)
    const pr = proponer({
      cedula: 'oportunidad',
      tipo: 'juicio', reglasIds: ['R-32'], titulo: 'Confirmar el pago total de la declaración', renglonId: 'rf-total-sanciones', monto: dec('rf-total-sanciones'), severidad: 'media', certeza: 'requiere_evidencia',
      datos: [{ etiqueta: 'total a pagar (c. 138)', valor: fmt(dec('rf-total-sanciones')!) }], checklistItem: 'presentacion-pago',
      contenido: { descripcion: `La declaración liquida ${fmt(dec('rf-total-sanciones')!)} a pagar. Una declaración de retención presentada sin pago total no produce efecto legal (art. 580-1 ET), salvo que se pague dentro de los dos meses siguientes con intereses.`, para: 'Adjuntar el recibo de pago (formulario 490 o casilla 980) como soporte de la revisión.', opciones: [{ clave: 'ok', label: 'Pago total verificado' }, { clave: 'pendiente', label: 'Pago pendiente: hacer seguimiento' }], tributario: { nota: 'Pago total verificado con el recibo adjunto (art. 580-1 ET).' } },
      bitacora: [{ tipo: 'regla', texto: 'R-32: total a pagar > 0 → exigir soporte de pago.', referencia: { regla: 'R-32' } }],
    })
    fila(C.oportunidad, T_OPO, { punto: 'Pago total de la declaración', dato: 'Casilla 138: requiere el recibo de pago como soporte', valor: dec('rf-total-sanciones') }, 'por_confirmar', { regla: 'R-32', propuesta: pr })
  }

  // ─── Verificados: ítems con reglas que corrieron y sin propuestas ─────────
  // Puntos del checklist cuyas reglas corrieron sin producir propuestas. Ya no se propone
  // "marcar como verificado": el punto se cierra con la conclusión del auditor en la cédula.
  const verificados = ['bases-contabilidad', 'tarifas-conceptos', 'autorretencion', 'soportes-terceros', 'presentacion-pago', 'periodo-anterior'].filter((item) => itemsConDatos.has(item) && !itemsConPropuesta.has(item))
  if (omitidas.size) limitaciones.push({ regla: [...omitidas].sort().join(', '), motivo: `Pasos desactivados por el auditor en el programa: ${propuestasOmitidas} propuesta(s) no se muestran.` })
  limitaciones.push({ regla: 'R-20..R-25', motivo: 'Cruce con los documentos electrónicos recibidos (universo de pagos por tercero): etapa siguiente.' })

  const cedulas = [C.formulario, C.lectura, C.renta, C.reteiva, C.autorretencion, C.detalle, C.terceros, C.anterior, C.oportunidad].map(cerrarCedula)
  for (const c of cedulas) if (c.estado === 'ejecutada') bit.push({ tipo: 'regla', texto: `Cédula "${c.titulo}": ${c.resultado.filas} partida(s); ${c.resultado.conformes} conforme(s), ${c.resultado.diferencias} con diferencia, ${c.resultado.porConfirmar} por confirmar.`, referencia: { cedula: c.id } })

  return {
    propuestas, bitacora: bit, cifrasLibros, cedulas,
    resumen: {
      reglasEjecutadas: [...reglas].sort(), limitaciones, verificados,
      hallazgos: propuestas.filter((p) => p.tipo === 'hallazgo').length, juicios: propuestas.filter((p) => p.tipo === 'juicio').length,
      ambiguedades: propuestas.filter((p) => p.tipo === 'ambiguedad').length, documentos: propuestas.filter((p) => p.tipo === 'documento').length,
    },
  }
}

/** Solo para tests y documentación: qué conceptos tienen tarifa verificable. */
export const CONCEPTOS_CON_TARIFA = Object.keys(TARIFAS_RETEFUENTE)
export { tarifaAdmisible }
