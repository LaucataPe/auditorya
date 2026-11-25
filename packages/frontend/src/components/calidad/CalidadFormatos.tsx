import { useState } from 'react'
import { Paperclip, Upload } from 'lucide-react'
import {
  COMPONENTES_CALIDAD,
  FORMATOS_CALIDAD,
  cumplimientoComponente,
  estadoFormato,
  type ComponenteCalidad,
  type EstadoCumplimiento,
  type EstadoFormato,
  type SistemaCalidad,
} from '@auditorya/types'
import { cn } from '../../lib/cn'
import { Button } from '../ui/Button'
import { CUMPLIMIENTO_UI, FORMATO_UI, fecha, hoyISO, tituloComponente, type Calidad } from './calidad-ui'
import { DocumentosFirma } from './DocumentosFirma'

type Filtro = 'todos' | 'por_firmar' | 'firmados' | 'vencidos'

const FILTROS: { clave: Filtro; label: string; incluye: (e: EstadoFormato) => boolean }[] = [
  { clave: 'todos', label: 'Todos', incluye: () => true },
  { clave: 'por_firmar', label: 'Por firmar', incluye: (e) => e === 'sin_crear' || e === 'borrador' },
  { clave: 'firmados', label: 'Firmados', incluye: (e) => e === 'firmado' },
  { clave: 'vencidos', label: 'Vencidos', incluye: (e) => e === 'vencido' },
]

/** Galería de formatos (en el orden de los componentes), con filtros por estado. */
export function CalidadFormatos({
  sistema,
  onAbrir,
  onSubir,
  creando,
  calidad,
}: {
  sistema: SistemaCalidad
  onAbrir: (formato: string) => void
  /** Subir el documento propio de la firma en lugar de llenar la plantilla. */
  onSubir: (formato: string) => void
  creando: boolean
  calidad: Calidad
}) {
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const hoy = hoyISO()
  const orden = (c: ComponenteCalidad) => COMPONENTES_CALIDAD.findIndex((x) => x.clave === c)
  const formatos = FORMATOS_CALIDAD.map((f) => {
    const resumen = sistema.documentos.find((d) => d.formato === f.clave)
    return { f, resumen, estado: estadoFormato(resumen, hoy) }
  }).sort((a, b) => orden(a.f.componente) - orden(b.f.componente))
  const incluye = FILTROS.find((x) => x.clave === filtro)!.incluye
  // Color del componente al que pertenece cada formato (el mismo del Resumen).
  const estadoComponente = Object.fromEntries(
    COMPONENTES_CALIDAD.map((c) => [c.clave, cumplimientoComponente(c.clave, sistema, hoy).estado]),
  ) as Record<ComponenteCalidad, EstadoCumplimiento>

  return (
    <div className="space-y-5">
      <DocumentosFirma sistema={sistema} calidad={calidad} />

      <p className="max-w-3xl text-sm text-gray-500">
        Documentos prellenados con los datos de tu firma: solo completas lo marcado [COMPLETAR] y firmas. Si tu firma
        ya tiene alguno firmado por separado, súbelo con «Subir el mío». Cada uno queda como evidencia de su componente.
      </p>

      <div className="flex flex-wrap gap-2">
        {FILTROS.map((x) => (
          <button
            key={x.clave}
            type="button"
            onClick={() => setFiltro(x.clave)}
            aria-pressed={filtro === x.clave}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm transition-colors',
              filtro === x.clave
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300',
            )}
          >
            {x.label} · {formatos.filter((d) => x.incluye(d.estado)).length}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {formatos
          .filter((d) => incluye(d.estado))
          .map(({ f, resumen, estado }) => {
            const ui = FORMATO_UI[estado]
            const detalle =
              estado === 'borrador'
                ? resumen!.borrador!.pendientes > 0
                  ? `${resumen!.borrador!.pendientes} campo(s) por completar`
                  : 'Listo para firmar'
                : estado === 'vencido'
                  ? `Venció el ${fecha(resumen!.firmado!.vigenteHasta!)}`
                  : estado === 'firmado' && resumen!.firmado!.documentoFirma
                    ? `Cubierto por «${resumen!.firmado!.documentoFirma.nombre}» · vence ${fecha(resumen!.firmado!.vigenteHasta!)}`
                  : estado === 'firmado' && resumen!.firmado!.archivoNombre
                    ? `Documento propio · ${
                        resumen!.firmado!.vigenteHasta ? `vence ${fecha(resumen!.firmado!.vigenteHasta)}` : 'permanente'
                      }`
                  : estado === 'firmado'
                    ? `v${resumen!.firmado!.version} · ${resumen!.firmado!.firmadoPorNombre ?? ''} · ${
                        resumen!.firmado!.vigenteHasta ? `vence ${fecha(resumen!.firmado!.vigenteHasta)}` : 'permanente'
                      }`
                    : f.vigencia === 'anual'
                      ? 'Se renueva cada año'
                      : 'Permanente'
            const puedeAbrir = estado !== 'sin_crear' || sistema.puedeGestionar
            return (
              <article key={f.clave} className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <MiniaturaHoja
                  estado={estado}
                  propio={
                    !!resumen?.firmado?.archivoNombre && estado !== 'borrador'
                      ? resumen.firmado.documentoFirma
                        ? 'Manual firma'
                        : 'Propio'
                      : null
                  }
                />
                <div className="flex flex-1 flex-col gap-1.5 px-4 pb-4 pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] text-gray-500">
                      <i className={cn('inline-block h-2 w-2 shrink-0 rounded-[2px]', CUMPLIMIENTO_UI[estadoComponente[f.componente]].punto)} />
                      <span className="truncate">{tituloComponente(f.componente)}</span>
                    </span>
                    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', ui.sello)}>{ui.label}</span>
                  </div>
                  <p className="text-sm font-medium leading-snug text-gray-900">{f.titulo}</p>
                  <p className="text-xs text-gray-500">{detalle}</p>
                  {(puedeAbrir || sistema.puedeGestionar) && (
                    <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
                      {puedeAbrir && (
                        <Button
                          size="sm"
                          variant={estado === 'firmado' ? 'secondary' : 'primary'}
                          disabled={creando}
                          onClick={() => onAbrir(f.clave)}
                        >
                          {estado === 'vencido' && !sistema.puedeGestionar ? 'Ver' : ui.accion}
                        </Button>
                      )}
                      {sistema.puedeGestionar && (
                        <Button size="sm" variant="ghost" className="gap-1" onClick={() => onSubir(f.clave)}>
                          <Upload size={13} /> Subir el mío
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </article>
            )
          })}
      </div>

      {formatos.every((d) => !incluye(d.estado)) && (
        <p className="rounded-xl border border-dashed border-gray-200 bg-white py-10 text-center text-sm text-gray-500">
          No hay formatos en este estado.
        </p>
      )}
    </div>
  )
}

/**
 * Dibujo de una hoja: las líneas amarillas son los espacios por completar del borrador.
 * Un documento propio subido por la firma se dibuja como archivo adjunto.
 */
function MiniaturaHoja({ estado, propio }: { estado: EstadoFormato; propio: string | null }) {
  if (propio) {
    return (
      <div className="flex h-28 items-center justify-center bg-gray-100" aria-hidden="true">
        <div className="flex h-20 w-16 flex-col items-center justify-center gap-1 rounded-md bg-white shadow-sm">
          <Paperclip size={20} className="text-indigo-500" />
          <span className="text-center text-[10px] font-medium leading-tight text-gray-500">{propio}</span>
        </div>
      </div>
    )
  }
  const lineas = estado === 'borrador' ? ['w-full', 'w-11/12', 'w-1/3 bg-amber-200', 'w-full', 'w-4/5'] : ['w-full', 'w-11/12', 'w-full', 'w-4/5', 'w-full']
  return (
    <div className="flex h-28 items-end justify-center bg-gray-100 pt-4" aria-hidden="true">
      <div className={cn('h-full w-3/5 rounded-t-md bg-white px-3 pt-3 shadow-sm', estado === 'sin_crear' && 'opacity-60')}>
        <div className="mb-2 h-1.5 w-3/5 rounded bg-indigo-200" />
        {lineas.map((l, i) => (
          <div key={i} className={cn('mb-1.5 h-1 rounded bg-gray-200', l)} />
        ))}
      </div>
    </div>
  )
}
