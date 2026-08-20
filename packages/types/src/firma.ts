export type Firma = {
  id: string
  nombre: string
  nit: string
  ciudad: string
  createdAt: string
}

/**
 * Fuentes elegibles para los documentos exportados — un mismo catálogo para las
 * dos familias configurables por firma: titulares (membrete, título, subtítulos
 * de sección) y cuerpo (párrafos). Solo tipografías presentes tanto en los
 * navegadores (PDF por impresión) como en Word (.docx), para que el documento
 * se vea igual en ambas rutas sin incrustar fuentes. Excepción: Aptos viene con
 * Office/M365 (no con el sistema); sin Office instalado, el PDF usa su respaldo
 * (Segoe UI/Calibri) y Word la sustituye solo.
 */
export const FUENTES_DOCUMENTO = [
  'Aptos',
  'Arial',
  'Calibri',
  'Cambria',
  'Garamond',
  'Georgia',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
] as const

export type FuenteDocumento = (typeof FUENTES_DOCUMENTO)[number]

export const FUENTE_TITULOS_DEFECTO: FuenteDocumento = 'Arial'
export const FUENTE_CUERPO_DEFECTO: FuenteDocumento = 'Georgia'
