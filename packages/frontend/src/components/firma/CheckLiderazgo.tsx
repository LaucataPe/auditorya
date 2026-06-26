import { useState } from 'react'
import { FileDown } from 'lucide-react'
import { Button } from '../ui/Button'

const DECLARATION_TEXT = `Yo, como Socio Responsable de la firma, declaro formalmente mi compromiso personal con el establecimiento, mantenimiento y mejora continua del Sistema de Control de Calidad de la firma, en cumplimiento con los requerimientos de la NICC 1 (ISQM 1) adoptada en Colombia.

Me comprometo a:
• Establecer el tono apropiado en la firma respecto a la calidad.
• Asegurar que las políticas y procedimientos de control de calidad sean comunicados, entendidos y aplicados por el personal.
• Asignar los recursos necesarios para el funcionamiento efectivo del sistema de control de calidad.
• Evaluar periódicamente la efectividad del sistema e implementar mejoras cuando sea necesario.

Esta declaración forma parte del Sistema de Control de Calidad de la firma y será revisada anualmente.`

type Props = { done: boolean; onComplete: () => void }

export function CheckLiderazgo({ done, onComplete }: Props) {
  const [checked, setChecked] = useState(done)
  const [generating, setGenerating] = useState(false)

  function handleGenerate() {
    setGenerating(true)
    setTimeout(() => {
      setGenerating(false)
      onComplete()
    }, 1200)
  }

  return (
    <div className="space-y-5">
      {/* Fixed text */}
      <div className="rounded-lg bg-gray-50 border border-gray-200 p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Texto de la declaración
        </p>
        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
          {DECLARATION_TEXT}
        </p>
      </div>

      {/* Firma date info */}
      <div className="flex items-center gap-3 text-sm text-gray-500 bg-indigo-50 rounded-lg px-4 py-3">
        <span className="text-indigo-500">📅</span>
        El documento se firmará con la fecha de hoy:{' '}
        <strong className="text-indigo-700">
          {new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}
        </strong>
      </div>

      {/* Checkbox confirmation */}
      <label className="flex items-start gap-3 cursor-pointer group">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          disabled={done}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
        />
        <span className="text-sm text-gray-700 group-hover:text-gray-900 transition-colors">
          Confirmo que he leído la declaración anterior y acepto su contenido en representación de la firma como Socio Responsable.
        </span>
      </label>

      {/* Action */}
      {!done && (
        <Button
          onClick={handleGenerate}
          disabled={!checked}
          loading={generating}
          className="gap-2"
          size="sm"
        >
          <FileDown size={14} />
          Generar y guardar PDF
        </Button>
      )}

      {done && (
        <div className="flex items-center gap-2 text-sm text-indigo-600 font-medium">
          <FileDown size={14} />
          Declaración_liderazgo.pdf generado · {new Date().toLocaleDateString('es-CO')}
        </div>
      )}
    </div>
  )
}
