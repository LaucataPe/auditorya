/**
 * Exportación de informes:
 *  - imprimirInforme: renderiza el documento en un iframe oculto y lanza el diálogo de impresión
 *    (→ el usuario guarda como PDF).
 *  - descargarDocx: genera un .docx real con la librería `docx` (importada de forma perezosa para no
 *    engordar el bundle inicial).
 *
 * Identidad visual de los documentos (PDF y Word comparten la misma jerarquía):
 *  - Acento de marca en COLOR_MARCA (membrete, títulos de sección, tablas).
 *  - Titulares y cuerpo en las fuentes de la firma (defectos: Arial y Georgia) para el tono
 *    formal de una carta.
 */

import { FUENTE_TITULOS_DEFECTO, FUENTE_CUERPO_DEFECTO } from '@auditorya/types'

/** Acento por defecto (indigo-700, alineado con la UI); cada firma puede definir el suyo. */
const COLOR_MARCA_DEFECTO = '#4338CA'
const TINTA = '#111827'
const GRIS = '#6b7280'
const BORDE = '#e5e7eb'

export type FirmaMembrete = {
  nombre: string
  nit: string
  ciudad: string
  /** Color de acento de la firma ('#rrggbb') o null → COLOR_MARCA_DEFECTO. */
  colorMarca?: string | null
  /** Logo en data URI (png/jpeg/webp) o null → membrete solo con texto. */
  logo?: string | null
  /** Fuente de titulares (catálogo FUENTES_DOCUMENTO) o null → FUENTE_TITULOS_DEFECTO. */
  fuenteTitulos?: string | null
  /** Fuente del cuerpo (catálogo FUENTES_DOCUMENTO) o null → FUENTE_CUERPO_DEFECTO. */
  fuenteCuerpo?: string | null
}

/** Acento efectivo del documento: el de la firma si es un hex válido, o el de la app. */
function acentoDe(firma?: FirmaMembrete | null): string {
  const c = firma?.colorMarca
  return c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : COLOR_MARCA_DEFECTO
}

/** Pila CSS de cada fuente del catálogo, con respaldos por si el visor no la tiene. */
const PILA_FUENTE: Record<string, string> = {
  // Aptos viene con Office/M365 (no con el SO): la pila sigue la cadena de sustitución de Microsoft.
  Aptos: "Aptos, 'Segoe UI', Calibri, Arial, sans-serif",
  Arial: 'Arial, Helvetica, sans-serif',
  Calibri: "Calibri, 'Segoe UI', Arial, sans-serif",
  Cambria: 'Cambria, Georgia, serif',
  Garamond: "Garamond, 'Times New Roman', serif",
  Georgia: "Georgia, 'Times New Roman', serif",
  Tahoma: 'Tahoma, Verdana, sans-serif',
  'Times New Roman': "'Times New Roman', Times, serif",
  'Trebuchet MS': "'Trebuchet MS', Tahoma, sans-serif",
  Verdana: 'Verdana, Tahoma, sans-serif',
}

/** Fuente de titulares efectiva: la de la firma si está en el catálogo, o la de defecto. */
function fuenteTitulosDe(firma?: FirmaMembrete | null): string {
  const f = firma?.fuenteTitulos
  return f && f in PILA_FUENTE ? f : FUENTE_TITULOS_DEFECTO
}

/** Fuente del cuerpo (párrafos) efectiva: la de la firma o la de defecto. */
function fuenteCuerpoDe(firma?: FirmaMembrete | null): string {
  const f = firma?.fuenteCuerpo
  return f && f in PILA_FUENTE ? f : FUENTE_CUERPO_DEFECTO
}
type SeccionRender = { label: string; contenido: string }

export type ExportOpts = {
  titulo: string
  empresaNombre: string
  periodo: string
  secciones: SeccionRender[]
  firma?: FirmaMembrete | null
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Subtítulo del documento: omite el período si no viene informado. */
function subtitulo(opts: { empresaNombre: string; periodo: string }): string {
  return opts.periodo ? `${opts.empresaNombre} — Período ${opts.periodo}` : opts.empresaNombre
}

/** Fecha de emisión del documento, p. ej. "6 de agosto de 2026". */
function fechaEmision(): string {
  return new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Dispara la descarga de un blob como archivo con el nombre indicado. */
function descargarBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/* ── Piezas compartidas del HTML (PDF) ──────────────────────────────────── */

const estilosDocumento = (ACENTO: string, TITULOS: string, CUERPO: string) => `
  @page {
    margin: 2.2cm 2.2cm 2.6cm;
    @bottom-center {
      content: "Página " counter(page) " de " counter(pages);
      font-family: ${TITULOS}; font-size: 8.5pt; color: #9ca3af;
    }
  }
  body {
    font-family: ${CUERPO};
    color: ${TINTA}; line-height: 1.55; font-size: 11.5pt;
    max-width: 720px; margin: 0 auto; padding: 28px;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .membrete {
    display: flex; justify-content: space-between; align-items: flex-end; gap: 16px;
    border-bottom: 2.5px solid ${ACENTO}; padding-bottom: 10px;
  }
  .membrete .identidad { display: flex; align-items: center; gap: 12px; }
  .membrete .logo { max-height: 42px; max-width: 130px; display: block; }
  .membrete .firma-nombre {
    font-family: ${TITULOS};
    font-size: 13.5pt; font-weight: bold; margin: 0; color: ${TINTA}; letter-spacing: .2px;
  }
  .membrete .firma-datos {
    font-family: ${TITULOS};
    font-size: 8.5pt; text-transform: uppercase; letter-spacing: .8px; color: ${GRIS}; margin: 3px 0 0;
  }
  .membrete .fecha { font-family: ${TITULOS}; font-size: 9pt; color: ${GRIS}; margin: 0; white-space: nowrap; }
  header { margin: 26px 0 22px; }
  header h1 {
    font-family: ${TITULOS};
    font-size: 17pt; font-weight: 800; color: ${TINTA}; margin: 0 0 3px; letter-spacing: -.2px;
  }
  header .subtitulo { font-family: ${TITULOS}; font-size: 10.5pt; color: ${GRIS}; margin: 0; }
  header::after { content: ''; display: block; width: 44px; border-bottom: 3px solid ${ACENTO}; margin-top: 12px; }
  section { margin-bottom: 20px; }
  section h2 {
    font-family: ${TITULOS};
    font-size: 9.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;
    color: ${ACENTO}; border-bottom: 1px solid ${BORDE}; padding-bottom: 4px; margin: 0 0 8px;
  }
  section p { margin: 0; text-align: justify; white-space: normal; }
  .intro { text-align: justify; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5pt; }
  thead th {
    font-family: ${TITULOS};
    background: ${ACENTO}; color: #fff; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .6px;
    text-align: left; padding: 6px 9px; border: none;
  }
  tbody td { padding: 6px 9px; border-bottom: 1px solid ${BORDE}; vertical-align: top; }
  tbody tr:nth-child(even) { background: #f7f7fb; }
  .chk { width: 26px; text-align: center; }
  .chk span { display: inline-block; width: 10px; height: 10px; border: 1.4px solid #9ca3af; border-radius: 2.5px; }
  .plazo { width: 110px; white-space: nowrap; }
  .detalle { font-family: ${TITULOS}; font-size: 9pt; color: ${GRIS}; }
  .cierre { margin-top: 28px; }
`

/** Membrete de la firma (logo + identidad) con la fecha de emisión a la derecha. */
function membreteHtml(firma?: FirmaMembrete | null): string {
  // El logo viene de un data URI validado en el backend; no se escapa como texto.
  const logo = firma?.logo ? `<img class="logo" src="${firma.logo}" alt="" />` : ''
  const identidad = firma
    ? `<div class="identidad">
    ${logo}
    <div>
      <p class="firma-nombre">${escapeHtml(firma.nombre)}</p>
      <p class="firma-datos">NIT ${escapeHtml(firma.nit)} · ${escapeHtml(firma.ciudad)}</p>
    </div>
  </div>`
    : '<div></div>'
  return `<div class="membrete">
  ${identidad}
  <p class="fecha">${escapeHtml(fechaEmision())}</p>
</div>`
}

function encabezadoHtml(titulo: string, sub: string): string {
  return `<header>
  <h1>${escapeHtml(titulo)}</h1>
  <p class="subtitulo">${escapeHtml(sub)}</p>
</header>`
}

function documentoHtml(tituloVentana: string, cuerpo: string, firma?: FirmaMembrete | null): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(tituloVentana)}</title>
<style>${estilosDocumento(acentoDe(firma), PILA_FUENTE[fuenteTitulosDe(firma)], PILA_FUENTE[fuenteCuerpoDe(firma)])}</style>
</head>
<body>
${cuerpo}
</body>
</html>`
}

/** Construye el HTML del documento (membrete + secciones), con numeración de páginas al imprimir. */
export function construirHtmlInforme(opts: ExportOpts): string {
  const secciones = opts.secciones
    .filter((s) => s.contenido.trim().length > 0)
    .map(
      (s) =>
        `<section><h2>${escapeHtml(s.label)}</h2><p>${escapeHtml(s.contenido).replace(/\n/g, '<br/>')}</p></section>`,
    )
    .join('\n')

  const cuerpo = [
    membreteHtml(opts.firma),
    encabezadoHtml(opts.titulo, subtitulo(opts)),
    secciones,
  ].join('\n')

  return documentoHtml(`${opts.titulo} — ${opts.empresaNombre}`, cuerpo, opts.firma)
}

/* ── Relación de documentos solicitados al cliente (PBC) ────────────────── */

export type ItemListaPbc = {
  descripcion: string
  /** Etiqueta ya legible del área (o null si no hay papel asociado). */
  area: string | null
  papelTitulo: string | null
  fechaLimite: string | null
  notas: string | null
}

export type ListaPbcOpts = {
  empresaNombre: string
  periodo: string
  firma?: FirmaMembrete | null
  items: ItemListaPbc[]
}

function formatearFecha(d: string): string {
  return new Date(d.slice(0, 10) + 'T00:00:00').toLocaleDateString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

/**
 * Construye el HTML de la relación de documentos pendientes (PBC) para enviar al cliente:
 * carta con membrete + tabla por área con casilla de verificación y fecha límite.
 */
export function construirHtmlListaPbc(opts: ListaPbcOpts): string {
  // Agrupa por área conservando el orden de aparición.
  const porArea = new Map<string, ItemListaPbc[]>()
  for (const item of opts.items) {
    const area = item.area ?? 'General'
    if (!porArea.has(area)) porArea.set(area, [])
    porArea.get(area)!.push(item)
  }

  const tienePlazos = opts.items.some((i) => i.fechaLimite)
  const colPlazo = tienePlazos ? '<th class="plazo">Fecha límite</th>' : ''

  const bloques = Array.from(porArea.entries())
    .map(([area, items]) => {
      const filas = items
        .map((i) => {
          const detalle = [
            i.papelTitulo ? `Prueba: ${escapeHtml(i.papelTitulo)}` : '',
            i.notas ? escapeHtml(i.notas) : '',
          ].filter(Boolean).join(' · ')
          const plazo = tienePlazos
            ? `<td class="plazo">${i.fechaLimite ? escapeHtml(formatearFecha(i.fechaLimite)) : '—'}</td>`
            : ''
          return `<tr>
  <td class="chk"><span></span></td>
  <td>${escapeHtml(i.descripcion)}${detalle ? `<br/><span class="detalle">${detalle}</span>` : ''}</td>
  ${plazo}
</tr>`
        })
        .join('\n')
      return `<section>
<h2>${escapeHtml(area)}</h2>
<table>
  <thead><tr><th class="chk"></th><th>Documento</th>${colPlazo}</tr></thead>
  <tbody>${filas}</tbody>
</table>
</section>`
    })
    .join('\n')

  const cuerpo = [
    membreteHtml(opts.firma),
    encabezadoHtml('Relación de documentos solicitados', subtitulo(opts)),
    `<p class="intro">Apreciado equipo de ${escapeHtml(opts.empresaNombre)}:<br/><br/>
En desarrollo de nuestra auditoría${opts.periodo ? ` del período ${escapeHtml(opts.periodo)}` : ''}, agradecemos
remitirnos los documentos relacionados a continuación. La casilla de la izquierda le permite llevar control
de los ya preparados. Quedamos atentos a cualquier inquietud sobre esta solicitud.</p>`,
    bloques,
    `<p class="cierre">Cordialmente,${opts.firma ? `<br/><strong>${escapeHtml(opts.firma.nombre)}</strong>` : ''}</p>`,
  ].join('\n')

  return documentoHtml(`Relación de documentos solicitados — ${opts.empresaNombre}`, cuerpo, opts.firma)
}

/**
 * Renderiza el documento en un iframe oculto y lanza impresión (el usuario elige "Guardar como PDF").
 * Se usa iframe en vez de window.open para que los bloqueadores de pop-ups no lo impidan.
 */
export function imprimirInforme(html: string) {
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument
  const win = iframe.contentWindow
  if (!doc || !win) {
    document.body.removeChild(iframe)
    return
  }
  doc.open()
  doc.write(html)
  doc.close()

  const limpiar = () => {
    if (iframe.parentNode) document.body.removeChild(iframe)
  }
  win.onafterprint = limpiar
  // Respaldo por si el navegador no dispara afterprint.
  setTimeout(limpiar, 120_000)

  // Pequeña espera para que rendericen estilos antes de imprimir.
  setTimeout(() => {
    win.focus()
    win.print()
  }, 350)
}

/** Decodifica un data URI de imagen a bytes + tipo docx ('png'/'jpg'), midiendo sus dimensiones. */
async function logoParaDocx(
  dataUri: string,
): Promise<{ data: Uint8Array; type: 'png' | 'jpg'; width: number; height: number } | null> {
  const match = dataUri.match(/^data:image\/(png|jpeg);base64,(.+)$/)
  if (!match) return null // webp u otro formato que docx no soporta
  const bin = atob(match[2])
  const data = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i)

  const medidas = await new Promise<{ w: number; h: number } | null>((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => resolve(null)
    img.src = dataUri
  })
  if (!medidas || !medidas.h) return null

  // Escala a la altura del membrete (~34 px) conservando proporción.
  const height = 34
  const width = Math.round((medidas.w / medidas.h) * height)
  return { data, type: match[1] === 'png' ? 'png' : 'jpg', width, height }
}

/** Genera y descarga un .docx real. Importa `docx` de forma perezosa (fuera del bundle inicial). */
export async function descargarDocx(filename: string, opts: ExportOpts) {
  const { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType, BorderStyle } =
    await import('docx')

  const GRIS_DOCX = '6B7280'
  const ACENTO_DOCX = acentoDe(opts.firma).slice(1).toUpperCase()
  // Word sustituye por su cuenta si el equipo no tiene la fuente; el catálogo evita ese caso.
  const FUENTE_TITULOS = fuenteTitulosDe(opts.firma)
  const bloques: InstanceType<typeof Paragraph>[] = []

  // Membrete de la firma (logo + identidad + fecha), cerrado con una regla en el color de marca.
  if (opts.firma) {
    const logo = opts.firma.logo ? await logoParaDocx(opts.firma.logo) : null
    if (logo) {
      bloques.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [
            new ImageRun({
              data: logo.data,
              type: logo.type,
              transformation: { width: logo.width, height: logo.height },
            }),
          ],
        }),
      )
    }
    bloques.push(
      new Paragraph({
        children: [new TextRun({ text: opts.firma.nombre, bold: true, size: 27, font: FUENTE_TITULOS, color: '111827' })],
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `NIT ${opts.firma.nit} · ${opts.firma.ciudad}`.toUpperCase(),
            size: 17, font: FUENTE_TITULOS, color: GRIS_DOCX,
          }),
        ],
      }),
    )
  }
  bloques.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: fechaEmision(), size: 18, font: FUENTE_TITULOS, color: GRIS_DOCX })],
    }),
    new Paragraph({
      spacing: { after: 280 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: ACENTO_DOCX } },
      children: [],
    }),
  )

  // Título + subtítulo
  bloques.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 60 },
      children: [new TextRun({ text: opts.titulo, bold: true, size: 34, font: FUENTE_TITULOS, color: '111827' })],
    }),
    new Paragraph({
      spacing: { after: 360 },
      children: [new TextRun({ text: subtitulo(opts), size: 21, font: FUENTE_TITULOS, color: GRIS_DOCX })],
    }),
  )

  // Secciones (encabezado en color de marca + cuerpo por líneas)
  for (const sec of opts.secciones) {
    if (!sec.contenido.trim()) continue
    bloques.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 280, after: 120 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'E5E7EB' } },
        children: [
          new TextRun({ text: sec.label.toUpperCase(), bold: true, size: 19, font: FUENTE_TITULOS, color: ACENTO_DOCX }),
        ],
      }),
    )
    for (const linea of sec.contenido.split('\n')) {
      bloques.push(
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 80 },
          children: [new TextRun({ text: linea })],
        }),
      )
    }
  }

  const doc = new Document({
    styles: {
      // La fuente por defecto del documento es la del cuerpo: los párrafos de las
      // secciones la heredan; los titulares la sobreescriben con FUENTE_TITULOS.
      default: { document: { run: { font: fuenteCuerpoDe(opts.firma), size: 23, color: '111827' } } },
    },
    sections: [{ children: bloques }],
  })

  const blob = await Packer.toBlob(doc)
  descargarBlob(blob, filename.endsWith('.docx') ? filename : `${filename}.docx`)
}
