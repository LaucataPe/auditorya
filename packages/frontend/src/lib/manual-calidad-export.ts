import {
  DECISION_CAMBIO_LABEL,
  RESULTADO_EVALUACION_LABEL,
  esHtmlInforme,
  textoPlanoAHtml,
  type DecisionCambioRelevante,
  type ManualCalidad,
} from '@auditorya/types'
import type { ExportOpts, FirmaMembrete, SeccionRender } from './informe-export'

/** Escapa texto escrito por la firma antes de meterlo en el HTML del documento. */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const fechaLarga = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * Arma el Manual del sistema de gestión de calidad desde la foto guardada en su versión.
 * Los datos de identificación salen de la foto (como estaban al generarlo); de la firma
 * actual solo se toma la marca (logo, color, fuentes) para el membrete.
 */
export function exportOptsManualCalidad(
  manual: ManualCalidad,
  marca: FirmaMembrete | null | undefined,
  etiquetaAccion: (accion: string) => string,
): ExportOpts {
  const m = manual.contenido
  const domicilio = m.firma.direccion ? `${m.firma.direccion}, ${m.firma.ciudad}` : m.firma.ciudad

  const secciones: SeccionRender[] = [
    {
      label: 'Identificación de la firma',
      tabla: {
        columnas: [{ label: 'Dato' }, { label: 'Valor' }],
        filas: [
          ['Razón social', m.firma.nombre],
          ['NIT', m.firma.nit],
          ['Domicilio', domicilio],
          ['Teléfono', m.firma.telefono ?? '—'],
          ['Correo', m.firma.email ?? '—'],
          ['Inscripción ante la JCC', m.firma.inscripcionJcc ?? '—'],
          ['Responsable del sistema de calidad', m.responsable ?? '—'],
        ],
      },
    },
    {
      label: 'Marco normativo y alcance',
      contenido:
        `<p>${esc(m.firma.nombre)} diseña, implementa y opera su sistema de gestión de calidad conforme a la Norma Internacional de Gestión de la Calidad 1 (NIGC 1), aplicada de forma anticipada, lo que cubre también los elementos de la Norma Internacional de Control de Calidad 1 (NICC 1) vigente en Colombia (Decreto 2420 de 2015 y sus modificaciones).</p>` +
        `<p>El sistema aplica a todos los encargos de auditoría, revisoría fiscal, revisión y demás encargos de aseguramiento y servicios relacionados que presta la firma. Se organiza en ocho componentes; para cada uno la firma define objetivos de calidad, identifica los riesgos que podrían impedir alcanzarlos y diseña respuestas a esos riesgos.</p>`,
    },
  ]

  m.componentes.forEach((c, i) => {
    const filas: string[][] = []
    const objetivos = c.objetivos
      .map((o, j) => {
        const num = `${i + 1}.${j + 1}`
        for (const r of o.riesgos) {
          // El riesgo se escribe una sola vez aunque tenga varias respuestas.
          r.respuestas.forEach((a, k) =>
            filas.push([k === 0 ? num : '', k === 0 ? r.descripcion : '', a.descripcion, a.evidencia ?? '—']),
          )
          if (r.respuestas.length === 0) filas.push([num, r.descripcion, '—', '—'])
        }
        return `<p><strong>Objetivo ${num}.</strong> ${esc(o.texto)}</p>`
      })
      .join('')
    secciones.push({
      label: `${i + 1}. ${c.titulo} (${c.ref})`,
      contenido: `<p>${esc(c.descripcion)}</p>${objetivos}`,
      tabla: {
        columnas: [{ label: 'Obj.' }, { label: 'Riesgo de calidad' }, { label: 'Respuesta' }, { label: 'Cómo se evidencia' }],
        filas,
      },
    })
  })

  secciones.push({
    label: 'Políticas y formatos firmados',
    tabla: {
      columnas: [{ label: 'Anexo' }, { label: 'Documento' }, { label: 'Versión' }, { label: 'Firmado por' }, { label: 'Fecha' }, { label: 'Vigencia' }],
      filas: m.formatos.map((f, i) => [
        LETRAS[i] ?? String(i + 1),
        f.cubiertoPor ? `${f.titulo} (cubierto por «${f.cubiertoPor.nombre}»)` : f.archivoNombre ? `${f.titulo} (documento propio)` : f.titulo,
        String(f.version),
        (f.cubiertoPor ? f.cubiertoPor.aprobadoPor : f.firmadoPor) ?? '—',
        fechaLarga(f.firmadoAt),
        f.vigenteHasta ? `Hasta ${fechaLarga(f.vigenteHasta)}` : 'Permanente',
      ]),
    },
  })

  const ev = m.evaluacion
  secciones.push({
    label: `Evaluación anual del sistema ${m.anio}`,
    contenido: ev.resultado
      ? `<p><strong>${esc(RESULTADO_EVALUACION_LABEL[ev.resultado])}.</strong> Concluida por ${esc(ev.concluidoPor ?? '—')} el ${fechaLarga(ev.concluidoAt!)}, con corte al ${fechaLarga(ev.fechaCorte)}.</p>` +
        textoPlanoAHtml(ev.conclusion ?? '') +
        (ev.deficiencias ? `<p><strong>Deficiencias y acciones correctivas.</strong></p>${textoPlanoAHtml(ev.deficiencias)}` : '')
      : `<p>La evaluación del año ${m.anio}, con corte al ${fechaLarga(ev.fechaCorte)}, está en curso. Los ocho componentes fueron revisados y se encuentran cumplidos a la fecha de este manual.</p>`,
  })

  if (m.cambiosRelevantes?.length) {
    secciones.push({
      label: `Cambios relevantes ${m.anio}`,
      contenido:
        '<p>Cambios en la firma o en su entorno que obligaron a mirar de nuevo el sistema (NIGC 1 ¶27), con la decisión tomada en cada caso.</p>',
      tabla: {
        columnas: [{ label: 'Fecha' }, { label: 'Cambio' }, { label: 'Componentes' }, { label: 'Decisión' }],
        filas: m.cambiosRelevantes.map((x) => [
          fechaLarga(x.fecha),
          `${x.tipo}: ${x.descripcion}`,
          x.componentes.join(', '),
          x.decision
            ? `${DECISION_CAMBIO_LABEL[x.decision as DecisionCambioRelevante] ?? x.decision}. ${x.justificacion ?? ''}`
            : 'Sin evaluar',
        ]),
      },
    })
  }

  if (m.cambios.length > 0) {
    secciones.push({
      label: `Control de cambios ${m.anio}`,
      tabla: {
        columnas: [{ label: 'Fecha' }, { label: 'Cambio' }, { label: 'Detalle' }, { label: 'Por' }],
        filas: m.cambios.map((x) => [fechaLarga(x.fecha), etiquetaAccion(x.accion), x.detalle ?? '—', x.usuario ?? '—']),
      },
    })
  }

  m.formatos.forEach((f, i) => {
    const cuerpo = f.cubiertoPor
      ? `<p>Cubierto por el documento de la firma «${esc(f.cubiertoPor.nombre)}»${f.cubiertoPor.referencia ? `, ${esc(f.cubiertoPor.referencia)}` : ''}, aprobado el ${fechaLarga(f.cubiertoPor.fechaAprobacion)}${f.cubiertoPor.aprobadoPor ? ` por ${esc(f.cubiertoPor.aprobadoPor)}` : ''}. El original se conserva en AuditorYa como evidencia del sistema.</p>`
      : f.archivoNombre
      ? `<p>Documento propio de la firma, firmado el ${fechaLarga(f.firmadoAt)}: «${esc(f.archivoNombre)}». El original se conserva en AuditorYa como evidencia del sistema.</p>`
      : f.secciones
          .map((s) => `<p><strong>${esc(s.label)}</strong></p>${esHtmlInforme(s.contenido) ? s.contenido : textoPlanoAHtml(s.contenido)}`)
          .join('')
    secciones.push({
      label: `Anexo ${LETRAS[i] ?? i + 1}. ${f.titulo} (versión ${f.version})`,
      contenido: cuerpo + `<p><em>Firmado por ${esc(f.firmadoPor ?? '—')} el ${fechaLarga(f.firmadoAt)}.</em></p>`,
    })
  })

  secciones.push({
    label: 'Aprobación',
    contenido:
      `<p>Manual generado y firmado electrónicamente en AuditorYa por ${esc(manual.generadoPorNombre ?? '—')} el ${fechaLarga(manual.generadoAt)}. Versión ${manual.version}.</p>` +
      (m.reemplaza
        ? `<p>Reemplaza la versión ${m.reemplaza.version} del ${fechaLarga(m.reemplaza.fecha)}${m.reemplaza.externo ? ', elaborada fuera de AuditorYa' : ''}.</p>`
        : '') +
      `<p>Huella del contenido (SHA-256): ${manual.hash.slice(0, 16)}…</p>`,
  })

  return {
    titulo: 'Manual del sistema de gestión de calidad',
    empresaNombre: `${m.firma.nombre} · Versión ${manual.version} · Evaluación ${m.anio}`,
    periodo: '',
    firma: marca
      ? { ...marca, nombre: m.firma.nombre, nit: m.firma.nit, ciudad: m.firma.ciudad, direccion: m.firma.direccion }
      : { nombre: m.firma.nombre, nit: m.firma.nit, ciudad: m.firma.ciudad, direccion: m.firma.direccion },
    secciones,
  }
}

export function nombreArchivoManual(manual: ManualCalidad): string {
  return `Manual_calidad_v${manual.version}_${manual.anio}`
}
