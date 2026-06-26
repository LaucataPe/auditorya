import { useState } from 'react'
import { FileDown, Upload } from 'lucide-react'
import { Button } from '../ui/Button'
import { cn } from '../../lib/cn'

type Opcion = 'si' | 'no' | null

const TEMPLATE_FIELDS = [
  { id: 'alcance', label: 'Alcance de la política', placeholder: 'Describe a quién aplica esta política...' },
  { id: 'amenazas', label: 'Amenazas identificadas', placeholder: 'Lista las amenazas a la independencia reconocidas...' },
  { id: 'salvaguardas', label: 'Salvaguardas adoptadas', placeholder: 'Describe las medidas para mitigar cada amenaza...' },
  { id: 'revision', label: 'Periodicidad de revisión', placeholder: 'Ej: Anual, antes de cada encargo...' },
]

type Props = { done: boolean; onComplete: () => void }

export function CheckIndependencia({ done, onComplete }: Props) {
  const [opcion, setOpcion] = useState<Opcion>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) setFileName(file.name)
  }

  function handleSave() {
    setGenerating(true)
    setTimeout(() => {
      setGenerating(false)
      onComplete()
    }, 1000)
  }


  return (
    <div className="space-y-5">
      {/* Pregunta */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-3">
          ¿Tu firma ya cuenta con un documento de política de independencia?
        </p>
        <div className="flex gap-3">
          {(['si', 'no'] as const).map((val) => (
            <button
              key={val}
              onClick={() => !done && setOpcion(val)}
              disabled={done}
              className={cn(
                'flex-1 rounded-lg border-2 py-3 text-sm font-medium transition-all',
                opcion === val
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300',
                done && 'cursor-not-allowed opacity-70',
              )}
            >
              {val === 'si' ? 'Sí, ya tengo documento' : 'No, quiero usar una plantilla'}
            </button>
          ))}
        </div>
      </div>

      {/* Opción Sí: upload */}
      {opcion === 'si' && !done && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">Sube el PDF de tu política de independencia.</p>
          <label className="flex flex-col items-center justify-center w-full rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-6 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors">
            <Upload size={20} className="text-gray-400 mb-2" />
            <span className="text-sm font-medium text-gray-600">
              {fileName ?? 'Haz clic para subir el archivo'}
            </span>
            <span className="text-xs text-gray-400 mt-0.5">PDF, máx. 10 MB</span>
            <input type="file" accept=".pdf" className="hidden" onChange={handleUpload} />
          </label>
          {fileName && (
            <Button size="sm" loading={generating} disabled={!fileName} onClick={handleSave} className="gap-2">
              <FileDown size={14} /> Guardar documento
            </Button>
          )}
        </div>
      )}

      {/* Opción No: plantilla */}
      {opcion === 'no' && !done && (
        <div className="space-y-4">
          <p className="text-xs text-gray-500">Completa los campos para generar tu política de independencia.</p>
          {TEMPLATE_FIELDS.map((f) => (
            <div key={f.id} className="space-y-1">
              <label className="text-sm font-medium text-gray-700">{f.label}</label>
              <textarea
                placeholder={f.placeholder}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
              />
            </div>
          ))}
          <Button size="sm" loading={generating} onClick={handleSave} className="gap-2">
            <FileDown size={14} /> Generar PDF y guardar
          </Button>
        </div>
      )}

      {/* Done state */}
      {done && (
        <div className="flex items-center gap-2 text-sm text-indigo-600 font-medium">
          <FileDown size={14} />
          Politica_independencia.pdf guardado · {new Date().toLocaleDateString('es-CO')}
        </div>
      )}
    </div>
  )
}
