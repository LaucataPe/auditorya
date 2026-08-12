import { create } from 'zustand'

export type Toast = {
  id: number
  tipo: 'success' | 'error' | 'info'
  mensaje: string
}

type ToastState = {
  toasts: Toast[]
  push: (tipo: Toast['tipo'], mensaje: string) => void
  dismiss: (id: number) => void
}

let seq = 0
const DURACION_MS = 5000

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (tipo, mensaje) => {
    const id = ++seq
    set((s) => ({ toasts: [...s.toasts, { id, tipo, mensaje }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, DURACION_MS)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

/** API imperativa para usar desde mutaciones y handlers: toast.success('Guardado'). */
export const toast = {
  success: (mensaje: string) => useToastStore.getState().push('success', mensaje),
  error: (mensaje: string) => useToastStore.getState().push('error', mensaje),
  info: (mensaje: string) => useToastStore.getState().push('info', mensaje),
}
