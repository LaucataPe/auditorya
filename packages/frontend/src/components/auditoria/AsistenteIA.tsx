import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Send, Sparkles, X } from 'lucide-react'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'

type Mensaje = { role: 'user' | 'assistant'; content: string }

/**
 * Asistente NIA con contexto del encargo. Botón flotante + panel lateral.
 * Solo se muestra si el backend tiene IA disponible.
 */
export function AsistenteIA({ auditoriaId }: { auditoriaId: string }) {
  const [abierto, setAbierto] = useState(false)
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [texto, setTexto] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const { data: estado } = useQuery<{ disponible: boolean }>({
    queryKey: ['ia-estado'],
    queryFn: () => api.get('/ia/estado'),
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [mensajes, cargando])

  if (!estado?.disponible) return null

  async function enviar() {
    const pregunta = texto.trim()
    if (!pregunta || cargando) return
    setTexto('')
    setError(null)
    const historial = mensajes.slice(-10)
    setMensajes((m) => [...m, { role: 'user', content: pregunta }])
    setCargando(true)
    try {
      const { respuesta } = await api.post<{ respuesta: string }>(
        `/auditorias/${auditoriaId}/ia/asistente`,
        { pregunta, historial },
      )
      setMensajes((m) => [...m, { role: 'assistant', content: respuesta }])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error del asistente')
    } finally {
      setCargando(false)
    }
  }

  return (
    <>
      {/* Botón flotante */}
      {!abierto && (
        <button
          onClick={() => setAbierto(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-lg hover:bg-slate-800 transition-all hover:shadow-xl"
        >
          <Sparkles size={16} className="text-indigo-400" />
          Asistente NIA
        </button>
      )}

      {/* Panel */}
      {abierto && (
        <div className="fixed bottom-6 right-6 z-40 flex h-[560px] w-[400px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-slide-up">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-950 px-4 py-3">
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="text-indigo-400" />
              <div>
                <p className="text-sm font-semibold text-white leading-tight">Asistente NIA</p>
                <p className="text-[11px] text-slate-400">Con el contexto de este encargo</p>
              </div>
            </div>
            <button
              onClick={() => setAbierto(false)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
            >
              <X size={15} />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {mensajes.length === 0 && (
              <div className="space-y-2">
                <p className="text-xs text-slate-400">
                  Pregunta sobre NIA, procedimientos, normativa colombiana o este encargo. Por ejemplo:
                </p>
                {[
                  '¿Qué porcentaje de materialidad se suele usar sobre activos?',
                  '¿Cómo documento una circularización de cartera?',
                  '¿Qué debo revisar antes de aprobar el dictamen?',
                ].map((s) => (
                  <button
                    key={s}
                    onClick={() => setTexto(s)}
                    className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-xs text-slate-600 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {mensajes.map((m, i) => (
              <div
                key={i}
                className={cn(
                  'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed',
                  m.role === 'user'
                    ? 'ml-auto bg-indigo-600 text-white rounded-br-md'
                    : 'bg-slate-100 text-slate-800 rounded-bl-md',
                )}
              >
                {m.content}
              </div>
            ))}
            {cargando && (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
                Pensando…
              </div>
            )}
            {error && (
              <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
            )}
          </div>

          <div className="border-t border-slate-100 p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    enviar()
                  }
                }}
                rows={1}
                placeholder="Escribe tu pregunta…"
                className="max-h-24 flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
              <button
                onClick={enviar}
                disabled={!texto.trim() || cargando}
                className="rounded-xl bg-indigo-600 p-2.5 text-white transition-colors hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400"
              >
                <Send size={15} />
              </button>
            </div>
            <p className="mt-1.5 text-center text-[10px] text-slate-400">
              La IA apoya tu juicio profesional, no lo reemplaza.
            </p>
          </div>
        </div>
      )}
    </>
  )
}
