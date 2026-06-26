import { Outlet, useParams, Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../../store/auth.store'
import { EmpresaSidebar } from './EmpresaSidebar'
import { api } from '../../lib/api'

type Empresa = {
  id: string
  nombre: string
  nit: string
  sector: string
  marcoContable: string
  estadoEncargo: string
  createdAt: string
}

export function EmpresaLayout() {
  const { id } = useParams<{ id: string }>()
  const { isAuthenticated } = useAuthStore()

  const { data: empresa, isLoading, isError } = useQuery<Empresa>({
    queryKey: ['empresa', id],
    queryFn: () => api.get<Empresa>(`/empresas/${id}`),
    enabled: !!id && isAuthenticated,
    retry: false,
  })

  if (!isAuthenticated) return <Navigate to="/login" replace />

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    )
  }

  if (isError || !empresa) return <Navigate to="/empresas" replace />

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <EmpresaSidebar empresa={empresa} />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
