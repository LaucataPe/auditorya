import type { Rol } from './usuario'

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo de permisos granulares — FUENTE DE VERDAD.
//
// Cada permiso corresponde a un gate real del backend. Las firmas no inventan
// permisos: solo eligen cuáles de estos asignan a cada rol que creen. El `nivel`
// de un rol (socio/gerente/senior/asistente) es el respaldo de seguridad; los
// permisos afinan qué puede hacer dentro de ese nivel.
//
// Nota sobre aprobaciones: los permisos `*.aprobar` y `encargo.cerrar` habilitan
// a *quién puede* aprobar/cerrar, pero el backend además exige que el usuario sea
// el socio responsable asignado a ese encargo (`auditorias.socioId`).
// ─────────────────────────────────────────────────────────────────────────────

export const PERMISOS = [
  // Administración de la firma
  { clave: 'firma.editar', grupo: 'Firma', label: 'Editar la firma', descripcion: 'Modificar razón social, NIT y ciudad de la firma.' },
  { clave: 'equipo.gestionar', grupo: 'Firma', label: 'Gestionar el equipo', descripcion: 'Crear, editar y eliminar miembros del equipo.' },
  { clave: 'roles.gestionar', grupo: 'Firma', label: 'Gestionar roles', descripcion: 'Crear roles y asignar permisos.' },

  // Clientes
  { clave: 'empresa.crear', grupo: 'Clientes', label: 'Registrar clientes', descripcion: 'Crear nuevas empresas cliente.' },
  { clave: 'empresa.editar', grupo: 'Clientes', label: 'Editar clientes', descripcion: 'Modificar la información de los clientes.' },
  { clave: 'empresa.evaluar', grupo: 'Clientes', label: 'Evaluar aceptación', descripcion: 'Realizar la evaluación de aceptación del encargo.' },

  // Encargos — trabajo
  { clave: 'encargo.crear', grupo: 'Encargos', label: 'Crear encargos', descripcion: 'Iniciar nuevos encargos de auditoría.' },
  { clave: 'encargo.planificar', grupo: 'Encargos', label: 'Planificar', descripcion: 'Materialidad, riesgos, control interno y papeles de planeación.' },
  { clave: 'encargo.ejecutar', grupo: 'Encargos', label: 'Ejecutar', descripcion: 'Pruebas, papeles de trabajo, PBC y evidencia.' },

  // Aprobaciones y cierre — reservado al socio responsable del encargo
  { clave: 'materialidad.aprobar', grupo: 'Aprobaciones', label: 'Aprobar materialidad', descripcion: 'Aprobar la materialidad y habilitar la ejecución.' },
  { clave: 'papel.aprobar', grupo: 'Aprobaciones', label: 'Aprobar papeles', descripcion: 'Aprobar y reabrir papeles de trabajo.' },
  { clave: 'informe.aprobar', grupo: 'Aprobaciones', label: 'Aprobar informes', descripcion: 'Aprobar y reabrir informes y el dictamen.' },
  { clave: 'encargo.cerrar', grupo: 'Aprobaciones', label: 'Cerrar el encargo', descripcion: 'Cerrar y reabrir el encargo de auditoría.' },
] as const

export type Permiso = (typeof PERMISOS)[number]['clave']

export const TODOS_LOS_PERMISOS: Permiso[] = PERMISOS.map((p) => p.clave)

// Grupos en orden de presentación, para render en la UI de gestión de roles.
export const GRUPOS_PERMISOS = ['Firma', 'Clientes', 'Encargos', 'Aprobaciones'] as const
export type GrupoPermiso = (typeof GRUPOS_PERMISOS)[number]

// ─────────────────────────────────────────────────────────────────────────────
// Roles de sistema — se siembran para cada firma nueva. `esSistema: true` impide
// eliminarlos; la firma sí puede ajustar sus permisos o crear roles propios.
// La matriz por defecto preserva el comportamiento actual del backend.
// ─────────────────────────────────────────────────────────────────────────────

export type Nivel = Rol

export const NIVELES: Nivel[] = ['socio', 'gerente', 'senior', 'asistente']

export const NIVEL_LABEL: Record<Nivel, string> = {
  socio: 'Socio',
  gerente: 'Gerente',
  senior: 'Senior',
  asistente: 'Asistente',
}

export const PERMISOS_POR_NIVEL: Record<Nivel, Permiso[]> = {
  socio: TODOS_LOS_PERMISOS,
  gerente: [
    'equipo.gestionar',
    'empresa.crear', 'empresa.editar', 'empresa.evaluar',
    'encargo.crear', 'encargo.planificar', 'encargo.ejecutar',
  ],
  senior: [
    'empresa.crear', 'empresa.editar', 'empresa.evaluar',
    'encargo.crear', 'encargo.planificar', 'encargo.ejecutar',
  ],
  asistente: [
    'encargo.planificar', 'encargo.ejecutar',
  ],
}

// Rol de sistema base por nivel (nombre visible + permisos por defecto).
export const ROLES_SISTEMA: { nombre: string; nivel: Nivel; permisos: Permiso[] }[] =
  NIVELES.map((nivel) => ({
    nombre: NIVEL_LABEL[nivel],
    nivel,
    permisos: PERMISOS_POR_NIVEL[nivel],
  }))
