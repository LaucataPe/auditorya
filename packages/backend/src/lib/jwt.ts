import jwt from 'jsonwebtoken'

export type JwtPayload = {
  sub: string
  firmaId: string
  rol: 'socio' | 'gerente' | 'senior' | 'asistente' | 'superadmin'
}

const secret = () => {
  const s = process.env.JWT_SECRET
  if (!s) throw new Error('JWT_SECRET no configurado')
  return s
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, secret(), { expiresIn: '7d' })
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, secret()) as JwtPayload
  } catch {
    return null
  }
}
