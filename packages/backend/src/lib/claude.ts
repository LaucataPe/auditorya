/**
 * Cliente de Claude API. Todas las funciones de IA del producto pasan por aquí.
 *
 * Diseño "real con fallback": si ANTHROPIC_API_KEY no está configurada,
 * `iaDisponible()` devuelve false y cada caller decide su plan B (catálogo
 * estático, plantilla, mensaje al usuario). La IA nunca es requisito para
 * que la aplicación funcione.
 */
import Anthropic from '@anthropic-ai/sdk'

export const MODELO = process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6'

export function iaDisponible(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

let cliente: Anthropic | null = null

function getCliente(): Anthropic {
  if (!iaDisponible()) throw new Error('ANTHROPIC_API_KEY no configurada')
  if (!cliente) cliente = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return cliente
}

export type MensajeChat = { role: 'user' | 'assistant'; content: string }

/** Llamada de texto libre. */
export async function completarTexto(opts: {
  system: string
  mensajes: MensajeChat[]
  maxTokens?: number
}): Promise<string> {
  const res = await getCliente().messages.create({
    model: MODELO,
    max_tokens: opts.maxTokens ?? 1500,
    system: opts.system,
    messages: opts.mensajes,
  })
  const bloque = res.content.find((b) => b.type === 'text')
  return bloque && 'text' in bloque ? bloque.text : ''
}

/**
 * Llamada que espera JSON. Pre-llena la respuesta del asistente con el inicio
 * del JSON para forzar el formato y tolera fences de markdown al parsear.
 */
export async function completarJSON<T>(opts: {
  system: string
  prompt: string
  inicioJson?: '[' | '{'
  maxTokens?: number
}): Promise<T> {
  const inicio = opts.inicioJson ?? '['
  const res = await getCliente().messages.create({
    model: MODELO,
    max_tokens: opts.maxTokens ?? 3000,
    system: opts.system,
    messages: [
      { role: 'user', content: opts.prompt },
      { role: 'assistant', content: inicio },
    ],
  })
  const bloque = res.content.find((b) => b.type === 'text')
  const texto = (inicio + (bloque && 'text' in bloque ? bloque.text : ''))
    .replace(/```(json)?/g, '')
    .trim()
  return JSON.parse(texto) as T
}
