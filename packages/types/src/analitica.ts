/**
 * Analítica del balance (NIA 520) — funciones puras, sin IA.
 *
 * A partir de los saldos del balance de prueba (actual y anterior) derivamos:
 *  - `calcularRatios`: indicadores financieros con su lectura y estado.
 *  - `detectarBanderas`: alertas automáticas que señalan dónde mirar (relaciones
 *    entre cuentas, no solo la variación de una cuenta aislada).
 *
 * Son funciones puras para que las reutilicen el backend (endpoint de balance),
 * el frontend y, más adelante, el agente. Los ratios que dependen de la
 * separación corriente/no corriente se marcan como `aproximado`, porque el
 * balance de prueba no siempre permite clasificarla con exactitud.
 */

export type UnidadRatio = 'veces' | 'pct' | 'dias'
export type EstadoRatio = 'bueno' | 'alerta' | 'neutral'

export type RatioFinanciero = {
  clave: string
  nombre: string
  /** Valor del período actual. `null` si no se puede calcular. */
  valor: number | null
  /** Mismo ratio del período anterior, para ver tendencia. `null` si no aplica. */
  anterior: number | null
  unidad: UnidadRatio
  /** Lectura corta del indicador para el auditor. */
  interpretacion: string
  estado: EstadoRatio
  /** true si el cálculo asume una clasificación aproximada (p. ej. corriente). */
  aproximado: boolean
}

export type SeveridadBandera = 'alta' | 'media' | 'info'

export type BanderaAnalitica = {
  clave: string
  titulo: string
  detalle: string
  severidad: SeveridadBandera
  /** Códigos PUC involucrados, para poder trazar la bandera a un riesgo/prueba. */
  codigos: string[]
}

/** Entrada mínima que necesitan las analíticas: un saldo por código PUC.
 * `saldoAnterior` es la BASE DE COMPARACIÓN: el comparativo real del año
 * anterior si está cargado; sin comparativo, el saldo inicial del período en
 * cuentas de balance y 0 en cuentas de resultado (sin base honesta, las
 * tendencias de esas cuentas se omiten solas). */
export type EntradaAnalitica = {
  codigo: string
  nombre?: string | null
  saldoActual: number
  saldoAnterior: number
}

// ─── Helpers internos ────────────────────────────────────────────────────────

type Campo = 'act' | 'ant'

/** Saldo (en valor absoluto) del código PUC exacto; 0 si no existe. */
function saldo(cuentas: EntradaAnalitica[], codigo: string, campo: Campo): number {
  const f = cuentas.find((c) => c.codigo === codigo)
  if (!f) return 0
  const v = campo === 'act' ? f.saldoActual : f.saldoAnterior
  return Math.abs(Number(v) || 0)
}

/** Suma de los saldos (abs) de varios códigos PUC. */
function suma(cuentas: EntradaAnalitica[], codigos: string[], campo: Campo): number {
  return codigos.reduce((acc, cod) => acc + saldo(cuentas, cod, campo), 0)
}

/** ¿Existe alguno de estos códigos en el balance? */
function alguno(cuentas: EntradaAnalitica[], codigos: string[]): boolean {
  return codigos.some((cod) => cuentas.some((c) => c.codigo === cod))
}

/** Variación porcentual; null si el saldo anterior es 0 (no comparable). */
function variacionPct(actual: number, anterior: number): number | null {
  if (anterior === 0) return null
  return ((actual - anterior) / Math.abs(anterior)) * 100
}

const redondear = (n: number, dec = 1): number => {
  const f = 10 ** dec
  return Math.round(n * f) / f
}

// Grupos PUC usados para la clasificación corriente (aproximada).
const ACTIVO_CORRIENTE = ['11', '12', '13', '14'] // disponible, inversiones, deudores, inventarios
const PASIVO_CORRIENTE = ['21', '22', '23', '24', '25'] // oblig. fin., proveedores, CxP, impuestos, laborales

// ─── Ratios ──────────────────────────────────────────────────────────────────

/**
 * Calcula los indicadores financieros a partir del balance.
 * Solo devuelve los ratios que se pueden calcular con los datos presentes.
 */
export function calcularRatios(cuentas: EntradaAnalitica[]): RatioFinanciero[] {
  const ratios: RatioFinanciero[] = []

  const activo = (c: Campo) => saldo(cuentas, '1', c)
  const pasivo = (c: Campo) => saldo(cuentas, '2', c)
  const ingresos = (c: Campo) => saldo(cuentas, '4', c)
  const gastos = (c: Campo) => saldo(cuentas, '5', c)
  const costoVta = (c: Campo) => saldo(cuentas, '6', c)
  const costoProd = (c: Campo) => saldo(cuentas, '7', c)
  const cartera = (c: Campo) => saldo(cuentas, '13', c)
  const inventario = (c: Campo) => saldo(cuentas, '14', c)
  const activoCte = (c: Campo) => suma(cuentas, ACTIVO_CORRIENTE, c)
  const pasivoCte = (c: Campo) => suma(cuentas, PASIVO_CORRIENTE, c)
  const utilidad = (c: Campo) => ingresos(c) - gastos(c) - costoVta(c) - costoProd(c)

  const razon = (num: number, den: number): number | null => (den > 0 ? num / den : null)

  // 1. Razón corriente (liquidez) — aproximada por grupos.
  if (alguno(cuentas, ACTIVO_CORRIENTE) && alguno(cuentas, PASIVO_CORRIENTE)) {
    const val = razon(activoCte('act'), pasivoCte('act'))
    const ant = razon(activoCte('ant'), pasivoCte('ant'))
    if (val !== null) {
      ratios.push({
        clave: 'razon_corriente',
        nombre: 'Razón corriente',
        valor: redondear(val, 2),
        anterior: ant !== null ? redondear(ant, 2) : null,
        unidad: 'veces',
        interpretacion:
          val < 1
            ? 'El activo corriente no cubre el pasivo corriente: posible tensión de liquidez.'
            : 'El activo corriente cubre el pasivo corriente.',
        estado: val < 1 ? 'alerta' : 'bueno',
        aproximado: true,
      })
    }
  }

  // 2. Nivel de endeudamiento — pasivo / activo (robusto, por clase).
  if (activo('act') > 0) {
    const val = (pasivo('act') / activo('act')) * 100
    const ant = activo('ant') > 0 ? (pasivo('ant') / activo('ant')) * 100 : null
    ratios.push({
      clave: 'endeudamiento',
      nombre: 'Endeudamiento',
      valor: redondear(val),
      anterior: ant !== null ? redondear(ant) : null,
      unidad: 'pct',
      interpretacion:
        val > 70
          ? 'Más del 70% del activo está financiado con pasivos: apalancamiento alto.'
          : 'Proporción del activo financiada con pasivos.',
      estado: val > 70 ? 'alerta' : 'neutral',
      aproximado: false,
    })
  }

  // 3. Margen neto — utilidad / ingresos.
  if (ingresos('act') > 0) {
    const val = (utilidad('act') / ingresos('act')) * 100
    const ant = ingresos('ant') > 0 ? (utilidad('ant') / ingresos('ant')) * 100 : null
    ratios.push({
      clave: 'margen_neto',
      nombre: 'Margen neto',
      valor: redondear(val),
      anterior: ant !== null ? redondear(ant) : null,
      unidad: 'pct',
      interpretacion:
        val < 0
          ? 'El resultado del período es una pérdida.'
          : 'Utilidad del período como porcentaje de los ingresos.',
      estado: val < 0 ? 'alerta' : 'neutral',
      aproximado: false,
    })
  }

  // 4. Margen bruto — (ingresos - costos) / ingresos.
  if (ingresos('act') > 0 && (costoVta('act') > 0 || costoProd('act') > 0)) {
    const bruta = ingresos('act') - costoVta('act') - costoProd('act')
    const val = (bruta / ingresos('act')) * 100
    const brutaAnt = ingresos('ant') - costoVta('ant') - costoProd('ant')
    const ant = ingresos('ant') > 0 ? (brutaAnt / ingresos('ant')) * 100 : null
    ratios.push({
      clave: 'margen_bruto',
      nombre: 'Margen bruto',
      valor: redondear(val),
      anterior: ant !== null ? redondear(ant) : null,
      unidad: 'pct',
      interpretacion: 'Ingresos menos costos, como porcentaje de los ingresos.',
      estado: 'neutral',
      aproximado: false,
    })
  }

  // 5. Rotación de cartera (días) — cartera / ingresos * 365.
  if (ingresos('act') > 0 && cartera('act') > 0) {
    const val = (cartera('act') / ingresos('act')) * 365
    const ant = ingresos('ant') > 0 && cartera('ant') > 0 ? (cartera('ant') / ingresos('ant')) * 365 : null
    ratios.push({
      clave: 'rotacion_cartera',
      nombre: 'Días de cartera',
      valor: redondear(val, 0),
      anterior: ant !== null ? redondear(ant, 0) : null,
      unidad: 'dias',
      interpretacion:
        val > 90
          ? 'La cartera tarda en promedio más de 90 días en rotar: revisar recuperabilidad.'
          : 'Días promedio que tarda en recaudarse la cartera.',
      estado: val > 90 ? 'alerta' : 'neutral',
      aproximado: true,
    })
  }

  // 6. Rotación de inventario (días) — inventario / costo de ventas * 365.
  if (costoVta('act') > 0 && inventario('act') > 0) {
    const val = (inventario('act') / costoVta('act')) * 365
    const ant = costoVta('ant') > 0 && inventario('ant') > 0 ? (inventario('ant') / costoVta('ant')) * 365 : null
    ratios.push({
      clave: 'rotacion_inventario',
      nombre: 'Días de inventario',
      valor: redondear(val, 0),
      anterior: ant !== null ? redondear(ant, 0) : null,
      unidad: 'dias',
      interpretacion:
        val > 120
          ? 'El inventario tarda más de 120 días en rotar: posible lento movimiento u obsolescencia.'
          : 'Días promedio que permanece el inventario antes de venderse.',
      estado: val > 120 ? 'alerta' : 'neutral',
      aproximado: true,
    })
  }

  return ratios
}

// ─── Banderas ────────────────────────────────────────────────────────────────

const UMBRAL_DIVERGENCIA_PP = 15 // puntos porcentuales de diferencia entre dos variaciones

/**
 * Detecta banderas automáticas: relaciones entre cuentas que merecen atención.
 * Complementa (no reemplaza) la marca de "anomalía" que ya existe por cuenta.
 */
export function detectarBanderas(cuentas: EntradaAnalitica[]): BanderaAnalitica[] {
  const banderas: BanderaAnalitica[] = []
  if (cuentas.length === 0) return banderas

  const activo = saldo(cuentas, '1', 'act')
  const pasivo = saldo(cuentas, '2', 'act')
  const ingresos = saldo(cuentas, '4', 'act')
  const ingresosAnt = saldo(cuentas, '4', 'ant')
  const gastos = saldo(cuentas, '5', 'act')
  const gastosAnt = saldo(cuentas, '5', 'ant')
  const costoVta = saldo(cuentas, '6', 'act')
  const costoProd = saldo(cuentas, '7', 'act')
  const cartera = saldo(cuentas, '13', 'act')
  const carteraAnt = saldo(cuentas, '13', 'ant')
  const inventario = saldo(cuentas, '14', 'act')
  const inventarioAnt = saldo(cuentas, '14', 'ant')

  // Patrimonio negativo (pasivo excede activo): causal de disolución / negocio en marcha.
  if (activo > 0 && pasivo > activo) {
    banderas.push({
      clave: 'patrimonio_negativo',
      titulo: 'Patrimonio negativo',
      detalle:
        'El pasivo supera al activo, lo que implica patrimonio negativo. Evaluar negocio en marcha (NIA 570) y causales de disolución.',
      severidad: 'alta',
      codigos: ['1', '2', '3'],
    })
  }

  // Endeudamiento muy alto.
  if (activo > 0 && pasivo / activo > 0.7 && pasivo <= activo) {
    banderas.push({
      clave: 'endeudamiento_alto',
      titulo: 'Endeudamiento alto',
      detalle: `El pasivo financia el ${Math.round((pasivo / activo) * 100)}% del activo. Revisar obligaciones y capacidad de pago.`,
      severidad: 'media',
      codigos: ['1', '2'],
    })
  }

  // Pérdida del ejercicio.
  const utilidad = ingresos - gastos - costoVta - costoProd
  if (ingresos > 0 && utilidad < 0) {
    banderas.push({
      clave: 'perdida_ejercicio',
      titulo: 'Pérdida del ejercicio',
      detalle: 'Los ingresos no cubren los costos y gastos del período. Evaluar el efecto sobre patrimonio y negocio en marcha.',
      severidad: 'alta',
      codigos: ['4', '5', '6'],
    })
  }

  // Cartera crece más rápido que las ventas → cobro / reconocimiento de ingresos.
  const vCartera = variacionPct(cartera, carteraAnt)
  const vIngresos = variacionPct(ingresos, ingresosAnt)
  if (vCartera !== null && vIngresos !== null && vCartera - vIngresos > UMBRAL_DIVERGENCIA_PP && cartera > carteraAnt) {
    banderas.push({
      clave: 'cartera_vs_ventas',
      titulo: 'La cartera crece más que las ventas',
      detalle: `La cartera subió ${Math.round(vCartera)}% mientras las ventas ${vIngresos >= 0 ? 'subieron' : 'bajaron'} ${Math.round(Math.abs(vIngresos))}%. Posible deterioro de recaudo o corte de ingresos.`,
      severidad: 'media',
      codigos: ['13', '4'],
    })
  }

  // Inventario crece más rápido que el costo de ventas → obsolescencia / lento movimiento.
  const vInventario = variacionPct(inventario, inventarioAnt)
  const vCosto = variacionPct(costoVta, saldo(cuentas, '6', 'ant'))
  if (vInventario !== null && vCosto !== null && vInventario - vCosto > UMBRAL_DIVERGENCIA_PP && inventario > inventarioAnt) {
    banderas.push({
      clave: 'inventario_vs_costo',
      titulo: 'El inventario crece más que el costo de ventas',
      detalle: `El inventario subió ${Math.round(vInventario)}% mientras el costo de ventas ${vCosto >= 0 ? 'subió' : 'bajó'} ${Math.round(Math.abs(vCosto))}%. Posible lento movimiento u obsolescencia.`,
      severidad: 'media',
      codigos: ['14', '6'],
    })
  }

  // Gastos crecen más que los ingresos → deterioro de margen.
  const vGastos = variacionPct(gastos, gastosAnt)
  if (vGastos !== null && vIngresos !== null && vGastos - vIngresos > 10 && gastos > gastosAnt) {
    banderas.push({
      clave: 'gastos_vs_ingresos',
      titulo: 'Los gastos crecen más que los ingresos',
      detalle: `Los gastos subieron ${Math.round(vGastos)}% frente a ${Math.round(vIngresos)}% de los ingresos. Revisar el deterioro del margen.`,
      severidad: 'info',
      codigos: ['5', '4'],
    })
  }

  return banderas
}
