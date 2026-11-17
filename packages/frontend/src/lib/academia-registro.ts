/**
 * Envío del registro de acceso a AuditorYa Academia al workflow de n8n (`VITE_N8N_ACADEMIA_URL`).
 *
 * Va como formulario (application/x-www-form-urlencoded): es una petición «simple», sin consulta
 * previa de CORS. Solo se da por enviado si n8n responde 2xx; para leer esa respuesta el webhook
 * debe permitir el origen del curso (Webhook › Options › Allowed Origins). Si no la permite, el
 * registro queda pendiente y se reintenta en cada visita: n8n debe ignorar correos repetidos.
 * n8n recibe los campos planos en `body`.
 */
import type { RegistroAcademia } from '../store/academia.store'

const URL_WEBHOOK = import.meta.env.VITE_N8N_ACADEMIA_URL as string | undefined

export const envioRegistroConfigurado = !!URL_WEBHOOK

export async function enviarRegistroAcademia(registro: RegistroAcademia): Promise<boolean> {
  if (!URL_WEBHOOK) return false
  const campos = new URLSearchParams({
    tipo: 'registro',
    correo: registro.correo,
    rol: registro.rol,
    autorizacion_version: registro.autorizacion.version,
    autorizacion_fecha: registro.autorizacion.fecha,
    autorizacion_texto: registro.autorizacion.texto,
    pagina: window.location.pathname,
    referente: document.referrer,
    enviado_en: new Date().toISOString(),
  })
  try {
    const res = await fetch(URL_WEBHOOK, { method: 'POST', body: campos })
    return res.ok
  } catch {
    // Sin red, webhook caído o sin CORS: el registro queda pendiente y se reintenta en la próxima visita.
    return false
  }
}
