import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  detectarMapeo, aplicarMapeo, aplicarPerfil, validarBalance,
  CAMPOS_BALANCE, CAMPO_BALANCE_LABEL, CAMPOS_REQUERIDOS,
  type CampoBalance, type CuentaImport, type MapeoColumnas, type PerfilBalance,
} from '@auditorya/types'
import { AlertTriangle, ArrowLeft, CheckCircle2, Info, Users } from 'lucide-react'
import { Button } from '../ui/Button'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'

const cop = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    isFinite(n) ? n : 0,
  )

export type ArchivoBalance = {
  filas: string[][]
  nombre: string
  tamano: number
  contenido: string // base64
}

export type ImportarBalancePayload = {
  cuentas: CuentaImport[]
  perfil: PerfilBalance
  corteDesde: string | null
  corteHasta: string | null
}

type Props = {
  auditoriaId: string
  archivo: ArchivoBalance
  /** 'actual' importa el balance del período; 'comparativo' los saldos del año anterior. */
  modo: 'actual' | 'comparativo'
  onCancelar: () => void
  onImportar: (payload: ImportarBalancePayload) => void
  importando: boolean
  errorImportar: string | null
}

/**
 * Asistente de importación del balance: el usuario confirma qué campo es cada
 * columna (con sugerencia automática o el perfil guardado de la empresa) y ve
 * las validaciones aritméticas antes de importar.
 */
export function BalanceImportWizard(props: Props) {
  const { data: perfil, isLoading } = useQuery<PerfilBalance | null>({
    queryKey: ['perfil-balance', props.auditoriaId],
    queryFn: () => api.get<PerfilBalance | null>(`/auditorias/${props.auditoriaId}/perfil-balance`),
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    )
  }
  return <WizardInner {...props} perfilGuardado={perfil ?? null} />
}

function WizardInner({
  archivo, modo, perfilGuardado, onCancelar, onImportar, importando, errorImportar,
}: Props & { perfilGuardado: PerfilBalance | null }) {
  const deteccion = useMemo(() => detectarMapeo(archivo.filas), [archivo.filas])
  const [mapeo, setMapeo] = useState<MapeoColumnas>(() => {
    const delPerfil = perfilGuardado ? aplicarPerfil(perfilGuardado, deteccion) : null
    return delPerfil ?? deteccion.mapeo
  })
  const [desdePerfil] = useState(() => perfilGuardado !== null && aplicarPerfil(perfilGuardado, deteccion) !== null)
  const [paso, setPaso] = useState<'mapeo' | 'previa'>('mapeo')
  const [corteDesde, setCorteDesde] = useState('')
  const [corteHasta, setCorteHasta] = useState('')

  const faltantes = CAMPOS_REQUERIDOS.filter((campo) => !mapeo.includes(campo))

  function asignar(col: number, campo: CampoBalance | null) {
    setMapeo((prev) => prev.map((c, i) => (i === col ? campo : c === campo ? null : c)))
  }

  // Filas de muestra para que el usuario verifique el mapeo visualmente.
  const muestra = useMemo(() => {
    const datos = archivo.filas.slice(deteccion.filaDatos)
    const conCodigo = datos.filter((f) => /^\d+$/.test((f[0] ?? '').toString().trim()))
    return (conCodigo.length >= 4 ? conCodigo : datos).slice(0, 6)
  }, [archivo.filas, deteccion.filaDatos])

  const { cuentas, validacion } = useMemo(() => {
    if (paso !== 'previa') return { cuentas: [] as CuentaImport[], validacion: null }
    const cts = aplicarMapeo(archivo.filas, mapeo, deteccion.filaDatos)
    return { cuentas: cts, validacion: validarBalance(cts) }
  }, [paso, archivo.filas, mapeo, deteccion.filaDatos])

  // ─── Paso 1: mapear columnas ────────────────────────────────────────────────
  if (paso === 'mapeo') {
    return (
      <div className="space-y-5">
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-4">
          <p className="text-sm font-medium text-indigo-800">
            Paso 1 de 2 · ¿Qué es cada columna?
            {modo === 'comparativo' && ' — balance comparativo (año anterior)'}
          </p>
          <p className="text-xs text-indigo-500 mt-1">
            Confirma el campo que corresponde a cada columna de <strong>{archivo.nombre}</strong>.
            {modo === 'comparativo' && ' Solo se usarán el código y el saldo final al corte del año anterior.'}
            {desdePerfil
              ? ' Se aplicó el mapeo guardado de una importación anterior de esta empresa.'
              : deteccion.filaEncabezado !== null
                ? ' Se sugirió automáticamente a partir de los encabezados del archivo.'
                : ' El archivo no trae encabezados: se sugirió por el contenido de las columnas — revísalo con cuidado.'}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                {mapeo.map((campo, col) => (
                  <th key={col} className="px-2 py-2 text-left align-top min-w-[150px]">
                    <select
                      value={campo ?? ''}
                      onChange={(e) => asignar(col, (e.target.value || null) as CampoBalance | null)}
                      className={cn(
                        'w-full rounded-lg border px-2 py-1.5 text-xs font-medium focus:border-indigo-500 focus:outline-none',
                        campo ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-white text-gray-400',
                      )}
                    >
                      <option value="">Ignorar</option>
                      {CAMPOS_BALANCE.map((c) => (
                        <option key={c} value={c}>{CAMPO_BALANCE_LABEL[c]}</option>
                      ))}
                    </select>
                    {deteccion.encabezados?.[col] && (
                      <p className="mt-1 px-1 text-[10px] font-normal normal-case text-gray-400 truncate" title={deteccion.encabezados[col] ?? ''}>
                        «{deteccion.encabezados[col]}»
                      </p>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {muestra.map((fila, i) => (
                <tr key={i}>
                  {mapeo.map((campo, col) => (
                    <td key={col} className={cn('px-3 py-1.5 whitespace-nowrap text-xs', campo ? 'text-gray-700' : 'text-gray-300')}>
                      {(fila[col] ?? '').toString().trim() || '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {faltantes.length > 0 && (
          <p className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>
              Para importar debes asignar: {faltantes.map((f) => CAMPO_BALANCE_LABEL[f]).join(' y ')}.
            </span>
          </p>
        )}

        <div className="flex gap-3">
          <Button variant="secondary" onClick={onCancelar}>Cancelar</Button>
          <Button disabled={faltantes.length > 0} onClick={() => setPaso('previa')}>
            Continuar a la revisión
          </Button>
        </div>
      </div>
    )
  }

  // ─── Paso 2: validar y confirmar ────────────────────────────────────────────
  const resumen = cuentas.filter((c) => !c.tercero && c.nivel <= 6)
  const terceros = cuentas.filter((c) => c.tercero)
  const preview = resumen.slice(0, 8)
  const errores = validacion?.problemas.filter((p) => p.nivel === 'error') ?? []
  const advertencias = validacion?.problemas.filter((p) => p.nivel === 'advertencia') ?? []

  return (
    <div className="space-y-5">
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-4">
        <p className="text-sm font-medium text-indigo-800">
          Paso 2 de 2 · Revisión antes de importar
          {modo === 'comparativo' && ' — balance comparativo (año anterior)'}
        </p>
        <p className="text-xs text-indigo-500 mt-1">
          Se detectaron <strong>{resumen.length}</strong> cuentas y <strong>{terceros.length}</strong> registros por
          tercero en <strong>{archivo.nombre}</strong>. Revisa las validaciones y los saldos.
        </p>
      </div>

      {modo === 'actual' && (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <p className="text-xs font-medium text-gray-600">¿Qué período cubre este balance?</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Opcional, pero importante: si el corte no es un año completo, las cifras de resultado no son anualizadas
            (afecta materialidad y comparaciones).
          </p>
          <div className="mt-2 flex items-center gap-2 text-xs text-gray-600">
            <label className="flex items-center gap-1.5">
              Desde
              <input
                type="date" value={corteDesde} onChange={(e) => setCorteDesde(e.target.value)}
                className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
              />
            </label>
            <label className="flex items-center gap-1.5">
              Hasta
              <input
                type="date" value={corteHasta} onChange={(e) => setCorteHasta(e.target.value)}
                className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
              />
            </label>
          </div>
        </div>
      )}

      {validacion && validacion.problemas.length === 0 && (
        <p className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          <CheckCircle2 size={14} /> El balance cuadra: movimientos, ecuación patrimonial y jerarquía de cuentas verificados.
        </p>
      )}

      {[...errores, ...advertencias].map((p) => (
        <div
          key={p.clave}
          className={cn(
            'flex items-start gap-2.5 rounded-lg border px-3 py-2.5',
            p.nivel === 'error' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50',
          )}
        >
          <AlertTriangle size={15} className={cn('shrink-0 mt-0.5', p.nivel === 'error' ? 'text-red-500' : 'text-amber-500')} />
          <div>
            <p className="text-sm font-medium text-gray-800">{p.titulo}</p>
            <p className="text-xs text-gray-600 mt-0.5">{p.detalle}</p>
          </div>
        </div>
      ))}

      <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60 text-xs text-gray-500">
              <th className="px-3 py-2 text-left">Cuenta</th>
              <th className="px-3 py-2 text-right">Saldo inicial</th>
              <th className="px-3 py-2 text-right">Débitos</th>
              <th className="px-3 py-2 text-right">Créditos</th>
              <th className="px-3 py-2 text-right">Saldo final</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {preview.map((c, i) => (
              <tr key={i}>
                <td className="px-3 py-2">
                  <span className="text-xs text-gray-400">{c.codigo}</span>
                  <p className="text-gray-800">{c.nombre ?? '—'}</p>
                </td>
                <td className="px-3 py-2 text-right text-gray-500 whitespace-nowrap">{cop(c.saldoInicial)}</td>
                <td className="px-3 py-2 text-right text-gray-500 whitespace-nowrap">{c.debito == null ? '—' : cop(c.debito)}</td>
                <td className="px-3 py-2 text-right text-gray-500 whitespace-nowrap">{c.credito == null ? '—' : cop(c.credito)}</td>
                <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">{cop(c.saldoActual)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modo === 'actual' && terceros.length > 0 && (
        <p className="text-xs text-gray-400 flex items-center gap-1.5">
          <Users size={12} /> {terceros.length} registros por tercero (con NIT y razón social separados) para muestreo en ejecución.
        </p>
      )}

      {modo === 'actual' ? (
        <p className="text-xs text-gray-400 flex items-center gap-1.5">
          <Info size={12} /> El mapeo de columnas quedará guardado para la próxima importación de esta empresa.
        </p>
      ) : (
        <p className="text-xs text-gray-400 flex items-center gap-1.5">
          <Info size={12} /> Del comparativo solo se guardan código y saldo (sin terceros): es la base de las
          variaciones y tendencias frente al año anterior.
        </p>
      )}

      {errorImportar && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{errorImportar}</p>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" className="gap-1.5" onClick={() => setPaso('mapeo')}>
          <ArrowLeft size={13} /> Ajustar columnas
        </Button>
        <Button
          loading={importando}
          disabled={errores.length > 0}
          onClick={() =>
            onImportar({
              cuentas,
              perfil: { mapeo, encabezados: deteccion.encabezados },
              corteDesde: corteDesde || null,
              corteHasta: corteHasta || null,
            })
          }
        >
          {modo === 'actual' ? 'Importar balance' : 'Importar comparativo'}
        </Button>
      </div>
    </div>
  )
}
