/**
 * Piezas de la revisión tributaria compartidas entre la vista por pestañas y la
 * revisión guiada: el campo del encabezado del papel de trabajo (CampoPapel) y la
 * tabla de hallazgos editable en línea (HallazgosTabla) con su celda de texto.
 * Se movieron desde pages/empresa/EmpresaTributarioRevision.tsx sin cambios.
 */
import { useLayoutEffect, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Bot, Paperclip, Sparkles, Trash2, X } from 'lucide-react'
import {
  ESTADO_HALLAZGO_TRIBUTARIO_LABELS,
  ESTADOS_HALLAZGO_TRIBUTARIO,
  type AdjuntoTributario,
  type HallazgoTributario,
} from '@auditorya/types'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { toast } from '../../store/toast.store'
import { confirmar } from '../../store/confirm.store'
import { DataTable } from '../ui/DataTable'
import { InputMiles } from '../ui/InputMiles'

function formatoTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Campo del encabezado del papel de trabajo. Mientras el revisor no lo edita
 * (`valor === null`) se muestra el borrador sugerido sin persistirlo: así el
 * texto estándar sigue el catálogo hasta que alguien lo hace suyo, y al firmar
 * el backend lo materializa en la fila.
 */
export function CampoPapel({
  etiqueta,
  ayuda,
  valor,
  sugerido,
  remontar,
  filas,
  deshabilitado,
  onGuardar,
}: {
  etiqueta: string
  ayuda: string
  valor: string | null
  sugerido: string
  remontar: string
  filas: number
  deshabilitado: boolean
  onGuardar: (valor: string | null) => void
}) {
  const propio = valor !== null && valor.trim() !== ''
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <label className="text-sm font-semibold text-gray-900">{etiqueta}</label>
        {propio && !deshabilitado && (
          <button
            onClick={() => onGuardar(null)}
            className="text-xs text-gray-400 transition-colors hover:text-indigo-600"
          >
            Restaurar el texto sugerido
          </button>
        )}
      </div>
      <p className="mb-1.5 text-xs text-gray-400">{ayuda}</p>
      <textarea
        key={remontar}
        rows={filas}
        defaultValue={valor ?? sugerido}
        disabled={deshabilitado}
        onBlur={(e) => {
          const nuevo = e.target.value.trim()
          // Volver al texto sugerido equivale a no haberlo editado.
          if (nuevo === (valor ?? sugerido).trim()) return
          onGuardar(nuevo === sugerido.trim() || nuevo === '' ? null : e.target.value)
        }}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm leading-relaxed text-gray-700 focus:border-amber-300 focus:outline-none disabled:bg-gray-50"
      />
      {!propio && (
        <p className="mt-1 text-[11px] text-gray-400">
          Texto sugerido para {etiqueta.toLowerCase()}: edítalo y se guarda como propio de esta revisión.
        </p>
      )}
    </div>
  )
}

// ─── Hallazgos: tabla editable en línea ──────────────────────────────────────

/**
 * Celda de texto que crece con el contenido y guarda al salir del foco. No es
 * controlada (para no re-renderizar la tabla en cada tecla), así que se remonta
 * por `key` cuando el valor cambia desde afuera — al redactar con IA, por
 * ejemplo. `onGuardar` puede devolver false para revertir lo escrito.
 */
function TextareaCelda({
  valor,
  placeholder,
  deshabilitado,
  enfocar,
  onEnfocado,
  onBlurVacio,
  filas = 2,
  className,
  onGuardar,
}: {
  valor: string | null
  placeholder: string
  deshabilitado: boolean
  enfocar?: boolean
  /** Se avisa tras enfocar para que quien pidió el foco lo desarme. */
  onEnfocado?: () => void
  /** Salir del campo dejándolo vacío (la fila borrador se cancela). */
  onBlurVacio?: () => void
  filas?: number
  className?: string
  onGuardar: (valor: string) => boolean | void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const yaEnfocado = useRef(false)

  const ajustar = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  useLayoutEffect(() => {
    ajustar()
    // Solo la primera vez: al guardar cambia `valor` y no debe robar el foco.
    if (enfocar && !yaEnfocado.current) {
      yaEnfocado.current = true
      ref.current?.focus()
      ref.current?.select()
      onEnfocado?.()
    }
  }, [enfocar, valor])

  return (
    <textarea
      key={valor ?? ''}
      ref={ref}
      rows={filas}
      defaultValue={valor ?? ''}
      disabled={deshabilitado}
      placeholder={placeholder}
      onInput={ajustar}
      onBlur={(e) => {
        const nuevo = e.target.value.trim()
        if (nuevo === '' && onBlurVacio) {
          onBlurVacio()
          return
        }
        if (nuevo === (valor ?? '').trim()) return
        if (onGuardar(nuevo) === false) {
          e.target.value = valor ?? ''
          ajustar()
        }
      }}
      className={cn(
        'w-full resize-none rounded border border-transparent bg-transparent px-2 py-1 text-xs leading-relaxed text-gray-700 transition-colors',
        'hover:border-gray-200 focus:border-indigo-300 focus:bg-white focus:outline-none',
        'placeholder:text-amber-600/70 disabled:text-gray-500 disabled:hover:border-transparent',
        className,
      )}
    />
  )
}

/** Id de la fila borrador: existe solo en pantalla, nunca en la base. */
const ID_BORRADOR = 'borrador'

/**
 * Hallazgos como tabla editable en línea (sin modal): cada celda guarda al
 * salir del foco. Lo que falta por documentar se marca en ámbar —placeholder y
 * aviso junto al estado— para ver de un vistazo qué hallazgos están a medias.
 * "Nuevo hallazgo" abre una fila borrador vacía (solo con el placeholder) que
 * se crea al salir del campo con texto. Con la revisión firmada el contenido
 * queda de solo lectura y solo se pueden mover el estado y el seguimiento (la
 * grieta deliberada del sello).
 */
export function HallazgosTabla({
  hallazgos,
  sellada,
  iaDisponible,
  nuevoId,
  onEnfocadoNuevo,
  borrador,
  onCerrarBorrador,
  onCrear,
  adjuntos,
  onAdjuntar,
  onDescargar,
  onEliminarAdjunto,
  onCambio,
  origenAgente,
}: {
  hallazgos: HallazgoTributario[]
  /** id del hallazgo → código de la propuesta del agente que lo originó (para mostrar la trazabilidad). */
  origenAgente?: Record<string, string>
  sellada: boolean
  iaDisponible: boolean
  nuevoId: string | null
  onEnfocadoNuevo: () => void
  /** Hay una fila borrador abierta al final de la tabla. */
  borrador: boolean
  onCerrarBorrador: () => void
  onCrear: (descripcion: string) => void
  /** Todos los adjuntos de la revisión; los que traen hallazgoId son evidencia. */
  adjuntos: AdjuntoTributario[]
  onAdjuntar: (hallazgoId: string) => void
  onDescargar: (adjuntoId: string) => void
  onEliminarAdjunto: (adjuntoId: string) => void
  onCambio: () => void
}) {
  const actualizar = useMutation({
    mutationFn: ({ id, ...campos }: { id: string } & Record<string, unknown>) =>
      api.patch(`/tributario/hallazgos/${id}`, campos),
    onSuccess: onCambio,
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo actualizar el hallazgo'),
  })

  const eliminar = useMutation({
    mutationFn: (id: string) => api.delete(`/tributario/hallazgos/${id}`),
    onSuccess: onCambio,
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo eliminar el hallazgo'),
  })

  // Pule la redacción y la escribe en la misma fila (antes vivía en el modal).
  const redactar = useMutation({
    mutationFn: async (h: HallazgoTributario) => {
      const sugerido = await api.post<{ descripcion: string; recomendacion: string }>(
        `/tributario/revisiones/${h.revisionId}/ia/hallazgo`,
        { descripcion: h.descripcion, recomendacion: h.recomendacion ?? undefined },
      )
      return api.patch(`/tributario/hallazgos/${h.id}`, sugerido)
    },
    onSuccess: () => {
      onCambio()
      toast.info('Borrador generado — verifica la cita normativa antes de firmar')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo generar el borrador'),
  })

  // La fila borrador se crea en la base al salir del campo con texto: el
  // backend exige descripción, así no quedan hallazgos en blanco dentro de una
  // constancia firmada.
  const filas: HallazgoTributario[] = borrador
    ? [
        ...hallazgos,
        {
          id: ID_BORRADOR,
          revisionId: '',
          descripcion: '',
          recomendacion: null,
          monto: null,
          severidad: 'media',
          estado: 'abierto',
          seguimiento: null,
          resueltoAt: null,
          creadoPor: null,
          createdAt: '',
        },
      ]
    : hallazgos

  // Evidencia por hallazgo; el resto de adjuntos son soportes de la revisión.
  const evidenciaPorHallazgo = new Map<string, AdjuntoTributario[]>()
  for (const a of adjuntos) {
    if (!a.hallazgoId) continue
    const lista = evidenciaPorHallazgo.get(a.hallazgoId)
    if (lista) lista.push(a)
    else evidenciaPorHallazgo.set(a.hallazgoId, [a])
  }

  // Sin useMemo a propósito: las celdas cierran sobre el estado de las
  // mutaciones (isPending por fila), que cambia en cada render.
  const columnas: ColumnDef<HallazgoTributario, any>[] = [
    {
      id: 'orden',
      header: '#',
      enableSorting: false,
      meta: { align: 'center', className: 'w-8 align-top text-gray-400' },
      cell: ({ row }) => <span className="text-[11px] leading-7">{row.index + 1}</span>,
    },
    {
      accessorKey: 'descripcion',
      header: 'Hallazgo',
      // Sin ordenar en toda la tabla: el orden de las filas es el del papel de
      // trabajo (y el de la numeración que sale en el informe).
      enableSorting: false,
      meta: { className: 'align-top' },
      cell: ({ row }) => {
        const h = row.original
        const esBorrador = h.id === ID_BORRADOR
        const codigoAgente = origenAgente?.[h.id]
        return (
          <div>
            <TextareaCelda
              valor={h.descripcion}
              placeholder="Situación encontrada…"
              deshabilitado={sellada}
              // El borrador nace enfocado; salir dejándolo vacío lo cancela.
              enfocar={esBorrador || h.id === nuevoId}
              onEnfocado={esBorrador ? undefined : onEnfocadoNuevo}
              onBlurVacio={esBorrador ? onCerrarBorrador : undefined}
              className="min-w-[18rem] text-[13px] text-gray-800"
              onGuardar={(v) => {
                if (v.length < 2) {
                  toast.error('El hallazgo no puede quedar vacío')
                  return false
                }
                if (esBorrador) onCrear(v)
                else actualizar.mutate({ id: h.id, descripcion: v })
              }}
            />
            {codigoAgente && (
              <span className="ml-1 inline-flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700" title="Nació de una propuesta del agente; la bitácora está en el paso Hallazgos de la revisión guiada">
                <Bot size={10} /> {codigoAgente}
              </span>
            )}
          </div>
        )
      },
    },
    {
      accessorKey: 'recomendacion',
      header: 'Recomendación',
      enableSorting: false,
      meta: { className: 'align-top' },
      cell: ({ row }) =>
        row.original.id === ID_BORRADOR ? (
          <span className="px-2 text-[11px] text-gray-400">Se habilita al crear el hallazgo</span>
        ) : (
          <TextareaCelda
            valor={row.original.recomendacion}
            placeholder="¿Qué debe hacer el cliente para corregirlo?"
            deshabilitado={sellada}
            className="min-w-[16rem]"
            onGuardar={(v) => actualizar.mutate({ id: row.original.id, recomendacion: v || null })}
          />
        ),
    },
    {
      accessorKey: 'monto',
      header: 'Monto',
      enableSorting: false,
      meta: { align: 'right', className: 'w-32 align-top' },
      cell: ({ row }) => {
        const h = row.original
        if (h.id === ID_BORRADOR) return <span className="px-2 text-gray-300">—</span>
        const actual = h.monto === null ? null : Number(h.monto)
        return (
          <InputMiles
            valor={actual}
            disabled={sellada}
            placeholder="—"
            onValor={(v) => {
              if (v !== actual) actualizar.mutate({ id: h.id, monto: v })
            }}
            className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-right text-xs text-gray-700 transition-colors placeholder:text-gray-300 hover:border-gray-200 focus:border-indigo-300 focus:bg-white focus:outline-none disabled:text-gray-500"
          />
        )
      },
    },
    {
      accessorKey: 'severidad',
      header: 'Severidad',
      enableSorting: false,
      meta: { align: 'center', className: 'w-28 align-top' },
      cell: ({ row }) => {
        const h = row.original
        if (h.id === ID_BORRADOR) return <span className="text-gray-300">—</span>
        return (
          <select
            value={h.severidad}
            disabled={sellada}
            onChange={(e) => actualizar.mutate({ id: h.id, severidad: e.target.value })}
            className={cn(
              'w-full rounded border px-1.5 py-1 text-[11px] font-medium focus:outline-none disabled:opacity-70',
              h.severidad === 'alta'
                ? 'border-rose-200 bg-rose-50 text-rose-700'
                : h.severidad === 'media'
                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                  : 'border-gray-200 bg-gray-50 text-gray-600',
            )}
          >
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </select>
        )
      },
    },
    {
      accessorKey: 'estado',
      header: 'Estado',
      enableSorting: false,
      meta: { align: 'center', className: 'w-32 align-top' },
      cell: ({ row }) => {
        const h = row.original
        if (h.id === ID_BORRADOR) return <span className="text-gray-300">—</span>
        // Lo que falta documentar del hallazgo: el aviso que responde "¿qué me
        // queda por revisar?" sin abrir cada fila.
        const faltaRecomendacion = !(h.recomendacion ?? '').trim()
        return (
          <div>
            {/* El estado se mueve incluso con la revisión firmada. */}
            <select
              value={h.estado}
              onChange={(e) => actualizar.mutate({ id: h.id, estado: e.target.value })}
              className={cn(
                'w-full rounded border px-1.5 py-1 text-[11px] font-medium focus:outline-none',
                h.estado === 'resuelto'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : h.estado === 'en_tramite'
                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                    : 'border-rose-200 bg-rose-50 text-rose-700',
              )}
            >
              {ESTADOS_HALLAZGO_TRIBUTARIO.map((estado) => (
                <option key={estado} value={estado}>
                  {ESTADO_HALLAZGO_TRIBUTARIO_LABELS[estado]}
                </option>
              ))}
            </select>
            {faltaRecomendacion && (
              <p className="mt-1 text-[10px] leading-tight text-amber-600">Falta recomendación</p>
            )}
          </div>
        )
      },
    },
    {
      id: 'acciones',
      header: '',
      enableSorting: false,
      meta: { align: 'center', className: 'w-24 align-top' },
      cell: ({ row }) => {
        const h = row.original
        if (h.id === ID_BORRADOR) {
          return (
            <button
              onClick={onCerrarBorrador}
              title="Cancelar"
              className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <X size={13} />
            </button>
          )
        }
        if (sellada) return null
        return (
          <div className="flex items-center justify-center gap-0.5">
            <button
              onClick={() => onAdjuntar(h.id)}
              title="Adjuntar evidencia (archivo o foto)"
              className="rounded p-1 text-gray-400 transition-colors hover:bg-teal-50 hover:text-teal-600"
            >
              <Paperclip size={13} />
            </button>
            {iaDisponible && (
              <button
                onClick={() => redactar.mutate(h)}
                disabled={redactar.isPending}
                title="Redactar con IA: pule la condición y sugiere norma y recomendación"
                className="rounded p-1 text-gray-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-40"
              >
                <Sparkles size={13} className={cn(redactar.isPending && redactar.variables?.id === h.id && 'animate-pulse')} />
              </button>
            )}
            <button
              onClick={async () => {
                const ok = await confirmar({
                  titulo: '¿Eliminar este hallazgo?',
                  descripcion: 'No se puede deshacer.',
                })
                if (ok) eliminar.mutate(h.id)
              }}
              title="Eliminar hallazgo"
              className="rounded p-1 text-gray-300 transition-colors hover:bg-rose-50 hover:text-rose-600"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )
      },
    },
  ]

  return (
    <>
      <p className="mb-3 text-xs text-gray-400">
        Edita cada celda directamente y se guarda al salir del campo. Lo que quede en ámbar es lo que falta
        documentar; los hallazgos abiertos obligan a firmar "con observaciones".
      </p>
      <DataTable
        columns={columnas}
        data={filas}
        minWidth={1100}
        pageSize={25}
        rowClassName={(h) => (h.id === ID_BORRADOR ? 'bg-indigo-50/40' : undefined)}
        searchPlaceholder={hallazgos.length > 3 ? 'Buscar hallazgo…' : undefined}
        emptyMessage={
          sellada
            ? 'No se registraron hallazgos en este período.'
            : 'Sin hallazgos. Usa "Nuevo hallazgo", o créalo desde una diferencia en la pestaña de cifras.'
        }
        subRow={(h) => {
          const evidencia = evidenciaPorHallazgo.get(h.id) ?? []
          if (evidencia.length === 0 && !sellada) return null
          return (
            <div className="space-y-2">
              {evidencia.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Evidencia</span>
                  {evidencia.map((a) => (
                    <span
                      key={a.id}
                      className="flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 py-0.5 pl-2 pr-1 text-[11px] text-teal-800"
                    >
                      <button
                        onClick={() => onDescargar(a.id)}
                        title="Descargar (URL firmada, 15 min)"
                        className="max-w-[16rem] truncate hover:underline"
                      >
                        {a.nombre}
                      </button>
                      <span className="text-teal-600/70">{formatoTamano(a.archivoTamano)}</span>
                      {!sellada && (
                        <button
                          onClick={() => onEliminarAdjunto(a.id)}
                          title="Quitar evidencia"
                          className="rounded-full p-0.5 text-teal-600/70 transition-colors hover:bg-teal-100 hover:text-rose-600"
                        >
                          <X size={11} />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
              {/* El seguimiento solo tiene sentido después de la firma: es lo
                  único que puede cambiar con el contenido ya sellado. */}
              {sellada && (
                <div className="flex items-start gap-2">
                  <span className="mt-1.5 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    Qué pasó después
                  </span>
                  <TextareaCelda
                    valor={h.seguimiento}
                    placeholder="Seguimiento posterior a la firma: gestión con el cliente, corrección presentada, fecha…"
                    deshabilitado={false}
                    filas={1}
                    onGuardar={(v) => actualizar.mutate({ id: h.id, seguimiento: v || null })}
                  />
                </div>
              )}
            </div>
          )
        }}
      />
    </>
  )
}
