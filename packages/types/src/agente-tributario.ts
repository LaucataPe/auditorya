/**
 * Registro de los procedimientos agénticos del módulo tributario: qué impuestos
 * tienen agente, con qué programa, qué insumos y qué motor. La revisión guiada,
 * el hook y el backend consultan esto por `obligacion.tipo` en vez de tener el
 * IVA cableado. Agregar un impuesto = agregar una entrada aquí (más su motor).
 */
import type { CifrasRevision, ProgramaRevision, TipoImpuesto } from './tributario'
import { INSUMO_IVA_LABEL, PROGRAMA_AGENTE_IVA, programaSugeridoIva, reglasOmitidas as reglasOmitidasIva, type InsumoIva, type PasoAgenteIva } from './agente-iva'
import { PROGRAMA_AGENTE_RETEFUENTE, programaSugeridoRetefuente, reglasOmitidasRetefuente } from './agente-retefuente'
import { PROGRAMA_AGENTE_RETEICA, programaSugeridoReteica, reglasOmitidasReteica } from './agente-reteica'
import { PROGRAMA_AGENTE_ICA, programaSugeridoIca, reglasOmitidasIca } from './agente-ica'
import type { MemoriaIvaEmpresa } from './agente-iva'

export type TipoAgentico = 'iva' | 'retefuente' | 'reteica' | 'ica'
export const TIPOS_AGENTICOS: TipoAgentico[] = ['iva', 'retefuente', 'reteica', 'ica']

export function esTipoAgentico(tipo: TipoImpuesto): tipo is TipoAgentico {
  return (TIPOS_AGENTICOS as string[]).includes(tipo)
}

export type DefinicionAgente = {
  tipo: TipoAgentico
  nombreFormulario: string
  programa: PasoAgenteIva[]
  insumos: Record<InsumoIva, { nombre: string; para: string }>
  programaSugerido: () => ProgramaRevision
  reglasOmitidas: (programa: ProgramaRevision | null) => string[]
  /** Prefijos de cuenta que el mapeo de libros usa (para sugerir el nombre del auxiliar). */
  cuentas: { prefijo: string; etiqueta: string }[]
  /** Clave de la memoria de la empresa donde van las subcuentas clasificadas a mano. */
  memoriaClave: 'mapeo2408' | 'mapeo2365' | 'mapeo2368' | 'mapeoIca'
  /** Qué dice el formulario sobre el período anterior (para la tarjeta del insumo "anterior"). */
  anteriorRelevante: (cifras: CifrasRevision) => string | null
  /** Texto de la tarjeta "anterior" cuando el formulario no lo hace necesario. */
  anteriorOpcional: string
  /** Texto de ejemplo para un paso propio del programa. */
  ejemploPasoPropio: string
}

export const AGENTES_TRIBUTARIOS: Record<TipoAgentico, DefinicionAgente> = {
  iva: {
    tipo: 'iva',
    nombreFormulario: 'Formulario 300',
    programa: PROGRAMA_AGENTE_IVA,
    insumos: INSUMO_IVA_LABEL,
    programaSugerido: programaSugeridoIva,
    reglasOmitidas: reglasOmitidasIva,
    cuentas: [{ prefijo: '2408', etiqueta: 'IVA (2408)' }, { prefijo: '41', etiqueta: 'ingresos (41)' }, { prefijo: '42', etiqueta: 'ingresos (42)' }, { prefijo: '1355', etiqueta: 'retenciones de IVA (1355)' }],
    memoriaClave: 'mapeo2408',
    anteriorRelevante: (cifras) => {
      const c84 = cifras['iva-saldo-favor-ant']?.declarado
      return typeof c84 === 'number' && c84 > 0 ? 'Recomendado: el formulario imputa saldo a favor anterior' : null
    },
    anteriorOpcional: 'Solo si el formulario imputa saldo a favor del período anterior',
    ejemploPasoPropio: 'Verificar el certificado de retención de IVA del cliente X',
  },
  retefuente: {
    tipo: 'retefuente',
    nombreFormulario: 'Formulario 350',
    programa: PROGRAMA_AGENTE_RETEFUENTE,
    insumos: {
      borrador: { nombre: 'Borrador del Formulario 350', para: 'Llena la columna Declarado: bases y retenciones por concepto y beneficiario. Sin él no hay nada que verificar.' },
      auxiliar: { nombre: 'Auxiliar contable o balance de prueba del mes (2365 y 2367)', para: 'Llena Según libros por concepto. Si el auxiliar trae la base y la tarifa por asiento (World Office, Siesa), el agente verifica tarifa y cuantía mínima uno por uno y separa jurídicas de naturales por el tercero.' },
      dian: { nombre: 'Reporte de documentos electrónicos recibidos', para: 'Etapa siguiente: universo de pagos por tercero para detectar retenciones no practicadas.' },
      anterior: { nombre: 'Declaración del mes anterior', para: 'Compara el total retenido mes a mes. Si la revisión anterior está en la plataforma, no hace falta.' },
    },
    programaSugerido: programaSugeridoRetefuente,
    reglasOmitidas: reglasOmitidasRetefuente,
    cuentas: [{ prefijo: '2365', etiqueta: 'retención en la fuente (2365)' }, { prefijo: '2364', etiqueta: 'retención en la fuente (2364)' }, { prefijo: '2367', etiqueta: 'rete-IVA (2367)' }],
    memoriaClave: 'mapeo2365',
    anteriorRelevante: () => null,
    anteriorOpcional: 'Opcional: permite comparar el total retenido con el mes anterior',
    ejemploPasoPropio: 'Revisar los certificados de retención expedidos a los cinco mayores proveedores',
  },
  reteica: {
    tipo: 'reteica',
    nombreFormulario: 'declaración de retención de ICA',
    programa: PROGRAMA_AGENTE_RETEICA,
    insumos: {
      borrador: { nombre: 'Borrador de la declaración de retención de ICA', para: 'Llena la columna Declarado: base, retenciones, autorretenciones, devoluciones y sanciones. Cada municipio tiene su formulario; la lectura los lleva a los mismos renglones.' },
      auxiliar: { nombre: 'Auxiliar o balance de prueba de la 2368 (mejor por terceros)', para: 'Llena Según libros con la 2368 del municipio. Con el detalle por tercero separa las devoluciones a proveedores del pago al municipio y muestra lo retenido a cada uno.' },
      dian: { nombre: 'Reporte de documentos electrónicos recibidos', para: 'Etapa siguiente: universo de pagos a proveedores del municipio.' },
      anterior: { nombre: 'Declaración del bimestre anterior', para: 'Compara las retenciones con el período anterior. Si la revisión anterior está en la plataforma, no hace falta.' },
    },
    programaSugerido: programaSugeridoReteica,
    reglasOmitidas: reglasOmitidasReteica,
    cuentas: [{ prefijo: '2368', etiqueta: 'ICA retenido (2368)' }],
    memoriaClave: 'mapeo2368',
    anteriorRelevante: () => null,
    anteriorOpcional: 'Opcional: permite comparar las retenciones con el bimestre anterior',
    ejemploPasoPropio: 'Verificar el código de actividad de los cinco mayores proveedores',
  },
  ica: {
    tipo: 'ica',
    nombreFormulario: 'Formulario Único Nacional de ICA',
    programa: PROGRAMA_AGENTE_ICA,
    insumos: {
      borrador: { nombre: 'Borrador del Formulario Único Nacional de ICA', para: 'Llena la columna Declarado: base gravable (renglones 8 a 16), actividades gravadas con su impuesto, liquidación y pago.' },
      auxiliar: { nombre: 'Balance de prueba o auxiliar del período (ingresos, 135518 y 2412)', para: 'Llena Según libros: ingresos brutos, devoluciones, exportaciones e ingresos de otros municipios desde la clase 4; retenciones desde la 135518; causación desde la 2412.' },
      dian: { nombre: 'Reporte de documentos electrónicos emitidos', para: 'Etapa siguiente: cruzar los ingresos con la facturación electrónica.' },
      anterior: { nombre: 'Declaración del período anterior', para: 'Verifica el saldo a favor imputado (renglón 32) y compara la base y el impuesto. Si la revisión anterior está en la plataforma, no hace falta.' },
    },
    programaSugerido: programaSugeridoIca,
    reglasOmitidas: reglasOmitidasIca,
    cuentas: [{ prefijo: '41', etiqueta: 'ingresos (41)' }, { prefijo: '42', etiqueta: 'ingresos (42)' }, { prefijo: '1355', etiqueta: 'ICA retenido (1355)' }, { prefijo: '2412', etiqueta: 'ICA por pagar (2412)' }],
    memoriaClave: 'mapeoIca',
    anteriorRelevante: (cifras) => {
      const sfa = cifras['ica-saldo-favor-ant']?.declarado
      return typeof sfa === 'number' && sfa > 0 ? 'Recomendado: el formulario imputa saldo a favor del período anterior' : null
    },
    anteriorOpcional: 'Opcional: permite comparar la base y el impuesto con el período anterior',
    ejemploPasoPropio: 'Revisar los certificados de reteICA de los tres mayores clientes',
  },
}

/** El mapa de la memoria de la empresa que usa el impuesto (para saber si cambió desde el último análisis). */
export function mapeoMemoriaDe(tipo: TipoAgentico, memoria: Pick<MemoriaIvaEmpresa, 'mapeo2408' | 'mapeo2365' | 'mapeo2368' | 'mapeoIca'>): Record<string, string> {
  return tipo === 'iva' ? { ...memoria.mapeo2408 } : tipo === 'retefuente' ? { ...(memoria.mapeo2365 ?? {}) } : tipo === 'ica' ? { ...(memoria.mapeoIca ?? {}) } : { ...(memoria.mapeo2368 ?? {}) }
}

/** Programa sugerido del impuesto (todos los pasos del agente activos). */
export function programaSugerido(tipo: TipoAgentico): ProgramaRevision {
  return AGENTES_TRIBUTARIOS[tipo].programaSugerido()
}

/** Reglas que no corren porque su paso está desactivado. */
export function reglasOmitidasDe(tipo: TipoAgentico, programa: ProgramaRevision | null): string[] {
  return AGENTES_TRIBUTARIOS[tipo].reglasOmitidas(programa)
}

/** Insumos que piden los pasos activos, en orden de prioridad. */
export function insumosDelProgramaDe(tipo: TipoAgentico, programa: ProgramaRevision | null): InsumoIva[] {
  const def = AGENTES_TRIBUTARIOS[tipo]
  const activos = new Set((programa ?? def.programaSugerido()).pasos.filter((p) => p.origen === 'agente' && p.activo).map((p) => p.id))
  const set = new Set<InsumoIva>()
  for (const p of def.programa) if (activos.has(p.id)) for (const i of p.insumos) set.add(i)
  return (['borrador', 'auxiliar', 'dian', 'anterior'] as InsumoIva[]).filter((i) => set.has(i))
}
