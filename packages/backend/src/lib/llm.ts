/**
 * Cliente LLM vía OpenRouter. Todas las funciones de IA del producto pasan por aquí.
 *
 * OpenRouter expone una API compatible con OpenAI (Chat Completions), así que
 * hablamos directo con `fetch` — sin SDK. El modelo se elige con OPENROUTER_MODEL
 * (slug de OpenRouter). La política de tratamiento de datos declara que solo se
 * usa Gemini de Google: no cambiar a otro proveedor sin actualizarla (lib types/politica-datos).
 *
 * Diseño "real con fallback": si OPENROUTER_API_KEY no está configurada,
 * `iaDisponible()` devuelve false y cada caller decide su plan B (catálogo
 * estático, plantilla, mensaje al usuario). La IA nunca es requisito para
 * que la aplicación funcione.
 */

import { db } from '../db/client'
import { llmLlamadas } from '../db/schema'
import { crearSeudonimizador, type Seudonimizador } from './seudonimizar'

const BASE_URL = process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1'

export const MODELO = process.env.OPENROUTER_MODEL ?? 'google/gemini-2.5-flash'

if (!MODELO.startsWith('google/')) {
  console.warn(`[llm] OPENROUTER_MODEL=${MODELO} no es de Google: la política de datos solo declara Gemini. Actualiza la política antes de usarlo.`)
}

// 'deny' por defecto. 'allow' solo si un modelo concreto no tiene proveedores sin retención.
const POLITICA_DATOS = process.env.OPENROUTER_DATA_COLLECTION === 'allow' ? 'allow' : 'deny'

export function iaDisponible(): boolean {
  return !!process.env.OPENROUTER_API_KEY
}

/** A quién se le carga la llamada y para qué: alimenta `llm_llamadas` (costos por firma y propósito). */
export type RegistroLLM = { firmaId: string; auditoriaId?: string; proposito: string }

export type MensajeChat = { role: 'user' | 'assistant'; content: string }

type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string }

// Una petición colgada a OpenRouter no puede bloquear la conexión HTTP indefinidamente.
const TIMEOUT_MS = 60_000

/** POST crudo a /chat/completions. `body` ya trae model/messages; devuelve el texto del asistente. */
async function llamarOpenRouter(
  body: Record<string, unknown>,
  timeoutMs = TIMEOUT_MS,
  registro?: RegistroLLM,
): Promise<string> {
  if (!iaDisponible()) throw new Error('OPENROUTER_API_KEY no configurada')
  const inicio = Date.now()
  try {
    const { texto, usage } = await enviar(body, timeoutMs)
    registrarLlamada(registro, { usage, duracionMs: Date.now() - inicio, exito: true })
    return texto
  } catch (err) {
    registrarLlamada(registro, { duracionMs: Date.now() - inicio, exito: false, error: (err as Error).message })
    throw err
  }
}

type UsoLLM = {
  prompt_tokens?: number
  completion_tokens?: number
  cost?: number
  prompt_tokens_details?: { cached_tokens?: number }
}

/** Guarda la llamada sin bloquear ni romper la respuesta si la base falla. El mensaje de error no lleva contenido del prompt. */
function registrarLlamada(
  registro: RegistroLLM | undefined,
  r: { usage?: UsoLLM; duracionMs: number; exito: boolean; error?: string },
) {
  if (!registro) return
  db.insert(llmLlamadas)
    .values({
      firmaId: registro.firmaId,
      auditoriaId: registro.auditoriaId,
      proposito: registro.proposito,
      modelo: MODELO,
      tokensEntrada: r.usage?.prompt_tokens ?? 0,
      tokensCache: r.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      tokensSalida: r.usage?.completion_tokens ?? 0,
      costoUsd: r.usage?.cost !== undefined ? String(r.usage.cost) : null,
      duracionMs: r.duracionMs,
      exito: r.exito,
      error: r.error?.slice(0, 300) ?? null,
    })
    .catch((err) => console.error('[llm] no se pudo registrar la llamada:', (err as Error).message))
}

async function enviar(
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<{ texto: string; usage?: UsoLLM }> {
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
      // data_collection: 'deny' → solo proveedores que no retienen ni entrenan con los prompts.
      // No depender únicamente de la configuración de la cuenta de OpenRouter.
      body: JSON.stringify({ provider: { data_collection: POLITICA_DATOS }, usage: { include: true }, ...body }),
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

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: UsoLLM }
  return { texto: data.choices?.[0]?.message?.content ?? '', usage: data.usage }
}

/** Llamada base de chat (solo texto). Devuelve el texto del asistente. */
async function chat(opts: {
  system: string
  messages: MensajeChat[]
  maxTokens?: number
  seudonimos?: Seudonimizador
  registro?: RegistroLLM
}): Promise<string> {
  const sd = opts.seudonimos ?? crearSeudonimizador()
  const messages: ChatMsg[] = [
    { role: 'system', content: sd.aplicar(opts.system) },
    ...opts.messages.map((m) => ({ role: m.role, content: sd.aplicar(m.content) })),
  ]
  return llamarOpenRouter({ model: MODELO, max_tokens: opts.maxTokens ?? 1500, messages }, TIMEOUT_MS, opts.registro)
}

/** Llamada de texto libre. */
export async function completarTexto(opts: {
  system: string
  mensajes: MensajeChat[]
  maxTokens?: number
  /** Identificadores a ocultar (empresa, NIT…); los patrones de texto libre se ocultan siempre. */
  seudonimos?: Seudonimizador
  registro?: RegistroLLM
}): Promise<string> {
  const sd = opts.seudonimos ?? crearSeudonimizador()
  const texto = await chat({
    system: opts.system,
    messages: opts.mensajes,
    maxTokens: opts.maxTokens,
    seudonimos: sd,
    registro: opts.registro,
  })
  return sd.rehidratar(texto).trim()
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
  seudonimos?: Seudonimizador
  registro?: RegistroLLM
}): Promise<T> {
  const sd = opts.seudonimos ?? crearSeudonimizador()
  const inicio = opts.inicioJson ?? '['
  const instruccion =
    inicio === '['
      ? 'Responde ÚNICAMENTE con un arreglo JSON válido, sin texto adicional ni fences de markdown.'
      : 'Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional ni fences de markdown.'

  const texto = await chat({
    system: opts.system,
    messages: [{ role: 'user', content: `${opts.prompt}\n\n${instruccion}` }],
    maxTokens: opts.maxTokens ?? 3000,
    seudonimos: sd,
    registro: opts.registro,
  })

  return JSON.parse(extraerJson(sd.rehidratar(texto, { json: true }), inicio)) as T
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
  seudonimos?: Seudonimizador
  registro?: RegistroLLM
}): Promise<T> {
  const sd = opts.seudonimos ?? crearSeudonimizador()
  const inicio = opts.inicioJson ?? '{'
  const instruccion =
    inicio === '['
      ? 'Responde ÚNICAMENTE con un arreglo JSON válido, sin texto adicional ni fences de markdown.'
      : 'Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional ni fences de markdown.'

  const dataUrl = `data:${opts.archivo.mime};base64,${opts.archivo.base64}`
  const esPdf = opts.archivo.mime === 'application/pdf'
  // El nombre del archivo suele traer el cliente: al modelo solo le llega un nombre neutro.
  const nombreNeutro = esPdf ? 'documento.pdf' : 'documento'
  const parteArchivo = esPdf
    ? { type: 'file', file: { filename: nombreNeutro, file_data: dataUrl } }
    : { type: 'image_url', image_url: { url: dataUrl } }

  const texto = await llamarOpenRouter(
    {
      model: MODELO,
      max_tokens: opts.maxTokens ?? 3000,
      messages: [
        { role: 'system', content: sd.aplicar(opts.system) },
        {
          role: 'user',
          content: [{ type: 'text', text: sd.aplicar(`${opts.prompt}\n\n${instruccion}`) }, parteArchivo],
        },
      ],
      ...(esPdf ? { plugins: [{ id: 'file-parser', pdf: { engine: opts.engine ?? 'pdf-text' } }] } : {}),
    },
    // Parsear/OCRear un PDF grande tarda más que una llamada de solo texto.
    120_000,
    opts.registro,
  )

  try {
    return JSON.parse(extraerJson(sd.rehidratar(texto, { json: true }), inicio)) as T
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

/** Rol base de los prompts de auditoría (ia.ts y la lectura de declaraciones). */
export const SYSTEM_AUDITOR = `Eres un auditor externo colombiano con 20 años de experiencia en firmas de auditoría, experto en Normas Internacionales de Auditoría (NIA), NIIF y normativa colombiana (revisoría fiscal, Ley 43 de 1990, Código de Comercio arts. 207-209, PUC).
Escribes en español profesional, preciso y conciso. Tus respuestas son un apoyo al juicio del auditor, nunca lo reemplazan.`
