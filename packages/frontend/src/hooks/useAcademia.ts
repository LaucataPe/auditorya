import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { leccionPorId, type VerificacionPractica } from '@auditorya/types'
import { toast } from '../store/toast.store'
import { useAcademiaStore } from '../store/academia.store'
import { prepararLeccion, reiniciarEncargoDemo, reiniciarLeccion, verificarPractica } from '../lib/academia-demo'

/** Progreso del curso en este navegador (ver academia.store). */
export function useProgresoAcademia() {
  return useAcademiaStore()
}

/** Deja en el encargo de práctica lo que la lección necesita (idempotente). */
export function usePrepararPractica(leccionId: string) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: ['academia', 'preparar', leccionId],
    staleTime: Infinity,
    queryFn: async () => {
      // Si sembró algo, lo que las pestañas tenían en caché quedó viejo.
      if (prepararLeccion(leccionId)) await queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'academia' })
      return true
    },
  })
}

/** Checklist de la práctica, calculado sobre el encargo de práctica del navegador. */
export function useVerificarPractica(leccionId: string) {
  return useQuery<VerificacionPractica>({
    queryKey: ['academia', 'verificar', leccionId],
    queryFn: () => verificarPractica(leccionPorId(leccionId)!.leccion.practica!.criterio),
  })
}

export function useReiniciarPractica(leccionId: string) {
  const queryClient = useQueryClient()
  const marcarPracticada = useAcademiaStore((s) => s.marcarPracticada)
  return useMutation({
    mutationFn: async () => reiniciarLeccion(leccionId),
    onSuccess: async () => {
      marcarPracticada(leccionId, false)
      // El QueryClient del curso solo tiene datos del encargo de práctica: se refresca entero.
      await queryClient.invalidateQueries()
      toast.info('Ejercicio reiniciado')
    },
  })
}

/** Borra todo el encargo de práctica y el progreso del curso en este navegador. */
export function useReiniciarCurso() {
  const queryClient = useQueryClient()
  const reiniciarProgreso = useAcademiaStore((s) => s.reiniciarProgreso)
  return useMutation({
    mutationFn: async () => {
      reiniciarEncargoDemo()
      reiniciarProgreso()
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      toast.info('Empezaste el curso de cero')
    },
  })
}
