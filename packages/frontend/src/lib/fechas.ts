/** "hace 5 min", "hace 3 h", "hace 2 días" — para bandejas y listas de actividad. */
export function haceCuanto(fecha: string): string {
  const ms = Date.now() - new Date(fecha).getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const horas = Math.floor(min / 60)
  if (horas < 24) return `hace ${horas} h`
  const dias = Math.floor(horas / 24)
  if (dias < 30) return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`
  return new Date(fecha).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}

/** Fecha corta legible ("12 ago 2026") o em-dash si no hay. */
export function fechaCorta(fecha: string | null | undefined): string {
  if (!fecha) return '—'
  return parsearFecha(fecha).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Las columnas `date` llegan como 'YYYY-MM-DD'. `new Date()` las interpreta
 * como medianoche UTC, que en Colombia (UTC-5) cae en el día anterior: se
 * construyen como fecha local. Los timestamps con hora se parsean normal.
 */
export function parsearFecha(valor: string): Date {
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor)
  return soloFecha
    ? new Date(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3]))
    : new Date(valor)
}
