/**
 * Naturaleza del saldo por cuenta PUC — insumo del bloque B del procedimiento de
 * validación del balance (regla V-20 y siguientes).
 *
 * Regla general: clases 1, 5, 6, 7 son débito; clases 2, 3, 4 son crédito.
 * Excepciones: cuentas correctoras o de resultado negativo cuyo saldo natural va
 * contra su clase. Se resuelven por prefijo (p. ej. '1399' cubre '139905').
 * Catálogo configurable por firma en una etapa posterior; este es el punto de partida.
 */

export type Naturaleza = 'debito' | 'credito'

/** Prefijos con naturaleza contraria a su clase, con el motivo. */
export const EXCEPCIONES_NATURALEZA: ReadonlyArray<{ prefijo: string; naturaleza: Naturaleza; motivo: string }> = [
  // Débito dentro de clases crédito
  { prefijo: '4175', naturaleza: 'debito', motivo: 'Devoluciones en ventas' },
  { prefijo: '3610', naturaleza: 'debito', motivo: 'Pérdida del ejercicio' },
  { prefijo: '3710', naturaleza: 'debito', motivo: 'Pérdidas acumuladas' },
  { prefijo: '3110', naturaleza: 'debito', motivo: 'Capital por suscribir' },
  // Crédito dentro de clases débito (correctoras)
  { prefijo: '1299', naturaleza: 'credito', motivo: 'Provisión de inversiones' },
  { prefijo: '1399', naturaleza: 'credito', motivo: 'Provisión / deterioro de deudores' },
  { prefijo: '1499', naturaleza: 'credito', motivo: 'Provisión de inventarios' },
  { prefijo: '1592', naturaleza: 'credito', motivo: 'Depreciación acumulada' },
  { prefijo: '1597', naturaleza: 'credito', motivo: 'Agotamiento acumulado' },
  { prefijo: '1598', naturaleza: 'credito', motivo: 'Amortización acumulada (PPE)' },
  { prefijo: '1599', naturaleza: 'credito', motivo: 'Provisión de propiedades, planta y equipo' },
  { prefijo: '1698', naturaleza: 'credito', motivo: 'Amortización acumulada de intangibles' },
  { prefijo: '1699', naturaleza: 'credito', motivo: 'Provisión de intangibles' },
  { prefijo: '1799', naturaleza: 'credito', motivo: 'Provisión de diferidos' },
  { prefijo: '1899', naturaleza: 'credito', motivo: 'Provisión de otros activos' },
  { prefijo: '6210', naturaleza: 'credito', motivo: 'Devoluciones en compras' },
]

/** Naturaleza por clase (primer dígito). Clases 8 y 9 son cuentas de orden y devuelven null. */
export function naturalezaPorClase(codigo: string): Naturaleza | null {
  const c = codigo.charAt(0)
  if (c === '1' || c === '5' || c === '6' || c === '7') return 'debito'
  if (c === '2' || c === '3' || c === '4') return 'credito'
  return null
}

/**
 * Naturaleza esperada del saldo de una cuenta, aplicando primero las excepciones
 * por prefijo más largo y luego la regla por clase. Devuelve null para cuentas
 * de orden o códigos fuera del PUC.
 */
export function naturalezaPuc(codigo: string): { naturaleza: Naturaleza; motivo: string | null } | null {
  const cod = String(codigo ?? '').trim()
  if (!cod) return null
  let mejor: { prefijo: string; naturaleza: Naturaleza; motivo: string } | null = null
  for (const ex of EXCEPCIONES_NATURALEZA) {
    if (cod.startsWith(ex.prefijo) && (!mejor || ex.prefijo.length > mejor.prefijo.length)) mejor = ex
  }
  if (mejor) return { naturaleza: mejor.naturaleza, motivo: mejor.motivo }
  const base = naturalezaPorClase(cod)
  return base ? { naturaleza: base, motivo: null } : null
}

/**
 * Signo esperado del saldo en la "convención natural" del balance (saldo positivo =
 * conforme a la naturaleza). Un saldo negativo en esa convención es contrario.
 * En convención "firmada" (débito positivo, crédito negativo) el signo esperado es
 * +1 para débito y −1 para crédito.
 */
export function signoEsperado(codigo: string, convencion: 'natural' | 'firmada'): 1 | -1 | null {
  const n = naturalezaPuc(codigo)
  if (!n) return null
  if (convencion === 'natural') return 1
  return n.naturaleza === 'debito' ? 1 : -1
}
