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
  | 'otro'

export type CatalogoDocumentoEmpresa = {
  tipo: Exclude<TipoDocumentoEmpresa, 'otro'>
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
    tipo: 'estados_financieros_anteriores',
    label: 'Estados financieros año anterior',
    descripcion: 'Estados financieros firmados del período anterior.',
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
    tipo: 'declaracion_renta',
    label: 'Última declaración de renta',
    descripcion: 'Declaración de renta del último período gravable.',
  },
]

export const TIPOS_DOCUMENTO_EMPRESA: TipoDocumentoEmpresa[] = [
  ...CATALOGO_DOCUMENTOS_EMPRESA.map((d) => d.tipo),
  'otro',
]

export const DOCUMENTO_EMPRESA_TIPO_LABEL: Record<TipoDocumentoEmpresa, string> = {
  ...(Object.fromEntries(
    CATALOGO_DOCUMENTOS_EMPRESA.map((d) => [d.tipo, d.label]),
  ) as Record<Exclude<TipoDocumentoEmpresa, 'otro'>, string>),
  otro: 'Otro documento',
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
