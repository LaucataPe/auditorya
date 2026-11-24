/**
 * Seudonimización de lo que sale hacia el LLM. Se aplica dentro de `lib/llm.ts`,
 * así que ninguna función de IA puede saltársela.
 *
 * Dos capas:
 *  - Entradas conocidas (nombre de la empresa, NIT…): se sustituyen por tokens
 *    estables (EMP_01, NIT_01) en cualquier parte del texto.
 *  - Patrones de identificadores en texto libre (correos, teléfonos móviles, NIT con
 *    dígito de verificación, y cédula/NIT/cuenta precedidos de su etiqueta). NO se
 *    tocan cifras sueltas: un monto de 1.250.000.000 es dato de auditoría, no un documento.
 *
 * Límite conocido: nombres de personas o terceros escritos en texto libre solo se
 * detectan si se registran como entrada (`tipo: 'persona' | 'tercero'`).
 *
 * El mapa token ↔ valor vive solo en memoria durante la petición; la respuesta del
 * modelo se rehidrata antes de entregarla al usuario.
 */

export type TipoSeudonimo = 'empresa' | 'nit' | 'tercero' | 'persona'

export type EntradaSeudonimo = { tipo: TipoSeudonimo; valor: string }

const PREFIJO: Record<TipoSeudonimo | 'correo' | 'telefono' | 'documento' | 'cuenta', string> = {
  empresa: 'EMP',
  nit: 'NIT',
  tercero: 'TER',
  persona: 'PER',
  correo: 'CORREO',
  telefono: 'TEL',
  documento: 'DOC',
  cuenta: 'CTA',
}

const LIMITE = '(?<![\\p{L}\\p{N}_])'
const LIMITE_FIN = '(?![\\p{L}\\p{N}_])'

const SUFIJO_SOCIETARIO = /[\s,]+(?:s\.?\s?a\.?\s?s\.?|s\.?\s?a\.?|ltda\.?|e\.?\s?u\.?|s\.?\s?c\.?\s?a\.?|y cia\.?(?: s\.?\s?c\.?)?)\s*$/i

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function conPuntos(digitos: string): string {
  return digitos.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** Variantes con las que aparece un NIT: 900123456-7, 900.123.456-7, 900123456, 900.123.456. */
function variantesNit(nit: string): string[] {
  const crudo = nit.trim()
  const [base] = crudo.split('-')
  const digitos = base.replace(/\D/g, '')
  const salida = new Set<string>([crudo])
  if (digitos.length >= 6) {
    salida.add(digitos)
    salida.add(conPuntos(digitos))
    const dv = crudo.includes('-') ? crudo.split('-')[1]?.trim() : ''
    if (dv) {
      salida.add(`${digitos}-${dv}`)
      salida.add(`${conPuntos(digitos)}-${dv}`)
    }
  }
  return [...salida].filter((v) => v.length >= 6)
}

// Patrones de texto libre. Cada uno devuelve el valor a ocultar en el grupo 1 (o el match completo).
const PATRONES: { tipo: 'correo' | 'telefono' | 'documento' | 'cuenta'; re: RegExp; grupo?: number }[] = [
  { tipo: 'correo', re: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gu },
  // Celular colombiano: 3XX XXX XXXX, con o sin +57 y separadores.
  { tipo: 'telefono', re: /(?<!\d)(?:\+?57[\s-]?)?3\d{2}[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/gu },
  // NIT con dígito de verificación: 900.123.456-7
  { tipo: 'documento', re: /(?<![\d.])\d{1,3}(?:\.\d{3}){2}-\d(?!\d)/gu },
  { tipo: 'documento', re: /(?<!\d)\d{8,10}-\d(?!\d)/gu },
  // Cédula / NIT / documento precedidos de su etiqueta.
  {
    tipo: 'documento',
    re: /\b(?:c\.?\s?c\.?|c[eé]dula(?: de ciudadan[ií]a)?|nit|n\.i\.t\.?|documento(?: de identidad)?|pasaporte|c\.?\s?e\.?)\s*(?:no\.?|n[°º]|#|:)?\s*(\d[\d.]{5,14}\d)/giu,
    grupo: 1,
  },
  // Cuentas bancarias precedidas de su etiqueta.
  {
    tipo: 'cuenta',
    re: /\bcuenta(?: de ahorros| corriente| bancaria)?\s*(?:no\.?|n[°º]|#|:)?\s*(\d[\d-]{7,19}\d)/giu,
    grupo: 1,
  },
]

export class Seudonimizador {
  private porValor = new Map<string, string>() // valor normalizado → token
  private porToken = new Map<string, string>() // token → valor original
  private contador: Record<string, number> = {}
  private literales: { re: RegExp; token: string }[] = []

  constructor(entradas: EntradaSeudonimo[] = []) {
    // Las más largas primero: "ACME S.A.S." antes que "ACME".
    const ordenadas: { valor: string; token: string }[] = []
    for (const e of entradas) {
      const valor = e.valor?.trim()
      if (!valor || valor.length < 3) continue
      if (e.tipo === 'nit') {
        const variantes = variantesNit(valor)
        if (variantes.length === 0) continue
        const token = this.tokenPara(e.tipo, variantes[0])
        for (const v of variantes) ordenadas.push({ valor: v, token })
      } else {
        const token = this.tokenPara(e.tipo, valor)
        ordenadas.push({ valor, token })
        // "Inversiones Acme S.A.S." también se escribe "Inversiones Acme": mismo token.
        const sinSufijo = valor.replace(SUFIJO_SOCIETARIO, '').trim()
        if (sinSufijo !== valor && sinSufijo.length >= 3) ordenadas.push({ valor: sinSufijo, token })
      }
    }
    ordenadas.sort((a, b) => b.valor.length - a.valor.length)
    this.literales = ordenadas.map(({ valor, token }) => ({
      re: new RegExp(`${LIMITE}${escaparRegex(valor).replace(/\s+/g, '\\s+')}${LIMITE_FIN}`, 'giu'),
      token,
    }))
  }

  private tokenPara(tipo: keyof typeof PREFIJO, valor: string): string {
    const clave = `${tipo}:${valor.toLowerCase()}`
    const existente = this.porValor.get(clave)
    if (existente) return existente
    const n = (this.contador[tipo] = (this.contador[tipo] ?? 0) + 1)
    const token = `${PREFIJO[tipo]}_${String(n).padStart(2, '0')}`
    this.porValor.set(clave, token)
    this.porToken.set(token, valor)
    return token
  }

  /** Sustituye entradas conocidas y patrones de identificadores por sus tokens. */
  aplicar(texto: string): string {
    let salida = texto
    for (const { re, token } of this.literales) salida = salida.replace(re, token)
    for (const { tipo, re, grupo } of PATRONES) {
      salida = salida.replace(re, (...args) => {
        const match = args[0] as string
        if (grupo === undefined) return this.tokenPara(tipo, match)
        const valor = args[grupo] as string
        return match.replace(valor, this.tokenPara(tipo, valor))
      })
    }
    return salida
  }

  /**
   * Devuelve los valores reales en la respuesta del modelo. Con `json: true` el valor
   * se escapa para que la respuesta siga siendo JSON válido (comillas, saltos de línea).
   */
  rehidratar(texto: string, opts: { json?: boolean } = {}): string {
    if (this.porToken.size === 0) return texto
    return texto.replace(/\b(?:EMP|NIT|TER|PER|CORREO|TEL|DOC|CTA)_\d{2}\b/g, (token) => {
      const valor = this.porToken.get(token)
      if (valor === undefined) return token
      return opts.json ? JSON.stringify(valor).slice(1, -1) : valor
    })
  }

  /** Cuántos identificadores distintos se ocultaron (para la pista de auditoría). */
  get total(): number {
    return this.porToken.size
  }
}

export function crearSeudonimizador(entradas: EntradaSeudonimo[] = []): Seudonimizador {
  return new Seudonimizador(entradas)
}

/** Entradas estándar de una empresa cliente. */
export function entradasEmpresa(empresa: { nombre: string; nit: string }): EntradaSeudonimo[] {
  return [
    { tipo: 'empresa', valor: empresa.nombre },
    { tipo: 'nit', valor: empresa.nit },
  ]
}
