import { pgTable, text, timestamp, boolean, uuid, jsonb, numeric, integer, uniqueIndex } from 'drizzle-orm/pg-core'

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
})

export const auditorias = pgTable('auditorias', {
  id: uuid('id').primaryKey().defaultRandom(),
  empresaId: uuid('empresa_id').notNull().references(() => empresas.id),
  socioId: uuid('socio_id').notNull().references(() => usuarios.id),
  periodo: text('periodo').notNull(),
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
  saldoAnterior: numeric('saldo_anterior', { precision: 20, scale: 2 }).default('0').notNull(),
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
  // Riesgo (NIA 315) que este papel atiende, si aplica.
  riesgoId: uuid('riesgo_id').references(() => riesgos.id),
  procedimiento: text('procedimiento'),
  alcance: text('alcance'),
  hallazgos: text('hallazgos'),
  conclusion: text('conclusion'),
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
  // Riesgo (NIA 315) que esta tarea atiende, si aplica.
  riesgoId: uuid('riesgo_id').references(() => riesgos.id),
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
  auditoriaId: uuid('auditoria_id').references(() => auditorias.id),
  empresaId: uuid('empresa_id').references(() => empresas.id),
  accion: text('accion').notNull(), // p. ej. 'papel.aprobar', 'materialidad.aprobar'
  entidad: text('entidad').notNull(), // 'papel_trabajo', 'informe', 'materialidad', ...
  entidadId: uuid('entidad_id'),
  detalle: jsonb('detalle').$type<Record<string, unknown>>(),
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
