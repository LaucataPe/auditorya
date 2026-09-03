/**
 * Áreas / ciclos de auditoría.
 *
 * El catálogo BASE es fijo y compartido por todas las firmas: sus claves son las que
 * guardan `riesgos.area`, `papeles_trabajo.area`, `tareas.area` y `hallazgos.area`.
 * Además, cada firma puede definir ciclos propios (tabla `areas_firma`); su `clave`
 * se deriva del nombre y convive con las claves base en las mismas columnas.
 */

export type AreaCatalogo = { clave: string; nombre: string; prefijo: string }

/**
 * Prefijo de referenciación (NIA 230 — índices del archivo): letra simple para
 * activos en orden de balance, letra doble para pasivos, y las letras de cierre
 * de la práctica profesional para patrimonio y resultados (P, X/XX, Y/YY, W, Z/ZZ).
 */
export const AREAS_BASE: AreaCatalogo[] = [
  { clave: 'caja', nombre: 'Caja', prefijo: 'A' },
  { clave: 'bancos', nombre: 'Bancos', prefijo: 'B' },
  { clave: 'inversiones', nombre: 'Inversiones', prefijo: 'C' },
  { clave: 'cuentas_por_cobrar', nombre: 'Cuentas por cobrar', prefijo: 'D' },
  { clave: 'impuestos_por_cobrar', nombre: 'Impuestos por cobrar', prefijo: 'E' },
  { clave: 'inventarios', nombre: 'Inventarios', prefijo: 'F' },
  // Conserva la clave legada para no romper los registros existentes.
  { clave: 'propiedad_planta_equipo', nombre: 'Propiedad, planta y equipo', prefijo: 'G' },
  { clave: 'intangibles', nombre: 'Intangibles', prefijo: 'H' },
  { clave: 'otros_activos', nombre: 'Otros activos', prefijo: 'I' },
  { clave: 'obligaciones_financieras', nombre: 'Obligaciones financieras', prefijo: 'AA' },
  { clave: 'proveedores', nombre: 'Proveedores', prefijo: 'BB' },
  { clave: 'cuentas_por_pagar', nombre: 'Cuentas por pagar', prefijo: 'CC' },
  { clave: 'impuestos_por_pagar', nombre: 'Impuestos por pagar', prefijo: 'DD' },
  { clave: 'obligaciones_laborales', nombre: 'Obligaciones laborales', prefijo: 'EE' },
  { clave: 'provisiones_nomina', nombre: 'Provisiones nómina', prefijo: 'FF' },
  { clave: 'apropiaciones_nomina', nombre: 'Apropiaciones nómina', prefijo: 'GG' },
  { clave: 'diferidos', nombre: 'Diferidos', prefijo: 'HH' },
  { clave: 'otros_pasivos', nombre: 'Otros pasivos', prefijo: 'II' },
  { clave: 'patrimonio', nombre: 'Patrimonio', prefijo: 'P' },
  { clave: 'ingresos_operacionales', nombre: 'Ingresos operacionales', prefijo: 'X' },
  { clave: 'ingresos_no_operacionales', nombre: 'Ingresos no operacionales', prefijo: 'XX' },
  { clave: 'gastos_de_administracion', nombre: 'Gastos de administración', prefijo: 'Y' },
  { clave: 'gastos_de_ventas', nombre: 'Gastos de ventas', prefijo: 'YY' },
  { clave: 'gastos_no_operacionales', nombre: 'Gastos no operacionales', prefijo: 'W' },
  { clave: 'costo_de_ventas', nombre: 'Costo de ventas', prefijo: 'Z' },
  { clave: 'costos_de_produccion', nombre: 'Costos de producción o de operación', prefijo: 'ZZ' },
]

export const AREAS_BASE_CLAVES = AREAS_BASE.map((a) => a.clave)

export const AREA_BASE_LABEL: Record<string, string> = Object.fromEntries(
  AREAS_BASE.map((a) => [a.clave, a.nombre]),
)

export const PREFIJO_AREA_BASE: Record<string, string> = Object.fromEntries(
  AREAS_BASE.map((a) => [a.clave, a.prefijo]),
)

/** Ciclo propio definido por una firma. */
export type AreaFirma = {
  id: string
  clave: string
  nombre: string
  /** Prefijo de referenciación propio; si es null se deriva de la clave. */
  prefijo: string | null
  createdAt: string
}

/** Deriva la clave estable desde el nombre: minúsculas, sin tildes, no-alfanumérico → '_'. */
export function claveDeArea(nombre: string): string {
  return nombre
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

// ─── Índices de papeles de trabajo (referenciación NIA 230) ──────────────────

/**
 * Prefijo de referenciación de un área: el del catálogo base, el configurado por
 * la firma para sus ciclos propios, o —en su defecto— las iniciales de las dos
 * primeras palabras de la clave ('cartera_hipotecaria' → 'CH', 'nomina' → 'N').
 * Debe producir lo mismo que el backfill SQL de la migración 0039.
 */
export function prefijoDeArea(clave: string, prefijoFirma?: string | null): string {
  const base = PREFIJO_AREA_BASE[clave]
  if (base) return base
  if (prefijoFirma) return prefijoFirma
  const palabras = clave.split('_').filter(Boolean)
  const iniciales = palabras.slice(0, 2).map((p) => p[0]).join('')
  return (iniciales || 'Q').toUpperCase()
}

/**
 * Siguiente índice para un prefijo dentro del encargo: consecutivo = máximo
 * existente + 1. Nunca reutiliza números (los huecos por borrado son aceptados:
 * un papel aprobado no se renumera jamás).
 */
export function siguienteIndice(prefijo: string, existentes: Array<string | null>): string {
  const patron = new RegExp(`^${prefijo}-(\\d+)$`)
  let max = 0
  for (const indice of existentes) {
    const m = indice?.match(patron)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `${prefijo}-${max + 1}`
}

/**
 * Orden natural de índices de papeles de trabajo: primero el prefijo (A → Z) y
 * luego el consecutivo como número, para que 'C-2' vaya antes de 'C-10'.
 * Los índices que no siguen el patrón `PREFIJO-N` se comparan alfabéticamente
 * y quedan al final de su prefijo.
 */
export function compararIndices(a: string | null, b: string | null): number {
  const pa = a?.match(/^([A-Za-z]+)-(\d+)$/)
  const pb = b?.match(/^([A-Za-z]+)-(\d+)$/)
  if (pa && pb) {
    const prefijo = pa[1].localeCompare(pb[1], 'es')
    if (prefijo !== 0) return prefijo
    return parseInt(pa[2], 10) - parseInt(pb[2], 10)
  }
  return (a ?? '').localeCompare(b ?? '', 'es')
}
