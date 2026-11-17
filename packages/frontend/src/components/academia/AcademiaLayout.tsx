import { useEffect, useState, type ReactNode } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ArrowRight, Lock, Trash2 } from 'lucide-react'
import { Logo } from '../ui/Logo'
import { Modal } from '../ui/Modal'
import { activarApiDemo } from '../../lib/api'
import { EVENTO_FUNCION_BLOQUEADA, servidorDemo } from '../../lib/academia-demo'
import { rastrear } from '../../lib/analitica'
import { cn } from '../../lib/cn'
import { useAuthStore } from '../../store/auth.store'
import { MENSAJES_WHATSAPP, destinoContacto } from '../landing/contenido'
import { BotonExpediente, Expediente } from './Expediente'
import { AccesoCurso } from './AccesoCurso'
import { useRegistroAcademiaStore } from '../../store/academia.store'
import { confirmar } from '../../store/confirm.store'

const DESTINO_CONTACTO = destinoContacto(MENSAJES_WHATSAPP.academia, 'AuditorYa para mi firma (desde la Academia)')

/** Enlace a la conversación comercial: WhatsApp, correo o la sección de contacto, con su evento. */
function EnlaceContacto({ ubicacion, className, children }: { ubicacion: string; className?: string; children: ReactNode }) {
  const externo = /^https?:\/\//.test(DESTINO_CONTACTO)
  return (
    <a
      href={DESTINO_CONTACTO}
      target={externo ? '_blank' : undefined}
      rel={externo ? 'noopener noreferrer' : undefined}
      onClick={() => rastrear('academia_cta', { ubicacion })}
      className={className}
    >
      {children}
    </a>
  )
}

/** Todo lo que el curso guarda en el navegador: progreso, registro de acceso y encargo de práctica. */
const CLAVES_ACADEMIA = ['auditorya.academia.v1', 'auditorya.academia.registro.v1', 'auditorya.academia.encargo.v1']

/**
 * Herramienta interna para probar el curso como alguien nuevo: borra los datos de la Academia en
 * este navegador y recarga. Solo aparece en desarrollo o con `?interno` en la URL.
 */
function BotonBorrarDatos() {
  const visible = import.meta.env.DEV || new URLSearchParams(window.location.search).has('interno')
  if (!visible) return null

  async function borrar() {
    const ok = await confirmar({
      titulo: 'Borrar los datos del curso',
      descripcion: 'Se borran de este navegador el registro de acceso, el avance y el encargo de práctica. Lo que ya llegó a n8n no se toca.',
      confirmar: 'Borrar y recargar',
    })
    if (!ok) return
    for (const clave of CLAVES_ACADEMIA) {
      try {
        localStorage.removeItem(clave)
      } catch {
        // Sin acceso al almacenamiento: no hay nada que borrar.
      }
    }
    window.location.assign('/academia')
  }

  return (
    <button
      type="button"
      onClick={borrar}
      className="fixed bottom-24 left-4 z-40 inline-flex lg:bottom-4 items-center gap-1.5 rounded-full border border-dashed border-slate-300 bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm backdrop-blur hover:border-rose-300 hover:text-rose-700"
    >
      <Trash2 size={12} /> Borrar datos del curso <span className="text-slate-400">· interno</span>
    </button>
  )
}

/** Invitación a la versión completa cuando el curso intenta algo que solo hace AuditorYa real. */
function AvisoVersionCompleta() {
  const [abierto, setAbierto] = useState(false)
  useEffect(() => {
    const alBloquear = (e: Event) => {
      rastrear('academia_funcion_bloqueada', { ruta: (e as CustomEvent<{ ruta: string }>).detail?.ruta })
      setAbierto(true)
    }
    window.addEventListener(EVENTO_FUNCION_BLOQUEADA, alBloquear)
    return () => window.removeEventListener(EVENTO_FUNCION_BLOQUEADA, alBloquear)
  }, [])

  return (
    <Modal open={abierto} onClose={() => setAbierto(false)} title="Esto lo hace la versión completa" size="sm">
      <div className="space-y-4">
        <div className="flex gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
            <Lock size={16} />
          </span>
          <p className="text-sm text-slate-600">
            En el curso practicas sobre un encargo simulado. Aprobar como socio, usar la IA, importar balances y subir
            evidencia funcionan en AuditorYa, con los encargos reales de tu firma.
          </p>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => setAbierto(false)}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Seguir con el curso
          </button>
          <EnlaceContacto
            ubicacion="aviso_funcion_bloqueada"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
          >
            Quiero verlo con mi firma <ArrowRight size={14} />
          </EnlaceContacto>
        </div>
      </div>
    </Modal>
  )
}

/**
 * Layout público de AuditorYa Academia (lead magnet, sin cuenta). Todo lo de adentro habla con el
 * servidor simulado del navegador, con su propio QueryClient: nada se mezcla con la caché de la
 * app real ni sale a la red (salvo /auth, para saber si quien entra ya tiene cuenta).
 */
export function AcademiaLayout() {
  // Se activa al renderizar (no en un efecto): las consultas de los hijos corren antes que los
  // efectos del layout y no deben salir nunca al backend real.
  const [queryClient] = useState(() => {
    activarApiDemo(servidorDemo)
    return new QueryClient({ defaultOptions: { queries: { staleTime: 1000 * 60, retry: false } } })
  })
  useEffect(() => {
    activarApiDemo(servidorDemo)
    return () => activarApiDemo(null)
  }, [])

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  // El expediente es material de trabajo: solo dentro del curso (lecciones, talleres, checkpoints).
  const enInicio = useLocation().pathname.replace(/\/$/, '') === '/academia'
  // Sin registro, cualquier ruta del curso muestra la entrada (también los enlaces directos a una lección).
  const registrado = useRegistroAcademiaStore((s) => !!s.registro)
  // Un registro que no alcanzó a llegar a n8n (sin red, webhook caído) se reintenta en cada visita.
  const enviarPendiente = useRegistroAcademiaStore((s) => s.enviarPendiente)
  useEffect(() => {
    void enviarPendiente()
  }, [enviarPendiente])

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-slate-50">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex h-14 items-center gap-2 px-4 sm:gap-4 sm:px-6">
            <Link to="/" className="shrink-0">
              <Logo className="h-6 w-auto sm:h-7" />
            </Link>
            <Link to="/academia" className="hidden sm:block border-l border-slate-200 pl-4 text-sm font-semibold text-violet-700">
              Academia · curso gratuito
            </Link>
            <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
              {registrado && !enInicio && <BotonExpediente />}
              {isAuthenticated ? (
                <Link to="/dashboard" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 sm:inline-flex">
                  Ir a mi panel
                </Link>
              ) : (
                <Link to="/login" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 sm:inline-flex">
                  Ingresar
                </Link>
              )}
              <EnlaceContacto
                ubicacion="encabezado"
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700 sm:px-3.5"
              >
                <span className="sm:hidden">Quiero AuditorYa</span>
                <span className="hidden sm:inline">Quiero AuditorYa para mi firma</span>
                <ArrowRight size={14} className="hidden sm:block" />
              </EnlaceContacto>
            </div>
          </div>
        </header>
        {registrado ? <Outlet /> : <AccesoCurso />}
        <Expediente />
        <AvisoVersionCompleta />
        <BotonBorrarDatos />
      </div>
    </QueryClientProvider>
  )
}

/**
 * Invitación a la versión completa: al final de un módulo, del curso o en funciones bloqueadas.
 * Superficie neutra a propósito: el violeta oscuro es de los bloques de aprendizaje (playground,
 * ejercicio) y la invitación comercial no debe confundirse con ellos.
 */
export function CtaVersionCompleta({ titulo, texto, ubicacion, className }: { titulo: string; texto: string; ubicacion: string; className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-slate-200 bg-white p-5 sm:p-6', className)}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">AuditorYa para firmas</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{titulo}</p>
      <p className="mt-1 text-sm text-slate-600 max-w-2xl">{texto}</p>
      <EnlaceContacto
        ubicacion={ubicacion}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-violet-300 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50"
      >
        Conocer el programa fundador <ArrowRight size={14} />
      </EnlaceContacto>
    </div>
  )
}
