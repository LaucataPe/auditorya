import { useState } from 'react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { Textarea } from '../ui/Textarea'
import type { Calidad, Edicion } from './calidad-ui'

/** Agregar, editar, desactivar o reactivar un objetivo, riesgo o respuesta (con motivo al cambiar). */
export function EdicionModal({ edicion, calidad, onClose }: { edicion: Edicion; calidad: Calidad; onClose: () => void }) {
  const [texto, setTexto] = useState(edicion.texto ?? '')
  const [motivo, setMotivo] = useState('')
  const pideTexto = edicion.modo === 'crear' || edicion.modo === 'editar'
  const campoTexto = edicion.tipo === 'objetivos' ? 'texto' : 'descripcion'
  const pending = calidad.crear.isPending || calidad.editar.isPending

  function guardar() {
    if (edicion.modo === 'crear') {
      calidad.crear.mutate(
        { tipo: edicion.tipo, body: { [edicion.padre!.campo]: edicion.padre!.valor, [campoTexto]: texto } },
        { onSuccess: onClose },
      )
      return
    }
    const body: Record<string, unknown> =
      edicion.modo === 'editar' ? { [campoTexto]: texto, motivo } : { activo: edicion.modo === 'reactivar', motivo }
    calidad.editar.mutate({ tipo: edicion.tipo, id: edicion.id!, body }, { onSuccess: onClose })
  }

  return (
    <Modal open onClose={onClose} title={edicion.titulo}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          guardar()
        }}
      >
        {pideTexto && (
          <Textarea label="Texto" rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} required minLength={5} />
        )}
        {edicion.modo !== 'crear' && (
          <Input
            label="Motivo del cambio"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Queda en la pista de auditoría"
            required
            minLength={3}
          />
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={pending}>
            Guardar
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/** Pide un texto corto (motivo obligatorio u observación opcional) antes de una acción. */
export function MotivoModal({
  titulo,
  descripcion,
  accion,
  opcional,
  pending,
  onClose,
  onConfirmar,
}: {
  titulo: string
  descripcion: string
  accion: string
  opcional?: boolean
  pending: boolean
  onClose: () => void
  onConfirmar: (texto: string) => void
}) {
  const [texto, setTexto] = useState('')
  return (
    <Modal open onClose={onClose} title={titulo}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          onConfirmar(texto.trim())
        }}
      >
        <Textarea
          label={opcional ? 'Nota' : 'Motivo'}
          rows={3}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={descripcion}
          required={!opcional}
          minLength={opcional ? undefined : 3}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={pending}>
            {accion}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
