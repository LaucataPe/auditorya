/**
 * Transcripción de las casillas de un formulario DIAN (300 IVA, 350 retefuente)
 * a partir del PDF/imagen del borrador.
 *
 * Esta capa SOLO transcribe: casilla → valor. El mapeo a renglones, la suma de
 * casillas agrupadas y el cuadre de totales son código determinista
 * (`aplicarLecturaFormulario` en @auditorya/types), y ahí es donde se detecta
 * una lectura corrida o inventada. No mover esa responsabilidad acá.
 *
 * Dos fuentes, en orden de preferencia:
 *  - `n8n`: workflow propio (N8N_DECLARACION_URL). Recibe el PDF en base64 y
 *    devuelve {"casillas": {...}}. Es la fuente preferida cuando está configurada.
 *  - `llm`: el LLM multimodal vía OpenRouter, con la cascada pdf-text → OCR.
 *
 * Diseño "real con fallback", como el resto de la IA del producto: si n8n falla
 * y hay OPENROUTER_API_KEY, se reintenta con el LLM antes de darse por vencido.
 * El caller recibe qué fuente respondió para dejarlo en la pista de auditoría.
 */
import { z } from 'zod'
import { completarJSONArchivo, iaDisponible, type ArchivoLLM } from './llm'

export type FuenteLectura = 'n8n' | 'llm'

/** Las casillas llegan como texto o número según la fuente; se normalizan a entero. */
const CasillasSchema = z.object({
  casillas: z.record(
    z.union([z.number(), z.string(), z.null()]).transform((v) => {
      if (v === null || v === '') return null
      const n = typeof v === 'number' ? v : Number(String(v).replace(/[.,\s$]/g, ''))
      return Number.isFinite(n) ? Math.round(n) : null
    }),
  ),
})

export type Casillas = Record<string, number | null>

/**
 * Normaliza la respuesta de una fuente a casillas. Tolera que venga envuelta
 * (n8n suele anidar en `data`/`json` o devolver un arreglo de un ítem) y que los
 * valores lleguen como texto con separadores de miles.
 */
export function parsearCasillas(crudo: unknown): Casillas {
  return CasillasSchema.parse(desenvolver(crudo)).casillas
}

const N8N_TIMEOUT_MS = 180_000 // parsear un formulario puede tardar; el endpoint ya corre en background del request

export function n8nDisponible(): boolean {
  return !!process.env.N8N_DECLARACION_URL
}

/** ¿Se puede leer un formulario con casillas (300/350)? Basta con cualquiera de las dos fuentes. */
export function lecturaCasillasDisponible(): boolean {
  return n8nDisponible() || iaDisponible()
}

/** Extrae `casillas` de una respuesta que puede venir plana, envuelta en `data` o como arreglo de un ítem. */
export function desenvolver(crudo: unknown): unknown {
  if (Array.isArray(crudo)) return crudo.length === 1 ? desenvolver(crudo[0]) : crudo
  if (crudo && typeof crudo === 'object') {
    const o = crudo as Record<string, unknown>
    if ('casillas' in o) return o
    // n8n suele envolver la salida del workflow en `data` o `json`.
    if ('data' in o) return desenvolver(o.data)
    if ('json' in o) return desenvolver(o.json)
  }
  return crudo
}

async function leerConN8n(archivo: ArchivoLLM, tipo: string): Promise<Casillas> {
  const url = process.env.N8N_DECLARACION_URL
  if (!url) throw new Error('N8N_DECLARACION_URL no configurada')

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(N8N_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.N8N_DECLARACION_TOKEN ? { Authorization: `Bearer ${process.env.N8N_DECLARACION_TOKEN}` } : {}),
      },
      body: JSON.stringify({
        pdf_base64: archivo.base64,
        tipo,
        nombre_archivo: archivo.nombre,
      }),
    })
  } catch (err) {
    const nombre = (err as Error).name
    if (nombre === 'TimeoutError' || nombre === 'AbortError') {
      throw new Error(`el workflow no respondió en ${N8N_TIMEOUT_MS / 1000}s`)
    }
    throw err
  }

  if (!res.ok) {
    const detalle = await res.text().catch(() => '')
    throw new Error(`n8n ${res.status}: ${detalle.slice(0, 300)}`)
  }

  const crudo = await res.json().catch(() => {
    throw new Error('la respuesta del workflow no es JSON')
  })
  const casillas = parsearCasillas(crudo)
  if (Object.values(casillas).every((v) => v === null)) throw new Error('el workflow no devolvió ninguna casilla legible')
  return casillas
}

/**
 * Cascada del LLM: los PDF se intentan primero con el parser de texto gratuito;
 * si no extrae ningún valor (formularios MUISCA con campos XFA o PDFs escaneados)
 * o falla, se reintenta con OCR (mistral-ocr).
 */
async function leerConLlm(archivo: ArchivoLLM, system: string, prompt: string): Promise<Casillas> {
  const intentar = async (engine?: 'pdf-text' | 'mistral-ocr') => {
    const crudo = await completarJSONArchivo<unknown>({ system, prompt, archivo, inicioJson: '{', maxTokens: 3000, engine })
    return parsearCasillas(crudo)
  }

  if (archivo.mime !== 'application/pdf') return intentar()

  try {
    const casillas = await intentar('pdf-text')
    if (Object.values(casillas).some((v) => typeof v === 'number' && v !== 0)) return casillas
    console.warn('[lectura-dian] pdf-text no extrajo valores del borrador; reintentando con OCR')
    return await intentar('mistral-ocr')
  } catch (err) {
    console.warn('[lectura-dian] lectura con pdf-text falló; reintentando con OCR:', (err as Error).message)
    return intentar('mistral-ocr')
  }
}

/**
 * Transcribe las casillas del formulario. Prefiere el workflow de n8n y cae al
 * LLM si falla (o si n8n no está configurado). Devuelve también qué fuente
 * respondió, para la pista de auditoría.
 */
export async function transcribirCasillas(opts: {
  archivo: ArchivoLLM
  /** TipoImpuesto: viaja tal cual al workflow ('iva', 'retefuente'). */
  tipo: string
  /** System + prompt del camino LLM; el workflow de n8n no los necesita. */
  system: string
  prompt: string
}): Promise<{ casillas: Casillas; fuente: FuenteLectura }> {
  if (n8nDisponible()) {
    try {
      return { casillas: await leerConN8n(opts.archivo, opts.tipo), fuente: 'n8n' }
    } catch (err) {
      if (!iaDisponible()) throw err
      console.warn('[lectura-dian] el workflow n8n falló; cayendo al LLM:', (err as Error).message)
    }
  }
  return { casillas: await leerConLlm(opts.archivo, opts.system, opts.prompt), fuente: 'llm' }
}
