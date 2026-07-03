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
  saldoAnterior: string
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
  saldoAnterior: number
  debito: number | null
  credito: number | null
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
  saldoAnterior: number
  variacionAbs: number
  variacionPct: number | null
  significativa: boolean
  anomalia: boolean
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
