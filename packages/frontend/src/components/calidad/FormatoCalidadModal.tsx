import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ExternalLink, FileDown, Lightbulb, Paperclip, PenLine, Printer, Trash2, Upload } from 'lucide-react'
import { camposPorCompletar, formatoCalidad, type DocumentoCalidad } from '@auditorya/types'
import { useAuthStore } from '../../store/auth.store'
import { confirmar } from '../../store/confirm.store'
import { useCalidad, useDocumentoCalidad } from '../../hooks/useCalidad'
import { construirHtmlInforme, descargarDocx, imprimirInforme, type ExportOpts } from '../../lib/informe-export'
import { DocumentoEditable, type SeccionDocumento } from '../ui/DocumentoEditable'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { cn } from '../../lib/cn'
import { SubirFormatoModal } from './SubirFormatoModal'

/** Los errores ya se muestran como toast (onError del hook); aquí solo se evita el rechazo sin manejar. */
const ejecutar = (fn: () => Promise<unknown>) => () => void fn().catch(() => {})

const fechaLarga = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

/**
 * Formato prellenado del sistema de calidad: vista previa editable del borrador, firma
 * (bloqueada mientras queden espacios [COMPLETAR]), versiones y exportación a PDF/Word.
 */
export function FormatoCalidadModal({
  formato: clave,
  documentoId,
  calidad,
  puedeGestionar,
  onClose,
}: {
  formato: string
  documentoId: string
  calidad: ReturnType<typeof useCalidad>
  puedeGestionar: boolean
  onClose: () => void
}) {
  const { firma } = useAuthStore()
  const queryClient = useQueryClient()
  const formato = formatoCalidad(clave)!
  const [id, setId] = useState(documentoId)
  const { data: doc, isLoading } = useDocumentoCalidad(id)
  const [contenido, setContenido] = useState<Record<string, string>>({})
  const [subirOpen, setSubirOpen] = useState(false)

  useEffect(() => {
    if (doc) setContenido(doc.contenido)
  }, [doc?.id, doc?.estado])

  const borrador = doc?.estado === 'borrador'
  const editable = borrador && puedeGestionar
  const pendientes = camposPorCompletar(contenido)
  const sucio = !!doc && JSON.stringify(contenido) !== JSON.stringify(doc.contenido)
  const ultima = doc?.versiones[0]
  const esUltima = ultima?.id === doc?.id
  // Documento propio de la firma subido como archivo: no hay plantilla que mostrar ni exportar.
  const propio = !!doc?.archivoNombre

  const secciones: SeccionDocumento[] = [
    ...formato.secciones.map((s) => ({ key: s.key, label: s.label, contenido: contenido[s.key] ?? '', editable })),
    ...(doc?.estado === 'firmado'
      ? [
          {
            key: 'aprobacion',
            label: 'Aprobación',
            contenido:
              `Firmado electrónicamente en AuditorYa por ${doc.firmadoPorNombre ?? '—'} el ${fechaLarga(doc.firmadoAt!)}. Versión ${doc.version}.` +
              (doc.vigenteHasta ? `\nVigente hasta el ${fechaLarga(doc.vigenteHasta)}.` : ''),
          },
        ]
      : []),
  ]

  const exportOpts = (): ExportOpts => ({
    titulo: formato.titulo,
    empresaNombre: `Sistema de gestión de calidad · Versión ${doc?.version ?? 1}${borrador ? ' (borrador)' : ''}`,
    periodo: '',
    firma,
    secciones: secciones.map(({ label, contenido: c }) => ({ label, contenido: c })),
  })
  const nombreArchivo = `${formato.titulo.replace(/[^\wáéíóúñÁÉÍÓÚÑ]+/g, '_')}_v${doc?.version ?? 1}`

  /** Deja en caché la versión que devolvió el servidor y marca las demás para recargar (historial). */
  function refrescar(actualizado?: DocumentoCalidad) {
    queryClient.invalidateQueries({ queryKey: ['calidad-documento'] })
    if (actualizado) queryClient.setQueryData(['calidad-documento', actualizado.id], actualizado)
  }

  async function guardar(): Promise<DocumentoCalidad | undefined> {
    if (!doc || !sucio) return doc
    const guardado = await calidad.guardarDocumento.mutateAsync({ id: doc.id, contenido })
    refrescar(guardado)
    return guardado
  }

  async function firmar() {
    const ok = await confirmar({
      titulo: `Firmar «${formato.titulo}»`,
      descripcion:
        formato.vigencia === 'anual'
          ? 'Queda firmado a tu nombre y vigente por un año. Para cambiarlo después tendrás que crear una versión nueva.'
          : 'Queda firmado a tu nombre. Para cambiarlo después tendrás que crear una versión nueva.',
      confirmar: 'Firmar',
    })
    if (!ok || !doc) return
    await guardar()
    const firmado = await calidad.firmarDocumento.mutateAsync(doc.id)
    refrescar(firmado)
  }

  async function descartar() {
    if (!doc) return
    const ok = await confirmar({
      titulo: 'Descartar el borrador',
      descripcion: 'Se pierden los cambios de esta versión. Las versiones firmadas no se tocan.',
      confirmar: 'Descartar',
      variante: 'danger',
    })
    if (!ok) return
    await calidad.descartarDocumento.mutateAsync(doc.id)
    refrescar()
    const anterior = doc.versiones.find((v) => v.id !== doc.id)
    if (anterior) setId(anterior.id)
    else onClose()
  }

  async function nuevaVersion() {
    const nuevo = await calidad.crearDocumento.mutateAsync(clave)
    refrescar(nuevo)
    setId(nuevo.id)
  }

  return (
    <Modal open onClose={onClose} title={formato.titulo} size="xl">
      {isLoading || !doc ? (
        <p className="py-10 text-center text-sm text-gray-500">Cargando el documento…</p>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-2 rounded-lg bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
            <Lightbulb size={16} className="mt-0.5 shrink-0" />
            <p>{formato.proposito}</p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {borrador ? (
                <>
                  <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                    Borrador · versión {doc.version}
                  </span>
                  <span className={cn('text-xs', pendientes > 0 ? 'text-amber-800' : 'text-emerald-700')}>
                    {pendientes > 0
                      ? `${pendientes} espacio(s) [COMPLETAR] por llenar antes de firmar`
                      : 'Listo para firmar'}
                  </span>
                </>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                  <CheckCircle2 size={12} /> {propio ? 'Documento propio' : 'Firmado'} · versión {doc.version}
                  {doc.vigenteHasta && ` · vigente hasta ${fechaLarga(doc.vigenteHasta)}`}
                </span>
              )}
              {doc.versiones.length > 1 && (
                <select
                  aria-label="Versión"
                  value={doc.id}
                  onChange={(e) => setId(e.target.value)}
                  className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
                >
                  {doc.versiones.map((v) => (
                    <option key={v.id} value={v.id}>
                      Versión {v.version} · {v.estado === 'firmado' ? `firmada ${fechaLarga(v.firmadoAt!)}` : 'borrador'}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!propio && (
                <>
                  <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => imprimirInforme(construirHtmlInforme(exportOpts()))}>
                    <Printer size={13} /> PDF
                  </Button>
                  <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => descargarDocx(nombreArchivo, exportOpts())}>
                    <FileDown size={13} /> Word
                  </Button>
                </>
              )}
              {puedeGestionar && (borrador || esUltima) && (
                <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setSubirOpen(true)}>
                  <Upload size={13} /> Subir el mío
                </Button>
              )}
              {editable && (
                <>
                  <Button size="sm" variant="ghost" className="gap-1.5" onClick={ejecutar(descartar)}>
                    <Trash2 size={13} /> Descartar
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!sucio}
                    loading={calidad.guardarDocumento.isPending}
                    onClick={ejecutar(guardar)}
                  >
                    Guardar
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5"
                    disabled={pendientes > 0}
                    loading={calidad.firmarDocumento.isPending}
                    onClick={ejecutar(firmar)}
                  >
                    <PenLine size={13} /> Firmar
                  </Button>
                </>
              )}
              {!borrador && esUltima && puedeGestionar && (
                <Button size="sm" loading={calidad.crearDocumento.isPending} onClick={ejecutar(nuevaVersion)}>
                  Nueva versión
                </Button>
              )}
            </div>
          </div>

          {propio ? (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-gray-50 px-5 py-6">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-white shadow-sm">
                  <Paperclip size={20} className="text-indigo-500" />
                </span>
                <div>
                  <p className="text-sm font-medium text-gray-900">{doc.archivoNombre}</p>
                  <p className="text-xs text-gray-500">
                    {doc.documentoFirma ? (
                      <>
                        Cubierto por «{doc.documentoFirma.nombre}»
                        {doc.documentoFirma.referencia && `, ${doc.documentoFirma.referencia}`} · aprobado el{' '}
                        {fechaLarga(doc.firmadoAt!)}
                        {doc.vigenteHasta && ` · vigente hasta el ${fechaLarga(doc.vigenteHasta)}`}
                      </>
                    ) : (
                      <>
                        Documento propio de la firma · firmado el {fechaLarga(doc.firmadoAt!)} · subido por{' '}
                        {doc.firmadoPorNombre ?? '—'}
                      </>
                    )}
                  </p>
                </div>
              </div>
              <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => calidad.abrirArchivoDocumento(doc.id)}>
                <ExternalLink size={13} /> Abrir documento
              </Button>
            </div>
          ) : (
            <DocumentoEditable
              titulo={formato.titulo}
              empresaNombre={exportOpts().empresaNombre}
              periodo=""
              firma={firma}
              secciones={secciones}
              disabled={!editable}
              onChange={editable ? (key, valor) => setContenido((c) => ({ ...c, [key]: valor })) : undefined}
              aviso={
                editable
                  ? 'Haz clic en una sección para editarla. Reemplaza cada [COMPLETAR: …] con los datos de tu firma.'
                  : borrador
                    ? 'Borrador en preparación: solo un socio puede editarlo y firmarlo.'
                    : 'Versión firmada: no se edita. Crea una versión nueva para cambiarla.'
              }
            />
          )}
        </div>
      )}
      {subirOpen && (
        <SubirFormatoModal
          formato={clave}
          calidad={calidad}
          hayBorrador={!!doc?.versiones.some((v) => v.estado === 'borrador')}
          encima
          onClose={() => setSubirOpen(false)}
          onSubido={(nuevo) => {
            refrescar(nuevo)
            setId(nuevo.id)
          }}
        />
      )}
    </Modal>
  )
}
