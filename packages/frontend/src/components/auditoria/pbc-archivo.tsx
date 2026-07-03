import { useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Upload, Download } from 'lucide-react'
import { api, BASE_URL } from '../../lib/api'

function formatoTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Adjuntar / descargar el archivo de la evidencia vinculada a una solicitud PBC recibida.
 * Reutiliza los endpoints existentes de evidencia (subida y URL firmada de 15 min).
 */
export function PbcArchivo({
  evidenciaId, archivoNombre, archivoTamano, disabled, onCambio,
}: {
  evidenciaId: string
  archivoNombre: string | null
  archivoTamano: number | null
  disabled?: boolean
  onCambio: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)

  const subir = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('archivo', file)
      return api.upload(`/evidencias/${evidenciaId}/archivo`, fd)
    },
    onSuccess: onCambio,
  })

  const descargar = useMutation({
    mutationFn: () => api.get<{ url: string }>(`/evidencias/${evidenciaId}/descarga`),
    onSuccess: ({ url }) => window.open(`${BASE_URL}${url}`, '_blank'),
  })

  if (archivoNombre) {
    return (
      <button
        onClick={() => descargar.mutate()}
        disabled={descargar.isPending}
        className="text-xs text-indigo-600 hover:underline inline-flex items-center gap-1"
        title="Descarga con enlace firmado (15 min)"
      >
        <Download size={11} />
        {archivoNombre}
        {archivoTamano != null && <span className="text-gray-400">({formatoTamano(archivoTamano)})</span>}
      </button>
    )
  }

  if (disabled) return <span className="text-xs text-gray-400">Sin archivo adjunto</span>

  return (
    <>
      <button
        onClick={() => fileRef.current?.click()}
        disabled={subir.isPending}
        className="text-xs text-gray-500 hover:text-indigo-600 inline-flex items-center gap-1 transition-colors"
      >
        {subir.isPending ? (
          <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-indigo-500 border-t-transparent" />
        ) : (
          <Upload size={11} />
        )}
        Adjuntar archivo
      </button>
      {subir.isError && (
        <span className="text-xs text-red-600">
          {subir.error instanceof Error ? subir.error.message : 'Error al subir'}
        </span>
      )}
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) subir.mutate(f)
        }}
      />
    </>
  )
}
