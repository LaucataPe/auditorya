import { ArrowRight, Building2, CheckCircle, Circle, ClipboardList, FileSearch, FileText, TrendingUp, Users } from 'lucide-react'
import { useAuthStore } from '../store/auth.store'
import { Button } from '../components/ui/Button'

const stats = [
  { label: 'Empresas clientes', value: '1', icon: Building2, color: 'bg-indigo-50 text-indigo-600' },
  { label: 'Auditorías activas', value: '0', icon: ClipboardList, color: 'bg-amber-50 text-amber-600' },
  { label: 'Encargos pendientes', value: '1', icon: FileSearch, color: 'bg-rose-50 text-rose-600' },
  { label: 'Informes emitidos', value: '0', icon: FileText, color: 'bg-emerald-50 text-emerald-600' },
]

const checklist = [
  { label: 'Firma registrada', done: true, href: '/firma' },
  { label: 'Declaración de liderazgo completada', done: false, href: '/firma' },
  { label: 'Política de independencia cargada', done: false, href: '/firma' },
  { label: 'Código de ética registrado', done: false, href: '/firma' },
  { label: 'Primera empresa cliente creada', done: true, href: '/empresas' },
  { label: 'Encargo de auditoría aceptado', done: false, href: '/empresas' },
  { label: 'Primera auditoría planificada', done: false, href: '/planificacion' },
]

const phases = [
  { num: 1, label: 'Firma', icon: Building2, status: 'active', to: '/firma' },
  { num: 2, label: 'Empresas', icon: Users, status: 'locked' },
  { num: 3, label: 'Planificación', icon: ClipboardList, status: 'locked' },
  { num: 4, label: 'Ejecución', icon: FileSearch, status: 'locked' },
  { num: 5, label: 'Informes', icon: FileText, status: 'locked' },
]

const completed = checklist.filter((c) => c.done).length
const progress = Math.round((completed / checklist.length) * 100)

export function DashboardPage() {
  const { user } = useAuthStore()

  return (
    <div className="p-8 space-y-8 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Hola, {user?.nombre?.split(' ')[0]}
        </h1>
        <p className="text-sm text-gray-500 mt-1">Aquí tienes el resumen de tu práctica auditora.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {stats.map((s) => {
          const Icon = s.icon
          return (
            <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className={`inline-flex p-2 rounded-lg ${s.color} mb-3`}>
                <Icon size={18} />
              </div>
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* Checklist */}
        <div className="col-span-3 bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-gray-900">Configuración inicial</h2>
            <span className="text-sm font-medium text-indigo-600">{completed}/{checklist.length}</span>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-gray-100 rounded-full h-1.5 mb-5">
            <div
              className="bg-indigo-600 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>

          <ul className="space-y-3">
            {checklist.map((item) => (
              <li key={item.label} className="flex items-center gap-3">
                {item.done ? (
                  <CheckCircle size={17} className="text-indigo-600 shrink-0" />
                ) : (
                  <Circle size={17} className="text-gray-300 shrink-0" />
                )}
                <span className={`text-sm ${item.done ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Phases progress */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <TrendingUp size={16} className="text-indigo-600" />
            <h2 className="font-semibold text-gray-900">Fases del encargo</h2>
          </div>
          <div className="space-y-2">
            {phases.map((p) => {
              const Icon = p.icon
              const isActive = p.status === 'active'
              return (
                <div
                  key={p.num}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${
                    isActive ? 'bg-indigo-50' : 'bg-gray-50'
                  }`}
                >
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-lg shrink-0 ${
                      isActive ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-400'
                    }`}
                  >
                    <Icon size={13} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${isActive ? 'text-indigo-700' : 'text-gray-400'}`}>
                      {p.label}
                    </p>
                  </div>
                  {isActive && (
                    <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded-full shrink-0">
                      Activa
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          <Button size="sm" variant="secondary" className="w-full mt-4 gap-1">
            Ir a Firma <ArrowRight size={13} />
          </Button>
        </div>
      </div>
    </div>
  )
}
