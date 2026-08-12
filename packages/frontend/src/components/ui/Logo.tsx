import logoUrl from '../../assets/logo.png'
import isotipoUrl from '../../assets/isotipo.png'

/**
 * Marca AuditorYa. El lockup completo lleva el texto en azul oscuro, así que solo
 * sirve sobre fondos claros; en fondos oscuros se usa `Isotipo` + el nombre en HTML.
 */
export function Logo({ className }: { className?: string }) {
  return <img src={logoUrl} alt="AuditorYa" className={className} />
}

/** Solo el símbolo (cuadro redondeado oscuro): funciona en claro y oscuro. */
export function Isotipo({ className }: { className?: string }) {
  return <img src={isotipoUrl} alt="" aria-hidden="true" className={className} />
}
