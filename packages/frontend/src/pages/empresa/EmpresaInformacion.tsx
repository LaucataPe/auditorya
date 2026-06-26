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

type Empresa = {
  id: string
  nombre: string
  nit: string
  sector: string
  ciiu: string | null
  actividadEconomica: string | null
  ciudad: string | null
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

export function EmpresaInformacion() {
  const { id } = useParams<{ id: string }>()
  const [editOpen, setEditOpen] = useState(false)
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
    { label: 'Razón social', value: empresa.nombre },
    { label: 'NIT', value: empresa.nit },
    { label: 'Ciudad', value: empresa.ciudad || '—' },
    {
      label: 'CIIU',
      value: empresa.ciiu ? `${empresa.ciiu}${ciiuInfo ? ` · ${ciiuInfo.descripcion}` : ''}` : '—',
    },
    { label: 'Actividad económica', value: empresa.actividadEconomica || '—' },
    { label: 'Sector económico', value: empresa.sector },
    { label: 'Marco contable', value: MARCO_LABEL[empresa.marcoContable] ?? empresa.marcoContable },
    { label: 'Estado del encargo', value: ESTADO_LABEL[empresa.estadoEncargo] ?? empresa.estadoEncargo },
    {
      label: 'Fecha de registro',
      value: new Date(empresa.createdAt).toLocaleDateString('es-CO', {
        year: 'numeric', month: 'long', day: 'numeric',
      }),
    },
  ]

  return (
    <div className="p-8 max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Información</h1>
          <p className="text-sm text-gray-500 mt-1">Datos generales de la empresa cliente.</p>
        </div>
        {canEdit && (
          <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => setEditOpen(true)}>
            <Pencil size={13} /> Editar
          </Button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-50">
        {fields.map((f) => (
          <div key={f.label} className="flex items-center px-5 py-4 gap-4">
            <p className="text-sm text-gray-400 w-44 shrink-0">{f.label}</p>
            <p className="text-sm font-medium text-gray-900">{f.value}</p>
          </div>
        ))}
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
    </div>
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

  const sectorDerivado = infoCiiu(form.ciiu)?.sector
  const sectorLock = !!sectorDerivado
  const sectorValor = sectorDerivado
    ? sectorDerivado.charAt(0).toUpperCase() + sectorDerivado.slice(1)
    : form.sector

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nombre.trim() || !form.nit.trim() || !sectorValor.trim()) return
    onSubmit({ ...form, sector: sectorValor })
  }

  const ciiuInfo = infoCiiu(form.ciiu)

  return (
    <Modal open onClose={onClose} title="Editar empresa">
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
        <div>
          <Input
            id="e-ciiu"
            label="Código CIIU"
            placeholder="Ej: 4719"
            value={form.ciiu}
            onChange={(e) => setForm({ ...form, ciiu: e.target.value })}
          />
          {form.ciiu.trim() && (
            ciiuInfo ? (
              <p className="text-xs text-emerald-600 mt-1">Sección {ciiuInfo.seccion} · {ciiuInfo.descripcion}</p>
            ) : (
              <p className="text-xs text-amber-600 mt-1">Código CIIU no reconocido — se usará el sector indicado.</p>
            )
          )}
        </div>
        <Input
          id="e-actividad"
          label="Actividad económica"
          value={form.actividadEconomica}
          onChange={(e) => setForm({ ...form, actividadEconomica: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Input
              id="e-sector"
              label="Sector económico"
              value={sectorValor}
              disabled={sectorLock}
              onChange={(e) => setForm({ ...form, sector: e.target.value })}
            />
            {sectorLock && <p className="text-xs text-gray-400 mt-1">Derivado del CIIU</p>}
          </div>
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
        </div>

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
