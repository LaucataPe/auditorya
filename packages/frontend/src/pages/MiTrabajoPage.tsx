import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { CheckCircle2, ClipboardList, FileText, MessageSquare } from 'lucide-react'
import type { MiTrabajo, MiTrabajoNota, MiTrabajoPapel, MiTrabajoTarea } from '@auditorya/types'
import { useAuthStore } from '../store/auth.store'
import { useAreas } from '../hooks/useAreas'
import { api } from '../lib/api'
import { cn } from '../lib/cn'
import { fechaCorta, haceCuanto } from '../lib/fechas'
import { DataTable } from '../components/ui/DataTable'

const ESTADO_TAREA: Record<string, { label: string; badge: string }> = {
  pendiente: { label: 'Pendiente', badge: 'bg-slate-100 text-slate-600' },
  en_progreso: { label: 'En progreso', badge: 'bg-amber-50 text-amber-700' },
  completada: { label: 'Completada', badge: 'bg-emerald-50 text-emerald-700' },
}

const ESTADO_PAPEL: Record<string, { label: string; badge: string }> = {
  borrador: { label: 'Borrador', badge: 'bg-slate-100 text-slate-600' },
  en_revision: { label: 'En revisión', badge: 'bg-violet-50 text-violet-700' },
  aprobado: { label: 'Aprobado', badge: 'bg-emerald-50 text-emerald-700' },
}

function Badge({ config }: { config?: { label: string; badge: string } }) {
  if (!config) return null
  return (
    <span className={cn('inline-block rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap', config.badge)}>
      {config.label}
    </span>
  )
}

export function MiTrabajoPage() {
  const { user } = useAuthStore()
  const { areaLabel } = useAreas()

  const { data, isLoading } = useQuery<MiTrabajo>({
    queryKey: ['mi-trabajo'],
    queryFn: () => api.get<MiTrabajo>('/mi-trabajo'),
  })

  const tareas = data?.tareas ?? []
  const papeles = data?.papeles ?? []
  const notas = data?.notas ?? []
  const notasPorResolver = notas.filter((n) => n.origen === 'por_resolver')
  const notasEnSeguimiento = notas.filter((n) => n.origen === 'creada_por_mi')

  const columnasTareas = useMemo<ColumnDef<MiTrabajoTarea, any>[]>(
    () => [
      {
        accessorKey: 'titulo',
        header: 'Tarea',
        cell: ({ row }) => (
          <Link
            to={`/empresas/${row.original.empresaId}/encargos/${row.original.auditoriaId}`}
            className="font-medium text-slate-800 hover:text-indigo-600"
          >
            {row.original.titulo}
          </Link>
        ),
      },
      { accessorKey: 'empresaNombre', header: 'Encargo' },
      { accessorKey: 'area', header: 'Área', cell: ({ getValue }) => areaLabel(getValue<string>()) },
      {
        accessorKey: 'vencimiento',
        header: 'Vence',
        cell: ({ getValue }) => {
          const v = getValue<string | null>()
          const vencida = v && new Date(v).getTime() < Date.now()
          return <span className={cn(vencida && 'font-medium text-rose-600')}>{fechaCorta(v)}</span>
        },
      },
      {
        accessorKey: 'estado',
        header: 'Estado',
        cell: ({ getValue }) => <Badge config={ESTADO_TAREA[getValue<string>()]} />,
      },
    ],
    [areaLabel],
  )

  const columnasPapeles = useMemo<ColumnDef<MiTrabajoPapel, any>[]>(
    () => [
      {
        accessorKey: 'titulo',
        header: 'Prueba / papel',
        cell: ({ row }) => (
          <Link
            to={`/empresas/${row.original.empresaId}/encargos/${row.original.auditoriaId}/papeles/${row.original.id}`}
            className="font-medium text-slate-800 hover:text-indigo-600"
          >
            {row.original.titulo}
          </Link>
        ),
      },
      { accessorKey: 'empresaNombre', header: 'Encargo' },
      { accessorKey: 'area', header: 'Área', cell: ({ getValue }) => areaLabel(getValue<string>()) },
      { accessorKey: 'fechaFin', header: 'Fecha fin', cell: ({ getValue }) => fechaCorta(getValue<string | null>()) },
      {
        accessorKey: 'notasAbiertas',
        header: 'Notas',
        meta: { align: 'center' },
        cell: ({ getValue }) => {
          const n = getValue<number>()
          return n > 0 ? (
            <span className="inline-block rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-600">{n}</span>
          ) : (
            <span className="text-gray-300">—</span>
          )
        },
      },
      {
        accessorKey: 'estado',
        header: 'Estado',
        cell: ({ getValue }) => <Badge config={ESTADO_PAPEL[getValue<string>()]} />,
      },
    ],
    [areaLabel],
  )

  const stats = [
    { label: 'Tareas pendientes', value: tareas.length, icon: ClipboardList, color: 'bg-amber-50 text-amber-600' },
    { label: 'Papeles a mi cargo', value: papeles.length, icon: FileText, color: 'bg-indigo-50 text-indigo-600' },
    { label: 'Notas por resolver', value: notasPorResolver.length, icon: MessageSquare, color: 'bg-rose-50 text-rose-600' },
    { label: 'Mis notas en seguimiento', value: notasEnSeguimiento.length, icon: CheckCircle2, color: 'bg-violet-50 text-violet-600' },
  ]

  const vacio = !isLoading && tareas.length === 0 && papeles.length === 0 && notas.length === 0

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Mi trabajo</h1>
        <p className="text-sm text-slate-500 mt-1">
          Tus pendientes en todos los encargos activos: tareas, papeles a tu cargo y notas de revisión.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon
          return (
            <div key={s.label} className="bg-white rounded-xl border border-slate-100 shadow-card p-5">
              <div className={cn('inline-flex p-2 rounded-lg mb-3', s.color)}>
                <Icon size={18} />
              </div>
              <p className="text-2xl font-bold text-slate-900">
                {isLoading ? <span className="inline-block h-7 w-8 animate-pulse rounded bg-slate-100" /> : s.value}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </div>
          )
        })}
      </div>

      {vacio ? (
        <div className="bg-white rounded-xl border border-slate-100 shadow-card flex flex-col items-center px-6 py-14 text-center">
          <CheckCircle2 size={30} className="mb-3 text-emerald-400" />
          <p className="text-sm font-medium text-slate-600">Estás al día, {user?.nombre?.split(' ')[0]}</p>
          <p className="mt-1 max-w-sm text-xs text-slate-400">
            No tienes tareas, papeles ni notas de revisión pendientes en los encargos activos.
          </p>
        </div>
      ) : (
        <>
          {/* Tareas */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 font-semibold text-slate-900">
              <ClipboardList size={16} className="text-amber-600" /> Tareas asignadas a mí
            </h2>
            <DataTable
              columns={columnasTareas}
              data={tareas}
              emptyMessage="No tienes tareas pendientes."
              pageSize={10}
            />
          </section>

          {/* Papeles */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 font-semibold text-slate-900">
              <FileText size={16} className="text-indigo-600" /> Papeles de trabajo a mi cargo
            </h2>
            <DataTable
              columns={columnasPapeles}
              data={papeles}
              emptyMessage="No tienes papeles de trabajo en curso."
              pageSize={10}
            />
          </section>

          {/* Notas de revisión */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 font-semibold text-slate-900">
              <MessageSquare size={16} className="text-rose-600" /> Notas de revisión abiertas
            </h2>
            {notas.length === 0 ? (
              <p className="text-xs text-gray-400">No hay notas de revisión abiertas que te conciernan.</p>
            ) : (
              <ul className="space-y-2">
                {notas.map((n: MiTrabajoNota) => (
                  <li key={n.id} className="bg-white rounded-xl border border-slate-100 shadow-card px-4 py-3">
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          'mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                          n.origen === 'por_resolver' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-500',
                        )}
                      >
                        {n.origen === 'por_resolver' ? 'Por resolver' : 'En seguimiento'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-700">{n.texto}</p>
                        <p className="mt-1 text-[11px] text-gray-400">
                          {n.papelTitulo ? (
                            <Link
                              to={`/empresas/${n.empresaId}/encargos/${n.auditoriaId}/papeles/${n.papelTrabajoId}`}
                              className="text-indigo-500 hover:text-indigo-700"
                            >
                              {n.papelTitulo}
                            </Link>
                          ) : (
                            'Papel eliminado'
                          )}
                          {' · '}
                          {n.empresaNombre}
                          {n.creadoPorNombre ? ` · ${n.creadoPorNombre}` : ''}
                          {' · '}
                          {haceCuanto(n.createdAt)}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
