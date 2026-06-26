import { useState } from 'react'
import { CheckCircle, ExternalLink, Upload } from 'lucide-react'
import { Button } from '../ui/Button'
import { cn } from '../../lib/cn'

type CodigoEtica = 'IESBA' | 'propio' | null

type Props = { done: boolean; onComplete: () => void }

export function CheckEtica({ done, onComplete }: Props) {
  const [codigo, setCodigo] = useState<CodigoEtica>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [registeredDate] = useState(() => new Date().toLocaleDateString('es-CO', {
    year: 'numeric', month: 'long', day: 'numeric',
  }))

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) setFileName(file.name)
  }

  function handleSave() {
    setSaving(true)
    setTimeout(() => {
      setSaving(false)
      onComplete()
    }, 900)
  }

  const canSave = codigo === 'IESBA' || (codigo === 'propio' && !!fileName)

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-gray-700 mb-3">
          Selecciona el código de ética adoptado por la firma:
        </p>

        <div className="grid grid-cols-2 gap-3">
          {/* IESBA */}
          <button
            onClick={() => !done && setCodigo('IESBA')}
            disabled={done}
            className={cn(
              'rounded-xl border-2 p-4 text-left transition-all',
              codigo === 'IESBA'
                ? 'border-indigo-600 bg-indigo-50'
                : 'border-gray-200 hover:border-gray-300',
              done && 'cursor-not-allowed',
            )}
          >
            <div className="flex items-start justify-between mb-2">
              <span className="text-sm font-semibold text-gray-900">Código IESBA</span>
              {codigo === 'IESBA' && <CheckCircle size={15} className="text-indigo-600 shrink-0" />}
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              Código de ética del IFAC adoptado por Colombia como estándar internacional.
            </p>
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline mt-2"
            >
              Ver código <ExternalLink size={10} />
            </a>
          </button>

          {/* Código propio */}
          <button
            onClick={() => !done && setCodigo('propio')}
            disabled={done}
            className={cn(
              'rounded-xl border-2 p-4 text-left transition-all',
              codigo === 'propio'
                ? 'border-indigo-600 bg-indigo-50'
                : 'border-gray-200 hover:border-gray-300',
              done && 'cursor-not-allowed',
            )}
          >
            <div className="flex items-start justify-between mb-2">
              <span className="text-sm font-semibold text-gray-900">Código propio</span>
              {codigo === 'propio' && <CheckCircle size={15} className="text-indigo-600 shrink-0" />}
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              La firma cuenta con su propio código de ética adaptado a su contexto.
            </p>
          </button>
        </div>
      </div>

      {/* Upload si código propio */}
      {codigo === 'propio' && !done && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">Sube el documento de tu código de ética.</p>
          <label className="flex flex-col items-center justify-center w-full rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-5 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors">
            <Upload size={18} className="text-gray-400 mb-1.5" />
            <span className="text-sm font-medium text-gray-600">
              {fileName ?? 'Sube el PDF de tu código'}
            </span>
            <span className="text-xs text-gray-400 mt-0.5">PDF, máx. 10 MB</span>
            <input type="file" accept=".pdf" className="hidden" onChange={handleUpload} />
          </label>
        </div>
      )}

      {/* Info IESBA seleccionado */}
      {codigo === 'IESBA' && !done && (
        <div className="flex items-start gap-2 text-sm text-indigo-700 bg-indigo-50 rounded-lg px-4 py-3">
          <span>ℹ️</span>
          <span>
            Se registrará la adopción del <strong>Código de Ética IESBA</strong> con la fecha de hoy. No es necesario subir ningún documento adicional.
          </span>
        </div>
      )}

      {/* Acción */}
      {!done && (
        <Button
          size="sm"
          disabled={!canSave}
          loading={saving}
          onClick={handleSave}
          className="gap-2"
        >
          <CheckCircle size={14} />
          Registrar código de ética
        </Button>
      )}

      {/* Done */}
      {done && (
        <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-4 py-3 text-sm text-indigo-700">
          <p className="font-medium">Código de ética registrado</p>
          <p className="text-xs text-indigo-500 mt-0.5">
            {codigo === 'IESBA' ? 'Código IESBA (IFAC)' : 'Código propio'} · {registeredDate}
          </p>
        </div>
      )}
    </div>
  )
}
