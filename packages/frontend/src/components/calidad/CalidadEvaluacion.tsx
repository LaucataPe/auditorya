import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RotateCcw } from 'lucide-react'
import {
  COMPONENTES_CALIDAD,
  RESULTADO_EVALUACION_LABEL,
  componentesPorRevisar,
  diasParaCorte,
  estadoComponenteCalidad,
  type ResultadoEvaluacionCalidad,
  type SistemaCalidad,
} from '@auditorya/types'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Select } from '../ui/Select'
import { Textarea } from '../ui/Textarea'
import { MotivoModal } from './CalidadModales'
import { fecha, type Calidad } from './calidad-ui'

/**
 * Evaluación anual del sistema (¶53-54), compacta para ir arriba del Resumen: el año elegido
 * cambia toda la página. Incluye la fecha de corte, el responsable y la conclusión.
 */
export function CalidadEvaluacion({
  sistema,
  calidad,
  anio,
  onAnio,
}: {
  sistema: SistemaCalidad
  calidad: Calidad
  anio: number
  onAnio: (anio: number) => void
}) {
  const { evaluacion } = sistema
  const [concluirOpen, setConcluirOpen] = useState(false)
  const [reabrirOpen, setReabrirOpen] = useState(false)
  const revisados = 8 - componentesPorRevisar(evaluacion.componentesRevisados).length
  const enAtencion = COMPONENTES_CALIDAD.filter(
    (c) => estadoComponenteCalidad(c.clave, sistema, evaluacion.componentesRevisados) === 'atencion',
  ).length
  const dias = diasParaCorte(evaluacion.fechaCorte, new Date())
  const concluida = !!evaluacion.concluidoAt
  const listaParaConcluir = revisados === 8 && enAtencion === 0

  const { data: equipo = [] } = useQuery<{ id: string; nombre: string; rol: string }[]>({
    queryKey: ['equipo'],
    queryFn: () => api.get('/firmas/mia/usuarios'),
    enabled: sistema.puedeGestionar,
  })
  const socios = equipo.filter((u) => u.rol === 'socio')

  const actual = new Date().getFullYear()
  const anios = [...new Set([anio, actual, ...sistema.anteriores.map((a) => a.anio)])].sort((a, b) => b - a)
  const resultadoDe = (a: number) => sistema.anteriores.find((x) => x.anio === a)

  return (
    <section id="evaluacion-anual" className="scroll-mt-4 space-y-3 rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <label className="flex items-center gap-2 font-semibold text-gray-900">
            Evaluación anual
            <select
              value={anio}
              onChange={(e) => onAnio(Number(e.target.value))}
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm font-normal"
            >
              {anios.map((a) => (
                <option key={a} value={a}>
                  {a}
                  {resultadoDe(a)?.concluidoAt ? ' · concluida' : ''}
                </option>
              ))}
            </select>
          </label>
          <span className="flex items-center gap-2 text-gray-500">
            Corte:
            {sistema.puedeGestionar && !concluida ? (
              <input
                type="date"
                aria-label="Fecha de corte"
                value={evaluacion.fechaCorte}
                onChange={(e) => e.target.value && calidad.cambiarFechaCorte.mutate(e.target.value)}
                className="rounded-md border border-gray-300 px-2 py-0.5 text-xs text-gray-700"
              />
            ) : (
              <span className="text-gray-700">{fecha(evaluacion.fechaCorte)}</span>
            )}
          </span>
          <span className="flex items-center gap-2 text-gray-500">
            Responsable (¶20):
            {sistema.puedeGestionar ? (
              <select
                aria-label="Responsable del sistema de calidad"
                value={sistema.responsable?.id ?? ''}
                onChange={(e) => calidad.designarResponsable.mutate(e.target.value || null)}
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-800"
              >
                <option value="">Sin designar</option>
                {socios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-gray-700">{sistema.responsable?.nombre ?? 'Sin designar'}</span>
            )}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {concluida ? (
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              Concluida el {fecha(evaluacion.concluidoAt!)}
            </span>
          ) : (
            <span
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium',
                listaParaConcluir
                  ? 'bg-emerald-50 text-emerald-700'
                  : dias < 0
                    ? 'bg-red-50 text-red-700'
                    : 'bg-amber-50 text-amber-800',
              )}
            >
              {revisados} de 8 revisados · {dias < 0 ? `corte vencido hace ${-dias} días` : `faltan ${dias} días`}
            </span>
          )}
          {!concluida && sistema.puedeConcluir && (
            <Button
              size="sm"
              disabled={!listaParaConcluir}
              title={
                listaParaConcluir
                  ? undefined
                  : enAtencion > 0
                    ? `${enAtencion} componente(s) tienen riesgos sin respuesta`
                    : 'Marca los 8 componentes como revisados para poder concluir'
              }
              onClick={() => setConcluirOpen(true)}
            >
              Concluir evaluación
            </Button>
          )}
        </div>
      </div>

      {!sistema.responsable && !concluida && (
        <p className="text-xs text-amber-700">Sin responsable designado: mientras tanto, cualquier socio puede concluir.</p>
      )}

      {concluida && (
        <div className="space-y-1.5 rounded-lg bg-gray-50 px-4 py-3 text-sm">
          <p className="font-medium text-gray-900">{RESULTADO_EVALUACION_LABEL[evaluacion.resultado!]}</p>
          <p className="whitespace-pre-line text-gray-700">{evaluacion.conclusion}</p>
          {evaluacion.deficiencias && (
            <p className="whitespace-pre-line text-gray-700">
              <span className="font-medium">Deficiencias y acciones: </span>
              {evaluacion.deficiencias}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <span className="text-xs text-gray-500">Firmada por {evaluacion.concluidoPorNombre}</span>
            {sistema.puedeConcluir && (
              <Button variant="ghost" size="sm" onClick={() => setReabrirOpen(true)}>
                <RotateCcw size={14} className="mr-1.5" /> Reabrir
              </Button>
            )}
          </div>
        </div>
      )}

      {concluirOpen && <ConcluirModal calidad={calidad} anio={anio} onClose={() => setConcluirOpen(false)} />}
      {reabrirOpen && (
        <MotivoModal
          titulo={`Reabrir la evaluación ${anio}`}
          descripcion="La conclusión actual queda guardada en la pista de auditoría."
          accion="Reabrir"
          pending={calidad.reabrir.isPending}
          onClose={() => setReabrirOpen(false)}
          onConfirmar={(motivo) => calidad.reabrir.mutate(motivo, { onSuccess: () => setReabrirOpen(false) })}
        />
      )}
    </section>
  )
}

function ConcluirModal({ calidad, anio, onClose }: { calidad: Calidad; anio: number; onClose: () => void }) {
  const [resultado, setResultado] = useState<ResultadoEvaluacionCalidad>('razonable')
  const [conclusion, setConclusion] = useState('')
  const [deficiencias, setDeficiencias] = useState('')
  const conDeficiencias = resultado !== 'razonable'

  return (
    <Modal open onClose={onClose} title={`Concluir la evaluación ${anio}`} size="lg">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          calidad.concluir.mutate(
            { resultado, conclusion, deficiencias: conDeficiencias ? deficiencias : null },
            { onSuccess: onClose },
          )
        }}
      >
        <Select
          id="resultado-calidad"
          label="Conclusión (¶54)"
          value={resultado}
          onChange={(e) => setResultado(e.target.value as ResultadoEvaluacionCalidad)}
          options={(Object.keys(RESULTADO_EVALUACION_LABEL) as ResultadoEvaluacionCalidad[]).map((k) => ({
            value: k,
            label: RESULTADO_EVALUACION_LABEL[k],
          }))}
        />
        <Textarea
          label="Fundamento de la conclusión"
          rows={4}
          value={conclusion}
          onChange={(e) => setConclusion(e.target.value)}
          placeholder="Qué se revisó, resultados del seguimiento y por qué se llega a esta conclusión…"
          required
        />
        {conDeficiencias && (
          <Textarea
            label="Deficiencias y acciones correctivas"
            rows={3}
            value={deficiencias}
            onChange={(e) => setDeficiencias(e.target.value)}
            required
          />
        )}
        <p className="text-xs text-gray-500">
          Al concluir, la evaluación queda firmada a tu nombre y no se puede cambiar sin reabrirla.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={calidad.concluir.isPending}>
            Concluir y firmar
          </Button>
        </div>
      </form>
    </Modal>
  )
}
