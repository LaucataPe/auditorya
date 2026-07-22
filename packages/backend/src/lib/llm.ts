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

/** Llamada base al endpoint de chat de OpenRouter. Devuelve el texto del asistente. */
async function chat(opts: { system: string; messages: MensajeChat[]; maxTokens?: number }): Promise<string> {
  if (!iaDisponible()) throw new Error('OPENROUTER_API_KEY no configurada')

  const messages: ChatMsg[] = [{ role: 'system', content: opts.system }, ...opts.messages]

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      // Cabeceras de atribución recomendadas por OpenRouter (opcionales).
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL ?? 'https://auditorya.app',
      'X-Title': 'AuditorYa',
    },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: opts.maxTokens ?? 1500,
      messages,
    }),
  })

  if (!res.ok) {
    const detalle = await res.text().catch(() => '')
    throw new Error(`OpenRouter ${res.status}: ${detalle.slice(0, 300)}`)
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return data.choices?.[0]?.message?.content ?? ''
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

/** Extrae el bloque JSON (arreglo u objeto) de una respuesta que puede traer prosa o fences. */
function extraerJson(texto: string, inicio: '[' | '{'): string {
  const limpio = texto.replace(/```(json)?/gi, '').trim()
  const abre = inicio
  const cierra = inicio === '[' ? ']' : '}'
  const i = limpio.indexOf(abre)
  const j = limpio.lastIndexOf(cierra)
  return i !== -1 && j > i ? limpio.slice(i, j + 1) : limpio
}
