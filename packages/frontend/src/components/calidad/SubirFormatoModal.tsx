import { useState } from 'react'
import { Upload } from 'lucide-react'
import { formatoCalidad, type DocumentoCalidad } from '@auditorya/types'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { hoyISO, type Calidad } from './calidad-ui'

const ACEPTA = '.pdf,.doc,.docx,.png,.jpg,.jpeg'

/**
 * La firma sube su propio documento ya firmado en lugar de llenar la plantilla. Queda
 * como la versión firmada siguiente del formato (y reemplaza el borrador en curso).
 */
export function SubirFormatoModal({
  formato: clave,
  calidad,
  hayBorrador,
  encima,
  onClose,
  onSubido,
}: {
  formato: string
  calidad: Calidad
  hayBorrador: boolean
  /** true si se abre sobre otro modal (el del formato): queda adelante y Esc solo cierra este. */
  encima?: boolean
  onClose: () => void
  onSubido?: (doc: DocumentoCalidad) => void
}) {
  const formato = formatoCalidad(clave)!
  const hoy = hoyISO()
  const [archivo, setArchivo] = useState<File | null>(null)
  const [fecha, setFecha] = useState(hoy)

  return (
    <Modal open onClose={onClose} title={`Subir mi «${formato.titulo}»`} capa={encima ? 'superior' : 'normal'}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!archivo) return
          calidad.subirFormato.mutate(
            { formato: clave, archivo, fecha },
            {
              onSuccess: (doc) => {
                onSubido?.(doc)
                onClose()
              },
            },
          )
        }}
      >
        <p className="text-sm text-gray-600">
          Si tu firma ya tiene este documento firmado, súbelo aquí y no necesitas llenar la plantilla. Queda como
          evidencia del componente igual que un formato firmado en AuditorYa.
        </p>

        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-300 px-4 py-6 text-center hover:border-indigo-400">
          <Upload size={22} className="text-gray-400" />
          <span className="text-sm font-medium text-gray-800">{archivo ? archivo.name : 'Elige el archivo'}</span>
          <span className="text-xs text-gray-500">PDF, Word o imagen · máximo 20 MB</span>
          <input
            type="file"
            accept={ACEPTA}
            className="sr-only"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          />
        </label>

        <label className="block space-y-1 text-sm">
          <span className="font-medium text-gray-700">Fecha en que se firmó el documento</span>
          <input
            type="date"
            value={fecha}
            max={hoy}
            required
            onChange={(e) => setFecha(e.target.value)}
            className="block rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          {formato.vigencia === 'anual' && (
            <span className="block text-xs text-gray-500">Este formato es anual: vence un año después de esta fecha.</span>
          )}
        </label>

        {hayBorrador && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Tienes un borrador de este formato en curso: se reemplaza por el documento que subas.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!archivo} loading={calidad.subirFormato.isPending}>
            Subir documento
          </Button>
        </div>
      </form>
    </Modal>
  )
}
