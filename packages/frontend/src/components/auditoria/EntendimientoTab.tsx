import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, BookOpen, RotateCcw } from 'lucide-react'
import { Button } from '../ui/Button'
import { Textarea } from '../ui/Textarea'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'

type Empresa = {
  id: string
  nombre: string
  sector: string
  modeloNegocio: string | null
  estructura: string | null
  personasClave: string | null
  entornoRegulatorio: string | null
  sistemaContable: string | null
}

type Entendimiento = {
  id: string
  cambiosSignificativos: string | null
  eventosSignificativos: string | null
  notas: string | null
  sinCambios: boolean
  confirmado: boolean
} | null

const ARCHIVO = [
  { key: 'modeloNegocio', label: 'Modelo de negocio' },
  { key: 'estructura', label: 'Estructura' },
  { key: 'personasClave', label: 'Personas clave' },
  { key: 'entornoRegulatorio', label: 'Entorno regulatorio' },
  { key: 'sistemaContable', label: 'Sistema contable' },
] as const

export function EntendimientoTab({
  auditoriaId,
  empresaId,
}: {
  auditoriaId: string
  empresaId: string
}) {
  const queryClient = useQueryClient()

  const { data: empresa } = useQuery<Empresa>({
    queryKey: ['empresa', empresaId],
    queryFn: () => api.get<Empresa>(`/empresas/${empresaId}`),
    enabled: !!empresaId,
  })

  const { data: ent, isLoading } = useQuery<Entendimiento>({
    queryKey: ['entendimiento', auditoriaId],
    queryFn: () => api.get<Entendimiento>(`/auditorias/${auditoriaId}/entendimiento`),
  })

  const [form, setForm] = useState({
    cambiosSignificativos: '',
    eventosSignificativos: '',
    notas: '',
    sinCambios: false,
  })

  useEffect(() => {
    if (ent) {
      setForm({
        cambiosSignificativos: ent.cambiosSignificativos ?? '',
        eventosSignificativos: ent.eventosSignificativos ?? '',
        notas: ent.notas ?? '',
        sinCambios: ent.sinCambios,
      })
    }
  }, [ent])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['entendimiento', auditoriaId] })
    queryClient.invalidateQueries({ queryKey: ['progreso', auditoriaId] })
  }

  const guardar = useMutation({
    mutationFn: (confirmado: boolean) =>
      api.put(`/auditorias/${auditoriaId}/entendimiento`, { ...form, confirmado }),
    onSuccess: invalidate,
  })

  const confirmado = ent?.confirmado ?? false
  const archivoVacio = empresa && ARCHIVO.every((f) => !empresa[f.key])

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Archivo permanente (referencia, solo lectura) */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-50">
          <BookOpen size={14} className="text-gray-400" />
          <p className="text-sm font-semibold text-gray-800">Archivo permanente del cliente</p>
        </div>
        {archivoVacio ? (
          <p className="px-5 py-4 text-sm text-gray-400 italic">
            Aún no se ha registrado el entendimiento estable del negocio. Puedes completarlo en la ficha de la empresa (Información).
          </p>
        ) : (
          <div className="divide-y divide-gray-50">
            {ARCHIVO.map((f) => {
              const v = empresa?.[f.key]
              if (!v) return null
              return (
                <div key={f.key} className="px-5 py-3">
                  <p className="text-xs text-gray-400 mb-0.5">{f.label}</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{v}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Estado confirmado */}
      {confirmado && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle size={15} />
          <span>Entendimiento del período confirmado.</span>
        </div>
      )}

      {/* Actualización del período */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 space-y-4">
        <p className="text-sm font-semibold text-gray-900">Actualización de este período</p>

        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={form.sinCambios}
            disabled={confirmado}
            onChange={(e) => setForm({ ...form, sinCambios: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm text-gray-700">
            Revisé el negocio y no hay cambios significativos frente al período anterior
          </span>
        </label>

        <Textarea
          id="ent-cambios" label="Cambios significativos del período" rows={3}
          placeholder="Cambios en el negocio, operaciones, estructura o personal clave"
          value={form.cambiosSignificativos} disabled={confirmado || form.sinCambios}
          onChange={(e) => setForm({ ...form, cambiosSignificativos: e.target.value })}
        />
        <Textarea
          id="ent-eventos" label="Eventos significativos" rows={3}
          placeholder="Litigios, nuevos contratos, adquisiciones, cambios regulatorios, partes relacionadas"
          value={form.eventosSignificativos} disabled={confirmado}
          onChange={(e) => setForm({ ...form, eventosSignificativos: e.target.value })}
        />
        <Textarea
          id="ent-notas" label="Notas adicionales" rows={2}
          placeholder="Supuestos de negocio en marcha, observaciones para la evaluación de riesgos"
          value={form.notas} disabled={confirmado}
          onChange={(e) => setForm({ ...form, notas: e.target.value })}
        />

        <div className="flex items-center gap-2 pt-1">
          {!confirmado ? (
            <>
              <Button size="sm" variant="secondary" loading={guardar.isPending && guardar.variables === false}
                onClick={() => guardar.mutate(false)}>
                Guardar borrador
              </Button>
              <Button size="sm" className="gap-1.5" loading={guardar.isPending && guardar.variables === true}
                onClick={() => guardar.mutate(true)}>
                <CheckCircle size={14} /> Confirmar entendimiento
              </Button>
            </>
          ) : (
            <Button size="sm" variant="secondary" className="gap-1.5"
              loading={guardar.isPending} onClick={() => guardar.mutate(false)}>
              <RotateCcw size={13} /> Reabrir para editar
            </Button>
          )}
        </div>
        {guardar.isError && (
          <p className={cn('text-xs text-red-600')}>
            {guardar.error instanceof Error ? guardar.error.message : 'Error al guardar'}
          </p>
        )}
      </div>
    </div>
  )
}
