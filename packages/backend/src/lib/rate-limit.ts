/**
 * Rate limiting en memoria para endpoints sensibles (login).
 * Ventana deslizante simple: N intentos por clave cada X ms.
 * Suficiente para una sola instancia; si se escala horizontalmente,
 * migrar a Redis (ya está ioredis en dependencias).
 */

type Registro = { intentos: number[]; }

const registros = new Map<string, Registro>()

const VENTANA_MS = 15 * 60 * 1000 // 15 minutos
const MAX_INTENTOS = 10

/** Devuelve true si la clave superó el límite (y registra el intento). */
export function excedeLimite(clave: string): boolean {
  const ahora = Date.now()
  const reg = registros.get(clave) ?? { intentos: [] }
  reg.intentos = reg.intentos.filter((t) => ahora - t < VENTANA_MS)
  if (reg.intentos.length >= MAX_INTENTOS) {
    registros.set(clave, reg)
    return true
  }
  reg.intentos.push(ahora)
  registros.set(clave, reg)
  return false
}

/** Limpia los intentos de una clave (p. ej. tras login exitoso). */
export function limpiarLimite(clave: string): void {
  registros.delete(clave)
}

// Poda periódica para no acumular memoria.
setInterval(() => {
  const ahora = Date.now()
  for (const [clave, reg] of registros) {
    reg.intentos = reg.intentos.filter((t) => ahora - t < VENTANA_MS)
    if (reg.intentos.length === 0) registros.delete(clave)
  }
}, VENTANA_MS).unref?.()
