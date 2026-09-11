/**
 * Cliente LLM vía OpenRouter. Todas las funciones de IA del producto pasan por aquí.
 *
 * OpenRouter expone una API compatible con OpenAI (Chat Completions), así que
 * hablamos directo con `fetch` — sin SDK. El modelo se elige con OPENROUTER_MODEL
 * (cualquier slug de OpenRouter, p. ej. 'anthropic/claude-sonnet-4.5',
 * 'openai/gpt-4o-mini', etc.).
 *
 * Diseño "real con fallback": si OPENROUTER_API_KEY no está configurada,
 * `iaDisponible()` devuelve false y cada caller decide su plan B (catálogo
 * estático, plantilla, mensaje al usuario). La IA nunca es requisito para
 * que la aplicación funcione.
 */

const BASE_URL = process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1'

export const MODELO = process.env.OPENROUTER_MODEL ?? 'anthropic/claude-sonnet-4.5'

export function iaDisponible(): boolean {
  return !!process.env.OPENROUTER_API_KEY
}

export type MensajeChat = { role: 'user' | 'assistant'; content: string }

type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string }

// Una petición colgada a OpenRouter no puede bloquear la conexión HTTP indefinidamente.
const TIMEOUT_MS = 60_000

/** POST crudo a /chat/completions. `body` ya trae model/messages; devuelve el texto del asistente. */
async function llamarOpenRouter(body: Record<string, unknown>, timeoutMs = TIMEOUT_MS): Promise<string> {
  if (!iaDisponible()) throw new Error('OPENROUTER_API_KEY no configurada')

  let res: Response
  try {
    res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        // Cabeceras de atribución recomendadas por OpenRouter (opcionales).
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL ?? 'https://auditorya.app',
        'X-Title': 'AuditorYa',
      },
      body: JSON.stringify(body),
    })
  } catch (err) {
    if ((err as Error).name === 'TimeoutError' || (err as Error).name === 'AbortError') {
      throw new Error(`OpenRouter no respondió en ${timeoutMs / 1000}s (timeout)`)
    }
    throw err
  }

  if (!res.ok) {
    const detalle = await res.text().catch(() => '')
    throw new Error(`OpenRouter ${res.status}: ${detalle.slice(0, 300)}`)
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return data.choices?.[0]?.message?.content ?? ''
}

/** Llamada base de chat (solo texto). Devuelve el texto del asistente. */
async function chat(opts: { system: string; messages: MensajeChat[]; maxTokens?: number }): Promise<string> {
  const messages: ChatMsg[] = [{ role: 'system', content: opts.system }, ...opts.messages]
  return llamarOpenRouter({ model: MODELO, max_tokens: opts.maxTokens ?? 1500, messages })
}

/** Llamada de texto libre. */
export async function completarTexto(opts: {
  system: string
  mensajes: MensajeChat[]
  maxTokens?: number
}): Promise<string> {
  const texto = await chat({ system: opts.system, messages: opts.mensajes, maxTokens: opts.maxTokens })
  return texto.trim()
}

/**
 * Llamada que espera JSON. Instruye al modelo a devolver solo JSON y extrae el
 * primer arreglo/objeto de la respuesta (tolera prosa y fences de markdown).
 */
export async function completarJSON<T>(opts: {
  system: string
  prompt: string
  inicioJson?: '[' | '{'
  maxTokens?: number
}): Promise<T> {
  const inicio = opts.inicioJson ?? '['
  const instruccion =
    inicio === '['
      ? 'Responde ÚNICAMENTE con un arreglo JSON válido, sin texto adicional ni fences de markdown.'
      : 'Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional ni fences de markdown.'

  const texto = await chat({
    system: opts.system,
    messages: [{ role: 'user', content: `${opts.prompt}\n\n${instruccion}` }],
    maxTokens: opts.maxTokens ?? 3000,
  })

  return JSON.parse(extraerJson(texto, inicio)) as T
}

export type ArchivoLLM = {
  nombre: string
  /** application/pdf, image/png, image/jpeg o image/webp */
  mime: string
  base64: string
}

/**
 * Llamada multimodal que espera JSON: un prompt de texto + un archivo (PDF o
 * imagen). Los PDF van con el parser de OpenRouter: `pdf-text` (gratuito,
 * PDFs con capa de texto) o `mistral-ocr` (OCR de pago, para PDFs escaneados
 * o con campos de formulario XFA que pdf-text no extrae). Las imágenes van
 * como image_url para modelos con visión.
 */
export async function completarJSONArchivo<T>(opts: {
  system: string
  prompt: string
  archivo: ArchivoLLM
  inicioJson?: '[' | '{'
  maxTokens?: number
  /** Solo PDFs; default 'pdf-text'. */
  engine?: 'pdf-text' | 'mistral-ocr'
}): Promise<T> {
  const inicio = opts.inicioJson ?? '{'
  const instruccion =
    inicio === '['
      ? 'Responde ÚNICAMENTE con un arreglo JSON válido, sin texto adicional ni fences de markdown.'
      : 'Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional ni fences de markdown.'

  const dataUrl = `data:${opts.archivo.mime};base64,${opts.archivo.base64}`
  const esPdf = opts.archivo.mime === 'application/pdf'
  const parteArchivo = esPdf
    ? { type: 'file', file: { filename: opts.archivo.nombre, file_data: dataUrl } }
    : { type: 'image_url', image_url: { url: dataUrl } }

  const texto = await llamarOpenRouter(
    {
      model: MODELO,
      max_tokens: opts.maxTokens ?? 3000,
      messages: [
        { role: 'system', content: opts.system },
        {
          role: 'user',
          content: [{ type: 'text', text: `${opts.prompt}\n\n${instruccion}` }, parteArchivo],
        },
      ],
      ...(esPdf ? { plugins: [{ id: 'file-parser', pdf: { engine: opts.engine ?? 'pdf-text' } }] } : {}),
    },
    // Parsear/OCRear un PDF grande tarda más que una llamada de solo texto.
    120_000,
  )

  try {
    return JSON.parse(extraerJson(texto, inicio)) as T
  } catch {
    throw new Error(`la respuesta del modelo no es JSON válido: "${texto.slice(0, 200)}"`)
  }
}

/** Extrae el bloque JSON (arreglo u objeto) de una respuesta que puede traer prosa o fences. */
function extraerJson(texto: string, inicio: '[' | '{'): string {
  const limpio = texto.replace(/```(json)?/gi, '').trim()
  const abre = inicio
  const cierra = inicio === '[' ? ']' : '}'
  const i = limpio.indexOf(abre)
  const j = limpio.lastIndexOf(cierra)
  return i !== -1 && j > i ? limpio.slice(i, j + 1) : limpio
}
