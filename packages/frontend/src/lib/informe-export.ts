/**
 * Exportación de informes:
 *  - imprimirInforme: abre una ventana nueva con el documento formateado (con membrete y numeración
 *    de páginas) y lanza el diálogo de impresión (→ el usuario guarda como PDF).
 *  - descargarDocx: genera un .docx real con la librería `docx` (importada de forma perezosa para no
 *    engordar el bundle inicial).
 */

export type FirmaMembrete = { nombre: string; nit: string; ciudad: string }
type SeccionRender = { label: string; contenido: string }

export type ExportOpts = {
  titulo: string
  empresaNombre: string
  periodo: string
  secciones: SeccionRender[]
  firma?: FirmaMembrete | null
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
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

/** Construye el HTML del documento (membrete + secciones), con numeración de páginas al imprimir. */
export function construirHtmlInforme(opts: ExportOpts): string {
  const cuerpo = opts.secciones
    .filter((s) => s.contenido.trim().length > 0)
    .map(
      (s) =>
        `<section><h2>${escapeHtml(s.label)}</h2><p>${escapeHtml(s.contenido).replace(/\n/g, '<br/>')}</p></section>`,
    )
    .join('\n')

  const membrete = opts.firma
    ? `<div class="membrete">
  <p class="firma-nombre">${escapeHtml(opts.firma.nombre)}</p>
  <p class="firma-datos">NIT ${escapeHtml(opts.firma.nit)} · ${escapeHtml(opts.firma.ciudad)}</p>
</div>`
    : ''

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(opts.titulo)} — ${escapeHtml(opts.empresaNombre)}</title>
<style>
  @page { margin: 2.5cm; @bottom-center { content: "Página " counter(page) " de " counter(pages); font-family: 'Times New Roman', serif; font-size: 9pt; color: #777; } }
  body { font-family: 'Times New Roman', Georgia, serif; color: #1a1a1a; line-height: 1.5; font-size: 12pt; max-width: 720px; margin: 0 auto; padding: 24px; }
  .membrete { text-align: center; margin-bottom: 10px; }
  .membrete .firma-nombre { font-size: 13pt; font-weight: bold; margin: 0; letter-spacing: .5px; }
  .membrete .firma-datos { font-size: 10pt; color: #555; margin: 2px 0 0; }
  header { text-align: center; margin-bottom: 28px; border-bottom: 1px solid #ccc; padding-bottom: 14px; }
  header h1 { font-size: 16pt; margin: 0 0 4px; }
  header p { margin: 0; font-size: 11pt; color: #555; }
  section { margin-bottom: 18px; }
  section h2 { font-size: 12pt; text-transform: uppercase; letter-spacing: .5px; margin: 0 0 6px; }
  section p { margin: 0; text-align: justify; white-space: normal; }
</style>
</head>
<body>
${membrete}
<header>
  <h1>${escapeHtml(opts.titulo)}</h1>
  <p>${escapeHtml(opts.empresaNombre)} — Período ${escapeHtml(opts.periodo)}</p>
</header>
${cuerpo}
</body>
</html>`
}

/** Abre el documento en una ventana nueva y lanza impresión (el usuario elige "Guardar como PDF"). */
export function imprimirInforme(html: string) {
  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) return
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.focus()
  // Pequeña espera para que rendericen estilos antes de imprimir.
  setTimeout(() => win.print(), 350)
}

/** Genera y descarga un .docx real. Importa `docx` de forma perezosa (fuera del bundle inicial). */
export async function descargarDocx(filename: string, opts: ExportOpts) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import('docx')

  const bloques: InstanceType<typeof Paragraph>[] = []

  // Membrete de la firma
  if (opts.firma) {
    bloques.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: opts.firma.nombre, bold: true, size: 26 })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [
          new TextRun({ text: `NIT ${opts.firma.nit} · ${opts.firma.ciudad}`, size: 20, color: '555555' }),
        ],
      }),
    )
  }

  // Título + subtítulo
  bloques.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: opts.titulo, bold: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [
        new TextRun({ text: `${opts.empresaNombre} — Período ${opts.periodo}`, size: 22, color: '555555' }),
      ],
    }),
  )

  // Secciones (encabezado + cuerpo por líneas)
  for (const sec of opts.secciones) {
    if (!sec.contenido.trim()) continue
    bloques.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 240, after: 80 },
        children: [new TextRun({ text: sec.label.toUpperCase(), bold: true })],
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
      default: { document: { run: { font: 'Times New Roman', size: 24 } } },
    },
    sections: [{ children: bloques }],
  })

  const blob = await Packer.toBlob(doc)
  descargarBlob(blob, filename.endsWith('.docx') ? filename : `${filename}.docx`)
}
