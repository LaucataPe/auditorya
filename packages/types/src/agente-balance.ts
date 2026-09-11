/**
 * Corrida del procedimiento "Validación del balance de prueba" — lógica PURA y
 * determinista (0 tokens). Implementa la primera tanda de reglas del documento
 * docs/agente/procedimiento-validacion-balance-v1.md reutilizando las funciones
 * que ya existían (validarBalance, detectarBanderas) y añadiendo naturaleza,
 * cuentas bolsa y variaciones. Devuelve BORRADORES de propuesta con bitácora;
 * el backend los persiste. Nunca redacta prosa interpretativa: eso es del LLM.
 */
import type { CuentaImport } from './balance'
import { esClaseBalance, type BasesMaterialidad } from './balance'
import { validarBalance } from './mapeo-balance'
import { detectarBanderas } from './analitica'
import { naturalezaPuc } from './puc-naturaleza'
import { nombrePuc } from './parse-balance'
import type {
  CertezaPropuesta, ContenidoPropuesta, DatoPropuesta, LineaBitacora, SeveridadPropuesta, TipoPropuesta,
} from './agente'

export type EntradaCorridaBalance = {
  archivoNombre: string | null
  /** Todas las filas del balance (resumen + terceros), como se importaron. */
  filas: CuentaImport[]
  /** Comparativo del año anterior (nivel resumen). Vacío si no se cargó. */
  comparativo: { codigo: string; saldo: number }[]
  materialidad: { monto: number; desempeno: number; aprobada: boolean } | null
  bases: BasesMaterialidad
  periodo: { desde: string | null; hasta: string | null }
  /** Números ya usados en corridas anteriores del encargo (los códigos H-/D-/A- continúan, nunca se repiten). */
  numeracion?: { H?: number; D?: number; A?: number }
  /** Huellas (tipo|reglas|cuenta) ya decididas por una persona en corridas anteriores: no se vuelven a proponer. */
  huellasDecididas?: string[]
}

/** Identidad estable de una propuesta entre corridas: mismo tipo, reglas y cuenta. */
export function huellaPropuesta(p: { tipo: string; reglas: string[]; cuentaCodigo: string | null }): string {
  return `${p.tipo}|${[...p.reglas].sort().join(',')}|${p.cuentaCodigo ?? ''}`
}

type LineaBorrador = Omit<LineaBitacora, 'numero' | 'actor'> & { actor?: 'agente' }

export type PropuestaBorrador = {
  /** Identificador temporal dentro de la corrida (para ligar documentos a hallazgos). */
  clave: string
  paso: string
  tipo: TipoPropuesta
  codigo: string | null
  titulo: string
  cuentaCodigo: string | null
  monto: number | null
  severidad: SeveridadPropuesta | null
  certeza: CertezaPropuesta | null
  reglas: string[]
  datos: DatoPropuesta[]
  contenido: ContenidoPropuesta
  desbloqueaClave: string | null
  orden: number
  bitacora: LineaBorrador[]
}

export type ResultadoCorridaBalance = {
  propuestas: PropuestaBorrador[]
  bitacora: LineaBorrador[]
  resumen: {
    filas: number
    filasHoja: number
    filasResumen: number
    terceros: number
    convencion: 'natural' | 'firmada' | 'ambigua'
    materialidad: { monto: number; desempeno: number; trivial: number; origen: 'aprobada' | 'calculada' | 'preliminar' | 'ninguna' }
    reglasEjecutadas: string[]
    limitaciones: { regla: string; motivo: string }[]
    /** Señales por debajo del umbral trivial que no se reportan individualmente. */
    triviales: number
    /** Propuestas de naturaleza que quedaron fuera del tope de ruido. */
    recortadas: number
  }
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

const fmt = (n: number) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Math.round(n))
const pct = (n: number) => `${Math.round(n)} %`

export const UMBRALES_BALANCE = {
  variacionPct: 30,
  desempenoPct: 75,
  trivialPct: 5,
  topeNaturaleza: 15,
  topeVariaciones: 12,
} as const

type Escalador = 'efectivo' | 'partes_relacionadas' | 'impuestos' | 'fraude' | 'legal' | 'resultado'

const ORDEN_SEV: SeveridadPropuesta[] = ['baja', 'media', 'alta']

function subir(s: SeveridadPropuesta): SeveridadPropuesta {
  return ORDEN_SEV[Math.min(ORDEN_SEV.indexOf(s) + 1, 2)]
}

/** §4: severidad por monto contra M / MD / T, con escaladores (+1, tope alto). */
export function severidadPorMonto(
  monto: number,
  m: { monto: number; desempeno: number; trivial: number } | null,
  escaladores: Escalador[] = [],
): { severidad: SeveridadPropuesta | 'trivial'; explicacion: string } {
  const abs = Math.abs(monto)
  if (!m) {
    return { severidad: 'media', explicacion: 'Sin materialidad definida: severidad media provisional.' }
  }
  let sev: SeveridadPropuesta | 'trivial'
  let base: string
  if (abs >= m.monto) { sev = 'alta'; base = `monto ≥ materialidad (${(abs / m.monto).toFixed(2)}x)` }
  else if (abs >= m.desempeno) { sev = 'media'; base = 'monto ≥ materialidad de desempeño' }
  else if (abs >= m.trivial) { sev = 'baja'; base = 'monto ≥ umbral de partidas triviales' }
  else { return { severidad: 'trivial', explicacion: 'monto por debajo del umbral de partidas triviales' } }
  const aplicados: Escalador[] = []
  for (const e of escaladores) {
    if (sev !== 'alta') { sev = subir(sev); aplicados.push(e) }
  }
  const extra = aplicados.length ? ` · escalador ${aplicados.join(', ')} (+1)` : ''
  return { severidad: sev, explicacion: `${base}${extra}` }
}

function esHojaFactory(codigosResumen: string[]) {
  const set = new Set(codigosResumen)
  // Una cuenta es hoja si ninguna otra cuenta de resumen empieza por su código.
  const prefijos = new Set<string>()
  for (const c of codigosResumen) for (let l = 1; l < c.length; l++) if (set.has(c.slice(0, l))) prefijos.add(c.slice(0, l))
  return (codigo: string) => !prefijos.has(codigo)
}

// ─── Corrida ─────────────────────────────────────────────────────────────────

export function correrValidacionBalance(entrada: EntradaCorridaBalance): ResultadoCorridaBalance {
  const bit: LineaBorrador[] = []
  const propuestas: PropuestaBorrador[] = []
  const limitaciones: { regla: string; motivo: string }[] = []
  const reglas = new Set<string>()
  let triviales = 0
  let recortadas = 0

  const filas = entrada.filas
  const resumen = filas.filter((f) => !f.tercero)
  const terceros = filas.length - resumen.length
  const esHoja = esHojaFactory(resumen.map((r) => r.codigo))
  // Una tarjeta por cuenta: si el archivo trae el mismo código repetido (V-05 lo reporta), aquí se toma una sola vez.
  const vistas = new Set<string>()
  const hojas = resumen.filter((r) => esHoja(r.codigo) && !vistas.has(r.codigo) && vistas.add(r.codigo))

  bit.push({
    tipo: 'lectura',
    texto: `Leí ${entrada.archivoNombre ?? 'el balance importado'}: ${fmt(filas.length)} filas; ${fmt(resumen.length)} de resumen (${fmt(hojas.length)} hoja) y ${fmt(terceros)} por tercero.`,
    referencia: { paso: 'P-02' },
  })

  // P-03 convención de signos: mayoría de saldos en clases 2, 3 y 4.
  const cred = resumen.filter((r) => ['2', '3', '4'].includes(r.codigo.charAt(0)) && r.saldoActual !== 0)
  const negativos = cred.filter((r) => r.saldoActual < 0).length
  const convencion: 'natural' | 'firmada' | 'ambigua' =
    cred.length === 0 ? 'natural' : negativos / cred.length >= 0.7 ? 'firmada' : negativos / cred.length <= 0.3 ? 'natural' : 'ambigua'
  bit.push({
    tipo: 'regla',
    texto: convencion === 'firmada'
      ? `Convención de signos firmada (crédito negativo): ${negativos} de ${cred.length} saldos de clases 2, 3 y 4 son negativos. Normalicé a saldo natural.`
      : convencion === 'natural'
        ? `Convención de signos natural: ${cred.length - negativos} de ${cred.length} saldos de clases 2, 3 y 4 son positivos. Un saldo negativo es contrario a su naturaleza.`
        : `Convención de signos ambigua: ${negativos} de ${cred.length} saldos de clases 2, 3 y 4 son negativos. Asumí convención natural y lo dejé como pregunta.`,
    referencia: { paso: 'P-03' },
  })
  if (convencion === 'ambigua') {
    propuestas.push({
      clave: 'A-signos', paso: 'balance', tipo: 'ambiguedad', codigo: null,
      titulo: 'No pude determinar la convención de signos del archivo',
      cuentaCodigo: null, monto: null, severidad: null, certeza: null, reglas: ['P-03'],
      datos: [{ etiqueta: 'Negativos en 2/3/4', valor: `${negativos} de ${cred.length}` }],
      contenido: {
        descripcion: 'Los saldos de pasivo, patrimonio e ingresos vienen mezclados en signo. Mientras tanto asumí que un saldo negativo es contrario a la naturaleza de la cuenta.',
        para: 'Define cómo leer los signos: afecta todas las reglas de naturaleza (V-20 a V-26).',
        opciones: [{ clave: 'natural', label: 'Negativo = contrario a la naturaleza' }, { clave: 'firmada', label: 'Crédito negativo, débito positivo' }],
      },
      desbloqueaClave: null, orden: 0, bitacora: [{ tipo: 'regla', texto: `Aplicué P-03: ${negativos} de ${cred.length} saldos de clases 2, 3 y 4 en negativo; sin mayoría clara.`, referencia: { paso: 'P-03' } }],
    })
  }
  const natural = (r: CuentaImport): number => {
    if (convencion !== 'firmada') return r.saldoActual
    const n = naturalezaPuc(r.codigo)?.naturaleza
    return n === 'credito' ? -r.saldoActual : r.saldoActual
  }

  // P-07 materialidad.
  let m: { monto: number; desempeno: number; trivial: number } | null = null
  let origenM: ResultadoCorridaBalance['resumen']['materialidad']['origen'] = 'ninguna'
  if (entrada.materialidad) {
    m = { monto: entrada.materialidad.monto, desempeno: entrada.materialidad.desempeno, trivial: entrada.materialidad.monto * (UMBRALES_BALANCE.trivialPct / 100) }
    origenM = entrada.materialidad.aprobada ? 'aprobada' : 'calculada'
    bit.push({ tipo: 'lectura', texto: `Usé la materialidad ${origenM} del encargo: ${fmt(m.monto)} (desempeño ${fmt(m.desempeno)}, triviales ${fmt(m.trivial)}).`, referencia: { paso: 'P-07', norma: 'NIA 320' } })
  } else {
    const b = entrada.bases
    let base: ContenidoPropuesta['materialidad'] | null = null
    if (b.utilidad_antes_impuestos && b.utilidad_antes_impuestos > 0) {
      base = { baseCalculo: 'utilidad_antes_impuestos', montoBase: b.utilidad_antes_impuestos, porcentaje: 5, porcentajeDesempeno: 75, materialidad: 0, materialidadDesempeno: 0, justificacion: 'Operación con utilidad: 5 % de la utilidad antes de impuestos (práctica común bajo NIA 320).' }
    } else if (b.ingresos && b.ingresos > 0) {
      base = { baseCalculo: 'ingresos', montoBase: b.ingresos, porcentaje: 1, porcentajeDesempeno: 75, materialidad: 0, materialidadDesempeno: 0, justificacion: 'Sin utilidad estable: 1 % de los ingresos (práctica común bajo NIA 320).' }
    } else if (b.activos && b.activos > 0) {
      base = { baseCalculo: 'activos', montoBase: b.activos, porcentaje: 1, porcentajeDesempeno: 75, materialidad: 0, materialidadDesempeno: 0, justificacion: 'Sin ingresos ni utilidad: 1 % de los activos totales.' }
    }
    if (base) {
      base.materialidad = base.montoBase * (base.porcentaje / 100)
      base.materialidadDesempeno = base.materialidad * (base.porcentajeDesempeno / 100)
      m = { monto: base.materialidad, desempeno: base.materialidadDesempeno, trivial: base.materialidad * (UMBRALES_BALANCE.trivialPct / 100) }
      origenM = 'preliminar'
      bit.push({ tipo: 'clasificacion', texto: `Propuse materialidad preliminar: ${base.porcentaje} % de ${base.baseCalculo.replace(/_/g, ' ')} (${fmt(base.montoBase)}) = ${fmt(base.materialidad)}. Clasifico con ella hasta que el socio la confirme.`, referencia: { paso: 'P-07', norma: 'NIA 320' } })
      propuestas.push({
        clave: 'M-01', paso: 'materialidad', tipo: 'materialidad', codigo: 'M-01',
        titulo: `Confirmar la materialidad propuesta: ${fmt(base.materialidad)}`,
        cuentaCodigo: null, monto: base.materialidad, severidad: null, certeza: null, reglas: ['P-07'],
        datos: [
          { etiqueta: 'Base', valor: `${base.baseCalculo.replace(/_/g, ' ')} ${fmt(base.montoBase)}` },
          { etiqueta: 'Porcentaje', valor: `${base.porcentaje} %` },
          { etiqueta: 'Materialidad', valor: fmt(base.materialidad) },
          { etiqueta: 'De desempeño', valor: `${fmt(base.materialidadDesempeno)} (75 %)` },
        ],
        contenido: {
          descripcion: base.justificacion,
          norma: 'NIA 320 · La materialidad es un juicio del auditor; el porcentaje es una práctica de referencia, no una regla.',
          para: 'Mientras no la confirmes, todos los hallazgos se clasifican con esta cifra y su bitácora lo dice.',
          materialidad: base,
        },
        desbloqueaClave: null, orden: 0,
        bitacora: [
          { tipo: 'lectura', texto: `Calculé las bases desde el balance: activos ${fmt(b.activos ?? 0)}, ingresos ${fmt(b.ingresos ?? 0)}, UAI ${fmt(b.utilidad_antes_impuestos ?? 0)}, patrimonio ${fmt(b.patrimonio ?? 0)}.`, referencia: { paso: 'P-07' } },
          { tipo: 'clasificacion', texto: base.justificacion, referencia: { paso: 'P-07', norma: 'NIA 320' } },
        ],
      })
    } else {
      bit.push({ tipo: 'lectura', texto: 'No hay materialidad ni bases positivas para proponer una: las reglas por monto quedan con severidad media provisional.', referencia: { paso: 'P-07' } })
    }
  }
  const mUsada = m ? { ...m, origen: origenM } : { monto: 0, desempeno: 0, trivial: 0, origen: 'ninguna' as const }

  const clasificar = (monto: number, escaladores: Escalador[]) => severidadPorMonto(monto, m, escaladores)

  // ── Bloque A · integridad (reutiliza validarBalance) ──
  const V_INTEGRIDAD: Record<string, { id: string; sev: SeveridadPropuesta; documento: string | null }> = {
    partida_doble: { id: 'V-01', sev: 'alta', documento: 'Balance completo o corregido del sistema contable' },
    ecuacion_patrimonial: { id: 'V-02', sev: 'alta', documento: 'Balance completo' },
    jerarquia: { id: 'V-03', sev: 'alta', documento: 'Balance completo (suele ser archivo truncado o filtrado)' },
    ecuacion_fila: { id: 'V-04', sev: 'media', documento: 'Reexportar el balance' },
    duplicados: { id: 'V-05', sev: 'media', documento: 'Reexportar el balance' },
  }
  const val = validarBalance(filas.map((f) => ({ ...f, saldoActual: natural(f) })))
  for (const k of Object.keys(V_INTEGRIDAD)) reglas.add(V_INTEGRIDAD[k].id)
  bit.push({ tipo: 'regla', texto: `Apliqué V-01 a V-05 (partida doble, ecuación patrimonial, jerarquía, ecuación por fila, duplicados): ${val.problemas.length === 0 ? 'sin diferencias' : `${val.problemas.length} señal(es)`}.`, referencia: { regla: 'V-01..V-05', norma: 'NIA 500' } })
  for (const p of val.problemas) {
    const def = V_INTEGRIDAD[p.clave]
    if (!def) continue
    propuestas.push({
      clave: def.id, paso: 'balance', tipo: 'hallazgo', codigo: null,
      titulo: p.titulo, cuentaCodigo: null, monto: null, severidad: def.sev, certeza: 'verificado',
      reglas: [def.id], datos: [{ etiqueta: 'Regla', valor: def.id }, { etiqueta: 'Nivel', valor: p.nivel === 'error' ? 'Error' : 'Advertencia' }],
      contenido: { descripcion: p.detalle, norma: 'NIA 500 · NIA 230. La integridad aritmética del balance es condición para cualquier procedimiento posterior.', para: undefined },
      desbloqueaClave: null, orden: 0,
      bitacora: [
        { tipo: 'regla', texto: `Apliqué ${def.id} sobre ${fmt(resumen.length)} cuentas de resumen.`, referencia: { regla: def.id } },
        { tipo: 'clasificacion', texto: `Severidad ${def.sev.toUpperCase()}: regla de integridad (severidad fija, no depende del monto).`, referencia: { regla: def.id } },
      ],
    })
  }

  // ── Bloque B · naturaleza (V-20 a V-26) ──
  type DefNat = { id: string; titulo: (n: string) => string; sev: 'monto' | SeveridadPropuesta; esc: Escalador[]; documento: string | null; norma: string; descripcion: string }
  const defNat = (codigo: string): DefNat => {
    const c4 = codigo.slice(0, 4), c2 = codigo.slice(0, 2)
    if (['1105', '1110', '1120'].includes(c4)) return { id: 'V-21', titulo: (n) => `Saldo crédito en ${n.toLowerCase()}`, sev: 'alta', esc: ['efectivo'], documento: 'Extracto bancario y conciliación del mes de corte', norma: 'NIA 315 · NIIF PYMES §11', descripcion: 'La cuenta de efectivo presenta saldo crédito. Corresponde a un sobregiro no reclasificado (→ 2105) o a retiros registrados sin ingreso previo.' }
    if (c4 === '1305') return { id: 'V-22', titulo: () => 'Clientes con saldo crédito', sev: 'monto', esc: [], documento: 'Auxiliar de cartera por tercero', norma: 'NIIF PYMES §11 · §23', descripcion: 'Saldo crédito en clientes: anticipos recibidos de clientes mal clasificados (→ 2805) o notas crédito aplicadas sin factura.' }
    if (['2205', '2335'].includes(c4)) return { id: 'V-23', titulo: (n) => `${n} con saldo débito`, sev: 'monto', esc: [], documento: 'Auxiliar de proveedores / cuentas por pagar', norma: 'NIIF PYMES §11', descripcion: 'Saldo débito en una cuenta por pagar: anticipos a proveedores (→ 1330) o pagos duplicados.' }
    if (['2365', '2367', '2368', '2404', '2408', '2412'].includes(c4)) return { id: 'V-24', titulo: (n) => `${n} con saldo débito`, sev: 'media', esc: ['impuestos'], documento: 'Declaraciones del período (300, 350) y recibos de pago', norma: 'Estatuto Tributario · NIIF PYMES §29', descripcion: 'Impuesto por pagar con saldo débito: pagos en exceso, saldo a favor sin reclasificar a 1355, o retenciones mal causadas.' }
    if (c2 === '25') return { id: 'V-25', titulo: (n) => `${n} con saldo débito`, sev: 'media', esc: [], documento: 'Liquidación de nómina / PILA', norma: 'NIIF PYMES §28', descripcion: 'Obligación laboral con saldo débito: pagos de prestaciones sin causación previa.' }
    if (['36', '37'].includes(c2)) return { id: 'V-26', titulo: (n) => `${n} con signo contrario`, sev: 'media', esc: ['legal'], documento: 'Acta de asamblea de distribución de resultados', norma: 'Código de Comercio · NIIF PYMES §6', descripcion: 'Resultados con signo contrario al esperado: posible distribución o apropiación registrada sin acta.' }
    return { id: 'V-20', titulo: (n) => `Saldo contrario a la naturaleza en ${n}`, sev: 'monto', esc: [], documento: null, norma: 'PUC Decreto 2650 · NIA 315', descripcion: 'La cuenta presenta saldo contrario a su naturaleza. Puede ser error de clasificación, registro indebido o una cuenta puente pendiente de cerrar.' }
  }
  const contrarios = hojas
    .map((h) => ({ h, saldo: natural(h), nat: naturalezaPuc(h.codigo) }))
    .filter((x) => x.nat !== null && x.saldo < 0)
    .sort((a, b) => Math.abs(a.saldo) - Math.abs(b.saldo))
    .reverse()
  reglas.add('V-20')
  bit.push({ tipo: 'regla', texto: `Apliqué V-20 (naturaleza por cuenta PUC) sobre ${fmt(hojas.length)} cuentas hoja: ${contrarios.length} con saldo contrario.`, referencia: { regla: 'V-20', norma: 'PUC Decreto 2650' } })
  let emitidasNat = 0
  const padreDe = (codigo: string) => resumen.find((r) => r.codigo === codigo.slice(0, 4) && r.codigo !== codigo)
  for (const { h, saldo } of contrarios) {
    const def = defNat(h.codigo)
    reglas.add(def.id)
    const cls = def.sev === 'monto' ? clasificar(saldo, def.esc) : { severidad: def.sev, explicacion: `severidad fija de ${def.id}` }
    if (cls.severidad === 'trivial') { triviales++; continue }
    if (emitidasNat >= UMBRALES_BALANCE.topeNaturaleza) { recortadas++; continue }
    emitidasNat++
    const nombre = h.nombre ?? nombrePuc(h.codigo) ?? h.codigo
    const padre = padreDe(h.codigo)
    const datos: DatoPropuesta[] = [
      { etiqueta: 'Saldo', valor: fmt(saldo) },
      { etiqueta: 'Naturaleza esperada', valor: naturalezaPuc(h.codigo)!.naturaleza === 'debito' ? 'Débito' : 'Crédito' },
    ]
    if (m) datos.push({ etiqueta: 'Materialidad', valor: fmt(m.monto) })
    if (padre) datos.push({ etiqueta: `Grupo ${padre.codigo}`, valor: fmt(natural(padre)) })
    const bitac: LineaBorrador[] = [
      { tipo: 'regla', texto: `Apliqué V-20 sobre ${fmt(hojas.length)} cuentas hoja: ${h.codigo} tiene saldo ${fmt(saldo)} y su naturaleza es ${naturalezaPuc(h.codigo)!.naturaleza}.`, referencia: { regla: 'V-20' } },
    ]
    if (def.id !== 'V-20') bitac.push({ tipo: 'regla', texto: `La cuenta pertenece al grupo de ${def.id}: ${def.descripcion}`, referencia: { regla: def.id, norma: def.norma } })
    if (padre) bitac.push({ tipo: 'contraste', texto: `El grupo ${padre.codigo} ${padre.nombre ?? ''} suma ${fmt(natural(padre))} en neto${natural(padre) >= 0 ? ', así que el signo contrario está en la subcuenta, no en el grupo' : ' y también es contrario'}.`, referencia: { paso: 'P-02' } })
    bitac.push({ tipo: 'clasificacion', texto: `Severidad ${String(cls.severidad).toUpperCase()}: ${cls.explicacion}.`, referencia: { regla: def.id } })
    propuestas.push({
      clave: `${def.id}:${h.codigo}`, paso: 'balance', tipo: 'hallazgo', codigo: null,
      titulo: `${h.codigo} · ${def.titulo(nombre)}`, cuentaCodigo: h.codigo, monto: saldo,
      severidad: cls.severidad as SeveridadPropuesta, certeza: 'verificado', reglas: def.id === 'V-20' ? ['V-20'] : ['V-20', def.id],
      datos, contenido: { descripcion: def.descripcion, norma: def.norma, para: def.documento ? `Con "${def.documento}" confirmo la causa; el hallazgo se aprueba con lo que ya se ve.` : undefined },
      desbloqueaClave: null, orden: 0, bitacora: bitac,
    })
    if (def.documento) {
      propuestas.push({
        clave: `D:${def.id}:${h.codigo}`, paso: 'pbc', tipo: 'documento', codigo: null,
        titulo: def.documento, cuentaCodigo: h.codigo, monto: null, severidad: null, certeza: null, reglas: [def.id],
        datos: [{ etiqueta: 'Cuenta', valor: `${h.codigo} ${nombre}` }, { etiqueta: 'Saldo', valor: fmt(saldo) }],
        contenido: { descripcion: `Lo necesito para determinar la causa del saldo contrario en ${h.codigo}.`, para: '' },
        desbloqueaClave: `${def.id}:${h.codigo}`, orden: 0,
        bitacora: [{ tipo: 'solicitud', texto: `Pedí "${def.documento}" para resolver el hallazgo de ${h.codigo}.`, referencia: { regla: def.id } }],
      })
    }
  }
  if (recortadas > 0) bit.push({ tipo: 'clasificacion', texto: `Recorté ${recortadas} cuentas con saldo contrario de menor monto para no saturar; siguen en el resumen de la corrida.`, referencia: { regla: 'V-20' } })

  // ── Bloque D · cuentas bolsa (V-40) ──
  const BOLSA = ['1380', '2380', '4295', '5195', '5295', '5395']
  reglas.add('V-40')
  let bolsas = 0
  for (const r of resumen.filter((r) => r.codigo.length === 4 && BOLSA.includes(r.codigo))) {
    const saldo = Math.abs(natural(r))
    if (!m || saldo <= m.desempeno) continue
    bolsas++
    const cls = clasificar(saldo, ['fraude'])
    if (cls.severidad === 'trivial') continue
    const nombre = r.nombre ?? nombrePuc(r.codigo) ?? r.codigo
    propuestas.push({
      clave: `V-40:${r.codigo}`, paso: 'balance', tipo: 'hallazgo', codigo: null,
      titulo: `${r.codigo} · ${nombre}: cuenta bolsa por encima de la materialidad de desempeño`,
      cuentaCodigo: r.codigo, monto: saldo, severidad: cls.severidad as SeveridadPropuesta, certeza: 'requiere_evidencia', reglas: ['V-40'],
      datos: [{ etiqueta: 'Saldo', valor: fmt(saldo) }, { etiqueta: 'Umbral (MD)', valor: fmt(m.desempeno) }],
      contenido: { descripcion: 'Las cuentas "diversos" y "varios" absorben lo que nadie clasificó. Con este saldo, hace falta ver qué contiene.', norma: 'NIA 240 · NIA 500', para: 'Con el auxiliar de la cuenta reclasifico o cierro el hallazgo.' },
      desbloqueaClave: null, orden: 0,
      bitacora: [
        { tipo: 'regla', texto: `Apliqué V-40 sobre las cuentas bolsa (1380, 2380, 4295, 5195, 5295, 5395): ${r.codigo} suma ${fmt(saldo)} y supera MD ${fmt(m.desempeno)}.`, referencia: { regla: 'V-40', norma: 'NIA 240' } },
        { tipo: 'clasificacion', texto: `Severidad ${String(cls.severidad).toUpperCase()}: ${cls.explicacion}.`, referencia: { regla: 'V-40' } },
        { tipo: 'solicitud', texto: 'Sin el auxiliar no puedo decir qué contiene: requiere evidencia.', referencia: { regla: 'V-40' } },
      ],
    })
    propuestas.push({
      clave: `D:V-40:${r.codigo}`, paso: 'pbc', tipo: 'documento', codigo: null,
      titulo: `Auxiliar detallado de la cuenta ${r.codigo} ${nombre}`, cuentaCodigo: r.codigo, monto: null, severidad: null, certeza: null, reglas: ['V-40'],
      datos: [{ etiqueta: 'Saldo', valor: fmt(saldo) }], contenido: { descripcion: 'Detalle de los registros que componen el saldo al corte.', para: '' },
      desbloqueaClave: `V-40:${r.codigo}`, orden: 0,
      bitacora: [{ tipo: 'solicitud', texto: `Pedí el auxiliar de ${r.codigo} para resolver el hallazgo de cuenta bolsa.`, referencia: { regla: 'V-40' } }],
    })
  }
  bit.push({ tipo: 'regla', texto: m ? `Apliqué V-40 (cuentas bolsa): ${bolsas} por encima de la materialidad de desempeño.` : 'V-40 (cuentas bolsa) necesita materialidad: sin ella no se evaluó.', referencia: { regla: 'V-40' } })
  if (!m) limitaciones.push({ regla: 'V-40', motivo: 'Sin materialidad no hay umbral para las cuentas bolsa.' })

  // ── Bloque G · variaciones contra comparativo (V-70 a V-73) ──
  const compMap = new Map(entrada.comparativo.map((c) => [c.codigo, c.saldo]))
  if (entrada.comparativo.length > 0 && m) {
    for (const id of ['V-70', 'V-71', 'V-72', 'V-73']) reglas.add(id)
    const nivel4 = resumen.filter((r) => r.codigo.length === 4)
    type Var = { r: CuentaImport; actual: number; base: number; id: string; titulo: string; delta: number; pctv: number | null }
    const vars: Var[] = []
    for (const r of nivel4) {
      const actual = natural(r)
      const base = compMap.get(r.codigo) ?? 0
      const delta = actual - base
      if (Math.abs(delta) < m.trivial) { if (delta !== 0) triviales++; continue }
      const nombre = r.nombre ?? nombrePuc(r.codigo) ?? r.codigo
      if (base === 0 && actual !== 0) { if (Math.abs(actual) >= m.desempeno) vars.push({ r, actual, base, delta, pctv: null, id: 'V-72', titulo: `${r.codigo} · ${nombre}: cuenta nueva con saldo material` }); continue }
      if (actual === 0 && base !== 0) { if (Math.abs(base) >= m.desempeno) vars.push({ r, actual, base, delta, pctv: null, id: 'V-73', titulo: `${r.codigo} · ${nombre}: cuenta con saldo el año anterior, hoy en cero` }); continue }
      const pctv = (delta / Math.abs(base)) * 100
      if (Math.sign(actual) !== Math.sign(base)) { vars.push({ r, actual, base, delta, pctv, id: 'V-71', titulo: `${r.codigo} · ${nombre}: cambió de signo frente al año anterior` }); continue }
      if (Math.abs(pctv) >= UMBRALES_BALANCE.variacionPct) vars.push({ r, actual, base, delta, pctv, id: 'V-70', titulo: `${r.codigo} · ${nombre}: variación de ${pct(pctv)} frente al año anterior` })
    }
    // Cuentas del comparativo que hoy no existen.
    for (const [codigo, saldo] of compMap) {
      if (codigo.length !== 4 || nivel4.some((r) => r.codigo === codigo) || Math.abs(saldo) < m.desempeno) continue
      vars.push({ r: { codigo, nombre: nombrePuc(codigo), nivel: 4, tercero: null, terceroNombre: null, saldoActual: 0, saldoInicial: 0, debito: null, credito: null }, actual: 0, base: saldo, delta: -saldo, pctv: -100, id: 'V-73', titulo: `${codigo} · ${nombrePuc(codigo) ?? codigo}: desapareció frente al año anterior` })
    }
    vars.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    const emitidas = vars.slice(0, UMBRALES_BALANCE.topeVariaciones)
    recortadas += vars.length - emitidas.length
    bit.push({ tipo: 'contraste', texto: `Contrasté ${fmt(nivel4.length)} cuentas de nivel 4 contra el comparativo del año anterior (V-70 a V-73): ${vars.length} variaciones relevantes${vars.length > emitidas.length ? `, reporto las ${emitidas.length} mayores` : ''}.`, referencia: { regla: 'V-70', norma: 'NIA 520' } })
    for (const v of emitidas) {
      const cls = clasificar(v.delta, esClaseBalance(v.r.codigo) ? [] : ['resultado'])
      if (cls.severidad === 'trivial') continue
      propuestas.push({
        clave: `${v.id}:${v.r.codigo}`, paso: 'balance', tipo: 'hallazgo', codigo: null,
        titulo: v.titulo, cuentaCodigo: v.r.codigo, monto: v.delta, severidad: cls.severidad as SeveridadPropuesta, certeza: 'requiere_evidencia', reglas: [v.id],
        datos: [
          { etiqueta: 'Saldo actual', valor: fmt(v.actual) }, { etiqueta: 'Año anterior', valor: fmt(v.base) },
          { etiqueta: 'Variación', valor: fmt(v.delta) }, { etiqueta: '%', valor: v.pctv === null ? 'n/a' : pct(v.pctv) },
        ],
        contenido: { descripcion: 'La variación supera lo esperado para la cuenta. Puede tener explicación de negocio; hace falta la explicación de la administración o el auxiliar.', norma: 'NIA 520 · Procedimientos analíticos de planeación', para: 'Con la explicación o el auxiliar, cierro el hallazgo o lo convierto en riesgo.' },
        desbloqueaClave: null, orden: 0,
        bitacora: [
          { tipo: 'contraste', texto: `Comparé ${v.r.codigo}: actual ${fmt(v.actual)} vs año anterior ${fmt(v.base)} → variación ${fmt(v.delta)}${v.pctv === null ? '' : ` (${pct(v.pctv)})`}.`, referencia: { regla: v.id, norma: 'NIA 520' } },
          { tipo: 'regla', texto: `Umbral de ${v.id}: ${v.id === 'V-70' ? `variación ≥ ${UMBRALES_BALANCE.variacionPct} % y ≥ triviales` : v.id === 'V-71' ? 'cambio de signo' : 'saldo material que aparece o desaparece'}.`, referencia: { regla: v.id } },
          { tipo: 'clasificacion', texto: `Severidad ${String(cls.severidad).toUpperCase()}: ${cls.explicacion}.`, referencia: { regla: v.id } },
        ],
      })
    }
  } else {
    const motivo = entrada.comparativo.length === 0 ? 'No hay balance comparativo del año anterior cargado.' : 'Sin materialidad no hay umbral para las variaciones.'
    limitaciones.push({ regla: 'V-70..V-73', motivo })
    bit.push({ tipo: 'lectura', texto: `No corrí las variaciones (V-70 a V-73): ${motivo}`, referencia: { regla: 'V-70' } })
  }

  // ── Bloques C/H vía detectarBanderas ──
  const entradaAnalitica = resumen.map((r) => ({
    codigo: r.codigo, nombre: r.nombre, saldoActual: natural(r),
    saldoAnterior: entrada.comparativo.length > 0 ? (compMap.get(r.codigo) ?? 0) : esClaseBalance(r.codigo) ? r.saldoInicial : 0,
  }))
  const banderas = detectarBanderas(entradaAnalitica)
  const V_BANDERA: Record<string, { id: string; sev: SeveridadPropuesta; certeza: CertezaPropuesta; norma: string; documento: string | null }> = {
    patrimonio_negativo: { id: 'V-80', sev: 'alta', certeza: 'verificado', norma: 'NIA 570 · Ley 2069 de 2020 art. 4', documento: 'Plan de la administración / acta de asamblea' },
    endeudamiento_alto: { id: 'V-83', sev: 'media', certeza: 'requiere_evidencia', norma: 'NIA 570', documento: null },
    perdida_ejercicio: { id: 'V-84', sev: 'media', certeza: 'verificado', norma: 'NIA 570', documento: null },
    cartera_vs_ventas: { id: 'V-74', sev: 'media', certeza: 'requiere_evidencia', norma: 'NIA 520 · NIIF PYMES §11', documento: 'Cartera por edades al corte' },
    inventario_vs_costo: { id: 'V-75', sev: 'media', certeza: 'requiere_evidencia', norma: 'NIA 520 · NIIF PYMES §13', documento: 'Kárdex / inventario físico valorizado' },
    gastos_vs_ingresos: { id: 'V-76', sev: 'baja', certeza: 'requiere_evidencia', norma: 'NIA 520', documento: null },
  }
  for (const k of Object.keys(V_BANDERA)) reglas.add(V_BANDERA[k].id)
  bit.push({ tipo: 'regla', texto: `Apliqué las relaciones entre cuentas y negocio en marcha (V-74, V-75, V-76, V-80, V-83, V-84): ${banderas.length} señal(es).`, referencia: { norma: 'NIA 520 · NIA 570' } })
  for (const b of banderas) {
    const def = V_BANDERA[b.clave]
    if (!def) continue
    propuestas.push({
      clave: def.id, paso: 'balance', tipo: 'hallazgo', codigo: null,
      titulo: b.titulo, cuentaCodigo: b.codigos[0] ?? null, monto: null, severidad: def.sev, certeza: def.certeza, reglas: [def.id],
      datos: [{ etiqueta: 'Cuentas', valor: b.codigos.join(', ') }, { etiqueta: 'Regla', valor: def.id }],
      contenido: { descripcion: b.detalle, norma: def.norma, para: def.documento ? `Con "${def.documento}" evalúo si la señal tiene explicación razonable.` : undefined },
      desbloqueaClave: null, orden: 0,
      bitacora: [
        { tipo: 'regla', texto: `Apliqué ${def.id} sobre los totales por clase y grupo: ${b.detalle}`, referencia: { regla: def.id, norma: def.norma } },
        { tipo: 'clasificacion', texto: `Severidad ${def.sev.toUpperCase()}: severidad fija de ${def.id}.`, referencia: { regla: def.id } },
      ],
    })
    if (def.documento) {
      propuestas.push({
        clave: `D:${def.id}`, paso: 'pbc', tipo: 'documento', codigo: null, titulo: def.documento, cuentaCodigo: b.codigos[0] ?? null,
        monto: null, severidad: null, certeza: null, reglas: [def.id], datos: [], contenido: { descripcion: b.detalle, para: '' },
        desbloqueaClave: def.id, orden: 0, bitacora: [{ tipo: 'solicitud', texto: `Pedí "${def.documento}" para resolver ${def.id}.`, referencia: { regla: def.id } }],
      })
    }
  }

  // ── Ya decididas por una persona en corridas anteriores: no se repiten ──
  const huellas = new Set(entrada.huellasDecididas ?? [])
  let yaDecididas = 0
  if (huellas.size > 0) {
    const quitar = new Set(propuestas.filter((p) => p.tipo !== 'documento' && huellas.has(huellaPropuesta(p))).map((p) => p.clave))
    yaDecididas = quitar.size
    for (let i = propuestas.length - 1; i >= 0; i--) {
      const p = propuestas[i]
      if (quitar.has(p.clave) || (p.desbloqueaClave && quitar.has(p.desbloqueaClave))) propuestas.splice(i, 1)
    }
    if (yaDecididas > 0) bit.push({ tipo: 'contraste', texto: `Omití ${yaDecididas} señal(es) que ya decidiste en corridas anteriores de este encargo; se conservan con tu decisión.`, referencia: {} })
  }

  // ── Orden y códigos (la numeración continúa la del encargo) ──
  const num = { H: entrada.numeracion?.H ?? 0, D: entrada.numeracion?.D ?? 0, A: entrada.numeracion?.A ?? 0 }
  const peso = (s: SeveridadPropuesta | null) => (s === 'alta' ? 0 : s === 'media' ? 1 : s === 'baja' ? 2 : 3)
  const hallazgos = propuestas.filter((p) => p.tipo === 'hallazgo').sort((a, b) => peso(a.severidad) - peso(b.severidad) || Math.abs(b.monto ?? 0) - Math.abs(a.monto ?? 0))
  hallazgos.forEach((p, i) => { p.codigo = `H-${String(num.H + i + 1).padStart(2, '0')}`; p.orden = i })
  const docs = propuestas.filter((p) => p.tipo === 'documento')
  docs.forEach((d, i) => {
    d.codigo = `D-${String(num.D + i + 1).padStart(2, '0')}`
    const h = hallazgos.find((x) => x.clave === d.desbloqueaClave)
    d.orden = h ? h.orden : 999
    d.contenido.para = h ? `Desbloquea ${h.codigo} · ${h.titulo}` : d.contenido.para
  })
  propuestas.filter((p) => p.tipo === 'ambiguedad').forEach((p, i) => { p.codigo = `A-${String(num.A + i + 1).padStart(2, '0')}` })

  bit.push({ tipo: 'clasificacion', texto: `Resultado: ${hallazgos.length} hallazgos, ${docs.length} documentos pedidos, ${triviales} señales por debajo del umbral trivial agrupadas.`, referencia: {} })

  return {
    propuestas,
    bitacora: bit,
    resumen: {
      filas: filas.length, filasHoja: hojas.length, filasResumen: resumen.length, terceros,
      convencion, materialidad: mUsada, reglasEjecutadas: [...reglas].sort(), limitaciones, triviales, recortadas,
    },
  }
}
