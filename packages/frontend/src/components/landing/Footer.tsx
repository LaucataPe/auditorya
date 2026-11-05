import { Link } from 'react-router-dom'
import { Isotipo } from '../ui/Logo'
import { SITIO } from './contenido'

const ENLACE = 'rounded hover:text-marca-tinta focus:outline-none focus-visible:ring-[3px] focus-visible:ring-marca-300'

/** Pie de página. Privacidad, términos y correo solo aparecen si están configurados (ver docs/landing.md). */
export function Footer() {
  return (
    <footer className="border-t border-marca-linea py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 text-sm text-marca-suave sm:px-6 md:flex-row md:items-center md:justify-between">
        <a href="#inicio" className={`flex items-center gap-2 font-bold text-marca-tinta ${ENLACE}`}>
          <Isotipo className="h-6 w-6" />
          {SITIO.nombre}
        </a>
        <nav aria-label="Pie de página">
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {SITIO.politicaDatosUrl && (
              <li>
                <a href={SITIO.politicaDatosUrl} target="_blank" rel="noreferrer" className={ENLACE}>
                  Privacidad
                </a>
              </li>
            )}
            {SITIO.terminosUrl && (
              <li>
                <a href={SITIO.terminosUrl} target="_blank" rel="noreferrer" className={ENLACE}>
                  Términos
                </a>
              </li>
            )}
            {SITIO.correoContacto && (
              <li>
                <a href={`mailto:${SITIO.correoContacto}`} className={ENLACE}>
                  {SITIO.correoContacto}
                </a>
              </li>
            )}
            <li>
              <Link to="/login" className={ENLACE}>
                Ingresar
              </Link>
            </li>
          </ul>
        </nav>
        <span>
          © {new Date().getFullYear()} {SITIO.nombre}
        </span>
      </div>
    </footer>
  )
}
