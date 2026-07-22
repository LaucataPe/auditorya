import { type ReactNode, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowData,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Search } from 'lucide-react'
import { cn } from '../../lib/cn'

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Alineación del contenido de la columna (por defecto izquierda). */
    align?: 'left' | 'right' | 'center'
    /** Clases extra para las celdas de la columna. */
    className?: string
  }
}

type Props<T> = {
  columns: ColumnDef<T, any>[]
  data: T[]
  /** Placeholder del buscador global. Si se omite, no se muestra el buscador. */
  searchPlaceholder?: string
  /** Contenido extra a la izquierda de la toolbar (ej. un select de filtro). */
  toolbar?: ReactNode
  pageSize?: number
  emptyMessage?: string
  /** Fila expandida a ancho completo debajo de la fila de datos (o null). */
  subRow?: (row: T) => ReactNode | null
  rowClassName?: (row: T) => string | undefined
  /** Ancho mínimo de la tabla para el scroll horizontal. */
  minWidth?: number
  /** Altura fija del cuerpo: scroll vertical interno con encabezado pegado. */
  maxHeight?: number
}

export function DataTable<T>({
  columns, data, searchPlaceholder, toolbar, pageSize = 15,
  emptyMessage = 'Sin registros.', subRow, rowClassName, minWidth = 640, maxHeight,
}: Props<T>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: 'includesString',
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  })

  const filas = table.getRowModel().rows
  const total = table.getFilteredRowModel().rows.length
  const pagina = table.getState().pagination.pageIndex + 1
  const paginas = Math.max(1, table.getPageCount())

  return (
    <div className="space-y-2">
      {(toolbar || searchPlaceholder) && (
        <div className="flex flex-wrap items-center gap-2">
          {toolbar}
          {searchPlaceholder && (
            <div className="relative ml-auto">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-56 rounded-lg border border-gray-200 bg-white pl-8 pr-3 py-1.5 text-xs focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
            </div>
          )}
        </div>
      )}

      <div
        className={cn('rounded-xl border border-gray-200 overflow-x-auto', maxHeight && 'overflow-y-auto')}
        style={maxHeight ? { height: maxHeight } : undefined}
      >
        <table className="w-full text-xs" style={{ minWidth }}>
          <thead className={cn(maxHeight && 'sticky top-0 z-10')}>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className={cn('bg-gray-50', maxHeight ? 'shadow-[0_1px_0_0_theme(colors.gray.200)]' : 'border-b border-gray-200')}>
                {hg.headers.map((h) => {
                  const meta = h.column.columnDef.meta
                  const sortable = h.column.getCanSort()
                  const dir = h.column.getIsSorted()
                  return (
                    <th
                      key={h.id}
                      className={cn(
                        'px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap',
                        meta?.align === 'right' ? 'text-right' : meta?.align === 'center' ? 'text-center' : 'text-left',
                      )}
                    >
                      {h.isPlaceholder ? null : sortable ? (
                        <button
                          onClick={h.column.getToggleSortingHandler()}
                          className={cn(
                            'inline-flex items-center gap-1 hover:text-gray-800 transition-colors',
                            meta?.align === 'right' && 'flex-row-reverse',
                            dir && 'text-indigo-600',
                          )}
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {dir === 'asc' ? <ArrowUp size={11} /> : dir === 'desc' ? <ArrowDown size={11} /> : <ChevronsUpDown size={11} className="text-gray-300" />}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filas.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-gray-400">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              filas.map((row, i) => {
                const expandido = subRow?.(row.original) ?? null
                return (
                  <FragmentoFila key={row.id}>
                    <tr className={cn(i % 2 === 1 && 'bg-gray-50/50', 'hover:bg-indigo-50/40 transition-colors', rowClassName?.(row.original))}>
                      {row.getVisibleCells().map((cell) => {
                        const meta = cell.column.columnDef.meta
                        return (
                          <td
                            key={cell.id}
                            className={cn(
                              'px-3 py-2 align-middle',
                              meta?.align === 'right' ? 'text-right' : meta?.align === 'center' ? 'text-center' : 'text-left',
                              meta?.className,
                            )}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        )
                      })}
                    </tr>
                    {expandido && (
                      <tr>
                        <td colSpan={columns.length} className="px-3 py-2.5 bg-gray-50 border-y border-gray-100">
                          {expandido}
                        </td>
                      </tr>
                    )}
                  </FragmentoFila>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          Página {pagina} de {paginas} ({total} {total === 1 ? 'registro' : 'registros'})
        </span>
        {paginas > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Página anterior"
            >
              <ChevronLeft size={13} />
            </button>
            <span className="rounded-lg bg-indigo-600 px-2.5 py-1 text-white font-medium tabular-nums">{pagina}</span>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Página siguiente"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Fragment con key tipado (evita importar Fragment + key en el map de arriba).
function FragmentoFila({ children }: { children: ReactNode }) {
  return <>{children}</>
}
