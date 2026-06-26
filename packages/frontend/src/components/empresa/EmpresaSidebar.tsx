import { NavLink, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  CheckSquare,
  ClipboardList,
  FileText,
  Info,
  LayoutDashboard,
} from 'lucide-react'
import { cn } from '../../lib/cn'

type Empresa = {
  id: string
  nombre: string
  nit: string
  sector: string
  marcoContable: string
  estadoEncargo: string
}

const navItems = (id: string) => [
  { label: 'Dashboard', icon: LayoutDashboard, to: `/empresas/${id}/dashboard` },
  { label: 'Encargos', icon: ClipboardList, to: `/empresas/${id}/encargos` },
  { label: 'Evaluación', icon: CheckSquare, to: `/empresas/${id}/evaluacion` },
  { label: 'Documentos', icon: FileText, to: `/empresas/${id}/documentos` },
  { label: 'Información', icon: Info, to: `/empresas/${id}/informacion` },
]

const MARCO_LABEL: Record<string, string> = {
  NIIF: 'NIIF (Grupo 1)',
  NIIF_PYMES: 'NIIF Pymes (Grupo 2)',
  PCGA: 'PCGA (Grupo 3)',
}

export function EmpresaSidebar({ empresa }: { empresa: Empresa }) {
  const navigate = useNavigate()

  return (
    <aside className="flex h-screen w-56 flex-col bg-white border-r border-gray-200 shrink-0">
      {/* Back to admin */}
      <button
        onClick={() => navigate('/empresas')}
        className="flex items-center gap-2 px-4 py-3 text-xs text-gray-400 hover:text-indigo-600 hover:bg-gray-50 transition-colors border-b border-gray-100"
      >
        <ArrowLeft size={13} />
        Panel de firmas
      </button>

      {/* Company identity */}
      <div className="px-4 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white font-bold text-sm shrink-0">
            {empresa.nombre.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 leading-tight truncate">
              {empresa.nombre}
            </p>
            <p className="text-xs text-gray-400 truncate">{empresa.nit}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5">
        {navItems(empresa.id).map(({ label, icon: Icon, to }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                isActive
                  ? 'bg-indigo-50 text-indigo-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
              )
            }
          >
            <Icon size={15} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Sector badge */}
      <div className="px-4 py-4 border-t border-gray-100">
        <p className="text-xs text-gray-400">Sector</p>
        <p className="text-xs font-medium text-gray-600 mt-0.5">{empresa.sector}</p>
        <p className="text-xs text-gray-400 mt-2">Marco contable</p>
        <p className="text-xs font-medium text-gray-600 mt-0.5">{MARCO_LABEL[empresa.marcoContable] ?? empresa.marcoContable}</p>
      </div>
    </aside>
  )
}
