import { useEffect } from 'react'
import { Outlet, Navigate, useNavigate } from 'react-router-dom'
import { Building2, LogOut, ShieldCheck, Users } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { useSuperadminStore } from '../../store/superadmin.store'

const navItems = [
  { label: 'Firmas', icon: Building2, to: '/superadmin/firmas' },
  { label: 'Usuarios', icon: Users, to: '/superadmin/usuarios' },
]

export function SuperadminLayout() {
  const { isAuthenticated, sessionChecked, checkSession, logout } = useSuperadminStore()
  const navigate = useNavigate()

  useEffect(() => {
    checkSession()
  }, [checkSession])

  if (!sessionChecked) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
      </div>
    )
  }

  if (!isAuthenticated) return <Navigate to="/superadmin/login" replace />

  async function handleLogout() {
    await logout()
    navigate('/superadmin/login')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <aside className="flex h-screen w-52 flex-col bg-slate-900 text-white shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-slate-700">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500 shrink-0">
            <ShieldCheck size={15} />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">AuditorYa</p>
            <p className="text-xs text-slate-400">Superadmin</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {navItems.map(({ label, icon: Icon, to }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                  isActive
                    ? 'bg-violet-600 text-white'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white',
                )
              }
            >
              <Icon size={15} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-700 px-4 py-4">
          <p className="text-xs text-slate-400 mb-2">superadmin@auditorya.co</p>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-xs text-slate-500 hover:text-red-400 transition-colors"
          >
            <LogOut size={13} /> Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
