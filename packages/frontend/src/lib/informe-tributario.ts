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
  ESTADO_HALLAZGO_TRIBUTARIO_LABELS,
  IMPUESTOS_CATALOGO,
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

  if (revision.adjuntos.length > 0) {
    secciones.push({
      label: 'Soportes de la revisión',
      // Lo subido después de firmar no estaba en el snapshot: se declara como tal.
      contenido: revision.adjuntos
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
