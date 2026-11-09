/**
 * Documentos legales del cliente (RUT, Cámara de Comercio, etc.) — capa de
 * archivo permanente a nivel de empresa, no por encargo. Catálogo fijo de
 * documentos esperados + categoría libre 'otro' para adjuntos adicionales.
 */

export type TipoDocumentoEmpresa =
  | 'rut'
  | 'camara_comercio'
  | 'cedula_representante_legal'
  | 'estados_financieros_anteriores'
  | 'composicion_accionaria'
  | 'estatutos'
  | 'declaracion_renta'
  | 'contrato'
  | 'otro'

export type CatalogoDocumentoEmpresa = {
  tipo: Exclude<TipoDocumentoEmpresa, 'otro' | 'estados_financieros_anteriores' | 'declaracion_renta'>
  label: string
  descripcion: string
}

export const CATALOGO_DOCUMENTOS_EMPRESA: CatalogoDocumentoEmpresa[] = [
  {
    tipo: 'rut',
    label: 'RUT',
    descripcion: 'Registro Único Tributario vigente.',
  },
  {
    tipo: 'camara_comercio',
    label: 'Cámara de Comercio',
    descripcion: 'Certificado de existencia y representación legal (vigencia no mayor a 30 días).',
  },
  {
    tipo: 'cedula_representante_legal',
    label: 'Cédula representante legal',
    descripcion: 'Documento de identidad del representante legal.',
  },
  {
    tipo: 'composicion_accionaria',
    label: 'Composición accionaria',
    descripcion: 'Libro de socios/accionistas o certificación de composición accionaria.',
  },
  {
    tipo: 'estatutos',
    label: 'Estatutos sociales',
    descripcion: 'Estatutos vigentes o acta/documento de constitución.',
  },
  {
    tipo: 'contrato',
    label: 'Contrato de servicios',
    descripcion: 'Contrato firmado con el cliente para la prestación del servicio (revisoría fiscal o auditoría).',
  },
]

export const TIPOS_DOCUMENTO_EMPRESA: TipoDocumentoEmpresa[] = [
  ...CATALOGO_DOCUMENTOS_EMPRESA.map((d) => d.tipo),
  'otro',
]

export const DOCUMENTO_EMPRESA_TIPO_LABEL: Record<TipoDocumentoEmpresa, string> = {
  ...(Object.fromEntries(
    CATALOGO_DOCUMENTOS_EMPRESA.map((d) => [d.tipo, d.label]),
  ) as Record<CatalogoDocumentoEmpresa['tipo'], string>),
  otro: 'Otro documento',
  // Retirados del catálogo (ya no se piden); se conservan por los archivos ya subidos.
  estados_financieros_anteriores: 'Estados financieros año anterior',
  declaracion_renta: 'Última declaración de renta',
}

export type DocumentoEmpresa = {
  id: string
  empresaId: string
  tipo: TipoDocumentoEmpresa
  nombre: string | null
  archivoNombre: string
  archivoMime: string
  archivoTamano: number
  archivoHash: string
  subidoPor: string
  createdAt: string
}
