import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AREAS_BASE, type AreaFirma } from '@auditorya/types'
import { api } from '../lib/api'

export type AreaOpcion = { clave: string; nombre: string; propia: boolean; id?: string }

/**
 * Catálogo de áreas/ciclos del encargo: las base (fijas, compartidas) + las propias
 * de la firma (tabla areas_firma). Fuente única para selects y etiquetas — no
 * definir mapas AREA_LABEL locales en los componentes.
 */
export function useAreas() {
  const { data: propias = [] } = useQuery<AreaFirma[]>({
    queryKey: ['areas-firma'],
    queryFn: () => api.get<AreaFirma[]>('/firmas/mia/areas'),
    staleTime: 5 * 60_000,
  })

  const areas: AreaOpcion[] = useMemo(
    () => [
      ...AREAS_BASE.map((a) => ({ clave: a.clave, nombre: a.nombre, propia: false })),
      ...propias.map((a) => ({ clave: a.clave, nombre: a.nombre, propia: true, id: a.id })),
    ],
    [propias],
  )

  const porClave = useMemo(() => new Map(areas.map((a) => [a.clave, a.nombre])), [areas])

  /** Etiqueta legible de una clave; si no está en el catálogo, la clave cruda. */
  const areaLabel = (clave: string | null | undefined) =>
    clave ? porClave.get(clave) ?? clave : '—'

  /** Opciones listas para <Select>. */
  const opciones = useMemo(
    () => areas.map((a) => ({ value: a.clave, label: a.propia ? `${a.nombre} (propio)` : a.nombre })),
    [areas],
  )

  return { areas, propias, areaLabel, opciones }
}
