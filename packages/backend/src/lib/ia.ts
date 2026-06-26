/**
 * STUB DE IA — Sugerencia de riesgos por sector (NIA 315).
 *
 * Por ahora devuelve un catálogo curado de riesgos típicos según el sector
 * económico de la empresa. NO llama a la API de Claude todavía.
 *
 * Cuando se active la fase de IA, reemplazar `sugerirRiesgos` por una llamada
 * a Claude (CLAUDE_MODEL, p. ej. claude-sonnet-4-6) que reciba el sector, el
 * marco contable y los estados financieros, y devuelva el mismo shape
 * (RiesgoSugerido[]). La firma de la función puede mantenerse igual.
 */
import type { RiesgoSugerido } from '@auditorya/types'

function normalizar(sector: string): string {
  return sector
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita acentos
    .trim()
}

const CATALOGO_GENERAL: RiesgoSugerido[] = [
  {
    area: 'ingresos',
    descripcion:
      'Reconocimiento de ingresos en el período incorrecto (corte de ventas) para inflar resultados.',
    riesgoInherente: 'alto',
    respuestaPlaneada:
      'Pruebas de corte de ingresos alrededor del cierre; revisión de notas crédito posteriores.',
  },
  {
    area: 'efectivo',
    descripcion: 'Saldos de efectivo y bancos no conciliados o sobreestimados.',
    riesgoInherente: 'medio',
    respuestaPlaneada: 'Confirmación bancaria directa y revisión de conciliaciones.',
  },
  {
    area: 'cartera',
    descripcion:
      'Cuentas por cobrar incobrables sin deterioro reconocido; antigüedad no analizada.',
    riesgoInherente: 'alto',
    respuestaPlaneada:
      'Circularización a clientes, análisis de antigüedad y suficiencia del deterioro.',
  },
  {
    area: 'impuestos',
    descripcion: 'Provisiones y pasivos tributarios mal estimados; cumplimiento DIAN.',
    riesgoInherente: 'medio',
    respuestaPlaneada: 'Recálculo de impuestos y conciliación entre contabilidad y declaraciones.',
  },
  {
    area: 'nomina',
    descripcion: 'Seguridad social y prestaciones sociales no causadas o subestimadas.',
    riesgoInherente: 'medio',
    respuestaPlaneada: 'Recálculo de prestaciones y verificación de pagos de seguridad social.',
  },
]

const CATALOGO_POR_SECTOR: Record<string, RiesgoSugerido[]> = {
  comercio: [
    {
      area: 'inventarios',
      descripcion:
        'Inventario obsoleto, faltantes o sobrevaluado; diferencias entre kardex y conteo físico.',
      riesgoInherente: 'alto',
      respuestaPlaneada:
        'Observación de toma física de inventario y pruebas de valuación (costo vs. NRV).',
    },
    {
      area: 'ingresos',
      descripcion: 'Ventas en efectivo no registradas; corte de ventas en el cierre.',
      riesgoInherente: 'alto',
      respuestaPlaneada: 'Pruebas de corte y análisis de márgenes por línea de producto.',
    },
    {
      area: 'cartera',
      descripcion: 'Cartera de clientes con alta morosidad sin deterioro adecuado.',
      riesgoInherente: 'medio',
      respuestaPlaneada: 'Circularización y análisis de antigüedad de cartera.',
    },
  ],
  construccion: [
    {
      area: 'ingresos',
      descripcion:
        'Reconocimiento de ingresos por avance de obra (grado de avance) mal estimado.',
      riesgoInherente: 'alto',
      respuestaPlaneada:
        'Revisión de contratos, presupuestos de obra y verificación del método de avance.',
    },
    {
      area: 'inventarios',
      descripcion: 'Obras en curso y costos acumulados de proyectos sobrevaluados.',
      riesgoInherente: 'alto',
      respuestaPlaneada: 'Pruebas de costos acumulados por proyecto y revisión de presupuestos.',
    },
    {
      area: 'propiedad_planta_equipo',
      descripcion: 'Maquinaria y equipo con depreciación o deterioro incorrecto.',
      riesgoInherente: 'medio',
      respuestaPlaneada: 'Inspección física de activos y recálculo de depreciación.',
    },
  ],
  agropecuario: [
    {
      area: 'inventarios',
      descripcion:
        'Activos biológicos y existencias agrícolas medidos a valor razonable de forma subjetiva.',
      riesgoInherente: 'alto',
      respuestaPlaneada:
        'Revisión de los supuestos de valor razonable y conteo físico de activos biológicos.',
    },
    {
      area: 'propiedad_planta_equipo',
      descripcion: 'Tierras, cultivos y maquinaria con valuación o deterioro incorrecto.',
      riesgoInherente: 'medio',
      respuestaPlaneada: 'Inspección de activos y revisión de avalúos.',
    },
  ],
  transporte: [
    {
      area: 'propiedad_planta_equipo',
      descripcion: 'Flota de vehículos con depreciación, deterioro o existencia incorrecta.',
      riesgoInherente: 'alto',
      respuestaPlaneada: 'Inspección física de la flota y recálculo de depreciación.',
    },
    {
      area: 'gastos',
      descripcion: 'Gastos de combustible y mantenimiento sin soporte o mal clasificados.',
      riesgoInherente: 'medio',
      respuestaPlaneada: 'Pruebas de soporte de gastos y análisis de razonabilidad.',
    },
  ],
  manufactura: [
    {
      area: 'inventarios',
      descripcion:
        'Costeo de producción (materia prima, mano de obra, CIF) mal asignado o sobrevaluado.',
      riesgoInherente: 'alto',
      respuestaPlaneada: 'Pruebas del sistema de costeo y observación de toma física.',
    },
    {
      area: 'propiedad_planta_equipo',
      descripcion: 'Maquinaria de planta con deterioro no reconocido.',
      riesgoInherente: 'medio',
      respuestaPlaneada: 'Inspección de activos y evaluación de indicios de deterioro.',
    },
  ],
  servicios: [
    {
      area: 'ingresos',
      descripcion:
        'Reconocimiento de ingresos por servicios prestados pero aún no facturados (o viceversa).',
      riesgoInherente: 'alto',
      respuestaPlaneada: 'Revisión de contratos de servicio y pruebas de corte de ingresos.',
    },
    {
      area: 'cartera',
      descripcion: 'Honorarios por cobrar con riesgo de incobrabilidad.',
      riesgoInherente: 'medio',
      respuestaPlaneada: 'Circularización y análisis de antigüedad.',
    },
  ],
}

/**
 * Devuelve riesgos sugeridos para un sector. Combina los específicos del sector
 * con un par de riesgos generales transversales, sin duplicar áreas.
 */
export function sugerirRiesgos(sector: string): RiesgoSugerido[] {
  const key = normalizar(sector)

  // Coincidencia por inclusión para tolerar variantes ("comercio al por menor").
  const sectorKey = Object.keys(CATALOGO_POR_SECTOR).find((k) => key.includes(k))
  const especificos = sectorKey ? CATALOGO_POR_SECTOR[sectorKey] : []

  const areasCubiertas = new Set(especificos.map((r) => r.area))
  const generalesComplemento = CATALOGO_GENERAL.filter((r) => !areasCubiertas.has(r.area))

  const resultado = [...especificos, ...generalesComplemento]

  // Si no hubo match de sector, al menos devolvemos el catálogo general.
  return resultado.length > 0 ? resultado : CATALOGO_GENERAL
}
