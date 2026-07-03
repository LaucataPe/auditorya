import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FlagTriangleRight, CheckCircle, MessageSquare, Check, Lock } from 'lucide-react'
import type { CierreAuditoria, NotaRevisionConPapel } from '@auditorya/types'
import { Button } from '../ui/Button'
import { Textarea } from '../ui/Textarea'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/auth.store'

const AREA_LABEL: Record<string, string> = {
  efectivo: 'Efectivo', cartera: 'Cartera', inventarios: 'Inventarios',
  propiedad_planta_equipo: 'PP&E', proveedores: 'Proveedores', nomina: 'Nómina',
  impuestos: 'Impuestos', ingresos: 'Ingresos', gastos: 'Gastos',
  patrimonio: 'Patrimonio', otro: 'Otro',
}

type ChecklistState = {
  hechosPosteriores: string
  hechosPosterioresEvaluado: boolean
  negocioMarcha: string
  negocioMarchaEvaluado: boolean
  revisionCalidad: string
  revisionCalidadCompleta: boolean
}

export function CierreTab({ auditoriaId }: { auditoriaId: string }) {
  const { user } = useAuthStore()
  const esSocio = user?.rol === 'socio'
  const queryClient = useQueryClient()

  const { data: cierre, isLoading } = useQuery<CierreAuditoria>({
    queryKey: ['cierre', auditoriaId],
    queryFn: () => api.get<CierreAuditoria>(`/auditorias/${auditoriaId}/cierre`),
  })

  const { data: notas = [] } = useQuery<NotaRevisionConPapel[]>({
    queryKey: ['notas-revision', auditoriaId],
    queryFn: () => api.get<NotaRevisionConPapel[]>(`/auditorias/${auditoriaId}/notas-revision`),
  })

  const [form, setForm] = useState<ChecklistState>({
    hechosPosteriores: '', hechosPosterioresEvaluado: false,
    negocioMarcha: '', negocioMarchaEvaluado: false,
    revisionCalidad: '', revisionCalidadCompleta: false,
  })

  useEffect(() => {
    if (cierre) {
      setForm({
        hechosPosteriores: cierre.hechosPosteriores ?? '',
        hechosPosterioresEvaluado: cierre.hechosPosterioresEvaluado,
        negocioMarcha: cierre.negocioMarcha ?? '',
        negocioMarchaEvaluado: cierre.negocioMarchaEvaluado,
        revisionCalidad: cierre.revisionCalidad ?? '',
        revisionCalidadCompleta: cierre.revisionCalidadCompleta,
      })
    }
  }, [cierre?.id])

  const cerrado = cierre?.cerrado ?? false
  const invalidateCierre = () => queryClient.invalidateQueries({ queryKey: ['cierre', auditoriaId] })

  const guardar = useMutation({
    mutationFn: () => api.put(`/auditorias/${auditoriaId}/cierre`, form),
    onSuccess: invalidateCierre,
  })
  const cerrar = useMutation({
    mutationFn: () => api.post(`/auditorias/${auditoriaId}/cierre/cerrar`, {}),
    onSuccess: invalidateCierre,
  })
  const reabrir = useMutation({
    mutationFn: () => api.post(`/auditorias/${auditoriaId}/cierre/reabrir`, {}),
    onSuccess: invalidateCierre,
  })
  const resolverNota = useMutation({
    mutationFn: (id: string) => api.put(`/notas-revision/${id}`, { estado: 'resuelta' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notas-revision', auditoriaId] }),
  })

  const notasAbiertas = notas.filter((n) => n.estado === 'abierta')

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    )
  }

  const items: { key: keyof ChecklistState; check: keyof ChecklistState; titulo: string; hint: string }[] = [
    { key: 'hechosPosteriores', check: 'hechosPosterioresEvaluado', titulo: 'Hechos posteriores (NIA 560)', hint: 'Procedimientos sobre hechos ocurridos entre el cierre y la fecha del informe.' },
    { key: 'negocioMarcha', check: 'negocioMarchaEvaluado', titulo: 'Negocio en marcha (NIA 570)', hint: 'Evaluación de la capacidad de la entidad para continuar como negocio en marcha.' },
    { key: 'revisionCalidad', check: 'revisionCalidadCompleta', titulo: 'Revisión de calidad del encargo (NIA 220)', hint: 'Revisión del socio: suficiencia de la evidencia, conclusiones y documentación.' },
  ]

  const dirty =
    !!cierre &&
    (form.hechosPosteriores !== (cierre.hechosPosteriores ?? '') ||
      form.hechosPosterioresEvaluado !== cierre.hechosPosterioresEvaluado ||
      form.negocioMarcha !== (cierre.negocioMarcha ?? '') ||
      form.negocioMarchaEvaluado !== cierre.negocioMarchaEvaluado ||
      form.revisionCalidad !== (cierre.revisionCalidad ?? '') ||
      form.revisionCalidadCompleta !== cierre.revisionCalidadCompleta)

  return (
    <div className="space-y-5">
      {cerrado && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle size={16} />
          <span>
            Encargo cerrado{cierre?.cerradoAt ? ` el ${new Date(cierre.cerradoAt).toLocaleDateString('es-CO')}` : ''}.
          </span>
          {esSocio && (
            <Button size="sm" variant="secondary" className="ml-auto" loading={reabrir.isPending} onClick={() => reabrir.mutate()}>
              Reabrir
            </Button>
          )}
        </div>
      )}

      {/* Checklist de cierre */}
      <div className="space-y-4">
        {items.map((it) => (
          <div key={it.key} className="bg-white rounded-xl border border-gray-200 p-5">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                checked={form[it.check] as boolean}
                disabled={cerrado}
                onChange={(e) => setForm((f) => ({ ...f, [it.check]: e.target.checked }))}
              />
              <div>
                <p className="text-sm font-semibold text-gray-800">{it.titulo}</p>
                <p className="text-xs text-gray-400">{it.hint}</p>
              </div>
            </label>
            <Textarea
              id={`cierre-${it.key}`}
              label=""
              rows={3}
              className="mt-3"
              placeholder="Documenta el procedimiento aplicado y la conclusión."
              value={form[it.key] as string}
              disabled={cerrado}
              onChange={(e) => setForm((f) => ({ ...f, [it.key]: e.target.value }))}
            />
          </div>
        ))}
      </div>

      {!cerrado && (
        <div className="flex justify-end">
          <Button size="sm" loading={guardar.isPending} disabled={!dirty} onClick={() => guardar.mutate()}>
            Guardar checklist
          </Button>
        </div>
      )}

      {/* Notas de revisión pendientes */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-1.5 mb-3">
          <MessageSquare size={15} className="text-gray-400" />
          <h4 className="text-sm font-semibold text-gray-800">Notas de revisión</h4>
          {notasAbiertas.length > 0 ? (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
              {notasAbiertas.length} abierta{notasAbiertas.length !== 1 ? 's' : ''}
            </span>
          ) : (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Todas resueltas</span>
          )}
        </div>
        {notasAbiertas.length === 0 ? (
          <p className="text-xs text-gray-400">No hay notas de revisión sin resolver. Se crean desde cada papel de trabajo.</p>
        ) : (
          <div className="space-y-2">
            {notasAbiertas.map((n) => (
              <div key={n.id} className="flex items-start justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-gray-800">{n.texto}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {n.papelTitulo ? `${n.papelTitulo}${n.papelArea ? ` · ${AREA_LABEL[n.papelArea] ?? n.papelArea}` : ''}` : 'Papel'}
                  </p>
                </div>
                <button
                  onClick={() => resolverNota.mutate(n.id)}
                  disabled={resolverNota.isPending}
                  className="text-emerald-600 hover:bg-emerald-50 rounded p-1 shrink-0 transition-colors"
                  title="Marcar resuelta"
                >
                  <Check size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cerrar encargo */}
      {!cerrado && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                <FlagTriangleRight size={15} className="text-indigo-500" /> Cerrar el encargo
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                Deja constancia del cierre. Requiere resolver todas las notas de revisión. Solo el socio responsable.
              </p>
            </div>
            {esSocio ? (
              <Button
                size="sm"
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 shrink-0"
                loading={cerrar.isPending}
                disabled={notasAbiertas.length > 0}
                onClick={() => cerrar.mutate()}
              >
                <Lock size={13} /> Cerrar encargo
              </Button>
            ) : (
              <span className="text-xs text-gray-400 shrink-0">Solo el socio cierra</span>
            )}
          </div>
          {cerrar.isError && (
            <p className="text-xs text-red-600 mt-2">
              {cerrar.error instanceof Error ? cerrar.error.message : 'No se pudo cerrar'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
