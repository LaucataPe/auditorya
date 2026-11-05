import { useState } from 'react'
import { HERO_VARIANTES, type VarianteHero } from '../components/landing/contenido'

const CLAVE = 'auditorya.landing.varianteHero'

const esVariante = (v: unknown): v is VarianteHero => typeof v === 'string' && v in HERO_VARIANTES

/**
 * Variante del titular del hero para la prueba A/B. Se resuelve UNA vez por visitante:
 *  1. `?variante=a|b` en la URL (para QA y para enlazar campañas a una variante).
 *  2. `VITE_HERO_VARIANTE` (fija una variante para todos, p. ej. al terminar la prueba).
 *  3. La asignada antes a este navegador (localStorage).
 *  4. Asignación aleatoria 50/50, que se guarda para que no cambie en la próxima visita.
 */
function resolverVariante(): VarianteHero {
  const deUrl = new URLSearchParams(window.location.search).get('variante')?.toLowerCase()
  if (esVariante(deUrl)) return deUrl

  const fija = import.meta.env.VITE_HERO_VARIANTE?.toLowerCase()
  if (esVariante(fija)) return fija

  try {
    const guardada = localStorage.getItem(CLAVE)
    if (esVariante(guardada)) return guardada
    const nueva: VarianteHero = Math.random() < 0.5 ? 'a' : 'b'
    localStorage.setItem(CLAVE, nueva)
    return nueva
  } catch {
    // Sin almacenamiento (modo privado, cookies bloqueadas): variante de control.
    return 'a'
  }
}

export function useVarianteHero() {
  const [variante] = useState(resolverVariante)
  return { variante, ...HERO_VARIANTES[variante] }
}
