import type { JwtPayload } from './jwt'

/**
 * Regla de negocio: "solo el socio responsable puede aprobar papeles de
 * trabajo, la materialidad y el dictamen". No basta con tener rol de socio:
 * debe ser EL socio asignado a la auditoría (auditorias.socioId).
 */
export function esSocioResponsable(
  user: Pick<JwtPayload, 'sub' | 'rol'>,
  auditoria: { socioId: string },
): boolean {
  return user.rol === 'socio' && user.sub === auditoria.socioId
}

export const ERROR_NO_SOCIO_RESPONSABLE = {
  code: 'FORBIDDEN',
  message: 'Solo el socio responsable de esta auditoría puede realizar esta acción',
} as const
