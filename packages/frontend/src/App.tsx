import { useEffect } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { useAuthStore } from './store/auth.store'
import { EVENTO_SESION_EXPIRADA } from './lib/api'
import { toast } from './store/toast.store'
import { Toaster } from './components/ui/Toaster'
import { ErrorBoundary } from './components/ui/ErrorBoundary'

// Guards & layouts
import { AppLayout } from './components/layout/AppLayout'
import { EmpresaLayout } from './components/empresa/EmpresaLayout'

// Auth pages
import { LoginPage } from './pages/LoginPage'
import { OnboardingPage } from './pages/OnboardingPage'

// Admin panel pages
import { DashboardPage } from './pages/DashboardPage'
import { FirmaPage } from './pages/FirmaPage'
import { EmpresasPage } from './pages/EmpresasPage'

// Superadmin
import { SuperadminLayout } from './components/superadmin/SuperadminLayout'
import { SuperadminLogin } from './pages/superadmin/SuperadminLogin'
import { SuperadminFirmas } from './pages/superadmin/SuperadminFirmas'
import { SuperadminUsuarios } from './pages/superadmin/SuperadminUsuarios'
import { SuperadminPermisos } from './pages/superadmin/SuperadminPermisos'

// Empresa panel pages
import { EmpresaDashboard } from './pages/empresa/EmpresaDashboard'
import { EmpresaEncargos } from './pages/empresa/EmpresaEncargos'
import { EmpresaAuditoria } from './pages/empresa/EmpresaAuditoria'
import { EmpresaPapel } from './pages/empresa/EmpresaPapel'
import { EmpresaEvaluacion } from './pages/empresa/EmpresaEvaluacion'
import { EmpresaDocumentos } from './pages/empresa/EmpresaDocumentos'
import { EmpresaInformacion } from './pages/empresa/EmpresaInformacion'

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
  useSesionExpirada()

  useEffect(() => {
    checkSession()
  }, [checkSession])

  // Espera el check inicial antes de renderizar rutas para evitar flash
  if (!sessionChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <ErrorBoundary>
    <Toaster />
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/onboarding"
        element={
          <OnboardingGuard>
            <OnboardingPage />
          </OnboardingGuard>
        }
      />

      {/* Admin panel */}
      <Route element={<AppLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/firma" element={<FirmaPage />} />
        <Route path="/empresas" element={<EmpresasPage />} />
      </Route>

      {/* Empresa panel — layout propio por empresa */}
      <Route path="/empresas/:id" element={<EmpresaLayout />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<EmpresaDashboard />} />
        <Route path="encargos" element={<EmpresaEncargos />} />
        <Route path="encargos/:auditoriaId" element={<EmpresaAuditoria />} />
        <Route path="encargos/:auditoriaId/papeles/:papelId" element={<EmpresaPapel />} />
        <Route path="evaluacion" element={<EmpresaEvaluacion />} />
        <Route path="documentos" element={<EmpresaDocumentos />} />
        <Route path="informacion" element={<EmpresaInformacion />} />
      </Route>

      {/* Superadmin */}
      <Route path="/superadmin/login" element={<SuperadminLogin />} />
      <Route path="/superadmin" element={<SuperadminLayout />}>
        <Route index element={<Navigate to="firmas" replace />} />
        <Route path="firmas" element={<SuperadminFirmas />} />
        <Route path="usuarios" element={<SuperadminUsuarios />} />
        <Route path="permisos" element={<SuperadminPermisos />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
    </ErrorBoundary>
  )
}
