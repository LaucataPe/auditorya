/**
 * Caso de práctica de AuditorYa Academia: «Comercializadora Ejemplo S.A.S.».
 *
 * Es la fuente única de las cifras que ven el curso (teoría y quizzes) y el encargo demo
 * que el backend siembra para el playground. Las cifras están hechas para que cada lección
 * tenga una respuesta defendible:
 *
 *  - Ingresos 1.000 M con margen histórico de 30 % → costo esperado ~700 M; registrado 595 M.
 *    Faltan ~105 M (≈150 M de ventas sin su costo): el margen salta a 40,5 % y el inventario
 *    crece 51 % mientras el costo solo 4 %.
 *  - Utilidad antes de impuestos 38 M (20 M en 2025) y, corregido el costo, pérdida → base de
 *    materialidad: ingresos. 1 % = 10 M; ejecución 75 % = 7,5 M; trivial 5 % = 0,5 M.
 *  - La utilidad 2025 (20 M) sigue sin trasladar en la 3605; la cartera incluye 25 M de
 *    Comercial Andina S.A.S. sin movimiento.
 *  - Revisor fiscal por estatutos: con 499 M de activos y 820 M de ingresos en 2025 no alcanza
 *    los topes del parágrafo 2 del art. 13 de la Ley 43 de 1990.
 *  - El predecesor dictaminó 2025 con salvedades (no presenció el conteo del inventario de 210 M)
 *    y luego renunció: el inventario inicial de 2026 es un saldo de apertura que hay que probar.
 *  - El balance de prueba es anterior al asiento de impuesto de renta: las cifras de resultado son
 *    antes de impuestos.
 *
 * Saldos en pesos y con su naturaleza (positivos), salvo cuentas correctoras (1592) en negativo.
 * El balance cuadra: activo = pasivo + patrimonio + (ingresos − gastos − costos).
 */

const M = 1_000_000

export type CuentaCaso = {
  codigo: string
  nombre: string
  /** Saldo al cierre del período auditado (2026). */
  saldoActual: number
  /** Saldo al inicio del período: el cierre 2025 para cuentas de balance, 0 para resultados. */
  saldoInicial: number
  /** Saldo al mismo corte del año anterior (2025), para el comparativo. null = no existía. */
  saldoAnterior: number | null
  tercero?: string
  terceroNombre?: string
}

const c = (
  codigo: string,
  nombre: string,
  actual: number,
  anterior: number | null,
  inicial?: number,
): CuentaCaso => {
  const esResultado = ['4', '5', '6', '7'].includes(codigo.charAt(0))
  return {
    codigo,
    nombre,
    saldoActual: actual * M,
    saldoAnterior: anterior === null ? null : anterior * M,
    saldoInicial: (inicial ?? (esResultado ? 0 : anterior ?? 0)) * M,
  }
}

const aux = (codigo: string, terceroNombre: string, tercero: string, actual: number, anterior: number): CuentaCaso => ({
  ...c(codigo, terceroNombre, actual, null, anterior),
  tercero,
  terceroNombre,
})

/** Balance de prueba 2026 (clases, grupos, cuentas y auxiliares de clientes). */
export const BALANCE_CASO: CuentaCaso[] = [
  c('1', 'Activo', 577, 499),
  c('11', 'Disponible', 69, 128),
  c('1105', 'Caja', 5, 4),
  c('1110', 'Bancos', 64, 124),
  c('13', 'Deudores', 135, 106),
  c('1305', 'Clientes', 121, 96),
  aux('13050501', 'Comercial Andina S.A.S.', '900111222', 25, 25),
  aux('13050502', 'Distribuidora del Norte S.A.S.', '900333444', 58, 41),
  aux('13050503', 'Tiendas Mi Barrio S.A.S.', '900555666', 38, 30),
  c('1355', 'Anticipo de impuestos y contribuciones', 14, 10),
  c('14', 'Inventarios', 318, 210),
  c('1435', 'Mercancías no fabricadas por la empresa', 318, 210),
  c('15', 'Propiedades, planta y equipo', 55, 55),
  c('1524', 'Equipo de oficina', 60, 60),
  c('1528', 'Equipo de computación y comunicación', 30, 30),
  c('1592', 'Depreciación acumulada', -35, -35),

  c('2', 'Pasivo', 267, 227),
  c('21', 'Obligaciones financieras', 90, 100),
  c('2105', 'Bancos nacionales', 90, 100),
  c('22', 'Proveedores', 142, 98),
  c('2205', 'Proveedores nacionales', 142, 98),
  c('23', 'Cuentas por pagar', 6, 5),
  c('2365', 'Retención en la fuente', 6, 5),
  c('24', 'Impuestos, gravámenes y tasas', 18, 15),
  c('2408', 'Impuesto sobre las ventas por pagar', 18, 15),
  c('25', 'Obligaciones laborales', 11, 9),
  c('2505', 'Salarios por pagar', 11, 9),

  // La utilidad 2025 (20 M) se cerró a la 3605 y la asamblea no la trasladó: sigue ahí.
  c('3', 'Patrimonio', 272, 252, 272),
  c('31', 'Capital social', 200, 200),
  c('3105', 'Capital suscrito y pagado', 200, 200),
  c('36', 'Resultados del ejercicio', 20, 0, 20),
  c('3605', 'Utilidad del ejercicio', 20, 0, 20),
  c('37', 'Resultados de ejercicios anteriores', 52, 52),
  c('3705', 'Utilidades acumuladas', 52, 52),

  c('4', 'Ingresos', 1000, 820),
  c('41', 'Operacionales', 1000, 820),
  c('4135', 'Comercio al por mayor y al por menor', 1000, 820),

  c('5', 'Gastos', 367, 226),
  c('51', 'Operacionales de administración', 280, 180),
  c('5105', 'Gastos de personal', 180, 120),
  c('5135', 'Servicios', 60, 40),
  c('5195', 'Diversos', 40, 20),
  c('52', 'Operacionales de ventas', 87, 46),
  c('5205', 'Gastos de personal (ventas)', 87, 46),

  c('6', 'Costo de ventas', 595, 574),
  c('61', 'Costo de ventas y de prestación de servicios', 595, 574),
  c('6135', 'Comercio al por mayor y al por menor', 595, 574),
]

/** Nivel PUC = longitud del código (1 clase … 8 auxiliar), igual que el importador. */
export function nivelCuentaCaso(codigo: string): number {
  return codigo.length
}

export const EMPRESA_CASO = {
  nombre: 'Comercializadora Ejemplo S.A.S.',
  sector: 'Comercio',
  ciiu: '4690',
  actividadEconomica: 'Comercio al por mayor no especializado',
  ciudad: 'Bogotá D.C.',
  marcoContable: 'NIIF_PYMES' as const,
  modeloNegocio:
    'Compra mercancía de consumo masivo a proveedores nacionales y la revende al por mayor a tiendas y distribuidores, y al detal en su punto de venta. Margen bruto histórico cercano al 30 %.',
  estructura: 'S.A.S. de un accionista mayoritario (85 %) que también es el gerente general. 18 empleados.',
  personasClave:
    'Gerente general y accionista mayoritario; contadora externa; un auxiliar contable que registra facturas de proveedores y prepara los pagos.',
  entornoRegulatorio:
    'Grupo 2 (NIIF para las PYMES, Anexo 2 del Decreto 2420 de 2015). Tiene revisor fiscal porque sus estatutos lo exigen: por activos e ingresos no alcanza los topes de la ley. Factura y nómina electrónica.',
  sistemaContable:
    'Software contable en la nube; los ajustes manuales los registra la contadora externa al cierre de mes. El impuesto de renta se registra con el cierre anual, después del balance de prueba.',
}

/** Período auditado y ancla de las fechas del caso. */
export const PERIODO_CASO = {
  fechaInicio: '2026-01-01',
  fechaFin: '2026-12-31',
  corteInterino: '2026-09-30',
}

/**
 * Respuestas correctas de cada práctica. El backend las siembra cuando una lección necesita
 * que las anteriores estén hechas (reiniciar), para que el encargo demo nunca quede roto.
 */
export const RESPUESTAS_CASO = {
  entendimiento: {
    cambiosSignificativos:
      'Las ventas crecieron 22 % frente a 2025 y el inventario 51 %. Cambio de revisor fiscal: el anterior dictaminó 2025 con salvedades por el inventario y luego renunció.',
    eventosSignificativos: 'La utilidad 2025 (20 M) sigue sin trasladar en la cuenta 3605.',
  },
  coso: [
    {
      componente: 'actividades_control' as const,
      calificacion: 'con_deficiencias' as const,
      observaciones: 'El mismo auxiliar registra las facturas de proveedores y prepara los pagos: falta segregación de funciones.',
    },
  ],
  materialidad: {
    baseCalculo: 'ingresos' as const,
    montoBase: 1000 * M,
    porcentaje: 1,
    porcentajeDesempeno: 75,
    justificacion:
      'La utilidad es volátil (20 M en 2025, 38 M en 2026 y pérdida si se corrige el costo omitido); los ingresos son la base estable que miran los usuarios.',
  },
  riesgoCosto: {
    area: 'costo_de_ventas',
    descripcion:
      'Costo de ventas incompleto: el margen bruto saltó de 30 % a 40,5 % y el inventario creció 51 % frente a 4 % del costo. Faltarían ~105 M de costo (integridad).',
    riesgoInherente: 'alto' as const,
    riesgoControl: 'alto' as const,
    respuestaPlaneada: 'Conciliar las salidas de inventario (kárdex) con el costo de ventas y recalcular el costo del período.',
  },
  /** Hoja de ajustes al cierre (lección 4.1): 105 + 25 + 3 = 133 M sin corregir; el corte ya se corrigió. */
  ajustes: [
    { descripcion: 'Costo de ventas omitido (salidas del kárdex sin registrar)', cuentaCodigo: '6135', monto: 105 * M, tipo: 'factual' as const, efecto: 'resultado' as const, corregido: false },
    { descripcion: 'Deterioro no reconocido de la cartera de Comercial Andina S.A.S.', cuentaCodigo: '1305', monto: 25 * M, tipo: 'juicio' as const, efecto: 'resultado' as const, corregido: false },
    { descripcion: 'Depreciación 2026 del equipo de oficina no registrada', cuentaCodigo: '1592', monto: 3 * M, tipo: 'factual' as const, efecto: 'resultado' as const, corregido: false },
    { descripcion: 'Errores de corte de ventas (proyectados de la muestra)', cuentaCodigo: '4135', monto: 8 * M, tipo: 'proyectado' as const, efecto: 'resultado' as const, corregido: true },
  ],
}

/** Materialidad del caso ya calculada (para textos y quizzes). */
export const MATERIALIDAD_CASO = {
  global: 10 * M,
  ejecucion: 7.5 * M,
  trivial: 0.5 * M,
}

// ─── Personajes y expediente del cliente ────────────────────────────────────
// Todos ficticios. El auditor que hace el curso trabaja en la firma del caso.

export type PersonajeId = 'socia' | 'gerente' | 'contadora' | 'auxiliar' | 'revisorAnterior'

export const FIRMA_CASO = {
  nombre: 'Rendón & Asociados Auditores S.A.S.',
  ciudad: 'Bogotá D.C.',
}

export const PERSONAJES_CASO: Record<PersonajeId, { nombre: string; rol: string; iniciales: string }> = {
  socia: { nombre: 'Claudia Rendón', rol: `Socia del encargo · ${FIRMA_CASO.nombre}`, iniciales: 'CR' },
  gerente: { nombre: 'Andrés Gómez Pardo', rol: 'Gerente general y accionista (85 %)', iniciales: 'AG' },
  contadora: { nombre: 'Patricia Lozano', rol: 'Contadora externa', iniciales: 'PL' },
  auxiliar: { nombre: 'Julián Torres', rol: 'Auxiliar contable (compras y pagos)', iniciales: 'JT' },
  revisorAnterior: { nombre: 'Héctor Salazar', rol: 'Revisor fiscal 2023–2025', iniciales: 'HS' },
}

export type DocumentoExpediente = {
  id: string
  titulo: string
  tipo: 'certificado' | 'acta' | 'carta' | 'correo' | 'narrativa' | 'tabla' | 'politica' | 'balance'
  fecha: string
  /** Quién lo emite o lo envía. */
  de: string
  parrafos: string[]
  tabla?: { encabezados: string[]; filas: string[][] }
}

/**
 * Documentos que el auditor consulta durante el curso. Los ejercicios los citan por id para que
 * busque la evidencia en vez de recibirla resuelta. El balance se arma aparte desde BALANCE_CASO.
 */
export const EXPEDIENTE_CASO: DocumentoExpediente[] = [
  {
    id: 'camara',
    titulo: 'Certificado de existencia y representación legal (extracto)',
    tipo: 'certificado',
    fecha: '2026-04-06',
    de: 'Cámara de Comercio de Bogotá',
    parrafos: [
      'Razón social: Comercializadora Ejemplo S.A.S. · NIT 900.000.000-1 · Matrícula mercantil vigente, renovada en marzo de 2026.',
      'Constitución: documento privado del 14 de agosto de 2014. Duración indefinida.',
      'Objeto social: comercialización al por mayor y al por menor de productos de consumo masivo.',
      'Capital suscrito y pagado: $200.000.000. Accionistas: Andrés Gómez Pardo (85 %) y Lucía Gómez Pardo (15 %), hermana del gerente.',
      'Representante legal: Andrés Gómez Pardo, gerente general, sin limitaciones de cuantía.',
      'Órganos de control: los estatutos (artículo 41) establecen un revisor fiscal elegido por la asamblea para períodos de un año.',
      'Revisor fiscal: Rendón & Asociados Auditores S.A.S. (designó a Claudia Rendón), nombrada por la asamblea del 25 de marzo de 2026 (Acta 018), en reemplazo de Héctor Salazar.',
    ],
  },
  {
    id: 'renuncia',
    titulo: 'Carta de renuncia del revisor fiscal anterior',
    tipo: 'carta',
    fecha: '2026-02-15',
    de: 'Héctor Salazar, revisor fiscal',
    parrafos: [
      'Señores Asamblea de Accionistas, Comercializadora Ejemplo S.A.S.',
      'Por medio de la presente presento mi renuncia irrevocable al cargo de revisor fiscal, que ejercí desde 2023.',
      'El 10 de febrero de 2026 emití mi dictamen sobre los estados financieros de 2025, con opinión con salvedades: la administración no programó el conteo físico del inventario al 31 de diciembre ($210.000.000) y no pude verificar por otros medios las cantidades ni su efecto en el costo de ventas.',
      'La decisión obedece a esas diferencias con la administración sobre el inventario y el costo de ventas de 2025, que comuniqué por escrito al gerente en enero de 2026 sin obtener respuesta.',
      'Quedo a disposición de quien me suceda en el cargo para atender sus consultas, previa autorización de la sociedad.',
    ],
  },
  {
    id: 'acta-018',
    titulo: 'Acta 018 · Asamblea ordinaria de accionistas',
    tipo: 'acta',
    fecha: '2026-03-25',
    de: 'Asamblea de accionistas',
    parrafos: [
      'Asisten el 100 % de las acciones. Preside Andrés Gómez Pardo; secretaria Patricia Lozano.',
      '1. Se lee el dictamen de Héctor Salazar, con opinión con salvedades sobre el inventario, y se aprueban los estados financieros de 2025, con utilidad de $20.000.000. La asamblea aplaza la decisión sobre su distribución para una reunión posterior.',
      '2. Se acepta la renuncia de Héctor Salazar y, como lo exigen los estatutos, se nombra revisor fiscal a Rendón & Asociados Auditores S.A.S. para el período 2026.',
      '3. Se autoriza a la sociedad a tomar en arriendo la bodega de Fontibón, de propiedad del gerente Andrés Gómez Pardo, por $4.000.000 mensuales.',
    ],
  },
  {
    id: 'correo-gerente',
    titulo: 'Correo del gerente sobre la propuesta',
    tipo: 'correo',
    fecha: '2026-04-01',
    de: 'Andrés Gómez Pardo, gerente',
    parrafos: [
      'Claudia, buen día. Vi en la propuesta que piden el kárdex completo del año y presenciar el conteo de diciembre.',
      'Este año negociamos muy buenos precios con los proveedores y el margen va a subir. No veo por qué revisar tanto el inventario: la bodega va a estar llena porque compramos barato para la temporada.',
      'Les pido que el trabajo de campo no se extienda, el equipo está muy ocupado. Saludos, Andrés.',
    ],
  },
  {
    id: 'narrativa-compras',
    titulo: 'Narrativa del ciclo de compras y pagos',
    tipo: 'narrativa',
    fecha: '2026-09-30',
    de: 'Patricia Lozano, contadora externa (entrevista)',
    parrafos: [
      'Los proveedores envían la factura electrónica al correo de Julián Torres, auxiliar contable, quien la registra en el software y causa la cuenta por pagar.',
      'Cada viernes Julián arma el archivo de pagos de la banca en línea con las facturas que él mismo registró y lo sube al banco.',
      'El gerente aprueba el lote desde su celular con el token. No revisa los soportes: confía en que Julián ya los verificó.',
      'Los ajustes manuales los registro yo al cierre de cada mes. Nadie más revisa esos asientos.',
    ],
  },
  {
    id: 'cartera-edades',
    titulo: 'Cartera por edades al 31 de diciembre de 2026',
    tipo: 'tabla',
    fecha: '2026-12-31',
    de: 'Contabilidad de la Comercializadora',
    parrafos: ['Saldo de clientes (cuenta 1305) por tercero y antigüedad.'],
    tabla: {
      encabezados: ['Cliente', 'NIT', 'Saldo', 'Última venta', 'Antigüedad'],
      filas: [
        ['Comercial Andina S.A.S.', '900111222', '25.000.000', 'Noviembre 2025', 'Más de 360 días'],
        ['Distribuidora del Norte S.A.S.', '900333444', '58.000.000', 'Diciembre 2026', '0–30 días'],
        ['Tiendas Mi Barrio S.A.S.', '900555666', '38.000.000', 'Noviembre 2026', '31–60 días'],
        ['Total', '', '121.000.000', '', ''],
      ],
    },
  },
  {
    id: 'kardex',
    titulo: 'Resumen del kárdex 2026 (mercancías)',
    tipo: 'tabla',
    fecha: '2026-12-31',
    de: 'Módulo de inventarios del software',
    parrafos: [
      'Movimiento valorado a costo promedio. Las salidas del kárdex corresponden a la mercancía despachada a clientes.',
    ],
    tabla: {
      encabezados: ['Concepto', 'Valor'],
      filas: [
        ['Saldo inicial 1 de enero de 2026', '210.000.000'],
        ['Compras del año', '703.000.000'],
        ['Salidas valoradas (mercancía vendida)', '700.000.000'],
        ['Saldo final según kárdex', '213.000.000'],
        ['Saldo final según contabilidad (1435)', '318.000.000'],
      ],
    },
  },
  {
    id: 'politicas',
    titulo: 'Políticas contables (extracto)',
    tipo: 'politica',
    fecha: '2025-12-31',
    de: 'Comercializadora Ejemplo S.A.S.',
    parrafos: [
      'Marco: NIIF para las PYMES (Grupo 2, Anexo 2 del Decreto 2420 de 2015).',
      'Inventarios: costo promedio ponderado. El costo de ventas se reconoce al despachar la mercancía.',
      'Propiedades, planta y equipo: línea recta. El equipo de oficina ($60.000.000, adquirido en mayo de 2024) tiene vida útil de 20 años: $3.000.000 al año. El equipo de cómputo ($30.000.000) está totalmente depreciado.',
      'Cartera: se evalúa deterioro al cierre para saldos con más de 360 días sin movimiento.',
    ],
  },
]
