import { useState, type FormEvent } from 'react'
import { ArrowRight, Award, Check } from 'lucide-react'
import { LECCIONES_CURSO, MODULOS_CURSO } from '@auditorya/types'
import { cn } from '../../lib/cn'
import { useRegistroAcademiaStore, type RolAcademia } from '../../store/academia.store'

/** Versión del texto de autorización: si cambia el texto, cambia la versión (prueba del consentimiento). */
const VERSION_AUTORIZACION = 'academia-v2'

/** Responsable del tratamiento de los datos (Ley 1581). Si cambia, sube VERSION_AUTORIZACION. */
const RESPONSABLE = {
  nombre: 'COLKREA S.A.S.',
  nit: '901.878.495-9',
  correo: 'colkreasas@gmail.com',
  politicaUrl: 'https://pluss100.com/formatos/Politica_de_privacidad_y_protecci%C3%B3n_de_datos_Pluss100.pdf',
}

const ROLES: { valor: RolAcademia; texto: string }[] = [
  { valor: 'socio', texto: 'Socio o dueño de firma' },
  { valor: 'auditor', texto: 'Revisor fiscal o auditor' },
  { valor: 'estudiante', texto: 'Estudiante' },
  { valor: 'otro', texto: 'Otro' },
]

const leccionesFases = LECCIONES_CURSO.filter((l) => !l.id.startsWith('0.')).length
const fases = MODULOS_CURSO.filter((m) => m.checkpoint).length

const PROPUESTA = [
  `${leccionesFases} lecciones en ${fases} fases, más la inducción`,
  'Un cliente con expediente, balance y problemas reales',
  'Cada lección se practica en el software, no en diapositivas',
  'Certificado de participación en tu correo',
]

const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** El texto que se muestra junto a la casilla, en plano: se guarda como prueba de lo que se aceptó. */
function textoAutorizacion(): string {
  const politica = `política de tratamiento de datos (${RESPONSABLE.politicaUrl})`
  return `Autorizo a ${RESPONSABLE.nombre}, NIT ${RESPONSABLE.nit}, a tratar mis datos para darme acceso al curso, enviarme el certificado de participación e información sobre AuditorYa, según su ${politica}. Puedo pedir que los corrijan o los borren en ${RESPONSABLE.correo}.`
}

/**
 * Entrada al curso: correo, rol y autorización de datos. Reemplaza el contenido del curso hasta que
 * la persona se registra (opción «al entrar»; ver la maqueta de captura de correo).
 */
export function AccesoCurso() {
  const registrar = useRegistroAcademiaStore((s) => s.registrar)
  const [correo, setCorreo] = useState('')
  const [rol, setRol] = useState<RolAcademia | null>(null)
  const [autoriza, setAutoriza] = useState(false)
  const [intentado, setIntentado] = useState(false)

  const errores = {
    correo: !CORREO_VALIDO.test(correo.trim()) ? 'Escribe un correo válido.' : null,
    rol: !rol ? 'Elige tu rol.' : null,
    autoriza: !autoriza ? 'Necesitamos tu autorización para darte acceso.' : null,
  }

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    setIntentado(true)
    if (errores.correo || errores.rol || errores.autoriza || !rol) return
    registrar({
      correo: correo.trim().toLowerCase(),
      rol,
      autorizacion: { version: VERSION_AUTORIZACION, fecha: new Date().toISOString(), texto: textoAutorizacion() },
    })
  }

  return (
    <main className="mx-auto grid min-h-[calc(100vh-3.5rem)] max-w-6xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:py-16">
      <section className="space-y-4 lg:space-y-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">Curso práctico · revisoría fiscal bajo NIA</p>
        <h1 className="text-[26px] font-bold leading-tight text-slate-900 sm:text-4xl">
          Audita un cliente de principio a fin, en el software real
        </h1>
        <p className="text-[15px] leading-relaxed text-slate-600 sm:text-[17px]">
          Recorres una revisoría fiscal completa sobre el mismo caso: aceptación, planeación, ejecución, informe y cierre.
          Cada lección se practica en AuditorYa.
        </p>
        <ul className="hidden space-y-2.5 text-[15px] text-slate-700 sm:block">
          {PROPUESTA.map((p) => (
            <li key={p} className="flex items-center gap-2.5">
              <Check size={18} strokeWidth={2.4} className="shrink-0 text-emerald-600" />
              {p}
            </li>
          ))}
        </ul>
      </section>

      <form
        onSubmit={enviar}
        noValidate
        className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_20px_40px_-24px_rgba(15,23,42,0.25)] sm:p-8"
      >
        <div>
          <h2 className="text-xl font-bold text-slate-900 sm:text-[22px]">Entra al curso</h2>
          <p className="mt-1 text-sm text-slate-500">Gratis. Sin contraseña: tu avance se guarda en este navegador.</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="acceso-correo" className="text-[13px] font-semibold text-slate-700">Correo</label>
          <input
            id="acceso-correo"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="tu@correo.com"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            aria-invalid={intentado && !!errores.correo}
            aria-describedby={intentado && errores.correo ? 'acceso-correo-ayuda acceso-correo-error' : 'acceso-correo-ayuda'}
            className={cn(
              'h-11 w-full rounded-lg border px-3.5 text-[15px] focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200',
              intentado && errores.correo ? 'border-rose-400' : 'border-slate-300',
            )}
          />
          {intentado && errores.correo && <p id="acceso-correo-error" className="text-xs text-rose-600">{errores.correo}</p>}
          {/* Se pide un correo real dando una razón concreta: ahí llega lo que la persona quiere recibir. */}
          <p id="acceso-correo-ayuda" className="flex items-start gap-1.5 text-xs leading-relaxed text-slate-500">
            <Award size={14} className="mt-px shrink-0 text-violet-600" />
            A este correo te enviaremos tu certificado de participación. Usa uno que revises.
          </p>
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-[13px] font-semibold text-slate-700">¿Cuál es tu rol?</legend>
          <div className="flex flex-wrap gap-2">
            {ROLES.map((r) => (
              <label
                key={r.valor}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-violet-300',
                  rol === r.valor ? 'border-violet-600 bg-violet-50 text-violet-800' : 'border-slate-300 text-slate-700 hover:border-slate-400',
                )}
              >
                <input type="radio" name="acceso-rol" value={r.valor} checked={rol === r.valor} onChange={() => setRol(r.valor)} className="accent-violet-600" />
                {r.texto}
              </label>
            ))}
          </div>
          {intentado && errores.rol && <p className="text-xs text-rose-600">{errores.rol}</p>}
        </fieldset>

        <div className="space-y-1.5">
          <label className="flex items-start gap-2.5 text-xs leading-relaxed text-slate-600">
            <input
              type="checkbox"
              checked={autoriza}
              onChange={(e) => setAutoriza(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-violet-600"
            />
            <span>
              Autorizo a {RESPONSABLE.nombre}, NIT {RESPONSABLE.nit}, a tratar mis datos para darme acceso al curso,
              enviarme el certificado de participación e información sobre AuditorYa, según su{' '}
              <a href={RESPONSABLE.politicaUrl} target="_blank" rel="noreferrer" className="font-medium text-violet-700 underline">
                política de tratamiento de datos
              </a>
              . Puedo pedir que los corrijan o los borren en {RESPONSABLE.correo}.
            </span>
          </label>
          {intentado && errores.autoriza && <p className="text-xs text-rose-600">{errores.autoriza}</p>}
        </div>

        <button
          type="submit"
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-violet-600 text-[15px] font-semibold text-white hover:bg-violet-700"
        >
          Entrar al curso <ArrowRight size={16} />
        </button>
      </form>
    </main>
  )
}
