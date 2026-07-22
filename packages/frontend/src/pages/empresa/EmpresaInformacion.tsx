import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { infoCiiu } from '@auditorya/types'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/auth.store'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Modal } from '../../components/ui/Modal'
import { Textarea } from '../../components/ui/Textarea'
import { ClasificacionFields } from '../../components/empresa/ClasificacionFields'
import { cn } from '../../lib/cn'

type Empresa = {
  id: string
  nombre: string
  nit: string
  sector: string
  ciiu: string | null
  actividadEconomica: string | null
  ciudad: string | null
  modeloNegocio: string | null
  estructura: string | null
  personasClave: string | null
  entornoRegulatorio: string | null
  sistemaContable: string | null
  marcoContable: string
  estadoEncargo: string
  createdAt: string
}

type EmpresaForm = {
  nombre: string
  nit: string
  sector: string
  ciiu: string
  actividadEconomica: string
  ciudad: string
  marcoContable: string
}

const MARCO_LABEL: Record<string, string> = {
  NIIF: 'NIIF — Grupo 1 (Grandes empresas)',
  NIIF_PYMES: 'NIIF para Pymes — Grupo 2',
  PCGA: 'PCGA — Grupo 3 (Microempresas)',
}

const ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Evaluación pendiente',
  aceptado: 'Encargo aceptado',
  rechazado: 'Encargo rechazado',
}

const ARCHIVO_CAMPOS: { key: keyof Empresa; label: string; placeholder: string }[] = [
  { key: 'modeloNegocio', label: 'Modelo de negocio', placeholder: 'Cómo genera ingresos, principales productos/servicios, clientes y proveedores' },
  { key: 'estructura', label: 'Estructura societaria y organizativa', placeholder: 'Composición accionaria, matriz/subsidiarias, organigrama' },
  { key: 'personasClave', label: 'Personas clave', placeholder: 'Gerencia, junta directiva, contador, responsables de áreas' },
  { key: 'entornoRegulatorio', label: 'Entorno regulatorio', placeholder: 'Superintendencias, normas sectoriales y tributarias aplicables' },
  { key: 'sistemaContable', label: 'Sistema contable', placeholder: 'Software contable, grado de automatización, controles del sistema' },
]

export function EmpresaInformacion() {
  const { id } = useParams<{ id: string }>()
  const [editOpen, setEditOpen] = useState(false)
  const [archivoOpen, setArchivoOpen] = useState(false)
  const { user } = useAuthStore()
  const queryClient = useQueryClient()

  const { data: empresa, isLoading } = useQuery<Empresa>({
    queryKey: ['empresa', id],
    queryFn: () => api.get<Empresa>(`/empresas/${id}`),
    enabled: !!id,
  })

  const editMutation = useMutation({
    mutationFn: (body: EmpresaForm) => api.put(`/empresas/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresa', id] })
      queryClient.invalidateQueries({ queryKey: ['empresas'] })
      setEditOpen(false)
    },
  })

  const archivoMutation = useMutation({
    mutationFn: (body: Partial<Record<string, string>>) => api.put(`/empresas/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresa', id] })
      setArchivoOpen(false)
    },
  })

  const canEdit = user?.rol === 'socio' || user?.rol === 'gerente'

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    )
  }

  if (!empresa) return null

  const ciiuInfo = empresa.ciiu ? infoCiiu(empresa.ciiu) : null

  const fields = [
    { label: 'Razón social', value: empresa.nombre, full: true },
    { label: 'NIT', value: empresa.nit },
    { label: 'Ciudad', value: empresa.ciudad || '—' },
    {
      label: 'CIIU',
      value: empresa.ciiu ? `${empresa.ciiu}${ciiuInfo ? ` · ${ciiuInfo.descripcion}` : ''}` : '—',
      full: true,
    },
    { label: 'Actividad económica', value: empresa.actividadEconomica || '—', full: true },
    { label: 'Sector económico', value: empresa.sector },
    { label: 'Marco contable', value: MARCO_LABEL[empresa.marcoContable] ?? empresa.marcoContable },
    { label: 'Estado del encargo', value: ESTADO_LABEL[empresa.estadoEncargo] ?? empresa.estadoEncargo },
    {
      label: 'Fecha de registro',
      value: new Date(empresa.createdAt).toLocaleDateString('es-CO', {
        year: 'numeric', month: 'short', day: 'numeric',
      }),
    },
  ]

  return (
    <div className="p-8 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Información</h1>
        <p className="text-sm text-gray-500 mt-1">Datos generales y entendimiento del cliente.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
        {/* Datos generales */}
        <section className="p-5">
          <div className="flex items-center justify-between mb-3.5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Datos generales</h2>
            {canEdit && (
              <button
                onClick={() => setEditOpen(true)}
                title="Editar"
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-indigo-600 transition-colors"
              >
                <Pencil size={13} />
              </button>
            )}
          </div>
          <dl className="grid grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-3">
            {fields.map((f) => (
              <div key={f.label} className={f.full ? 'col-span-2 xl:col-span-3' : ''}>
                <dt className="text-[11px] text-gray-400">{f.label}</dt>
                <dd className="text-sm font-medium text-gray-900 truncate" title={f.value}>
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Archivo permanente — entendimiento del negocio (capa global) */}
        <section className="p-5">
          <div className="flex items-center justify-between mb-3.5">
            <h2
              className="text-xs font-semibold uppercase tracking-wider text-gray-400"
              title="Archivo permanente — conocimiento estable que heredan todos los encargos"
            >
              Entendimiento del negocio
            </h2>
            {canEdit && (
              <button
                onClick={() => setArchivoOpen(true)}
                title="Editar"
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-indigo-600 transition-colors"
              >
                <Pencil size={13} />
              </button>
            )}
          </div>
          <dl className="space-y-3">
            {ARCHIVO_CAMPOS.map((f) => {
              const valor = (empresa[f.key] as string | null) || null
              return (
                <div key={f.key}>
                  <dt className="text-[11px] text-gray-400">{f.label}</dt>
                  <dd
                    className={cn('text-sm line-clamp-2', valor ? 'text-gray-800' : 'text-gray-400 italic')}
                    title={valor || undefined}
                  >
                    {valor || 'Sin registrar'}
                  </dd>
                </div>
              )
            })}
          </dl>
        </section>
      </div>

      {editOpen && (
        <EditarEmpresaModal
          empresa={empresa}
          onClose={() => setEditOpen(false)}
          onSubmit={(body) => editMutation.mutate(body)}
          loading={editMutation.isPending}
          error={editMutation.error instanceof Error ? editMutation.error.message : null}
        />
      )}

      {archivoOpen && (
        <ArchivoPermanenteModal
          empresa={empresa}
          onClose={() => setArchivoOpen(false)}
          onSubmit={(body) => archivoMutation.mutate(body)}
          loading={archivoMutation.isPending}
        />
      )}
    </div>
  )
}

function ArchivoPermanenteModal({
  empresa, onClose, onSubmit, loading,
}: {
  empresa: Empresa
  onClose: () => void
  onSubmit: (body: Record<string, string>) => void
  loading: boolean
}) {
  const [form, setForm] = useState<Record<string, string>>(
    Object.fromEntries(ARCHIVO_CAMPOS.map((f) => [f.key, (empresa[f.key] as string | null) ?? ''])),
  )

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit(form)
  }

  return (
    <Modal open onClose={onClose} title="Entendimiento del negocio" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {ARCHIVO_CAMPOS.map((f) => (
          <Textarea
            key={f.key}
            id={`arch-${f.key}`}
            label={f.label}
            rows={3}
            placeholder={f.placeholder}
            value={form[f.key]}
            onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
          />
        ))}
        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={loading}>Guardar</Button>
        </div>
      </form>
    </Modal>
  )
}

function EditarEmpresaModal({
  empresa, onClose, onSubmit, loading, error,
}: {
  empresa: Empresa
  onClose: () => void
  onSubmit: (data: EmpresaForm) => void
  loading: boolean
  error: string | null
}) {
  const [form, setForm] = useState<EmpresaForm>({
    nombre: empresa.nombre,
    nit: empresa.nit,
    sector: empresa.sector,
    ciiu: empresa.ciiu ?? '',
    actividadEconomica: empresa.actividadEconomica ?? '',
    ciudad: empresa.ciudad ?? '',
    marcoContable: empresa.marcoContable,
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nombre.trim() || !form.nit.trim() || (!form.sector && !form.ciiu)) return
    onSubmit(form)
  }

  return (
    <Modal open onClose={onClose} title="Editar cliente">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="e-nombre"
          label="Razón social"
          value={form.nombre}
          onChange={(e) => setForm({ ...form, nombre: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            id="e-nit"
            label="NIT"
            value={form.nit}
            onChange={(e) => setForm({ ...form, nit: e.target.value })}
          />
          <Input
            id="e-ciudad"
            label="Ciudad"
            value={form.ciudad}
            onChange={(e) => setForm({ ...form, ciudad: e.target.value })}
          />
        </div>
        <ClasificacionFields
          value={{ ciiu: form.ciiu, actividadEconomica: form.actividadEconomica, sector: form.sector }}
          onChange={(patch) => setForm({ ...form, ...patch })}
        />
        <Select
          id="e-marco"
          label="Marco contable"
          value={form.marcoContable}
          onChange={(e) => setForm({ ...form, marcoContable: e.target.value })}
          options={[
            { value: 'NIIF', label: 'NIIF (Grupo 1)' },
            { value: 'NIIF_PYMES', label: 'NIIF para Pymes (Grupo 2)' },
            { value: 'PCGA', label: 'PCGA (Grupo 3)' },
          ]}
        />

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={loading}>Guardar cambios</Button>
        </div>
      </form>
    </Modal>
  )
}
