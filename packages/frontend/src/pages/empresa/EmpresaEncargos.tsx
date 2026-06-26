import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ChevronRight, ClipboardList, Plus } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'

type FaseAuditoria = 'planificacion' | 'ejecucion' | 'revision' | 'finalizada'
type TipoAuditoria = 'financiera' | 'integral' | 'especial'

type Empresa = { id: string; nombre: string; estadoEncargo: string }

type Auditoria = {
  id: string
  empresaId: string
  socioId: string
  periodo: string
  tipo: TipoAuditoria
  estado: FaseAuditoria
  materialidadAprobada: boolean
  createdAt: string
}

type Usuario = { id: string; nombre: string; rol: string }

const FASE_BADGE: Record<FaseAuditoria, string> = {
  planificacion: 'bg-indigo-50 text-indigo-700',
  ejecucion: 'bg-amber-50 text-amber-700',
  revision: 'bg-violet-50 text-violet-700',
  finalizada: 'bg-emerald-50 text-emerald-700',
}

const FASE_LABEL: Record<FaseAuditoria, string> = {
  planificacion: 'Planificación',
  ejecucion: 'Ejecución',
  revision: 'Revisión',
  finalizada: 'Finalizada',
}

const FASE_BAR: Record<FaseAuditoria, string> = {
  planificacion: 'bg-indigo-600',
  ejecucion: 'bg-amber-500',
  revision: 'bg-violet-600',
  finalizada: 'bg-emerald-500',
}

const FASE_ORDER: Record<FaseAuditoria, number> = {
  planificacion: 1, ejecucion: 2, revision: 3, finalizada: 4,
}

const FASES = ['planificacion', 'ejecucion', 'revision', 'finalizada'] as FaseAuditoria[]

const TIPO_LABEL: Record<TipoAuditoria, string> = {
  financiera: 'Auditoría financiera',
  integral: 'Auditoría integral',
  especial: 'Auditoría especial',
}

export function EmpresaEncargos() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [filtro, setFiltro] = useState<FaseAuditoria | 'todas'>('todas')

  const { data: empresa } = useQuery<Empresa>({
    queryKey: ['empresa', id],
    queryFn: () => api.get<Empresa>(`/empresas/${id}`),
    enabled: !!id,
  })

  const { data: auditorias = [], isLoading } = useQuery<Auditoria[]>({
    queryKey: ['auditorias', id],
    queryFn: () => api.get<Auditoria[]>(`/empresas/${id}/auditorias`),
    enabled: !!id,
  })

  const { data: usuarios = [] } = useQuery<Usuario[]>({
    queryKey: ['usuarios'],
    queryFn: () => api.get<Usuario[]>(`/firmas/mia/usuarios`),
  })

  const nombrePorId = (uid: string) => usuarios.find((u) => u.id === uid)?.nombre ?? '—'

  const createMutation = useMutation({
    mutationFn: (body: { periodo: string; tipo: TipoAuditoria; socioId: string }) =>
      api.post(`/empresas/${id}/auditorias`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auditorias', id] })
      setModalOpen(false)
    },
  })

  const filtered = filtro === 'todas' ? auditorias : auditorias.filter((e) => e.estado === filtro)
  const bloqueado = empresa?.estadoEncargo !== 'aceptado'

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Encargos</h1>
          <p className="text-sm text-gray-500 mt-1">Auditorías realizadas a {empresa?.nombre}.</p>
        </div>
        {!bloqueado && (
          <Button className="gap-2" size="sm" onClick={() => setModalOpen(true)}>
            <Plus size={14} /> Nuevo encargo
          </Button>
        )}
      </div>

      {bloqueado && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700">
            Completa la evaluación de aceptación antes de crear encargos.{' '}
            <button onClick={() => navigate(`/empresas/${id}/evaluacion`)} className="underline">
              Ir a evaluación
            </button>
          </p>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2">
        {(['todas', ...FASES] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              filtro === f
                ? 'bg-indigo-600 text-white'
                : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50',
            )}
          >
            {f === 'todas' ? 'Todos' : FASE_LABEL[f]}
          </button>
        ))}
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center">
          <ClipboardList size={36} className="text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-400">Sin encargos</p>
          {!bloqueado && (
            <Button size="sm" className="mt-4" onClick={() => setModalOpen(true)}>
              Crear primer encargo
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((auditoria) => {
            const faseIdx = FASE_ORDER[auditoria.estado] - 1
            return (
              <div
                key={auditoria.id}
                onClick={() => navigate(`/empresas/${id}/encargos/${auditoria.id}`)}
                className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 cursor-pointer hover:border-indigo-200 hover:shadow-md transition-all group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs text-gray-400 font-medium">Período {auditoria.periodo}</span>
                      <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', FASE_BADGE[auditoria.estado])}>
                        {FASE_LABEL[auditoria.estado]}
                      </span>
                    </div>
                    <p className="font-semibold text-gray-900">{TIPO_LABEL[auditoria.tipo]}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Socio responsable: {nombrePorId(auditoria.socioId)}</p>
                  </div>
                  <ChevronRight size={15} className="text-gray-300 group-hover:text-indigo-500 transition-colors mt-1" />
                </div>
                <div className="flex gap-1">
                  {FASES.map((fase, idx) => (
                    <div key={fase} className="flex-1">
                      <div className={cn('h-1.5 rounded-full', idx <= faseIdx ? FASE_BAR[auditoria.estado] : 'bg-gray-100')} />
                      <p className={cn('text-xs mt-1', idx === faseIdx ? 'text-gray-700 font-medium' : 'text-gray-300')}>
                        {FASE_LABEL[fase]}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <NuevoEncargoModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        usuarios={usuarios}
        loading={createMutation.isPending}
        error={createMutation.error instanceof Error ? createMutation.error.message : null}
        onCreate={(body) => createMutation.mutate(body)}
      />
    </div>
  )
}

function NuevoEncargoModal({
  open, onClose, onCreate, usuarios, loading, error,
}: {
  open: boolean
  onClose: () => void
  usuarios: Usuario[]
  loading: boolean
  error: string | null
  onCreate: (e: { periodo: string; tipo: TipoAuditoria; socioId: string }) => void
}) {
  const socios = usuarios.filter((u) => u.rol === 'socio')
  const opcionesSocio = (socios.length > 0 ? socios : usuarios).map((u) => ({ value: u.id, label: u.nombre }))

  const [form, setForm] = useState({
    periodo: (new Date().getFullYear() - 1).toString(),
    tipo: 'financiera' as TipoAuditoria,
    socioId: '',
  })

  const socioId = form.socioId || opcionesSocio[0]?.value || ''

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!socioId) return
    onCreate({ periodo: form.periodo, tipo: form.tipo, socioId })
  }

  return (
    <Modal open={open} onClose={onClose} title="Nuevo encargo de auditoría">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="enc-periodo"
          label="Período auditado"
          placeholder="Ej: 2025"
          value={form.periodo}
          onChange={(e) => setForm({ ...form, periodo: e.target.value })}
        />
        <Select
          id="enc-tipo"
          label="Tipo de auditoría"
          value={form.tipo}
          onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoAuditoria })}
          options={[
            { value: 'financiera', label: 'Auditoría financiera' },
            { value: 'integral', label: 'Auditoría integral' },
            { value: 'especial', label: 'Auditoría especial' },
          ]}
        />
        <Select
          id="enc-socio"
          label="Socio responsable"
          value={socioId}
          onChange={(e) => setForm({ ...form, socioId: e.target.value })}
          options={opcionesSocio.length > 0 ? opcionesSocio : [{ value: '', label: 'Sin usuarios' }]}
        />

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={loading} disabled={!socioId}>Crear encargo</Button>
        </div>
      </form>
    </Modal>
  )
}
