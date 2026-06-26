import { pgTable, text, timestamp, boolean, uuid, jsonb, numeric, uniqueIndex } from 'drizzle-orm/pg-core'

export const firmas = pgTable('firmas', {
  id: uuid('id').primaryKey().defaultRandom(),
  nombre: text('nombre').notNull(),
  nit: text('nit').notNull().unique(),
  ciudad: text('ciudad').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const usuarios = pgTable('usuarios', {
  id: uuid('id').primaryKey().defaultRandom(),
  firmaId: uuid('firma_id').notNull().references(() => firmas.id),
  nombre: text('nombre').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  rol: text('rol', { enum: ['socio', 'gerente', 'senior', 'asistente'] }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const empresas = pgTable('empresas', {
  id: uuid('id').primaryKey().defaultRandom(),
  firmaId: uuid('firma_id').notNull().references(() => firmas.id),
  nombre: text('nombre').notNull(),
  nit: text('nit').notNull().unique(),
  sector: text('sector').notNull(),
  // Entendimiento del cliente (NIA 315)
  ciiu: text('ciiu'),
  actividadEconomica: text('actividad_economica'),
  ciudad: text('ciudad'),
  marcoContable: text('marco_contable', { enum: ['NIIF', 'NIIF_PYMES', 'PCGA'] }).notNull(),
  estadoEncargo: text('estado_encargo', { enum: ['pendiente', 'aceptado', 'rechazado'] })
    .default('pendiente')
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const auditorias = pgTable('auditorias', {
  id: uuid('id').primaryKey().defaultRandom(),
  empresaId: uuid('empresa_id').notNull().references(() => empresas.id),
  socioId: uuid('socio_id').notNull().references(() => usuarios.id),
  periodo: text('periodo').notNull(),
  tipo: text('tipo', { enum: ['financiera', 'integral', 'especial'] }).notNull(),
  estado: text('estado', {
    enum: ['planificacion', 'ejecucion', 'revision', 'finalizada'],
  })
    .default('planificacion')
    .notNull(),
  materialidadAprobada: boolean('materialidad_aprobada').default(false).notNull(),
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
  area: text('area', {
    enum: [
      'efectivo',
      'cartera',
      'inventarios',
      'propiedad_planta_equipo',
      'proveedores',
      'nomina',
      'impuestos',
      'ingresos',
      'gastos',
      'patrimonio',
      'otro',
    ],
  }).notNull(),
  descripcion: text('descripcion').notNull(),
  riesgoInherente: text('riesgo_inherente', { enum: ['bajo', 'medio', 'alto'] }).notNull(),
  riesgoControl: text('riesgo_control', { enum: ['bajo', 'medio', 'alto'] }).notNull(),
  riesgoCombinado: text('riesgo_combinado', { enum: ['bajo', 'medio', 'alto'] }).notNull(),
  respuestaPlaneada: text('respuesta_planeada'),
  origen: text('origen', { enum: ['manual', 'sugerido'] }).default('manual').notNull(),
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
  area: text('area', {
    enum: [
      'efectivo',
      'cartera',
      'inventarios',
      'propiedad_planta_equipo',
      'proveedores',
      'nomina',
      'impuestos',
      'ingresos',
      'gastos',
      'patrimonio',
      'otro',
    ],
  }).notNull(),
  titulo: text('titulo').notNull(),
  procedimiento: text('procedimiento'),
  alcance: text('alcance'),
  hallazgos: text('hallazgos'),
  conclusion: text('conclusion'),
  estado: text('estado', { enum: ['borrador', 'en_revision', 'aprobado'] })
    .default('borrador')
    .notNull(),
  preparadoPor: uuid('preparado_por')
    .notNull()
    .references(() => usuarios.id),
  aprobadoPor: uuid('aprobado_por').references(() => usuarios.id),
  aprobadoAt: timestamp('aprobado_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// Evidencia ligada a un papel de trabajo (metadata; sin archivo en este MVP).
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
  area: text('area', {
    enum: [
      'efectivo',
      'cartera',
      'inventarios',
      'propiedad_planta_equipo',
      'proveedores',
      'nomina',
      'impuestos',
      'ingresos',
      'gastos',
      'patrimonio',
      'otro',
    ],
  }).notNull(),
  titulo: text('titulo').notNull(),
  descripcion: text('descripcion'),
  asignadoA: uuid('asignado_a')
    .notNull()
    .references(() => usuarios.id),
  estado: text('estado', { enum: ['pendiente', 'en_progreso', 'completada'] })
    .default('pendiente')
    .notNull(),
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
      enum: ['dictamen', 'carta_control_interno', 'carta_representaciones'],
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
