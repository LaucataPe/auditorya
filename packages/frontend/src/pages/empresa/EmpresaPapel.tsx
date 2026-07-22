import { useParams } from 'react-router-dom'
import { PapelPanel } from '../../components/auditoria/PapelesTab'

export function EmpresaPapel() {
  const { auditoriaId, papelId } = useParams<{ id: string; auditoriaId: string; papelId: string }>()

  if (!auditoriaId || !papelId) return null

  return (
    <div className="p-8">
      <PapelPanel papelId={papelId} auditoriaId={auditoriaId} />
    </div>
  )
}
