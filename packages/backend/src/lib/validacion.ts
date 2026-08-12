/**
 * Wrapper de zValidator que hace cumplir el contrato de error de la API:
 * los 400 de validación responden { error: { code, message, campo? } } en vez
 * del ZodError serializado que devuelve @hono/zod-validator por defecto.
 * Todas las rutas deben importar zValidator desde aquí.
 */
import { zValidator as zvBase } from '@hono/zod-validator'
import type { ValidationTargets } from 'hono'
import type { ZodSchema } from 'zod'

export function zValidator<T extends ZodSchema, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) {
  return zvBase(target, schema, (result, c) => {
    if (!result.success) {
      const issue = result.error.issues[0]
      const campo = issue?.path?.length ? issue.path.join('.') : null
      return c.json(
        {
          error: {
            code: 'VALIDACION',
            message: issue?.message ?? 'Datos inválidos',
            ...(campo ? { campo } : {}),
          },
        },
        400,
      )
    }
  })
}
