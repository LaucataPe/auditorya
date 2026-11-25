import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  COMPONENTES_CALIDAD,
  FORMATOS_CALIDAD,
  cumplimientoComponente,
  diasParaCorte,
  estadoFormato,
} from '@auditorya/types'
import { useCalidad } from '../hooks/useCalidad'
import { toast } from '../store/toast.store'
import { cn } from '../lib/cn'
import { CalidadResumen } from '../components/calidad/CalidadResumen'
import { CalidadFormatos } from '../components/calidad/CalidadFormatos'
import { CalidadEvaluacion } from '../components/calidad/CalidadEvaluacion'
import { CalidadHistorial } from '../components/calidad/CalidadHistorial'
import { CalidadManual } from '../components/calidad/CalidadManual'
import { EdicionModal } from '../components/calidad/CalidadModales'
import { FormatoCalidadModal } from '../components/calidad/FormatoCalidadModal'
import { SubirFormatoModal } from '../components/calidad/SubirFormatoModal'
import { hoyISO, type Edicion } from '../components/calidad/calidad-ui'

const VISTAS = [
  { clave: 'resumen', label: 'Resumen' },
  { clave: 'formatos', label: 'Formatos' },
  { clave: 'manual', label: 'Manual' },
  { clave: 'historial', label: 'Historial' },
] as const

type Vista = (typeof VISTAS)[number]['clave']

/**
 * Sistema de gestión de calidad de la firma (NIGC 1). La vista activa vive en la URL
 * (?vista=formatos) para poder enlazarla desde otras pantallas.
 */
export function CalidadPage() {
  const [params, setParams] = useSearchParams()
  const vista: Vista = VISTAS.some((v) => v.clave === params.get('vista')) ? (params.get('vista') as Vista) : 'resumen'
  const [anio, setAnio] = useState(new Date().getFullYear())
  const calidad = useCalidad(anio)
  const [edicion, setEdicion] = useState<Edicion | null>(null)
  const [formatoAbierto, setFormatoAbierto] = useState<{ formato: string; id: string } | null>(null)
  const [formatoASubir, setFormatoASubir] = useState<string | null>(null)
  const sistema = calidad.data

  /** Abre el formato en su borrador o última versión firmada; si no existe, lo crea (socio). */
  async function abrirFormato(formato: string) {
    const resumen = sistema?.documentos.find((d) => d.formato === formato)
    const id = resumen?.borrador?.id ?? resumen?.firmado?.id
    if (id) return setFormatoAbierto({ formato, id })
    if (!sistema?.puedeGestionar) return toast.info('Este formato aún no ha sido creado por un socio.')
    const doc = await calidad.crearDocumento.mutateAsync(formato).catch(() => null)
    if (doc) setFormatoAbierto({ formato, id: doc.id })
  }

  if (calidad.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    )
  }
  if (!sistema) return <p className="p-8 text-sm text-red-600">No se pudo cargar el sistema de calidad.</p>

  const hoy = hoyISO()
  const cumplidos = COMPONENTES_CALIDAD.filter(
    (c) => cumplimientoComponente(c.clave, sistema, hoy).estado === 'cumplido',
  ).length
  const porFirmar = FORMATOS_CALIDAD.filter(
    (f) => estadoFormato(sistema.documentos.find((d) => d.formato === f.clave), hoy) !== 'firmado',
  ).length
  const dias = diasParaCorte(sistema.evaluacion.fechaCorte, new Date())
  // Anillo de avance: circunferencia de r=15.5 ≈ 97.4
  const arco = (cumplidos / 8) * 97.4

  return (
    <div className="space-y-6 p-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Sistema de gestión de calidad</h1>
          <p className="mt-1 text-sm text-gray-500">
            NIGC 1 (aplicación anticipada) · cubre también el NICC 1 vigente
          </p>
        </div>
        <div className="flex items-center gap-3.5 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <svg width="52" height="52" viewBox="0 0 36 36" aria-hidden="true">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e5e7eb" strokeWidth="4" />
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke="#10b981"
              strokeWidth="4"
              strokeDasharray={`${arco} 97.4`}
              strokeLinecap="round"
              transform="rotate(-90 18 18)"
            />
          </svg>
          <div>
            <p className="text-xl font-bold text-gray-900">{cumplidos} de 8</p>
            <p className="text-xs text-gray-500">
              componentes cumplidos ·{' '}
              {sistema.evaluacion.concluidoAt
                ? 'evaluación concluida'
                : dias < 0
                  ? `corte vencido hace ${-dias} días`
                  : `faltan ${dias} días`}
            </p>
          </div>
        </div>
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b border-gray-200" aria-label="Vistas de calidad">
        {VISTAS.map((v) => (
          <button
            key={v.clave}
            type="button"
            onClick={() => setParams(v.clave === 'resumen' ? {} : { vista: v.clave }, { replace: true })}
            aria-current={vista === v.clave ? 'page' : undefined}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition-colors',
              vista === v.clave
                ? 'border-indigo-600 font-medium text-indigo-700'
                : 'border-transparent text-gray-500 hover:text-gray-700',
            )}
          >
            {v.label}
            {v.clave === 'formatos' && porFirmar > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                {porFirmar} por firmar
              </span>
            )}
          </button>
        ))}
      </nav>

      {vista === 'resumen' && (
        <>
          <CalidadEvaluacion sistema={sistema} calidad={calidad} anio={anio} onAnio={setAnio} />
          <CalidadResumen
            key={anio}
            sistema={sistema}
            calidad={calidad}
            onEditar={setEdicion}
            onAbrirFormato={abrirFormato}
          />
        </>
      )}
      {vista === 'formatos' && (
        <CalidadFormatos
          sistema={sistema}
          onAbrir={abrirFormato}
          onSubir={setFormatoASubir}
          creando={calidad.crearDocumento.isPending}
          calidad={calidad}
        />
      )}
      {vista === 'manual' && <CalidadManual sistema={sistema} calidad={calidad} />}
      {vista === 'historial' && <CalidadHistorial sistema={sistema} />}

      {edicion && <EdicionModal edicion={edicion} calidad={calidad} onClose={() => setEdicion(null)} />}
      {formatoASubir && (
        <SubirFormatoModal
          formato={formatoASubir}
          calidad={calidad}
          hayBorrador={!!sistema.documentos.find((d) => d.formato === formatoASubir)?.borrador}
          onClose={() => setFormatoASubir(null)}
        />
      )}
      {formatoAbierto && (
        <FormatoCalidadModal
          formato={formatoAbierto.formato}
          documentoId={formatoAbierto.id}
          calidad={calidad}
          puedeGestionar={sistema.puedeGestionar}
          onClose={() => setFormatoAbierto(null)}
        />
      )}
    </div>
  )
}
