/**
 * Cédula del papel de trabajo (NIA 230) — el papel impreso, con todo lo que hoy
 * vive repartido en las sub-pestañas del panel: la prueba y su programa, la
 * muestra (NIA 530), los hallazgos, los documentos solicitados, la evidencia
 * referenciada y, opcionalmente, las notas de revisión (NIA 220).
 *
 * Solo arma el `ExportOpts`; el render (PDF por impresión y .docx) lo hace
 * lib/informe-export, igual que el dictamen o la constancia tributaria.
 */
import {
  PROGRAMA_AUDITORIA, TIPO_PRUEBA_LABEL, ASERCION_LABEL,
  TIPO_HALLAZGO_LABEL, SEVERIDAD_HALLAZGO_LABEL, ESTADO_HALLAZGO_LABEL,
  ESTADO_PBC_LABEL, RESULTADO_ITEM_LABEL,
  type AreaRiesgo, type Hallazgo, type MuestraConItems, type NotaRevision,
  type Riesgo, type SolicitudPbc,
} from '@auditorya/types'
import { formatoCOP } from './moneda'
import type { ExportOpts, FirmaMembrete, SeccionRender } from './informe-export'

/** Lo que la cédula necesita del papel (subconjunto de PapelDetalle). */
export type PapelParaCedula = {
  indice: string
  area: string
  titulo: string
  riesgoId: string | null
  procedimiento: string | null
  alcance: string | null
  /** Narrativa de hallazgos del propio papel (distinta de los hallazgos estructurados). */
  hallazgos: string | null
  conclusion: string | null
  pasosEstado: Record<string, { hecho: boolean; nota: string | null }>
  estado: 'borrador' | 'en_revision' | 'aprobado'
  fechaInicio: string | null
  fechaFin: string | null
  asignadoA: string | null
  preparadoPor: string
  aprobadoPor: string | null
  aprobadoAt: string | null
  evidencias: {
    id: string
    nombre: string
    descripcion: string | null
    tipo: string
    enlaceExterno: string | null
    archivoNombre: string | null
  }[]
}

export type DatosCedulaPapel = {
  papel: PapelParaCedula
  /** Etiqueta legible del área/ciclo (puede ser un ciclo propio de la firma). */
  areaLabel: string
  empresaNombre: string
  periodo: string
  riesgo: Riesgo | null
  muestra: MuestraConItems | null
  hallazgos: Hallazgo[]
  pbc: SolicitudPbc[]
  /** Notas de revisión del papel, o null para omitir la sección (documento sin supervisión interna). */
  notas: NotaRevision[] | null
  /** Resuelve el nombre de un usuario de la firma a partir de su id. */
  nombreUsuario: (id: string | null) => string
  firma?: FirmaMembrete | null
}

const ESTADO_PAPEL_LABEL: Record<PapelParaCedula['estado'], string> = {
  borrador: 'Borrador',
  en_revision: 'En revisión',
  aprobado: 'Aprobado',
}

const TIPO_EVIDENCIA_LABEL: Record<string, string> = {
  documento: 'Documento',
  confirmacion: 'Confirmación',
  conciliacion: 'Conciliación',
  calculo: 'Cálculo',
  foto: 'Fotografía',
  otro: 'Otro',
}

const SIN_DOCUMENTAR = 'No documentado a la fecha de emisión de esta cédula.'

function fecha(iso: string | null): string {
  if (!iso) return '—'
  // Las fechas sin hora (plazos PBC, cronograma) se leen en local: 'new Date("2026-01-10")'
  // sería medianoche UTC y en Colombia mostraría el día anterior.
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso)
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

function cop(valor: number | string | null): string {
  if (valor === null || valor === '') return '—'
  const n = Number(valor)
  return Number.isFinite(n) ? formatoCOP(n) : '—'
}

/** Encabezado de identificación: quién hizo el papel, qué riesgo atiende y en qué estado está. */
function seccionIdentificacion(d: DatosCedulaPapel): SeccionRender {
  const { papel } = d
  const lineas = [
    `Índice: ${papel.indice}`,
    `Área / ciclo: ${d.areaLabel}`,
    `Prueba: ${papel.titulo}`,
    `Estado: ${ESTADO_PAPEL_LABEL[papel.estado]}`,
    `Preparado por: ${d.nombreUsuario(papel.preparadoPor)}`,
    papel.asignadoA && papel.asignadoA !== papel.preparadoPor
      ? `Responsable de la ejecución: ${d.nombreUsuario(papel.asignadoA)}`
      : '',
    papel.estado === 'aprobado'
      ? `Revisado y aprobado por: ${d.nombreUsuario(papel.aprobadoPor)} el ${fecha(papel.aprobadoAt)}`
      : 'Revisado y aprobado por: pendiente de aprobación del socio responsable',
    papel.fechaInicio || papel.fechaFin
      ? `Fechas planeadas: ${fecha(papel.fechaInicio)} a ${fecha(papel.fechaFin)}`
      : '',
    d.riesgo
      ? `Riesgo que atiende (NIA 315): [${d.riesgo.riesgoCombinado.toUpperCase()}] ${d.riesgo.descripcion}`
      : '',
    d.riesgo?.respuestaPlaneada ? `Respuesta planeada: ${d.riesgo.respuestaPlaneada}` : '',
  ].filter(Boolean)

  if (papel.estado !== 'aprobado') {
    lineas.push('', 'Documento en BORRADOR: el papel aún no ha sido aprobado y su contenido puede cambiar.')
  }
  return { label: 'Identificación', contenido: lineas.join('\n') }
}

/** Programa de la prueba: pasos del catálogo con su estado y notas (solo si el papel viene de una prueba estándar). */
function seccionPrograma(d: DatosCedulaPapel): SeccionRender | null {
  const prueba = (PROGRAMA_AUDITORIA[d.papel.area as AreaRiesgo] ?? []).find((p) => p.titulo === d.papel.titulo)
  if (!prueba || prueba.guia.length === 0) return null

  const aserciones = prueba.aserciones.map((a) => ASERCION_LABEL[a] ?? a).join(', ')
  const hechos = prueba.guia.filter((_, i) => d.papel.pasosEstado?.[String(i)]?.hecho).length
  return {
    label: 'Programa de la prueba (NIA 330/500)',
    contenido:
      `${TIPO_PRUEBA_LABEL[prueba.tipo]}. Aserciones cubiertas: ${aserciones}.\n` +
      `Avance del programa: ${hechos} de ${prueba.guia.length} pasos ejecutados.`,
    tabla: {
      columnas: [{ label: '#' }, { label: 'Paso del procedimiento' }, { label: 'Ejecutado' }, { label: 'Nota' }],
      filas: prueba.guia.map((paso, i) => {
        const estado = d.papel.pasosEstado?.[String(i)]
        return [String(i + 1), paso, estado?.hecho ? 'Sí' : 'No', estado?.nota ?? '—']
      }),
    },
  }
}

/** Alcance y muestra seleccionada (NIA 530), con el resultado de cada partida revisada. */
function seccionMuestra(d: DatosCedulaPapel): SeccionRender {
  const m = d.muestra
  const alcance = d.papel.alcance?.trim()
  if (!m || m.items.length === 0) {
    return { label: 'Alcance', contenido: alcance || SIN_DOCUMENTAR }
  }

  const r = m.resumen
  const resumen =
    `Muestreo por cobertura y partidas clave sobre la cuenta ${m.codigoCuenta}. ` +
    `Población: ${r.numPoblacion} terceros por ${cop(r.saldoPoblacion)}. ` +
    `Muestra: ${r.numMuestra} terceros por ${cop(r.saldoMuestra)} — cobertura ${r.coberturaPct.toFixed(0)}% del saldo, ` +
    `de los cuales ${r.numClave} ${r.numClave === 1 ? 'es partida clave' : 'son partidas clave'} ` +
    `(saldo igual o superior a la materialidad de desempeño` +
    `${m.materialidad ? ` de ${cop(m.materialidad)}` : ''}).`

  const incluidos = m.items.filter((i) => i.incluido)
  const conDiferencia = incluidos.filter((i) => i.resultado === 'con_diferencia')
  const pendientes = incluidos.filter((i) => i.resultado === 'pendiente')
  const cierre = [
    conDiferencia.length > 0
      ? `Se detectaron diferencias en ${conDiferencia.length} de las ${incluidos.length} partidas revisadas, por ${cop(
          conDiferencia.reduce((acc, i) => acc + Number(i.diferencia ?? 0), 0),
        )}.`
      : 'No se detectaron diferencias en las partidas revisadas.',
    pendientes.length > 0 ? `Quedan ${pendientes.length} partidas pendientes de revisión.` : '',
  ].filter(Boolean).join(' ')

  return {
    label: 'Alcance y muestra (NIA 530)',
    contenido: [alcance, resumen, cierre].filter(Boolean).join('\n\n'),
    tabla: {
      columnas: [
        { label: 'Tercero' },
        { label: 'Saldo', derecha: true },
        { label: 'Selección' },
        { label: 'Resultado' },
        { label: 'Diferencia', derecha: true },
        { label: 'Nota' },
      ],
      filas: incluidos.map((i) => [
        [i.tercero, i.terceroNombre].filter(Boolean).join(' — ') || 'Sin identificar',
        cop(i.saldo),
        i.esClave ? 'Partida clave' : 'Cobertura',
        RESULTADO_ITEM_LABEL[i.resultado],
        i.diferencia ? cop(i.diferencia) : '—',
        i.nota ?? '—',
      ]),
    },
  }
}

/** Hallazgos: la narrativa del papel y cada hallazgo con sus cinco atributos. */
function seccionHallazgos(d: DatosCedulaPapel): SeccionRender {
  const narrativa = d.papel.hallazgos?.trim()
  if (d.hallazgos.length === 0) {
    return {
      label: 'Hallazgos',
      contenido: narrativa || 'No se identificaron hallazgos en la ejecución de esta prueba.',
    }
  }

  const detalle = d.hallazgos
    .map((h, i) => {
      const cabecera =
        `${i + 1}. [${TIPO_HALLAZGO_LABEL[h.tipo]} · severidad ${SEVERIDAD_HALLAZGO_LABEL[h.severidad]} · ` +
        `${ESTADO_HALLAZGO_LABEL[h.estado]}${h.monto !== null ? ` · ${cop(h.monto)}` : ''}` +
        `${h.cuentaCodigo ? ` · cuenta ${h.cuentaCodigo}` : ''}]`
      const lineas = [cabecera, `   Condición: ${h.descripcion}`]
      if (h.criterio) lineas.push(`   Criterio: ${h.criterio}`)
      if (h.causa) lineas.push(`   Causa: ${h.causa}`)
      if (h.efecto) lineas.push(`   Efecto: ${h.efecto}`)
      if (h.recomendacion) lineas.push(`   Recomendación: ${h.recomendacion}`)
      if (h.ajusteId) lineas.push('   Llevado a la hoja de ajustes (NIA 450).')
      return lineas.join('\n')
    })
    .join('\n\n')

  const sinResolver = d.hallazgos.filter((h) => h.estado === 'abierto' || h.estado === 'comunicado').length
  const cierre = sinResolver === 0
    ? ''
    : d.hallazgos.length === 1
      ? '\n\nEl hallazgo registrado sigue pendiente de decisión de la administración.'
      : `\n\nA la fecha de emisión, ${sinResolver} de los ${d.hallazgos.length} hallazgos siguen pendientes de decisión de la administración.`

  return {
    label: 'Hallazgos',
    contenido: [narrativa, detalle + cierre].filter(Boolean).join('\n\n'),
  }
}

/** Documentos pedidos al cliente para ejecutar la prueba (PBC). */
function seccionPbc(d: DatosCedulaPapel): SeccionRender | null {
  if (d.pbc.length === 0) return null
  return {
    label: 'Documentos solicitados al cliente (PBC)',
    tabla: {
      columnas: [{ label: 'Documento' }, { label: 'Estado' }, { label: 'Fecha límite' }, { label: 'Notas' }],
      filas: d.pbc.map((s) => [s.descripcion, ESTADO_PBC_LABEL[s.estado], fecha(s.fechaLimite), s.notas ?? '—']),
    },
  }
}

/** Evidencia del papel con su referencia cruzada (C-1.1, C-1.2…). */
function seccionEvidencia(d: DatosCedulaPapel): SeccionRender {
  const evs = d.papel.evidencias
  if (evs.length === 0) {
    return {
      label: 'Evidencia (NIA 230/500)',
      contenido: 'El papel no tiene evidencia adjunta a la fecha de emisión de esta cédula.',
    }
  }
  return {
    label: 'Evidencia (NIA 230/500)',
    contenido: 'La evidencia se conserva en el archivo digital del encargo bajo las referencias relacionadas.',
    tabla: {
      columnas: [{ label: 'Ref.' }, { label: 'Evidencia' }, { label: 'Tipo' }, { label: 'Soporte' }],
      // La lista llega en orden descendente (la más antigua es .1): en el documento se imprime al derecho.
      filas: [...evs].reverse().map((ev, i) => [
        `${d.papel.indice}.${i + 1}`,
        [ev.nombre, ev.descripcion].filter(Boolean).join('\n'),
        TIPO_EVIDENCIA_LABEL[ev.tipo] ?? ev.tipo,
        ev.archivoNombre ?? ev.enlaceExterno ?? 'Sin archivo',
      ]),
    },
  }
}

/** Notas de revisión del supervisor (NIA 220) — solo si el usuario decide incluirlas. */
function seccionNotas(d: DatosCedulaPapel): SeccionRender | null {
  if (!d.notas || d.notas.length === 0) return null
  return {
    label: 'Notas de revisión (NIA 220)',
    tabla: {
      columnas: [{ label: 'Fecha' }, { label: 'Revisor' }, { label: 'Observación' }, { label: 'Estado' }],
      filas: d.notas.map((n) => [
        fecha(n.createdAt),
        d.nombreUsuario(n.creadoPor),
        [n.texto, n.respuesta ? `Respuesta: ${n.respuesta}` : ''].filter(Boolean).join('\n'),
        n.estado === 'resuelta' ? `Resuelta (${fecha(n.resueltoAt)})` : 'Abierta',
      ]),
    },
  }
}

/** Espacio de firmas del preparador y del revisor, como en la cédula en papel. */
function seccionResponsables(d: DatosCedulaPapel): SeccionRender {
  const { papel } = d
  return {
    label: 'Responsables',
    contenido:
      `Preparado por: ${d.nombreUsuario(papel.preparadoPor)}\n` +
      '_______________________________\n\n' +
      `Revisado y aprobado por: ${papel.estado === 'aprobado' ? `${d.nombreUsuario(papel.aprobadoPor)} — ${fecha(papel.aprobadoAt)}` : 'pendiente'}\n` +
      '_______________________________',
  }
}

/** Arma el documento completo de la cédula del papel de trabajo. */
export function exportOptsPapel(d: DatosCedulaPapel): ExportOpts {
  const secciones: (SeccionRender | null)[] = [
    seccionIdentificacion(d),
    { label: 'Procedimiento aplicado', contenido: d.papel.procedimiento?.trim() || SIN_DOCUMENTAR },
    seccionPrograma(d),
    seccionMuestra(d),
    seccionHallazgos(d),
    seccionPbc(d),
    seccionEvidencia(d),
    seccionNotas(d),
    { label: 'Conclusión', contenido: d.papel.conclusion?.trim() || SIN_DOCUMENTAR },
    seccionResponsables(d),
  ]

  return {
    titulo: `Papel de trabajo ${d.papel.indice} — ${d.papel.titulo}`,
    empresaNombre: d.empresaNombre,
    periodo: d.periodo,
    firma: d.firma,
    secciones: secciones.filter((s): s is SeccionRender => s !== null),
  }
}

/** Nombre del archivo para la descarga en Word. */
export function nombreArchivoPapel(d: { papel: PapelParaCedula; empresaNombre: string }): string {
  const limpio = (s: string) => s.replace(/[^\w]+/g, '_')
  return `Papel_${limpio(d.papel.indice)}_${limpio(d.papel.titulo)}_${limpio(d.empresaNombre)}`
}
