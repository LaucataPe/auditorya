import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  BrainCircuit,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FolderLock,
  ListChecks,
  ShieldCheck,
} from 'lucide-react'
import { useAuthStore } from '../store/auth.store'
import { Button } from '../components/ui/Button'
import { Logo, Isotipo } from '../components/ui/Logo'

const CARACTERISTICAS = [
  {
    icon: ClipboardCheck,
    titulo: 'Planificación NIA completa',
    texto:
      'Carta de encargo, entendimiento del cliente, control interno COSO, riesgos por área, materialidad y memo de planeación (NIA 210, 315, 320 y 300).',
  },
  {
    icon: ListChecks,
    titulo: 'Del riesgo a la evidencia',
    texto:
      'Cada riesgo genera pruebas, cada prueba pide sus documentos al cliente (PBC) y la evidencia queda atada al papel de trabajo. El hilo completo, sin hojas sueltas.',
  },
  {
    icon: FolderLock,
    titulo: 'Papeles de trabajo ordenados',
    texto:
      'Índices por área con consecutivo (NIA 230), notas de revisión del socio (NIA 220) y archivos servidos siempre con URL firmada, nunca públicos.',
  },
  {
    icon: FileCheck2,
    titulo: 'Informes listos para firmar',
    texto:
      'Dictamen (NIA 700), carta de control interno (NIA 265) y carta de representaciones (NIA 580), exportables a PDF y Word con el membrete de tu firma.',
  },
  {
    icon: BrainCircuit,
    titulo: 'Asistente con IA',
    texto:
      'Sugerencia de riesgos con el contexto real del encargo, análisis analítico del balance (NIA 520) y un asistente NIA conversacional para el equipo.',
  },
  {
    icon: ShieldCheck,
    titulo: 'Pista de auditoría inmutable',
    texto:
      'Quién hizo qué y cuándo: cada aprobación, importación y acción de IA queda registrada. Tu trabajo resiste una revisión de calidad.',
  },
]

const FASES = [
  {
    numero: '1',
    titulo: 'Acepta el encargo',
    texto: 'Empresa, independencia y conflictos antes de empezar.',
    normas: 'NIA 210 · Código de Ética IESBA',
    detalle:
      'Antes de firmar nada, evalúas si puedes tomar el encargo: registras la empresa cliente con su NIT, sector y marco contable, y respondes la evaluación de independencia y conflictos de interés. Solo si el encargo queda aceptado el sistema te deja crear la auditoría.',
    pasos: [
      'Registra la empresa cliente (NIT, sector, marco contable)',
      'Evalúa independencia y conflictos de interés',
      'Acepta el encargo y crea la auditoría del período',
      'Genera la carta de encargo (NIA 210)',
    ],
  },
  {
    numero: '2',
    titulo: 'Planea',
    texto: 'Riesgos, materialidad, COSO y memo de planeación.',
    normas: 'NIA 300 · 315 · 320 · 520',
    detalle:
      'Aquí construyes el mapa del encargo: entiendes el negocio, cargas el balance de prueba, evalúas el control interno con los 5 componentes COSO e identificas los riesgos por área con su respuesta planeada. Al calcular la materialidad y aprobarla, se desbloquea la ejecución.',
    pasos: [
      'Entendimiento del cliente y su entorno (NIA 315)',
      'Balance de prueba + analíticos preliminares (NIA 520)',
      'Control interno COSO y riesgos por área',
      'Materialidad (NIA 320), cronograma y memo de planeación (NIA 300)',
    ],
  },
  {
    numero: '3',
    titulo: 'Ejecuta',
    texto: 'Pruebas, PBC y papeles de trabajo con evidencia.',
    normas: 'NIA 230 · 330 · 500',
    detalle:
      'Cada riesgo identificado se convierte en pruebas concretas, y cada prueba pide sus documentos al cliente (PBC). Cuando llega el documento, queda adjunto como evidencia del papel de trabajo — el hilo riesgo → prueba → evidencia se arma solo, y el socio revisa con notas de revisión.',
    pasos: [
      'Asigna tareas al equipo por área',
      'Diseña pruebas desde los riesgos (NIA 330/500)',
      'Solicita documentos al cliente (PBC) y adjunta evidencia',
      'Papeles de trabajo con índices por área y notas de revisión (NIA 230/220)',
    ],
  },
  {
    numero: '4',
    titulo: 'Informa y cierra',
    texto: 'Dictamen, cartas y cierre del socio (NIA 560/570/220).',
    normas: 'NIA 700 · 265 · 580 · 560 · 570',
    detalle:
      'Con la evidencia completa generas el dictamen y las cartas, exportables a PDF y Word con el membrete de tu firma. El cierre exige el checklist de hechos posteriores, negocio en marcha y revisión de calidad — y el socio no puede cerrar si quedan notas de revisión abiertas.',
    pasos: [
      'Dictamen (NIA 700) con editor enriquecido',
      'Carta de control interno (NIA 265) y de representaciones (NIA 580)',
      'Checklist de cierre: hechos posteriores y negocio en marcha (NIA 560/570)',
      'Cierre del socio con revisión de calidad (NIA 220)',
    ],
  },
]

export function LandingPage() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuthStore()
  const [faseActiva, setFaseActiva] = useState(0)
  const fase = FASES[faseActiva]

  const irAlPanel = () => navigate(isAuthenticated ? '/dashboard' : '/onboarding')

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-gray-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center">
            <Logo className="h-9 w-auto" />
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-gray-600 sm:flex">
            <a href="#caracteristicas" className="hover:text-gray-900">Características</a>
            <a href="#como-funciona" className="hover:text-gray-900">Cómo funciona</a>
          </nav>
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <Button size="sm" onClick={() => navigate('/dashboard')}>Ir al panel</Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>
                  Ingresar
                </Button>
                <Button size="sm" onClick={() => navigate('/onboarding')}>
                  Registra tu firma
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pb-20 pt-16 text-center sm:px-6 sm:pt-24">
        <span className="inline-flex items-center rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
          Revisoría Fiscal (NIA) · Auditoría Interna (IIA IPPF)
        </span>
        <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          La auditoría de tu firma, de la planeación al dictamen
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-600">
          AuditorYa acompaña a las firmas auditoras colombianas en todo el encargo: riesgos,
          materialidad, papeles de trabajo, evidencia e informes — con la norma como guía en cada paso.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button size="lg" onClick={irAlPanel}>
            {isAuthenticated ? 'Ir al panel' : 'Comienza ahora'}
          </Button>
          <Button variant="secondary" size="lg" onClick={() => navigate('/login')}>
            Ya tengo cuenta
          </Button>
        </div>
        <p className="mt-4 text-sm text-gray-500">
          Multiusuario por firma · Encargos por empresa y período · Español, pensado para Colombia
        </p>
      </section>

      {/* Características */}
      <section id="caracteristicas" className="border-t border-gray-100 bg-gray-50 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-semibold tracking-tight">
            Todo el encargo en un solo lugar
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-gray-600">
            Deja las plantillas de Excel dispersas: el hilo riesgo → prueba → documentos → evidencia →
            conclusión vive en un solo sistema.
          </p>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {CARACTERISTICAS.map(({ icon: Icon, titulo, texto }) => (
              <div key={titulo} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-semibold">{titulo}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section id="como-funciona" className="py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-semibold tracking-tight">
            Una guía por fases que no te suelta
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-gray-600">
            El sistema calcula en qué fase vas, tu porcentaje de avance y el siguiente paso del encargo.
          </p>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FASES.map(({ numero, titulo, texto }, i) => {
              const activa = i === faseActiva
              return (
                <button
                  key={numero}
                  type="button"
                  onClick={() => setFaseActiva(i)}
                  aria-expanded={activa}
                  className={`rounded-2xl border p-6 text-left transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                    activa
                      ? 'border-indigo-600 bg-indigo-50/60 shadow-card'
                      : 'border-gray-100 bg-white hover:border-indigo-200 hover:shadow-card'
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                      activa ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {numero}
                  </span>
                  <h3 className="mt-4 font-semibold">{titulo}</h3>
                  <p className="mt-2 text-sm text-gray-600">{texto}</p>
                </button>
              )
            })}
          </div>

          {/* Detalle de la fase seleccionada */}
          <div
            key={fase.numero}
            className="mt-6 animate-slide-up rounded-2xl border border-indigo-100 bg-indigo-50/40 p-6 sm:p-8"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-lg font-semibold">
                Fase {fase.numero} · {fase.titulo}
              </h3>
              <span className="inline-flex w-fit items-center rounded-full bg-white px-3 py-1 text-xs font-medium text-indigo-700 ring-1 ring-indigo-100">
                {fase.normas}
              </span>
            </div>
            <p className="mt-3 max-w-3xl leading-relaxed text-gray-700">{fase.detalle}</p>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {fase.pasos.map((paso) => (
                <li key={paso} className="flex items-start gap-2 text-sm text-gray-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                  {paso}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="px-4 pb-20 sm:px-6">
        <div className="mx-auto max-w-6xl rounded-3xl bg-[#2a1240] px-6 py-16 text-center text-white sm:px-12">
          <Isotipo className="mx-auto h-12 w-12" />
          <h2 className="mt-6 text-3xl font-semibold tracking-tight">
            Empieza tu próximo encargo en AuditorYa
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-indigo-100">
            Registra tu firma, invita a tu equipo y crea tu primera empresa cliente en minutos.
          </p>
          <div className="mt-8">
            <Button
              size="lg"
              className="bg-white text-[#2a1240] hover:bg-indigo-50"
              onClick={irAlPanel}
            >
              {isAuthenticated ? 'Ir al panel' : 'Registra tu firma'}
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-gray-500 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <Isotipo className="h-6 w-6" />
            <span>AuditorYa · Software de auditoría para firmas colombianas</span>
          </div>
          <div className="flex items-center gap-6">
            <Link to="/login" className="hover:text-gray-900">Ingresar</Link>
            <Link to="/onboarding" className="hover:text-gray-900">Registra tu firma</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
