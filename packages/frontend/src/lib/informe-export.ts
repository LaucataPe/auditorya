/**
 * Exportación de informes sin dependencias externas:
 *  - imprimirInforme: abre una ventana nueva con el documento formateado y lanza el diálogo de impresión (→ PDF).
 *  - descargarWord: genera un archivo .doc (HTML que Word abre nativamente).
 */

type SeccionRender = { label: string; contenido: string }

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Construye el HTML del documento (encabezado + secciones). */
export function construirHtmlInforme(opts: {
  titulo: string
  empresaNombre: string
  periodo: string
  secciones: SeccionRender[]
}): string {
  const cuerpo = opts.secciones
    .filter((s) => s.contenido.trim().length > 0)
    .map(
      (s) =>
        `<section><h2>${escapeHtml(s.label)}</h2><p>${escapeHtml(s.contenido).replace(/\n/g, '<br/>')}</p></section>`,
    )
    .join('\n')

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(opts.titulo)} — ${escapeHtml(opts.empresaNombre)}</title>
<style>
  @page { margin: 2.5cm; }
  body { font-family: 'Times New Roman', Georgia, serif; color: #1a1a1a; line-height: 1.5; font-size: 12pt; max-width: 720px; margin: 0 auto; padding: 24px; }
  header { text-align: center; margin-bottom: 28px; border-bottom: 1px solid #ccc; padding-bottom: 14px; }
  header h1 { font-size: 16pt; margin: 0 0 4px; }
  header p { margin: 0; font-size: 11pt; color: #555; }
  section { margin-bottom: 18px; }
  section h2 { font-size: 12pt; text-transform: uppercase; letter-spacing: .5px; margin: 0 0 6px; }
  section p { margin: 0; text-align: justify; white-space: normal; }
</style>
</head>
<body>
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

/** Descarga el documento como .doc (Word abre HTML con este mime). */
export function descargarWord(filename: string, html: string) {
  const blob = new Blob(['﻿', html], { type: 'application/msword' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.doc') ? filename : `${filename}.doc`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
