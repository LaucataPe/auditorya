import { useQuery } from '@tanstack/react-query'
import type { PestanaPractica } from '@auditorya/types'
import { api } from '../../lib/api'
import { DEMO_AUDITORIA_ID } from '../../lib/academia-demo'
import { CartaEncargoTab } from '../auditoria/CartaEncargoTab'
import { EntendimientoTab } from '../auditoria/EntendimientoTab'
import { BalanceTab } from '../auditoria/BalanceTab'
import { ControlInternoTab } from '../auditoria/ControlInternoTab'
import { MaterialidadTab } from '../auditoria/MaterialidadTab'
import { RiesgosTab } from '../auditoria/RiesgosTab'
import { MemoPlaneacionTab } from '../auditoria/MemoPlaneacionTab'
import { PbcTab } from '../auditoria/PbcTab'
import { HojaAjustes } from '../auditoria/CierreTab'
import { InformesTab } from '../auditoria/InformesTab'

type AuditoriaDemo = {
  id: string
  fechaInicio: string
  fechaFin: string
  materialidadAprobada: boolean
  empresa: { id: string; nombre: string; sector: string }
}

export const PESTANA_LABEL: Record<PestanaPractica, string> = {
  carta_encargo: 'Carta de encargo',
  entendimiento: 'Entendimiento',
  balance: 'Balance',
  control_interno: 'Control interno',
  materialidad: 'Materialidad',
  riesgos: 'Riesgos',
  memo: 'Memo de planeación',
  pbc: 'Documentos',
  ajustes: 'Hoja de ajustes',
  informes: 'Informes',
}

function formatearPeriodo(fechaInicio: string, fechaFin: string): string {
  const f = (d: string) =>
    new Date(d.slice(0, 10) + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
  return `${f(fechaInicio)} – ${f(fechaFin)}`
}

/**
 * Monta la pestaña REAL del encargo sobre el encargo de práctica, con las mismas props que usa
 * EmpresaAuditoria. Sus peticiones las responde el servidor simulado (lib/academia-demo).
 */
export function PestanaDemo({ pestana }: { pestana: PestanaPractica }) {
  const auditoriaId = DEMO_AUDITORIA_ID
  const { data: auditoria } = useQuery<AuditoriaDemo>({
    queryKey: ['auditoria', auditoriaId],
    queryFn: () => api.get<AuditoriaDemo>(`/auditorias/${auditoriaId}`),
  })

  if (!auditoria) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    )
  }

  const periodo = formatearPeriodo(auditoria.fechaInicio, auditoria.fechaFin)

  switch (pestana) {
    case 'carta_encargo':
      return <CartaEncargoTab auditoriaId={auditoriaId} empresaNombre={auditoria.empresa.nombre} periodo={periodo} />
    case 'entendimiento':
      return <EntendimientoTab auditoriaId={auditoriaId} empresaId={auditoria.empresa.id} />
    case 'balance':
      return <BalanceTab auditoriaId={auditoriaId} />
    case 'control_interno':
      return <ControlInternoTab auditoriaId={auditoriaId} />
    case 'materialidad':
      return <MaterialidadTab auditoriaId={auditoriaId} />
    case 'riesgos':
      return <RiesgosTab auditoriaId={auditoriaId} sector={auditoria.empresa.sector} materialidadAprobada={auditoria.materialidadAprobada} />
    case 'memo':
      return <MemoPlaneacionTab auditoriaId={auditoriaId} empresaNombre={auditoria.empresa.nombre} periodo={periodo} />
    case 'ajustes':
      return <HojaAjustes auditoriaId={auditoriaId} cerrado={false} />
    case 'informes':
      return <InformesTab auditoriaId={auditoriaId} materialidadAprobada={auditoria.materialidadAprobada} empresaNombre={auditoria.empresa.nombre} periodo={periodo} />
    case 'pbc':
      return <PbcTab auditoriaId={auditoriaId} materialidadAprobada={auditoria.materialidadAprobada} empresaNombre={auditoria.empresa.nombre} periodo={periodo} />
  }
}
