import { useState } from 'react'
import { Plus } from 'lucide-react'
import {
  COMPONENTES_CALIDAD,
  DECISION_CAMBIO_LABEL,
  TIPOS_CAMBIO_RELEVANTE,
  TIPOS_CAMBIO_RELEVANTE_CLAVES,
  type CambioRelevante,
  type ComponenteCalidad,
  type DecisionCambioRelevante,
  type SistemaCalidad,
  type TipoCambioRelevante,
} from '@auditorya/types'
import { cn } from '../../lib/cn'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Select } from '../ui/Select'
import { Textarea } from '../ui/Textarea'
import { fecha, hoyISO, tituloComponente, type Calidad } from './calidad-ui'

/**
 * Cambios relevantes del año (¶27): qué pasó, a qué componentes afecta y qué se decidió.
 * Vive en Valoración de riesgos, que es el componente que mantiene el sistema al día.
 */
export function CambiosRelevantes({ sistema, calidad }: { sistema: SistemaCalidad; calidad: Calidad }) {
  const [modal, setModal] = useState<{ cambio?: CambioRelevante } | null>(null)
  const gestiona = sistema.puedeGestionar
  const cambios = sistema.cambiosRelevantes
  const anio = sistema.evaluacion.anio

  return (
    <div id="cambios-relevantes" className="scroll-mt-4 space-y-3 border-t border-gray-100 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">Cambios relevantes {anio}</p>
          <p className="text-xs text-gray-500">
            Si sale o entra un socio, llega un cliente de un sector regulado o cambia una norma, regístralo aquí con lo que
            decidieron, aunque la decisión sea no cambiar nada.
          </p>
        </div>
        {gestiona && (
          <Button size="sm" variant="secondary" className="gap-1" onClick={() => setModal({})}>
            <Plus size={14} /> Registrar cambio
          </Button>
        )}
      </div>

      {cambios.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 px-4 py-4 text-center text-sm text-gray-500">
          Sin cambios relevantes registrados en {anio}.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
          {cambios.map((x) => (
            <li key={x.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
              <span className="w-28 shrink-0 whitespace-nowrap pt-0.5 text-xs tabular-nums text-gray-500">{fecha(x.fecha)}</span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm text-gray-900">
                  <span className="font-medium">{TIPOS_CAMBIO_RELEVANTE[x.tipo] ?? x.tipo}.</span> {x.descripcion}
                </p>
                <div className="flex flex-wrap gap-1">
                  {x.componentes.map((k) => (
                    <span key={k} className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">
                      {tituloComponente(k)}
                    </span>
                  ))}
                </div>
                {x.decision ? (
                  <p className="text-xs text-emerald-700">
                    {DECISION_CAMBIO_LABEL[x.decision]}: {x.justificacion}
                    <span className="text-gray-500">
                      {' '}
                      · {x.evaluadoPorNombre ?? '—'}, {x.evaluadoAt ? fecha(x.evaluadoAt) : ''}
                    </span>
                  </p>
                ) : (
                  <p className="text-xs font-medium text-amber-700">Sin evaluar: falta decidir si requiere ajustes.</p>
                )}
              </div>
              {!x.decision && gestiona && (
                <Button size="sm" onClick={() => setModal({ cambio: x })}>
                  Evaluar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {modal && <CambioModal cambio={modal.cambio} calidad={calidad} onClose={() => setModal(null)} />}
    </div>
  )
}

/** Registrar un cambio (con o sin decisión) o, si viene `cambio`, dejar la decisión de uno ya registrado. */
function CambioModal({ cambio, calidad, onClose }: { cambio?: CambioRelevante; calidad: Calidad; onClose: () => void }) {
  const hoy = hoyISO()
  const [fechaCambio, setFechaCambio] = useState(hoy)
  const [tipo, setTipo] = useState<TipoCambioRelevante>('socio')
  const [descripcion, setDescripcion] = useState('')
  const [componentes, setComponentes] = useState<ComponenteCalidad[]>([])
  const [decision, setDecision] = useState<DecisionCambioRelevante | 'despues'>(cambio ? 'sin_ajustes' : 'despues')
  const [justificacion, setJustificacion] = useState('')
  const pending = calidad.registrarCambio.isPending || calidad.evaluarCambio.isPending

  function alternar(k: ComponenteCalidad) {
    setComponentes((cs) => (cs.includes(k) ? cs.filter((x) => x !== k) : [...cs, k]))
  }

  function guardar() {
    if (cambio) {
      if (decision === 'despues') return
      calidad.evaluarCambio.mutate({ id: cambio.id, decision, justificacion }, { onSuccess: onClose })
      return
    }
    calidad.registrarCambio.mutate(
      {
        fecha: fechaCambio,
        tipo,
        descripcion,
        componentes,
        decision: decision === 'despues' ? undefined : { decision, justificacion },
      },
      { onSuccess: onClose },
    )
  }

  const opciones: { valor: DecisionCambioRelevante | 'despues'; titulo: string; ayuda: string }[] = [
    ...(cambio ? [] : [{ valor: 'despues' as const, titulo: 'Lo evaluamos después', ayuda: 'Queda pendiente en la lista.' }]),
    { valor: 'sin_ajustes', titulo: DECISION_CAMBIO_LABEL.sin_ajustes, ayuda: 'El sistema sigue sirviendo; explica por qué.' },
    {
      valor: 'ajustado',
      titulo: DECISION_CAMBIO_LABEL.ajustado,
      ayuda: 'Cuenta qué se cambió. Los ajustes se hacen con «Editar diseño» en cada componente afectado.',
    },
  ]

  return (
    <Modal open onClose={onClose} title={cambio ? 'Evaluar cambio relevante' : 'Registrar cambio relevante'} size="lg">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          guardar()
        }}
      >
        {cambio ? (
          <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-800">
            <p>
              <span className="font-medium">{TIPOS_CAMBIO_RELEVANTE[cambio.tipo]}</span> · {fecha(cambio.fecha)}
            </p>
            <p className="mt-0.5">{cambio.descripcion}</p>
            <p className="mt-1 text-xs text-gray-500">Afecta: {cambio.componentes.map(tituloComponente).join(', ')}</p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <Select
                id="cambio-tipo"
                label="Qué pasó"
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoCambioRelevante)}
                options={TIPOS_CAMBIO_RELEVANTE_CLAVES.map((k) => ({ value: k, label: TIPOS_CAMBIO_RELEVANTE[k] }))}
              />
              <label className="block space-y-1 text-sm">
                <span className="font-medium text-gray-700">Fecha</span>
                <input
                  type="date"
                  value={fechaCambio}
                  max={hoy}
                  required
                  onChange={(e) => setFechaCambio(e.target.value)}
                  className="block rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <Textarea
              label="Descripción"
              rows={2}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej.: se retiró la socia Ana Gómez, que tenía a cargo 6 revisorías fiscales."
              required
              minLength={5}
            />
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium text-gray-700">Componentes que afecta</legend>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {COMPONENTES_CALIDAD.map((c) => (
                  <label key={c.clave} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={componentes.includes(c.clave)}
                      onChange={() => alternar(c.clave)}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                    />
                    {c.titulo}
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        )}

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-gray-700">Qué decidieron</legend>
          {opciones.map((o) => (
            <label
              key={o.valor}
              className={cn(
                'flex cursor-pointer gap-2.5 rounded-lg border px-3 py-2 text-sm',
                decision === o.valor ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200',
              )}
            >
              <input
                type="radio"
                name="decision"
                checked={decision === o.valor}
                onChange={() => setDecision(o.valor)}
                className="mt-0.5 text-indigo-600"
              />
              <span>
                <span className="font-medium text-gray-900">{o.titulo}</span>
                <span className="block text-xs text-gray-500">{o.ayuda}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {decision !== 'despues' && (
          <Textarea
            label={decision === 'ajustado' ? 'Qué se ajustó' : 'Por qué no requiere ajustes'}
            rows={3}
            value={justificacion}
            onChange={(e) => setJustificacion(e.target.value)}
            placeholder={
              decision === 'ajustado'
                ? 'Ej.: se redistribuyeron sus encargos y se agregó un riesgo de capacidad en Recursos.'
                : 'Ej.: los otros dos socios absorben sus encargos sin superar su capacidad.'
            }
            required
            minLength={10}
          />
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={pending} disabled={!cambio && componentes.length === 0}>
            {cambio ? 'Guardar decisión' : 'Registrar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
