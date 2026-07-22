/**
 * Muestreo de auditoría (NIA 530) — funciones puras, sin IA.
 *
 * Método por defecto: "cobertura + partidas clave".
 *  - Partida clave: todo tercero con saldo ≥ materialidad de desempeño entra
 *    obligatoriamente (100%). Son las partidas que por sí solas podrían ser
 *    materiales.
 *  - Cobertura: luego se suman los mayores saldos hasta cubrir un % objetivo
 *    del saldo total de la cuenta.
 *
 * Opera sobre el detalle por tercero que ya se guarda del balance, de modo que
 * la muestra queda como dato estructurado (a quién revisar y por qué), no como
 * texto libre.
 */

export type MetodoMuestreo = 'cobertura'

export type ResultadoItem = 'pendiente' | 'sin_diferencia' | 'con_diferencia'

export const RESULTADO_ITEM_LABEL: Record<ResultadoItem, string> = {
  pendiente: 'Pendiente',
  sin_diferencia: 'Sin diferencia',
  con_diferencia: 'Con diferencia',
}

/** Un ítem de la población (un tercero con su saldo en la cuenta). */
export type TerceroSaldo = {
  tercero: string | null
  terceroNombre: string | null
  saldo: number
}

export type ItemSeleccionado = TerceroSaldo & { esClave: boolean }

export type ResumenMuestra = {
  numPoblacion: number
  saldoPoblacion: number
  numMuestra: number
  saldoMuestra: number
  coberturaPct: number
  numClave: number
}

export type SeleccionMuestra = {
  items: ItemSeleccionado[]
  resumen: ResumenMuestra
}

// ─── Tipos que reflejan lo persistido (para el frontend) ─────────────────────

export type Muestra = {
  id: string
  papelTrabajoId: string
  auditoriaId: string
  codigoCuenta: string
  metodo: MetodoMuestreo
  coberturaObjetivo: string // numeric como string (p. ej. '0.80')
  materialidad: string | null
  createdAt: string
}

export type MuestraItem = {
  id: string
  muestraId: string
  cuentaCodigo: string | null
  tercero: string | null
  terceroNombre: string | null
  saldo: string
  esClave: boolean
  incluido: boolean
  resultado: ResultadoItem
  diferencia: string | null
  nota: string | null
  createdAt: string
}

export type MuestraConItems = Muestra & {
  items: MuestraItem[]
  resumen: ResumenMuestra
}

export const COBERTURA_OBJETIVO_DEFECTO = 0.8

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))
const abs = (n: number | string) => Math.abs(Number(n) || 0)

/**
 * Selecciona la muestra a partir de la población por tercero.
 * Pura y determinística: mismas entradas → misma muestra.
 */
export function seleccionarMuestra(
  poblacion: TerceroSaldo[],
  opts: { materialidad?: number | null; coberturaObjetivo?: number } = {},
): SeleccionMuestra {
  const coberturaObjetivo = clamp(opts.coberturaObjetivo ?? COBERTURA_OBJETIVO_DEFECTO, 0, 1)
  const materialidad = opts.materialidad != null && opts.materialidad > 0 ? opts.materialidad : null

  const saldoPoblacion = poblacion.reduce((acc, p) => acc + abs(p.saldo), 0)
  const objetivo = coberturaObjetivo * saldoPoblacion

  // Mayores saldos primero: así las partidas clave (las más grandes) quedan al frente.
  const ordenados = [...poblacion].sort((a, b) => abs(b.saldo) - abs(a.saldo))

  const items: ItemSeleccionado[] = []
  let acumulado = 0
  for (const p of ordenados) {
    const esClave = materialidad !== null && abs(p.saldo) >= materialidad
    if (esClave) {
      items.push({ tercero: p.tercero, terceroNombre: p.terceroNombre, saldo: p.saldo, esClave: true })
      acumulado += abs(p.saldo)
      continue
    }
    if (acumulado < objetivo) {
      items.push({ tercero: p.tercero, terceroNombre: p.terceroNombre, saldo: p.saldo, esClave: false })
      acumulado += abs(p.saldo)
    }
  }

  return { items, resumen: resumirMuestra(poblacion, items) }
}

// ─── Proyección del error a la población (NIA 530) ───────────────────────────

export type VeredictoError = 'aceptable' | 'cercano' | 'excede' | 'sin_materialidad'

export const VEREDICTO_ERROR_LABEL: Record<VeredictoError, string> = {
  aceptable: 'Error aceptable',
  cercano: 'Cerca de la materialidad',
  excede: 'Excede la materialidad',
  sin_materialidad: 'Sin materialidad de referencia',
}

/** Ítem tal como se necesita para proyectar el error (tolera numeric-as-string). */
export type ItemMuestreado = {
  saldo: number | string
  esClave: boolean
  incluido: boolean
  resultado: ResultadoItem
  diferencia: number | string | null
}

export type ProyeccionError = {
  /** Ítems incluidos ya evaluados (resultado ≠ pendiente). */
  itemsEvaluados: number
  /** Ítems incluidos aún sin evaluar (la proyección no está completa). */
  itemsPendientes: number
  /** Ítems con diferencia encontrada. */
  itemsConDiferencia: number
  /** Suma de las diferencias realmente observadas en la muestra. */
  errorConocido: number
  /**
   * Error extrapolado a toda la población: las partidas clave (examinadas al
   * 100%) aportan su error real; el estrato no clave se proyecta por ratio
   * (diferencia de la muestra × saldo población no clave / saldo muestra no clave).
   */
  errorProyectado: number
  /** Materialidad (de desempeño) contra la que se compara. */
  materialidad: number | null
  veredicto: VeredictoError
}

/** Umbral relativo para marcar la proyección como "cerca de la materialidad". */
const UMBRAL_CERCANO = 0.75

const num = (n: number | string | null | undefined) => {
  const v = typeof n === 'string' ? Number(n) : n ?? 0
  return Number.isFinite(v) ? (v as number) : 0
}

/**
 * Proyecta el error de la muestra a la población y lo compara con la
 * materialidad (NIA 530 §14). Función pura, sin IA.
 *
 * `saldoPoblacion` es el saldo total de la cuenta (todos los terceros), tal
 * como lo entrega el resumen de la muestra.
 */
export function proyectarError(
  items: ItemMuestreado[],
  saldoPoblacion: number,
  materialidad: number | null,
): ProyeccionError {
  const incluidos = items.filter((i) => i.incluido)
  const conDiferencia = incluidos.filter((i) => i.resultado === 'con_diferencia')

  const errorConocido = conDiferencia.reduce((acc, i) => acc + num(i.diferencia), 0)

  // Estrato clave: examinado al 100%, su error no se extrapola.
  const clave = incluidos.filter((i) => i.esClave)
  const saldoClave = clave.reduce((acc, i) => acc + abs(i.saldo), 0)
  const errorClave = clave.reduce((acc, i) => acc + num(i.diferencia), 0)

  // Estrato no clave: se proyecta por ratio al resto de la población.
  const noClave = incluidos.filter((i) => !i.esClave)
  const saldoMuestraNoClave = noClave.reduce((acc, i) => acc + abs(i.saldo), 0)
  const errorMuestraNoClave = noClave.reduce((acc, i) => acc + num(i.diferencia), 0)
  const saldoPobNoClave = Math.max(abs(saldoPoblacion) - saldoClave, 0)
  const factor = saldoMuestraNoClave > 0 ? saldoPobNoClave / saldoMuestraNoClave : 0
  const errorProyectadoNoClave = errorMuestraNoClave * factor

  const errorProyectado = errorClave + errorProyectadoNoClave

  let veredicto: VeredictoError
  if (materialidad == null || materialidad <= 0) {
    veredicto = 'sin_materialidad'
  } else if (Math.abs(errorProyectado) > materialidad) {
    veredicto = 'excede'
  } else if (Math.abs(errorProyectado) >= materialidad * UMBRAL_CERCANO) {
    veredicto = 'cercano'
  } else {
    veredicto = 'aceptable'
  }

  return {
    itemsEvaluados: incluidos.filter((i) => i.resultado !== 'pendiente').length,
    itemsPendientes: incluidos.filter((i) => i.resultado === 'pendiente').length,
    itemsConDiferencia: conDiferencia.length,
    errorConocido,
    errorProyectado,
    materialidad: materialidad != null && materialidad > 0 ? materialidad : null,
    veredicto,
  }
}

/** Recalcula el resumen para una lista de ítems ya seleccionados (incluidos). */
export function resumirMuestra(poblacion: TerceroSaldo[], incluidos: TerceroSaldo[]): ResumenMuestra {
  const saldoPoblacion = poblacion.reduce((acc, p) => acc + abs(p.saldo), 0)
  const saldoMuestra = incluidos.reduce((acc, p) => acc + abs(p.saldo), 0)
  return {
    numPoblacion: poblacion.length,
    saldoPoblacion,
    numMuestra: incluidos.length,
    saldoMuestra,
    coberturaPct: saldoPoblacion > 0 ? (saldoMuestra / saldoPoblacion) * 100 : 0,
    numClave: incluidos.filter((i) => (i as ItemSeleccionado).esClave).length,
  }
}
