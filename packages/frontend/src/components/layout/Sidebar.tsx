import { NavLink, useNavigate } from 'react-router-dom'
import {
  Building2,
  ClipboardList,
  FileSearch,
  FileText,
  LayoutDashboard,
  LogOut,
  Users,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import { useAuthStore } from '../../store/auth.store'

const phases = [
  { label: 'Inicio', icon: LayoutDashboard, to: '/dashboard', enabled: true },
  { label: 'Firma', icon: Building2, to: '/firma', enabled: true },
  { label: 'Empresas', icon: Users, to: '/empresas', enabled: true },
  { label: 'Planificación', icon: ClipboardList, to: '/planificacion', enabled: false },
  { label: 'Ejecución', icon: FileSearch, to: '/ejecucion', enabled: false },
  { label: 'Informes', icon: FileText, to: '/informes', enabled: false },
]

export function Sidebar() {
  const { user, firma, logout } = useAuthStore()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <aside className="flex h-screen w-56 flex-col bg-gray-900 text-white">
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 py-5 border-b border-gray-700">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500 text-sm font-bold">
          A
        </div>
        <span className="text-lg font-semibold tracking-tight">AuditorYa</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {phases.map(({ label, icon: Icon, to, enabled }) =>
          enabled ? (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white',
                )
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ) : (
            <div
              key={to}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-gray-600 cursor-not-allowed select-none"
              title="Completa los pasos anteriores para desbloquear"
            >
              <Icon size={16} />
              {label}
              <span className="ml-auto text-xs">🔒</span>
            </div>
          ),
        )}
      </nav>

      {/* User */}
      <div className="border-t border-gray-700 px-4 py-4">
        <p className="text-xs text-gray-500 truncate mb-0.5">{firma?.nombre}</p>
        <p className="text-xs font-medium text-white truncate">{user?.nombre}</p>
        <p className="text-xs text-gray-500 truncate">{user?.email}</p>
        <button
          onClick={handleLogout}
          className="mt-3 flex items-center gap-2 text-xs text-gray-500 hover:text-red-400 transition-colors"
        >
          <LogOut size={13} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
