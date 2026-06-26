import { FileText, Upload } from 'lucide-react'
import { Button } from '../../components/ui/Button'

const DOCUMENTOS_DUMMY = [
  { id: '1', nombre: 'Estados financieros 2024.pdf', tipo: 'Estados financieros', fecha: '2026-01-10', size: '2.4 MB' },
  { id: '2', nombre: 'Balance general Dic 2024.xlsx', tipo: 'Balance general', fecha: '2026-01-10', size: '890 KB' },
]

export function EmpresaDocumentos() {
  return (
    <div className="p-8 max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documentos</h1>
          <p className="text-sm text-gray-500 mt-1">Archivos y evidencias de la empresa.</p>
        </div>
        <Button size="sm" className="gap-2">
          <Upload size={14} /> Subir documento
        </Button>
      </div>

      {DOCUMENTOS_DUMMY.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 py-16 text-center">
          <FileText size={36} className="text-gray-300 mb-3" />
          <p className="text-sm text-gray-400">No hay documentos cargados aún.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-50">
          {DOCUMENTOS_DUMMY.map((doc) => (
            <div key={doc.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 shrink-0">
                <FileText size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{doc.nombre}</p>
                <p className="text-xs text-gray-400">{doc.tipo} · {doc.size}</p>
              </div>
              <p className="text-xs text-gray-400 shrink-0">
                {new Date(doc.fecha).toLocaleDateString('es-CO')}
              </p>
              <button className="text-xs text-indigo-600 hover:underline shrink-0">Ver</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
