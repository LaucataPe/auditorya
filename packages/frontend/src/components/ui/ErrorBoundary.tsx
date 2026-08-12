import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

type Props = { children: ReactNode }
type State = { error: Error | null }

/**
 * Última red de seguridad: un error de render no debe dejar la pantalla en blanco.
 * Muestra un mensaje recuperable con opción de recargar.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary]', error)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-md rounded-xl border border-red-100 bg-white p-6 text-center shadow-card">
          <AlertTriangle className="mx-auto h-8 w-8 text-red-500" />
          <h1 className="mt-3 text-lg font-semibold text-slate-900">Algo salió mal</h1>
          <p className="mt-1 text-sm text-slate-600">
            Ocurrió un error inesperado en la aplicación. Tu trabajo guardado no se pierde.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Recargar la página
          </button>
        </div>
      </div>
    )
  }
}
