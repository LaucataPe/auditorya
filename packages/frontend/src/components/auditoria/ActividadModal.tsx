import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { api } from '../../lib/api'

type Evento = {
  id: string
  accion: string
  entidad: string
  detalle: Record<string, unknown> | null
  createdAt: string
  usuarioNombre: string
}

const ACCION_LABEL: Record<string, string> = {
  'auditoria.crear': 'creó la auditoría',
  'materialidad.aprobar': 'aprobó la materialidad',
  'papel.aprobar': 'aprobó un papel de trabajo',
  'papel.reabrir': 'reabrió un papel de trabajo',
  'informe.aprobar': 'aprobó un informe',
  'informe.reabrir': 'reabrió un informe',
  'balance.importar': 'importó el balance de prueba',
  'evidencia.subir_archivo': 'adjuntó un archivo de evidencia',
  'encargo.aceptado': 'aceptó el encargo',
  'encargo.rechazado': 'rechazó el encargo',
  'ia.sugerir_riesgos': 'generó riesgos sugeridos con IA',
  'ia.analisis_balance': 'generó el análisis del balance con IA',
  'ia.redactar_papel': 'usó IA para redactar un papel',
  'ia.asistente': 'consultó al asistente IA',
}

function descripcionDetalle(ev: Evento): string | null {
  const d = ev.detalle
  if (!d) return null
  if (typeof d.titulo === 'string') return d.titulo
  if (typeof d.tipo === 'string') return String(d.tipo).replace(/_/g, ' ')
  if (typeof d.nombre === 'string') return d.nombre
  if (typeof d.filas === 'number') return `${d.filas} filas`
  return null
}

/**
 * Pista de auditoría del encargo (quién hizo qué y cuándo).
 * Registro inmutable — respaldo de la integridad del archivo (NIA 230).
 */
export function ActividadModal({
  auditoriaId, onClose,
}: {
  auditoriaId: string
  onClose: () => void
}) {
  const { data: eventos = [], isLoading } = useQuery<Evento[]>({
    queryKey: ['eventos', auditoriaId],
    queryFn: () => api.get<Evento[]>(`/auditorias/${auditoriaId}/eventos`),
  })

  return (
    <Modal open onClose={onClose} title="Actividad del encargo" size="lg">
      <div className="max-h-[65vh] space-y-0 overflow-y-auto pr-1">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          </div>
        ) : eventos.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <History size={30} className="mb-3 text-slate-300" />
            <p className="text-sm text-slate-400">Aún no hay actividad registrada</p>
            <p className="mt-1 text-xs text-slate-400">
              Las aprobaciones, importaciones y acciones clave quedarán aquí como pista de auditoría.
            </p>
          </div>
        ) : (
          <ol className="relative ml-2 border-l border-slate-200">
            {eventos.map((ev) => {
              const detalle = descripcionDetalle(ev)
              return (
                <li key={ev.id} className="relative pb-5 pl-5 last:pb-1">
                  <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-indigo-400" />
                  <p className="text-sm text-slate-700">
                    <span className="font-medium text-slate-900">{ev.usuarioNombre}</span>{' '}
                    {ACCION_LABEL[ev.accion] ?? ev.accion.replace(/[._]/g, ' ')}
                    {detalle && <span className="text-slate-500"> — {detalle}</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {new Date(ev.createdAt).toLocaleString('es-CO', {
                      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </Modal>
  )
}
