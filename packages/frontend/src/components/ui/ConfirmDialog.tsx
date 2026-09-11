import { useEffect, useRef } from 'react'
import { Modal } from './Modal'
import { Button } from './Button'
import { useConfirmStore } from '../../store/confirm.store'

/** Diálogo de confirmación global. Montar una sola vez, junto al Toaster. */
export function ConfirmDialog() {
  const { cola, responder } = useConfirmStore()
  const actual = cola[0]
  const botonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (actual) botonRef.current?.focus()
  }, [actual?.id])

  if (!actual) return null

  const variante = actual.variante ?? 'danger'
  const etiquetaConfirmar =
    actual.confirmar ?? (variante === 'danger' ? 'Eliminar' : 'Confirmar')

  return (
    <Modal
      key={actual.id}
      open
      onClose={() => responder(actual.id, false)}
      title={actual.titulo}
      size="sm"
    >
      {actual.descripcion && (
        <div className="whitespace-pre-line text-sm leading-relaxed text-gray-600">
          {actual.descripcion}
        </div>
      )}
      <div className={`flex justify-end gap-2 ${actual.descripcion ? 'mt-6' : ''}`}>
        <Button variant="secondary" onClick={() => responder(actual.id, false)}>
          {actual.cancelar ?? 'Cancelar'}
        </Button>
        <Button ref={botonRef} variant={variante} onClick={() => responder(actual.id, true)}>
          {etiquetaConfirmar}
        </Button>
      </div>
    </Modal>
  )
}
