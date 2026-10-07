import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Plus, Trash2 } from 'lucide-react'
import {
  IMPUESTOS_CATALOGO,
  MUNICIPIOS_RETEICA,
  PERIODICIDAD_LABELS,
  PERIODICIDADES,
  TIPOS_IMPUESTO,
  esImpuestoMunicipal,
  etiquetaPeriodo,
  mismoMunicipio,
  nombreMunicipio,
  nombreObligacion,
  presentacionExtemporanea,
  type ObligacionConRevisiones,
  type Periodicidad,
  type RevisionTributaria,
  type TipoImpuesto,
} from '@auditorya/types'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { fechaCorta } from '../../lib/fechas'
import { toast } from '../../store/toast.store'
import { confirmar } from '../../store/confirm.store'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Modal } from '../../components/ui/Modal'

type MatrizTributaria = {
  anio: number
  anios: number[]
  obligaciones: ObligacionConRevisiones[]
}

const MESES_COL = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function claseCelda(r: RevisionTributaria, vencida: boolean): string {
  if (r.estado === 'revisada') {
    // Firmada y presentada = período cerrado: relleno sólido del mismo tono.
    if (r.fechaPresentacion) {
      return r.resultado === 'con_observaciones'
        ? 'bg-orange-500 text-white border-orange-500 hover:bg-orange-600'
        : 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
    }
    return r.resultado === 'con_observaciones'
      ? 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100'
      : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
  }
  if (vencida) return 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
  if (r.estado === 'en_revision') return 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
  return 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
}

function textoCelda(r: RevisionTributaria, vencida: boolean): string {
  if (r.estado === 'revisada') {
    // El color ya distingue con/sin observaciones; el texto cabe en la celda mensual.
    if (r.fechaPresentacion) return 'Pres.'
    return r.resultado === 'con_observaciones' ? '✓ obs.' : '✓'
  }
  if (vencida) return 'Vencida'
  if (r.estado === 'en_revision') return 'En rev.'
  return '—'
}

export function EmpresaTributario() {
  const { id: empresaId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const anioActual = new Date().getFullYear()
  const [anio, setAnio] = useState(anioActual)
  const [modalAbierto, setModalAbierto] = useState(false)
  // Obligación municipal creada antes de existir el campo municipio: se le asigna aquí.
  const [sinMunicipio, setSinMunicipio] = useState<ObligacionConRevisiones | null>(null)

  const { data, isLoading } = useQuery<MatrizTributaria>({
    queryKey: ['tributario', empresaId, anio],
    queryFn: () => api.get<MatrizTributaria>(`/empresas/${empresaId}/tributario?anio=${anio}`),
    enabled: !!empresaId,
  })

  const { data: usuarios = [] } = useQuery<{ id: string; nombre: string }[]>({
    queryKey: ['usuarios'],
    queryFn: () => api.get<{ id: string; nombre: string }[]>(`/firmas/mia/usuarios`),
  })

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['tributario', empresaId] })

  const asignar = useMutation({
    mutationFn: ({ obligacionId, asignadoA }: { obligacionId: string; asignadoA: string | null }) =>
      api.patch(`/tributario/obligaciones/${obligacionId}`, { asignadoA }),
    onSuccess: invalidar,
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo asignar'),
  })

  const eliminar = useMutation({
    mutationFn: (obligacionId: string) => api.delete(`/tributario/obligaciones/${obligacionId}`),
    onSuccess: () => {
      invalidar()
      toast.success('Obligación eliminada')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo eliminar'),
  })

  const copiar = useMutation({
    mutationFn: (desde: number) => api.post(`/empresas/${empresaId}/tributario/copiar`, { desde, hacia: anio }),
    onSuccess: (r: unknown) => {
      invalidar()
      const copiadas = (r as { copiadas?: number })?.copiadas
      toast.success(`Configuración copiada${copiadas ? ` (${copiadas} obligación${copiadas === 1 ? '' : 'es'})` : ''}`)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo copiar la vigencia'),
  })

  const obligaciones = data?.obligaciones ?? []
  // Selector de vigencia: años con datos + actual, anterior y siguiente.
  const anios = [...new Set([...(data?.anios ?? []), anioActual + 1, anioActual, anioActual - 1, anio])].sort((a, b) => b - a)
  const anioConDatos = (data?.anios ?? []).filter((a) => a !== anio)
  // Hoy en la zona del navegador: con toISOString() a secas sería la fecha UTC,
  // y desde las 7 p. m. en Colombia lo que vence hoy ya saldría "Vencida".
  const hoy = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10)

  return (
    <div className="min-h-full space-y-8 bg-slate-50 p-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tributario</h1>
          <p className="text-sm text-gray-500 mt-1">
            Revisión de las obligaciones tributarias de la vigencia y constancia de cada período (revisoría fiscal).
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Select
            aria-label="Vigencia"
            value={String(anio)}
            onChange={(e) => setAnio(Number(e.target.value))}
            options={anios.map((a) => ({ value: String(a), label: `Vigencia ${a}` }))}
          />
          <Button size="sm" className="gap-2" onClick={() => setModalAbierto(true)}>
            <Plus size={14} /> Agregar obligación
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : obligaciones.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gray-200 py-14 text-center">
          <p className="text-sm text-gray-500">
            La vigencia {anio} aún no tiene obligaciones tributarias configuradas.
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" className="gap-2" onClick={() => setModalAbierto(true)}>
              <Plus size={14} /> Configurar según el RUT
            </Button>
            {anioConDatos.length > 0 && (
              <Button
                size="sm"
                variant="secondary"
                className="gap-2"
                loading={copiar.isPending}
                onClick={() => copiar.mutate(anioConDatos[0])}
              >
                <Copy size={14} /> Copiar de {anioConDatos[0]}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm" style={{ minWidth: 980 }}>
            <thead>
              <tr className="border-b border-indigo-100 bg-indigo-50/60 text-xs uppercase tracking-wider text-indigo-500">
                <th className="px-4 py-3 text-left font-semibold" style={{ minWidth: 220 }}>
                  Obligación
                </th>
                {MESES_COL.map((m) => (
                  <th key={m} className="px-1 py-3 text-center font-semibold" style={{ width: `${58 / 12}%` }}>
                    {m}
                  </th>
                ))}
                <th className="px-2 py-3" style={{ width: 36 }} />
              </tr>
            </thead>
            <tbody>
              {obligaciones.map((o) => {
                const span = 12 / o.revisiones.length
                const firmadas = o.revisiones.filter((r) => r.estado === 'revisada').length
                return (
                  <tr key={o.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-3 align-middle">
                      <p className="font-medium text-gray-900">{nombreObligacion(o)}</p>
                      {esImpuestoMunicipal(o.tipo) && !o.municipio && (
                        <button
                          onClick={() => setSinMunicipio(o)}
                          className="mt-0.5 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-100"
                          title="La declaración de este impuesto es por municipio"
                        >
                          Sin municipio · asignar
                        </button>
                      )}
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-400">
                        <span>{PERIODICIDAD_LABELS[o.periodicidad]}</span>
                        <span>·</span>
                        <select
                          className="max-w-[9rem] truncate bg-transparent text-xs text-gray-500 outline-none hover:text-indigo-600"
                          value={o.asignadoA ?? ''}
                          onChange={(e) => asignar.mutate({ obligacionId: o.id, asignadoA: e.target.value || null })}
                          title="Responsable de la revisión"
                        >
                          <option value="">Sin responsable</option>
                          {usuarios.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.nombre}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    {o.revisiones.map((r) => {
                      const vencida =
                        r.estado !== 'revisada' && !!r.fechaVencimiento && r.fechaVencimiento < hoy
                      return (
                        <td key={r.id} colSpan={span} className="px-1 py-2">
                          <button
                            onClick={() => navigate(`/empresas/${empresaId}/tributario/${r.id}`)}
                            title={`${etiquetaPeriodo(o.periodicidad, r.periodo)}${
                              r.fechaVencimiento ? ` · vence ${fechaCorta(r.fechaVencimiento)}` : ''
                            }${
                              r.fechaPresentacion
                                ? ` · presentada ${fechaCorta(r.fechaPresentacion)}${
                                    presentacionExtemporanea(r) ? ' (fuera de plazo)' : ''
                                  }`
                                : ''
                            }`}
                            className={cn(
                              'w-full rounded-md border px-1 py-1.5 text-center text-xs font-medium transition-colors',
                              claseCelda(r, vencida),
                            )}
                          >
                            {textoCelda(r, vencida)}
                          </button>
                        </td>
                      )
                    })}
                    <td className="px-2 py-2 text-center">
                      {firmadas === 0 && (
                        <button
                          onClick={async () => {
                            const ok = await confirmar({
                              titulo: `¿Eliminar ${nombreObligacion(o)}?`,
                              descripcion: `Se quitará de la vigencia ${o.anioFiscal} junto con sus cifras y hallazgos.`,
                            })
                            if (ok) eliminar.mutate(o.id)
                          }}
                          title="Eliminar obligación"
                          className="rounded p-1 text-gray-300 transition-colors hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Convenciones */}
      {obligaciones.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-gray-200 bg-gray-50" /> Pendiente</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-amber-200 bg-amber-50" /> En revisión</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-emerald-200 bg-emerald-50" /> Firmada sin observaciones</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-orange-200 bg-orange-50" /> Firmada con observaciones</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" /><span className="h-2.5 w-2.5 rounded-sm bg-orange-500" /> Firmada y presentada (sin / con observaciones)</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-rose-200 bg-rose-50" /> Vencida sin revisar</span>
        </div>
      )}

      <ModalMunicipio
        obligacion={sinMunicipio}
        existentes={obligaciones}
        onClose={() => setSinMunicipio(null)}
        onGuardado={() => { setSinMunicipio(null); invalidar() }}
      />

      <ModalNuevaObligacion
        open={modalAbierto}
        onClose={() => setModalAbierto(false)}
        empresaId={empresaId!}
        anio={anio}
        usuarios={usuarios}
        existentes={obligaciones}
        onCreada={invalidar}
      />
    </div>
  )
}

function ModalNuevaObligacion({
  open,
  onClose,
  empresaId,
  anio,
  usuarios,
  existentes,
  onCreada,
}: {
  open: boolean
  onClose: () => void
  empresaId: string
  anio: number
  usuarios: { id: string; nombre: string }[]
  existentes: ObligacionConRevisiones[]
  onCreada: () => void
}) {
  const [tipo, setTipo] = useState<TipoImpuesto>('retefuente')
  const [nombre, setNombre] = useState('')
  const [municipio, setMunicipio] = useState('')
  const [periodicidad, setPeriodicidad] = useState<Periodicidad>(IMPUESTOS_CATALOGO.retefuente.periodicidadDefault)
  const municipal = esImpuestoMunicipal(tipo)
  const [asignadoA, setAsignadoA] = useState('')

  const crear = useMutation({
    mutationFn: () =>
      api.post(`/empresas/${empresaId}/tributario/obligaciones`, {
        anioFiscal: anio,
        tipo,
        nombre: nombre.trim() || undefined,
        municipio: municipal ? municipio.trim() : undefined,
        periodicidad,
        asignadoA: asignadoA || null,
      }),
    onSuccess: () => {
      onCreada()
      toast.success('Obligación creada con sus períodos de la vigencia')
      setNombre('')
      setMunicipio('')
      onClose()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo crear la obligación'),
  })

  const cambiarTipo = (t: TipoImpuesto) => {
    setTipo(t)
    setPeriodicidad(IMPUESTOS_CATALOGO[t].periodicidadDefault)
  }

  // Impuestos municipales: una obligación por municipio (reteICA de Bogotá y de Cali en la misma vigencia).
  const yaExiste = tipo !== 'otro' && (municipal
    ? !!municipio.trim() && existentes.some((o) => o.tipo === tipo && mismoMunicipio(o.municipio, municipio))
    : existentes.some((o) => o.tipo === tipo))

  return (
    <Modal open={open} onClose={onClose} title={`Agregar obligación — vigencia ${anio}`}>
      <div className="space-y-4">
        <Select
          label="Impuesto"
          value={tipo}
          onChange={(e) => cambiarTipo(e.target.value as TipoImpuesto)}
          options={TIPOS_IMPUESTO.map((t) => ({ value: t, label: IMPUESTOS_CATALOGO[t].nombre }))}
        />
        <p className="text-xs text-gray-500 -mt-2">{IMPUESTOS_CATALOGO[tipo].descripcion}</p>
        {municipal && <CampoMunicipio valor={municipio} onCambio={setMunicipio} />}
        {yaExiste && (
          <p className="text-xs text-amber-600">
            {municipal ? `Ya existe ${IMPUESTOS_CATALOGO[tipo].nombre} de ${nombreMunicipio(municipio)} en la vigencia ${anio}.` : `Esa obligación ya existe en la vigencia ${anio}.`}
          </p>
        )}
        <Input
          label={tipo === 'otro' ? 'Nombre de la obligación' : 'Etiqueta (opcional)'}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder={tipo === 'otro' ? 'p. ej. Estampilla pro-desarrollo' : municipal ? 'Opcional: el municipio ya va en el nombre' : 'p. ej. Retención en la fuente sede principal'}
        />
        <Select
          label="Periodicidad"
          value={periodicidad}
          onChange={(e) => setPeriodicidad(e.target.value as Periodicidad)}
          options={PERIODICIDADES.map((p) => ({ value: p, label: PERIODICIDAD_LABELS[p] }))}
        />
        <Select
          label="Responsable de la revisión"
          value={asignadoA}
          onChange={(e) => setAsignadoA(e.target.value)}
          options={[{ value: '', label: 'Sin responsable' }, ...usuarios.map((u) => ({ value: u.id, label: u.nombre }))]}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => crear.mutate()}
            loading={crear.isPending}
            disabled={yaExiste || (tipo === 'otro' && !nombre.trim()) || (municipal && !municipio.trim())}
          >
            Crear obligación
          </Button>
        </div>
      </div>
    </Modal>
  )
}

const OTRO_MUNICIPIO = '__otro__'

/**
 * Municipio de un impuesto municipal: los de la tabla de referencia en un
 * selector y "Otro municipio" para escribirlo. Guarda la clave de la tabla o el
 * nombre escrito.
 */
function CampoMunicipio({ valor, onCambio }: { valor: string; onCambio: (v: string) => void }) {
  const enTabla = MUNICIPIOS_RETEICA.some((m) => m.clave === valor)
  const [otro, setOtro] = useState(!!valor && !enTabla)
  return (
    <div className="space-y-2">
      <Select
        label="Municipio"
        value={otro ? OTRO_MUNICIPIO : valor}
        onChange={(e) => {
          if (e.target.value === OTRO_MUNICIPIO) { setOtro(true); onCambio('') } else { setOtro(false); onCambio(e.target.value) }
        }}
        options={[
          { value: '', label: 'Elige el municipio' },
          ...[...MUNICIPIOS_RETEICA].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((m) => ({ value: m.clave, label: m.nombre })),
          { value: OTRO_MUNICIPIO, label: 'Otro municipio…' },
        ]}
      />
      {otro && <Input label="Nombre del municipio" value={valor} onChange={(e) => onCambio(e.target.value)} placeholder="p. ej. Girardot" autoFocus />}
      <p className="text-xs text-gray-500">La declaración de este impuesto es por municipio: crea una obligación por cada municipio donde declara.</p>
    </div>
  )
}

/** Asigna el municipio a una obligación municipal que no lo tiene (creada antes de existir el campo). */
function ModalMunicipio({ obligacion, existentes, onClose, onGuardado }: {
  obligacion: ObligacionConRevisiones | null
  existentes: ObligacionConRevisiones[]
  onClose: () => void
  onGuardado: () => void
}) {
  const [municipio, setMunicipio] = useState('')
  const guardar = useMutation({
    mutationFn: () => api.patch(`/tributario/obligaciones/${obligacion!.id}`, { municipio: municipio.trim() }),
    onSuccess: () => { toast.success('Municipio asignado'); setMunicipio(''); onGuardado() },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo asignar el municipio'),
  })
  if (!obligacion) return null
  const repetido = !!municipio.trim() && existentes.some((o) => o.id !== obligacion.id && o.tipo === obligacion.tipo && mismoMunicipio(o.municipio, municipio))
  return (
    <Modal open onClose={onClose} title={`Municipio de ${nombreObligacion(obligacion)} ${obligacion.anioFiscal}`} size="sm">
      <div className="space-y-4">
        <CampoMunicipio valor={municipio} onCambio={setMunicipio} />
        {repetido && <p className="text-xs text-amber-600">Ya hay otra obligación de {nombreMunicipio(municipio)} en la vigencia.</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button loading={guardar.isPending} disabled={!municipio.trim() || repetido} onClick={() => guardar.mutate()}>Guardar</Button>
        </div>
      </div>
    </Modal>
  )
}
