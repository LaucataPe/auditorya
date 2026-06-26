import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, CheckCircle, ChevronRight, UserCircle, Plus } from 'lucide-react'
import { useAuthStore } from '../store/auth.store'
import { api } from '../lib/api'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { cn } from '../lib/cn'

const STEPS = [
  { id: 1, label: 'Tu firma', description: 'Datos de la firma auditora', icon: Building2 },
  { id: 2, label: 'Tu cuenta', description: 'Socio responsable', icon: UserCircle },
  { id: 3, label: 'Primera empresa', description: 'Empresa cliente (opcional)', icon: Plus },
]

type FirmaData = { nombre: string; nit: string; ciudad: string }
type UsuarioData = { nombre: string; email: string; password: string; confirmPassword: string }
type EmpresaData = { nombre: string; nit: string; sector: string; marcoContable: string }

export function OnboardingPage() {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [firmaData, setFirmaData] = useState<FirmaData>({ nombre: '', nit: '', ciudad: '' })
  const [usuarioData, setUsuarioData] = useState<UsuarioData>({ nombre: '', email: '', password: '', confirmPassword: '' })
  const [empresaData, setEmpresaData] = useState<EmpresaData>({ nombre: '', nit: '', sector: '', marcoContable: 'NIIF' })
  const [skipEmpresa, setSkipEmpresa] = useState(false)

  const { register, completeOnboarding } = useAuthStore()
  const navigate = useNavigate()

  function validateStep(): string | null {
    if (step === 1) {
      if (!firmaData.nombre.trim()) return 'El nombre de la firma es requerido'
      if (!firmaData.nit.trim()) return 'El NIT es requerido'
      if (!firmaData.ciudad.trim()) return 'La ciudad es requerida'
    }
    if (step === 2) {
      if (!usuarioData.nombre.trim()) return 'Tu nombre es requerido'
      if (!usuarioData.email.trim()) return 'El correo es requerido'
      if (usuarioData.password.length < 8) return 'La contraseña debe tener al menos 8 caracteres'
      if (usuarioData.password !== usuarioData.confirmPassword) return 'Las contraseñas no coinciden'
    }
    if (step === 3 && !skipEmpresa) {
      if (!empresaData.nombre.trim()) return 'El nombre de la empresa es requerido'
      if (!empresaData.nit.trim()) return 'El NIT de la empresa es requerido'
      if (!empresaData.sector.trim()) return 'El sector es requerido'
    }
    return null
  }

  async function next() {
    setError(null)
    const validationError = validateStep()
    if (validationError) { setError(validationError); return }

    if (step < 3) { setStep(step + 1); return }

    // Paso 3: enviar todo
    setLoading(true)
    try {
      await register({
        firma: { nombre: firmaData.nombre, nit: firmaData.nit, ciudad: firmaData.ciudad },
        usuario: { nombre: usuarioData.nombre, email: usuarioData.email, password: usuarioData.password },
      })

      if (!skipEmpresa && empresaData.nombre) {
        await api.post('/empresas', {
          nombre: empresaData.nombre,
          nit: empresaData.nit,
          sector: empresaData.sector,
          marcoContable: empresaData.marcoContable,
        })
      }

      completeOnboarding()
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar')
    } finally {
      setLoading(false)
    }
  }

  function back() {
    setError(null)
    if (step > 1) setStep(step - 1)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white text-sm font-bold">A</div>
            <span className="text-lg font-semibold text-gray-900">AuditorYa</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Crea tu cuenta</h1>
          <p className="text-sm text-gray-500 mt-1">Solo toma unos minutos</p>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-center mb-8">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center">
              <div className="flex flex-col items-center gap-1.5">
                <div className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-all',
                  step > s.id ? 'bg-indigo-600 text-white'
                    : step === s.id ? 'bg-indigo-600 text-white ring-4 ring-indigo-100'
                    : 'bg-white border-2 border-gray-200 text-gray-400',
                )}>
                  {step > s.id ? <CheckCircle size={16} /> : s.id}
                </div>
                <span className={cn('text-xs font-medium', step >= s.id ? 'text-indigo-600' : 'text-gray-400')}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn('h-0.5 w-20 mx-2 mb-5 transition-all', step > s.id ? 'bg-indigo-600' : 'bg-gray-200')} />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {step === 1 && <StepFirma data={firmaData} onChange={setFirmaData} />}
          {step === 2 && <StepCuenta data={usuarioData} onChange={setUsuarioData} />}
          {step === 3 && (
            <StepEmpresa
              data={empresaData}
              onChange={setEmpresaData}
              skip={skipEmpresa}
              onToggleSkip={() => setSkipEmpresa(!skipEmpresa)}
            />
          )}

          {error && (
            <p className="mt-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-100">
            <Button variant="ghost" onClick={back} disabled={step === 1 || loading}>
              Atrás
            </Button>
            <Button onClick={next} loading={loading} className="gap-1">
              {step === 3 ? 'Crear cuenta' : 'Continuar'}
              {step < 3 && <ChevronRight size={16} />}
            </Button>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">Paso {step} de {STEPS.length}</p>

        <p className="text-center text-sm text-gray-500 mt-3">
          ¿Ya tienes cuenta?{' '}
          <button onClick={() => navigate('/login')} className="text-indigo-600 font-medium hover:underline">
            Inicia sesión
          </button>
        </p>
      </div>
    </div>
  )
}

// ─── Steps ────────────────────────────────────────────────────────────────────

function StepFirma({ data, onChange }: { data: FirmaData; onChange: (d: FirmaData) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Datos de la firma</h2>
        <p className="text-sm text-gray-500 mt-0.5">Esta información identifica tu firma auditora.</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Input
            id="firma-nombre" label="Razón social" placeholder="García & Asociados S.A.S"
            value={data.nombre} onChange={(e) => onChange({ ...data, nombre: e.target.value })}
          />
        </div>
        <Input
          id="firma-nit" label="NIT" placeholder="900.123.456-7"
          value={data.nit} onChange={(e) => onChange({ ...data, nit: e.target.value })}
        />
        <Input
          id="firma-ciudad" label="Ciudad" placeholder="Bogotá"
          value={data.ciudad} onChange={(e) => onChange({ ...data, ciudad: e.target.value })}
        />
      </div>
    </div>
  )
}

function StepCuenta({ data, onChange }: { data: UsuarioData; onChange: (d: UsuarioData) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Tu cuenta</h2>
        <p className="text-sm text-gray-500 mt-0.5">Serás el Socio Responsable de la firma.</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Input
            id="usuario-nombre" label="Nombre completo" placeholder="Carlos García"
            value={data.nombre} onChange={(e) => onChange({ ...data, nombre: e.target.value })}
          />
        </div>
        <div className="col-span-2">
          <Input
            id="usuario-email" label="Correo electrónico" type="email" placeholder="carlos@garcia.co"
            value={data.email} onChange={(e) => onChange({ ...data, email: e.target.value })}
          />
        </div>
        <Input
          id="usuario-password" label="Contraseña" type="password" placeholder="Mínimo 8 caracteres"
          value={data.password} onChange={(e) => onChange({ ...data, password: e.target.value })}
        />
        <Input
          id="usuario-confirm" label="Confirmar contraseña" type="password" placeholder="••••••••"
          value={data.confirmPassword} onChange={(e) => onChange({ ...data, confirmPassword: e.target.value })}
        />
      </div>
    </div>
  )
}

function StepEmpresa({
  data, onChange, skip, onToggleSkip,
}: {
  data: EmpresaData
  onChange: (d: EmpresaData) => void
  skip: boolean
  onToggleSkip: () => void
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Primera empresa cliente</h2>
        <p className="text-sm text-gray-500 mt-0.5">Puedes agregarla ahora o hacerlo después.</p>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={skip}
          onChange={onToggleSkip}
          className="h-4 w-4 rounded border-gray-300 text-indigo-600"
        />
        <span className="text-sm text-gray-600">Omitir por ahora, lo haré después</span>
      </label>

      {!skip && (
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Input
              id="empresa-nombre" label="Razón social" placeholder="Comercializadora XYZ S.A.S"
              value={data.nombre} onChange={(e) => onChange({ ...data, nombre: e.target.value })}
            />
          </div>
          <Input
            id="empresa-nit" label="NIT" placeholder="800.456.789-1"
            value={data.nit} onChange={(e) => onChange({ ...data, nit: e.target.value })}
          />
          <Input
            id="empresa-sector" label="Sector económico" placeholder="Comercio"
            value={data.sector} onChange={(e) => onChange({ ...data, sector: e.target.value })}
          />
          <div className="col-span-2">
            <Select
              id="empresa-marco" label="Marco contable"
              value={data.marcoContable}
              onChange={(e) => onChange({ ...data, marcoContable: e.target.value })}
              options={[
                { value: 'NIIF', label: 'NIIF (Grupo 1)' },
                { value: 'NIIF_PYMES', label: 'NIIF para Pymes (Grupo 2)' },
                { value: 'PCGA', label: 'PCGA (Grupo 3)' },
              ]}
            />
          </div>
        </div>
      )}
    </div>
  )
}
