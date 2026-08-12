/**
 * Áreas / ciclos de auditoría.
 *
 * El catálogo BASE es fijo y compartido por todas las firmas: sus claves son las que
 * guardan `riesgos.area`, `papeles_trabajo.area`, `tareas.area` y `hallazgos.area`.
 * Además, cada firma puede definir ciclos propios (tabla `areas_firma`); su `clave`
 * se deriva del nombre y convive con las claves base en las mismas columnas.
 */

export type AreaCatalogo = { clave: string; nombre: string }

export const AREAS_BASE: AreaCatalogo[] = [
  { clave: 'caja', nombre: 'Caja' },
  { clave: 'bancos', nombre: 'Bancos' },
  { clave: 'inversiones', nombre: 'Inversiones' },
  { clave: 'cuentas_por_cobrar', nombre: 'Cuentas por cobrar' },
  { clave: 'impuestos_por_cobrar', nombre: 'Impuestos por cobrar' },
  { clave: 'inventarios', nombre: 'Inventarios' },
  // Conserva la clave legada para no romper los registros existentes.
  { clave: 'propiedad_planta_equipo', nombre: 'Propiedad, planta y equipo' },
  { clave: 'intangibles', nombre: 'Intangibles' },
  { clave: 'otros_activos', nombre: 'Otros activos' },
  { clave: 'obligaciones_financieras', nombre: 'Obligaciones financieras' },
  { clave: 'proveedores', nombre: 'Proveedores' },
  { clave: 'cuentas_por_pagar', nombre: 'Cuentas por pagar' },
  { clave: 'impuestos_por_pagar', nombre: 'Impuestos por pagar' },
  { clave: 'obligaciones_laborales', nombre: 'Obligaciones laborales' },
  { clave: 'provisiones_nomina', nombre: 'Provisiones nómina' },
  { clave: 'apropiaciones_nomina', nombre: 'Apropiaciones nómina' },
  { clave: 'diferidos', nombre: 'Diferidos' },
  { clave: 'otros_pasivos', nombre: 'Otros pasivos' },
  { clave: 'patrimonio', nombre: 'Patrimonio' },
  { clave: 'ingresos_operacionales', nombre: 'Ingresos operacionales' },
  { clave: 'ingresos_no_operacionales', nombre: 'Ingresos no operacionales' },
  { clave: 'gastos_de_administracion', nombre: 'Gastos de administración' },
  { clave: 'gastos_de_ventas', nombre: 'Gastos de ventas' },
  { clave: 'gastos_no_operacionales', nombre: 'Gastos no operacionales' },
  { clave: 'costo_de_ventas', nombre: 'Costo de ventas' },
  { clave: 'costos_de_produccion', nombre: 'Costos de producción o de operación' },
]

export const AREAS_BASE_CLAVES = AREAS_BASE.map((a) => a.clave)

export const AREA_BASE_LABEL: Record<string, string> = Object.fromEntries(
  AREAS_BASE.map((a) => [a.clave, a.nombre]),
)

/** Ciclo propio definido por una firma. */
export type AreaFirma = {
  id: string
  clave: string
  nombre: string
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
