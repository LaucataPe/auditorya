import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { POLITICA_DATOS } from '@auditorya/types'
import { PoliticaTexto } from '../components/politica/PoliticaTexto'

/** Página pública con la política vigente (la enlazan la landing, el registro y el pie de página). */
export function PoliticaDatosPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Link to="/" className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900">
          <ArrowLeft size={16} />
          Volver al inicio
        </Link>
        <article className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-10">
          <h1 className="text-2xl font-bold text-gray-900">{POLITICA_DATOS.titulo}</h1>
          <p className="mt-1 mb-6 text-xs text-gray-400">
            Versión {POLITICA_DATOS.version} · vigente desde el {new Date(`${POLITICA_DATOS.vigenteDesde}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <PoliticaTexto />
        </article>
      </div>
    </div>
  )
}
