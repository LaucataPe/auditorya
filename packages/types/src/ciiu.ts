/**
 * Utilidades de clasificación CIIU (Rev. 4 A.C. — Colombia).
 *
 * A partir del código CIIU (4 dígitos, p. ej. "4719") se deriva:
 *  - la sección (letra A–U) y su descripción oficial
 *  - un "sector" normalizado que alimenta el catálogo de riesgos por IA
 *    (debe coincidir con las claves de CATALOGO_POR_SECTOR en el backend).
 *
 * Fuente única compartida entre backend (deriva y persiste el sector) y
 * frontend (vista previa en vivo del formulario).
 */

export type SectorCiiu =
  | 'agropecuario'
  | 'mineria'
  | 'manufactura'
  | 'construccion'
  | 'comercio'
  | 'transporte'
  | 'servicios'

export type InfoCiiu = {
  seccion: string
  descripcion: string
  sector: SectorCiiu
}

type Seccion = {
  rango: [number, number]
  seccion: string
  descripcion: string
  sector: SectorCiiu
}

const SECCIONES: Seccion[] = [
  { rango: [1, 3], seccion: 'A', descripcion: 'Agricultura, ganadería, caza, silvicultura y pesca', sector: 'agropecuario' },
  { rango: [5, 9], seccion: 'B', descripcion: 'Explotación de minas y canteras', sector: 'mineria' },
  { rango: [10, 33], seccion: 'C', descripcion: 'Industrias manufactureras', sector: 'manufactura' },
  { rango: [35, 35], seccion: 'D', descripcion: 'Suministro de electricidad, gas, vapor y aire acondicionado', sector: 'servicios' },
  { rango: [36, 39], seccion: 'E', descripcion: 'Distribución de agua; saneamiento y gestión de desechos', sector: 'servicios' },
  { rango: [41, 43], seccion: 'F', descripcion: 'Construcción', sector: 'construccion' },
  { rango: [45, 47], seccion: 'G', descripcion: 'Comercio al por mayor y al por menor; reparación de vehículos', sector: 'comercio' },
  { rango: [49, 53], seccion: 'H', descripcion: 'Transporte y almacenamiento', sector: 'transporte' },
  { rango: [55, 56], seccion: 'I', descripcion: 'Alojamiento y servicios de comida', sector: 'servicios' },
  { rango: [58, 63], seccion: 'J', descripcion: 'Información y comunicaciones', sector: 'servicios' },
  { rango: [64, 66], seccion: 'K', descripcion: 'Actividades financieras y de seguros', sector: 'servicios' },
  { rango: [68, 68], seccion: 'L', descripcion: 'Actividades inmobiliarias', sector: 'servicios' },
  { rango: [69, 75], seccion: 'M', descripcion: 'Actividades profesionales, científicas y técnicas', sector: 'servicios' },
  { rango: [77, 82], seccion: 'N', descripcion: 'Actividades de servicios administrativos y de apoyo', sector: 'servicios' },
  { rango: [84, 84], seccion: 'O', descripcion: 'Administración pública y defensa', sector: 'servicios' },
  { rango: [85, 85], seccion: 'P', descripcion: 'Educación', sector: 'servicios' },
  { rango: [86, 88], seccion: 'Q', descripcion: 'Atención de la salud humana y asistencia social', sector: 'servicios' },
  { rango: [90, 93], seccion: 'R', descripcion: 'Actividades artísticas, de entretenimiento y recreación', sector: 'servicios' },
  { rango: [94, 96], seccion: 'S', descripcion: 'Otras actividades de servicios', sector: 'servicios' },
  { rango: [97, 98], seccion: 'T', descripcion: 'Actividades de los hogares como empleadores', sector: 'servicios' },
  { rango: [99, 99], seccion: 'U', descripcion: 'Organizaciones y entidades extraterritoriales', sector: 'servicios' },
]

/** Etiqueta legible del sector derivado. */
export const SECTOR_LABEL: Record<SectorCiiu, string> = {
  agropecuario: 'Agropecuario',
  mineria: 'Minería',
  manufactura: 'Manufactura',
  construccion: 'Construcción',
  comercio: 'Comercio',
  transporte: 'Transporte',
  servicios: 'Servicios',
}

/** Extrae la división (2 primeros dígitos) de un código CIIU. */
function division(codigo: string): number | null {
  const digitos = codigo.replace(/\D/g, '')
  if (digitos.length < 2) return null
  return Number(digitos.slice(0, 2))
}

/** Devuelve sección + descripción + sector para un código CIIU, o null si es inválido. */
export function infoCiiu(codigo: string): InfoCiiu | null {
  const div = division(codigo)
  if (div === null) return null
  const match = SECCIONES.find((s) => div >= s.rango[0] && div <= s.rango[1])
  if (!match) return null
  return { seccion: match.seccion, descripcion: match.descripcion, sector: match.sector }
}

/** Sector normalizado a partir del CIIU (para el catálogo de riesgos). */
export function sectorDesdeCiiu(codigo: string): SectorCiiu | null {
  return infoCiiu(codigo)?.sector ?? null
}
