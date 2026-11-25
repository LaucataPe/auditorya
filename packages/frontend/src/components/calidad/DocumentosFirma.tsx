import { useState } from 'react'
import { ExternalLink, FileStack, Upload } from 'lucide-react'
import {
  COMPONENTES_CALIDAD,
  FORMATOS_CALIDAD,
  estadoFormato,
  vigenciaDocumentoFirma,
  type DocumentoFirmaCalidad,
  type SistemaCalidad,
} from '@auditorya/types'
import { cn } from '../../lib/cn'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { FORMATO_UI, fecha, hoyISO, tituloComponente, type Calidad } from './calidad-ui'

/**
 * Manuales y políticas que la firma ya tenía. Se suben una vez y cubren varios formatos durante
 * un año desde su aprobación; después esos formatos aparecen vencidos y hay que renovarlos.
 */
export function DocumentosFirma({ sistema, calidad }: { sistema: SistemaCalidad; calidad: Calidad }) {
  const [subir, setSubir] = useState(false)
  const [cubrir, setCubrir] = useState<DocumentoFirmaCalidad | null>(null)
  const hoy = hoyISO()
  const gestiona = sistema.puedeGestionar
  const docs = sistema.documentosFirma

  if (!gestiona && docs.length === 0) return null

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <FileStack size={18} />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900">Documentos que la firma ya tenía</h3>
            <p className="mt-0.5 max-w-3xl text-sm text-gray-500">
              Si ya tienen un manual de calidad o políticas aprobadas, súbelos una sola vez y elige qué formatos cubren.
              Cubren esos formatos durante un año desde su aprobación; después hay que renovarlos.
            </p>
          </div>
        </div>
        {gestiona && (
          <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setSubir(true)}>
            <Upload size={13} /> Subir documento
          </Button>
        )}
      </div>

      {docs.length > 0 && (
        <ul className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-200">
          {docs.map((d) => {
            const vence = vigenciaDocumentoFirma(d.fechaAprobacion)
            const vencido = vence <= hoy
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-medium text-gray-900">{d.nombre}</p>
                  <p className={cn('text-xs', vencido ? 'text-red-700' : 'text-gray-500')}>
                    Aprobado el {fecha(d.fechaAprobacion)}
                    {d.aprobadoPor && ` por ${d.aprobadoPor}`} · {vencido ? `venció el ${fecha(vence)}` : `cubre hasta el ${fecha(vence)}`}
                  </p>
                  {d.formatos.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {d.formatos.map((k) => (
                        <span key={k} className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">
                          {FORMATOS_CALIDAD.find((f) => f.clave === k)?.titulo ?? k}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-amber-700">Todavía no cubre ningún formato.</p>
                  )}
                </div>
                <Button size="sm" variant="ghost" className="gap-1" onClick={() => calidad.abrirDocumentoFirma(d.id)}>
                  <ExternalLink size={13} /> Abrir
                </Button>
                {gestiona && !vencido && (
                  <Button size="sm" variant="secondary" onClick={() => setCubrir(d)}>
                    Elegir formatos
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {subir && <SubirDocumentoModal sistema={sistema} calidad={calidad} onClose={() => setSubir(false)} />}
      {cubrir && <CubrirModal documento={cubrir} sistema={sistema} calidad={calidad} onClose={() => setCubrir(null)} />}
    </section>
  )
}

/** Paso 1: el archivo y su aprobación. Al guardarlo pasa directo a elegir los formatos que cubre. */
function SubirDocumentoModal({ sistema, calidad, onClose }: { sistema: SistemaCalidad; calidad: Calidad; onClose: () => void }) {
  const hoy = hoyISO()
  const [archivo, setArchivo] = useState<File | null>(null)
  const [nombre, setNombre] = useState('')
  const [fechaAprobacion, setFechaAprobacion] = useState(hoy)
  const [aprobadoPor, setAprobadoPor] = useState('')
  const [subido, setSubido] = useState<DocumentoFirmaCalidad | null>(null)
  const vencido = vigenciaDocumentoFirma(fechaAprobacion) <= hoy

  if (subido) return <CubrirModal documento={subido} sistema={sistema} calidad={calidad} onClose={onClose} />

  async function guardar() {
    if (!archivo) return
    try {
      const { id } = await calidad.subirDocumentoFirma.mutateAsync({ archivo, nombre, fechaAprobacion, aprobadoPor })
      const documento: DocumentoFirmaCalidad = {
        id,
        nombre,
        fechaAprobacion,
        aprobadoPor: aprobadoPor || null,
        archivoNombre: archivo.name,
        formatos: [],
        creadoPorNombre: null,
        createdAt: new Date().toISOString(),
      }
      if (vencido) onClose()
      else setSubido(documento)
    } catch {
      // El error ya se mostró como aviso.
    }
  }

  return (
    <Modal open onClose={onClose} title="Subir un documento de la firma">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void guardar()
        }}
      >
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-gray-700">Archivo (PDF, Word o imagen, hasta 20 MB)</span>
          <input
            id="documento-firma-archivo"
            type="file"
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null
              setArchivo(f)
              if (f && !nombre) setNombre(f.name.replace(/\.[^.]+$/, ''))
            }}
            className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-700"
          />
        </label>
        <Input
          id="documento-firma-nombre"
          label="Nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej.: Manual de control de calidad, versión 3"
          required
          minLength={3}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-gray-700">Fecha de aprobación</span>
            <input
              id="documento-firma-fecha"
              type="date"
              value={fechaAprobacion}
              max={hoy}
              required
              onChange={(e) => setFechaAprobacion(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <Input
            id="documento-firma-aprobado"
            label="Aprobado por (opcional)"
            value={aprobadoPor}
            onChange={(e) => setAprobadoPor(e.target.value)}
            placeholder="Ej.: Junta de socios"
          />
        </div>
        <p className={cn('rounded-lg px-3 py-2 text-xs', vencido ? 'bg-amber-50 text-amber-900' : 'bg-gray-50 text-gray-600')}>
          {vencido
            ? 'Se aprobó hace más de un año: queda guardado como antecedente, pero ya no cubre formatos. Para cubrirlos, sube la versión aprobada este año.'
            : `Cubrirá los formatos que elijas hasta el ${fecha(vigenciaDocumentoFirma(fechaAprobacion))}.`}
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!archivo} loading={calidad.subirDocumentoFirma.isPending}>
            {vencido ? 'Guardar' : 'Siguiente: elegir formatos'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/** Paso 2: qué formatos cubre el documento y en qué parte de él está cada uno. */
function CubrirModal({
  documento,
  sistema,
  calidad,
  onClose,
}: {
  documento: DocumentoFirmaCalidad
  sistema: SistemaCalidad
  calidad: Calidad
  onClose: () => void
}) {
  const hoy = hoyISO()
  const aprobadoEl = new Date(`${documento.fechaAprobacion}T12:00:00-05:00`)
  const [elegidos, setElegidos] = useState<Record<string, string>>({})
  const orden = (c: string) => COMPONENTES_CALIDAD.findIndex((x) => x.clave === c)
  const formatos = [...FORMATOS_CALIDAD].sort((a, b) => orden(a.componente) - orden(b.componente))

  function alternar(clave: string) {
    setElegidos((e) => {
      const copia = { ...e }
      if (clave in copia) delete copia[clave]
      else copia[clave] = ''
      return copia
    })
  }

  function guardar() {
    calidad.cubrirFormatos.mutate(
      {
        documentoFirmaId: documento.id,
        formatos: Object.entries(elegidos).map(([formato, referencia]) => ({ formato, referencia: referencia.trim() || null })),
      },
      { onSuccess: onClose },
    )
  }

  return (
    <Modal open onClose={onClose} title={`¿Qué formatos cubre «${documento.nombre}»?`} size="lg">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          guardar()
        }}
      >
        <p className="text-sm text-gray-600">
          Marca los formatos que este documento ya resuelve y, si quieres, dónde está cada uno (capítulo o páginas). Quedan
          firmados con la fecha de aprobación del documento, {fecha(documento.fechaAprobacion)}, hasta el{' '}
          {fecha(vigenciaDocumentoFirma(documento.fechaAprobacion))}.
        </p>
        <ul className="max-h-[50vh] divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200">
          {formatos.map((f) => {
            const resumen = sistema.documentos.find((d) => d.formato === f.clave)
            const estado = estadoFormato(resumen, hoy)
            const firmado = resumen?.firmado
            // Un documento más viejo no reemplaza una versión firmada más reciente.
            const masReciente =
              !!firmado && new Date(firmado.firmadoAt) > aprobadoEl && firmado.documentoFirma?.id !== documento.id
            const yaCubierto = firmado?.documentoFirma?.id === documento.id
            const bloqueado = masReciente || yaCubierto
            const marcado = yaCubierto || f.clave in elegidos
            return (
              <li key={f.clave} className={cn('space-y-2 px-4 py-3', bloqueado && 'opacity-60')}>
                <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={marcado}
                    disabled={bloqueado}
                    onChange={() => alternar(f.clave)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-gray-900">{f.titulo}</span>
                    <span className="block text-xs text-gray-500">
                      {tituloComponente(f.componente)} ·{' '}
                      {yaCubierto
                        ? `ya lo cubre este documento${firmado?.documentoFirma?.referencia ? ` (${firmado.documentoFirma.referencia})` : ''}`
                        : masReciente
                        ? `ya tiene una versión firmada más reciente (${fecha(firmado!.firmadoAt)})`
                        : FORMATO_UI[estado].label.toLowerCase()}
                    </span>
                  </span>
                </label>
                {marcado && !yaCubierto && (
                  <input
                    id={`referencia-${f.clave}`}
                    type="text"
                    value={elegidos[f.clave]}
                    onChange={(e) => setElegidos((x) => ({ ...x, [f.clave]: e.target.value }))}
                    placeholder="Dónde está en el documento (ej.: capítulo 4, págs. 12-15)"
                    maxLength={200}
                    className="ml-6 block w-[calc(100%-1.5rem)] rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
                  />
                )}
              </li>
            )
          })}
        </ul>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Ahora no
          </Button>
          <Button type="submit" disabled={Object.keys(elegidos).length === 0} loading={calidad.cubrirFormatos.isPending}>
            Cubrir {Object.keys(elegidos).length || ''} formato{Object.keys(elegidos).length === 1 ? '' : 's'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
