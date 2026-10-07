/**
 * Municipios para los impuestos territoriales (reteICA e ICA): una obligación
 * de estos impuestos es por municipio, y la empresa puede tener varias en la
 * misma vigencia. La clave se guarda en obligaciones_tributarias.municipio; un
 * municipio que no esté en la tabla se guarda con su nombre tal como lo escribe
 * el usuario y se muestra igual.
 *
 * Sin imports a propósito: lo usan tributario.ts y los motores del agente.
 */
import type { TipoImpuesto } from './tributario'

const norm = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

export type MunicipioReteica = {
  clave: string
  nombre: string
  /** Código DANE del municipio. */
  dane: string
  /** NIT de la entidad territorial (para reconocer el pago de la declaración), si se conoce con certeza. */
  nit: string | null
  /** Cómo aparece en nombres de cuentas y obligaciones. */
  patron: RegExp
  /** Tarifas por mil admisibles de retención (las del ICA por actividad); null = no tabuladas. */
  tarifas: number[] | null
  /** Tarifas por mil del ICA por actividad (incluye las financieras); sin el campo, se usan las de retención. */
  tarifasIca?: number[]
}

export const MUNICIPIOS_RETEICA: MunicipioReteica[] = [
  // Bogotá: la tarifa de retención es la del ICA de la actividad del proveedor (Acuerdo 65 de 2002 y modificaciones).
  // En el ICA se suma la de actividades financieras (14 por mil). PENDIENTE DE VALIDAR por la firma.
  { clave: 'bogota', nombre: 'Bogotá D.C.', dane: '11001', nit: '899999061', patron: /bogota|distrito capital|\bd\.?\s?c\.?\b|11001/, tarifas: [4.14, 6.9, 7, 9.66, 11.04, 13.8], tarifasIca: [4.14, 6.9, 7, 9.66, 11.04, 13.8, 14] },
  { clave: 'cali', nombre: 'Santiago de Cali', dane: '76001', nit: '890399011', patron: /\bcali\b|76001/, tarifas: null },
  { clave: 'medellin', nombre: 'Medellín', dane: '05001', nit: null, patron: /medellin|05001/, tarifas: null },
  { clave: 'barranquilla', nombre: 'Barranquilla', dane: '08001', nit: null, patron: /barranquilla|08001/, tarifas: null },
  { clave: 'cartagena', nombre: 'Cartagena', dane: '13001', nit: null, patron: /cartagena|13001/, tarifas: null },
  { clave: 'bucaramanga', nombre: 'Bucaramanga', dane: '68001', nit: null, patron: /bucaramanga|68001/, tarifas: null },
  { clave: 'pereira', nombre: 'Pereira', dane: '66001', nit: null, patron: /pereira|66001/, tarifas: null },
  { clave: 'manizales', nombre: 'Manizales', dane: '17001', nit: null, patron: /manizales|17001/, tarifas: null },
  { clave: 'cucuta', nombre: 'Cúcuta', dane: '54001', nit: null, patron: /cucuta|54001/, tarifas: null },
  { clave: 'ibague', nombre: 'Ibagué', dane: '73001', nit: null, patron: /ibague|73001/, tarifas: null },
  { clave: 'villavicencio', nombre: 'Villavicencio', dane: '50001', nit: null, patron: /villavicencio|50001/, tarifas: null },
  { clave: 'santa-marta', nombre: 'Santa Marta', dane: '47001', nit: null, patron: /santa marta|47001/, tarifas: null },
  { clave: 'pasto', nombre: 'Pasto', dane: '52001', nit: null, patron: /\bpasto\b|52001/, tarifas: null },
  { clave: 'neiva', nombre: 'Neiva', dane: '41001', nit: null, patron: /neiva|41001/, tarifas: null },
  { clave: 'armenia', nombre: 'Armenia', dane: '63001', nit: null, patron: /armenia|63001/, tarifas: null },
  { clave: 'monteria', nombre: 'Montería', dane: '23001', nit: null, patron: /monteria|23001/, tarifas: null },
  { clave: 'valledupar', nombre: 'Valledupar', dane: '20001', nit: null, patron: /valledupar|20001/, tarifas: null },
  { clave: 'tunja', nombre: 'Tunja', dane: '15001', nit: null, patron: /tunja|15001/, tarifas: null },
  { clave: 'popayan', nombre: 'Popayán', dane: '19001', nit: null, patron: /popayan|19001/, tarifas: null },
  { clave: 'yumbo', nombre: 'Yumbo', dane: '76892', nit: null, patron: /yumbo|76892/, tarifas: null },
  { clave: 'palmira', nombre: 'Palmira', dane: '76520', nit: null, patron: /palmira|76520/, tarifas: null },
  { clave: 'soacha', nombre: 'Soacha', dane: '25754', nit: null, patron: /soacha|25754/, tarifas: null },
  { clave: 'chia', nombre: 'Chía', dane: '25175', nit: null, patron: /\bchia\b|25175/, tarifas: null },
  { clave: 'funza', nombre: 'Funza', dane: '25286', nit: null, patron: /funza|25286/, tarifas: null },
  { clave: 'mosquera', nombre: 'Mosquera', dane: '25473', nit: null, patron: /mosquera|25473/, tarifas: null },
  { clave: 'itagui', nombre: 'Itagüí', dane: '05360', nit: null, patron: /itagui|05360/, tarifas: null },
  { clave: 'envigado', nombre: 'Envigado', dane: '05266', nit: null, patron: /envigado|05266/, tarifas: null },
  { clave: 'bello', nombre: 'Bello', dane: '05088', nit: null, patron: /\bbello\b|05088/, tarifas: null },
  { clave: 'rionegro', nombre: 'Rionegro', dane: '05615', nit: null, patron: /rionegro|05615/, tarifas: null },
]


export function municipioPorClave(clave: string | null | undefined): MunicipioReteica | null {
  return MUNICIPIOS_RETEICA.find((m) => m.clave === clave) ?? null
}

/** Municipio que menciona un texto (nombre de subcuenta, de obligación o de tercero). */
export function municipioDeTexto(texto: string | null | undefined): MunicipioReteica | null {
  const n = norm(texto)
  if (!n) return null
  return MUNICIPIOS_RETEICA.find((m) => m.patron.test(n)) ?? null
}

/** Nombre para mostrar: el de la tabla, o el texto guardado si no está en ella. */
export function nombreMunicipio(clave: string | null | undefined): string {
  return municipioPorClave(clave)?.nombre ?? clave ?? 'sin municipio'
}

/** Impuestos territoriales: una obligación por municipio, varias en la misma vigencia. */
export const IMPUESTOS_MUNICIPALES: readonly TipoImpuesto[] = ['reteica', 'ica']
export function esImpuestoMunicipal(tipo: TipoImpuesto): boolean {
  return IMPUESTOS_MUNICIPALES.includes(tipo)
}

/** Clave estable de un municipio escrito por el usuario: la de la tabla si lo reconoce, si no el nombre limpio. */
export function normalizarMunicipio(texto: string | null | undefined): string | null {
  const t = (texto ?? '').trim()
  if (!t) return null
  return municipioPorClave(t)?.clave ?? municipioDeTexto(t)?.clave ?? t
}

/** ¿Dos municipios guardados son el mismo? (clave de la tabla o nombre escrito, sin tildes ni mayúsculas). */
export function mismoMunicipio(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizarMunicipio(a)
  const y = normalizarMunicipio(b)
  return !!x && !!y && norm(x) === norm(y)
}
