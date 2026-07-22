import { useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, FileText, Plus, Trash2, Upload, X } from 'lucide-react'
import {
  CATALOGO_DOCUMENTOS_EMPRESA,
  type CatalogoDocumentoEmpresa,
  type DocumentoEmpresa,
  type TipoDocumentoEmpresa,
} from '@auditorya/types'
import { api, BASE_URL } from '../../lib/api'
import { cn } from '../../lib/cn'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'

function formatoTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatoFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function EmpresaDocumentos() {
  const { id: empresaId } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [modalOtroAbierto, setModalOtroAbierto] = useState(false)

  const { data: documentos = [], isLoading } = useQuery<DocumentoEmpresa[]>({
    queryKey: ['empresa-documentos', empresaId],
    queryFn: () => api.get<DocumentoEmpresa[]>(`/empresas/${empresaId}/documentos`),
    enabled: !!empresaId,
  })

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['empresa-documentos', empresaId] })

  const subir = useMutation({
    mutationFn: ({ tipo, file, nombre }: { tipo: TipoDocumentoEmpresa; file: File; nombre?: string }) => {
      const fd = new FormData()
      fd.append('tipo', tipo)
      fd.append('archivo', file)
      if (nombre) fd.append('nombre', nombre)
      return api.upload(`/empresas/${empresaId}/documentos`, fd)
    },
    onSuccess: invalidar,
  })

  const eliminar = useMutation({
    mutationFn: (documentoId: string) => api.delete(`/empresas/documentos/${documentoId}`),
    onSuccess: invalidar,
  })

  const descargar = async (documentoId: string) => {
    const { url } = await api.get<{ url: string }>(`/empresas/documentos/${documentoId}/descarga`)
    window.open(`${BASE_URL}${url}`, '_blank')
  }

  const porTipo = new Map(
    documentos.filter((d) => d.tipo !== 'otro').map((d) => [d.tipo, d]),
  )
  const otros = documentos.filter((d) => d.tipo === 'otro')
  const faltantes = CATALOGO_DOCUMENTOS_EMPRESA.filter((c) => !porTipo.has(c.tipo)).length

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documentos</h1>
          <p className="text-sm text-gray-500 mt-1">
            Documentos legales del cliente y evidencias generales del expediente.
          </p>
        </div>
        {!isLoading && (
          <div className="text-right shrink-0">
            <p className="text-sm font-semibold text-gray-900">
              {CATALOGO_DOCUMENTOS_EMPRESA.length - faltantes} / {CATALOGO_DOCUMENTOS_EMPRESA.length}
            </p>
            <p className="text-xs text-gray-400">
              {faltantes === 0 ? 'Completo' : `${faltantes} pendiente${faltantes === 1 ? '' : 's'}`}
            </p>
          </div>
        )}
      </div>

      {/* Checklist de documentos legales */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
          Documentos requeridos
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {CATALOGO_DOCUMENTOS_EMPRESA.map((item) => (
            <DocumentoCard
              key={item.tipo}
              item={item}
              documento={porTipo.get(item.tipo) ?? null}
              subiendo={subir.isPending && subir.variables?.tipo === item.tipo}
              onSubir={(file) => subir.mutate({ tipo: item.tipo, file })}
              onDescargar={descargar}
              onEliminar={(docId) => eliminar.mutate(docId)}
            />
          ))}
        </div>
      </div>

      {/* Otros documentos */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Otros documentos
          </h2>
          <Button size="sm" variant="secondary" className="gap-2" onClick={() => setModalOtroAbierto(true)}>
            <Plus size={14} /> Agregar
          </Button>
        </div>

        {otros.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 py-10 text-center">
            <FileText size={28} className="text-gray-300 mb-2" />
            <p className="text-sm text-gray-400">No hay documentos adicionales.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-50">
            {otros.map((doc) => (
              <div key={doc.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 shrink-0">
                  <FileText size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{doc.nombre}</p>
                  <p className="text-xs text-gray-400 truncate">
                    {doc.archivoNombre} · {formatoTamano(doc.archivoTamano)}
                  </p>
                </div>
                <p className="text-xs text-gray-400 shrink-0">{formatoFecha(doc.createdAt)}</p>
                <button
                  onClick={() => descargar(doc.id)}
                  className="text-xs text-indigo-600 hover:underline shrink-0"
                >
                  Ver
                </button>
                <button
                  onClick={() => eliminar.mutate(doc.id)}
                  disabled={eliminar.isPending}
                  className="text-gray-300 hover:text-red-500 transition-colors shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <ModalOtroDocumento
        open={modalOtroAbierto}
        onClose={() => setModalOtroAbierto(false)}
        subiendo={subir.isPending}
        onSubir={(nombre, file) => {
          subir.mutate(
            { tipo: 'otro', file, nombre },
            { onSuccess: () => setModalOtroAbierto(false) },
          )
        }}
      />
    </div>
  )
}

function DocumentoCard({
  item,
  documento,
  subiendo,
  onSubir,
  onDescargar,
  onEliminar,
}: {
  item: CatalogoDocumentoEmpresa
  documento: DocumentoEmpresa | null
  subiendo: boolean
  onSubir: (file: File) => void
  onDescargar: (documentoId: string) => void
  onEliminar: (documentoId: string) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)

  const elegirArchivo = () => fileRef.current?.click()

  return (
    <div
      className={cn(
        'rounded-xl border p-4 flex flex-col gap-3',
        documento ? 'border-gray-200 bg-white shadow-sm' : 'border-dashed border-gray-300 bg-gray-50',
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-lg shrink-0',
            documento ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400',
          )}
        >
          {documento ? <CheckCircle2 size={17} /> : <FileText size={17} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 leading-tight">{item.label}</p>
          <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{item.descripcion}</p>
        </div>
      </div>

      {documento ? (
        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            onClick={() => onDescargar(documento.id)}
            className="min-w-0 flex-1 text-left text-xs text-indigo-600 hover:underline truncate"
            title={documento.archivoNombre}
          >
            {documento.archivoNombre}
            <span className="text-gray-400"> ({formatoTamano(documento.archivoTamano)})</span>
          </button>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={elegirArchivo}
              disabled={subiendo}
              title="Reemplazar archivo"
              className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-indigo-600 transition-colors"
            >
              {subiendo ? (
                <span className="block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-indigo-500 border-t-transparent" />
              ) : (
                <Upload size={13} />
              )}
            </button>
            <button
              onClick={() => onEliminar(documento.id)}
              title="Eliminar"
              className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-500 transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={elegirArchivo}
          disabled={subiendo}
          className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white py-2 text-xs font-medium text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors disabled:opacity-60"
        >
          {subiendo ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-indigo-500 border-t-transparent" />
          ) : (
            <Upload size={13} />
          )}
          Subir documento
        </button>
      )}

      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) onSubir(f)
        }}
      />
    </div>
  )
}

function ModalOtroDocumento({
  open,
  onClose,
  subiendo,
  onSubir,
}: {
  open: boolean
  onClose: () => void
  subiendo: boolean
  onSubir: (nombre: string, file: File) => void
}) {
  const [nombre, setNombre] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const cerrar = () => {
    setNombre('')
    setFile(null)
    onClose()
  }

  return (
    <Modal open={open} onClose={cerrar} title="Agregar documento">
      <div className="space-y-4">
        <Input
          label="Nombre del documento"
          placeholder="Ej. Certificado bancario"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />

        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">Archivo</span>
          {file ? (
            <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
              <span className="truncate text-gray-700">{file.name}</span>
              <button onClick={() => setFile(null)} className="text-gray-400 hover:text-gray-600 shrink-0 ml-2">
                <X size={14} />
              </button>
            </div>
          ) : (
            <label className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 py-3 text-sm text-gray-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors cursor-pointer">
              <Upload size={14} />
              Seleccionar archivo
              <input
                type="file"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" size="sm" onClick={cerrar}>
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={!nombre.trim() || !file || subiendo}
            loading={subiendo}
            onClick={() => file && onSubir(nombre.trim(), file)}
          >
            Subir
          </Button>
        </div>
      </div>
    </Modal>
  )
}
