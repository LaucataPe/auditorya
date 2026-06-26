export type Rol = 'socio' | 'gerente' | 'senior' | 'asistente'

export type Usuario = {
  id: string
  firmaId: string
  nombre: string
  email: string
  rol: Rol
  createdAt: string
}
