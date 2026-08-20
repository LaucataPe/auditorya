import { NavLink, useNavigate } from 'react-router-dom'
import { Building2, LayoutDashboard, ListTodo, LogOut, Users } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Isotipo } from '../ui/Logo'
import { useAuthStore } from '../../store/auth.store'
import { NotificacionesBell } from '../notificaciones/NotificacionesBell'

const nav = [
  { label: 'Inicio', icon: LayoutDashboard, to: '/dashboard' },
  { label: 'Mi trabajo', icon: ListTodo, to: '/mi-trabajo' },
  { label: 'Clientes', icon: Users, to: '/empresas' },
  { label: 'Mi firma', icon: Building2, to: '/firma' },
]

const ROL_LABEL: Record<string, string> = {
  socio: 'Socio',
  gerente: 'Gerente',
  senior: 'Senior',
  asistente: 'Asistente',
}

function iniciales(nombre?: string) {
  if (!nombre) return '?'
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}

export function Sidebar() {
  const { user, firma, logout } = useAuthStore()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <aside className="flex h-screen w-60 flex-col bg-slate-950 text-white">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <Isotipo className="h-8 w-8 rounded-lg shadow-[0_0_16px_rgba(139,92,246,0.35)]" />
        <div className="min-w-0">
          <span className="block text-[15px] font-semibold tracking-tight leading-tight">AuditorYa</span>
          <span className="block text-[11px] text-slate-500 truncate">{firma?.nombre}</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-3 pt-2">
        <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
          Espacio de trabajo
        </p>
        {nav.map(({ label, icon: Icon, to }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-white/10 text-white font-medium'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
              )
            }
          >
            <Icon size={16} strokeWidth={1.8} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="border-t border-white/10 px-4 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-slate-300">
            {iniciales(user?.nombre)}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-white truncate">{user?.nombre}</p>
            <p className="text-[11px] text-slate-500 truncate">
              {ROL_LABEL[user?.rol ?? ''] ?? user?.rol}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-0.5">
            <NotificacionesBell oscuro />
            <button
              onClick={handleLogout}
              title="Cerrar sesión"
              className="rounded-lg p-1.5 text-slate-500 hover:bg-white/5 hover:text-red-400 transition-colors"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}
