import { useEffect } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, Undo2, Redo2 } from 'lucide-react'
import { cn } from '../../lib/cn'

/**
 * Editor de texto enriquecido con formato acotado (negrita, cursiva, subrayado,
 * listas). Produce HTML restringido a ETIQUETAS_INFORME_ENRIQUECIDO — la
 * tipografía y los colores siguen saliendo de la plantilla del documento, no
 * del editor. `value` es HTML; para texto plano legado usar textoPlanoAHtml.
 */
export function RichTextEditor({
  id, label, value, onChange, disabled,
}: {
  id?: string
  label?: string
  value: string
  onChange: (html: string) => void
  disabled?: boolean
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Solo el formato de la whitelist: sin encabezados, citas, código ni tachado.
        heading: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        strike: false,
      }),
      Underline,
    ],
    content: value,
    editable: !disabled,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        class: cn(
          'min-h-[110px] px-3 py-2 text-sm text-gray-900 focus:outline-none',
          '[&_p]:my-0.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1',
        ),
      },
    },
  })

  // Sincroniza cambios externos (p. ej. regenerar el borrador) sin pisar lo que se está escribiendo.
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value, false)
    }
  }, [editor, value])

  useEffect(() => {
    editor?.setEditable(!disabled)
  }, [editor, disabled])

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <div
        className={cn(
          'rounded-lg border border-gray-300 bg-white overflow-hidden',
          !disabled && 'focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500',
          disabled && 'bg-gray-50 text-gray-500',
        )}
      >
        {!disabled && <Toolbar editor={editor} />}
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null

  const botones = [
    { icono: Bold, titulo: 'Negrita', activo: editor.isActive('bold'), accion: () => editor.chain().focus().toggleBold().run() },
    { icono: Italic, titulo: 'Cursiva', activo: editor.isActive('italic'), accion: () => editor.chain().focus().toggleItalic().run() },
    { icono: UnderlineIcon, titulo: 'Subrayado', activo: editor.isActive('underline'), accion: () => editor.chain().focus().toggleUnderline().run() },
    { icono: List, titulo: 'Lista con viñetas', activo: editor.isActive('bulletList'), accion: () => editor.chain().focus().toggleBulletList().run() },
    { icono: ListOrdered, titulo: 'Lista numerada', activo: editor.isActive('orderedList'), accion: () => editor.chain().focus().toggleOrderedList().run() },
  ]

  return (
    <div className="flex items-center gap-0.5 border-b border-gray-200 bg-gray-50 px-1.5 py-1">
      {botones.map(({ icono: Icono, titulo, activo, accion }) => (
        <button
          key={titulo}
          type="button"
          title={titulo}
          onMouseDown={(e) => e.preventDefault() /* no robar el foco al editor */}
          onClick={accion}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded transition-colors',
            activo ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-200 hover:text-gray-700',
          )}
        >
          <Icono size={14} />
        </button>
      ))}
      <div className="mx-1 h-4 w-px bg-gray-200" />
      <button
        type="button"
        title="Deshacer"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        className="flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700 disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Undo2 size={14} />
      </button>
      <button
        type="button"
        title="Rehacer"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        className="flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700 disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Redo2 size={14} />
      </button>
    </div>
  )
}
