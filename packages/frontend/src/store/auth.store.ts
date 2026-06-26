import { create } from 'zustand'
import { api } from '../lib/api'

export type Usuario = {
  id: string
  firmaId: string
  nombre: string
  email: string
  rol: string
  createdAt: string
}

export type Firma = {
  id: string
  nombre: string
  nit: string
  ciudad: string
  createdAt: string
}

type AuthResponse = { usuario: Usuario; firma: Firma }

export type RegisterData = {
  firma: { nombre: string; nit: string; ciudad: string }
  usuario: { nombre: string; email: string; password: string }
}

type AuthState = {
  isAuthenticated: boolean
  onboardingComplete: boolean
  sessionChecked: boolean
  user: Usuario | null
  firma: Firma | null

  checkSession: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  register: (data: RegisterData) => Promise<void>
  logout: () => Promise<void>
  completeOnboarding: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  onboardingComplete: false,
  sessionChecked: false,
  user: null,
  firma: null,

  checkSession: async () => {
    try {
      const { usuario, firma } = await api.get<AuthResponse>('/auth/me')
      set({ isAuthenticated: true, onboardingComplete: true, user: usuario, firma, sessionChecked: true })
    } catch {
      set({ isAuthenticated: false, user: null, firma: null, sessionChecked: true })
    }
  },

  login: async (email, password) => {
    const { usuario, firma } = await api.post<AuthResponse>('/auth/login', { email, password })
    set({ isAuthenticated: true, onboardingComplete: true, user: usuario, firma })
  },

  register: async (data) => {
    const { usuario, firma } = await api.post<AuthResponse>('/auth/registro', data)
    set({ isAuthenticated: true, user: usuario, firma })
  },

  logout: async () => {
    await api.post('/auth/logout', {})
    set({ isAuthenticated: false, onboardingComplete: false, user: null, firma: null })
  },

  completeOnboarding: () => set({ onboardingComplete: true }),
}))
