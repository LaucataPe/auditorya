import { create } from 'zustand'
import type { ReactNode } from 'react'

export type ConfirmOpciones = {
  titulo: string
  /** Cuerpo del diálogo. Los saltos de línea se respetan. */
  descripcion?: ReactNode
  /** Texto del botón que confirma. Default: 'Eliminar' en danger, 'Confirmar' en primary. */
  confirmar?: string
  cancelar?: string
  variante?: 'danger' | 'primary'
}

type Pendiente = ConfirmOpciones & { id: number; resolve: (ok: boolean) => void }

type ConfirmState = {
  /** Cola: se muestra la primera. Evita que dos confirmaciones se pisen. */
  cola: Pendiente[]
  responder: (id: number, ok: boolean) => void
}

let seq = 0

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  cola: [],
  responder: (id, ok) => {
    const pendiente = get().cola.find((p) => p.id === id)
    if (!pendiente) return
    set((s) => ({ cola: s.cola.filter((p) => p.id !== id) }))
    pendiente.resolve(ok)
  },
}))

/**
 * Reemplazo de `window.confirm` con el look de la app.
 * Uso: `if (!(await confirmar({ titulo: '¿Eliminar el rol?' }))) return`
 */
export function confirmar(opciones: ConfirmOpciones): Promise<boolean> {
  return new Promise((resolve) => {
    const id = ++seq
    useConfirmStore.setState((s) => ({ cola: [...s.cola, { ...opciones, id, resolve }] }))
  })
}
