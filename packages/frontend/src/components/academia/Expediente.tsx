import { ArrowLeft, FileText, FolderOpen, Mail, ScrollText, Table2 } from 'lucide-react'
import { BALANCE_CASO, EXPEDIENTE_CASO, type DocumentoExpediente } from '@auditorya/types'
import { Modal } from '../ui/Modal'
import { useExpedienteStore } from '../../store/academia.store'

const millones = (n: number | null) =>
  n === null ? '—' : new Intl.NumberFormat('es-CO').format(n)

const fecha = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })

/** El balance de prueba se arma desde el caso: cuentas hasta 4 dígitos, 2026 frente a 2025. */
const DOC_BALANCE: DocumentoExpediente = {
  id: 'balance',
  titulo: 'Balance de prueba 2026 (comparativo 2025)',
  tipo: 'balance',
  fecha: '2026-12-31',
  de: 'Contabilidad de la Comercializadora',
  parrafos: ['Saldos con su naturaleza, en pesos. Las cuentas correctoras (1592) van en negativo.'],
  tabla: {
    encabezados: ['Código', 'Cuenta', '2026', '2025'],
    filas: BALANCE_CASO.filter((c) => c.codigo.length <= 4).map((c) => [
      c.codigo, c.nombre, millones(c.saldoActual), millones(c.saldoAnterior),
    ]),
  },
}

export const DOCUMENTOS_EXPEDIENTE: DocumentoExpediente[] = [...EXPEDIENTE_CASO.slice(0, 1), DOC_BALANCE, ...EXPEDIENTE_CASO.slice(1)]

export function tituloDocumento(id: string): string {
  return DOCUMENTOS_EXPEDIENTE.find((d) => d.id === id)?.titulo ?? id
}

const ICONO: Record<DocumentoExpediente['tipo'], React.ElementType> = {
  certificado: ScrollText, acta: ScrollText, carta: FileText, correo: Mail,
  narrativa: FileText, tabla: Table2, politica: FileText, balance: Table2,
}

function VistaDocumento({ doc }: { doc: DocumentoExpediente }) {
  const numerica = (h: string) => /^(Saldo|Valor|2026|2025)$/.test(h)
  return (
    <article className="space-y-4">
      <div>
        <p className="text-xs text-slate-500">{doc.de} · {fecha(doc.fecha)}</p>
        <h3 className="mt-0.5 text-lg font-semibold text-slate-900">{doc.titulo}</h3>
      </div>
      <div className="space-y-3 rounded-xl border border-slate-200 bg-amber-50/40 p-5 text-[15px] leading-relaxed text-slate-800">
        {doc.parrafos.map((p) => <p key={p}>{p}</p>)}
      </div>
      {doc.tabla && (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <tr>
                {doc.tabla.encabezados.map((h) => (
                  <th key={h} className={numerica(h) ? 'px-3 py-2 text-right font-medium' : 'px-3 py-2 font-medium'}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {doc.tabla.filas.map((f) => (
                <tr key={f.join('|')} className={f[0].length <= 1 ? 'border-t border-slate-200 bg-slate-50 font-semibold' : 'border-t border-slate-100'}>
                  {f.map((c, i) => (
                    <td key={i} className={numerica(doc.tabla!.encabezados[i]) ? 'px-3 py-1.5 text-right font-mono tabular-nums' : 'px-3 py-1.5'}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  )
}

/** Panel con los documentos del cliente. Se monta una vez en el layout de la Academia. */
export function Expediente() {
  const { abierto, documentoId, abrir, cerrar } = useExpedienteStore()
  const doc = DOCUMENTOS_EXPEDIENTE.find((d) => d.id === documentoId) ?? null

  return (
    <Modal open={abierto} onClose={cerrar} title="Expediente del cliente · Comercializadora Ejemplo S.A.S." size="xl">
      {doc ? (
        <div className="space-y-4">
          <button type="button" onClick={() => abrir()} className="inline-flex items-center gap-1.5 text-sm text-violet-700 hover:underline">
            <ArrowLeft size={14} /> Todos los documentos
          </button>
          <VistaDocumento doc={doc} />
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Los documentos que te entregó el cliente y los que obtuvo tu firma. Los ejercicios te dirán cuáles revisar.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {DOCUMENTOS_EXPEDIENTE.map((d) => {
              const Icono = ICONO[d.tipo]
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => abrir(d.id)}
                    className="flex w-full items-start gap-3 rounded-xl border border-slate-200 p-3 text-left hover:border-violet-300 hover:bg-violet-50/40"
                  >
                    <Icono size={18} className="mt-0.5 shrink-0 text-violet-500" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-900">{d.titulo}</span>
                      <span className="block text-xs text-slate-500">{d.de} · {fecha(d.fecha)}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </Modal>
  )
}

/** Botón para abrir el expediente (encabezado de la Academia). */
export function BotonExpediente() {
  const abrir = useExpedienteStore((s) => s.abrir)
  return (
    <button
      type="button"
      onClick={() => abrir()}
      title="Expediente del cliente"
      aria-label="Expediente del cliente"
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-sm font-medium text-slate-700 hover:border-violet-300 hover:text-violet-700 sm:px-3"
    >
      <FolderOpen size={15} /> <span className="hidden md:inline">Expediente del cliente</span>
    </button>
  )
}
