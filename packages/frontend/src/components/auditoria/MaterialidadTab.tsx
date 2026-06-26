import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, Lock, ShieldCheck } from 'lucide-react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/auth.store'

type BaseCalculo = 'activos' | 'ingresos' | 'utilidad_antes_impuestos' | 'patrimonio'

type Materialidad = {
  id: string
  baseCalculo: BaseCalculo
  montoBase: string
  porcentaje: string
  materialidad: string
  porcentajeDesempeno: string
  materialidadDesempeno: string
  justificacion: string | null
  aprobada: boolean
  aprobadaPor: string | null
  aprobadaAt: string | null
}

const BASE_OPTS = [
  { value: 'utilidad_antes_impuestos', label: 'Utilidad antes de impuestos' },
  { value: 'ingresos', label: 'Ingresos / Ventas' },
  { value: 'activos', label: 'Activos totales' },
  { value: 'patrimonio', label: 'Patrimonio' },
]

// Referencia de porcentajes habituales por base (NIA 320, criterio profesional)
const REF_PORCENTAJE: Record<BaseCalculo, string> = {
  utilidad_antes_impuestos: '≈ 5%',
  ingresos: '≈ 0.5% – 1%',
  activos: '≈ 0.5% – 1%',
  patrimonio: '≈ 1% – 2%',
}

const cop = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(
    isFinite(n) ? n : 0,
  )

export function MaterialidadTab({ auditoriaId }: { auditoriaId: string }) {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const esSocio = user?.rol === 'socio'

  const { data: materialidad, isLoading } = useQuery<Materialidad | null>({
    queryKey: ['materialidad', auditoriaId],
    queryFn: () => api.get<Materialidad | null>(`/auditorias/${auditoriaId}/materialidad`),
  })

  const [form, setForm] = useState({
    baseCalculo: 'utilidad_antes_impuestos' as BaseCalculo,
    montoBase: '',
    porcentaje: '5',
    porcentajeDesempeno: '75',
    justificacion: '',
  })
  const [editando, setEditando] = useState(false)

  // Sincroniza el formulario cuando llega la materialidad guardada.
  useEffect(() => {
    if (materialidad) {
      setForm({
        baseCalculo: materialidad.baseCalculo,
        montoBase: String(Number(materialidad.montoBase)),
        porcentaje: String(Number(materialidad.porcentaje)),
        porcentajeDesempeno: String(Number(materialidad.porcentajeDesempeno)),
        justificacion: materialidad.justificacion ?? '',
      })
    }
  }, [materialidad])

  const saveMutation = useMutation({
    mutationFn: () =>
      api.post(`/auditorias/${auditoriaId}/materialidad`, {
        baseCalculo: form.baseCalculo,
        montoBase: Number(form.montoBase),
        porcentaje: Number(form.porcentaje),
        porcentajeDesempeno: Number(form.porcentajeDesempeno),
        justificacion: form.justificacion || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materialidad', auditoriaId] })
      queryClient.invalidateQueries({ queryKey: ['auditoria', auditoriaId] })
      setEditando(false)
    },
  })

  const aprobarMutation = useMutation({
    mutationFn: () => api.post(`/auditorias/${auditoriaId}/materialidad/aprobar`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materialidad', auditoriaId] })
      queryClient.invalidateQueries({ queryKey: ['auditoria', auditoriaId] })
    },
  })

  // Cálculo en vivo
  const montoBaseN = Number(form.montoBase) || 0
  const porcentajeN = Number(form.porcentaje) || 0
  const desempenoN = Number(form.porcentajeDesempeno) || 0
  const materialidadCalc = montoBaseN * (porcentajeN / 100)
  const desempenoCalc = materialidadCalc * (desempenoN / 100)

  const bloqueado = !!materialidad?.aprobada && !editando
  const montoValido = montoBaseN > 0 && porcentajeN > 0 && desempenoN > 0

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Marco normativo */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-4">
        <p className="text-sm font-medium text-indigo-800">Materialidad — NIA 320</p>
        <p className="text-xs text-indigo-500 mt-1">
          Define el umbral a partir del cual un error es significativo. La materialidad de desempeño es
          un margen de seguridad (típicamente 50%–75% de la materialidad global) para planear las pruebas.
        </p>
      </div>

      {/* Estado de aprobación */}
      {materialidad?.aprobada && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle size={15} />
          <span>
            Materialidad aprobada
            {materialidad.aprobadaAt
              ? ` el ${new Date(materialidad.aprobadaAt).toLocaleDateString('es-CO')}`
              : ''}
            . La auditoría puede pasar a ejecución.
          </span>
        </div>
      )}

      {/* Formulario */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Cálculo de la materialidad</h3>
          {bloqueado && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Lock size={12} /> Aprobada — bloqueada
            </span>
          )}
        </div>

        <Select
          id="mat-base"
          label="Base de cálculo"
          value={form.baseCalculo}
          disabled={bloqueado}
          onChange={(e) => setForm({ ...form, baseCalculo: e.target.value as BaseCalculo })}
          options={BASE_OPTS}
        />

        <div>
          <Input
            id="mat-monto"
            label="Monto de la base (COP)"
            type="number"
            placeholder="Ej: 500000000"
            value={form.montoBase}
            disabled={bloqueado}
            onChange={(e) => setForm({ ...form, montoBase: e.target.value })}
          />
          {montoBaseN > 0 && <p className="text-xs text-gray-400 mt-1">{cop(montoBaseN)}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Input
              id="mat-porc"
              label="% materialidad"
              type="number"
              value={form.porcentaje}
              disabled={bloqueado}
              onChange={(e) => setForm({ ...form, porcentaje: e.target.value })}
            />
            <p className="text-xs text-gray-400 mt-1">Referencia {REF_PORCENTAJE[form.baseCalculo]}</p>
          </div>
          <Input
            id="mat-desemp"
            label="% materialidad de desempeño"
            type="number"
            value={form.porcentajeDesempeno}
            disabled={bloqueado}
            onChange={(e) => setForm({ ...form, porcentajeDesempeno: e.target.value })}
          />
        </div>

        <Input
          id="mat-just"
          label="Justificación (opcional)"
          placeholder="Razón de la base y el porcentaje elegidos"
          value={form.justificacion}
          disabled={bloqueado}
          onChange={(e) => setForm({ ...form, justificacion: e.target.value })}
        />

        {/* Resultado en vivo */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
            <p className="text-xs text-gray-400">Materialidad global</p>
            <p className="text-lg font-bold text-gray-900 mt-0.5">{cop(materialidadCalc)}</p>
          </div>
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3">
            <p className="text-xs text-indigo-400">Materialidad de desempeño</p>
            <p className="text-lg font-bold text-indigo-700 mt-0.5">{cop(desempenoCalc)}</p>
          </div>
        </div>

        {saveMutation.isError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {saveMutation.error instanceof Error ? saveMutation.error.message : 'Error al guardar'}
          </p>
        )}

        {/* Acciones */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex gap-2">
            {!bloqueado && (
              <Button
                size="sm"
                loading={saveMutation.isPending}
                disabled={!montoValido}
                onClick={() => saveMutation.mutate()}
              >
                Guardar materialidad
              </Button>
            )}
            {bloqueado && (
              <Button size="sm" variant="secondary" onClick={() => setEditando(true)}>
                Editar
              </Button>
            )}
          </div>

          {/* Aprobación — solo socio, solo si ya hay materialidad guardada y no aprobada */}
          {materialidad && !materialidad.aprobada && (
            <div className="flex flex-col items-end gap-1">
              <Button
                size="sm"
                variant="secondary"
                className="gap-1.5"
                disabled={!esSocio || aprobarMutation.isPending || editando}
                loading={aprobarMutation.isPending}
                onClick={() => aprobarMutation.mutate()}
              >
                <ShieldCheck size={14} /> Aprobar materialidad
              </Button>
              {!esSocio && (
                <p className="text-xs text-gray-400">Solo el socio responsable puede aprobar</p>
              )}
            </div>
          )}
        </div>

        {aprobarMutation.isError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {aprobarMutation.error instanceof Error ? aprobarMutation.error.message : 'Error al aprobar'}
          </p>
        )}

        {editando && materialidad?.aprobada && (
          <p className="text-xs text-amber-600">
            Si guardas cambios, la aprobación anterior quedará anulada y deberá aprobarse de nuevo.
          </p>
        )}
      </div>
    </div>
  )
}
