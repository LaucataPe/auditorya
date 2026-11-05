import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { Isotipo } from '../ui/Logo'
import { useAuthStore } from '../../store/auth.store'
import { ANCLA_CONTACTO, MENSAJES_WHATSAPP, enlaceWhatsApp, CTA, NAV, SITIO } from './contenido'
import { CtaLink } from './CtaLink'

const FOCO = 'focus:outline-none focus-visible:ring-[3px] focus-visible:ring-marca-300'

export function Navbar() {
  const { isAuthenticated } = useAuthStore()
  const [abierto, setAbierto] = useState(false)
  const botonRef = useRef<HTMLButtonElement>(null)

  // Escape cierra el menú móvil y devuelve el foco al botón que lo abrió.
  useEffect(() => {
    if (!abierto) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAbierto(false)
        botonRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [abierto])

  const cerrar = () => setAbierto(false)
  const ctaHref = enlaceWhatsApp(MENSAJES_WHATSAPP.conocer) ?? ANCLA_CONTACTO
  const acceso = isAuthenticated ? { to: '/dashboard', label: 'Ir al panel' } : { to: '/login', label: 'Ingresar' }

  return (
    <header className="sticky top-0 z-20 border-b border-marca-linea bg-marca-fondo/85 backdrop-blur-md">
      <nav aria-label="Principal" className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <a href="#inicio" className={`flex items-center gap-2.5 rounded-md ${FOCO}`}>
          <Isotipo className="h-8 w-8" />
          <span className="text-lg font-bold tracking-tight text-marca-tinta">{SITIO.nombre}</span>
          <span className="hidden border-l border-marca-linea pl-2.5 text-xs font-medium text-marca-suave xl:inline">
            {SITIO.lema}
          </span>
        </a>

        <ul className="hidden items-center gap-6 text-sm text-marca-suave lg:flex">
          {NAV.map((item) => (
            <li key={item.href}>
              <a href={item.href} className={`rounded hover:text-marca-tinta ${FOCO}`}>
                {item.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <Link
            to={acceso.to}
            className={`hidden rounded-lg px-3 py-2 text-sm font-medium text-marca-tinta hover:bg-white/70 sm:inline-flex ${FOCO}`}
          >
            {acceso.label}
          </Link>
          <CtaLink href={ctaHref} ubicacion="navbar" className="hidden min-h-[40px] px-4 py-2 text-sm sm:inline-flex">
            {CTA.principal}
          </CtaLink>
          <button
            ref={botonRef}
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-expanded={abierto}
            aria-controls="menu-movil"
            className={`inline-flex h-11 w-11 items-center justify-center rounded-lg text-marca-tinta hover:bg-white/70 lg:hidden ${FOCO}`}
          >
            {abierto ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
            <span className="sr-only">{abierto ? 'Cerrar menú' : 'Abrir menú'}</span>
          </button>
        </div>
      </nav>

      {abierto && (
        <div id="menu-movil" className="border-t border-marca-linea bg-marca-fondo px-4 pb-4 pt-2 lg:hidden">
          <ul className="flex flex-col">
            {NAV.map((item) => (
              <li key={item.href}>
                <a href={item.href} onClick={cerrar} className="block rounded-lg px-3 py-3 text-base text-marca-tinta hover:bg-white/70">
                  {item.label}
                </a>
              </li>
            ))}
            <li>
              <Link to={acceso.to} onClick={cerrar} className="block rounded-lg px-3 py-3 text-base text-marca-tinta hover:bg-white/70">
                {acceso.label}
              </Link>
            </li>
          </ul>
          <div onClick={cerrar}>
            <CtaLink href={ctaHref} ubicacion="menu_movil" className="mt-3 w-full">
              {CTA.principal}
            </CtaLink>
          </div>
        </div>
      )}
    </header>
  )
}
