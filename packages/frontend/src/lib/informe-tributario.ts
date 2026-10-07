/**
 * Documentos de la revisión tributaria (client-side, mismo pipeline de
 * lib/informe-export con membrete de la firma). Ambos se estructuran como
 * papel de trabajo (NIA 230): alcance → procedimientos → ejecución →
 * hallazgos → conclusión → soportes. Las cifras declarado vs. libros NO salen:
 * las diferencias se informan al auditor en la app y solo trascienden al
 * documento si él las registra como hallazgo.
 *  - Informe preliminar: comunica el avance y las recomendaciones parciales
 *    mientras la revisión está abierta.
 *  - Constancia de revisión: certifica, con la revisión ya firmada, que el
 *    impuesto fue revisado y aprobado (o las discrepancias encontradas).
 */
import {
  ESTADO_FILA_LABEL,
  ESTADO_HALLAZGO_TRIBUTARIO_LABELS,
  FASE_CEDULA_LABEL,
  IMPUESTOS_CATALOGO,
  ORDEN_FASES_CEDULA,
  RESULTADO_CONCLUSION_LABEL,
  estadoConclusionCedula,
  formatoCeldaCedula,
  alcanceSugerido,
  etiquetaPeriodo,
  hallazgoTributarioPendiente,
  nombreObligacion,
  procedimientosSugeridos,
  type RevisionTributariaDetalle,
} from '@auditorya/types'
import { parsearFecha } from './fechas'
import { formatoCOP } from './moneda'
import type { ExportOpts, FirmaMembrete } from './informe-export'

const SEVERIDAD_LABEL: Record<string, string> = { alta: 'ALTA', media: 'MEDIA', baja: 'BAJA' }
const ESTADO_PROPUESTA_TEXTO: Record<string, string> = {
  propuesta: 'sin decidir', aprobada: 'aprobada', ajustada: 'aprobada con ajustes', omitida: 'omitida', descartada: 'descartada',
}
const TIPO_PROPUESTA_TEXTO: Record<string, string> = {
  hallazgo: 'Hallazgo', juicio: 'Verificación', documento: 'Documento requerido', ambiguedad: 'Aclaración', materialidad: 'Materialidad', riesgo: 'Riesgo',
}

function fechaHora(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/**
 * Procedimientos automatizados (NIA 230): qué corrió el agente, con qué insumos,
 * qué propuso y qué decidió el auditor sobre cada propuesta. Solo lo registrado en
 * las tablas del agente; la bitácora completa queda en la plataforma.
 */
function textoAgente(agente: NonNullable<RevisionTributariaDetalle['agente']>): string {
  const insumos = [
    ...agente.insumos.auxiliares.map((a) => `${a.nombre} (${a.archivo}; ${a.enPeriodo} asientos del período en ${a.cuentas.length} cuentas${a.cierres ? `, ${a.cierres} asiento(s) de cierre excluidos` : ''})`),
    agente.insumos.dian ? `Reporte de documentos electrónicos DIAN (${agente.insumos.dian.archivo}; ${agente.insumos.dian.documentos} documentos)` : null,
    agente.insumos.anterior ? `Revisión del período anterior en la plataforma (${agente.insumos.anterior})` : null,
  ].filter(Boolean) as string[]
  const partes: string[] = []
  partes.push(
    `Análisis determinista (sin inteligencia artificial generativa) ejecutado el ${fechaHora(agente.terminadaAt)}${agente.iniciadaNombre ? ` por solicitud de ${agente.iniciadaNombre}` : ''}. ` +
      `Reglas ejecutadas (${agente.reglasEjecutadas.length}): ${agente.reglasEjecutadas.join(', ') || 'ninguna'}.`,
  )
  partes.push(insumos.length ? `Insumos:\n${insumos.map((i) => `• ${i}`).join('\n')}` : 'Insumos: solo las cifras declaradas digitadas en la revisión.')
  if (agente.limitaciones.length) {
    partes.push(`Lo que no se pudo verificar:\n${agente.limitaciones.map((l) => `• ${l.regla}: ${l.motivo}`).join('\n')}`)
  }
  const decididas = agente.propuestas.filter((p) => p.estado !== 'propuesta')
  const sinDecidir = agente.propuestas.length - decididas.length
  if (agente.propuestas.length === 0) {
    partes.push('El análisis no produjo propuestas: no se encontraron diferencias por encima del redondeo del formulario con los insumos disponibles.')
  } else {
    partes.push(
      `Propuestas del análisis (${agente.propuestas.length}${sinDecidir ? `, ${sinDecidir} sin decidir` : ''}):\n` +
        agente.propuestas
          .map((p) => {
            const cabeza = `• ${p.codigo ? `${p.codigo} · ` : ''}${TIPO_PROPUESTA_TEXTO[p.tipo] ?? p.tipo}: ${p.titulo}${p.monto != null && p.tipo === 'hallazgo' ? ` (${formatoCOP(p.monto)})` : ''}${p.reglas.length ? ` [${p.reglas.join(', ')}]` : ''}`
            const decision = p.estado === 'propuesta'
              ? '   Sin decisión registrada.'
              : `   ${ESTADO_PROPUESTA_TEXTO[p.estado] ?? p.estado}${p.decididaNombre ? ` por ${p.decididaNombre}` : ''}${p.decididaAt ? ` el ${fechaHora(p.decididaAt)}` : ''}${p.motivoDecision ? `: ${p.motivoDecision}` : ''}${
                p.entidadDestino === 'hallazgo_tributario' ? ' → registrada como hallazgo' : p.entidadDestino === 'checklist' ? ' → punto del programa verificado' : ''
              }.`
            return `${cabeza}\n${decision}`
          })
          .join('\n'),
    )
  }
  return partes.join('\n\n')
}

type Agente = NonNullable<RevisionTributariaDetalle['agente']>

const cedulasOrdenadas = (agente: Agente) =>
  [...(agente.cedulas ?? [])].sort((a, b) => ORDEN_FASES_CEDULA.indexOf(a.fase) - ORDEN_FASES_CEDULA.indexOf(b.fase))

function textoConclusionCedula(agente: Agente, cedula: Agente['cedulas'][number]): string {
  const c = agente.conclusiones?.[cedula.id]
  if (!c) return 'Sin conclusión del auditor.'
  const vigente = estadoConclusionCedula(cedula, agente.conclusiones) === 'vigente'
  return `${RESULTADO_CONCLUSION_LABEL[c.resultado].toUpperCase()}. ${c.texto}\n— ${c.porNombre ?? 'Auditor'}, ${fechaHora(c.at)}${vigente ? '' : ' (anterior al último análisis: pendiente de reconfirmar)'}`
}

/**
 * Para el informe y la constancia: qué procedimientos se ejecutaron y qué concluyó
 * el auditor en cada uno. Sin cifras (las cifras están en las cédulas, que son
 * papel de trabajo interno).
 */
function textoProcedimientosConcluidos(agente: Agente): string {
  return cedulasOrdenadas(agente)
    .map((c, i) => {
      if (c.estado !== 'ejecutada') return `${i + 1}. ${c.titulo}\n   No ejecutado: ${c.motivo ?? ''}${agente.conclusiones?.[c.id] ? `\n   ${textoConclusionCedula(agente, c).replace(/\n/g, '\n   ')}` : ''}`
      return `${i + 1}. ${c.titulo}\n   ${textoConclusionCedula(agente, c).replace(/\n/g, '\n   ')}`
    })
    .join('\n\n')
}

/**
 * Cédulas de la revisión (papel de trabajo interno, NIA 230): cada procedimiento
 * con objetivo, criterio, fuente, todo lo comparado y la conclusión del auditor.
 * A diferencia del informe, aquí sí van las cifras.
 */
export function exportOptsCedulasRevision(args: { revision: RevisionTributariaDetalle; empresaNombre: string; firma?: FirmaMembrete | null }): ExportOpts | null {
  const { revision, empresaNombre, firma } = args
  const agente = revision.agente
  if (!agente?.cedulas?.length) return null
  const obligacion = revision.obligacion
  const secciones: ExportOpts['secciones'] = []
  secciones.push({
    label: 'Origen de las cédulas',
    contenido:
      `Procedimientos preparados por análisis determinista (sin inteligencia artificial generativa) el ${fechaHora(agente.terminadaAt)}${agente.iniciadaNombre ? `, por solicitud de ${agente.iniciadaNombre}` : ''}. ` +
      'Cada cédula muestra la totalidad de las partidas comparadas. La conclusión de cada procedimiento es del auditor que la suscribe.',
  })
  cedulasOrdenadas(agente).forEach((c, i) => {
    const titulo = `${i + 1}. ${c.titulo}`
    secciones.push({
      label: titulo,
      contenido: [
        `Fase: ${FASE_CEDULA_LABEL[c.fase]}.`,
        `Objetivo: ${c.objetivo}`,
        `Criterio y tolerancia: ${c.criterio}`,
        `Fuente: ${c.fuentes.join(' · ')}`,
        `Reglas aplicadas: ${c.reglas.join(', ')}.`,
        c.estado === 'ejecutada'
          ? `Resultado: ${c.resultado.filas} partida(s); ${c.resultado.conformes} conforme(s), ${c.resultado.diferencias} con diferencia, ${c.resultado.porConfirmar} por confirmar, ${c.resultado.noVerificables} no verificable(s).`
          : `No ejecutado: ${c.motivo ?? ''}`,
        c.limitaciones.length ? `Limitaciones: ${c.limitaciones.join(' ')}` : null,
      ].filter(Boolean).join('\n'),
    })
    for (const t of c.tablas) {
      const conNota = t.filas.some((f) => f.nota || f.propuesta)
      secciones.push({
        label: `${titulo.split('.')[0]}. ${t.titulo}`,
        contenido: [t.descripcion, t.omitidas ? `${t.omitidas} fila(s) adicionales están en el archivo fuente.` : null].filter(Boolean).join(' ') || undefined,
        tabla: {
          columnas: [...t.columnas.map((col) => ({ label: col.titulo, derecha: col.formato !== 'texto' })), { label: 'Resultado' }, ...(conNota ? [{ label: 'Nota' }] : [])],
          filas: t.filas.map((f) => [
            ...t.columnas.map((col) => formatoCeldaCedula(f.valores[col.clave], col.formato)),
            ESTADO_FILA_LABEL[f.estado],
            ...(conNota ? [[f.propuesta, f.nota].filter(Boolean).join(' · ')] : []),
          ]),
        },
      })
    }
    const propuestas = agente.propuestas.filter((p) => c.propuestas.includes(p.codigo ?? ''))
    if (propuestas.length) {
      secciones.push({
        label: `${titulo.split('.')[0]}. Propuestas y decisiones`,
        contenido: propuestas.map((p) => `• ${p.codigo} · ${p.titulo}: ${ESTADO_PROPUESTA_TEXTO[p.estado] ?? p.estado}${p.decididaNombre ? ` por ${p.decididaNombre}` : ''}${p.motivoDecision ? ` (${p.motivoDecision})` : ''}.`).join('\n'),
      })
    }
    if (c.estado === 'ejecutada' || agente.conclusiones?.[c.id]) {
      secciones.push({ label: `${titulo.split('.')[0]}. Conclusión del auditor`, contenido: textoConclusionCedula(agente, c) })
    }
  })
  return {
    titulo: `Cédulas de revisión — ${nombreObligacion(obligacion)}`,
    empresaNombre,
    periodo: `${etiquetaPeriodo(obligacion.periodicidad, revision.periodo)} ${obligacion.anioFiscal}`,
    secciones,
    firma,
  }
}

function fechaLarga(iso: string | null): string {
  if (!iso) return '—'
  return parsearFecha(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
}

function textoChecklist(revision: RevisionTributariaDetalle): string {
  const catalogo = IMPUESTOS_CATALOGO[revision.obligacion.tipo].checklist
  return catalogo
    .map((item) => {
      const estado = revision.checklistEstado[item.id]
      const marca = estado?.hecho ? '✓' : '✗'
      const nota = estado?.nota ? ` — ${estado.nota}` : ''
      return `${marca} ${item.texto}${nota}`
    })
    .join('\n')
}

function textoHallazgos(revision: RevisionTributariaDetalle, opts: { conSeguimiento: boolean }): string {
  return revision.hallazgos
    .map((h, i) => {
      const lineas = [
        `${i + 1}. [${ESTADO_HALLAZGO_TRIBUTARIO_LABELS[h.estado].toUpperCase()} · severidad ${SEVERIDAD_LABEL[h.severidad]}${
          h.monto !== null ? ` · ${formatoCOP(Number(h.monto))}` : ''
        }] ${h.descripcion}`,
      ]
      if (h.recomendacion) lineas.push(`   Recomendación: ${h.recomendacion}`)
      // La evidencia se lista dentro de su hallazgo, no en los soportes generales.
      const evidencia = revision.adjuntos.filter((a) => a.hallazgoId === h.id)
      if (evidencia.length > 0) {
        lineas.push(`   Evidencia: ${evidencia.map((a) => a.archivoNombre).join(' · ')}`)
      }
      if (opts.conSeguimiento && h.seguimiento) lineas.push(`   Seguimiento: ${h.seguimiento}`)
      return lineas.join('\n')
    })
    .join('\n\n')
}

function avanceChecklist(revision: RevisionTributariaDetalle): { hechos: number; total: number } {
  const catalogo = IMPUESTOS_CATALOGO[revision.obligacion.tipo].checklist
  return {
    hechos: catalogo.filter((i) => revision.checklistEstado[i.id]?.hecho).length,
    total: catalogo.length,
  }
}

export function exportOptsRevisionTributaria(args: {
  revision: RevisionTributariaDetalle
  empresaNombre: string
  firma?: FirmaMembrete | null
  preliminar: boolean
}): ExportOpts {
  const { revision, empresaNombre, firma, preliminar } = args
  const obligacion = revision.obligacion
  const nombre = nombreObligacion(obligacion)
  const periodoEtiqueta = `${etiquetaPeriodo(obligacion.periodicidad, revision.periodo)} ${obligacion.anioFiscal}`
  const { hechos, total } = avanceChecklist(revision)
  const pendientes = revision.hallazgos.filter(hallazgoTributarioPendiente).length

  const secciones: ExportOpts['secciones'] = []

  // El documento se lee como papel de trabajo (NIA 230): qué se propuso
  // revisar, con qué procedimientos, qué se ejecutó y qué resultó.
  secciones.push({
    label: 'Alcance de la revisión',
    contenido:
      revision.alcance?.trim() ||
      alcanceSugerido({ obligacion, periodo: revision.periodo, empresaNombre }),
  })
  secciones.push({
    label: 'Procedimientos aplicados',
    contenido: revision.procedimientos?.trim() || procedimientosSugeridos(obligacion.tipo),
  })

  if (preliminar) {
    secciones.push({
      label: 'Estado de la revisión',
      contenido:
        `Avance del programa de verificación: ${hechos} de ${total} puntos completados.` +
        (obligacion.asignadoNombre ? `\nResponsable de la revisión: ${obligacion.asignadoNombre}.` : '') +
        `\n\nEste informe es PRELIMINAR: comunica el avance y las recomendaciones parciales a la fecha; las cifras y conclusiones pueden cambiar hasta la firma de la revisión.`,
    })
  } else {
    secciones.push({
      label: 'Certificación de la revisión',
      contenido:
        `En desarrollo de las funciones de revisoría fiscal, se deja constancia de que ${nombre}, período ${periodoEtiqueta}, de ${empresaNombre}, fue objeto de revisión conforme al programa de verificación del impuesto (${hechos} de ${total} puntos completados).\n\n` +
        `La revisión fue firmada${revision.revisadoNombre ? ` por ${revision.revisadoNombre}` : ''} el ${fechaLarga(revision.revisadoAt)}, con resultado: ${
          revision.resultado === 'con_observaciones' ? 'CON OBSERVACIONES' : 'SIN OBSERVACIONES'
        }.\n` +
        `Al momento de la firma, el contenido de la revisión (verificaciones, cifras, hallazgos y soportes) quedó sellado de forma inmutable como constancia.` +
        // Solo si está registrada: que no figure en la plataforma no prueba que no se presentó.
        (revision.fechaPresentacion
          ? `\n\nLa declaración fue presentada el ${fechaLarga(revision.fechaPresentacion)}${
              revision.fechaVencimiento ? ` (fecha de vencimiento: ${fechaLarga(revision.fechaVencimiento)})` : ''
            }.`
          : ''),
    })
  }

  // El detalle de lo ejecutado va en ambos documentos: en el preliminar es el
  // avance del programa, en la constancia es la evidencia de lo verificado.
  secciones.push({
    label: preliminar ? 'Ejecución del programa a la fecha' : 'Verificaciones realizadas',
    contenido: textoChecklist(revision),
  })

  // Lo que hizo el agente queda documentado como procedimiento automatizado,
  // con sus insumos, limitaciones y la decisión humana sobre cada propuesta.
  if (revision.agente) {
    secciones.push({ label: 'Procedimientos automatizados', contenido: textoAgente(revision.agente) })
    if (revision.agente.cedulas?.length) {
      secciones.push({ label: 'Conclusiones por procedimiento', contenido: textoProcedimientosConcluidos(revision.agente) })
    }
  }

  // Sin sección de cifras: las diferencias declarado vs. libros se informan al
  // auditor en la app; al documento solo llega lo registrado como hallazgo. Por
  // eso los textos dicen "documentados": afirmar "no se identificaron
  // discrepancias" sería falso si hubo diferencias que no se documentaron.
  const tituloHallazgos = preliminar ? 'Hallazgos y recomendaciones parciales' : 'Hallazgos y recomendaciones'
  secciones.push({
    label: tituloHallazgos,
    contenido:
      revision.hallazgos.length === 0
        ? preliminar
          ? 'A la fecha de este informe no se han documentado hallazgos.'
          : 'No se documentaron hallazgos en la revisión de este período.'
        : textoHallazgos(revision, { conSeguimiento: !preliminar }) +
          (pendientes > 0 && !preliminar
            ? `\n\nQuedan ${pendientes} hallazgo(s) en seguimiento a la fecha de emisión de este documento.`
            : ''),
  })

  if (revision.observaciones?.trim()) {
    secciones.push({ label: 'Observaciones', contenido: revision.observaciones })
  }
  if (!preliminar && revision.conclusion?.trim()) {
    secciones.push({ label: 'Conclusión', contenido: revision.conclusion })
  }

  const soportes = revision.adjuntos.filter((a) => a.hallazgoId === null)
  if (soportes.length > 0) {
    secciones.push({
      label: 'Soportes de la revisión',
      // Lo subido después de firmar no estaba en el snapshot: se declara como tal.
      contenido: soportes
        .map((a) => `• ${a.nombre} (${a.archivoNombre})${a.posteriorAFirma ? ' — incorporado después de la firma' : ''}`)
        .join('\n'),
    })
  }

  return {
    titulo: preliminar ? `Informe preliminar de revisión — ${nombre}` : `Constancia de revisión — ${nombre}`,
    empresaNombre,
    periodo: periodoEtiqueta,
    secciones,
    firma,
  }
}

export function nombreArchivoCedulas(args: { revision: RevisionTributariaDetalle; empresaNombre: string }): string {
  const limpio = (s: string) => s.replace(/[^\w]+/g, '_')
  return `Cedulas_${limpio(nombreObligacion(args.revision.obligacion))}_${args.revision.periodo}_${args.revision.obligacion.anioFiscal}_${limpio(args.empresaNombre)}`
}

/** Nombre de archivo para la descarga en Word. */
export function nombreArchivoRevision(args: {
  revision: RevisionTributariaDetalle
  empresaNombre: string
  preliminar: boolean
}): string {
  const limpio = (s: string) => s.replace(/[^\w]+/g, '_')
  const base = args.preliminar ? 'Informe_preliminar' : 'Constancia_revision'
  return `${base}_${limpio(nombreObligacion(args.revision.obligacion))}_${args.revision.periodo}_${args.revision.obligacion.anioFiscal}_${limpio(args.empresaNombre)}`
}
