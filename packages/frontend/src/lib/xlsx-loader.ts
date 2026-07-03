/**
 * Carga SheetJS (xlsx) desde CDN bajo demanda, sin dependencia instalada.
 * Solo se descarga la primera vez que el usuario sube un Excel.
 */

declare global {
  interface Window {
    XLSX?: {
      read: (data: ArrayBuffer, opts: { type: string }) => { SheetNames: string[]; Sheets: Record<string, unknown> }
      utils: { sheet_to_json: (ws: unknown, opts: { header: 1; raw?: boolean; defval?: string }) => unknown[][] }
    }
  }
}

const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
let cargando: Promise<NonNullable<Window['XLSX']>> | null = null

function cargarSheetJs(): Promise<NonNullable<Window['XLSX']>> {
  if (window.XLSX) return Promise.resolve(window.XLSX)
  if (cargando) return cargando
  cargando = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = CDN
    s.async = true
    s.onload = () => (window.XLSX ? resolve(window.XLSX) : reject(new Error('No se cargó SheetJS')))
    s.onerror = () => reject(new Error('No se pudo cargar el lector de Excel desde el CDN'))
    document.head.appendChild(s)
  })
  return cargando
}

/** Lee la primera hoja de un .xlsx/.xls a una matriz de strings (igual shape que parseCsv). */
export async function leerExcelAFilas(file: File): Promise<string[][]> {
  const XLSX = await cargarSheetJs()
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const filas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' })
  return filas
    .map((r) => (Array.isArray(r) ? r.map((c) => (c == null ? '' : String(c))) : []))
    .filter((r) => r.some((c) => c.trim().length > 0))
}
