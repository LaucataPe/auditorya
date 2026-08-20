import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { BandejaNotificaciones } from '@auditorya/types'
import { api } from '../lib/api'

/**
 * Bandeja de notificaciones del usuario. Se refresca sola cada minuto (no hay
 * tiempo real): suficiente para avisos de asignaciones y revisión.
 */
export function useNotificaciones() {
  const queryClient = useQueryClient()

  const { data } = useQuery<BandejaNotificaciones>({
    queryKey: ['notificaciones'],
    queryFn: () => api.get<BandejaNotificaciones>('/notificaciones'),
    refetchInterval: 60_000,
  })

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['notificaciones'] })

  const marcarLeida = useMutation({
    mutationFn: (id: string) => api.post(`/notificaciones/${id}/leer`, {}),
    onSettled: invalidar,
  })

  const marcarTodas = useMutation({
    mutationFn: () => api.post('/notificaciones/leer-todas', {}),
    onSettled: invalidar,
  })

  return {
    items: data?.items ?? [],
    noLeidas: data?.noLeidas ?? 0,
    marcarLeida,
    marcarTodas,
  }
}
