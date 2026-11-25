import { useState } from 'react'
import { BookOpen, ExternalLink, FileDown, History, Lock, Printer } from 'lucide-react'
import { componentesSinCumplir, vigenciaDocumentoFirma, type SistemaCalidad } from '@auditorya/types'
import { useAuthStore } from '../../store/auth.store'
import { confirmar } from '../../store/confirm.store'
import { toast } from '../../store/toast.store'
import { construirHtmlInforme, descargarDocx, imprimirInforme } from '../../lib/informe-export'
import { exportOptsManualCalidad, nombreArchivoManual } from '../../lib/manual-calidad-export'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { ACCION_LABEL, fecha, hoyISO, type Calidad } from './calidad-ui'

/**
 * Manual del sistema de gestión de calidad: consolidado versionado de todo el sistema.
 * Solo se genera con los 8 componentes cumplidos; cada versión es una foto que no cambia.
 */
export function CalidadManual({ sistema, calidad }: { sistema: SistemaCalidad; calidad: Calidad }) {
  const { firma } = useAuthStore()
  const [exportando, setExportando] = useState<string | null>(null)
  const [registrarAnterior, setRegistrarAnterior] = useState(false)
  // Los manuales anteriores se registran antes de generar el primero en AuditorYa.
  const puedeRegistrarAnterior = sistema.puedeGestionar && !sistema.manuales.some((m) => !m.externo)
  const faltan = componentesSinCumplir(sistema, hoyISO())
  const listo = faltan.length === 0
  const siguiente = (sistema.manuales[0]?.version ?? 0) + 1
  const anio = sistema.evaluacion.anio

  async function generar() {
    const ok = await confirmar({
      titulo: `Generar el manual de calidad · versión ${siguiente}`,
      descripcion:
        'Se guarda una foto del sistema tal como está hoy (componentes, formatos firmados, evaluación y cambios del año), firmada a tu nombre. Las versiones anteriores se conservan.',
      confirmar: 'Generar y firmar',
      variante: 'primary',
    })
    if (ok) calidad.generarManual.mutate(anio)
  }

  async function exportar(id: string, como: 'pdf' | 'word') {
    setExportando(`${id}-${como}`)
    try {
      const manual = await calidad.cargarManual(id)
      const opts = exportOptsManualCalidad(manual, firma, (a) => ACCION_LABEL[a] ?? a)
      if (como === 'pdf') imprimirInforme(construirHtmlInforme(opts))
      else await descargarDocx(nombreArchivoManual(manual), opts)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setExportando(null)
    }
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex max-w-3xl gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <BookOpen size={20} />
          </span>
          <div>
            <h3 className="text-base font-semibold text-gray-900">Manual del sistema de gestión de calidad</h3>
            <p className="mt-1 text-sm text-gray-600">
              Reúne en un solo documento todo el sistema de la firma: identificación, los 8 componentes con sus objetivos,
              riesgos y respuestas, las políticas y formatos firmados como anexos, la evaluación anual y el control de
              cambios. Es lo que la JCC pide ver en una visita.
            </p>
          </div>
        </div>
        {sistema.puedeConcluir && (
          <Button disabled={!listo} loading={calidad.generarManual.isPending} onClick={() => void generar()}>
            {listo ? `Generar versión ${siguiente}` : (
              <span className="inline-flex items-center gap-1.5">
                <Lock size={14} /> Generar versión {siguiente}
              </span>
            )}
          </Button>
        )}
      </section>

      {!listo && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-medium text-amber-900">
            Para generar el manual, los 8 componentes deben estar en verde. Faltan {faltan.length}:
          </p>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {faltan.map((f) => (
              <li key={f.clave}>
                • <span className="font-medium">{f.titulo}</span> — {f.falta}
              </li>
            ))}
          </ul>
        </section>
      )}

      {puedeRegistrarAnterior && (
        <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-gray-300 bg-white px-5 py-4">
          <History size={18} className="shrink-0 text-gray-400" />
          <p className="min-w-0 flex-1 text-sm text-gray-600">
            ¿La firma ya tenía un manual de calidad? Regístralo como versión anterior: queda en la historia y el primero que
            generes en AuditorYa sigue la numeración.
          </p>
          <Button size="sm" variant="secondary" onClick={() => setRegistrarAnterior(true)}>
            Registrar manual anterior
          </Button>
        </section>
      )}

      {listo && !sistema.puedeConcluir && (
        <p className="text-sm text-gray-500">
          Los 8 componentes están cumplidos. El responsable del sistema de calidad puede generar la versión {siguiente}.
        </p>
      )}

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <h3 className="border-b border-gray-100 px-5 py-3 text-sm font-semibold text-gray-900">Versiones</h3>
        {sistema.manuales.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-500">Todavía no se ha generado ninguna versión del manual.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {sistema.manuales.map((m, i) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    Versión {m.version} · {m.externo ? `aprobada en ${m.anio}` : `evaluación ${m.anio}`}
                    {m.externo && (
                      <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
                        Anterior a AuditorYa
                      </span>
                    )}
                    {i === 0 && (!m.externo || vigenciaDocumentoFirma(m.fechaAprobacion!) > hoyISO()) && (
                      <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                        Vigente
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">
                    {m.externo
                      ? `Aprobada el ${fecha(m.fechaAprobacion!)} · ${m.archivoNombre ?? ''} · registrada por ${m.generadoPorNombre ?? '—'}`
                      : `Generada por ${m.generadoPorNombre ?? '—'} el ${fecha(m.generadoAt)} · huella ${m.hash.slice(0, 12)}`}
                  </p>
                </div>
                {m.externo ? (
                  <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => calidad.abrirManualExterno(m.id)}>
                    <ExternalLink size={13} /> Abrir documento
                  </Button>
                ) : (
                  <>
                <Button
                  size="sm"
                  variant="secondary"
                  className="gap-1.5"
                  loading={exportando === `${m.id}-pdf`}
                  onClick={() => void exportar(m.id, 'pdf')}
                >
                  <Printer size={13} /> PDF
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="gap-1.5"
                  loading={exportando === `${m.id}-word`}
                  onClick={() => void exportar(m.id, 'word')}
                >
                  <FileDown size={13} /> Word
                </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {registrarAnterior && (
        <ManualAnteriorModal
          calidad={calidad}
          sugerida={(sistema.manuales[0]?.version ?? 0) + 1}
          onClose={() => setRegistrarAnterior(false)}
        />
      )}
    </div>
  )
}

/** Registra el manual que la firma tenía antes de AuditorYa, con su número de versión y su fecha. */
function ManualAnteriorModal({ calidad, sugerida, onClose }: { calidad: Calidad; sugerida: number; onClose: () => void }) {
  const hoy = hoyISO()
  const [archivo, setArchivo] = useState<File | null>(null)
  const [version, setVersion] = useState(String(sugerida))
  const [fechaAprobacion, setFechaAprobacion] = useState('')

  return (
    <Modal open onClose={onClose} title="Registrar manual anterior">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!archivo) return
          calidad.registrarManualExterno.mutate(
            { archivo, version: Number(version), fechaAprobacion },
            { onSuccess: onClose },
          )
        }}
      >
        <p className="text-sm text-gray-600">
          Queda como antecedente en la lista de versiones. Para que sus políticas cuenten en los formatos de este año,
          súbelo también en Formatos › Documentos que la firma ya tenía.
        </p>
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-gray-700">Archivo (PDF, Word o imagen, hasta 20 MB)</span>
          <input
            id="manual-anterior-archivo"
            type="file"
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-700"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            id="manual-anterior-version"
            label="Número de versión"
            type="number"
            min={1}
            max={999}
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            required
          />
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-gray-700">Fecha de aprobación</span>
            <input
              id="manual-anterior-fecha"
              type="date"
              value={fechaAprobacion}
              max={hoy}
              required
              onChange={(e) => setFechaAprobacion(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!archivo} loading={calidad.registrarManualExterno.isPending}>
            Registrar
          </Button>
        </div>
      </form>
    </Modal>
  )
}
