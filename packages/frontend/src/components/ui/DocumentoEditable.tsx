import { useLayoutEffect, useRef, useState } from 'react'
import { Pencil, Check } from 'lucide-react'
import { esHtmlInforme, textoPlanoAHtml } from '@auditorya/types'
import { RichTextEditor } from './RichTextEditor'
import { cn } from '../../lib/cn'
import {
  estiloDocumento, fechaEmision, subtitulo, textoVacio,
  type FirmaMembrete, type SeccionRender, type TablaRender,
} from '../../lib/informe-export'

/** Sección del documento; las `editable` se modifican haciendo clic sobre la hoja. */
export type SeccionDocumento = SeccionRender & {
  key: string
  editable?: boolean
  /** 'texto' para campos que se guardan como texto plano (sin formato); por defecto, enriquecido. */
  formato?: 'enriquecido' | 'texto'
  /** Para secciones no editables: dónde se corrige su contenido (p. ej. "pestaña Hallazgos"). */
  origen?: string
}

/*
 * Tipografía del cuerpo: replica `estilosDocumento` de informe-export para que lo que
 * se ve en pantalla sea lo que sale en el PDF (tamaños en pt, párrafos justificados).
 */
const CUERPO =
  'text-[11.5pt] leading-[1.55] text-gray-900 [&_p]:mb-2 [&_p]:text-justify [&_p:last-child]:mb-0 ' +
  '[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-[22px] [&_ol]:pl-[22px] [&_ul]:my-1 [&_ol]:my-1 ' +
  '[&_li]:mb-[3px] [&_li_p]:m-0'

/**
 * Vista previa del documento tal como se exporta (membrete, título, secciones con el
 * color y las fuentes de la firma) donde cada sección editable se corrige en el lugar.
 * Las secciones vacías no se imprimen: aquí se muestran atenuadas solo si son editables.
 */
export function DocumentoEditable({
  titulo, empresaNombre, periodo, firma, secciones, onChange, disabled, aviso,
}: {
  titulo: string
  empresaNombre: string
  periodo: string
  firma?: FirmaMembrete | null
  secciones: SeccionDocumento[]
  onChange?: (key: string, valor: string) => void
  disabled?: boolean
  /** Texto sobre la hoja; por defecto explica cómo editar (o que está aprobado). */
  aviso?: string
}) {
  const [activa, setActiva] = useState<string | null>(null)
  const { acento, titulos, cuerpo } = estiloDocumento(firma)
  const editable = (s: SeccionDocumento) => !!s.editable && !disabled && !!onChange

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">
        {aviso ?? (disabled
          ? 'Vista previa del documento. Está aprobado: reábrelo para editarlo.'
          : 'Vista previa del documento tal como saldrá en PDF y Word. Haz clic en una sección para editarla.')}
      </p>
      <div className="rounded-xl bg-gray-100 p-3 sm:p-8">
        <article
          className="mx-auto max-w-[760px] bg-white px-5 py-8 shadow-sm ring-1 ring-gray-200 sm:px-14 sm:py-12"
          style={{ fontFamily: cuerpo, color: '#111827' }}
        >
          {/* Membrete */}
          <div className="flex items-end justify-between gap-4 pb-2.5" style={{ borderBottom: `2.5px solid ${acento}` }}>
            {firma ? (
              <div className="flex items-center gap-3">
                {firma.logo && <img src={firma.logo} alt="" className="block max-h-[42px] max-w-[130px]" />}
                <div style={{ fontFamily: titulos }}>
                  <p className="text-[13.5pt] font-bold tracking-[.2px]">{firma.nombre}</p>
                  <p className="mt-[3px] text-[8.5pt] uppercase tracking-[.8px] text-gray-500">
                    NIT {firma.nit} · {firma.ciudad}
                  </p>
                </div>
              </div>
            ) : <div />}
            <p className="whitespace-nowrap text-[9pt] text-gray-500" style={{ fontFamily: titulos }}>{fechaEmision()}</p>
          </div>

          {/* Título */}
          <header className="mb-[22px] mt-[26px]" style={{ fontFamily: titulos }}>
            <h1 className="mb-[3px] text-[17pt] font-extrabold tracking-[-.2px]">{titulo}</h1>
            <p className="text-[10.5pt] text-gray-500">{subtitulo({ empresaNombre, periodo })}</p>
            <div className="mt-3 w-11" style={{ borderBottom: `3px solid ${acento}` }} />
          </header>

          {secciones.map((s) => {
            const vacia = textoVacio(s.contenido) && !s.tabla?.filas.length
            if (vacia && !editable(s)) return null
            const enEdicion = activa === s.key && editable(s)

            return (
              <section key={s.key} className="mb-5">
                <h2
                  className="mb-2 flex items-baseline gap-2 border-b border-gray-200 pb-1 text-[9.5pt] font-bold uppercase tracking-[1px]"
                  style={{ fontFamily: titulos, color: acento }}
                >
                  {s.label}
                  {!editable(s) && !disabled && s.origen && (
                    <span className="ml-auto whitespace-nowrap font-sans text-[10px] font-normal normal-case tracking-normal text-gray-400">
                      Se corrige en {s.origen}
                    </span>
                  )}
                </h2>

                {enEdicion ? (
                  <div className="space-y-1.5">
                    {s.formato === 'texto' ? (
                      <TextoAutoajustable
                        id={`doc-${s.key}`}
                        valor={s.contenido ?? ''}
                        onChange={(v) => onChange!(s.key, v)}
                      />
                    ) : (
                      <RichTextEditor
                        id={`doc-${s.key}`}
                        autoFocus
                        value={esHtmlInforme(s.contenido ?? '') ? s.contenido! : textoPlanoAHtml(s.contenido ?? '')}
                        onChange={(html) => onChange!(s.key, html)}
                        claseContenido={cn(CUERPO, 'min-h-[60px] px-3 py-2')}
                      />
                    )}
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => setActiva(null)}
                        className="flex items-center gap-1 rounded-md px-2 py-1 font-sans text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                      >
                        <Check size={13} /> Listo
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    role={editable(s) ? 'button' : undefined}
                    tabIndex={editable(s) ? 0 : undefined}
                    onClick={editable(s) ? () => setActiva(s.key) : undefined}
                    onKeyDown={editable(s) ? (e) => e.key === 'Enter' && setActiva(s.key) : undefined}
                    className={cn(
                      'group relative',
                      editable(s) && '-mx-2 cursor-text rounded-md px-2 py-1 transition-colors hover:bg-indigo-50/60 hover:ring-1 hover:ring-indigo-200',
                    )}
                  >
                    {editable(s) && (
                      <span className="absolute -top-2.5 right-1 hidden items-center gap-1 rounded bg-indigo-600 px-1.5 py-0.5 font-sans text-[10px] font-medium text-white group-hover:flex">
                        <Pencil size={10} /> Editar
                      </span>
                    )}
                    {vacia ? (
                      <p className="font-sans text-sm italic text-gray-400">
                        Sección vacía: no se incluirá en el documento. Haz clic para escribirla.
                      </p>
                    ) : (
                      <ContenidoSeccion contenido={s.contenido} tabla={s.tabla} titulos={titulos} acento={acento} />
                    )}
                  </div>
                )}
              </section>
            )
          })}
        </article>
      </div>
    </div>
  )
}

/** Texto plano sobre la hoja: crece con el contenido y conserva la tipografía del documento. */
function TextoAutoajustable({ id, valor, onChange }: { id: string; valor: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [valor])
  return (
    <textarea
      ref={ref}
      id={id}
      autoFocus
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        CUERPO,
        'block w-full resize-none overflow-hidden rounded-lg border border-gray-300 bg-white px-3 py-2',
        'focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500',
      )}
      style={{ fontFamily: 'inherit' }}
    />
  )
}

/** Cuerpo de una sección en lectura: HTML del editor, texto plano legado y/o tabla. */
function ContenidoSeccion({
  contenido, tabla, titulos, acento,
}: {
  contenido?: string
  tabla?: TablaRender
  titulos: string
  acento: string
}) {
  return (
    <div className={CUERPO}>
      {!textoVacio(contenido) && (
        esHtmlInforme(contenido!)
          // HTML del editor, sanitizado en el backend contra ETIQUETAS_INFORME_ENRIQUECIDO
          // (el mismo que el PDF inyecta tal cual).
          ? <div dangerouslySetInnerHTML={{ __html: contenido! }} />
          : <p className="whitespace-pre-line">{contenido}</p>
      )}
      {!!tabla?.filas.length && (
        <table className="my-1 w-full border-collapse text-[10.5pt]">
          <thead>
            <tr>
              {tabla.columnas.map((c, i) => (
                <th
                  key={i}
                  className={cn('px-[9px] py-1.5 text-[8.5pt] uppercase tracking-[.6px] text-white', c.derecha ? 'text-right' : 'text-left')}
                  style={{ background: acento, fontFamily: titulos }}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tabla.filas.map((fila, i) => (
              <tr key={i} className="even:bg-[#f7f7fb]">
                {fila.map((celda, j) => (
                  <td
                    key={j}
                    className={cn('whitespace-pre-line border-b border-gray-200 px-[9px] py-1.5 align-top',
                      tabla.columnas[j]?.derecha && 'whitespace-nowrap text-right')}
                  >
                    {celda}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
