import type { RatioFinanciero, BanderaAnalitica } from './analitica'

export type ClasePuc =
  | 'activo'
  | 'pasivo'
  | 'patrimonio'
  | 'ingresos'
  | 'gastos'
  | 'costos_venta'
  | 'costos_produccion'
  | 'orden'
  | 'otra'

export type CuentaBalance = {
  id: string
  auditoriaId: string
  codigo: string
  nombre: string | null
  clase: string | null
  nivel: number
  tercero: string | null
  terceroNombre: string | null
  saldoActual: string
  /** Saldo al inicio del período que cubre el balance (NO es el comparativo del año anterior). */
  saldoInicial: string
  debito: string | null
  credito: string | null
  createdAt: string
}

/** Fila que el frontend envía tras parsear el archivo. */
export type CuentaImport = {
  codigo: string
  nombre: string | null
  nivel: number
  tercero: string | null
  terceroNombre: string | null
  saldoActual: number
  saldoInicial: number
  debito: number | null
  credito: number | null
}

/** Fila del balance comparativo (mismo corte del año anterior), solo saldo. */
export type CuentaComparativoImport = {
  codigo: string
  nombre: string | null
  nivel: number
  saldo: number
}

/** Período que cubre el balance cargado (declarado al importar). */
export type PeriodoBalance = {
  corteDesde: string | null
  corteHasta: string | null
}

/** Estado del balance comparativo del encargo. */
export type ComparativoInfo = {
  cargado: boolean
  nombre: string | null
  createdAt: string | null
}

/** Metadatos + contenido del archivo original guardado como evidencia. */
export type BalanceArchivo = {
  nombre: string
  tamano: number
  hash: string
  contenido: string // base64
}

/** Cuenta con el análisis calculado por el backend (nivel cuenta). */
export type CuentaAnalizada = {
  codigo: string
  nombre: string | null
  clase: string | null
  nivel: number
  saldoActual: number
  saldoInicial: number
  /** Saldo del comparativo (año anterior); null si no se ha cargado comparativo. */
  saldoComparativo: number | null
  /**
   * Contra qué se midió la variación: 'comparativo' (año anterior real),
   * 'inicial' (solo cuentas de balance, cuando no hay comparativo) o null
   * (cuentas de resultado sin comparativo: no hay base honesta de comparación).
   */
  baseVariacion: 'comparativo' | 'inicial' | null
  variacionAbs: number | null
  variacionPct: number | null
  significativa: boolean
  anomalia: boolean
  /** Hay detalle por tercero (nivel 8) debajo de esta cuenta. */
  tieneTerceros: boolean
}

/** Montos base derivados del balance, por base de cálculo de materialidad. */
export type BasesMaterialidad = {
  activos: number | null
  ingresos: number | null
  utilidad_antes_impuestos: number | null
  patrimonio: number | null
}

export type AnalisisBalance = {
  cuentas: CuentaAnalizada[]
  ratios: RatioFinanciero[]
  banderas: BanderaAnalitica[]
  resumen: {
    totalCuentas: number
    totalFilas: number
    terceros: number
    significativas: number
    anomalias: number
    umbralSignificativa: number | null
    umbralVariacionPct: number
  }
  bases: BasesMaterialidad
  archivo: { nombre: string; tamano: number; createdAt: string } | null
  periodo: PeriodoBalance | null
  comparativo: ComparativoInfo
}

/** ¿La clase PUC es de balance (acumulativa)? El saldo inicial de estas cuentas
 * sí es comparable (es el cierre del período anterior); en cuentas de resultado
 * el saldo inicial es solo el acumulado al inicio del corte y no sirve de base. */
export function esClaseBalance(codigo: string): boolean {
  return ['1', '2', '3'].includes(codigo.trim()[0])
}

export const CLASE_PUC_LABEL: Record<string, string> = {
  activo: 'Activo',
  pasivo: 'Pasivo',
  patrimonio: 'Patrimonio',
  ingresos: 'Ingresos',
  gastos: 'Gastos',
  costos_venta: 'Costos de venta',
  costos_produccion: 'Costos de producción',
  orden: 'Cuentas de orden',
  otra: 'Otra',
}

/** Deriva la clase contable desde el primer dígito del código PUC. */
export function claseDesdeCodigo(codigo: string): ClasePuc {
  const d = codigo.trim()[0]
  switch (d) {
    case '1': return 'activo'
    case '2': return 'pasivo'
    case '3': return 'patrimonio'
    case '4': return 'ingresos'
    case '5': return 'gastos'
    case '6': return 'costos_venta'
    case '7': return 'costos_produccion'
    case '8':
    case '9': return 'orden'
    default: return 'otra'
  }
}
