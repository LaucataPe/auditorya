import { pgTable, text, timestamp, boolean, uuid, jsonb, numeric, integer, uniqueIndex, date } from 'drizzle-orm/pg-core'

export const firmas = pgTable('firmas', {
  id: uuid('id').primaryKey().defaultRandom(),
  nombre: text('nombre').notNull(),
  nit: text('nit').notNull().unique(),
  ciudad: text('ciudad').notNull(),
  // Identidad de marca para los documentos exportados (PDF/Word).
  colorMarca: text('color_marca'), // hex '#rrggbb'; null → color por defecto de la app
  logo: text('logo'), // data URI (image/png|jpeg|webp) ya reducido en el cliente; null → sin logo
  fuenteTitulos: text('fuente_titulos'), // catálogo FUENTES_DOCUMENTO; null → defecto (Arial)
  fuenteCuerpo: text('fuente_cuerpo'), // catálogo FUENTES_DOCUMENTO; null → defecto (Georgia)
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const usuarios = pgTable('usuarios', {
  id: uuid('id').primaryKey().defaultRandom(),
  firmaId: uuid('firma_id').notNull().references(() => firmas.id),
  nombre: text('nombre').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  // `rol` es el nivel base de capacidad (respaldo de seguridad). `rolId` apunta al
  // rol nombrado de la firma, que porta los permisos granulares.
  rol: text('rol', { enum: ['socio', 'gerente', 'senior', 'asistente'] }).notNull(),
  rolId: uuid('rol_id').references(() => rolesFirma.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Roles y permisos por firma. Cada firma puede crear roles con nombre propio; el
// `nivel` mantiene el respaldo de seguridad (socio/gerente/senior/asistente) y
// los permisos granulares viven en `rol_permisos`. Catálogo de claves en
// `@auditorya/types` → `permisos.ts`.
// ─────────────────────────────────────────────────────────────────────────────
export const rolesFirma = pgTable(
  'roles_firma',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    firmaId: uuid('firma_id').notNull().references(() => firmas.id),
    nombre: text('nombre').notNull(),
    nivel: text('nivel', { enum: ['socio', 'gerente', 'senior', 'asistente'] }).notNull(),
    esSistema: boolean('es_sistema').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    firmaNombreUnq: uniqueIndex('roles_firma_firma_nombre_unq').on(t.firmaId, t.nombre),
  }),
)

// Catálogo global de permisos — administrado por el superadmin. Se siembra desde
// `@auditorya/types` → `permisos.ts`. Un permiso solo tiene efecto real si además
// existe un gate en el backend que lo verifique.
export const permisos = pgTable('permisos', {
  clave: text('clave').primaryKey(),
  grupo: text('grupo').notNull(),
  label: text('label').notNull(),
  descripcion: text('descripcion').default('').notNull(),
  activo: boolean('activo').default(true).notNull(),
  orden: integer('orden').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const rolPermisos = pgTable(
  'rol_permisos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rolId: uuid('rol_id').notNull().references(() => rolesFirma.id, { onDelete: 'cascade' }),
    permiso: text('permiso').notNull().references(() => permisos.clave, { onDelete: 'cascade' }),
  },
  (t) => ({
    rolPermisoUnq: uniqueIndex('rol_permisos_rol_permiso_unq').on(t.rolId, t.permiso),
  }),
)

// Ciclos/áreas propios de la firma. Complementan el catálogo base (AREAS_BASE en
// @auditorya/types): la `clave` convive con las claves base en las columnas `area`.
export const areasFirma = pgTable(
  'areas_firma',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    firmaId: uuid('firma_id').notNull().references(() => firmas.id),
    clave: text('clave').notNull(),
    nombre: text('nombre').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    firmaClaveUnq: uniqueIndex('areas_firma_firma_clave_unq').on(t.firmaId, t.clave),
  }),
)

export const empresas = pgTable('empresas', {
  id: uuid('id').primaryKey().defaultRandom(),
  firmaId: uuid('firma_id').notNull().references(() => firmas.id),
  nombre: text('nombre').notNull(),
  // Único por firma (índice empresas_firma_nit_unq), no global: dos firmas pueden
  // tener al mismo cliente sin filtrarse mutuamente la cartera.
  nit: text('nit').notNull(),
  sector: text('sector').notNull(),
  // Entendimiento del cliente — identidad (NIA 315)
  ciiu: text('ciiu'),
  actividadEconomica: text('actividad_economica'),
  ciudad: text('ciudad'),
  // Archivo permanente — conocimiento estable del negocio (capa global)
  modeloNegocio: text('modelo_negocio'),
  estructura: text('estructura'),
  personasClave: text('personas_clave'),
  entornoRegulatorio: text('entorno_regulatorio'),
  sistemaContable: text('sistema_contable'),
  marcoContable: text('marco_contable', { enum: ['NIIF', 'NIIF_PYMES', 'PCGA'] }).notNull(),
  estadoEncargo: text('estado_encargo', { enum: ['pendiente', 'aceptado', 'rechazado'] })
    .default('pendiente')
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
},
(t) => ({
  firmaNitUnq: uniqueIndex('empresas_firma_nit_unq').on(t.firmaId, t.nit),
}))

// ─────────────────────────────────────────────────────────────────────────────
// Documentos legales del cliente (RUT, Cámara de Comercio, etc.) — archivo
// permanente a nivel de empresa (no por encargo). Catálogo fijo por 'tipo';
// los tipos del catálogo se reemplazan al resubir, 'otro' admite varios.
// ─────────────────────────────────────────────────────────────────────────────
export const documentosEmpresa = pgTable('documentos_empresa', {
  id: uuid('id').primaryKey().defaultRandom(),
  empresaId: uuid('empresa_id')
    .notNull()
    .references(() => empresas.id),
  tipo: text('tipo', {
    enum: [
      'rut',
      'camara_comercio',
      'cedula_representante_legal',
      'estados_financieros_anteriores',
      'composicion_accionaria',
      'estatutos',
      'declaracion_renta',
      'otro',
    ],
  }).notNull(),
  nombre: text('nombre'), // solo para tipo 'otro': descripción libre del documento
  archivoKey: text('archivo_key').notNull(),
  archivoNombre: text('archivo_nombre').notNull(),
  archivoMime: text('archivo_mime').notNull(),
  archivoTamano: integer('archivo_tamano').notNull(),
  archivoHash: text('archivo_hash').notNull(),
  subidoPor: uuid('subido_por')
    .notNull()
    .references(() => usuarios.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const auditorias = pgTable('auditorias', {
  id: uuid('id').primaryKey().defaultRandom(),
  empresaId: uuid('empresa_id').notNull().references(() => empresas.id),
  socioId: uuid('socio_id').notNull().references(() => usuarios.id),
  fechaInicio: date('fecha_inicio').notNull(),
  fechaFin: date('fecha_fin').notNull(),
  tipoServicio: text('tipo_servicio', {
    enum: ['revisoria_fiscal', 'auditoria_interna'],
  })
    .default('revisoria_fiscal')
    .notNull(),
  tipo: text('tipo', { enum: ['financiera', 'integral', 'especial'] }),
  estado: text('estado', {
    enum: ['planificacion', 'ejecucion', 'revision', 'finalizada'],
  })
    .default('planificacion')
    .notNull(),
  materialidadAprobada: boolean('materialidad_aprobada').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Balance de prueba comparativo (insumo de los procedimientos analíticos, NIA 315/520).
// Una fila por cuenta. Se reemplaza por completo al reimportar.
// ─────────────────────────────────────────────────────────────────────────────
export const cuentasBalance = pgTable('cuentas_balance', {
  id: uuid('id').primaryKey().defaultRandom(),
  auditoriaId: uuid('auditoria_id')
    .notNull()
    .references(() => auditorias.id),
  codigo: text('codigo').notNull(),
  nombre: text('nombre'),
  clase: text('clase'),
  nivel: integer('nivel').default(0).notNull(),
  // Detalle por tercero (NIT) en cuentas auxiliares; null en cuentas de resumen.
  tercero: text('tercero'),
  terceroNombre: text('tercero_nombre'),
  saldoActual: numeric('saldo_actual', { precision: 20, scale: 2 }).notNull(),
  // Saldo al inicio del período que cubre el balance (no es el comparativo anual).
  saldoInicial: numeric('saldo_inicial', { precision: 20, scale: 2 }).default('0').notNull(),
  debito: numeric('debito', { precision: 20, scale: 2 }),
  credito: numeric('credito', { precision: 20, scale: 2 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Archivo original del balance, conservado como evidencia inmutable del soporte entregado.
export const balanceArchivos = pgTable('balance_archivos', {
  id: uuid('id').primaryKey().defaultRandom(),
  auditoriaId: uuid('auditoria_id')
    .notNull()
    .references(() => auditorias.id)
    .unique(),
  nombre: text('nombre').notNull(),
  tamano: integer('tamano').notNull(),
  hash: text('hash').notNull(),
  contenido: text('contenido').notNull(), // base64
  subidoPor: uuid('subido_por')
    .notNull()
    .references(() => usuarios.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Balance comparativo: saldos al mismo corte del año anterior, cruzados por
// código PUC. Solo nivel resumen (sin terceros). Se reemplaza al reimportar.
export const cuentasBalanceComparativo = pgTable('cuentas_balance_comparativo', {
  id: uuid('id').primaryKey().defaultRandom(),
  auditoriaId: uuid('auditoria_id')
    .notNull()
    .references(() => auditorias.id),
  codigo: text('codigo').notNull(),
  nombre: text('nombre'),
  nivel: integer('nivel').default(0).notNull(),
  saldo: numeric('saldo', { precision: 20, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Metadatos del balance del encargo: período que cubre y estado del comparativo.
export const balanceMeta = pgTable('balance_meta', {
  id: uuid('id').primaryKey().defaultRandom(),
  auditoriaId: uuid('auditoria_id')
    .notNull()
    .references(() => auditorias.id)
    .unique(),
  corteDesde: date('corte_desde'),
  corteHasta: date('corte_hasta'),
  comparativoNombre: text('comparativo_nombre'),
  comparativoCreatedAt: timestamp('comparativo_created_at'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Perfil de importación del balance por empresa: el mapeo columna → campo que
// el usuario confirmó, para re-aplicarlo en la siguiente importación.
export const perfilesBalance = pgTable('perfiles_balance', {
  id: uuid('id').primaryKey().defaultRandom(),
  empresaId: uuid('empresa_id')
    .notNull()
    .references(() => empresas.id)
    .unique(),
  mapeo: jsonb('mapeo').$type<(string | null)[]>().notNull(),
  encabezados: jsonb('encabezados').$type<(string | null)[] | null>(),
  actualizadoPor: uuid('actualizado_por')
    .notNull()
    .references(() => usuarios.id),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Entendimiento del período (NIA 315) — capa por encargo.
// Refresca/actualiza el entendimiento del negocio para esta auditoría. Una por auditoría.
// ─────────────────────────────────────────────────────────────────────────────
export const entendimientoPeriodo = pgTable('entendimiento_periodo', {
  id: uuid('id').primaryKey().defaultRandom(),
  auditoriaId: uuid('auditoria_id')
    .notNull()
    .references(() => auditorias.id)
    .unique(),
  cambiosSignificativos: text('cambios_significativos'),
  eventosSignificativos: text('eventos_significativos'),
  notas: text('notas'),
  sinCambios: boolean('sin_cambios').default(false).notNull(),
  confirmado: boolean('confirmado').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Fase 2 — Evaluación de aceptación del encargo (NIA 200 / NICC 1 - ISQM 1)
// Deja traza de la independencia evaluada antes de aceptar el cliente.
// ─────────────────────────────────────────────────────────────────────────────
export const evaluacionesAceptacion = pgTable('evaluaciones_aceptacion', {
  id: uuid('id').primaryKey().defaultRandom(),
  empresaId: uuid('empresa_id')
    .notNull()
    .references(() => empresas.id),
  // { [preguntaId]: 'si' | 'no' }
  respuestas: jsonb('respuestas').$type<Record<string, 'si' | 'no'>>().notNull(),
  hayAmenazas: boolean('hay_amenazas').default(false).notNull(),
  decision: text('decision', { enum: ['aceptado', 'rechazado'] }).notNull(),
  evaluadoPor: uuid('evaluado_por')
    .notNull()
    .references(() => usuarios.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Fase 3 — Materialidad (NIA 320). Una por auditoría.
// materialidad = montoBase * (porcentaje / 100)
// materialidadDesempeno = materialidad * (porcentajeDesempeno / 100)
// ─────────────────────────────────────────────────────────────────────────────
export const materialidades = pgTable('materialidades', {
  id: uuid('id').primaryKey().defaultRandom(),
  auditoriaId: uuid('auditoria_id')
    .notNull()
    .references(() => auditorias.id)
    .unique(),
  baseCalculo: text('base_calculo', {
    enum: ['activos', 'ingresos', 'utilidad_antes_impuestos', 'patrimonio'],
  }).notNull(),
  montoBase: numeric('monto_base', { precision: 18, scale: 2 }).notNull(),
  porcentaje: numeric('porcentaje', { precision: 5, scale: 2 }).notNull(),
  materialidad: numeric('materialidad', { precision: 18, scale: 2 }).notNull(),
  porcentajeDesempeno: numeric('porcentaje_desempeno', { precision: 5, scale: 2 }).notNull(),
  materialidadDesempeno: numeric('materialidad_desempeno', { precision: 18, scale: 2 }).notNull(),
  justificacion: text('justificacion'),
  aprobada: boolean('aprobada').default(false).notNull(),
  aprobadaPor: uuid('aprobada_por').references(() => usuarios.id),
  aprobadaAt: timestamp('aprobada_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Fase 3 — Riesgos por área / ciclo (NIA 315).
// riesgoCombinado se calcula a partir de inherente + control.
// ─────────────────────────────────────────────────────────────────────────────
export const riesgos = pgTable('riesgos', {
  id: uuid('id').primaryKey().defaultRandom(),
  auditoriaId: uuid('auditoria_id')
    .notNull()
    .references(() => auditorias.id),
  // Clave del catálogo base (AREAS_BASE) o de un ciclo propio de la firma (areas_firma).
  area: text('area').notNull(),
  descripcion: text('descripcion').notNull(),
  riesgoInherente: text('riesgo_inherente', { enum: ['bajo', 'medio', 'alto'] }).notNull(),
  riesgoControl: text('riesgo_control', { enum: ['bajo', 'medio', 'alto'] }).notNull(),
  riesgoCombinado: text('riesgo_combinado', { enum: ['bajo', 'medio', 'alto'] }).notNull(),
  respuestaPlaneada: text('respuesta_planeada'),
  origen: text('origen', { enum: ['manual', 'sugerido', 'analitico'] }).default('manual').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Fase 4 — Papeles de trabajo (NIA 230). Uno por área/procedimiento.
// Solo el socio responsable puede aprobarlos.
// ─────────────────────────────────────────────────────────────────────────────
export const papelesTrabajo = pgTable('papeles_trabajo', {
  id: uuid('id').primaryKey().defaultRandom(),
  auditoriaId: uuid('auditoria_id')
    .notNull()
    .references(() => auditorias.id),
  // Clave del catálogo base (AREAS_BASE) o de un ciclo propio de la firma (areas_firma).
  area: text('area').notNull(),
  titulo: text('titulo').notNull(),
  // Riesgo (NIA 315) que este papel atiende, si aplica.
  riesgoId: uuid('riesgo_id').references(() => riesgos.id),
  procedimiento: text('procedimiento'),
  alcance: text('alcance'),
  hallazgos: text('hallazgos'),
  conclusion: text('conclusion'),
  // Checklist ejecutable de los pasos del programa (guía NIA 330/500).
  // Clave = índice del paso en el catálogo; valor = si está hecho y una nota.
  pasosEstado: jsonb('pasos_estado')
    .$type<Record<string, { hecho: boolean; nota: string | null }>>()
    .default({})
    .notNull(),
  estado: text('estado', { enum: ['borrador', 'en_revision', 'aprobado'] })
    .default('borrador')
    .notNull(),
  // Cronograma (NIA 300 — oportunidad): fechas planeadas y responsable de la prueba.
  fechaInicio: timestamp('fecha_inicio'),
  fechaFin: timestamp('fecha_fin'),
  asignadoA: uuid('asignado_a').references(() => usuarios.id),
  preparadoPor: uuid('preparado_por')
    .notNull()
    .references(() => usuarios.id),
  aprobadoPor: uuid('aprobado_por').references(() => usuarios.id),
  aprobadoAt: timestamp('aprobado_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Evidencia ligada a un papel de trabajo. Puede llevar archivo adjunto
// (guardado vía lib/storage, servido con URL firmada de corta duración).
export const evidencias = pgTable('evidencias', {
  id: uuid('id').primaryKey().defaultRandom(),
  papelTrabajoId: uuid('papel_trabajo_id')
    .notNull()
    .references(() => papelesTrabajo.id),
  nombre: text('nombre').notNull(),
  descripcion: text('descripcion'),
  tipo: text('tipo', {
    enum: ['documento', 'confirmacion', 'conciliacion', 'calculo', 'foto', 'otro'],
  })
    .default('documento')
    .notNull(),
  enlaceExterno: text('enlace_externo'),
  // Archivo adjunto (opcional)
  archivoKey: text('archivo_key'),
  archivoNombre: text('archivo_nombre'),
  archivoMime: text('archivo_mime'),
  archivoTamano: integer('archivo_tamano'),
  archivoHash: text('archivo_hash'),
  subidoPor: uuid('subido_por').references(() => usuarios.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Fase 4 — Evaluación de control interno (COSO, 5 componentes). Una fila por
// componente por auditoría.
// ─────────────────────────────────────────────────────────────────────────────
export const controlesCoso = pgTable(
  'controles_coso',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    auditoriaId: uuid('auditoria_id')
      .notNull()
      .references(() => auditorias.id),
    componente: text('componente', {
      enum: [
        'ambiente_control',
        'evaluacion_riesgos',
        'actividades_control',
        'informacion_comunicacion',
        'supervision',
      ],
    }).notNull(),
    calificacion: text('calificacion', {
      enum: ['efectivo', 'con_deficiencias', 'deficiente'],
    }).notNull(),
    observaciones: text('observaciones'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    componenteUnico: uniqueIndex('controles_coso_auditoria_componente_uq').on(
      t.auditoriaId,
      t.componente,
    ),
  }),
)

// ─────────────────────────────────────────────────────────────────────────────
// Fase 4 — Tareas asignadas al equipo por área/ciclo.
// ─────────────────────────────────────────────────────────────────────────────
export const tareas = pgTable('tareas', {
  id: uuid('id').primaryKey().defaultRandom(),
  auditoriaId: uuid('auditoria_id')
    .notNull()
    .references(() => auditorias.id),
  // Clave del catálogo base (AREAS_BASE) o de un ciclo propio de la firma (areas_firma).
  area: text('area').notNull(),
  titulo: text('titulo').notNull(),
  descripcion: text('descripcion'),
  // Riesgo (NIA 315) que esta tarea atiende, si aplica.
  riesgoId: uuid('riesgo_id').references(() => riesgos.id),
  // Papel de trabajo al que pertenece (un papel puede tener varias tareas). Null = tarea suelta.
  papelTrabajoId: uuid('papel_trabajo_id').references(() => papelesTrabajo.id),
  asignadoA: uuid('asignado_a')
    .notNull()
    .references(() => usuarios.id),
  estado: text('estado', { enum: ['pendiente', 'en_progreso', 'completada'] })
    .default('pendiente')
    .notNull(),
  // Cronograma: fecha de inicio planeada (la fecha fin es `vencimiento`).
  fechaInicio: timestamp('fecha_inicio'),
  vencimiento: timestamp('vencimiento'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Fase 5 — Informes: dictamen (NIA 700), carta de control interno (NIA 265),
// carta de representaciones (NIA 580). Uno de cada tipo por auditoría.
// El contenido se guarda como secciones (clave → texto). Solo el socio aprueba.
// ─────────────────────────────────────────────────────────────────────────────
export const informes = pgTable(
  'informes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    auditoriaId: uuid('auditoria_id')
      .notNull()
      .references(() => auditorias.id),
    tipo: text('tipo', {
      enum: ['dictamen', 'carta_control_interno', 'carta_representaciones', 'informe_ai', 'memo_planeacion', 'carta_encargo'],
    }).notNull(),
    tipoOpinion: text('tipo_opinion', {
      enum: ['limpia', 'con_salvedades', 'negativa', 'abstencion'],
    }),
    contenido: jsonb('contenido').$type<Record<string, string>>().default({}).notNull(),
    estado: text('estado', { enum: ['borrador', 'aprobado'] }).default('borrador').notNull(),
    aprobadoPor: uuid('aprobado_por').references(() => usuarios.id),
    aprobadoAt: timestamp('aprobado_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    tipoUnico: uniqueIndex('informes_auditoria_tipo_uq').on(t.auditoriaId, t.tipo),
  }),
)

// ─────────────────────────────────────────────────────────────────────────────
// Pista de auditoría (audit trail). Registro inmutable de acciones relevantes:
// quién hizo qué, sobre qué entidad y cuándo. Nunca se actualiza ni borra.
// ─────────────────────────────────────────────────────────────────────────────
export const eventos = pgTable('eventos', {
  id: uuid('id').primaryKey().defaultRandom(),
  firmaId: uuid('firma_id').notNull().references(() => firmas.id),
  usuarioId: uuid('usuario_id').notNull().references(() => usuarios.id),
  // Sin FK a propósito: la pista debe sobrevivir al borrado del encargo (referencia histórica).
  auditoriaId: uuid('auditoria_id'),
  empresaId: uuid('empresa_id').references(() => empresas.id),
  accion: text('accion').notNull(), // p. ej. 'papel.aprobar', 'materialidad.aprobar'
  entidad: text('entidad').notNull(), // 'papel_trabajo', 'informe', 'materialidad', ...
  entidadId: uuid('entidad_id'),
  detalle: jsonb('detalle').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot inmutable del papel de trabajo en el momento de su aprobación (NIA 230).
// `contenido` congela el papel completo y la metadata de su evidencia; reabrir y
// editar el papel no toca los snapshots ya tomados.
// ─────────────────────────────────────────────────────────────────────────────
export const papelesSnapshots = pgTable('papeles_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  papelTrabajoId: uuid('papel_trabajo_id')
    .notNull()
    .references(() => papelesTrabajo.id),
  auditoriaId: uuid('auditoria_id')
    .notNull()
    .references(() => auditorias.id),
  contenido: jsonb('contenido').$type<Record<string, unknown>>().notNull(),
  aprobadoPor: uuid('aprobado_por')
    .notNull()
    .references(() => usuarios.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Auditoría Interna (IIA IPPF 2024)
// ─────────────────────────────────────────────────────────────────────────────

export const programasAI = pgTable('programas_ai', {
  id: uuid('id').primaryKey().defaultRandom(),
  auditoriaId: uuid('auditoria_id').notNull().references(() => auditorias.id),
  area: text('area').notNull(),
  objetivo: text('objetivo'),
  alcance: text('alcance'),
  estado: text('estado', { enum: ['no_iniciado', 'en_progreso', 'completado'] })
    .default('no_iniciado')
    .notNull(),
  asignadoA: uuid('asignado_a').references(() => usuarios.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const hallazgosAI = pgTable('hallazgos_ai', {
  id: uuid('id').primaryKey().defaultRandom(),
  auditoriaId: uuid('auditoria_id').notNull().references(() => auditorias.id),
  programaId: uuid('programa_id').references(() => programasAI.id),
  titulo: text('titulo').notNull(),
  condicion: text('condicion').notNull(),
  criterio: text('criterio').notNull(),
  causa: text('causa').notNull(),
  efecto: text('efecto').notNull(),
  nivelRiesgo: text('nivel_riesgo', { enum: ['alto', 'medio', 'bajo'] }).notNull(),
  recomendacion: text('recomendacion').notNull(),
  respuestaAdministracion: text('respuesta_administracion'),
  responsableGestion: text('responsable_gestion'),
  fechaCompromiso: timestamp('fecha_compromiso'),
  estadoSeguimiento: text('estado_seguimiento', {
    enum: ['pendiente', 'en_proceso', 'implementado', 'aceptado_riesgo'],
  })
    .default('pendiente')
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ─────────────────────────────────────────────────────────────────────────────
// PBC (Prepared By Client) — documentos solicitados al cliente para ejecutar una
// prueba/papel de trabajo. Cierra el hilo riesgo → prueba → documento → evidencia.
// ─────────────────────────────────────────────────────────────────────────────
export const solicitudesPbc = pgTable('solicitudes_pbc', {
  id: uuid('id').primaryKey().defaultRandom(),
  auditoriaId: uuid('auditoria_id')
    .notNull()
    .references(() => auditorias.id),
  papelTrabajoId: uuid('papel_trabajo_id').references(() => papelesTrabajo.id),
  descripcion: text('descripcion').notNull(),
  estado: text('estado', { enum: ['solicitado', 'recibido', 'no_aplica'] })
    .default('solicitado')
    .notNull(),
  evidenciaId: uuid('evidencia_id').references(() => evidencias.id),
  notas: text('notas'),
  fechaLimite: timestamp('fecha_limite'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Notas de revisión (NIA 220 — supervisión/revisión). El revisor deja observaciones
// sobre un papel de trabajo; el preparador las resuelve. Quedan como traza del control de calidad.
// ─────────────────────────────────────────────────────────────────────────────
export const notasRevision = pgTable('notas_revision', {
  id: uuid('id').primaryKey().defaultRandom(),
  auditoriaId: uuid('auditoria_id')
    .notNull()
    .references(() => auditorias.id),
  papelTrabajoId: uuid('papel_trabajo_id')
    .notNull()
    .references(() => papelesTrabajo.id),
  texto: text('texto').notNull(),
  estado: text('estado', { enum: ['abierta', 'resuelta'] }).default('abierta').notNull(),
  respuesta: text('respuesta'),
  creadoPor: uuid('creado_por')
    .notNull()
    .references(() => usuarios.id),
  resueltoPor: uuid('resuelto_por').references(() => usuarios.id),
  resueltoAt: timestamp('resuelto_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Cierre del encargo (NIA 560 hechos posteriores, NIA 570 negocio en marcha, NIA 220
// revisión de calidad). Una fila por auditoría. Solo el socio cierra.
// ─────────────────────────────────────────────────────────────────────────────
export const cierresAuditoria = pgTable('cierres_auditoria', {
  id: uuid('id').primaryKey().defaultRandom(),
  auditoriaId: uuid('auditoria_id')
    .notNull()
    .references(() => auditorias.id)
    .unique(),
  hechosPosteriores: text('hechos_posteriores'),
  hechosPosterioresEvaluado: boolean('hechos_posteriores_evaluado').default(false).notNull(),
  negocioMarcha: text('negocio_marcha'),
  negocioMarchaEvaluado: boolean('negocio_marcha_evaluado').default(false).notNull(),
  revisionCalidad: text('revision_calidad'),
  revisionCalidadCompleta: boolean('revision_calidad_completa').default(false).notNull(),
  cerrado: boolean('cerrado').default(false).notNull(),
  cerradoPor: uuid('cerrado_por').references(() => usuarios.id),
  cerradoAt: timestamp('cerrado_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Muestreo de auditoría (NIA 530). Una muestra por papel de trabajo: define la
// población (cuenta por tercero), el método y el % de cobertura objetivo. Cada
// ítem es un tercero seleccionado, con su resultado de la prueba (que alimenta
// la futura hoja de ajustes).
// ─────────────────────────────────────────────────────────────────────────────
export const muestras = pgTable('muestras', {
  id: uuid('id').primaryKey().defaultRandom(),
  papelTrabajoId: uuid('papel_trabajo_id')
    .notNull()
    .references(() => papelesTrabajo.id)
    .unique(),
  auditoriaId: uuid('auditoria_id')
    .notNull()
    .references(() => auditorias.id),
  codigoCuenta: text('codigo_cuenta').notNull(),
  metodo: text('metodo', { enum: ['cobertura'] }).default('cobertura').notNull(),
  coberturaObjetivo: numeric('cobertura_objetivo', { precision: 4, scale: 2 }).default('0.80').notNull(),
  materialidad: numeric('materialidad', { precision: 20, scale: 2 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Hallazgos (revisoría fiscal) — comunicación y seguimiento (NIA 260/265).
// Nacen en un papel, se comunican al contador y se corrigen o no. Lo no corregido
// se escala a la hoja de ajustes (incorrección) o a la carta de control interno.
// ─────────────────────────────────────────────────────────────────────────────
export const hallazgos = pgTable('hallazgos', {
  id: uuid('id').primaryKey().defaultRandom(),
  auditoriaId: uuid('auditoria_id')
    .notNull()
    .references(() => auditorias.id),
  papelTrabajoId: uuid('papel_trabajo_id').references(() => papelesTrabajo.id),
  // Clave del catálogo base (AREAS_BASE) o de un ciclo propio de la firma (areas_firma).
  area: text('area').notNull(),
  cuentaCodigo: text('cuenta_codigo'),
  // `descripcion` es la condición (situación encontrada). Los tres campos siguientes
  // completan la estructura del hallazgo (condición/criterio/causa/efecto + recomendación).
  // Opcionales: la captura rápida solo exige la condición.
  descripcion: text('descripcion').notNull(),
  criterio: text('criterio'),
  causa: text('causa'),
  efecto: text('efecto'),
  recomendacion: text('recomendacion'),
  monto: numeric('monto', { precision: 20, scale: 2 }),
  tipo: text('tipo', { enum: ['incorreccion', 'deficiencia'] }).default('incorreccion').notNull(),
  severidad: text('severidad', { enum: ['alta', 'media', 'baja'] }).default('media').notNull(),
  estado: text('estado', { enum: ['abierto', 'comunicado', 'corregido', 'no_corregido'] })
    .default('abierto')
    .notNull(),
  ajusteId: uuid('ajuste_id').references(() => ajustes.id),
  comunicadoAt: timestamp('comunicado_at'),
  corregidoAt: timestamp('corregido_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Hoja de ajustes / sumario de incorrecciones (NIA 450). Acumula los errores
// encontrados; su total no corregido vs. la materialidad sugiere la opinión.
// ─────────────────────────────────────────────────────────────────────────────
export const ajustes = pgTable('ajustes', {
  id: uuid('id').primaryKey().defaultRandom(),
  auditoriaId: uuid('auditoria_id')
    .notNull()
    .references(() => auditorias.id),
  descripcion: text('descripcion').notNull(),
  cuentaCodigo: text('cuenta_codigo'),
  monto: numeric('monto', { precision: 20, scale: 2 }).notNull(),
  tipo: text('tipo', { enum: ['factual', 'juicio', 'proyectado'] }).default('factual').notNull(),
  efecto: text('efecto', { enum: ['resultado', 'patrimonio', 'reclasificacion'] }).default('resultado').notNull(),
  corregido: boolean('corregido').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const muestraItems = pgTable('muestra_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  muestraId: uuid('muestra_id')
    .notNull()
    .references(() => muestras.id, { onDelete: 'cascade' }),
  cuentaCodigo: text('cuenta_codigo'),
  tercero: text('tercero'),
  terceroNombre: text('tercero_nombre'),
  saldo: numeric('saldo', { precision: 20, scale: 2 }).notNull(),
  esClave: boolean('es_clave').default(false).notNull(),
  incluido: boolean('incluido').default(true).notNull(),
  resultado: text('resultado', { enum: ['pendiente', 'sin_diferencia', 'con_diferencia'] })
    .default('pendiente')
    .notNull(),
  diferencia: numeric('diferencia', { precision: 20, scale: 2 }),
  nota: text('nota'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
