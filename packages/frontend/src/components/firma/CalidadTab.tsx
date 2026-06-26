import { useState } from 'react'
import { CheckCircle, ChevronDown, ChevronUp, Circle } from 'lucide-react'
import { cn } from '../../lib/cn'
import { CheckLiderazgo } from './CheckLiderazgo'
import { CheckIndependencia } from './CheckIndependencia'
import { CheckEtica } from './CheckEtica'

type CheckState = {
  liderazgo: boolean
  independencia: boolean
  etica: boolean
}

const checks = [
  {
    id: 'liderazgo' as const,
    num: 1,
    title: 'Declaración de liderazgo',
    desc: 'El socio responsable declara su compromiso con la calidad de la firma.',
  },
  {
    id: 'independencia' as const,
    num: 2,
    title: 'Política de independencia',
    desc: 'Documento que define los criterios de independencia del equipo auditor.',
  },
  {
    id: 'etica' as const,
    num: 3,
    title: 'Código de ética',
    desc: 'Marco ético adoptado por la firma (IESBA o código propio).',
  },
]

export function CalidadTab() {
  const [completed, setCompleted] = useState<CheckState>({
    liderazgo: false,
    independencia: false,
    etica: false,
  })
  const [open, setOpen] = useState<keyof CheckState | null>('liderazgo')

  function markDone(id: keyof CheckState) {
    setCompleted((prev) => ({ ...prev, [id]: true }))
    const idx = checks.findIndex((c) => c.id === id)
    const next = checks[idx + 1]
    setOpen(next ? next.id : null)
  }

  const doneCount = Object.values(completed).filter(Boolean).length

  return (
    <div className="space-y-4">
      {/* Progress header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 flex items-center gap-4">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-900">
            Requisitos ISQM 1 — Sistema de control de calidad
          </p>
          <p className="text-xs text-gray-500 mt-0.5">{doneCount} de {checks.length} completados</p>
        </div>
        <div className="flex gap-2">
          {checks.map((c) => (
            <div
              key={c.id}
              className={cn(
                'h-2 w-10 rounded-full transition-all',
                completed[c.id] ? 'bg-indigo-600' : 'bg-gray-200',
              )}
            />
          ))}
        </div>
      </div>

      {/* Check cards */}
      {checks.map((check) => {
        const isOpen = open === check.id
        const isDone = completed[check.id]

        return (
          <div
            key={check.id}
            className={cn(
              'rounded-xl border bg-white shadow-sm overflow-hidden transition-all',
              isDone ? 'border-indigo-100' : 'border-gray-200',
            )}
          >
            {/* Header */}
            <button
              className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
              onClick={() => setOpen(isOpen ? null : check.id)}
            >
              <div className="shrink-0">
                {isDone ? (
                  <CheckCircle size={20} className="text-indigo-600" />
                ) : (
                  <Circle size={20} className="text-gray-300" />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 font-medium">Check {check.num}</span>
                  {isDone && (
                    <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">
                      Completado
                    </span>
                  )}
                </div>
                <p className="font-medium text-gray-900 text-sm">{check.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{check.desc}</p>
              </div>
              {isOpen ? (
                <ChevronUp size={16} className="text-gray-400 shrink-0" />
              ) : (
                <ChevronDown size={16} className="text-gray-400 shrink-0" />
              )}
            </button>

            {/* Body */}
            {isOpen && (
              <div className="border-t border-gray-100 px-5 py-5">
                {check.id === 'liderazgo' && (
                  <CheckLiderazgo done={isDone} onComplete={() => markDone('liderazgo')} />
                )}
                {check.id === 'independencia' && (
                  <CheckIndependencia done={isDone} onComplete={() => markDone('independencia')} />
                )}
                {check.id === 'etica' && (
                  <CheckEtica done={isDone} onComplete={() => markDone('etica')} />
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
