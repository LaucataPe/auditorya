/**
 * Mapeo de columnas del balance de prueba (importación asistida).
 *
 * En lugar de adivinar la estructura del archivo por posición (heurística),
 * el archivo se importa con un mapeo explícito columna → campo, que el
 * usuario confirma en un asistente. Este módulo aporta las tres piezas puras:
 *
 *  - `detectarMapeo`: sugiere el mapeo leyendo encabezados (o, sin ellos,
 *    por el contenido de las columnas). Es solo una sugerencia.
 *  - `aplicarMapeo`: convierte la matriz cruda en filas `CuentaImport`,
 *    sin mezclar nunca el nombre de la cuenta con el nombre del tercero.
 *  - `validarBalance`: chequeos aritméticos antes de importar (ecuación por
 *    fila, débitos = créditos, ecuación patrimonial, jerarquía, duplicados).
 *
 * Funciones puras para reutilizarlas en frontend (wizard) y backend.
 */

import type { CuentaImport } from './balance'
import { nombrePuc, parseNumeroLocal } from './parse-balance'

// ─── Campos destino ──────────────────────────────────────────────────────────

export type CampoBalance =
  | 'codigo'
  | 'nombreCuenta'
  | 'nivel'
  | 'nitTercero'
  | 'nombreTercero'
  | 'saldoInicial'
  | 'debito'
  | 'credito'
  | 'saldoFinal'

/** Un campo (o null = ignorar) por cada columna del archivo. */
export type MapeoColumnas = (CampoBalance | null)[]

export const CAMPO_BALANCE_LABEL: Record<CampoBalance, string> = {
  codigo: 'Código de cuenta',
  nombreCuenta: 'Nombre de la cuenta',
  nivel: 'Nivel',
  nitTercero: 'NIT / identificación del tercero',
  nombreTercero: 'Nombre del tercero',
  saldoInicial: 'Saldo inicial',
  debito: 'Débitos',
  credito: 'Créditos',
  saldoFinal: 'Saldo final',
}

/** Orden de presentación en el selector del asistente. */
export const CAMPOS_BALANCE: CampoBalance[] = [
  'codigo', 'nombreCuenta', 'nivel', 'nitTercero', 'nombreTercero',
  'saldoInicial', 'debito', 'credito', 'saldoFinal',
]

/** Campos sin los cuales no se puede importar. */
export const CAMPOS_REQUERIDOS: CampoBalance[] = ['codigo', 'saldoFinal']

/** Perfil de importación reutilizable (se guarda por empresa). */
export type PerfilBalance = {
  mapeo: MapeoColumnas
  /** Encabezados normalizados del archivo con el que se creó, para re-aplicar por nombre. */
  encabezados: (string | null)[] | null
}

// ─── Detección del mapeo ─────────────────────────────────────────────────────

/** Normaliza un encabezado: minúsculas, sin tildes ni símbolos, espacios simples. */
export function normalizarEncabezado(s: string): string {
  return (s ?? '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Patrones por campo, evaluados en este orden (lo específico primero: "nombre
// tercero" debe ganar antes de que "nombre" caiga en nombreCuenta).
const PATRONES: [CampoBalance, RegExp[]][] = [
  ['saldoInicial', [/saldo (inicial|anterior|ant)\b/, /^(inicial|anterior)$/, /sdo\.? ?(inicial|ant)/]],
  ['saldoFinal', [/saldo (final|actual|nuevo)/, /nuevo saldo/, /^(final|actual)$/, /sdo\.? ?(final|act)/]],
  ['debito', [/^deb/, /debito/, /^db$/, /^debe$/, /mov(imiento)?s? deb/]],
  ['credito', [/^cred/, /credito/, /^cr$/, /^haber$/, /mov(imiento)?s? cred/]],
  ['nombreTercero', [/nombre (del )?tercero/, /razon social/, /tercero.*nombre/]],
  ['nitTercero', [/^nit\b/, /identificacion/, /^documento/, /num(ero)?.*doc/, /cod(igo)? (del )?tercero/, /^cc$/, /^tercero$/]],
  ['nombreCuenta', [/nombre (de la )?cuenta/, /descripcion/, /denominacion/, /^nombre$/, /^detalle$/, /^concepto$/]],
  ['nivel', [/^nivel$/]],
  ['codigo', [/codigo/, /^cuenta$/, /^cta\.?$/, /^puc$/, /^cod\.?$/]],
  // 'saldo' a secas: solo si no apareció otro saldo final.
  ['saldoFinal', [/^saldo$/, /^saldos$/]],
]

export type DeteccionMapeo = {
  mapeo: MapeoColumnas
  /** Índice de la fila de encabezados detectada; null si el archivo no trae. */
  filaEncabezado: number | null
  /** Índice de la primera fila de datos. */
  filaDatos: number
  /** Encabezados normalizados (misma longitud que `mapeo`); null si no hay. */
  encabezados: string[] | null
}

const esCodigo = (s: string) => /^\d+$/.test((s ?? '').trim())

/** Ancho real de la tabla: el máximo de celdas entre las filas examinadas. */
function anchoTabla(filas: string[][]): number {
  let ancho = 0
  for (const f of filas.slice(0, 200)) ancho = Math.max(ancho, f.length)
  return ancho
}

/** Mapea una fila de encabezados a campos. Devuelve null si casi nada coincide. */
function mapeoDesdeEncabezados(celdas: string[], ancho: number): MapeoColumnas | null {
  const mapeo: MapeoColumnas = new Array(ancho).fill(null)
  const asignados = new Set<CampoBalance>()
  let aciertos = 0
  for (let col = 0; col < ancho; col++) {
    const h = normalizarEncabezado(celdas[col] ?? '')
    if (!h) continue
    for (const [campo, regexes] of PATRONES) {
      if (asignados.has(campo)) continue
      if (regexes.some((r) => r.test(h))) {
        mapeo[col] = campo
        asignados.add(campo)
        aciertos++
        break
      }
    }
  }
  return aciertos >= 2 ? mapeo : null
}

/** Sugerencia posicional cuando no hay encabezados (heredera de la heurística previa). */
function mapeoPorContenido(filas: string[][], filaDatos: number, ancho: number): MapeoColumnas {
  const mapeo: MapeoColumnas = new Array(ancho).fill(null)
  const muestra = filas.slice(filaDatos, filaDatos + 200).filter((f) => esCodigo(f[0] ?? ''))
  if (muestra.length === 0) return mapeo

  mapeo[0] = 'codigo'

  // Clasifica cada columna por su contenido predominante.
  const numericas: number[] = []
  const texto: number[] = []
  for (let col = 1; col < ancho; col++) {
    let llenas = 0
    let nums = 0
    let letras = 0
    for (const f of muestra) {
      const v = (f[col] ?? '').toString().trim()
      if (!v) continue
      llenas++
      if (isFinite(parseNumeroLocal(v))) nums++
      if (/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(v)) letras++
    }
    if (llenas === 0) continue
    if (letras / llenas > 0.5) texto.push(col)
    else if (nums / llenas > 0.8) numericas.push(col)
  }

  // Las últimas hasta 4 numéricas son el bloque de saldos [inicial, débito, crédito, final].
  const saldos = numericas.slice(-4)
  if (saldos.length >= 4) {
    mapeo[saldos[0]] = 'saldoInicial'
    mapeo[saldos[1]] = 'debito'
    mapeo[saldos[2]] = 'credito'
    mapeo[saldos[3]] = 'saldoFinal'
  } else if (saldos.length >= 2) {
    mapeo[saldos[0]] = 'saldoInicial'
    mapeo[saldos[saldos.length - 1]] = 'saldoFinal'
  } else if (saldos.length === 1) {
    mapeo[saldos[0]] = 'saldoFinal'
  }

  // Numérica previa al bloque de saldos con pinta de NIT (enteros de 5-11 dígitos).
  const previas = numericas.slice(0, numericas.length - saldos.length)
  const candidataNit = previas[previas.length - 1]
  if (candidataNit !== undefined) {
    const pareceNit = muestra.some((f) => /^\d{5,11}$/.test((f[candidataNit] ?? '').toString().trim()))
    if (pareceNit) mapeo[candidataNit] = 'nitTercero'
  }

  // Columnas de texto: la primera es el nombre (de la cuenta o del tercero según
  // la fila — `aplicarMapeo` resuelve); una segunda columna de texto es el tercero.
  if (texto[0] !== undefined) mapeo[texto[0]] = 'nombreCuenta'
  if (texto[1] !== undefined) mapeo[texto[1]] = 'nombreTercero'

  return mapeo
}

/**
 * Detecta el mapeo sugerido para una matriz cruda: busca una fila de
 * encabezados en las primeras 15 filas; si no hay, sugiere por contenido.
 */
export function detectarMapeo(filas: string[][]): DeteccionMapeo {
  const ancho = anchoTabla(filas)

  for (let i = 0; i < Math.min(filas.length, 15); i++) {
    const fila = filas[i]
    if (!fila || esCodigo(fila[0] ?? '')) break // llegaron los datos: no hay encabezado
    const mapeo = mapeoDesdeEncabezados(fila, ancho)
    if (mapeo) {
      return {
        mapeo,
        filaEncabezado: i,
        filaDatos: i + 1,
        encabezados: Array.from({ length: ancho }, (_, c) => normalizarEncabezado(fila[c] ?? '')),
      }
    }
  }

  // Sin encabezado: los datos empiezan en la primera fila cuyo col 0 es un código.
  let filaDatos = filas.findIndex((f) => esCodigo(f?.[0] ?? ''))
  if (filaDatos < 0) filaDatos = 0
  return { mapeo: mapeoPorContenido(filas, filaDatos, ancho), filaEncabezado: null, filaDatos, encabezados: null }
}

/**
 * Reutiliza un perfil guardado si aplica al archivo nuevo: por nombre de
 * encabezado si ambos los tienen, o por número de columnas. Devuelve null
 * si el perfil no calza (se usa entonces la detección fresca).
 */
export function aplicarPerfil(perfil: PerfilBalance, deteccion: DeteccionMapeo): MapeoColumnas | null {
  const ancho = deteccion.mapeo.length
  if (perfil.encabezados && deteccion.encabezados) {
    const mapeo: MapeoColumnas = new Array(ancho).fill(null)
    let aciertos = 0
    for (let col = 0; col < ancho; col++) {
      const h = deteccion.encabezados[col]
      if (!h) continue
      const idx = perfil.encabezados.findIndex((e) => e === h)
      if (idx >= 0 && perfil.mapeo[idx]) {
        mapeo[col] = perfil.mapeo[idx]
        aciertos++
      }
    }
    return aciertos >= 2 ? mapeo : null
  }
  if (perfil.mapeo.length === ancho) return [...perfil.mapeo]
  return null
}

// ─── Aplicación del mapeo ────────────────────────────────────────────────────

/**
 * Convierte la matriz cruda en filas de importación según el mapeo confirmado.
 *
 * Reglas estrictas para no mezclar datos:
 *  - `nombre` (cuenta) solo sale de la columna mapeada como nombre de cuenta,
 *    con fallback al diccionario PUC. Nunca del texto del tercero.
 *  - `terceroNombre` solo existe si la fila tiene NIT. Si el archivo usa una
 *    sola columna de texto para ambos (formato por tercero clásico), en las
 *    filas con NIT ese texto es la razón social del tercero y el nombre de la
 *    cuenta cae al diccionario PUC.
 */
export function aplicarMapeo(filas: string[][], mapeo: MapeoColumnas, filaDatos: number): CuentaImport[] {
  const col = (campo: CampoBalance): number => mapeo.indexOf(campo)
  const cCodigo = col('codigo')
  const cNombre = col('nombreCuenta')
  const cNivel = col('nivel')
  const cNit = col('nitTercero')
  const cNombreTercero = col('nombreTercero')
  const cInicial = col('saldoInicial')
  const cDebito = col('debito')
  const cCredito = col('credito')
  const cFinal = col('saldoFinal')

  const celda = (fila: string[], c: number): string => (c >= 0 ? (fila[c] ?? '').toString().trim() : '')
  const numero = (fila: string[], c: number): number | null => {
    if (c < 0) return null
    const raw = celda(fila, c)
    if (raw === '') return null
    const n = parseNumeroLocal(raw)
    return isFinite(n) ? n : null
  }

  const out: CuentaImport[] = []
  for (let i = filaDatos; i < filas.length; i++) {
    const fila = filas[i]
    if (!fila || fila.length === 0) continue
    const codigo = celda(fila, cCodigo)
    if (!esCodigo(codigo)) continue // encabezados repetidos, totales, filas vacías

    const nivelRaw = numero(fila, cNivel)
    const nivel = nivelRaw !== null && nivelRaw > 0 ? Math.trunc(nivelRaw) : codigo.length

    const nitRaw = celda(fila, cNit).replace(/[^\dA-Za-z-]/g, '')
    const tercero = nitRaw !== '' ? nitRaw : null

    const textoNombre = celda(fila, cNombre)
    const textoTercero = celda(fila, cNombreTercero)
    let nombre: string | null
    let terceroNombre: string | null
    if (tercero) {
      // Con columna propia de tercero, el nombre de cuenta se respeta; con una
      // sola columna de texto, ese texto pertenece al tercero.
      terceroNombre = textoTercero || textoNombre || null
      nombre = (textoTercero ? textoNombre : '') || nombrePuc(codigo)
    } else {
      nombre = textoNombre || nombrePuc(codigo)
      terceroNombre = null
    }

    out.push({
      codigo,
      nombre,
      nivel,
      tercero,
      terceroNombre,
      saldoActual: numero(fila, cFinal) ?? 0,
      saldoInicial: numero(fila, cInicial) ?? 0,
      debito: numero(fila, cDebito),
      credito: numero(fila, cCredito),
    })
  }
  return out
}

// ─── Validación ──────────────────────────────────────────────────────────────

export type NivelProblema = 'error' | 'advertencia'

export type ProblemaBalance = {
  clave: string
  titulo: string
  detalle: string
  nivel: NivelProblema
}

export type ValidacionBalance = {
  problemas: ProblemaBalance[]
  /** true si no hay problemas de nivel 'error' (las advertencias no bloquean). */
  ok: boolean
}

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Math.round(n))

/** Chequeos aritméticos y de estructura sobre las filas ya mapeadas. */
export function validarBalance(cuentas: CuentaImport[]): ValidacionBalance {
  const problemas: ProblemaBalance[] = []
  const TOL = 1 // tolerancia en pesos por redondeo

  if (cuentas.length === 0) {
    return {
      problemas: [{
        clave: 'sin_cuentas',
        titulo: 'No se detectaron cuentas',
        detalle: 'Ninguna fila tiene un código de cuenta válido con el mapeo elegido. Revisa la columna asignada como código.',
        nivel: 'error',
      }],
      ok: false,
    }
  }

  const resumen = cuentas.filter((c) => !c.tercero)

  // 1. Ecuación por fila: inicial ± movimientos = final (cualquier naturaleza).
  const conMovimientos = resumen.filter((c) => c.debito !== null && c.credito !== null)
  const descuadradas = conMovimientos.filter((c) => {
    const porDebito = c.saldoInicial + (c.debito ?? 0) - (c.credito ?? 0)
    const porCredito = c.saldoInicial - (c.debito ?? 0) + (c.credito ?? 0)
    return Math.abs(porDebito - c.saldoActual) > TOL && Math.abs(porCredito - c.saldoActual) > TOL
  })
  if (conMovimientos.length > 0 && descuadradas.length > 0) {
    const ejemplos = descuadradas.slice(0, 5).map((c) => c.codigo).join(', ')
    problemas.push({
      clave: 'ecuacion_fila',
      titulo: `${descuadradas.length} cuenta(s) no cuadran saldo inicial + movimientos = saldo final`,
      detalle: `Ejemplos: ${ejemplos}. Puede ser un mapeo de columnas equivocado o filas de totales incluidas.`,
      nivel: descuadradas.length > conMovimientos.length / 2 ? 'error' : 'advertencia',
    })
  }

  // 2. Débitos = créditos (sobre el nivel más agregado disponible, para no duplicar).
  const nivelesResumen = [...new Set(resumen.map((c) => c.nivel))].sort((a, b) => a - b)
  const nivelBase = nivelesResumen.find((n) =>
    resumen.some((c) => c.nivel === n && c.debito !== null && c.credito !== null),
  )
  if (nivelBase !== undefined) {
    const base = resumen.filter((c) => c.nivel === nivelBase)
    const totDeb = base.reduce((a, c) => a + (c.debito ?? 0), 0)
    const totCred = base.reduce((a, c) => a + (c.credito ?? 0), 0)
    const dif = Math.abs(totDeb - totCred)
    if (dif > Math.max(TOL, totDeb * 0.001)) {
      problemas.push({
        clave: 'partida_doble',
        titulo: 'Los débitos y créditos no cuadran',
        detalle: `Débitos ${fmt(totDeb)} vs créditos ${fmt(totCred)} (diferencia ${fmt(dif)}), medidos al nivel ${nivelBase}.`,
        nivel: 'advertencia',
      })
    }
  }

  // 3. Ecuación patrimonial: activo = pasivo + patrimonio + resultado del período.
  const clase = (d: string) => {
    const f = resumen.find((c) => c.codigo === d)
    return f ? Math.abs(f.saldoActual) : null
  }
  const act = clase('1')
  const pas = clase('2')
  const pat = clase('3')
  if (act !== null && pas !== null && pat !== null && act > 0) {
    const resultado = (clase('4') ?? 0) - (clase('5') ?? 0) - (clase('6') ?? 0) - (clase('7') ?? 0)
    const dif = Math.abs(act - (pas + pat + resultado))
    const difSinResultado = Math.abs(act - (pas + pat))
    if (Math.min(dif, difSinResultado) > Math.max(TOL, act * 0.005)) {
      problemas.push({
        clave: 'ecuacion_patrimonial',
        titulo: 'El activo no cuadra con pasivo + patrimonio',
        detalle: `Activo ${fmt(act)} vs pasivo + patrimonio ${fmt(pas + pat)} (resultado del período ${fmt(resultado)}). Verifica que el balance esté completo.`,
        nivel: 'advertencia',
      })
    }
  }

  // 4. Jerarquía: los hijos del nivel siguiente suman el saldo del padre.
  let rotas = 0
  const ejemplosJerarquia: string[] = []
  for (let i = 0; i < nivelesResumen.length - 1; i++) {
    const nivelPadre = nivelesResumen[i]
    const nivelHijo = nivelesResumen[i + 1]
    const hijosPorPadre = new Map<string, number>()
    for (const c of resumen) {
      if (c.nivel !== nivelHijo) continue
      const prefijo = c.codigo.slice(0, nivelPadre)
      hijosPorPadre.set(prefijo, (hijosPorPadre.get(prefijo) ?? 0) + c.saldoActual)
    }
    for (const p of resumen) {
      if (p.nivel !== nivelPadre) continue
      const suma = hijosPorPadre.get(p.codigo)
      if (suma === undefined) continue // padre sin hijos en el archivo: válido
      if (Math.abs(suma - p.saldoActual) > TOL * 2) {
        rotas++
        if (ejemplosJerarquia.length < 5) ejemplosJerarquia.push(p.codigo)
      }
    }
  }
  if (rotas > 0) {
    problemas.push({
      clave: 'jerarquia',
      titulo: `${rotas} cuenta(s) no cuadran con la suma de sus subcuentas`,
      detalle: `Ejemplos: ${ejemplosJerarquia.join(', ')}. Puede faltar parte del archivo o haber niveles mal asignados.`,
      nivel: 'advertencia',
    })
  }

  // 5. Duplicados: mismo código (sin tercero) o mismo código + NIT repetido.
  const vistos = new Set<string>()
  const duplicados = new Set<string>()
  for (const c of cuentas) {
    const k = `${c.codigo}|${c.tercero ?? ''}`
    if (vistos.has(k)) duplicados.add(c.codigo)
    vistos.add(k)
  }
  if (duplicados.size > 0) {
    problemas.push({
      clave: 'duplicados',
      titulo: `${duplicados.size} código(s) repetidos`,
      detalle: `Ejemplos: ${[...duplicados].slice(0, 5).join(', ')}. La misma cuenta (y tercero) aparece más de una vez; los saldos podrían duplicarse.`,
      nivel: 'advertencia',
    })
  }

  return { problemas, ok: !problemas.some((p) => p.nivel === 'error') }
}

// ─── Plantilla oficial ───────────────────────────────────────────────────────

/** Encabezados de la plantilla descargable (coinciden con la autodetección). */
export const PLANTILLA_BALANCE_ENCABEZADOS = [
  'CODIGO CUENTA', 'NOMBRE CUENTA', 'NIT TERCERO', 'NOMBRE TERCERO',
  'SALDO INICIAL', 'DEBITO', 'CREDITO', 'SALDO FINAL',
] as const

/** Filas de ejemplo de la plantilla (se reemplazan por los datos reales). */
export const PLANTILLA_BALANCE_EJEMPLO: (string | number)[][] = [
  ['1', 'Activo', '', '', 150000000, 80000000, 60000000, 170000000],
  ['11', 'Disponible', '', '', 20000000, 50000000, 45000000, 25000000],
  ['1105', 'Caja', '', '', 5000000, 10000000, 9000000, 6000000],
  ['110505', 'Caja general', '', '', 5000000, 10000000, 9000000, 6000000],
  ['1305', 'Clientes', '', '', 30000000, 25000000, 20000000, 35000000],
  ['130505', 'Clientes nacionales', '', '', 30000000, 25000000, 20000000, 35000000],
  ['130505', 'Clientes nacionales', '900123456', 'Comercializadora Ejemplo SAS', 18000000, 15000000, 12000000, 21000000],
  ['130505', 'Clientes nacionales', '830987654', 'Distribuciones Muestra LTDA', 12000000, 10000000, 8000000, 14000000],
]
