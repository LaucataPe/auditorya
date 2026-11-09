import { Suspense, lazy, useEffect, type ComponentType } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from './store/auth.store'
import { EVENTO_SESION_EXPIRADA } from './lib/api'
import { toast } from './store/toast.store'
import { Toaster } from './components/ui/Toaster'
import { ConfirmDialog } from './components/ui/ConfirmDialog'
import { ErrorBoundary } from './components/ui/ErrorBoundary'

// La landing (/) carga eager para que la primera visita solo descargue su código; el resto
// de la app se divide por ruta y se descarga al entrar (ver docs/landing.md → Rendimiento).
import { LandingPage } from './pages/LandingPage'

const AppLayout = lazy(() => import('./components/layout/AppLayout').then((m) => ({ default: m.AppLayout })))
const EmpresaLayout = lazy(() => import('./components/empresa/EmpresaLayout').then((m) => ({ default: m.EmpresaLayout })))
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })))
const OnboardingPage = lazy(() => import('./pages/OnboardingPage').then((m) => ({ default: m.OnboardingPage })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const MiTrabajoPage = lazy(() => import('./pages/MiTrabajoPage').then((m) => ({ default: m.MiTrabajoPage })))
const FirmaPage = lazy(() => import('./pages/FirmaPage').then((m) => ({ default: m.FirmaPage })))
const EmpresasPage = lazy(() => import('./pages/EmpresasPage').then((m) => ({ default: m.EmpresasPage })))
const SuperadminLayout = lazy(() => import('./components/superadmin/SuperadminLayout').then((m) => ({ default: m.SuperadminLayout })))
const SuperadminLogin = lazy(() => import('./pages/superadmin/SuperadminLogin').then((m) => ({ default: m.SuperadminLogin })))
const SuperadminFirmas = lazy(() => import('./pages/superadmin/SuperadminFirmas').then((m) => ({ default: m.SuperadminFirmas })))
const SuperadminUsuarios = lazy(() => import('./pages/superadmin/SuperadminUsuarios').then((m) => ({ default: m.SuperadminUsuarios })))
const SuperadminPermisos = lazy(() => import('./pages/superadmin/SuperadminPermisos').then((m) => ({ default: m.SuperadminPermisos })))
const SuperadminPrefijos = lazy(() => import('./pages/superadmin/SuperadminPrefijos').then((m) => ({ default: m.SuperadminPrefijos })))
const EmpresaDashboard = lazy(() => import('./pages/empresa/EmpresaDashboard').then((m) => ({ default: m.EmpresaDashboard })))
const EmpresaEncargos = lazy(() => import('./pages/empresa/EmpresaEncargos').then((m) => ({ default: m.EmpresaEncargos })))
const EmpresaArranque = lazy(() => import('./pages/empresa/EmpresaArranque').then((m) => ({ default: m.EmpresaArranque })))
const EmpresaAuditoria = lazy(() => import('./pages/empresa/EmpresaAuditoria').then((m) => ({ default: m.EmpresaAuditoria })))
const EmpresaPapel = lazy(() => import('./pages/empresa/EmpresaPapel').then((m) => ({ default: m.EmpresaPapel })))
const EmpresaDocumentos = lazy(() => import('./pages/empresa/EmpresaDocumentos').then((m) => ({ default: m.EmpresaDocumentos })))
const EmpresaInformacion = lazy(() => import('./pages/empresa/EmpresaInformacion').then((m) => ({ default: m.EmpresaInformacion })))
const EmpresaTributario = lazy(() => import('./pages/empresa/EmpresaTributario').then((m) => ({ default: m.EmpresaTributario })))
const EmpresaTributarioRevision = lazy(() => import('./pages/empresa/EmpresaTributarioRevision').then((m) => ({ default: m.EmpresaTributarioRevision })))

/** Spinner mientras se descarga el código de una ruta (o se verifica la sesión). */
function Cargando({ completa = true }: { completa?: boolean }) {
  return (
    <div className={completa ? 'min-h-screen flex items-center justify-center bg-gray-50' : 'flex min-h-[40vh] items-center justify-center'}>
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
    </div>
  )
}

/**
 * Ruta con carga diferida. Cada una lleva su propio Suspense: así, al navegar dentro de un
 * layout, solo el contenido espera y el layout (sidebar, encabezado) no desaparece.
 */
function L({ c: C, completa = false }: { c: ComponentType; completa?: boolean }) {
  return (
    <Suspense fallback={<Cargando completa={completa} />}>
      <C />
    </Suspense>
  )
}

function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, onboardingComplete } = useAuthStore()
  // Si ya completó el onboarding no tiene sentido volver aquí
  if (isAuthenticated && onboardingComplete) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

/** Al expirar la sesión (401 en cualquier petición), limpia el estado y vuelve al login. */
function useSesionExpirada() {
  const navigate = useNavigate()
  useEffect(() => {
    const handler = () => {
      useAuthStore.setState({ isAuthenticated: false, onboardingComplete: false, user: null, firma: null })
      toast.error('Tu sesión expiró. Inicia sesión de nuevo.')
      navigate('/login', { replace: true })
    }
    window.addEventListener(EVENTO_SESION_EXPIRADA, handler)
    return () => window.removeEventListener(EVENTO_SESION_EXPIRADA, handler)
  }, [navigate])
}

export default function App() {
  const { checkSession, sessionChecked } = useAuthStore()
  const { pathname } = useLocation()
  useSesionExpirada()

  useEffect(() => {
    checkSession()
  }, [checkSession])

  // Espera el check inicial antes de renderizar rutas para evitar flash. La landing es
  // pública y no depende de la sesión: se pinta de inmediato aunque el backend tarde.
  if (!sessionChecked && pathname !== '/') {
    return <Cargando />
  }

  return (
    <ErrorBoundary>
    <Toaster />
    <ConfirmDialog />
    <Routes>
      {/* Public */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<L c={LoginPage} completa />} />
      <Route
        path="/onboarding"
        element={
          <OnboardingGuard>
            <L c={OnboardingPage} completa />
          </OnboardingGuard>
        }
      />

      {/* Admin panel */}
      <Route element={<L c={AppLayout} completa />}>
        <Route path="/dashboard" element={<L c={DashboardPage} />} />
        <Route path="/mi-trabajo" element={<L c={MiTrabajoPage} />} />
        <Route path="/firma" element={<L c={FirmaPage} />} />
        <Route path="/empresas" element={<L c={EmpresasPage} />} />
      </Route>

      {/* Empresa panel — layout propio por empresa */}
      <Route path="/empresas/:id" element={<L c={EmpresaLayout} completa />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<L c={EmpresaDashboard} />} />
        <Route path="encargos" element={<L c={EmpresaEncargos} />} />
        <Route path="encargos/:auditoriaId" element={<L c={EmpresaAuditoria} />} />
        <Route path="encargos/:auditoriaId/arranque" element={<L c={EmpresaArranque} />} />
        <Route path="encargos/:auditoriaId/papeles/:papelId" element={<L c={EmpresaPapel} />} />
        <Route path="evaluacion" element={<Navigate to="../informacion" replace />} />
        <Route path="documentos" element={<L c={EmpresaDocumentos} />} />
        <Route path="informacion" element={<L c={EmpresaInformacion} />} />
        <Route path="tributario" element={<L c={EmpresaTributario} />} />
        <Route path="tributario/:revisionId" element={<L c={EmpresaTributarioRevision} />} />
      </Route>

      {/* Superadmin */}
      <Route path="/superadmin/login" element={<L c={SuperadminLogin} completa />} />
      <Route path="/superadmin" element={<L c={SuperadminLayout} completa />}>
        <Route index element={<Navigate to="firmas" replace />} />
        <Route path="firmas" element={<L c={SuperadminFirmas} />} />
        <Route path="usuarios" element={<L c={SuperadminUsuarios} />} />
        <Route path="permisos" element={<L c={SuperadminPermisos} />} />
        <Route path="prefijos" element={<L c={SuperadminPrefijos} />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </ErrorBoundary>
  )
}
