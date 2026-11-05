import { Sparkles } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Isotipo } from '../ui/Logo'
import { MOCKUP_APP, SITIO } from './contenido'
import { Pill } from './Tipografia'

/**
 * Interfaz de ejemplo del encargo (HTML, datos ficticios) que se muestra en el hero mientras
 * no haya una captura real. Es decorativa: se anuncia como una sola imagen a lectores de pantalla.
 */
export function AppMockup() {
  const { menu, clientes, encargo, fases, columnas, asistente } = MOCKUP_APP
  return (
    <div
      role="img"
      aria-label="Ejemplo del espacio de trabajo de un encargo: fases, columnas de riesgos, pruebas, evidencias y conclusiones, y panel del asistente de IA. Datos de ejemplo."
    >
      <div aria-hidden="true" className="grid text-[12.5px] lg:grid-cols-[190px_minmax(0,1fr)_240px]">
        {/* Menú lateral */}
        <div className="hidden bg-marca-950 px-3 py-4 text-[#d8ccf5] lg:block">
          <div className="mb-4 flex items-center gap-2 font-bold text-white">
            <Isotipo className="h-[22px] w-[22px]" />
            {SITIO.nombre}
          </div>
          {menu.map((item, i) => (
            <div key={item} className={cn('mb-0.5 rounded-lg px-2.5 py-1.5', i === 0 && 'bg-marca-500/30 font-semibold text-white')}>
              {item}
            </div>
          ))}
          <p className="mx-2.5 mb-2 mt-4 text-[10px] tracking-[0.1em] text-[#9d8cc7]">ENCARGOS ACTIVOS</p>
          {clientes.map((c) => (
            <div key={c} className="flex items-center gap-2 px-2.5 py-1.5 text-[#cbbdf0]">
              <span className="h-1.5 w-1.5 rounded-full bg-marca-500" />
              {c}
            </div>
          ))}
        </div>

        {/* Encargo */}
        <div className="bg-[#fdfcff] px-5 py-4">
          <p className="text-[10.5px] uppercase tracking-[0.1em] text-marca-suave">Encargo · ejemplo</p>
          <p className="mb-3 mt-0.5 text-base font-bold tracking-tight text-marca-tinta">{encargo}</p>
          <div className="mb-3.5 grid grid-cols-4 gap-1.5">
            {fases.map((f) => (
              <span
                key={f.label}
                className={cn(
                  'truncate rounded-lg px-2 py-1.5 text-[11.5px] font-semibold',
                  f.estado === 'hecha' && 'bg-emerald-50 text-emerald-700',
                  f.estado === 'activa' && 'bg-marca-600 text-white',
                  f.estado === 'pendiente' && 'bg-[#f2eefc] text-marca-suave',
                )}
              >
                {f.label}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {columnas.map((col) => (
              <div key={col.titulo}>
                <p className="mb-2 text-[10px] uppercase tracking-[0.1em] text-marca-suave">{col.titulo}</p>
                {col.items.map((it) => (
                  <div
                    key={it.texto}
                    className="mb-2 rounded-[10px] border border-marca-linea bg-white p-2.5 shadow-[0_4px_10px_-8px_rgba(46,16,101,0.35)]"
                  >
                    <p className="mb-1 text-xs font-semibold text-marca-tinta">{it.texto}</p>
                    <Pill tono={it.tono}>{it.pill}</Pill>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Asistente IA */}
        <div className="hidden border-l border-marca-linea bg-gradient-to-b from-[#f4efff] to-white p-4 lg:block">
          <p className="mb-3 flex items-center gap-2 text-[13px] font-bold text-marca-tinta">
            <span className="flex h-[22px] w-[22px] items-center justify-center rounded-md bg-marca-600 text-white">
              <Sparkles className="h-3 w-3" />
            </span>
            Asistente IA
          </p>
          {asistente.map((m) => (
            <div
              key={m.texto}
              className="mb-2.5 rounded-xl border border-marca-linea bg-white p-3 text-marca-tinta shadow-[0_8px_18px_-14px_rgba(91,33,182,0.6)]"
            >
              {m.texto}
              <span className="my-2 block text-[11px] text-marca-700">{m.nota}</span>
              {m.acciones && (
                <div className="flex gap-1.5">
                  <span className="flex-1 rounded-lg border border-marca-600 bg-marca-600 py-1.5 text-center text-[11.5px] font-semibold text-white">
                    Revisar
                  </span>
                  <span className="flex-1 rounded-lg border border-marca-linea py-1.5 text-center text-[11.5px] font-semibold">
                    Descartar
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <p className="border-t border-marca-linea bg-white px-4 py-2 text-center text-[11.5px] text-marca-suave">
        Interfaz de ejemplo con datos ficticios
      </p>
    </div>
  )
}
