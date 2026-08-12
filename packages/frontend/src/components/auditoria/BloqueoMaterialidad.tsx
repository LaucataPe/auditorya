import { Lock } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '../ui/Button'

/**
 * Estado bloqueado por el gate de materialidad. Siempre enlaza al paso que
 * desbloquea (Materialidad) en vez de dejar al usuario buscándolo en el rail.
 */
export function BloqueoMaterialidad({ titulo, descripcion }: { titulo: string; descripcion: string }) {
  const [, setSearchParams] = useSearchParams()
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center max-w-2xl">
      <Lock size={32} className="text-gray-300 mb-3" />
      <p className="text-sm font-medium text-gray-500">{titulo}</p>
      <p className="text-xs text-gray-400 mt-1 max-w-sm">{descripcion}</p>
      <Button
        size="sm"
        variant="secondary"
        className="mt-4"
        onClick={() => setSearchParams({ paso: 'materialidad' })}
      >
        Ir a Materialidad
      </Button>
    </div>
  )
}
