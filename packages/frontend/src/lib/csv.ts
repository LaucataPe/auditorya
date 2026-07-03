/** Utilidades de parseo de CSV y de números en formato local (Colombia). */

function detectarDelimitador(text: string): string {
  const primera = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? ''
  const punto_coma = (primera.match(/;/g) ?? []).length
  const coma = (primera.match(/,/g) ?? []).length
  const tab = (primera.match(/\t/g) ?? []).length
  if (tab >= punto_coma && tab >= coma) return '\t'
  return punto_coma > coma ? ';' : ','
}

/** Parsea CSV (con comillas) a una matriz de strings. */
export function parseCsv(text: string): string[][] {
  const delim = detectarDelimitador(text)
  const filas: string[][] = []
  let fila: string[] = []
  let campo = ''
  let enComillas = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (enComillas) {
      if (ch === '"') {
        if (text[i + 1] === '"') { campo += '"'; i++ }
        else enComillas = false
      } else campo += ch
    } else {
      if (ch === '"') enComillas = true
      else if (ch === delim) { fila.push(campo); campo = '' }
      else if (ch === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = '' }
      else if (ch === '\r') { /* ignora */ }
      else campo += ch
    }
  }
  if (campo.length > 0 || fila.length > 0) { fila.push(campo); filas.push(fila) }
  return filas.filter((f) => f.some((c) => c.trim().length > 0))
}

/** Convierte un texto numérico en formato local a número. Soporta 1.234.567,89 y (123) negativos. */
export function parseNumero(raw: string | number): number {
  if (typeof raw === 'number') return raw
  let s = (raw ?? '').toString().trim().replace(/[^\d.,\-()]/g, '')
  if (!s) return NaN
  let neg = false
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1) }
  if (s.startsWith('-')) { neg = true; s = s.slice(1) }
  const hasDot = s.includes('.')
  const hasComma = s.includes(',')
  if (hasDot && hasComma) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (hasComma) {
    const partes = s.split(',')
    if (partes.length === 2 && partes[1].length <= 2) s = s.replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (hasDot) {
    const partes = s.split('.')
    if (partes.length > 2) s = s.replace(/\./g, '')
  }
  const n = Number(s)
  return neg ? -n : n
}
