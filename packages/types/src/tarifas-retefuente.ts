/**
 * Tarifas y cuantías mínimas de retención en la fuente a título de renta por
 * concepto del Formulario 350. Tabla de referencia del agente (regla R-02 sobre
 * el formulario y R-15 sobre los asientos): lo que hace es decir si la tarifa
 * aplicada es UNA de las admisibles para el concepto, no cuál debía ser, porque
 * eso depende del tercero (declarante o no, naturaleza del servicio).
 *
 * PENDIENTE DE VALIDAR POR LA FIRMA (2026-09-28): los valores son los del ET y
 * el DUR 1625/2016 vigentes en 2025; si una tarifa cambia por decreto, se ajusta
 * aquí y queda para todas las revisiones. La UVT de cada año se agrega cuando
 * la DIAN la fija: sin UVT del año no corren las reglas de cuantía mínima.
 */

/** UVT por año (resolución DIAN). Agregar el año nuevo cuando salga la resolución. */
export const UVT_POR_ANIO: Record<number, number> = {
  2023: 42_412,
  2024: 47_065,
  2025: 49_799,
}

export type TarifaConcepto = {
  /** Tarifas admisibles (en %), cualquiera de ellas es válida según el tercero o la modalidad. */
  admisibles: number[]
  /** Tarifa general a personas jurídicas y naturales declarantes (%), para explicar la diferencia. */
  general: number | null
  /** Tarifa a personas naturales no declarantes (%), si difiere. */
  noDeclarante: number | null
  /** Cuantía mínima en UVT por pago o abono en cuenta (null = sin cuantía mínima). */
  minimaUvt: number | null
  nota: string
}

/**
 * Por clave de concepto del 350 (CONCEPTOS_RENTA_350). Los conceptos con tarifa
 * variable (rentas de trabajo, dividendos, exterior, regalías, hidrocarburos,
 * loterías) no se verifican por tarifa: quedan como juicio del auditor.
 */
export const TARIFAS_RETEFUENTE: Partial<Record<string, TarifaConcepto>> = {
  honorarios: { admisibles: [11, 10], general: 11, noDeclarante: 10, minimaUvt: null, nota: 'Art. 392 ET · DUR 1.2.4.3.1: 11 % a jurídicas y naturales declarantes; 10 % a naturales no declarantes.' },
  comisiones: { admisibles: [11, 10], general: 11, noDeclarante: 10, minimaUvt: null, nota: 'Art. 392 ET: 11 % (10 % a naturales no declarantes).' },
  servicios: { admisibles: [4, 6, 1, 2, 3.5], general: 4, noDeclarante: 6, minimaUvt: 4, nota: 'Art. 392 ET · DUR 1.2.4.4.14: 4 % general (6 % a no declarantes); 1 % transporte de carga; 2 % vigilancia, aseo y temporales sobre AIU; 3,5 % transporte terrestre de pasajeros y licenciamiento de software. Cuantía mínima 4 UVT.' },
  arrendamientos: { admisibles: [3.5, 4], general: 3.5, noDeclarante: null, minimaUvt: 27, nota: 'DUR 1.2.4.9.1 y 1.2.4.4.13: 3,5 % inmuebles (mínimo 27 UVT); 4 % muebles.' },
  compras: { admisibles: [2.5, 3.5, 1.5, 1, 0.1], general: 2.5, noDeclarante: 3.5, minimaUvt: 27, nota: 'Art. 401 ET · DUR 1.2.4.9.1: 2,5 % general (3,5 % a no declarantes), mínimo 27 UVT; 1,5 % productos agrícolas sin procesamiento (92 UVT); 1 % vehículos; 0,1 % combustibles.' },
  rendimientos: { admisibles: [7, 4], general: 7, noDeclarante: null, minimaUvt: null, nota: 'Art. 395 ET · DUR 1.2.4.2.5: 7 % general; 4 % en títulos de renta fija.' },
  tarjetas: { admisibles: [1.5], general: 1.5, noDeclarante: null, minimaUvt: null, nota: 'DUR 1.3.2.1.8: 1,5 % sobre el pago neto.' },
  construccion: { admisibles: [2], general: 2, noDeclarante: null, minimaUvt: 27, nota: 'DUR 1.2.4.9.1: 2 % contratos de construcción y urbanización.' },
  otros: { admisibles: [2.5, 3.5], general: 2.5, noDeclarante: 3.5, minimaUvt: 27, nota: 'Art. 401 ET: otros ingresos tributarios 2,5 % (3,5 % a no declarantes).' },
}

/** ¿La tarifa aplicada (%) es admisible para el concepto? Tolerancia de 0,05 puntos por redondeo. */
export function tarifaAdmisible(concepto: string, tarifaPct: number): boolean | null {
  const t = TARIFAS_RETEFUENTE[concepto]
  if (!t) return null
  return t.admisibles.some((a) => Math.abs(a - tarifaPct) <= 0.05)
}

/** Cuantía mínima en pesos para el concepto y el año; null si no aplica o no hay UVT del año. */
export function cuantiaMinima(concepto: string, anio: number): number | null {
  const t = TARIFAS_RETEFUENTE[concepto]
  const uvt = UVT_POR_ANIO[anio]
  if (!t || t.minimaUvt === null || !uvt) return null
  return t.minimaUvt * uvt
}
