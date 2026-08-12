export const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

/** Evento global emitido cuando la sesión expira (401 fuera de /auth). App.tsx lo escucha. */
export const EVENTO_SESION_EXPIRADA = 'api:sesion-expirada'

/** Parsea el cuerpo tolerando respuestas no-JSON (proxy caído, 502 en HTML, etc.). */
async function parsearCuerpo(res: Response): Promise<{ data?: unknown; error?: { message?: string } } | null> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

function manejarNoOk(res: Response, body: { error?: { message?: string } } | null, path: string): never {
  if (res.status === 401 && !path.startsWith('/auth') && !path.startsWith('/superadmin')) {
    window.dispatchEvent(new Event(EVENTO_SESION_EXPIRADA))
    throw new Error('Tu sesión expiró. Inicia sesión de nuevo.')
  }
  throw new Error(body?.error?.message ?? `Error de servidor (${res.status})`)
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  const body = await parsearCuerpo(res)
  if (!res.ok) manejarNoOk(res, body, path)
  if (!body) throw new Error('Respuesta inválida del servidor')

  return body.data as T
}

/** Petición multipart (subida de archivos). No fija Content-Type: lo pone el navegador. */
async function upload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })

  const body = await parsearCuerpo(res)
  if (!res.ok) manejarNoOk(res, body, path)
  if (!body) throw new Error('Respuesta inválida del servidor')

  return body.data as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(data) }),
  put: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(data) }),
  patch: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload,
}
