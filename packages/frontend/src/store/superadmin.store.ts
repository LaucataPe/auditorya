import { create } from 'zustand'
import { api } from '../lib/api'

type SuperadminState = {
  isAuthenticated: boolean
  sessionChecked: boolean
  email: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  checkSession: () => Promise<void>
}

export const useSuperadminStore = create<SuperadminState>((set) => ({
  isAuthenticated: false,
  sessionChecked: false,
  email: null,

  checkSession: async () => {
    try {
      // Si el login fue exitoso la cookie sa_token existe; validamos con cualquier ruta protegida
      await api.get('/superadmin/firmas')
      set({ isAuthenticated: true, sessionChecked: true })
    } catch {
      set({ isAuthenticated: false, sessionChecked: true })
    }
  },

  login: async (email, password) => {
    await api.post('/superadmin/login', { email, password })
    set({ isAuthenticated: true, email })
  },

  logout: async () => {
    await api.post('/superadmin/logout', {})
    set({ isAuthenticated: false, email: null })
  },
}))
