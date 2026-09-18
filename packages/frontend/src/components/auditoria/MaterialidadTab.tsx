import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, Lock, ShieldCheck, TableProperties } from 'lucide-react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/auth.store'
import type { BasesMaterialidad } from '@auditorya/types'

export type BaseCalculo = 'activos' | 'ingresos' | 'utilidad_antes_impuestos' | 'patrimonio'

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

/** Solo dígitos, formateados con separador de miles (es-CO) para mostrar. */
const miles = (digitos: string) => (digitos ? Number(digitos).toLocaleString('es-CO') : '')
const soloDigitos = (s: string) => s.replace(/\D/g, '')

const cop = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(
    isFinite(n) ? n : 0,
  )

export type ValoresMaterialidad = {
  baseCalculo: BaseCalculo
  montoBase: number
  porcentaje: number
  porcentajeDesempeno: number
  justificacion: string
}

type FormState = { baseCalculo: BaseCalculo; montoBase: string; porcentaje: string; porcentajeDesempeno: string; justificacion: string }

const FORM_VACIO: FormState = { baseCalculo: 'utilidad_antes_impuestos', montoBase: '', porcentaje: '5', porcentajeDesempeno: '75', justificacion: '' }

function aForm(v: Partial<ValoresMaterialidad> | null | undefined): FormState {
  if (!v) return FORM_VACIO
  return {
    baseCalculo: v.baseCalculo ?? FORM_VACIO.baseCalculo,
    montoBase: v.montoBase != null ? String(Math.round(v.montoBase)) : '',
    porcentaje: v.porcentaje != null ? String(v.porcentaje) : FORM_VACIO.porcentaje,
    porcentajeDesempeno: v.porcentajeDesempeno != null ? String(v.porcentajeDesempeno) : FORM_VACIO.porcentajeDesempeno,
    justificacion: v.justificacion ?? '',
  }
}

/**
 * Formulario de cálculo de la materialidad (NIA 320), reutilizable: lo usa la pestaña
 * clásica y la tarjeta del agente al "Ajustar" la materialidad propuesta.
 */
export function MaterialidadForm({
  auditoriaId, valoresIniciales, bloqueado = false, guardando = false, error, botonLabel = 'Guardar materialidad',
  onGuardar, acciones, pie,
}: {
  auditoriaId: string
  valoresIniciales?: Partial<ValoresMaterialidad> | null
  bloqueado?: boolean
  guardando?: boolean
  error?: string | null
  botonLabel?: string
  onGuardar: (valores: ValoresMaterialidad) => void
  /** Acciones extra a la derecha del botón de guardar (p. ej. aprobar, cancelar). */
  acciones?: React.ReactNode
  pie?: React.ReactNode
}) {
  const [form, setForm] = useState<FormState>(() => aForm(valoresIniciales))

  // Sincroniza cuando cambian los valores iniciales (p. ej. llega la materialidad guardada).
  useEffect(() => { if (valoresIniciales) setForm(aForm(valoresIniciales)) }, [valoresIniciales])

  const { data: balance } = useQuery<{ bases: BasesMaterialidad } | null>({
    queryKey: ['balance', auditoriaId],
    queryFn: () => api.get<{ bases: BasesMaterialidad } | null>(`/auditorias/${auditoriaId}/balance`),
  })

  // Cálculo en vivo
  const montoBaseN = Number(form.montoBase) || 0
  const porcentajeN = Number(form.porcentaje) || 0
  const desempenoN = Number(form.porcentajeDesempeno) || 0
  const materialidadCalc = montoBaseN * (porcentajeN / 100)
  const desempenoCalc = materialidadCalc * (desempenoN / 100)
  const montoValido = montoBaseN > 0 && porcentajeN > 0 && desempenoN > 0
  const montoSugerido = balance?.bases ? balance.bases[form.baseCalculo] : null

  return (
    <div className="space-y-4">
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
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Ej: 500.000.000"
          value={miles(form.montoBase)}
          disabled={bloqueado}
          onChange={(e) => setForm({ ...form, montoBase: soloDigitos(e.target.value) })}
        />
        {!bloqueado && montoSugerido != null && montoSugerido > 0 && (
          <button
            type="button"
            onClick={() => setForm({ ...form, montoBase: String(Math.round(montoSugerido)) })}
            className="text-xs text-indigo-600 hover:underline mt-1 inline-flex items-center gap-1"
          >
            <TableProperties size={11} /> Tomar del balance: {cop(montoSugerido)}
          </button>
        )}
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

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="flex items-center justify-between pt-1">
        <div className="flex gap-2">
          {!bloqueado && (
            <Button
              size="sm"
              loading={guardando}
              disabled={!montoValido}
              onClick={() => onGuardar({
                baseCalculo: form.baseCalculo, montoBase: montoBaseN, porcentaje: porcentajeN,
                porcentajeDesempeno: desempenoN, justificacion: form.justificacion.trim(),
              })}
            >
              {botonLabel}
            </Button>
          )}
        </div>
        {acciones}
      </div>
      {pie}
    </div>
  )
}

export function MaterialidadTab({ auditoriaId }: { auditoriaId: string }) {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const esSocio = user?.rol === 'socio'

  const { data: materialidad, isLoading } = useQuery<Materialidad | null>({
    queryKey: ['materialidad', auditoriaId],
    queryFn: () => api.get<Materialidad | null>(`/auditorias/${auditoriaId}/materialidad`),
  })

  const [editando, setEditando] = useState(false)

  const saveMutation = useMutation({
    mutationFn: (v: ValoresMaterialidad) =>
      api.post(`/auditorias/${auditoriaId}/materialidad`, {
        baseCalculo: v.baseCalculo,
        montoBase: v.montoBase,
        porcentaje: v.porcentaje,
        porcentajeDesempeno: v.porcentajeDesempeno,
        justificacion: v.justificacion || undefined,
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

  const bloqueado = !!materialidad?.aprobada && !editando
  const valoresIniciales: ValoresMaterialidad | null = materialidad
    ? {
        baseCalculo: materialidad.baseCalculo, montoBase: Number(materialidad.montoBase), porcentaje: Number(materialidad.porcentaje),
        porcentajeDesempeno: Number(materialidad.porcentajeDesempeno), justificacion: materialidad.justificacion ?? '',
      }
    : null

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
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

        <MaterialidadForm
          auditoriaId={auditoriaId}
          valoresIniciales={valoresIniciales}
          bloqueado={bloqueado}
          guardando={saveMutation.isPending}
          error={saveMutation.isError ? (saveMutation.error instanceof Error ? saveMutation.error.message : 'Error al guardar') : null}
          onGuardar={(v) => saveMutation.mutate(v)}
          acciones={
            <>
              {bloqueado && (
                <Button size="sm" variant="secondary" onClick={() => setEditando(true)}>
                  Editar
                </Button>
              )}
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
            </>
          }
          pie={
            <>
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
            </>
          }
        />
      </div>
    </div>
  )
}
