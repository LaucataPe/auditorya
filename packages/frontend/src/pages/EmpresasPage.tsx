import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, ChevronRight, Pencil, Plus, Search } from 'lucide-react'
import { infoCiiu } from '@auditorya/types'
import { api } from '../lib/api'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { Select } from '../components/ui/Select'
import { cn } from '../lib/cn'

type MarcoContable = 'NIIF' | 'NIIF_PYMES' | 'PCGA'
type EstadoEncargo = 'pendiente' | 'aceptado' | 'rechazado'

type Empresa = {
  id: string
  nombre: string
  nit: string
  sector: string
  ciiu: string | null
  actividadEconomica: string | null
  ciudad: string | null
  marcoContable: MarcoContable
  estadoEncargo: EstadoEncargo
  createdAt: string
}

type EmpresaForm = {
  nombre: string
  nit: string
  sector: string
  ciiu: string
  actividadEconomica: string
  ciudad: string
  marcoContable: MarcoContable
}

// Vista previa del sector derivado del CIIU, compartida por los formularios.
function CiiuPreview({ ciiu }: { ciiu: string }) {
  if (!ciiu.trim()) return null
  const info = infoCiiu(ciiu)
  if (!info) {
    return <p className="text-xs text-amber-600 mt-1">Código CIIU no reconocido — se usará el sector indicado.</p>
  }
  return (
    <p className="text-xs text-emerald-600 mt-1">
      Sección {info.seccion} · {info.descripcion}
    </p>
  )
}

const ESTADO_CONFIG: Record<EstadoEncargo, { label: string; cls: string }> = {
  pendiente: { label: 'Evaluación pendiente', cls: 'bg-amber-50 text-amber-700' },
  aceptado: { label: 'Encargo aceptado', cls: 'bg-emerald-50 text-emerald-700' },
  rechazado: { label: 'Encargo rechazado', cls: 'bg-red-50 text-red-600' },
}

const MARCO_LABEL: Record<MarcoContable, string> = {
  NIIF: 'NIIF (Grupo 1)',
  NIIF_PYMES: 'NIIF Pymes (Grupo 2)',
  PCGA: 'PCGA (Grupo 3)',
}

export function EmpresasPage() {
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Empresa | null>(null)
  const [filterEstado, setFilterEstado] = useState<EstadoEncargo | 'todas'>('todas')
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: empresas = [], isLoading } = useQuery<Empresa[]>({
    queryKey: ['empresas'],
    queryFn: () => api.get<Empresa[]>('/empresas'),
  })

  const createMutation = useMutation({
    mutationFn: (body: EmpresaForm) => api.post('/empresas', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresas'] })
      setCreateOpen(false)
    },
  })

  const editMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: EmpresaForm }) =>
      api.put(`/empresas/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresas'] })
      setEditTarget(null)
    },
  })

  const filtered = empresas.filter((e) => {
    const matchSearch =
      e.nombre.toLowerCase().includes(search.toLowerCase()) ||
      e.nit.includes(search)
    const matchEstado = filterEstado === 'todas' || e.estadoEncargo === filterEstado
    return matchSearch && matchEstado
  })

  const counts = {
    total: empresas.length,
    aceptadas: empresas.filter((e) => e.estadoEncargo === 'aceptado').length,
    pendientes: empresas.filter((e) => e.estadoEncargo === 'pendiente').length,
  }

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Empresas clientes</h1>
          <p className="text-sm text-gray-500 mt-1">Gestiona las empresas y sus encargos de auditoría.</p>
        </div>
        <Button className="gap-2" onClick={() => setCreateOpen(true)}>
          <Plus size={15} /> Nueva empresa
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total empresas', value: counts.total, color: 'text-gray-900' },
          { label: 'Encargos aceptados', value: counts.aceptadas, color: 'text-emerald-600' },
          { label: 'En evaluación', value: counts.pendientes, color: 'text-amber-600' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o NIT..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div className="flex gap-1">
          {(['todas', 'pendiente', 'aceptado', 'rechazado'] as const).map((val) => (
            <button
              key={val}
              onClick={() => setFilterEstado(val)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize',
                filterEstado === val
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50',
              )}
            >
              {val === 'todas' ? 'Todas' : ESTADO_CONFIG[val].label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Building2 size={36} className="mb-3 opacity-40" />
            <p className="text-sm font-medium">No se encontraron empresas</p>
            <p className="text-xs mt-1">Intenta con otro filtro o crea una nueva empresa.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Empresa</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Sector</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Marco</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Estado encargo</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Registro</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((empresa) => {
                const estado = ESTADO_CONFIG[empresa.estadoEncargo]
                return (
                  <tr
                    key={empresa.id}
                    className="hover:bg-gray-50/50 transition-colors group cursor-pointer"
                    onClick={() => navigate(`/empresas/${empresa.id}`)}
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 text-xs font-bold">
                          {empresa.nombre.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{empresa.nombre}</p>
                          <p className="text-xs text-gray-400">{empresa.nit}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-gray-600">{empresa.sector}</td>
                    <td className="px-4 py-4 text-gray-600">{MARCO_LABEL[empresa.marcoContable]}</td>
                    <td className="px-4 py-4">
                      <span className={cn('inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium', estado.cls)}>
                        {estado.label}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-gray-400 text-xs">
                      {new Date(empresa.createdAt).toLocaleDateString('es-CO')}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditTarget(empresa) }}
                          className="flex items-center gap-1 text-xs text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity hover:text-gray-800 p-1.5 rounded-lg hover:bg-gray-100"
                          title="Editar empresa"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/empresas/${empresa.id}`) }}
                          className="flex items-center gap-1 text-xs text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity hover:underline"
                        >
                          Ver detalle <ChevronRight size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <NuevaEmpresaModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={(data) => createMutation.mutate(data)}
        loading={createMutation.isPending}
        error={createMutation.error instanceof Error ? createMutation.error.message : null}
      />

      {editTarget && (
        <EditarEmpresaModal
          empresa={editTarget}
          onClose={() => setEditTarget(null)}
          onSubmit={(body) => editMutation.mutate({ id: editTarget.id, body })}
          loading={editMutation.isPending}
          error={editMutation.error instanceof Error ? editMutation.error.message : null}
        />
      )}
    </div>
  )
}

const MARCO_OPTS = [
  { value: 'NIIF', label: 'NIIF (Grupo 1)' },
  { value: 'NIIF_PYMES', label: 'NIIF para Pymes (Grupo 2)' },
  { value: 'PCGA', label: 'PCGA (Grupo 3)' },
]

function NuevaEmpresaModal({
  open, onClose, onSubmit, loading, error,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (data: EmpresaForm) => void
  loading: boolean
  error: string | null
}) {
  const [form, setForm] = useState<EmpresaForm>({
    nombre: '',
    nit: '',
    sector: '',
    ciiu: '',
    actividadEconomica: '',
    ciudad: '',
    marcoContable: 'NIIF',
  })

  const sectorDerivado = infoCiiu(form.ciiu)?.sector
  const sectorLock = !!sectorDerivado
  const sectorValor = sectorDerivado
    ? sectorDerivado.charAt(0).toUpperCase() + sectorDerivado.slice(1)
    : form.sector

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nombre || !form.nit || (!sectorValor && !sectorDerivado)) return
    onSubmit({ ...form, sector: sectorValor })
  }

  return (
    <Modal open={open} onClose={onClose} title="Nueva empresa cliente">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="nueva-nombre"
          label="Razón social"
          placeholder="Comercializadora XYZ S.A.S"
          value={form.nombre}
          onChange={(e) => setForm({ ...form, nombre: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            id="nueva-nit"
            label="NIT"
            placeholder="900.123.456-7"
            value={form.nit}
            onChange={(e) => setForm({ ...form, nit: e.target.value })}
          />
          <Input
            id="nueva-ciudad"
            label="Ciudad"
            placeholder="Bogotá D.C."
            value={form.ciudad}
            onChange={(e) => setForm({ ...form, ciudad: e.target.value })}
          />
        </div>
        <div>
          <Input
            id="nueva-ciiu"
            label="Código CIIU"
            placeholder="Ej: 4719"
            value={form.ciiu}
            onChange={(e) => setForm({ ...form, ciiu: e.target.value })}
          />
          <CiiuPreview ciiu={form.ciiu} />
        </div>
        <Input
          id="nueva-actividad"
          label="Actividad económica"
          placeholder="Comercio al por menor de productos de consumo"
          value={form.actividadEconomica}
          onChange={(e) => setForm({ ...form, actividadEconomica: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Input
              id="nueva-sector"
              label="Sector económico"
              placeholder="Comercio"
              value={sectorValor}
              disabled={sectorLock}
              onChange={(e) => setForm({ ...form, sector: e.target.value })}
            />
            {sectorLock && <p className="text-xs text-gray-400 mt-1">Derivado del CIIU</p>}
          </div>
          <Select
            id="nueva-marco"
            label="Marco contable"
            value={form.marcoContable}
            onChange={(e) => setForm({ ...form, marcoContable: e.target.value as MarcoContable })}
            options={MARCO_OPTS}
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={loading}>Crear empresa</Button>
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

  return (
    <Modal open onClose={onClose} title="Editar empresa">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="edit-nombre"
          label="Razón social"
          value={form.nombre}
          onChange={(e) => setForm({ ...form, nombre: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            id="edit-nit"
            label="NIT"
            value={form.nit}
            onChange={(e) => setForm({ ...form, nit: e.target.value })}
          />
          <Input
            id="edit-ciudad"
            label="Ciudad"
            value={form.ciudad}
            onChange={(e) => setForm({ ...form, ciudad: e.target.value })}
          />
        </div>
        <div>
          <Input
            id="edit-ciiu"
            label="Código CIIU"
            placeholder="Ej: 4719"
            value={form.ciiu}
            onChange={(e) => setForm({ ...form, ciiu: e.target.value })}
          />
          <CiiuPreview ciiu={form.ciiu} />
        </div>
        <Input
          id="edit-actividad"
          label="Actividad económica"
          value={form.actividadEconomica}
          onChange={(e) => setForm({ ...form, actividadEconomica: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Input
              id="edit-sector"
              label="Sector económico"
              value={sectorValor}
              disabled={sectorLock}
              onChange={(e) => setForm({ ...form, sector: e.target.value })}
            />
            {sectorLock && <p className="text-xs text-gray-400 mt-1">Derivado del CIIU</p>}
          </div>
          <Select
            id="edit-marco"
            label="Marco contable"
            value={form.marcoContable}
            onChange={(e) => setForm({ ...form, marcoContable: e.target.value as MarcoContable })}
            options={MARCO_OPTS}
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={loading}>Guardar cambios</Button>
        </div>
      </form>
    </Modal>
  )
}
