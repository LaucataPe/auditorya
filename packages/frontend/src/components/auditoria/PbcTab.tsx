import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Inbox, Lock, Check, X, Clock } from 'lucide-react'
import { ESTADO_PBC_LABEL, type EstadoPbc, type SolicitudPbcConPapel } from '@auditorya/types'
import { PbcArchivo } from './pbc-archivo'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'

const AREA_LABEL: Record<string, string> = {
  efectivo: 'Efectivo', cartera: 'Cartera', inventarios: 'Inventarios',
  propiedad_planta_equipo: 'Propiedad, planta y equipo', proveedores: 'Proveedores',
  nomina: 'Nómina', impuestos: 'Impuestos', ingresos: 'Ingresos', gastos: 'Gastos',
  patrimonio: 'Patrimonio', otro: 'Otro',
}

const BADGE: Record<EstadoPbc, string> = {
  solicitado: 'bg-amber-50 text-amber-700',
  recibido: 'bg-emerald-50 text-emerald-700',
  no_aplica: 'bg-gray-100 text-gray-500',
}

type Filtro = 'todos' | EstadoPbc

export function PbcTab({
  auditoriaId,
  materialidadAprobada,
}: {
  auditoriaId: string
  materialidadAprobada: boolean
}) {
  const queryClient = useQueryClient()
  const [filtro, setFiltro] = useState<Filtro>('todos')

  const { data: items = [], isLoading } = useQuery<SolicitudPbcConPapel[]>({
    queryKey: ['pbc', auditoriaId],
    queryFn: () => api.get<SolicitudPbcConPapel[]>(`/auditorias/${auditoriaId}/pbc`),
    enabled: materialidadAprobada,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['pbc', auditoriaId] })

  const recibir = useMutation({
    mutationFn: (id: string) => api.post(`/pbc/${id}/recibir`, {}),
    onSuccess: invalidate,
  })
  const cambiarEstado = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: EstadoPbc }) => api.put(`/pbc/${id}`, { estado }),
    onSuccess: invalidate,
  })

  if (!materialidadAprobada) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center max-w-2xl">
        <Lock size={32} className="text-gray-300 mb-3" />
        <p className="text-sm font-medium text-gray-500">Documentos no disponibles</p>
        <p className="text-xs text-gray-400 mt-1 max-w-sm">
          Aprueba la materialidad para habilitar la ejecución y la solicitud de documentos al cliente.
        </p>
      </div>
    )
  }

  const cuenta = (e: EstadoPbc) => items.filter((s) => s.estado === e).length
  const visibles = filtro === 'todos' ? items : items.filter((s) => s.estado === filtro)

  const FILTROS: { key: Filtro; label: string }[] = [
    { key: 'todos', label: `Todos (${items.length})` },
    { key: 'solicitado', label: `Solicitados (${cuenta('solicitado')})` },
    { key: 'recibido', label: `Recibidos (${cuenta('recibido')})` },
    { key: 'no_aplica', label: `No aplica (${cuenta('no_aplica')})` },
  ]

  return (
    <div className="space-y-5">

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-3">
        <ResumenCard label="Solicitados" valor={cuenta('solicitado')} color="text-amber-600" />
        <ResumenCard label="Recibidos" valor={cuenta('recibido')} color="text-emerald-600" />
        <ResumenCard label="No aplica" valor={cuenta('no_aplica')} color="text-gray-500" />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFiltro(f.key)}
            className={cn(
              'text-xs font-medium px-3 py-1.5 rounded-full transition-colors',
              filtro === f.key ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      ) : visibles.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-14 text-center">
          <Inbox size={32} className="text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-400">
            {items.length === 0 ? 'Aún no hay documentos solicitados' : 'Nada en este filtro'}
          </p>
          {items.length === 0 && (
            <p className="text-xs text-gray-400 mt-1 max-w-sm">
              Se generan al crear pruebas desde un riesgo, o manualmente dentro de cada papel de trabajo.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {visibles.map((s) => (
            <div key={s.id} className="flex items-start justify-between gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', BADGE[s.estado])}>
                    {ESTADO_PBC_LABEL[s.estado]}
                  </span>
                  <span className="text-sm font-medium text-gray-900">{s.descripcion}</span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {s.papelTitulo ? (
                    <>Papel: {s.papelTitulo}{s.papelArea ? ` · ${AREA_LABEL[s.papelArea] ?? s.papelArea}` : ''}</>
                  ) : (
                    'Sin papel asociado'
                  )}
                </p>
                {s.estado === 'recibido' && s.evidenciaId && (
                  <div className="mt-1">
                    <PbcArchivo
                      evidenciaId={s.evidenciaId}
                      archivoNombre={s.evidenciaArchivoNombre}
                      archivoTamano={s.evidenciaArchivoTamano}
                      onCambio={invalidate}
                    />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {s.estado === 'solicitado' && (
                  <>
                    <button
                      onClick={() => recibir.mutate(s.id)}
                      disabled={recibir.isPending || !s.papelTrabajoId}
                      className="text-emerald-600 hover:bg-emerald-50 rounded p-1 transition-colors disabled:text-gray-300"
                      title="Marcar recibido"
                    >
                      <Check size={15} />
                    </button>
                    <button
                      onClick={() => cambiarEstado.mutate({ id: s.id, estado: 'no_aplica' })}
                      disabled={cambiarEstado.isPending}
                      className="text-gray-400 hover:bg-gray-100 rounded p-1 transition-colors"
                      title="No aplica"
                    >
                      <X size={15} />
                    </button>
                  </>
                )}
                {s.estado !== 'solicitado' && (
                  <button
                    onClick={() => cambiarEstado.mutate({ id: s.id, estado: 'solicitado' })}
                    disabled={cambiarEstado.isPending}
                    className="text-gray-400 hover:bg-gray-100 rounded p-1 transition-colors"
                    title="Volver a solicitado"
                  >
                    <Clock size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ResumenCard({ label, valor, color }: { label: string; valor: number; color: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <p className={cn('text-2xl font-bold', color)}>{valor}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}
