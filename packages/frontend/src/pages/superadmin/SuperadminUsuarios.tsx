import { useQuery } from '@tanstack/react-query'
import { Users } from 'lucide-react'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'

type FirmaRow = { id: string; nombre: string; nit: string; ciudad: string; createdAt: string; totalUsuarios: number }
type UsuarioRow = { id: string; nombre: string; email: string; rol: string; createdAt: string; firmaId: string }

const ROL_BADGE: Record<string, string> = {
  socio: 'bg-indigo-50 text-indigo-700',
  gerente: 'bg-violet-50 text-violet-700',
  senior: 'bg-amber-50 text-amber-700',
  asistente: 'bg-gray-100 text-gray-600',
}

export function SuperadminUsuarios() {
  const { data: firmas = [], isLoading } = useQuery<FirmaRow[]>({
    queryKey: ['superadmin', 'firmas'],
    queryFn: () => api.get<FirmaRow[]>('/superadmin/firmas'),
  })

  // Carga usuarios de todas las firmas
  const { data: allUsuarios = [] } = useQuery<{ firmaId: string; usuarios: UsuarioRow[] }[]>({
    queryKey: ['superadmin', 'all-usuarios', firmas.map((f) => f.id).join(',')],
    queryFn: async () => {
      return Promise.all(
        firmas.map(async (f) => ({
          firmaId: f.id,
          usuarios: await api.get<UsuarioRow[]>(`/superadmin/firmas/${f.id}/usuarios`),
        })),
      )
    },
    enabled: firmas.length > 0,
  })

  const totalUsuarios = allUsuarios.reduce((s, f) => s + f.usuarios.length, 0)

  return (
    <div className="p-8 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Usuarios del sistema</h1>
        <p className="text-sm text-gray-500 mt-1">{totalUsuarios} usuarios en {firmas.length} firmas</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-6">
          {allUsuarios.map(({ firmaId, usuarios }) => {
            const firma = firmas.find((f) => f.id === firmaId)
            if (!firma || usuarios.length === 0) return null
            return (
              <div key={firmaId} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Firma header */}
                <div className="flex items-center gap-3 px-5 py-3 bg-gray-50 border-b border-gray-100">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-violet-700 font-bold text-xs shrink-0">
                    {firma.nombre.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-800">{firma.nombre}</p>
                    <p className="text-xs text-gray-400">NIT {firma.nit}</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Users size={12} />
                    {usuarios.length}
                  </div>
                </div>

                {/* Usuarios */}
                <div className="divide-y divide-gray-50">
                  {usuarios.map((u) => (
                    <div key={u.id} className="flex items-center gap-4 px-5 py-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold shrink-0">
                        {u.nombre.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{u.nombre}</p>
                        <p className="text-xs text-gray-400">{u.email}</p>
                      </div>
                      <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full capitalize', ROL_BADGE[u.rol] ?? 'bg-gray-100 text-gray-600')}>
                        {u.rol}
                      </span>
                      <p className="text-xs text-gray-400 shrink-0">
                        {new Date(u.createdAt).toLocaleDateString('es-CO')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
