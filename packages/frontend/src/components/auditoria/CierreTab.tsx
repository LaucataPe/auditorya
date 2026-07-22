import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FlagTriangleRight, CheckCircle, MessageSquare, Check, Lock, Plus, Trash2, Scale } from 'lucide-react'
import {
  TIPO_AJUSTE_LABEL, EFECTO_AJUSTE_LABEL, OPINION_LABEL,
  type CierreAuditoria, type NotaRevisionConPapel,
  type Ajuste, type EvaluacionOpinion, type TipoAjuste, type EfectoAjuste, type OpinionSugerida,
} from '@auditorya/types'
import { Button } from '../ui/Button'
import { Textarea } from '../ui/Textarea'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/auth.store'
import { cn } from '../../lib/cn'

type HojaAjustesResp = { ajustes: Ajuste[]; materialidad: number | null; evaluacion: EvaluacionOpinion }

const cop = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(
    isFinite(n) ? n : 0,
  )

const OPINION_STYLE: Record<OpinionSugerida, string> = {
  favorable: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  con_salvedades: 'border-amber-200 bg-amber-50 text-amber-800',
  negativa: 'border-red-200 bg-red-50 text-red-800',
  sin_base: 'border-gray-200 bg-gray-50 text-gray-600',
}

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

      {/* Hoja de ajustes → opinión sugerida (NIA 450/700) */}
      <HojaAjustes auditoriaId={auditoriaId} cerrado={cerrado} />

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

function HojaAjustes({ auditoriaId, cerrado }: { auditoriaId: string; cerrado: boolean }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<{ descripcion: string; cuentaCodigo: string; monto: string; tipo: TipoAjuste; efecto: EfectoAjuste }>({
    descripcion: '', cuentaCodigo: '', monto: '', tipo: 'factual', efecto: 'resultado',
  })

  const { data } = useQuery<HojaAjustesResp>({
    queryKey: ['ajustes', auditoriaId],
    queryFn: () => api.get<HojaAjustesResp>(`/auditorias/${auditoriaId}/ajustes`),
  })

  const aplicar = (resp: HojaAjustesResp) => {
    queryClient.setQueryData(['ajustes', auditoriaId], resp)
    queryClient.invalidateQueries({ queryKey: ['progreso', auditoriaId] })
  }

  const crear = useMutation({
    mutationFn: () =>
      api.post<HojaAjustesResp>(`/auditorias/${auditoriaId}/ajustes`, {
        descripcion: form.descripcion.trim(),
        cuentaCodigo: form.cuentaCodigo.trim() || undefined,
        monto: Number(form.monto),
        tipo: form.tipo,
        efecto: form.efecto,
      }),
    onSuccess: (resp) => { aplicar(resp); setForm({ descripcion: '', cuentaCodigo: '', monto: '', tipo: 'factual', efecto: 'resultado' }) },
  })
  const actualizar = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) => api.put<HojaAjustesResp>(`/ajustes/${id}`, patch),
    onSuccess: aplicar,
  })
  const eliminar = useMutation({
    mutationFn: (id: string) => api.delete<HojaAjustesResp>(`/ajustes/${id}`),
    onSuccess: aplicar,
  })

  const ev = data?.evaluacion
  const ajustes = data?.ajustes ?? []
  const montoValido = form.descripcion.trim().length >= 2 && form.monto !== '' && !isNaN(Number(form.monto))

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-1.5 mb-1">
        <Scale size={15} className="text-gray-400" />
        <h4 className="text-sm font-semibold text-gray-800">Hoja de ajustes (NIA 450)</h4>
      </div>
      <p className="text-xs text-gray-400 mb-3">
        Acumula las incorrecciones encontradas. El total no corregido, comparado con la materialidad, sugiere el tipo de opinión.
      </p>

      {/* Opinión sugerida */}
      {ev && (
        <div className={cn('rounded-lg border px-4 py-3 mb-4', OPINION_STYLE[ev.opinionSugerida])}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Opinión sugerida: {OPINION_LABEL[ev.opinionSugerida]}</p>
            <span className="text-xs">
              No corregido {cop(ev.totalNoCorregido)} · Materialidad {ev.materialidad != null ? cop(ev.materialidad) : '—'}
            </span>
          </div>
          <p className="text-xs mt-1 opacity-90">{ev.razon}</p>
          <p className="text-[11px] mt-1.5 opacity-60">Sugerencia de apoyo: la opinión final es del juicio profesional del socio.</p>
        </div>
      )}

      {/* Lista de ajustes */}
      {ajustes.length > 0 && (
        <div className="rounded-lg border border-gray-100 overflow-hidden mb-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50/60 text-[11px] text-gray-500">
                <th className="px-2 py-1.5 text-left font-medium">Descripción</th>
                <th className="px-2 py-1.5 text-left font-medium">Efecto</th>
                <th className="px-2 py-1.5 text-right font-medium">Monto</th>
                <th className="px-2 py-1.5 text-center font-medium">Corregido</th>
                {!cerrado && <th className="px-2 py-1.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {ajustes.map((a) => (
                <tr key={a.id} className={cn(a.corregido && 'opacity-50')}>
                  <td className="px-2 py-1.5">
                    <p className="text-gray-800">{a.descripcion}</p>
                    <span className="text-[10px] text-gray-400">
                      {TIPO_AJUSTE_LABEL[a.tipo]}{a.cuentaCodigo ? ` · cuenta ${a.cuentaCodigo}` : ''}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-gray-500">{EFECTO_AJUSTE_LABEL[a.efecto]}</td>
                  <td className="px-2 py-1.5 text-right text-gray-700 whitespace-nowrap">{cop(Number(a.monto))}</td>
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={a.corregido}
                      disabled={cerrado || actualizar.isPending}
                      onChange={(e) => actualizar.mutate({ id: a.id, patch: { corregido: e.target.checked } })}
                    />
                  </td>
                  {!cerrado && (
                    <td className="px-2 py-1.5 text-right">
                      <button onClick={() => eliminar.mutate(a.id)} className="text-gray-300 hover:text-red-500" title="Eliminar">
                        <Trash2 size={12} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Alta de ajuste */}
      {!cerrado && (
        <div className="space-y-2">
          <div className="flex gap-2 flex-wrap">
            <input
              className="flex-1 min-w-[200px] rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              placeholder="Descripción del ajuste (ej: provisión de cartera no registrada)"
              value={form.descripcion}
              onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
            />
            <input
              className="w-28 rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              placeholder="Cuenta"
              value={form.cuentaCodigo}
              onChange={(e) => setForm((f) => ({ ...f, cuentaCodigo: e.target.value.replace(/[^0-9]/g, '') }))}
            />
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <input
              type="number"
              className="w-36 rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              placeholder="Monto $"
              value={form.monto}
              onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))}
            />
            <select
              className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 focus:outline-none"
              value={form.tipo}
              onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as TipoAjuste }))}
            >
              {(Object.keys(TIPO_AJUSTE_LABEL) as TipoAjuste[]).map((k) => <option key={k} value={k}>{TIPO_AJUSTE_LABEL[k]}</option>)}
            </select>
            <select
              className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 focus:outline-none"
              value={form.efecto}
              onChange={(e) => setForm((f) => ({ ...f, efecto: e.target.value as EfectoAjuste }))}
            >
              {(Object.keys(EFECTO_AJUSTE_LABEL) as EfectoAjuste[]).map((k) => <option key={k} value={k}>{EFECTO_AJUSTE_LABEL[k]}</option>)}
            </select>
            <Button size="sm" variant="secondary" className="gap-1.5" loading={crear.isPending} disabled={!montoValido} onClick={() => crear.mutate()}>
              <Plus size={13} /> Agregar
            </Button>
          </div>
          <p className="text-[11px] text-gray-400">
            Las reclasificaciones se listan pero no suman al total que se compara con la materialidad.
          </p>
        </div>
      )}
    </div>
  )
}
