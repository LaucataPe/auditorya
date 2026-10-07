/**
 * Agente de IVA (docs/agente/procedimiento-iva-v1.md, etapa 2). El navegador lee
 * los insumos a cero tokens —auxiliares contables y reporte DIAN— y manda los
 * resúmenes al backend, que corre el motor de reglas I-xx sobre el programa que
 * decidió el auditor y GUARDA la corrida, sus propuestas y la bitácora
 * (corridas_agente / propuestas_agente / bitacora_agente con
 * revision_tributaria_id). Las decisiones también van al backend: aprobar un
 * hallazgo lo escribe en hallazgos_tributarios ligado a su propuesta; aprobar
 * un juicio marca el punto del checklist. Los archivos quedan como soportes con
 * el nombre que les dio el auditor y se vuelven a leer al recargar (para poder
 * volver a analizar sin subirlos otra vez).
 *
 * Auxiliares: pueden ser varios (uno por cuenta o uno solo con todas). Se suman
 * sus movimientos antes de resumir y mapear; si un archivo nuevo trae las mismas
 * cuentas que uno ya cargado, lo reemplaza para no duplicar.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AGENTES_TRIBUTARIOS,
  RENGLONES_RETEFUENTE,
  etiquetaPeriodo,
  huellaDeclarado,
  inicioVentanaDescontables,
  mapearAuxiliarACifrasIva,
  mapearLibrosIca,
  mapearLibrosReteica,
  mapearLibrosRetefuente,
  mapeoMemoriaDe,
  leerLibroContable,
  parseAuxiliarMovimientos,
  parseReporteDian,
  periodoAnterior,
  rangoPeriodo,
  resumirAuxiliarPeriodo,
  resumirReporteDianPeriodo,
  cedulasSinConcluir,
  type AdjuntoTributario,
  type CedulaProcedimiento,
  type ConclusionesCedulas,
  type ResultadoConclusionCedula,
  type DecisionPropuesta,
  MEMORIA_IVA_VACIA,
  type EntradaCorridaIvaCliente,
  type EstadoAgenteIva,
  type MapeoLibrosIva,
  type MapeoLibrosIca,
  type MapeoLibrosReteica,
  type MapeoLibrosRetefuente,
  type MemoriaIvaEmpresa,
  type MovimientoAuxiliar,
  type ObligacionConRevisiones,
  type ResumenAuxiliarPeriodo,
  type ResumenCuentaAuxiliar,
  type SaldoTerceroPeriodo,
  saldosTerceroDeMovimientos,
  type PropuestaAgente,
  type ReporteDianParseado,
  type RevisionTributariaDetalle,
  type TipoAgentico,
} from '@auditorya/types'
import { api, BASE_URL } from '../lib/api'
import { parseCsv } from '../lib/csv'
import { leerExcelAFilas } from '../lib/xlsx-loader'
import { toast } from '../store/toast.store'
import type { AjustesDecision } from './useAgente'

export type AuxiliarCargado = {
  /** Id local estable (el del adjunto cuando existe). */
  id: string
  adjuntoId: string | null
  /** Nombre que le dio el auditor ("Auxiliar 2408", "Auxiliar ingresos"…). */
  nombre: string
  archivo: string
  /** Libro auxiliar por movimientos, o balance de prueba del período (débitos y créditos por cuenta, sin asientos). */
  familia: 'movimientos' | 'balance'
  movimientos: MovimientoAuxiliar[]
  /** Solo familia 'balance': cuentas hoja con sus débitos y créditos del período. */
  saldos: ResumenCuentaAuxiliar[]
  /** Detalle por tercero (balance por terceros); los auxiliares lo derivan de sus asientos. */
  saldosTercero: SaldoTerceroPeriodo[]
  /** Nombres de todas las cuentas del balance (incluidas las de nivel superior), para heredar el municipio de la 2368. */
  nombresCuentas: Record<string, string | null>
  /** Asientos dentro del período (movimientos) o cuentas con movimiento (balance). */
  enPeriodo: number
  /** Cuentas (código) con movimiento en el período. */
  cuentas: string[]
  cierres: number
  advertencias: string[]
}

/** Resultado de analizar un archivo antes de confirmarlo: lo que ve el auditor en el modal. */
export type AnalisisAuxiliar = {
  archivo: File
  familia: 'movimientos' | 'balance'
  movimientos: MovimientoAuxiliar[]
  saldos: ResumenCuentaAuxiliar[]
  saldosTercero: SaldoTerceroPeriodo[]
  nombresCuentas: Record<string, string | null>
  /** Columnas que el lector reconoció (para que el auditor vea cómo se leyó). */
  reconocidas: string[]
  enPeriodo: number
  cuentas: { cuenta: string; nombre: string | null; movimientos: number }[]
  cierres: number
  advertencias: string[]
  /** Nombre sugerido según las cuentas que trae. */
  sugerencia: string
  /** Auxiliares ya cargados que comparten cuentas con este (se reemplazarían). */
  reemplaza: AuxiliarCargado[]
}

export type EstadoDian = { adjuntoId: string | null; archivo: string; reporte: ReporteDianParseado }

async function leerArchivo(file: File): Promise<string[][]> {
  return /\.(xlsx|xlsm|xls)$/i.test(file.name) ? leerExcelAFilas(file) : parseCsv(await file.text())
}

/** "Auxiliar IVA (2408) e ingresos (41)" a partir de los prefijos de las cuentas que trae, según el impuesto. */
export function sugerirNombreAuxiliar(cuentas: string[], etiqueta: string, familia: 'movimientos' | 'balance' = 'movimientos', tipo: TipoAgentico = 'iva'): string {
  const partes: string[] = []
  const prefijos = AGENTES_TRIBUTARIOS[tipo].cuentas
  for (const pf of prefijos) if (cuentas.some((c) => c.startsWith(pf.prefijo)) && !partes.includes(pf.etiqueta)) partes.push(pf.etiqueta)
  const otras = cuentas.filter((c) => !prefijos.some((pf) => c.startsWith(pf.prefijo))).map((c) => c.slice(0, 4))
  if (partes.length === 0 && otras.length) partes.push(`cuentas ${[...new Set(otras)].slice(0, 3).join(', ')}`)
  const que = partes.length ? partes.join(partes.length === 2 ? ' e ' : ', ').replace(/, ([^,]*)$/, ' y $1') : 'contable'
  return `${familia === 'balance' ? 'Balance de prueba' : 'Auxiliar'} ${que} · ${etiqueta}`
}

/**
 * Lee un libro (auxiliar o balance del período) ya convertido a matriz y lo
 * resume para el período de la revisión. null si no es ninguna de las dos cosas.
 */
export function leerYResumirLibro(
  filas: string[][],
  rango: { desde: string; hasta: string },
  memoria: MemoriaIvaEmpresa,
): { familia: 'movimientos' | 'balance'; movimientos: MovimientoAuxiliar[]; saldos: ResumenCuentaAuxiliar[]; saldosTercero: SaldoTerceroPeriodo[]; nombresCuentas: Record<string, string | null>; resumen: ResumenAuxiliarPeriodo; advertencias: string[]; reconocidas: string[] } | null {
  const libro = leerLibroContable(filas, parseAuxiliarMovimientos)
  if (!libro) return null
  if (libro.familia === 'movimientos') {
    const resumen = resumirAuxiliarPeriodo(libro.auxiliar, rango, { tiposDocCierre: memoria.tiposDocCierre })
    return { familia: 'movimientos', movimientos: libro.auxiliar.movimientos, saldos: [], saldosTercero: [], nombresCuentas: {}, resumen, advertencias: libro.auxiliar.advertencias, reconocidas: libro.auxiliar.reconocidas }
  }
  const b = libro.balance
  const advertencias = [...b.advertencias]
  // Un balance no se puede filtrar por fecha: se confía en el período del título, si lo trae.
  if (b.encabezado.periodoDesde && b.encabezado.periodoHasta && (b.encabezado.periodoDesde !== rango.desde || b.encabezado.periodoHasta !== rango.hasta)) {
    advertencias.push(`El balance dice ser del ${b.encabezado.periodoDesde} al ${b.encabezado.periodoHasta}, y la revisión es del ${rango.desde} al ${rango.hasta}: verifica que sea el período correcto.`)
  } else if (!b.encabezado.periodoDesde) {
    advertencias.push('El balance no dice de qué período es: se asume que sus débitos y créditos son los del período de la revisión.')
  }
  const saldos = b.cuentas.filter((c) => c.debitos !== 0 || c.creditos !== 0)
  const resumen: ResumenAuxiliarPeriodo = { desde: rango.desde, hasta: rango.hasta, cuentas: saldos, fueraDePeriodo: 0, tiposDocCierre: [], bitacora: [`Balance de prueba: ${saldos.length} cuenta(s) hoja con movimiento; sin asientos no se detecta cierre de IVA.`] }
  return { familia: 'balance', movimientos: [], saldos, saldosTercero: b.terceros, nombresCuentas: Object.fromEntries(b.todas.map((c) => [c.cuenta, c.nombre])), resumen, advertencias, reconocidas: b.reconocidas }
}

/** Según libros por impuesto: IVA (2408/41/1355), retención en la fuente (2365/2367), reteICA (2368) o ICA (clase 4, 135518, 2412), con la memoria de la empresa. */
export function mapearLibros(
  tipo: TipoAgentico, resumen: ResumenAuxiliarPeriodo, movimientos: MovimientoAuxiliar[], memoria: MemoriaIvaEmpresa,
  terceros: { saldos: SaldoTerceroPeriodo[]; anio: number; nitEmpresa?: string | null; obligacion?: { id: string; nombre: string | null; municipio?: string | null }; nombresCuentas?: Record<string, string | null> } = { saldos: [], anio: new Date().getFullYear() },
): MapeoLibrosIva | MapeoLibrosRetefuente | MapeoLibrosReteica | MapeoLibrosIca {
  if (tipo === 'iva') return mapearAuxiliarACifrasIva(resumen, { mapeo: memoria.mapeo2408 })
  if (tipo === 'ica') return mapearLibrosIca(resumen, { obligacion: terceros.obligacion ?? { nombre: null }, memoria: memoria.mapeoIca ?? {} })
  if (tipo === 'reteica') {
    return mapearLibrosReteica(resumen, movimientos, {
      obligacion: terceros.obligacion ?? { id: '', nombre: null }, memoria: memoria.mapeo2368 ?? {}, saldosTercero: terceros.saldos, nombresCuentas: terceros.nombresCuentas,
    })
  }
  // Detalle por tercero: el de los balances más el que sale de los asientos del período; si una cuenta viene en ambos, manda el auxiliar.
  const deAsientos = saldosTerceroDeMovimientos(movimientos, resumen)
  const cuentasAux = new Set(deAsientos.map((s) => s.cuenta))
  const saldosTercero = [...deAsientos, ...terceros.saldos.filter((s) => !cuentasAux.has(s.cuenta))]
  return mapearLibrosRetefuente(resumen, movimientos, { mapeo: memoria.mapeo2365 ?? {} }, { renglonesValidos: RENGLONES_RETEFUENTE, saldosTercero, anio: terceros.anio, nitEmpresa: terceros.nitEmpresa })
}

/** Combina todos los libros cargados en un solo resumen del período: movimientos resumidos + saldos de balances. */
export function combinarLibros(lista: Pick<AuxiliarCargado, 'movimientos' | 'saldos' | 'nombre'>[], rango: { desde: string; hasta: string }, memoria: MemoriaIvaEmpresa): ResumenAuxiliarPeriodo {
  const movimientos = lista.flatMap((a) => a.movimientos)
  const resumen = resumirAuxiliarPeriodo({ movimientos }, rango, { tiposDocCierre: memoria.tiposDocCierre })
  const vistas = new Set(resumen.cuentas.map((c) => c.cuenta))
  for (const a of lista) {
    for (const c of a.saldos) {
      if (vistas.has(c.cuenta)) { resumen.bitacora.push(`Cuenta ${c.cuenta} viene en un auxiliar y en el balance "${a.nombre}": se usó el auxiliar.`); continue }
      vistas.add(c.cuenta)
      resumen.cuentas.push(c)
    }
  }
  resumen.cuentas.sort((x, y) => x.cuenta.localeCompare(y.cuenta))
  return resumen
}

export function useAgenteIva(revision: RevisionTributariaDetalle, sellada: boolean, onCambio: () => void, nitEmpresa: string | null = null) {
  const queryClient = useQueryClient()
  const [auxiliares, setAuxiliares] = useState<AuxiliarCargado[]>([])
  const [dian, setDian] = useState<EstadoDian | null>(null)
  const [cargando, setCargando] = useState<'auxiliar' | 'dian' | null>(null)
  /** true justo después de correr en esta sesión: el paso 3 revela la bitácora línea a línea. */
  const [recienCorrida, setRecienCorrida] = useState(false)
  const releidos = useRef<Set<string>>(new Set())
  /** Renglones de libros que la última combinación escribió (para limpiar al quitar un auxiliar). */
  const librosEscritos = useRef<Set<string>>(new Set())

  const obligacion = revision.obligacion
  // La vista guiada solo se muestra para impuestos con agente (esTipoAgentico en la página).
  const tipo = obligacion.tipo as TipoAgentico
  const rango = rangoPeriodo(obligacion.periodicidad, revision.periodo, obligacion.anioFiscal)
  const etiqueta = `${etiquetaPeriodo(obligacion.periodicidad, revision.periodo)} ${obligacion.anioFiscal}`

  // Revisión del período anterior (misma obligación), para el arrastre del saldo a favor.
  const { data: matriz } = useQuery<{ obligaciones: ObligacionConRevisiones[] }>({
    queryKey: ['tributario', obligacion.empresaId, obligacion.anioFiscal],
    queryFn: () => api.get(`/empresas/${obligacion.empresaId}/tributario?anio=${obligacion.anioFiscal}`),
  })
  const anterior = useMemo(() => {
    const clave = periodoAnterior(obligacion.periodicidad, revision.periodo)
    if (!clave) return null
    const r = matriz?.obligaciones.find((o) => o.id === obligacion.id)?.revisiones.find((x) => x.periodo === clave)
    return r ? { etiqueta: `${etiquetaPeriodo(obligacion.periodicidad, clave)} ${obligacion.anioFiscal}`, cifras: r.cifras } : null
  }, [matriz, obligacion, revision.periodo])

  // ─── Estado persistido del agente: última corrida, propuestas y memoria de la empresa ──
  const claveEstado = ['tributario-agente', revision.id] as const
  const { data: estado, isLoading: cargandoEstado } = useQuery<EstadoAgenteIva>({
    queryKey: claveEstado,
    queryFn: () => api.get(`/tributario/revisiones/${revision.id}/agente`),
  })
  const corrida = estado?.corrida ?? null
  const propuestas = estado?.propuestas ?? []
  const resumen = corrida?.resultado ?? null
  const memoria: MemoriaIvaEmpresa = estado?.memoria ?? MEMORIA_IVA_VACIA
  // Cédulas del último análisis y la conclusión del auditor sobre cada una.
  const cedulas: CedulaProcedimiento[] = useMemo(() => resumen?.cedulas ?? [], [resumen])
  const conclusiones: ConclusionesCedulas = useMemo(() => estado?.conclusiones ?? {}, [estado])
  const sinConcluir = useMemo(() => cedulasSinConcluir(cedulas, conclusiones), [cedulas, conclusiones])

  // ─── Auxiliares: combinación de todos los cargados, con la memoria de la empresa ──
  const tercerosDe = (lista: AuxiliarCargado[]) => ({
    saldos: lista.flatMap((a) => a.saldosTercero), anio: obligacion.anioFiscal, nitEmpresa,
    obligacion: { id: obligacion.id, nombre: obligacion.nombre, municipio: obligacion.municipio }, nombresCuentas: Object.assign({}, ...lista.map((a) => a.nombresCuentas)) as Record<string, string | null>,
  })
  const combinado = useMemo(() => {
    if (!rango || auxiliares.length === 0) return null
    const resumen = combinarLibros(auxiliares, rango, memoria)
    const mapeo = mapearLibros(tipo, resumen, auxiliares.flatMap((a) => a.movimientos), memoria, tercerosDe(auxiliares))
    return { resumen, mapeo, bitacora: [...auxiliares.flatMap((a) => a.advertencias), ...resumen.bitacora, ...mapeo.bitacora] }
  }, [auxiliares, rango, memoria, tipo]) // eslint-disable-line react-hooks/exhaustive-deps

  const guardarLibros = useMutation({
    mutationFn: (cifras: Record<string, { libros: number | null }>) => api.patch(`/tributario/revisiones/${revision.id}`, { cifras }),
    onSuccess: onCambio,
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo guardar "Según libros"'),
  })

  /** Escribe en la revisión los libros de la combinación actual y limpia los que dejaron de existir. */
  const persistirLibros = (mapeo: NonNullable<typeof combinado>['mapeo'] | null) => {
    if (sellada) return
    const cifras: Record<string, { libros: number | null }> = {}
    const nuevos = new Set(Object.keys(mapeo?.cifras ?? {}))
    for (const id of nuevos) cifras[id] = { libros: mapeo!.cifras[id].libros }
    for (const id of librosEscritos.current) if (!nuevos.has(id)) cifras[id] = { libros: null }
    librosEscritos.current = nuevos
    if (Object.keys(cifras).length) guardarLibros.mutate(cifras)
  }

  const adjuntar = async (file: File, tipo: 'auxiliar' | 'reporte_dian', nombre: string): Promise<string | null> => {
    if (sellada) return null
    const fd = new FormData()
    fd.append('archivo', file)
    fd.append('tipo', tipo)
    fd.append('nombre', nombre)
    try {
      const adjunto = await api.upload<{ id: string }>(`/tributario/revisiones/${revision.id}/adjuntos`, fd)
      releidos.current.add(adjunto.id)
      onCambio()
      return adjunto.id
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'El archivo se leyó pero no quedó como soporte')
      return null
    }
  }

  /** Analiza un auxiliar sin cargarlo: el modal muestra qué trae y sugiere el nombre. */
  const analizarAuxiliar = async (file: File): Promise<AnalisisAuxiliar | null> => {
    if (!rango) return null
    setCargando('auxiliar')
    try {
      const filas = await leerArchivo(file)
      const libro = leerYResumirLibro(filas, rango, memoria)
      if (!libro) {
        toast.error('No reconocí el archivo: busco un libro auxiliar (fecha, cuenta, débito y crédito por asiento) o un balance de prueba del período (cuenta, débitos y créditos).')
        return null
      }
      const { resumen } = libro
      if (resumen.cuentas.length === 0) {
        toast.error(libro.familia === 'balance' ? 'El balance no trae cuentas con movimiento.' : `El archivo no trae movimientos entre ${rango.desde} y ${rango.hasta}. ¿Es el auxiliar del período correcto?`)
        return null
      }
      const cuentas = resumen.cuentas.map((c) => ({ cuenta: c.cuenta, nombre: c.nombre, movimientos: c.movimientos }))
      const codigos = cuentas.map((c) => c.cuenta)
      return {
        archivo: file,
        familia: libro.familia,
        movimientos: libro.movimientos,
        saldos: libro.saldos,
        saldosTercero: libro.saldosTercero,
        nombresCuentas: libro.nombresCuentas,
        reconocidas: libro.reconocidas,
        enPeriodo: libro.familia === 'balance' ? cuentas.length : resumen.cuentas.reduce((s, c) => s + c.movimientos, 0),
        cuentas,
        cierres: resumen.cuentas.reduce((s, c) => s + c.cierres.length, 0),
        advertencias: libro.advertencias,
        sugerencia: sugerirNombreAuxiliar(codigos, etiqueta, libro.familia, tipo),
        reemplaza: auxiliares.filter((a) => a.cuentas.some((c) => codigos.includes(c))),
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo leer el auxiliar')
      return null
    } finally {
      setCargando(null)
    }
  }

  /** Carga el auxiliar analizado con el nombre elegido: estado, libros y soporte. */
  const confirmarAuxiliar = async (analisis: AnalisisAuxiliar, nombre: string) => {
    const nombreFinal = nombre.trim() || analisis.sugerencia
    setCargando('auxiliar')
    try {
      // Quita los que reemplaza (también su soporte) para no sumar dos veces la misma cuenta.
      for (const viejo of analisis.reemplaza) {
        if (viejo.adjuntoId) await api.delete(`/tributario/adjuntos/${viejo.adjuntoId}`).catch(() => {})
      }
      const adjuntoId = await adjuntar(analisis.archivo, 'auxiliar', nombreFinal)
      const nuevo: AuxiliarCargado = {
        id: adjuntoId ?? `local-${Date.now().toString(36)}`,
        adjuntoId,
        nombre: nombreFinal,
        archivo: analisis.archivo.name,
        familia: analisis.familia,
        movimientos: analisis.movimientos,
        saldos: analisis.saldos,
        saldosTercero: analisis.saldosTercero,
        nombresCuentas: analisis.nombresCuentas,
        enPeriodo: analisis.enPeriodo,
        cuentas: analisis.cuentas.map((c) => c.cuenta),
        cierres: analisis.cierres,
        advertencias: analisis.advertencias,
      }
      const reemplazados = new Set(analisis.reemplaza.map((a) => a.id))
      const lista = [...auxiliares.filter((a) => !reemplazados.has(a.id)), nuevo]
      setAuxiliares(lista)
      if (rango) {
        persistirLibros(mapearLibros(tipo, combinarLibros(lista, rango, memoria), lista.flatMap((a) => a.movimientos), memoria, tercerosDe(lista)))
      }
      toast.success(`${nombreFinal}: ${analisis.familia === 'balance' ? `${analisis.cuentas.length} cuenta(s) con movimiento` : `${analisis.enPeriodo} asiento(s) en ${analisis.cuentas.length} cuenta(s)`}${analisis.reemplaza.length ? `, reemplaza ${analisis.reemplaza.length} auxiliar(es) anterior(es)` : ''}.`)
    } finally {
      setCargando(null)
    }
  }

  const quitarAuxiliar = async (id: string) => {
    const a = auxiliares.find((x) => x.id === id)
    if (!a) return
    if (a.adjuntoId && !sellada) {
      try {
        await api.delete(`/tributario/adjuntos/${a.adjuntoId}`)
        onCambio()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'No se pudo quitar el soporte')
        return
      }
    }
    const lista = auxiliares.filter((x) => x.id !== id)
    setAuxiliares(lista)
    if (rango) {
      const mapeo = lista.length ? mapearLibros(tipo, combinarLibros(lista, rango, memoria), lista.flatMap((x) => x.movimientos), memoria, tercerosDe(lista)) : null
      persistirLibros(mapeo)
    }
  }

  // ─── Reporte DIAN ──────────────────────────────────────────────────────────
  const procesarDian = (filas: string[][], nombre: string, adjuntoId: string | null, avisar: boolean): boolean => {
    const reporte = parseReporteDian(filas)
    if (!reporte) {
      if (avisar) toast.error('El archivo no es el reporte de documentos electrónicos de la DIAN: faltan sus columnas.')
      return false
    }
    setDian({ adjuntoId, archivo: nombre, reporte })
    return true
  }

  const cargarDian = async (file: File) => {
    setCargando('dian')
    try {
      const filas = await leerArchivo(file)
      if (procesarDian(filas, file.name, null, true)) {
        toast.success(`Reporte DIAN leído: ${file.name}.`)
        if (dian?.adjuntoId && !sellada) await api.delete(`/tributario/adjuntos/${dian.adjuntoId}`).catch(() => {})
        const adjuntoId = await adjuntar(file, 'reporte_dian', `Reporte DIAN ${etiqueta}`)
        setDian((d) => (d ? { ...d, adjuntoId } : d))
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo leer el reporte')
    } finally {
      setCargando(null)
    }
  }

  // Al abrir la revisión, vuelve a leer los soportes que ya se cargaron antes
  // (todos los auxiliares y el último reporte DIAN) para que el análisis no
  // dependa de la sesión anterior del navegador.
  useEffect(() => {
    if (!rango) return
    const releer = async (adjunto: AdjuntoTributario): Promise<string[][] | null> => {
      try {
        const { url } = await api.get<{ url: string }>(`/tributario/adjuntos/${adjunto.id}/descarga`)
        // La ruta de descarga pasa por el middleware de sesión de las rutas montadas antes: sin la cookie responde 401.
        const res = await fetch(`${BASE_URL}${url}`, { credentials: 'include' })
        if (!res.ok) return null
        const blob = await res.blob()
        return await leerArchivo(new File([blob], adjunto.archivoNombre, { type: adjunto.archivoMime }))
      } catch {
        return null // si no se pudo releer, el auditor lo vuelve a cargar a mano
      }
    }
    const soportes = revision.adjuntos.filter((a) => a.hallazgoId === null)
    for (const adj of soportes.filter((a) => a.tipo === 'auxiliar')) {
      if (releidos.current.has(adj.id)) continue
      releidos.current.add(adj.id)
      void releer(adj).then((filas) => {
        if (!filas) return
        const libro = leerYResumirLibro(filas, rango, memoria)
        if (!libro) return
        const { resumen } = libro
        setAuxiliares((lista) =>
          lista.some((a) => a.id === adj.id)
            ? lista
            : [...lista, {
                id: adj.id, adjuntoId: adj.id, nombre: adj.nombre, archivo: adj.archivoNombre, familia: libro.familia, movimientos: libro.movimientos, saldos: libro.saldos, saldosTercero: libro.saldosTercero, nombresCuentas: libro.nombresCuentas,
                enPeriodo: libro.familia === 'balance' ? resumen.cuentas.length : resumen.cuentas.reduce((s, c) => s + c.movimientos, 0), cuentas: resumen.cuentas.map((c) => c.cuenta),
                cierres: resumen.cuentas.reduce((s, c) => s + c.cierres.length, 0), advertencias: libro.advertencias,
              }],
        )
      })
    }
    const rep = soportes.filter((a) => a.tipo === 'reporte_dian').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    if (rep && !releidos.current.has(rep.id) && !dian) {
      releidos.current.add(rep.id)
      void releer(rep).then((filas) => filas && procesarDian(filas, rep.archivoNombre, rep.id, false))
    }
    // Los libros ya guardados en la revisión cuentan como escritos por el agente.
    for (const [id, v] of Object.entries(revision.cifras)) if (typeof v.libros === 'number') librosEscritos.current.add(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision.adjuntos])

  // ─── Corrida persistida ────────────────────────────────────────────────────
  /** Entrada que se manda al backend: lo leído en el navegador, ya resumido. */
  const armarEntrada = (): EntradaCorridaIvaCliente | null => {
    if (!rango) return null
    return {
      tiposDocCierre: combinado?.resumen.tiposDocCierre ?? [],
      libros: combinado?.mapeo ?? null,
      dian: dian
        ? {
            resumen: resumirReporteDianPeriodo(dian.reporte, { ...rango, ventanaDesde: inicioVentanaDescontables(obligacion.periodicidad, rango.desde) }),
            nitReporte: dian.reporte.nitEmpresa,
            advertencias: dian.reporte.advertencias,
          }
        : null,
      insumos: {
        auxiliares: auxiliares.map((a) => ({ adjuntoId: a.adjuntoId, nombre: a.nombre, archivo: a.archivo, enPeriodo: a.enPeriodo, cuentas: a.cuentas, cierres: a.cierres })),
        dian: dian ? { adjuntoId: dian.adjuntoId, archivo: dian.archivo, documentos: dian.reporte.documentos.length } : null,
        anterior: null,
      },
      lecturas: [
        ...auxiliares.map((a) => `Leí "${a.nombre}" (${a.archivo}): ${a.enPeriodo} asiento(s) del período en ${a.cuentas.length} cuenta(s).`),
        ...(combinado?.bitacora ?? []),
      ],
    }
  }

  const correr = useMutation({
    mutationFn: async () => {
      const entrada = armarEntrada()
      if (!entrada) throw new Error('No se pudo resolver el período de la revisión')
      return api.post<EstadoAgenteIva>(`/tributario/revisiones/${revision.id}/agente/corridas`, entrada)
    },
    onSuccess: (nuevo) => {
      queryClient.setQueryData(claveEstado, nuevo)
      setRecienCorrida(true)
      onCambio()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo correr el análisis'),
  })

  // ¿Cambió algo desde el último análisis? (insumos cargados o cifras declaradas)
  const desactualizada = useMemo(() => {
    if (!resumen) return false
    const idsAhora = [...auxiliares.map((a) => a.adjuntoId), dian?.adjuntoId ?? null].filter((x): x is string => !!x).sort().join(',')
    const idsCorrida = [...resumen.insumos.auxiliares.map((a) => a.adjuntoId), resumen.insumos.dian?.adjuntoId ?? null].filter((x): x is string => !!x).sort().join(',')
    // Los soportes releídos llegan de a uno: solo se compara cuando ya se leyeron todos los que la corrida usó.
    const releyendo = revision.adjuntos.some((a) => a.hallazgoId === null && (a.tipo === 'auxiliar' || a.tipo === 'reporte_dian') && !auxiliares.some((x) => x.adjuntoId === a.id) && dian?.adjuntoId !== a.id)
    if (!releyendo && idsAhora !== idsCorrida) return true
    if (huellaDeclarado(revision.cifras) !== resumen.declaradoHuella) return true
    // La memoria cambió (una subcuenta clasificada después de correr): "Según libros" ya no es el mismo.
    const mapeoCorrida = JSON.stringify(Object.entries(resumen.memoriaMapeo ?? {}).sort())
    const mapeoActual = mapeoMemoriaDe(tipo, memoria)
    return auxiliares.length > 0 && mapeoCorrida !== JSON.stringify(Object.entries(mapeoActual).sort())
  }, [resumen, auxiliares, dian, revision.adjuntos, revision.cifras, memoria, tipo])

  const pendientes = useMemo(() => propuestas.filter((p) => p.estado === 'propuesta'), [propuestas])
  const omitidas = useMemo(() => propuestas.filter((p) => p.estado === 'omitida'), [propuestas])

  type RespuestaDecision = { propuesta: PropuestaAgente; aviso: string | null; escrito: 'hallazgo' | 'checklist' | 'nota' | 'memoria' | null; memoria: MemoriaIvaEmpresa | null }
  const decidir = useMutation({
    mutationFn: ({ p, decision, extra }: { p: PropuestaAgente; decision: DecisionPropuesta; extra?: { motivo?: string; ajustes?: AjustesDecision } }) =>
      api.post<RespuestaDecision>(`/tributario/revisiones/${revision.id}/agente/propuestas/${p.id}/decidir`, {
        decision,
        motivo: extra?.motivo,
        ajustes: extra?.ajustes ? { opcion: extra.ajustes.opcion, titulo: extra.ajustes.titulo, descripcion: extra.ajustes.descripcion, severidad: extra.ajustes.severidad } : undefined,
      }),
    onSuccess: ({ propuesta, aviso, escrito, memoria: nueva }, { p, decision }) => {
      queryClient.setQueryData<EstadoAgenteIva>(claveEstado, (prev) => prev ? { ...prev, propuestas: prev.propuestas.map((x) => (x.id === propuesta.id ? propuesta : x)), memoria: nueva ?? prev.memoria } : prev)
      onCambio()
      if (escrito === 'memoria') toast.success(aviso ?? 'Guardado en la memoria de la empresa')
      else if (escrito === 'hallazgo') toast.success(`Hallazgo ${p.codigo ?? ''} agregado a la revisión`.replace('  ', ' '))
      else if (escrito === 'checklist') toast.success('Punto del programa marcado como verificado')
      else if (escrito === 'nota') toast.info(aviso ?? 'Nota guardada; el punto del programa sigue abierto')
      else if (decision === 'omitir') toast.info('Omitida por ahora: queda registrada y la puedes retomar')
      else if (decision === 'descartar') toast.info('Descartada con tu motivo')
      else if (decision === 'retomar') toast.info('Propuesta retomada')
      else if (p.tipo === 'documento') toast.info('Pide el documento al cliente y adjúntalo como soporte')
      else toast.info('Decisión registrada en la bitácora de la propuesta')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo aplicar la decisión'),
  })

  const concluir = useMutation({
    mutationFn: ({ cedulaId, texto, resultado }: { cedulaId: string; texto: string; resultado: ResultadoConclusionCedula }) =>
      api.put<{ conclusiones: ConclusionesCedulas; checklist: Record<string, { hecho: boolean; nota: string }> | null }>(
        `/tributario/revisiones/${revision.id}/agente/cedulas/${cedulaId}/conclusion`, { texto, resultado }),
    onSuccess: ({ conclusiones: nuevas, checklist }) => {
      queryClient.setQueryData<EstadoAgenteIva>(claveEstado, (prev) => prev ? { ...prev, conclusiones: nuevas } : prev)
      onCambio()
      toast.success(checklist ? 'Conclusión guardada; el punto del programa quedó documentado' : 'Conclusión guardada')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo guardar la conclusión'),
  })

  const olvidarMemoria = useMutation({
    mutationFn: () => api.delete<MemoriaIvaEmpresa>(`/tributario/revisiones/${revision.id}/agente/memoria`),
    onSuccess: (m) => {
      queryClient.setQueryData<EstadoAgenteIva>(claveEstado, (prev) => prev ? { ...prev, memoria: m } : prev)
      toast.info('Memoria de la empresa borrada: el agente vuelve a preguntar lo que no sepa')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo borrar la memoria'),
  })

  const retomarOmitidas = useMutation({
    mutationFn: async () => {
      for (const p of omitidas) await api.post(`/tributario/revisiones/${revision.id}/agente/propuestas/${p.id}/decidir`, { decision: 'retomar' })
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: claveEstado }); toast.info('Las omitidas vuelven a la lista') },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudieron retomar'),
  })

  const declaradoDiligenciado = Object.values(revision.cifras).some((v) => typeof v.declarado === 'number')
  const librosDiligenciados = auxiliares.length > 0 || Object.values(revision.cifras).some((v) => typeof v.libros === 'number')

  return {
    rango, etiqueta, anterior,
    auxiliares, combinado, dian, cargando,
    analizarAuxiliar, confirmarAuxiliar, quitarAuxiliar, cargarDian,
    corrida, resumen, propuestas, pendientes, omitidas, cargandoEstado, desactualizada,
    correr, recienCorrida, marcarVista: () => setRecienCorrida(false),
    decidir, retomarOmitidas, memoria, olvidarMemoria, tipo,
    cedulas, conclusiones, sinConcluir, concluir,
    declaradoDiligenciado, librosDiligenciados,
  }
}

export type AgenteIva = ReturnType<typeof useAgenteIva>
