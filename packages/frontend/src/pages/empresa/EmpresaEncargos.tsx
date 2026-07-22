import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ChevronRight, ClipboardList, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { useAuthStore } from '../../store/auth.store'

type FaseAuditoria = 'planificacion' | 'ejecucion' | 'revision' | 'finalizada'
type TipoAuditoria = 'financiera' | 'integral' | 'especial'
type TipoServicio = 'revisoria_fiscal' | 'auditoria_interna'

type Empresa = { id: string; nombre: string; estadoEncargo: string }

type Auditoria = {
  id: string
  empresaId: string
  socioId: string
  fechaInicio: string
  fechaFin: string
  tipoServicio: TipoServicio
  tipo: TipoAuditoria | null
  estado: FaseAuditoria
  materialidadAprobada: boolean
  createdAt: string
}

const SERVICIO_LABEL: Record<TipoServicio, string> = {
  revisoria_fiscal: 'Revisoría Fiscal',
  auditoria_interna: 'Auditoría Interna',
}

const SERVICIO_BADGE: Record<TipoServicio, string> = {
  revisoria_fiscal: 'bg-blue-50 text-blue-700',
  auditoria_interna: 'bg-purple-50 text-purple-700',
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
  const user = useAuthStore((s) => s.user)
  const [modalOpen, setModalOpen] = useState(false)
  const [filtro, setFiltro] = useState<FaseAuditoria | 'todas'>('todas')
  const [editTarget, setEditTarget] = useState<Auditoria | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Auditoria | null>(null)

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
    mutationFn: (body: { fechaInicio: string; fechaFin: string; tipoServicio: TipoServicio; tipo?: TipoAuditoria; socioId: string }) =>
      api.post(`/empresas/${id}/auditorias`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auditorias', id] })
      setModalOpen(false)
    },
  })

  const editMutation = useMutation({
    mutationFn: ({ auditoriaId, body }: { auditoriaId: string; body: EditarEncargoBody }) =>
      api.patch(`/auditorias/${auditoriaId}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auditorias', id] })
      setEditTarget(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (auditoriaId: string) => api.delete(`/auditorias/${auditoriaId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auditorias', id] })
      setDeleteTarget(null)
    },
  })

  const filtered = filtro === 'todas' ? auditorias : auditorias.filter((e) => e.estado === filtro)
  const bloqueado = empresa?.estadoEncargo !== 'aceptado'
  // Solo el socio responsable del encargo puede editarlo o eliminarlo (regla del backend).
  const puedeGestionar = (a: Auditoria) => user?.rol === 'socio' && user.id === a.socioId

  return (
    <div className="p-8 space-y-6">
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
                      <span className="text-xs text-gray-400 font-medium">
                        {new Date(auditoria.fechaInicio + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                        {' — '}
                        {new Date(auditoria.fechaFin + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                      <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', FASE_BADGE[auditoria.estado])}>
                        {FASE_LABEL[auditoria.estado]}
                      </span>
                      <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', SERVICIO_BADGE[auditoria.tipoServicio ?? 'revisoria_fiscal'])}>
                        {SERVICIO_LABEL[auditoria.tipoServicio ?? 'revisoria_fiscal']}
                      </span>
                    </div>
                    <p className="font-semibold text-gray-900">
                      {auditoria.tipo ? TIPO_LABEL[auditoria.tipo] : SERVICIO_LABEL[auditoria.tipoServicio ?? 'revisoria_fiscal']}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">Socio responsable: {nombrePorId(auditoria.socioId)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {puedeGestionar(auditoria) && (
                      <>
                        <button
                          type="button"
                          title="Editar encargo"
                          onClick={(e) => { e.stopPropagation(); setEditTarget(auditoria) }}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          title="Eliminar encargo"
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(auditoria) }}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                    <ChevronRight size={15} className="text-gray-300 group-hover:text-indigo-500 transition-colors" />
                  </div>
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

      <EditarEncargoModal
        auditoria={editTarget}
        onClose={() => { setEditTarget(null); editMutation.reset() }}
        usuarios={usuarios}
        loading={editMutation.isPending}
        error={editMutation.error instanceof Error ? editMutation.error.message : null}
        onSave={(body) => editTarget && editMutation.mutate({ auditoriaId: editTarget.id, body })}
      />

      <EliminarEncargoModal
        auditoria={deleteTarget}
        empresaNombre={empresa?.nombre}
        onClose={() => { setDeleteTarget(null); deleteMutation.reset() }}
        loading={deleteMutation.isPending}
        error={deleteMutation.error instanceof Error ? deleteMutation.error.message : null}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
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
  onCreate: (e: { fechaInicio: string; fechaFin: string; tipoServicio: TipoServicio; tipo?: TipoAuditoria; socioId: string }) => void
}) {
  const socios = usuarios.filter((u) => u.rol === 'socio')
  const opcionesSocio = (socios.length > 0 ? socios : usuarios).map((u) => ({ value: u.id, label: u.nombre }))

  const prevYear = new Date().getFullYear() - 1
  const [form, setForm] = useState({
    fechaInicio: `${prevYear}-01-01`,
    fechaFin: `${prevYear}-12-31`,
    tipoServicio: 'revisoria_fiscal' as TipoServicio,
    tipo: 'financiera' as TipoAuditoria,
    socioId: '',
  })
  const [fechaError, setFechaError] = useState<string | null>(null)

  const socioId = form.socioId || opcionesSocio[0]?.value || ''
  const esRevFiscal = form.tipoServicio === 'revisoria_fiscal'

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!socioId) return
    if (form.fechaFin <= form.fechaInicio) {
      setFechaError('La fecha de fin debe ser posterior a la fecha de inicio.')
      return
    }
    setFechaError(null)
    const body: { fechaInicio: string; fechaFin: string; tipoServicio: TipoServicio; tipo?: TipoAuditoria; socioId: string } = {
      fechaInicio: form.fechaInicio,
      fechaFin: form.fechaFin,
      tipoServicio: form.tipoServicio,
      socioId,
    }
    if (esRevFiscal) body.tipo = form.tipo
    onCreate(body)
  }

  return (
    <Modal open={open} onClose={onClose} title="Nuevo encargo de auditoría">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            id="enc-fecha-inicio"
            label="Fecha de inicio"
            type="date"
            value={form.fechaInicio}
            onChange={(e) => { setForm({ ...form, fechaInicio: e.target.value }); setFechaError(null) }}
          />
          <Input
            id="enc-fecha-fin"
            label="Fecha de fin"
            type="date"
            value={form.fechaFin}
            onChange={(e) => { setForm({ ...form, fechaFin: e.target.value }); setFechaError(null) }}
          />
        </div>
        {fechaError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{fechaError}</p>
        )}
        <Select
          id="enc-servicio"
          label="Tipo de servicio"
          value={form.tipoServicio}
          onChange={(e) => setForm({ ...form, tipoServicio: e.target.value as TipoServicio })}
          options={[
            { value: 'revisoria_fiscal', label: 'Revisoría Fiscal' },
            { value: 'auditoria_interna', label: 'Auditoría Interna (IIA IPPF)' },
          ]}
        />
        {esRevFiscal && (
          <Select
            id="enc-tipo"
            label="Modalidad"
            value={form.tipo}
            onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoAuditoria })}
            options={[
              { value: 'financiera', label: 'Auditoría financiera' },
              { value: 'integral', label: 'Auditoría integral' },
              { value: 'especial', label: 'Auditoría especial' },
            ]}
          />
        )}
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

type EditarEncargoBody = { fechaInicio: string; fechaFin: string; socioId: string; tipo?: TipoAuditoria }

function EditarEncargoModal({
  auditoria, onClose, onSave, usuarios, loading, error,
}: {
  auditoria: Auditoria | null
  onClose: () => void
  usuarios: Usuario[]
  loading: boolean
  error: string | null
  onSave: (body: EditarEncargoBody) => void
}) {
  const socios = usuarios.filter((u) => u.rol === 'socio')
  const opcionesSocio = (socios.length > 0 ? socios : usuarios).map((u) => ({ value: u.id, label: u.nombre }))

  const [form, setForm] = useState({
    fechaInicio: '', fechaFin: '', tipo: 'financiera' as TipoAuditoria, socioId: '',
  })
  const [fechaError, setFechaError] = useState<string | null>(null)

  useEffect(() => {
    if (auditoria) {
      setForm({
        fechaInicio: auditoria.fechaInicio,
        fechaFin: auditoria.fechaFin,
        tipo: auditoria.tipo ?? 'financiera',
        socioId: auditoria.socioId,
      })
      setFechaError(null)
    }
  }, [auditoria])

  const esRevFiscal = (auditoria?.tipoServicio ?? 'revisoria_fiscal') === 'revisoria_fiscal'

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.socioId) return
    if (form.fechaFin <= form.fechaInicio) {
      setFechaError('La fecha de fin debe ser posterior a la fecha de inicio.')
      return
    }
    setFechaError(null)
    const body: EditarEncargoBody = {
      fechaInicio: form.fechaInicio,
      fechaFin: form.fechaFin,
      socioId: form.socioId,
    }
    if (esRevFiscal) body.tipo = form.tipo
    onSave(body)
  }

  return (
    <Modal open={!!auditoria} onClose={onClose} title="Editar encargo">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            id="edit-fecha-inicio"
            label="Fecha de inicio"
            type="date"
            value={form.fechaInicio}
            onChange={(e) => { setForm({ ...form, fechaInicio: e.target.value }); setFechaError(null) }}
          />
          <Input
            id="edit-fecha-fin"
            label="Fecha de fin"
            type="date"
            value={form.fechaFin}
            onChange={(e) => { setForm({ ...form, fechaFin: e.target.value }); setFechaError(null) }}
          />
        </div>
        {fechaError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{fechaError}</p>
        )}

        {/* El tipo de servicio fija el flujo normativo y no se puede cambiar tras crear el encargo. */}
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">Tipo de servicio</span>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
            {SERVICIO_LABEL[auditoria?.tipoServicio ?? 'revisoria_fiscal']}
          </div>
          <p className="text-xs text-gray-400">El tipo de servicio no se puede cambiar.</p>
        </div>

        {esRevFiscal && (
          <Select
            id="edit-tipo"
            label="Modalidad"
            value={form.tipo}
            onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoAuditoria })}
            options={[
              { value: 'financiera', label: 'Auditoría financiera' },
              { value: 'integral', label: 'Auditoría integral' },
              { value: 'especial', label: 'Auditoría especial' },
            ]}
          />
        )}
        <Select
          id="edit-socio"
          label="Socio responsable"
          value={form.socioId}
          onChange={(e) => setForm({ ...form, socioId: e.target.value })}
          options={opcionesSocio.length > 0 ? opcionesSocio : [{ value: '', label: 'Sin usuarios' }]}
        />

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={loading} disabled={!form.socioId}>Guardar cambios</Button>
        </div>
      </form>
    </Modal>
  )
}

type ProgresoResumen = {
  riesgosTotal: number
  papelesTotal: number
  tareasTotal: number
  materialidadCalculada: boolean
  balanceCargado: boolean
  informes: Record<string, string>
  programasTotal: number
  hallazgosTotal: number
}

function EliminarEncargoModal({
  auditoria, empresaNombre, onClose, onConfirm, loading, error,
}: {
  auditoria: Auditoria | null
  empresaNombre?: string
  onClose: () => void
  loading: boolean
  error: string | null
  onConfirm: () => void
}) {
  const [texto, setTexto] = useState('')

  useEffect(() => { if (auditoria) setTexto('') }, [auditoria])

  const { data: progreso } = useQuery<ProgresoResumen>({
    queryKey: ['progreso', auditoria?.id],
    queryFn: () => api.get<ProgresoResumen>(`/auditorias/${auditoria!.id}/progreso`),
    enabled: !!auditoria,
  })

  const items: string[] = []
  if (progreso) {
    if (progreso.riesgosTotal) items.push(`${progreso.riesgosTotal} riesgo(s) identificado(s)`)
    if (progreso.papelesTotal) items.push(`${progreso.papelesTotal} papel(es) de trabajo y su evidencia`)
    if (progreso.tareasTotal) items.push(`${progreso.tareasTotal} tarea(s) del equipo`)
    if (progreso.materialidadCalculada) items.push('la materialidad calculada')
    if (progreso.balanceCargado) items.push('el balance de prueba cargado')
    const nInformes = Object.keys(progreso.informes ?? {}).length
    if (nInformes) items.push(`${nInformes} informe(s) / documento(s)`)
    if (progreso.programasTotal) items.push(`${progreso.programasTotal} programa(s) de auditoría interna`)
    if (progreso.hallazgosTotal) items.push(`${progreso.hallazgosTotal} hallazgo(s) de auditoría interna`)
  }

  const confirmado = texto.trim().toUpperCase() === 'ELIMINAR'

  return (
    <Modal open={!!auditoria} onClose={onClose} title="Eliminar encargo">
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">
            Esta acción es <strong>irreversible</strong>. Se eliminará el encargo
            {empresaNombre ? <> de <strong>{empresaNombre}</strong></> : null} y toda su información relacionada.
          </p>
        </div>

        {items.length > 0 && (
          <div>
            <p className="text-sm text-gray-600 mb-1">Junto con el encargo se borrará:</p>
            <ul className="text-sm text-gray-600 list-disc pl-5 space-y-0.5">
              {items.map((it) => <li key={it}>{it}</li>)}
            </ul>
          </div>
        )}

        <Input
          id="confirmar-eliminar"
          label="Escribe ELIMINAR para confirmar"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="ELIMINAR"
          autoComplete="off"
        />

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button
            type="button"
            variant="danger"
            className="disabled:opacity-50"
            loading={loading}
            disabled={!confirmado}
            onClick={onConfirm}
          >
            Eliminar encargo
          </Button>
        </div>
      </div>
    </Modal>
  )
}
