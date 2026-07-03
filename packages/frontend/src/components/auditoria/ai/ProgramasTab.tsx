import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Plus, Pencil, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '../../ui/Button'
import { Modal } from '../../ui/Modal'
import { Input } from '../../ui/Input'
import { Select } from '../../ui/Select'
import { Textarea } from '../../ui/Textarea'
import { api } from '../../../lib/api'
import { cn } from '../../../lib/cn'

type EstadoPrograma = 'no_iniciado' | 'en_progreso' | 'completado'
type ProgramaAI = {
  id: string
  area: string
  objetivo: string | null
  alcance: string | null
  estado: EstadoPrograma
  asignadoA: string | null
}
type UsuarioResumen = { id: string; nombre: string }

const ESTADO_LABEL: Record<EstadoPrograma, string> = {
  no_iniciado: 'No iniciado',
  en_progreso: 'En progreso',
  completado: 'Completado',
}
const ESTADO_BADGE: Record<EstadoPrograma, string> = {
  no_iniciado: 'bg-gray-100 text-gray-600',
  en_progreso: 'bg-amber-50 text-amber-700',
  completado: 'bg-emerald-50 text-emerald-700',
}
const ESTADO_OPTS = (Object.keys(ESTADO_LABEL) as EstadoPrograma[]).map((v) => ({
  value: v, label: ESTADO_LABEL[v],
}))

export function ProgramasTab({ auditoriaId }: { auditoriaId: string }) {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<ProgramaAI | null>(null)
  const [expandido, setExpandido] = useState<string | null>(null)

  const { data: raw = [], isLoading } = useQuery<{ programa: ProgramaAI; asignado: UsuarioResumen | null }[]>({
    queryKey: ['programas-ai', auditoriaId],
    queryFn: () => api.get(`/auditorias/${auditoriaId}/ai/programas`),
  })
  const programas = raw.map((r) => ({ ...r.programa, asignadoNombre: r.asignado?.nombre ?? null }))

  const { data: usuarios = [] } = useQuery<UsuarioResumen[]>({
    queryKey: ['usuarios'],
    queryFn: () => api.get('/firmas/mia/usuarios'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/auditorias/${auditoriaId}/ai/programas/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['programas-ai', auditoriaId] }),
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-800">Programas de trabajo</p>
          <p className="text-xs text-gray-500 mt-0.5">Define el objetivo, alcance y responsable de cada área a auditar.</p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => { setEditando(null); setModalOpen(true) }}>
          <Plus size={14} /> Nuevo programa
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-purple-600 border-t-transparent" />
        </div>
      ) : programas.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center">
          <BookOpen size={32} className="text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-400">Sin programas de trabajo</p>
          <p className="text-xs text-gray-400 mt-1">Crea programas desde la pestaña Alcance o desde aquí.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {programas.map((p) => {
            const abierto = expandido === p.id
            return (
              <div key={p.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full shrink-0', ESTADO_BADGE[p.estado])}>
                      {ESTADO_LABEL[p.estado]}
                    </span>
                    <p className="text-sm font-semibold text-gray-900 truncate">{p.area}</p>
                    {p.asignadoNombre && (
                      <p className="text-xs text-gray-400 truncate">{p.asignadoNombre}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <button
                      onClick={() => { setEditando(p); setModalOpen(true) }}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(p.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                    <button
                      onClick={() => setExpandido(abierto ? null : p.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      {abierto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </div>
                {abierto && (
                  <div className="border-t border-gray-100 px-5 py-4 space-y-3 bg-gray-50">
                    <Detail label="Objetivo" value={p.objetivo} />
                    <Detail label="Alcance" value={p.alcance} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <ProgramaModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        auditoriaId={auditoriaId}
        programa={editando}
        usuarios={usuarios}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['programas-ai', auditoriaId] })
          setModalOpen(false)
        }}
      />
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value?.trim()) return null
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{value}</p>
    </div>
  )
}

function ProgramaModal({
  open, onClose, auditoriaId, programa, usuarios, onSuccess,
}: {
  open: boolean
  onClose: () => void
  auditoriaId: string
  programa: ProgramaAI | null
  usuarios: UsuarioResumen[]
  onSuccess: () => void
}) {
  const [form, setForm] = useState({
    area: programa?.area ?? '',
    objetivo: programa?.objetivo ?? '',
    alcance: programa?.alcance ?? '',
    estado: (programa?.estado ?? 'no_iniciado') as EstadoPrograma,
    asignadoA: programa?.asignadoA ?? '',
  })

  const isEdit = !!programa

  const mutation = useMutation({
    mutationFn: (body: typeof form) => {
      const payload = {
        ...body,
        asignadoA: body.asignadoA || null,
      }
      return isEdit
        ? api.put(`/auditorias/${auditoriaId}/ai/programas/${programa.id}`, payload)
        : api.post(`/auditorias/${auditoriaId}/ai/programas`, payload)
    },
    onSuccess,
  })

  const usuariosOpts = [
    { value: '', label: 'Sin asignar' },
    ...usuarios.map((u) => ({ value: u.id, label: u.nombre })),
  ]

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.area.trim()) return
    mutation.mutate(form)
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar programa' : 'Nuevo programa de trabajo'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="pg-area"
          label="Área / proceso auditado"
          placeholder="Ej: Tesorería y Efectivo"
          value={form.area}
          onChange={(e) => setForm({ ...form, area: e.target.value })}
        />
        <Textarea
          id="pg-objetivo"
          label="Objetivo del programa"
          placeholder="¿Qué busca evaluar este programa?"
          value={form.objetivo}
          rows={3}
          onChange={(e) => setForm({ ...form, objetivo: e.target.value })}
        />
        <Textarea
          id="pg-alcance"
          label="Alcance"
          placeholder="Período, transacciones, sistemas o ubicaciones incluidos..."
          value={form.alcance}
          rows={3}
          onChange={(e) => setForm({ ...form, alcance: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-3">
          <Select
            id="pg-estado"
            label="Estado"
            value={form.estado}
            onChange={(e) => setForm({ ...form, estado: e.target.value as EstadoPrograma })}
            options={ESTADO_OPTS}
          />
          <Select
            id="pg-asignado"
            label="Asignado a"
            value={form.asignadoA}
            onChange={(e) => setForm({ ...form, asignadoA: e.target.value })}
            options={usuariosOpts}
          />
        </div>
        {mutation.isError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {mutation.error instanceof Error ? mutation.error.message : 'Error al guardar'}
          </p>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={mutation.isPending} disabled={!form.area.trim()}>
            {isEdit ? 'Guardar cambios' : 'Crear programa'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
