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
  return new Date(fecha).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
}
