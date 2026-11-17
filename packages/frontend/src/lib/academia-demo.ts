/**
 * Servidor simulado de AuditorYa Academia (curso público, sin cuenta ni base de datos).
 *
 * Responde, en el navegador, los endpoints que usan las pestañas de planeación sobre un único
 * encargo de práctica (Comercializadora Ejemplo S.A.S., ver academia-caso.ts). El estado vive en
 * memoria y se guarda en localStorage. Las pestañas son las reales: solo cambia quién responde
 * (ver activarApiDemo en lib/api.ts).
 *
 * Espejo de: GET /auditorias/:id/balance y /riesgos/candidatos (routes/auditorias.ts),
 * POST /auditorias/:id/informes/:tipo/generar (routes/informes.ts), papeles desde un riesgo
 * (routes/ejecucion.ts), la lista PBC (routes/pbc.ts) y la hoja de ajustes (routes/ajustes.ts, que
 * calcula la opinión con evaluarOpinion de types). Si cambian allá, revisar aquí.
 */
import {
  AREA_BASE_LABEL, BALANCE_CASO, EMPRESA_CASO, FIRMA_CASO, PERIODO_CASO, PERSONAJES_CASO, RESPUESTAS_CASO,
  areaDesdeCodigoPuc, calcularRatios, claseDesdeCodigo, detectarBanderas, evaluarOpinion, generarContenido,
  nivelCombinado, nivelCuentaCaso, prefijoDeArea, siguienteIndice,
  type CriterioPractica, type EfectoAjuste, type TipoAjuste, type TipoInforme, type TipoOpinion, type VerificacionPractica,
} from '@auditorya/types'

export const DEMO_EMPRESA_ID = 'demo-empresa'
export const DEMO_AUDITORIA_ID = 'demo-auditoria'

const MENSAJE_BLOQUEADO =
  'Disponible en la versión completa de AuditorYa. En el curso de práctica esta función está desactivada.'

/** Error del servidor simulado: se muestra igual que los del backend (toasts / mensajes inline). */
class ErrorDemo extends Error {}

/**
 * Evento de window cuando el curso intenta una acción de la versión completa (aprobar, IA,
 * importar, subir archivos…). El layout lo escucha para invitar a conocer AuditorYa.
 */
export const EVENTO_FUNCION_BLOQUEADA = 'auditorya:academia-bloqueado'

// ─── Estado del encargo de práctica ──────────────────────────────────────────

type Nivel = 'bajo' | 'medio' | 'alto'

type RiesgoDemo = {
  id: string
  auditoriaId: string
  area: string
  descripcion: string
  riesgoInherente: Nivel
  riesgoControl: Nivel
  riesgoCombinado: Nivel
  respuestaPlaneada: string | null
  origen: 'manual' | 'sugerido' | 'analitico'
  createdAt: string
}

type MaterialidadDemo = {
  id: string
  auditoriaId: string
  baseCalculo: 'activos' | 'ingresos' | 'utilidad_antes_impuestos' | 'patrimonio'
  montoBase: string
  porcentaje: string
  materialidad: string
  porcentajeDesempeno: string
  materialidadDesempeno: string
  justificacion: string | null
  aprobada: boolean
  aprobadaPor: null
  aprobadaAt: string | null
  createdAt: string
}

type EntendimientoDemo = {
  id: string
  auditoriaId: string
  cambiosSignificativos: string | null
  eventosSignificativos: string | null
  notas: string | null
  sinCambios: boolean
  confirmado: boolean
  createdAt: string
}

type CosoDemo = {
  id: string
  auditoriaId: string
  componente: string
  calificacion: string
  observaciones: string | null
  createdAt: string
}

type TipoInformeDemo = Extract<TipoInforme, 'carta_encargo' | 'memo_planeacion' | 'dictamen' | 'carta_control_interno' | 'carta_representaciones'>
const TIPOS_INFORME_DEMO: TipoInformeDemo[] = ['carta_encargo', 'memo_planeacion', 'dictamen', 'carta_control_interno', 'carta_representaciones']

type InformeDemo = {
  id: string
  auditoriaId: string
  tipo: TipoInformeDemo
  tipoOpinion: TipoOpinion | null
  contenido: Record<string, string>
  estado: 'borrador'
  aprobadoPor: null
  aprobadoAt: null
  createdAt: string
}

type PapelDemo = {
  id: string
  auditoriaId: string
  area: string
  indice: string
  titulo: string
  riesgoId: string | null
  procedimiento: string | null
  estado: 'borrador'
  createdAt: string
}

type SolicitudPbcDemo = {
  id: string
  auditoriaId: string
  papelTrabajoId: string
  descripcion: string
  estado: 'solicitado' | 'recibido' | 'no_aplica'
  createdAt: string
}

type AjusteDemo = {
  id: string
  auditoriaId: string
  descripcion: string
  cuentaCodigo: string | null
  monto: string
  tipo: TipoAjuste
  efecto: EfectoAjuste
  corregido: boolean
  createdAt: string
}

type EstadoDemo = {
  entendimiento: EntendimientoDemo | null
  coso: CosoDemo[]
  materialidad: MaterialidadDemo | null
  riesgos: RiesgoDemo[]
  informes: InformeDemo[]
  papeles: PapelDemo[]
  pbc: SolicitudPbcDemo[]
  ajustes: AjusteDemo[]
}

const CLAVE = 'auditorya.academia.encargo.v1'
const vacio = (): EstadoDemo => ({ entendimiento: null, coso: [], materialidad: null, riesgos: [], informes: [], papeles: [], pbc: [], ajustes: [] })

let estado: EstadoDemo | null = null

function leer(): EstadoDemo {
  if (estado) return estado
  try {
    const raw = localStorage.getItem(CLAVE)
    estado = raw ? { ...vacio(), ...(JSON.parse(raw) as Partial<EstadoDemo>) } : vacio()
  } catch {
    estado = vacio()
  }
  return estado
}

function guardar() {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(estado))
  } catch {
    // Sin almacenamiento disponible: el encargo vive solo mientras la pestaña esté abierta.
  }
}

const nuevoId = () => `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const ahora = () => new Date().toISOString()

/** Vuelve el encargo de práctica a su estado inicial (solo el balance cargado). */
export function reiniciarEncargoDemo() {
  estado = vacio()
  guardar()
}

// ─── Entidades fijas: empresa, encargo y balance ─────────────────────────────

const empresa = () => ({
  id: DEMO_EMPRESA_ID,
  firmaId: 'demo-firma',
  nit: '900.000.000-1',
  ...EMPRESA_CASO,
  estadoEncargo: 'aceptado',
  createdAt: PERIODO_CASO.fechaInicio,
})

const auditoria = () => ({
  id: DEMO_AUDITORIA_ID,
  empresaId: DEMO_EMPRESA_ID,
  socioId: 'demo-socio',
  fechaInicio: PERIODO_CASO.fechaInicio,
  fechaFin: PERIODO_CASO.fechaFin,
  tipoServicio: 'revisoria_fiscal',
  tipo: 'financiera',
  estado: 'planificacion',
  // La aprueba la socia del caso (lección 2.8): en el curso no hay usuario socio.
  materialidadAprobada: !!leer().materialidad?.aprobada,
  agenteActivado: false,
  arranqueCompletadoAt: null,
  createdAt: PERIODO_CASO.fechaInicio,
  empresa: empresa(),
})

const UMBRAL_VARIACION_PCT = 30

function umbralMaterialidad(): number | null {
  const m = leer().materialidad
  return m ? Number(m.materialidadDesempeno || m.materialidad) : null
}

/** Espejo de GET /auditorias/:id/balance con el comparativo del caso siempre cargado. */
function analisisBalance() {
  const cuentas = BALANCE_CASO.filter((c) => nivelCuentaCaso(c.codigo) <= 6 && !c.tercero)
  const umbral = umbralMaterialidad()
  const conTerceros = new Set<string>()
  for (const c of BALANCE_CASO.filter((x) => x.tercero)) {
    for (let l = 1; l <= c.codigo.length; l++) conTerceros.add(c.codigo.slice(0, l))
  }

  const analizadas = cuentas.map((c) => {
    const base = c.saldoAnterior ?? 0
    const actual = c.saldoActual
    const variacionPct = base !== 0 ? ((actual - base) / Math.abs(base)) * 100 : null
    return {
      codigo: c.codigo,
      nombre: c.nombre,
      clase: claseDesdeCodigo(c.codigo),
      nivel: nivelCuentaCaso(c.codigo),
      saldoActual: actual,
      saldoInicial: c.saldoInicial,
      saldoComparativo: base,
      baseVariacion: 'comparativo' as const,
      variacionAbs: actual - base,
      variacionPct,
      significativa: umbral !== null && Math.abs(actual) > umbral,
      anomalia: (variacionPct !== null && Math.abs(variacionPct) >= UMBRAL_VARIACION_PCT) || (base === 0 && actual !== 0),
      tieneTerceros: conTerceros.has(c.codigo),
    }
  })

  const clase = (d: string) => {
    const f = cuentas.find((c) => c.codigo === d)
    return f ? Math.abs(f.saldoActual) : null
  }
  const ingresos = clase('4')
  const bases = {
    activos: clase('1'),
    ingresos,
    utilidad_antes_impuestos: ingresos !== null ? ingresos - (clase('5') ?? 0) - (clase('6') ?? 0) - (clase('7') ?? 0) : null,
    patrimonio: clase('3'),
  }

  const entrada = analizadas.map((c) => ({ codigo: c.codigo, nombre: c.nombre, saldoActual: c.saldoActual, saldoAnterior: c.saldoComparativo }))

  return {
    cuentas: analizadas,
    ratios: calcularRatios(entrada),
    banderas: detectarBanderas(entrada),
    bases,
    resumen: {
      totalCuentas: analizadas.length,
      totalFilas: BALANCE_CASO.length,
      terceros: BALANCE_CASO.filter((c) => c.tercero).length,
      significativas: analizadas.filter((x) => x.significativa).length,
      anomalias: analizadas.filter((x) => x.anomalia).length,
      umbralSignificativa: umbral,
      umbralVariacionPct: UMBRAL_VARIACION_PCT,
    },
    archivo: null,
    periodo: { corteDesde: PERIODO_CASO.fechaInicio, corteHasta: PERIODO_CASO.fechaFin },
    comparativo: { cargado: true, nombre: 'Balance 2025 (caso de práctica)', createdAt: PERIODO_CASO.fechaInicio },
  }
}

// Espejo de los mapas de routes/auditorias.ts (riesgos candidatos).
const ASERCION: Record<string, string> = {
  caja: 'existencia', bancos: 'existencia', inversiones: 'existencia y valuación',
  cuentas_por_cobrar: 'valuación y existencia', impuestos_por_cobrar: 'existencia y exactitud',
  inventarios: 'valuación y existencia', propiedad_planta_equipo: 'existencia y valuación',
  intangibles: 'existencia y valuación', otros_activos: 'valuación',
  obligaciones_financieras: 'integridad y exactitud', proveedores: 'integridad',
  cuentas_por_pagar: 'integridad', impuestos_por_pagar: 'exactitud',
  obligaciones_laborales: 'integridad', provisiones_nomina: 'integridad y exactitud',
  apropiaciones_nomina: 'integridad y exactitud', diferidos: 'valuación y corte',
  otros_pasivos: 'integridad', patrimonio: 'exactitud',
  ingresos_operacionales: 'ocurrencia y corte', ingresos_no_operacionales: 'ocurrencia',
  gastos_de_administracion: 'integridad y exactitud', gastos_de_ventas: 'integridad y exactitud',
  gastos_no_operacionales: 'ocurrencia y exactitud', costo_de_ventas: 'exactitud y corte',
  costos_de_produccion: 'exactitud e integridad',
}
const RESPUESTA: Record<string, string> = {
  caja: 'Arqueo de caja y fondos fijos, y conciliación con registros.',
  bancos: 'Confirmación bancaria y revisión de conciliaciones.',
  inversiones: 'Confirmación de custodios y verificación de valoración a mercado.',
  cuentas_por_cobrar: 'Circularización a clientes y análisis de antigüedad.',
  impuestos_por_cobrar: 'Conciliación de saldos a favor con declaraciones presentadas.',
  inventarios: 'Observación de toma física y pruebas de valuación.',
  propiedad_planta_equipo: 'Inspección física y recálculo de depreciación.',
  intangibles: 'Revisión de soportes de adquisición y recálculo de amortización.',
  otros_activos: 'Revisión de composición y soportes de las partidas.',
  obligaciones_financieras: 'Confirmación con entidades financieras y recálculo de intereses.',
  proveedores: 'Confirmación a proveedores y pruebas de corte de pasivos.',
  cuentas_por_pagar: 'Búsqueda de pasivos omitidos y revisión de pagos posteriores.',
  impuestos_por_pagar: 'Recálculo y conciliación con las declaraciones tributarias.',
  obligaciones_laborales: 'Recálculo de prestaciones y verificación de seguridad social.',
  provisiones_nomina: 'Recálculo de provisiones laborales y revisión de consolidación.',
  apropiaciones_nomina: 'Recálculo de aportes y verificación de planillas de seguridad social.',
  diferidos: 'Revisión de la causación y amortización de diferidos.',
  otros_pasivos: 'Revisión de composición y soportes de las partidas.',
  patrimonio: 'Revisión de movimientos del patrimonio y actas.',
  ingresos_operacionales: 'Pruebas de corte de ingresos y análisis de márgenes.',
  ingresos_no_operacionales: 'Revisión de soportes de la ocurrencia y clasificación.',
  gastos_de_administracion: 'Pruebas de soporte y razonabilidad de gastos.',
  gastos_de_ventas: 'Pruebas de soporte y razonabilidad de gastos.',
  gastos_no_operacionales: 'Revisión de soportes de la ocurrencia y clasificación.',
  costo_de_ventas: 'Pruebas de corte y análisis de margen bruto contra el sector.',
  costos_de_produccion: 'Revisión del costeo y análisis de variaciones de producción.',
}

const copCO = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

/** Espejo de GET /auditorias/:id/riesgos/candidatos (cuentas de 4 dígitos). */
function candidatos() {
  const umbral = umbralMaterialidad()
  return BALANCE_CASO.filter((c) => nivelCuentaCaso(c.codigo) === 4)
    .map((c) => {
      const base = c.saldoAnterior ?? 0
      const actual = c.saldoActual
      const variacionPct = base !== 0 ? ((actual - base) / Math.abs(base)) * 100 : null
      const significativa = umbral !== null && Math.abs(actual) > umbral
      const anomalia = (variacionPct !== null && Math.abs(variacionPct) >= UMBRAL_VARIACION_PCT) || (base === 0 && actual !== 0)
      return { c, actual, variacionPct, significativa, anomalia }
    })
    .filter((x) => x.significativa || x.anomalia)
    .map(({ c, actual, variacionPct, significativa, anomalia }) => {
      const area = areaDesdeCodigoPuc(c.codigo)
      const ref = 'frente al mismo corte del año anterior'
      const pct = variacionPct === null ? 'nuevo' : `${variacionPct > 0 ? '+' : ''}${variacionPct.toFixed(0)}%`
      const motivo: 'significativa' | 'anomalia' | 'ambas' = significativa && anomalia ? 'ambas' : anomalia ? 'anomalia' : 'significativa'
      const descripcion =
        motivo === 'ambas' ? `${c.nombre} (${c.codigo}): cuenta significativa con variación inusual de ${pct} ${ref}. Posible riesgo de ${ASERCION[area]}.`
        : motivo === 'anomalia' ? `${c.nombre} (${c.codigo}): variación inusual de ${pct} ${ref}. Posible riesgo de ${ASERCION[area]}.`
        : `${c.nombre} (${c.codigo}): saldo significativo de ${copCO(actual)}. Posible riesgo de ${ASERCION[area]}.`
      return {
        codigo: c.codigo,
        cuentaNombre: c.nombre,
        area,
        descripcion,
        riesgoInherente: (anomalia ? 'alto' : 'medio') as Nivel,
        respuestaPlaneada: RESPUESTA[area],
        motivo,
        _orden: Math.abs(actual),
      }
    })
    .sort((a, b) => b._orden - a._orden)
    .slice(0, 25)
    .map(({ _orden, ...rest }) => rest)
}

// ─── Informes ────────────────────────────────────────────────────────────────

const COMPONENTE_LABEL: Record<string, string> = {
  ambiente_control: 'Ambiente de control',
  evaluacion_riesgos: 'Evaluación de riesgos',
  actividades_control: 'Actividades de control',
  informacion_comunicacion: 'Información y comunicación',
  supervision: 'Supervisión / Monitoreo',
}

function generarInforme(tipo: TipoInformeDemo, tipoOpinion: TipoOpinion | null = null): InformeDemo {
  const s = leer()
  const ORDEN: Record<string, number> = { alto: 0, medio: 1, bajo: 2 }
  const contenido = generarContenido(tipo, {
    firmaNombre: FIRMA_CASO.nombre,
    firmaCiudad: FIRMA_CASO.ciudad,
    empresaNombre: EMPRESA_CASO.nombre,
    empresaNit: '900.000.000-1',
    marcoContable: EMPRESA_CASO.marcoContable,
    periodo: PERIODO_CASO.fechaFin.slice(0, 4),
    socioNombre: PERSONAJES_CASO.socia.nombre,
    tipoOpinion,
    deficienciasCoso: s.coso
      .filter((x) => x.calificacion !== 'efectivo')
      .map((x) => ({ titulo: COMPONENTE_LABEL[x.componente] ?? x.componente, calificacion: x.calificacion, observaciones: x.observaciones })),
    ...(tipo === 'memo_planeacion'
      ? {
          entendimiento: s.entendimiento,
          materialidad: s.materialidad,
          riesgosResumen: s.riesgos
            .slice()
            .sort((a, b) => (ORDEN[a.riesgoCombinado] ?? 3) - (ORDEN[b.riesgoCombinado] ?? 3))
            .map((r) => ({ area: AREA_BASE_LABEL[r.area] ?? r.area, descripcion: r.descripcion, combinado: r.riesgoCombinado, respuesta: r.respuestaPlaneada })),
          cosoResumen: s.coso.map((x) => ({ titulo: COMPONENTE_LABEL[x.componente] ?? x.componente, calificacion: x.calificacion, observaciones: x.observaciones })),
          cronogramaResumen: { total: 0, agendados: 0, desde: null, hasta: null },
        }
      : {}),
  })

  const existente = s.informes.find((i) => i.tipo === tipo)
  if (existente) {
    existente.contenido = contenido
    existente.tipoOpinion = tipoOpinion
    return existente
  }
  const nuevo: InformeDemo = {
    id: nuevoId(), auditoriaId: DEMO_AUDITORIA_ID, tipo, tipoOpinion, contenido,
    estado: 'borrador', aprobadoPor: null, aprobadoAt: null, createdAt: ahora(),
  }
  s.informes.push(nuevo)
  return nuevo
}

// ─── Hoja de ajustes (NIA 450) ───────────────────────────────────────────────

function crearAjuste(b: Cuerpo): AjusteDemo {
  return {
    id: nuevoId(), auditoriaId: DEMO_AUDITORIA_ID,
    descripcion: String(b.descripcion), cuentaCodigo: (b.cuentaCodigo as string | undefined) || null,
    monto: String(b.monto), tipo: (b.tipo as TipoAjuste | undefined) ?? 'factual',
    efecto: (b.efecto as EfectoAjuste | undefined) ?? 'resultado', corregido: !!b.corregido, createdAt: ahora(),
  }
}

/** Espejo de armarHoja (routes/ajustes.ts): lista + opinión sugerida frente a la materialidad global. */
function hojaAjustes() {
  const s = leer()
  const materialidad = s.materialidad ? Number(s.materialidad.materialidad) : null
  const ajustes = s.ajustes.slice().sort((x, y) => y.createdAt.localeCompare(x.createdAt))
  const evaluacion = evaluarOpinion(ajustes.map((a) => ({ monto: Number(a.monto), corregido: a.corregido, efecto: a.efecto })), materialidad)
  return { ajustes, materialidad, evaluacion }
}

// ─── Router ──────────────────────────────────────────────────────────────────

type Cuerpo = Record<string, unknown>

function crearRiesgo(b: Cuerpo, origen: RiesgoDemo['origen'], control?: Nivel): RiesgoDemo {
  const inherente = b.riesgoInherente as Nivel
  const ctrl = control ?? (b.riesgoControl as Nivel)
  return {
    id: nuevoId(),
    auditoriaId: DEMO_AUDITORIA_ID,
    area: String(b.area),
    descripcion: String(b.descripcion),
    riesgoInherente: inherente,
    riesgoControl: ctrl,
    riesgoCombinado: nivelCombinado(inherente, ctrl),
    respuestaPlaneada: (b.respuestaPlaneada as string | undefined) ?? null,
    origen,
    createdAt: ahora(),
  }
}

function guardarMaterialidad(b: Cuerpo): MaterialidadDemo {
  const montoBase = Number(b.montoBase)
  const porcentaje = Number(b.porcentaje)
  const porcentajeDesempeno = Number(b.porcentajeDesempeno)
  if (!(montoBase > 0) || !(porcentaje > 0) || !(porcentajeDesempeno > 0)) throw new ErrorDemo('Revisa los valores de la materialidad')
  const materialidad = montoBase * (porcentaje / 100)
  const m: MaterialidadDemo = {
    id: leer().materialidad?.id ?? nuevoId(),
    auditoriaId: DEMO_AUDITORIA_ID,
    baseCalculo: b.baseCalculo as MaterialidadDemo['baseCalculo'],
    montoBase: montoBase.toFixed(2),
    porcentaje: porcentaje.toFixed(2),
    materialidad: materialidad.toFixed(2),
    porcentajeDesempeno: porcentajeDesempeno.toFixed(2),
    materialidadDesempeno: (materialidad * (porcentajeDesempeno / 100)).toFixed(2),
    justificacion: (b.justificacion as string | undefined) ?? null,
    aprobada: false,
    aprobadaPor: null,
    aprobadaAt: null,
    createdAt: leer().materialidad?.createdAt ?? ahora(),
  }
  leer().materialidad = m
  return m
}

/** Responde una petición de la API como lo haría el backend, sobre el encargo de práctica. */
async function responder(metodo: string, pathCompleto: string, cuerpo: unknown): Promise<unknown> {
  const s = leer()
  const b = (cuerpo ?? {}) as Cuerpo
  const path = pathCompleto.split('?')[0]
  const A = `/auditorias/${DEMO_AUDITORIA_ID}`
  const ruta = `${metodo} ${path}`

  if (ruta === `GET ${A}`) return auditoria()
  if (ruta === `GET /empresas/${DEMO_EMPRESA_ID}`) return empresa()
  if (ruta === 'GET /firmas/mia/areas') return []
  // Sin IA en el curso: las pestañas ocultan sus botones de IA como cuando no hay API key.
  if (ruta === 'GET /ia/estado') return { disponible: false, lecturaDeclaracion: false }

  if (ruta === `GET ${A}/balance`) return analisisBalance()

  if (ruta === `GET ${A}/entendimiento`) return s.entendimiento
  if (ruta === `PUT ${A}/entendimiento`) {
    s.entendimiento = {
      id: s.entendimiento?.id ?? nuevoId(),
      auditoriaId: DEMO_AUDITORIA_ID,
      cambiosSignificativos: (b.cambiosSignificativos as string | undefined) ?? null,
      eventosSignificativos: (b.eventosSignificativos as string | undefined) ?? null,
      notas: (b.notas as string | undefined) ?? null,
      sinCambios: !!b.sinCambios,
      confirmado: !!b.confirmado,
      createdAt: s.entendimiento?.createdAt ?? ahora(),
    }
    guardar()
    return s.entendimiento
  }

  if (ruta === `GET ${A}/coso`) return s.coso
  if (metodo === 'PUT' && path.startsWith(`${A}/coso/`)) {
    const componente = path.slice(`${A}/coso/`.length)
    const previo = s.coso.find((c) => c.componente === componente)
    const fila: CosoDemo = {
      id: previo?.id ?? nuevoId(), auditoriaId: DEMO_AUDITORIA_ID, componente,
      calificacion: String(b.calificacion), observaciones: (b.observaciones as string | undefined) ?? null,
      createdAt: previo?.createdAt ?? ahora(),
    }
    s.coso = [...s.coso.filter((c) => c.componente !== componente), fila]
    guardar()
    return fila
  }

  if (ruta === `GET ${A}/materialidad`) return s.materialidad
  if (ruta === `POST ${A}/materialidad`) {
    const m = guardarMaterialidad(b)
    guardar()
    return m
  }

  if (ruta === `GET ${A}/riesgos`) return s.riesgos.slice().sort((x, y) => y.createdAt.localeCompare(x.createdAt))
  if (ruta === `POST ${A}/riesgos`) {
    const r = crearRiesgo(b, 'manual')
    s.riesgos.push(r)
    guardar()
    return r
  }
  if (ruta === `GET ${A}/riesgos/candidatos`) return candidatos()
  if (ruta === `POST ${A}/riesgos/agregar-candidatos`) {
    const origen = (b.origen as RiesgoDemo['origen'] | undefined) ?? 'analitico'
    const nuevos = (b.candidatos as Cuerpo[]).map((cand) => crearRiesgo(cand, origen, 'alto'))
    s.riesgos.push(...nuevos)
    guardar()
    return nuevos
  }
  if (path.startsWith(`${A}/riesgos/`)) {
    const id = path.slice(`${A}/riesgos/`.length)
    const r = s.riesgos.find((x) => x.id === id)
    if (!r) throw new ErrorDemo('Riesgo no encontrado')
    if (metodo === 'DELETE') {
      s.riesgos = s.riesgos.filter((x) => x.id !== id)
      guardar()
      return { ok: true }
    }
    if (metodo === 'PUT') {
      if (b.area) r.area = String(b.area)
      if (b.descripcion) r.descripcion = String(b.descripcion)
      if (b.riesgoInherente) r.riesgoInherente = b.riesgoInherente as Nivel
      if (b.riesgoControl) r.riesgoControl = b.riesgoControl as Nivel
      if (b.respuestaPlaneada !== undefined) r.respuestaPlaneada = b.respuestaPlaneada as string
      r.riesgoCombinado = nivelCombinado(r.riesgoInherente, r.riesgoControl)
      guardar()
      return r
    }
  }

  if (ruta === `GET ${A}/informes`) return s.informes
  const generar = path.match(new RegExp(`^${A}/informes/([a-z_]+)/generar$`))
  if (metodo === 'POST' && generar && TIPOS_INFORME_DEMO.includes(generar[1] as TipoInformeDemo)) {
    const tipo = generar[1] as TipoInformeDemo
    // Igual que el backend: los informes de cierre exigen la materialidad aprobada.
    if (tipo !== 'carta_encargo' && tipo !== 'memo_planeacion' && !s.materialidad?.aprobada) {
      throw new ErrorDemo('Completa la planificación (materialidad aprobada) antes de generar informes')
    }
    const inf = generarInforme(tipo, tipo === 'dictamen' ? ((b.tipoOpinion as TipoOpinion | undefined) ?? 'limpia') : null)
    guardar()
    return inf
  }
  if (metodo === 'PUT' && /^\/informes\/[^/]+$/.test(path)) {
    const inf = s.informes.find((i) => `/informes/${i.id}` === path)
    if (!inf) throw new ErrorDemo('Informe no encontrado')
    inf.contenido = (b.contenido as Record<string, string>) ?? inf.contenido
    if (inf.tipo === 'dictamen' && b.tipoOpinion) inf.tipoOpinion = b.tipoOpinion as TipoOpinion
    guardar()
    return inf
  }
  // La carta de recomendaciones lee los hallazgos: en el curso no se registran.
  if (ruta === `GET ${A}/hallazgos`) return []

  if (ruta === `GET ${A}/ajustes`) return hojaAjustes()
  if (ruta === `POST ${A}/ajustes`) {
    if (!s.materialidad?.aprobada) throw new ErrorDemo('No se pueden registrar ajustes sin aprobar la materialidad')
    s.ajustes.push(crearAjuste(b))
    guardar()
    return hojaAjustes()
  }
  if (/^\/ajustes\/[^/]+$/.test(path) && (metodo === 'PUT' || metodo === 'DELETE')) {
    const id = path.slice('/ajustes/'.length)
    const a = s.ajustes.find((x) => x.id === id)
    if (!a) throw new ErrorDemo('Ajuste no encontrado')
    if (metodo === 'DELETE') s.ajustes = s.ajustes.filter((x) => x.id !== id)
    else {
      if (b.descripcion !== undefined) a.descripcion = String(b.descripcion)
      if (b.cuentaCodigo !== undefined) a.cuentaCodigo = (b.cuentaCodigo as string) || null
      if (b.monto !== undefined) a.monto = String(b.monto)
      if (b.tipo !== undefined) a.tipo = b.tipo as TipoAjuste
      if (b.efecto !== undefined) a.efecto = b.efecto as EfectoAjuste
      if (b.corregido !== undefined) a.corregido = !!b.corregido
    }
    guardar()
    return hojaAjustes()
  }

  if (ruta === `GET ${A}/riesgos-respuestas`) {
    const mapa: Record<string, { papeles: number }> = {}
    for (const p of s.papeles) if (p.riesgoId) (mapa[p.riesgoId] ??= { papeles: 0 }).papeles++
    return mapa
  }
  if (metodo === 'GET' && /^\/riesgos\/[^/]+\/respuestas$/.test(path)) {
    const riesgoId = path.split('/')[2]
    const papeles = s.papeles.filter((p) => p.riesgoId === riesgoId).sort((x, y) => y.createdAt.localeCompare(x.createdAt))
    return { papeles: papeles.map((p) => ({ ...p, numTareas: 0 })) }
  }
  if (ruta === `POST ${A}/papeles`) {
    if (!s.materialidad?.aprobada) throw new ErrorDemo('No se puede ejecutar (crear papeles de trabajo) sin aprobar la materialidad')
    const titulo = String(b.titulo)
    const riesgoId = (b.riesgoId as string | undefined) ?? null
    if (riesgoId && s.papeles.some((p) => p.riesgoId === riesgoId && p.titulo === titulo)) {
      throw new ErrorDemo(`Ya existe un papel "${titulo}" para este riesgo.`)
    }
    const area = String(b.area)
    const papel: PapelDemo = {
      id: nuevoId(), auditoriaId: DEMO_AUDITORIA_ID, area,
      indice: siguienteIndice(prefijoDeArea(area), s.papeles.map((p) => p.indice)),
      titulo, riesgoId, procedimiento: (b.procedimiento as string | undefined) ?? null,
      estado: 'borrador', createdAt: ahora(),
    }
    s.papeles.push(papel)
    for (const descripcion of (b.documentosRequeridos as string[] | undefined) ?? []) {
      s.pbc.push({ id: nuevoId(), auditoriaId: DEMO_AUDITORIA_ID, papelTrabajoId: papel.id, descripcion, estado: 'solicitado', createdAt: ahora() })
    }
    guardar()
    return papel
  }
  if (metodo === 'DELETE' && /^\/papeles\/[^/]+$/.test(path)) {
    const id = path.slice('/papeles/'.length)
    s.papeles = s.papeles.filter((p) => p.id !== id)
    s.pbc = s.pbc.filter((x) => x.papelTrabajoId !== id)
    guardar()
    return { ok: true }
  }

  if (ruta === `GET ${A}/pbc`) {
    return s.pbc
      .slice()
      .sort((x, y) => y.createdAt.localeCompare(x.createdAt))
      .map((x) => {
        const papel = s.papeles.find((p) => p.id === x.papelTrabajoId)
        // Sin evidencia: en el curso no se suben archivos.
        return {
          ...x, evidenciaId: null, notas: null, fechaLimite: null,
          papelTitulo: papel?.titulo ?? null, papelArea: papel?.area ?? null, papelIndice: papel?.indice ?? null,
          evidenciaArchivoNombre: null, evidenciaArchivoTamano: null,
        }
      })
  }
  if (/^\/pbc\/[^/]+(\/recibir)?$/.test(path) && (metodo === 'POST' || metodo === 'PUT')) {
    const id = path.split('/')[2]
    const sol = s.pbc.find((x) => x.id === id)
    if (!sol) throw new ErrorDemo('Solicitud no encontrada')
    if (metodo === 'POST' && path.endsWith('/recibir')) sol.estado = 'recibido'
    else if (metodo === 'PUT' && b.estado) sol.estado = b.estado as SolicitudPbcDemo['estado']
    else throw new ErrorDemo(MENSAJE_BLOQUEADO)
    guardar()
    return sol
  }

  // Aprobaciones, IA, importación de balances, archivos, etc.: fuera del curso.
  throw new ErrorDemo(MENSAJE_BLOQUEADO)
}

/** Handler para activarApiDemo: simula una pequeña latencia como la de la red. */
export async function servidorDemo(metodo: string, path: string, cuerpo: unknown): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 120))
  try {
    // Copia profunda: los componentes nunca deben mutar el estado del "servidor".
    return JSON.parse(JSON.stringify((await responder(metodo, path, cuerpo)) ?? null))
  } catch (e) {
    // Solo las acciones del usuario: una consulta que la pestaña lanza sola no debe abrir avisos.
    if (metodo !== 'GET' && e instanceof ErrorDemo && e.message === MENSAJE_BLOQUEADO) {
      window.dispatchEvent(new CustomEvent(EVENTO_FUNCION_BLOQUEADA, { detail: { ruta: `${metodo} ${path.split('?')[0]}` } }))
    }
    throw e
  }
}

// ─── Preparar, reiniciar y verificar prácticas ───────────────────────────────

function sembrarEntendimiento() {
  const s = leer()
  if (s.entendimiento) return
  s.entendimiento = {
    id: nuevoId(), auditoriaId: DEMO_AUDITORIA_ID, ...RESPUESTAS_CASO.entendimiento,
    notas: null, sinCambios: false, confirmado: true, createdAt: ahora(),
  }
}

function sembrarCoso() {
  const s = leer()
  for (const c of RESPUESTAS_CASO.coso) {
    if (s.coso.some((x) => x.componente === c.componente)) continue
    s.coso.push({ id: nuevoId(), auditoriaId: DEMO_AUDITORIA_ID, ...c, createdAt: ahora() })
  }
}

function sembrarMaterialidad() {
  if (!leer().materialidad) guardarMaterialidad(RESPUESTAS_CASO.materialidad)
}

/** En el curso no hay usuario socio: la aprobación de la materialidad la «hace» Claudia Rendón. */
function aprobarMaterialidad() {
  const m = leer().materialidad
  if (!m || m.aprobada) return
  m.aprobada = true
  m.aprobadaAt = ahora()
}

/** Lo que la lección 4.1 deja en la hoja de ajustes (ver RESPUESTAS_CASO.ajustes). */
function sembrarAjustes() {
  const s = leer()
  if (s.ajustes.length > 0) return
  for (const a of RESPUESTAS_CASO.ajustes) s.ajustes.push(crearAjuste(a))
}

function sembrarRiesgoCosto() {
  const s = leer()
  const r = RESPUESTAS_CASO.riesgoCosto
  if (s.riesgos.some((x) => x.area === r.area)) return
  s.riesgos.push(crearRiesgo(r, 'manual'))
}

/** Lo que cada lección necesita que ya esté hecho en el encargo antes de empezar. */
const PRECONDICIONES: Record<string, (() => void)[]> = {
  '2.6': [sembrarMaterialidad],
  '2.7': [sembrarEntendimiento, sembrarCoso, sembrarMaterialidad, sembrarRiesgoCosto],
  '2.8': [sembrarEntendimiento, sembrarCoso, sembrarMaterialidad, aprobarMaterialidad, sembrarRiesgoCosto],
  '4.1': [sembrarEntendimiento, sembrarCoso, sembrarMaterialidad, aprobarMaterialidad, sembrarRiesgoCosto],
  '4.5': [sembrarEntendimiento, sembrarCoso, sembrarMaterialidad, aprobarMaterialidad, sembrarRiesgoCosto, sembrarAjustes],
}

/** Lo que la práctica de cada lección crea (se borra al reiniciarla). */
const LIMPIEZA: Record<string, (s: EstadoDemo) => void> = {
  '1.7': (s) => { s.informes = s.informes.filter((i) => i.tipo !== 'carta_encargo') },
  '2.2': (s) => { s.entendimiento = null },
  '2.3': (s) => { s.coso = [] },
  '2.4': (s) => { s.riesgos = s.riesgos.filter((r) => r.origen !== 'analitico') },
  '2.5': (s) => { s.materialidad = null },
  '2.6': (s) => { s.riesgos = s.riesgos.filter((r) => r.area !== 'costo_de_ventas') },
  '2.7': (s) => { s.informes = s.informes.filter((i) => i.tipo !== 'memo_planeacion') },
  '2.8': (s) => { s.papeles = []; s.pbc = [] },
  '4.1': (s) => { s.ajustes = [] },
  '4.5': (s) => { s.informes = s.informes.filter((i) => i.tipo !== 'dictamen') },
}

/** Asegura las precondiciones de la lección. Devuelve si cambió algo del encargo. */
export function prepararLeccion(leccionId: string): boolean {
  const antes = JSON.stringify(leer())
  for (const paso of PRECONDICIONES[leccionId] ?? []) paso()
  guardar()
  return JSON.stringify(leer()) !== antes
}

export function reiniciarLeccion(leccionId: string) {
  LIMPIEZA[leccionId]?.(leer())
  prepararLeccion(leccionId)
}

const cumple = (ok: boolean, mensaje: string) => ({ ok, mensaje })

const VERIFICADORES: Record<CriterioPractica, (s: EstadoDemo) => VerificacionPractica['criterios']> = {
  carta_encargo: (s) => [cumple(s.informes.some((i) => i.tipo === 'carta_encargo'), 'La carta de encargo está generada en el encargo')],
  memo_planeacion: (s) => [cumple(s.informes.some((i) => i.tipo === 'memo_planeacion'), 'El memo de planeación está generado en el encargo')],
  entendimiento: (s) => [
    cumple(!!s.entendimiento?.cambiosSignificativos?.trim(), 'Registraste los cambios significativos del período'),
    cumple(!!s.entendimiento?.confirmado, 'Confirmaste el entendimiento'),
  ],
  coso_actividades: (s) => {
    const c = s.coso.find((x) => x.componente === 'actividades_control')
    return [
      cumple(!!c, 'Evaluaste el componente «Actividades de control»'),
      cumple(!!c && c.calificacion !== 'efectivo', 'Lo calificaste con deficiencias (no hay segregación de funciones)'),
      cumple(!!c?.observaciones?.trim(), 'Dejaste la observación que soporta la calificación'),
    ]
  },
  riesgo_analitico: (s) => {
    const filas = s.riesgos.filter((r) => r.origen === 'analitico')
    return [
      cumple(filas.length > 0, 'Llevaste a la matriz al menos un riesgo desde la analítica del balance'),
      cumple(
        filas.some((f) => f.area === 'inventarios' || f.area === 'costo_de_ventas'),
        'Uno de ellos es el de inventarios o costo de ventas (la variación que no cuadra)',
      ),
    ]
  },
  materialidad: (s) => {
    const m = s.materialidad
    const pct = m ? Number(m.porcentaje) : 0
    const desemp = m ? Number(m.porcentajeDesempeno) : 0
    const base = m ? Number(m.montoBase) : 0
    const ingresos = RESPUESTAS_CASO.materialidad.montoBase
    return [
      cumple(!!m, 'Guardaste la materialidad en el encargo'),
      cumple(m?.baseCalculo === 'ingresos', 'Usaste los ingresos como base (la utilidad es volátil)'),
      cumple(Math.abs(base - ingresos) <= ingresos * 0.01, 'El monto de la base son los ingresos del balance (1.000 M)'),
      cumple(pct >= 0.5 && pct <= 1, 'El porcentaje está entre 0,5 % y 1 % de los ingresos'),
      cumple(desemp >= 50 && desemp <= 75, 'La materialidad de ejecución está entre 50 % y 75 % de la global'),
    ]
  },
  riesgo_costo: (s) => {
    const filas = s.riesgos.filter((r) => r.area === 'costo_de_ventas')
    const alto = filas.find((r) => r.riesgoCombinado === 'alto')
    return [
      cumple(filas.length > 0, 'Registraste un riesgo en el área Costo de ventas'),
      cumple(!!alto, 'Su nivel combinado es Alto (riesgo significativo)'),
      cumple(!!alto?.respuestaPlaneada?.trim(), 'Tiene la respuesta planeada (la prueba que lo atiende)'),
    ]
  },
  pruebas_costo: (s) => {
    const riesgos = new Set(s.riesgos.filter((r) => r.area === 'costo_de_ventas').map((r) => r.id))
    const papeles = s.papeles.filter((p) => p.riesgoId && riesgos.has(p.riesgoId))
    const conciliacion = papeles.find((p) => /k[aá]rdex/i.test(p.titulo))
    const pbc = s.pbc.filter((x) => papeles.some((p) => p.id === x.papelTrabajoId))
    return [
      cumple(papeles.length > 0, 'Diseñaste al menos una prueba (papel) que responde al riesgo del costo de ventas'),
      cumple(!!conciliacion, 'Una de ellas concilia el kárdex con el costo: es la que prueba la integridad'),
      cumple(pbc.length > 0, 'Las pruebas generaron la lista de documentos para el cliente'),
      cumple(pbc.some((x) => x.estado === 'recibido' && /k[aá]rdex/i.test(x.descripcion)), 'Marcaste como recibido el kárdex en «Documentos»'),
    ]
  },
  hoja_ajustes: (s) => {
    const cerca = (a: AjusteDemo, valor: number) => Math.abs(Math.abs(Number(a.monto)) - valor) <= valor * 0.01
    const pendiente = (valor: number) => s.ajustes.find((a) => !a.corregido && a.efecto !== 'reclasificacion' && cerca(a, valor))
    const deterioro = pendiente(25_000_000)
    const { evaluacion } = hojaAjustes()
    return [
      cumple(!!pendiente(105_000_000), 'Registraste el costo de ventas omitido (105 M) sin corregir'),
      cumple(!!deterioro, 'Registraste el deterioro de Comercial Andina (25 M) sin corregir'),
      cumple(deterioro?.tipo === 'juicio', 'Clasificaste el deterioro como incorrección de juicio'),
      cumple(!!pendiente(3_000_000), 'Registraste la depreciación omitida (3 M) sin corregir'),
      cumple(s.ajustes.some((a) => a.corregido && cerca(a, 8_000_000)), 'Registraste el corte de ventas (8 M) y lo marcaste como corregido'),
      cumple(evaluacion.opinionSugerida === 'negativa', 'La hoja suma 133 M sin corregir y sugiere opinión negativa'),
    ]
  },
  dictamen: (s) => {
    const d = s.informes.find((i) => i.tipo === 'dictamen')
    const fundamento = (d?.contenido.fundamento_opinion ?? '').replace(/<[^>]+>/g, ' ')
    return [
      cumple(!!d, 'Generaste el dictamen en el encargo'),
      cumple(d?.tipoOpinion === 'negativa', 'La opinión es negativa (desfavorable): incorrecciones materiales y generalizadas'),
      cumple(!!d && !fundamento.includes('[Describa'), 'Reemplazaste el texto de ejemplo del fundamento'),
      cumple(/costo/i.test(fundamento) && /133/.test(fundamento), 'El fundamento dice qué no se corrigió (el costo de ventas) y cuánto suma (133 M)'),
    ]
  },
}

export function verificarPractica(criterio: CriterioPractica): VerificacionPractica {
  const criterios = VERIFICADORES[criterio](leer())
  return { completa: criterios.every((c) => c.ok), criterios }
}
