import { useRef, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeft,
  Calculator,
  CheckCircle2,
  ClipboardList,
  Download,
  ExternalLink,
  FileText,
  Lock,
  Paperclip,
  Plus,
  Printer,
  Send,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import {
  CIFRAS_CATALOGO,
  IMPUESTOS_CATALOGO,
  TIPO_ADJUNTO_LABELS,
  TIPOS_ADJUNTO_EVIDENCIA,
  TIPOS_ADJUNTO_POST_FIRMA,
  TIPOS_ADJUNTO_TRIBUTARIO,
  alcanceSugerido,
  etiquetaPeriodo,
  hallazgoTributarioPendiente,
  nombreObligacion,
  presentacionExtemporanea,
  procedimientosSugeridos,
  resolverCifras,
  type HallazgoTributario,
  type RenglonCifra,
  type ResultadoRevisionTributaria,
  type RevisionTributariaDetalle,
  type SeccionCifras,
  type TipoAdjuntoTributario,
  hallazgosDelAgente,
  esTipoAgentico,
} from '@auditorya/types'
import { api, BASE_URL } from '../../lib/api'
import { cn } from '../../lib/cn'
import { fechaCorta } from '../../lib/fechas'
import { construirHtmlInforme, descargarDocx, imprimirInforme } from '../../lib/informe-export'
import { exportOptsCedulasRevision, exportOptsRevisionTributaria, nombreArchivoCedulas, nombreArchivoRevision } from '../../lib/informe-tributario'
import { formatoCOP } from '../../lib/moneda'
import { toast } from '../../store/toast.store'
import { confirmar } from '../../store/confirm.store'
import { useAuthStore } from '../../store/auth.store'
import { Button } from '../../components/ui/Button'
import { RevisionGuiadaIva } from '../../components/empresa/RevisionGuiadaIva'
import { CampoPapel, HallazgosTabla } from '../../components/empresa/HallazgosTributarios'
import { Input } from '../../components/ui/Input'
import { InputMiles } from '../../components/ui/InputMiles'
import { Modal } from '../../components/ui/Modal'
import { Select } from '../../components/ui/Select'

function formatoTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const ESTADO_BADGE: Record<string, { texto: string; clase: string }> = {
  pendiente: { texto: 'Pendiente', clase: 'bg-gray-100 text-gray-600' },
  en_revision: { texto: 'En revisión', clase: 'bg-amber-50 text-amber-700' },
  revisada: { texto: 'Firmada', clase: 'bg-emerald-50 text-emerald-700' },
}

// Las matrices (Formulario 350) muestran un valor por celda; el selector decide cuál.
const VISTAS_MATRIZ = [
  { id: 'declarado', label: 'Declarado' },
  { id: 'libros', label: 'Según libros' },
  { id: 'diferencia', label: 'Diferencias' },
] as const
type VistaMatriz = (typeof VISTAS_MATRIZ)[number]['id']

// Orden del papel de trabajo: qué me propuse revisar y cómo, luego el trabajo,
// luego el resultado.
const SECCIONES = ['alcance', 'cifras', 'checklist', 'hallazgos', 'cierre'] as const
type Seccion = (typeof SECCIONES)[number]

export function EmpresaTributarioRevision() {
  const { id: empresaId, revisionId } = useParams<{ id: string; revisionId: string }>()
  const queryClient = useQueryClient()
  const { user, firma } = useAuthStore()
  // Pestaña activa en la URL (?seccion=) para que sobreviva a recargas y enlaces.
  const [searchParams, setSearchParams] = useSearchParams()
  const seccionParam = searchParams.get('seccion') as Seccion | null
  const seccion: Seccion = seccionParam && SECCIONES.includes(seccionParam) ? seccionParam : 'alcance'
  // Los cambios de pestaña o de paso conservan los demás parámetros (vista, paso, seccion).
  const ponerParam = (clave: string, valor: string | null) =>
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (valor === null) p.delete(clave)
        else p.set(clave, valor)
        return p
      },
      { replace: true },
    )
  const irASeccion = (s: Seccion) => ponerParam('seccion', s)
  // Revisión guiada (impuestos con agente): ?vista=pestanas muestra la vista clásica; ?paso= es el paso del asistente.
  const vistaParam = searchParams.get('vista')
  const pasoParam = Number(searchParams.get('paso'))
  const paso = pasoParam >= 1 && pasoParam <= 5 ? pasoParam : 1
  const irAPaso = (n: number) => ponerParam('paso', String(n))
  const [modalFirma, setModalFirma] = useState(false)
  // null = cerrado. `hallazgoId` distingue evidencia de un hallazgo de un soporte de la revisión.
  const [modalAdjunto, setModalAdjunto] = useState<{ hallazgoId: string | null } | null>(null)
  // Fila recién creada: la tabla le pone el foco y selecciona el texto para escribir encima.
  const [nuevoHallazgoId, setNuevoHallazgoId] = useState<string | null>(null)
  // Fila borrador de hallazgo abierta en la tabla (todavía no existe en la base).
  const [borradorHallazgo, setBorradorHallazgo] = useState(false)

  const { data: revision, isLoading } = useQuery<RevisionTributariaDetalle>({
    queryKey: ['tributario-revision', revisionId],
    queryFn: () => api.get<RevisionTributariaDetalle>(`/tributario/revisiones/${revisionId}`),
    enabled: !!revisionId,
  })

  // Misma query key que EmpresaLayout: se sirve de la caché (para el membrete del documento).
  const { data: empresa } = useQuery<{ nombre: string; nit?: string }>({
    queryKey: ['empresa', empresaId],
    queryFn: () => api.get<{ nombre: string; nit?: string }>(`/empresas/${empresaId}`),
    enabled: !!empresaId,
  })

  const { data: ia } = useQuery<{ disponible: boolean; lecturaDeclaracion?: boolean }>({
    queryKey: ['ia-estado'],
    queryFn: () => api.get('/ia/estado'),
    staleTime: 5 * 60 * 1000,
  })
  const [modalBorrador, setModalBorrador] = useState(false)
  // Revisión guiada: las cifras del período se consultan en una ventana sin salir del paso.
  const [modalCifras, setModalCifras] = useState(false)
  const [vistaMatriz, setVistaMatriz] = useState<VistaMatriz>('declarado')

  const invalidar = () => {
    queryClient.invalidateQueries({ queryKey: ['tributario-revision', revisionId] })
    queryClient.invalidateQueries({ queryKey: ['tributario', empresaId] })
  }

  const guardar = useMutation({
    mutationFn: (campos: Record<string, unknown>) => api.patch(`/tributario/revisiones/${revisionId}`, campos),
    onSuccess: invalidar,
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo guardar'),
  })

  const eliminarAdjunto = useMutation({
    mutationFn: (adjuntoId: string) => api.delete(`/tributario/adjuntos/${adjuntoId}`),
    onSuccess: invalidar,
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo eliminar el soporte'),
  })

  // Crear desde el botón "Nuevo" o desde una diferencia de cifras: en ambos
  // casos la fila nace en la tabla y se edita ahí mismo (sin modal).
  const crearHallazgo = useMutation({
    mutationFn: (vars: { descripcion: string; monto?: number | null; enfocar?: boolean }) =>
      api.post<HallazgoTributario>(`/tributario/revisiones/${revisionId}/hallazgos`, {
        descripcion: vars.descripcion,
        ...(vars.monto !== undefined ? { monto: vars.monto } : {}),
      }),
    onSuccess: (h, vars) => {
      invalidar()
      setBorradorHallazgo(false)
      // En la fila borrador el auditor ya está escribiendo: robarle el foco molesta.
      if (vars.enfocar !== false) setNuevoHallazgoId(h.id)
      irASeccion('hallazgos')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo crear el hallazgo'),
  })

  // La presentación se registra sobre la revisión firmada (endpoint propio: el
  // PATCH rechaza toda edición de una revisión sellada).
  const registrarPresentacion = useMutation({
    mutationFn: (fechaPresentacion: string | null) =>
      api.post(`/tributario/revisiones/${revisionId}/presentacion`, { fechaPresentacion }),
    onSuccess: (_, fecha) => {
      invalidar()
      toast.success(fecha ? 'Presentación registrada' : 'Se quitó la fecha de presentación')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo registrar la presentación'),
  })
  const [fechaPresentacionNueva, setFechaPresentacionNueva] = useState('')

  const reabrir = useMutation({
    mutationFn: () => api.post(`/tributario/revisiones/${revisionId}/reabrir`, {}),
    onSuccess: () => {
      invalidar()
      toast.success('Revisión reabierta (la constancia anterior se conserva en la pista)')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo reabrir'),
  })

  // La pestaña se abre en el mismo clic y se llena cuando llega la URL firmada: abrirla
  // después del await la hace parecer un popup y el navegador la bloquea en silencio.
  const descargar = async (adjuntoId: string) => {
    const ventana = window.open('', '_blank')
    try {
      const { url } = await api.get<{ url: string }>(`/tributario/adjuntos/${adjuntoId}/descarga`)
      if (ventana) ventana.location.href = `${BASE_URL}${url}`
      else window.location.href = `${BASE_URL}${url}`
    } catch (e) {
      ventana?.close()
      toast.error(e instanceof Error ? e.message : 'No se pudo descargar el soporte')
    }
  }

  if (isLoading || !revision) {
    return <div className="p-8 text-sm text-gray-400">{isLoading ? 'Cargando…' : 'Revisión no encontrada'}</div>
  }

  const catalogo = IMPUESTOS_CATALOGO[revision.obligacion.tipo]
  const sellada = revision.estado === 'revisada'
  // Las revisiones de IVA abren en el paso a paso; las pestañas quedan como vista alternativa.
  const guiada = esTipoAgentico(revision.obligacion.tipo) && vistaParam !== 'pestanas'
  // Firmada y presentada es el cierre completo del período.
  const badge =
    sellada && revision.fechaPresentacion
      ? { texto: 'Firmada y presentada', clase: 'bg-emerald-600 text-white' }
      : ESTADO_BADGE[revision.estado]
  const hechos = catalogo.checklist.filter((i) => revision.checklistEstado[i.id]?.hecho).length
  const cifrasResueltas = resolverCifras(revision.obligacion.tipo, revision.cifras)

  const tieneMatriz = CIFRAS_CATALOGO[revision.obligacion.tipo].some((s) => s.matriz)
  // La evidencia de un hallazgo se lista dentro de su fila, no en Soportes.
  const soportesRevision = revision.adjuntos.filter((a) => a.hallazgoId === null)
  // El borrador o la declaración adjuntos: se abren junto a las cifras para consultarlos.
  const declaraciones = soportesRevision.filter((a) => a.tipo === 'declaracion')

  // Hallazgo prellenado desde una diferencia de cifras (lista o matriz).
  const crearHallazgoDiferencia = (
    r: RenglonCifra,
    valores: { declarado: number | null; libros: number | null },
  ) => {
    if (valores.declarado === null || valores.libros === null) return
    const dif = valores.declarado - valores.libros
    crearHallazgo.mutate(
      {
        descripcion: `${r.label}: el valor declarado (${formatoCOP(valores.declarado)}) difiere del valor según libros (${formatoCOP(valores.libros)}) en ${formatoCOP(dif)}.`,
        monto: Math.abs(dif),
      },
      // En la revisión guiada no hay pestaña de hallazgos: se avisa dónde quedó.
      { onSuccess: () => { if (guiada) toast.success('Hallazgo creado: lo encuentras en el paso Hallazgos') } },
    )
  }

  const guardarRenglon = (id: string, lado: 'declarado' | 'libros', valor: number | null) => {
    const actual = revision.cifras[id] ?? { declarado: null, libros: null }
    if (actual[lado] === valor) return
    // Solo el campo que cambió: el backend lo funde a nivel de campo (mergeJsonbPatch),
    // así una edición del otro lado o de otro renglón en vuelo no se pisa.
    guardar.mutate({ cifras: { [id]: { [lado]: valor } } })
  }

  // Documentos: informe preliminar (revisión abierta) o constancia (firmada).
  const exportarDocumento = (formato: 'pdf' | 'word') => {
    // Las diferencias declarado vs. libros no salen en el documento: se avisa
    // mientras aún se pueden documentar como hallazgo.
    if (!sellada && diferencias > 0) {
      toast.info('Las diferencias entre la declaración y libros no salen en el informe; regístralas como hallazgo si deben informarse.')
    }
    const empresaNombre = empresa?.nombre ?? ''
    const opts = exportOptsRevisionTributaria({ revision, empresaNombre, firma, preliminar: !sellada })
    if (formato === 'pdf') {
      imprimirInforme(construirHtmlInforme(opts))
    } else {
      void descargarDocx(nombreArchivoRevision({ revision, empresaNombre, preliminar: !sellada }), opts)
    }
  }

  // Cédulas: papel de trabajo interno con todo lo comparado y las conclusiones por procedimiento.
  const exportarCedulas = (formato: 'pdf' | 'word') => {
    const empresaNombre = empresa?.nombre ?? ''
    const opts = exportOptsCedulasRevision({ revision, empresaNombre, firma })
    if (!opts) { toast.info('Aún no hay cédulas: corre el análisis primero.'); return }
    if (formato === 'pdf') imprimirInforme(construirHtmlInforme(opts))
    else void descargarDocx(nombreArchivoCedulas({ revision, empresaNombre }), opts)
  }

  const toggleItem = (itemId: string, cambio: { hecho?: boolean; nota?: string }) => {
    // Solo el/los campo(s) que cambiaron — mismo motivo que guardarRenglon.
    guardar.mutate({
      checklistEstado: {
        [itemId]: {
          ...(cambio.hecho !== undefined ? { hecho: cambio.hecho } : {}),
          ...(cambio.nota !== undefined ? { nota: cambio.nota || null } : {}),
        },
      },
    })
  }

  // Indicadores de las pestañas: qué le falta al auditor sin abrir cada sección.
  const diferencias = Object.values(cifrasResueltas).filter(
    (v) => v.declarado !== null && v.libros !== null && v.declarado !== v.libros,
  ).length
  // Los renglones se guardan parciales ({declarado} sin libros o al revés): se
  // pregunta por números, no por "distinto de null", que es true con undefined.
  const cifrasDiligenciadas = Object.values(revision.cifras).some(
    (v) => typeof v.declarado === 'number' || typeof v.libros === 'number',
  )
  const hallazgosPendientes = revision.hallazgos.filter(hallazgoTributarioPendiente).length

  const tabs: Array<{
    id: Seccion
    label: string
    Icono: typeof Calculator
    activo: string
    badge: { texto: string; clase: string } | null
  }> = [
    {
      id: 'alcance',
      label: 'Alcance y procedimientos',
      Icono: ClipboardList,
      activo: 'border-amber-300 bg-amber-50 text-amber-800',
      badge:
        (revision.alcance ?? '').trim() || (revision.procedimientos ?? '').trim()
          ? { texto: '✓', clase: 'bg-emerald-100 text-emerald-700' }
          : { texto: 'Sugerido', clase: 'bg-gray-100 text-gray-500' },
    },
    {
      id: 'cifras',
      label: 'Cifras del período',
      Icono: Calculator,
      activo: 'border-indigo-300 bg-indigo-50 text-indigo-800',
      badge:
        diferencias > 0
          ? { texto: `${diferencias} dif.`, clase: 'bg-amber-100 text-amber-700' }
          : cifrasDiligenciadas
            ? { texto: '✓', clase: 'bg-emerald-100 text-emerald-700' }
            : null,
    },
    {
      id: 'checklist',
      label: 'Checklist',
      Icono: CheckCircle2,
      activo: 'border-sky-300 bg-sky-50 text-sky-800',
      badge: {
        texto: `${hechos}/${catalogo.checklist.length}`,
        clase:
          hechos === catalogo.checklist.length
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-gray-100 text-gray-500',
      },
    },
    {
      id: 'hallazgos',
      label: 'Hallazgos',
      Icono: AlertTriangle,
      activo: 'border-rose-300 bg-rose-50 text-rose-800',
      badge:
        revision.hallazgos.length === 0
          ? null
          : hallazgosPendientes > 0
            ? { texto: `${hallazgosPendientes} pendiente${hallazgosPendientes === 1 ? '' : 's'}`, clase: 'bg-rose-100 text-rose-700' }
            : { texto: `${revision.hallazgos.length} resuelto${revision.hallazgos.length === 1 ? '' : 's'}`, clase: 'bg-emerald-100 text-emerald-700' },
    },
    {
      id: 'cierre',
      label: 'Conclusión y soportes',
      Icono: FileText,
      activo: 'border-violet-300 bg-violet-50 text-violet-800',
      badge: (revision.conclusion ?? '').trim()
        ? { texto: '✓', clase: 'bg-emerald-100 text-emerald-700' }
        : revision.adjuntos.length > 0
          ? { texto: String(revision.adjuntos.length), clase: 'bg-gray-100 text-gray-500' }
          : null,
    },
  ]

  // Cifras del período: las mismas en la pestaña y en la ventana de la revisión guiada.
  const controlesCifras = (
    <div className="flex flex-wrap items-center gap-2">
      {tieneMatriz && (
        <div className="flex rounded-lg border border-indigo-200 bg-white p-0.5 text-xs">
          {VISTAS_MATRIZ.map((v) => (
            <button
              key={v.id}
              onClick={() => setVistaMatriz(v.id)}
              className={cn(
                'rounded-md px-2.5 py-1 font-medium transition-colors',
                vistaMatriz === v.id ? 'bg-indigo-600 text-white' : 'text-indigo-700 hover:bg-indigo-50',
              )}
            >
              {v.label}
              {v.id === 'diferencia' && diferencias > 0 && (
                <span
                  className={cn(
                    'ml-1 rounded-full px-1.5 text-[10px]',
                    vistaMatriz === v.id ? 'bg-white/20' : 'bg-amber-100 text-amber-700',
                  )}
                >
                  {diferencias}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {(ia?.lecturaDeclaracion ?? ia?.disponible) && !sellada && (
        <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setModalBorrador(true)}>
          <Sparkles size={12} /> Leer borrador (IA)
        </Button>
      )}
    </div>
  )
  const contenidoCifras = (
    <div className="p-5">
    <p className="mb-4 text-xs text-gray-400">
      {tieneMatriz
        ? 'Digita lo del borrador en "Declarado" y lo de la contabilidad en "Según libros"; los totales se calculan solos. El punto ámbar marca las celdas que no cuadran, y en "Diferencias" cada una se vuelve hallazgo con un clic.'
        : 'Digita lo del borrador o formulario y lo de libros; los totales se calculan solos y las diferencias se marcan por renglón. Desde una diferencia puedes crear el hallazgo prellenado.'}{' '}
      <span className="text-gray-500">
        Las diferencias no salen en el informe: solo trasciende lo que documentes como hallazgo.
      </span>
    </p>
    {CIFRAS_CATALOGO[revision.obligacion.tipo].map((seccion) => (
      <div key={seccion.titulo} className="mb-5 last:mb-0">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
          {seccion.titulo}
        </h3>
        {seccion.matriz ? (
          <MatrizCifrasTabla
            seccion={seccion}
            valores={cifrasResueltas}
            vista={vistaMatriz}
            editable={!sellada}
            onGuardar={guardarRenglon}
            onDiferencia={crearHallazgoDiferencia}
          />
        ) : (
        <>
        <div className="mb-1 hidden grid-cols-[minmax(0,1fr)_6.5rem_6.5rem_7rem_1.75rem] items-center gap-2 px-2 text-[10px] uppercase tracking-wide text-gray-400 sm:grid">
          <span />
          <span className="text-right">Declarado</span>
          <span className="text-right">Según libros</span>
          <span className="text-right">Diferencia</span>
          <span />
        </div>
        <div className="space-y-1">
          {seccion.renglones.map((r) => {
            const valores = cifrasResueltas[r.id] ?? { declarado: null, libros: null }
            const dif =
              valores.declarado !== null && valores.libros !== null
                ? valores.declarado - valores.libros
                : null
            const editable = r.tipo === 'digitable' && !sellada
            return (
              <div
                key={r.id}
                className={cn(
                  'grid grid-cols-2 items-center gap-2 rounded-lg px-2 py-1.5 sm:grid-cols-[minmax(0,1fr)_6.5rem_6.5rem_7rem_1.75rem]',
                  r.tipo !== 'digitable' && 'bg-indigo-50/60 font-medium',
                )}
              >
                <div className="col-span-2 min-w-0 sm:col-span-1">
                  <p className="text-sm text-gray-700">{r.label}</p>
                  {r.ayuda && <p className="text-[11px] leading-snug text-gray-400">{r.ayuda}</p>}
                </div>
                {editable ? (
                  <InputMiles
                    valor={valores.declarado}
                    onValor={(v) => guardarRenglon(r.id, 'declarado', v)}
                    placeholder="—"
                    className="w-full rounded border border-gray-200 px-2 py-1 text-right text-sm text-gray-700 placeholder:text-gray-300 focus:border-indigo-300 focus:outline-none"
                  />
                ) : (
                  <p className="text-right text-sm text-gray-700">
                    {valores.declarado !== null ? formatoCOP(valores.declarado) : '—'}
                  </p>
                )}
                {editable ? (
                  <InputMiles
                    valor={valores.libros}
                    onValor={(v) => guardarRenglon(r.id, 'libros', v)}
                    placeholder="—"
                    className="w-full rounded border border-gray-200 px-2 py-1 text-right text-sm text-gray-700 placeholder:text-gray-300 focus:border-indigo-300 focus:outline-none"
                  />
                ) : (
                  <p className="text-right text-sm text-gray-700">
                    {valores.libros !== null ? formatoCOP(valores.libros) : '—'}
                  </p>
                )}
                <p
                  className={cn(
                    'text-right text-sm font-medium',
                    dif === null ? 'text-gray-300' : dif === 0 ? 'text-emerald-600' : 'text-amber-600',
                  )}
                >
                  {dif === null ? '—' : dif === 0 ? '✓' : formatoCOP(dif)}
                </p>
                <div className="flex justify-end">
                  {dif !== null && dif !== 0 && !sellada && (
                    <button
                      onClick={() => crearHallazgoDiferencia(r, valores)}
                      title="Crear hallazgo con esta diferencia"
                      className="rounded p-1 text-amber-500 transition-colors hover:bg-amber-50 hover:text-amber-700"
                    >
                      <AlertTriangle size={13} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        </>
        )}
      </div>
    ))}
    </div>
  )

  return (
    <div className="min-h-full space-y-6 bg-slate-50 p-8">
      {/* Encabezado */}
      <div>
        <Link
          to={`/empresas/${empresaId}/tributario`}
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-indigo-600"
        >
          <ArrowLeft size={14} /> Tributario
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {nombreObligacion(revision.obligacion)} — {etiquetaPeriodo(revision.obligacion.periodicidad, revision.periodo)}{' '}
              {revision.obligacion.anioFiscal}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-gray-500">
              <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', badge.clase)}>{badge.texto}</span>
              {revision.obligacion.asignadoNombre && <span>Responsable: {revision.obligacion.asignadoNombre}</span>}
              <label className="flex items-center gap-1.5">
                Vence:
                <input
                  type="date"
                  defaultValue={revision.fechaVencimiento ?? ''}
                  disabled={sellada}
                  onChange={(e) => guardar.mutate({ fechaVencimiento: e.target.value || null })}
                  className="rounded border border-gray-200 px-1.5 py-0.5 text-xs text-gray-600 disabled:bg-gray-50"
                />
              </label>
            </div>
          </div>
          {!sellada && !guiada && (
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-xs text-gray-400">Informe preliminar:</span>
              <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => exportarDocumento('pdf')}>
                <Printer size={13} /> PDF
              </Button>
              <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => exportarDocumento('word')}>
                <Download size={13} /> Word
              </Button>
              <Button className="gap-2" onClick={() => setModalFirma(true)}>
                <CheckCircle2 size={15} /> Firmar revisión
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Constancia (revisión firmada) */}
      {sellada && (
        <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Lock size={16} className="text-emerald-600 shrink-0" />
              <p className="text-sm text-emerald-800">
                <span className="font-semibold">Constancia:</span> revisión firmada
                {revision.revisadoNombre ? ` por ${revision.revisadoNombre}` : ''} el{' '}
                {fechaCorta(revision.revisadoAt)} —{' '}
                {revision.resultado === 'con_observaciones' ? 'con observaciones' : 'sin observaciones'}. El contenido
                quedó sellado.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-xs text-emerald-700">Constancia:</span>
              <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => exportarDocumento('pdf')}>
                <Printer size={13} /> PDF
              </Button>
              <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => exportarDocumento('word')}>
                <Download size={13} /> Word
              </Button>
              {user?.rol === 'socio' && (
                <Button size="sm" variant="secondary" loading={reabrir.isPending} onClick={() => reabrir.mutate()}>
                  Reabrir
                </Button>
              )}
            </div>
          </div>

          {/* Presentación: ocurre después de la firma y queda en la constancia. */}
          <div className="flex flex-wrap items-center gap-2 border-t border-emerald-200 pt-3 text-sm text-emerald-800">
            <Send size={14} className="shrink-0 text-emerald-600" />
            {revision.fechaPresentacion ? (
              <>
                <span>
                  <span className="font-semibold">Presentada</span> el {fechaCorta(revision.fechaPresentacion)}
                </span>
                {presentacionExtemporanea(revision) && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                    Fuera de plazo · vencía el {fechaCorta(revision.fechaVencimiento)}
                  </span>
                )}
                {/* Atajo: registrar la fecha y subir la declaración presentada en el mismo lugar. */}
                {revision.adjuntos.some((a) => a.posteriorAFirma && a.tipo === 'declaracion') ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-700">
                    <CheckCircle2 size={12} /> Declaración presentada adjunta
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="gap-1.5"
                    onClick={() => setModalAdjunto({ hallazgoId: null })}
                  >
                    <Upload size={12} /> Adjuntar declaración presentada
                  </Button>
                )}
                <button
                  onClick={() => registrarPresentacion.mutate(null)}
                  disabled={registrarPresentacion.isPending}
                  className="ml-auto text-xs text-emerald-700 underline-offset-2 hover:underline disabled:opacity-50"
                >
                  Quitar fecha
                </button>
              </>
            ) : (
              <>
                <span>¿Ya se presentó la declaración?</span>
                <input
                  type="date"
                  value={fechaPresentacionNueva}
                  // Hoy en la zona del navegador; el backend valida lo mismo.
                  max={new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10)}
                  onChange={(e) => setFechaPresentacionNueva(e.target.value)}
                  className="rounded border border-emerald-200 bg-white px-1.5 py-0.5 text-xs text-gray-700"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!fechaPresentacionNueva}
                  loading={registrarPresentacion.isPending}
                  onClick={() =>
                    registrarPresentacion.mutate(fechaPresentacionNueva, {
                      onSuccess: () => setFechaPresentacionNueva(''),
                    })
                  }
                >
                  Registrar presentación
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {guiada ? (
        <RevisionGuiadaIva
          revision={revision}
          empresa={empresa ?? null}
          sellada={sellada}
          iaDisponible={!!ia?.disponible}
          lecturaDisponible={!!(ia?.lecturaDeclaracion ?? ia?.disponible)}
          paso={paso}
          onPaso={irAPaso}
          guardar={(campos) => guardar.mutate(campos)}
          guardando={guardar.isPending}
          invalidar={invalidar}
          onLeerBorrador={() => setModalBorrador(true)}
          onAdjuntar={(hallazgoId) => setModalAdjunto({ hallazgoId })}
          onDescargar={descargar}
          onEliminarAdjunto={(adjuntoId) => eliminarAdjunto.mutate(adjuntoId)}
          onFirmar={() => setModalFirma(true)}
          onVerCifras={() => setModalCifras(true)}
          diferenciasCifras={diferencias}
          exportarDocumento={exportarDocumento}
          exportarCedulas={exportarCedulas}
          irAPestanas={() => ponerParam('vista', 'pestanas')}
          nuevoHallazgoId={nuevoHallazgoId}
          onEnfocadoNuevo={() => setNuevoHallazgoId(null)}
          borradorHallazgo={borradorHallazgo}
          setBorradorHallazgo={setBorradorHallazgo}
          onCrearHallazgo={(descripcion) => crearHallazgo.mutate({ descripcion, enfocar: false })}
        />
      ) : (
      <>
      {/* Secciones en pestañas con indicador de estado: el auditor avanza por el
          flujo (cifras → checklist → hallazgos → cierre) sin saturarse. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {esTipoAgentico(revision.obligacion.tipo) && (
          <button onClick={() => ponerParam('vista', null)} className="mr-2 flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100">
            <Sparkles size={14} /> Revisión guiada
          </button>
        )}
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => irASeccion(t.id)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
              seccion === t.id ? t.activo : 'border-transparent text-gray-500 hover:bg-white hover:text-gray-700',
            )}
          >
            <t.Icono size={14} /> {t.label}
            {t.badge && (
              <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold', t.badge.clase)}>
                {t.badge.texto}
              </span>
            )}
          </button>
        ))}
      </div>

      {seccion === 'alcance' && (
        <section className="overflow-hidden rounded-xl border border-amber-100 bg-white">
          <div className="border-b border-amber-100 bg-amber-50/70 px-5 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
              <ClipboardList size={14} className="text-amber-500" /> Alcance y procedimientos
            </h2>
          </div>
          <div className="space-y-5 p-5">
            <p className="text-xs text-gray-400">
              Encabezado del papel de trabajo: qué te propusiste revisar y con qué procedimientos. Viene con un
              borrador estándar del impuesto — ajústalo a este período. Encabeza el informe preliminar y la
              constancia, y queda sellado al firmar.
            </p>
            <CampoPapel
              etiqueta="Alcance"
              ayuda="Qué cubre la revisión de este período y qué no. Delimita la responsabilidad frente al cliente."
              valor={revision.alcance}
              sugerido={alcanceSugerido({
                obligacion: revision.obligacion,
                periodo: revision.periodo,
                empresaNombre: empresa?.nombre ?? '',
              })}
              // Remonta cuando llega el nombre de la empresa o al restaurar el sugerido.
              remontar={`${empresa?.nombre ?? ''}|${revision.alcance === null}`}
              filas={7}
              deshabilitado={sellada}
              onGuardar={(v) => guardar.mutate({ alcance: v })}
            />
            <CampoPapel
              etiqueta="Procedimientos"
              ayuda="El programa de trabajo del impuesto. El borrador sale del checklist; añade los procedimientos específicos que apliques."
              valor={revision.procedimientos}
              sugerido={procedimientosSugeridos(revision.obligacion.tipo)}
              remontar={String(revision.procedimientos === null)}
              filas={8}
              deshabilitado={sellada}
              onGuardar={(v) => guardar.mutate({ procedimientos: v })}
            />
          </div>
        </section>
      )}

      {seccion === 'cifras' && (
        <>
          {/* Cifras del período — mini-formulario espejo del formulario oficial */}
          <section className="overflow-hidden rounded-xl border border-indigo-100 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 bg-indigo-50/70 px-5 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-indigo-900">
                <Calculator size={14} className="text-indigo-500" /> Cifras del período
              </h2>
              {controlesCifras}
            </div>
            {contenidoCifras}
          </section>
        </>
      )}

      {seccion === 'checklist' && (
        <>
          <section className="overflow-hidden rounded-xl border border-sky-100 bg-white">
            <div className="flex items-center justify-between border-b border-sky-100 bg-sky-50/70 px-5 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-sky-900">
                <CheckCircle2 size={14} className="text-sky-500" /> Checklist de revisión
              </h2>
              <span className="text-xs font-medium text-sky-600">
                {hechos} / {catalogo.checklist.length}
              </span>
            </div>
            <div className="p-5">
            <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-sky-100">
              <div
                className="h-full rounded-full bg-sky-500 transition-all"
                style={{ width: `${(hechos / catalogo.checklist.length) * 100}%` }}
              />
            </div>
            <ul className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
              {catalogo.checklist.map((item) => {
                const estado = revision.checklistEstado[item.id] ?? { hecho: false, nota: null }
                return (
                  <li key={item.id} className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      // Un ítem con solo nota se guarda sin `hecho`: forzar booleano.
                      checked={!!estado.hecho}
                      disabled={sellada || guardar.isPending}
                      onChange={(e) => toggleItem(item.id, { hecho: e.target.checked })}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="min-w-0 flex-1">
                      <p className={cn('text-sm', estado.hecho ? 'text-gray-400 line-through' : 'text-gray-700')}>
                        {item.texto}
                      </p>
                      {item.ayuda && !estado.hecho && (
                        <p className="mt-0.5 text-[11px] leading-snug text-gray-400">{item.ayuda}</p>
                      )}
                      <input
                        type="text"
                        placeholder="Nota (opcional)"
                        defaultValue={estado.nota ?? ''}
                        disabled={sellada}
                        onBlur={(e) => {
                          if ((e.target.value || null) !== estado.nota) toggleItem(item.id, { nota: e.target.value })
                        }}
                        className="mt-1 w-full rounded border border-gray-100 px-2 py-1 text-xs text-gray-600 placeholder:text-gray-300 focus:border-indigo-300 focus:outline-none disabled:bg-gray-50"
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
            </div>
          </section>
        </>
      )}

      {seccion === 'hallazgos' && (
        <>
          {/* Hallazgos y recomendaciones — tabla editable en línea */}
          <section className="overflow-hidden rounded-xl border border-rose-100 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-100 bg-rose-50/70 px-5 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-rose-900">
                <AlertTriangle size={14} className="text-rose-500" /> Hallazgos y recomendaciones
              </h2>
              {!sellada && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="gap-1.5"
                  disabled={borradorHallazgo}
                  onClick={() => setBorradorHallazgo(true)}
                >
                  <Plus size={13} /> Nuevo hallazgo
                </Button>
              )}
            </div>
            <div className="p-5">
              <HallazgosTabla
                hallazgos={revision.hallazgos}
                sellada={sellada}
                iaDisponible={!!ia?.disponible}
                nuevoId={nuevoHallazgoId}
                onEnfocadoNuevo={() => setNuevoHallazgoId(null)}
                borrador={borradorHallazgo}
                onCerrarBorrador={() => setBorradorHallazgo(false)}
                onCrear={(descripcion) => crearHallazgo.mutate({ descripcion, enfocar: false })}
                adjuntos={revision.adjuntos}
                onAdjuntar={(hallazgoId) => setModalAdjunto({ hallazgoId })}
                onDescargar={descargar}
                onEliminarAdjunto={(adjuntoId) => eliminarAdjunto.mutate(adjuntoId)}
                onCambio={invalidar}
                origenAgente={hallazgosDelAgente(revision.agente)}
                />
            </div>
          </section>
        </>
      )}

      {seccion === 'cierre' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
          {/* Observaciones y conclusión */}
          <section className="overflow-hidden rounded-xl border border-violet-100 bg-white">
            <div className="border-b border-violet-100 bg-violet-50/70 px-5 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-violet-900">
                <FileText size={14} className="text-violet-500" /> Observaciones y conclusión
              </h2>
            </div>
            <div className="space-y-4 p-5">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-900">Observaciones</label>
              <textarea
                rows={3}
                defaultValue={revision.observaciones ?? ''}
                disabled={sellada}
                onBlur={(e) => {
                  if ((e.target.value || null) !== revision.observaciones) guardar.mutate({ observaciones: e.target.value })
                }}
                placeholder="Diferencias encontradas, partidas por aclarar, recomendaciones al cliente…"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-300 focus:border-indigo-300 focus:outline-none disabled:bg-gray-50"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-900">Conclusión</label>
              <textarea
                rows={3}
                defaultValue={revision.conclusion ?? ''}
                disabled={sellada}
                onBlur={(e) => {
                  if ((e.target.value || null) !== revision.conclusion) guardar.mutate({ conclusion: e.target.value })
                }}
                placeholder="p. ej. Revisada la declaración del período contra libros; las bases y tarifas son razonables y se presentó y pagó oportunamente."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-300 focus:border-indigo-300 focus:outline-none disabled:bg-gray-50"
              />
              <p className="mt-1 text-xs text-gray-400">Requerida para firmar la revisión (constancia).</p>
            </div>
            </div>
          </section>
          </div>
          <div>
          <section className="overflow-hidden rounded-xl border border-teal-100 bg-white">
            <div className="flex items-center justify-between border-b border-teal-100 bg-teal-50/70 px-5 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-teal-900">
                <Paperclip size={14} className="text-teal-500" /> Soportes
              </h2>
              <Button
                size="sm"
                variant="secondary"
                className="gap-1.5"
                onClick={() => setModalAdjunto({ hallazgoId: null })}
              >
                <Upload size={13} /> Adjuntar
              </Button>
            </div>
            <div className="p-5">
            <p className="mb-3 text-xs text-gray-400">
              {sellada
                ? 'Revisión firmada: puedes agregar la declaración presentada y el recibo de pago. Quedan marcados como incorporados después de la firma.'
                : 'Declaración presentada, recibo de pago, conciliación. Quedan en la constancia al firmar.'}{' '}
              La evidencia de un hallazgo se adjunta desde su fila, en la pestaña de hallazgos.
            </p>
            {soportesRevision.length > 0 && (
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gray-600">
                <Download size={12} className="text-indigo-500" /> Haz clic en el nombre o en Descargar para abrir el archivo. El enlace vale 15 minutos.
              </p>
            )}
            {soportesRevision.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-gray-200 py-6 text-center">
                <Paperclip size={16} className="text-gray-300" />
                <p className="text-xs text-gray-400">Sin soportes aún</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {soportesRevision.map((a) => (
                  <li key={a.id} className="rounded-lg border border-gray-200 px-3 py-2.5 transition-colors hover:border-indigo-200">
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                        <FileText size={15} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <button
                          onClick={() => descargar(a.id)}
                          title={`Descargar ${a.archivoNombre}`}
                          className="block max-w-full truncate text-left text-sm font-medium text-gray-800 underline-offset-2 hover:text-indigo-700 hover:underline"
                        >
                          {a.nombre}
                        </button>
                        <p className="truncate text-[11px] text-gray-500" title={a.archivoNombre}>{a.archivoNombre}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-gray-400">
                          <span>{TIPO_ADJUNTO_LABELS[a.tipo]}</span>·<span>{formatoTamano(a.archivoTamano)}</span>·<span>{fechaCorta(a.createdAt)}</span>
                          {a.posteriorAFirma && (
                            <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">Después de la firma</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-end gap-1.5 border-t border-gray-100 pt-2">
                      {/* Firmada: solo se quita lo agregado después; lo sellado es inmutable. */}
                      {(!sellada || a.posteriorAFirma) && (
                        <button
                          onClick={async () => {
                            const ok = await confirmar({ titulo: `¿Quitar "${a.nombre}"?`, descripcion: 'El archivo se elimina de los soportes de la revisión.' })
                            if (ok) eliminarAdjunto.mutate(a.id)
                          }}
                          title="Quitar"
                          className="mr-auto rounded p-1 text-gray-300 transition-colors hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                      <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => descargar(a.id)}>
                        <Download size={13} /> Descargar
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            </div>
          </section>
          </div>
        </div>
      )}
      </>
      )}

      <ModalFirmar
        open={modalFirma}
        onClose={() => setModalFirma(false)}
        revision={revision}
        onFirmada={invalidar}
        hayDiferencias={diferencias > 0}
        onVerDiferencias={() => {
          setModalFirma(false)
          setVistaMatriz('diferencia')
          irASeccion('cifras')
        }}
      />
      <ModalAdjunto
        open={modalAdjunto !== null}
        onClose={() => setModalAdjunto(null)}
        revisionId={revision.id}
        hallazgoId={modalAdjunto?.hallazgoId ?? null}
        onSubido={invalidar}
        soloPostFirma={sellada}
      />
      <Modal
        open={modalCifras}
        onClose={() => setModalCifras(false)}
        title={`Cifras del período — ${nombreObligacion(revision.obligacion)} ${etiquetaPeriodo(revision.obligacion.periodicidad, revision.periodo)} ${revision.obligacion.anioFiscal}`}
        size="xl"
      >
        <div className="-mx-6 -my-5">
          <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-indigo-100 bg-indigo-50/90 px-5 py-2.5 backdrop-blur">
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-indigo-900">
              {declaraciones.length === 0 ? (
                <span className="text-indigo-700/70">Sin borrador adjunto como soporte.</span>
              ) : (
                declaraciones.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => descargar(a.id)}
                    title={`Abrir ${a.archivoNombre}`}
                    className="flex max-w-xs items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-2.5 py-1 font-medium text-indigo-700 hover:border-indigo-300 hover:bg-indigo-50"
                  >
                    <FileText size={13} className="shrink-0" />
                    <span className="truncate">{a.nombre}</span>
                    <ExternalLink size={12} className="shrink-0 opacity-70" />
                  </button>
                ))
              )}
            </div>
            {controlesCifras}
          </div>
          {contenidoCifras}
        </div>
      </Modal>
      <ModalBorrador
        open={modalBorrador}
        onClose={() => setModalBorrador(false)}
        revision={revision}
        onCambio={invalidar}
      />
    </div>
  )
}

/**
 * Sección del catálogo presentada como matriz (Formulario 350): conceptos en
 * filas y base/retención por tipo de beneficiario en columnas, como en los
 * programas contables. Cada celda muestra un solo valor según la vista:
 * declarado, según libros o la diferencia (que se vuelve hallazgo con un clic).
 */
function MatrizCifrasTabla({
  seccion,
  valores,
  vista,
  editable,
  onGuardar,
  onDiferencia,
}: {
  seccion: SeccionCifras
  valores: Record<string, { declarado: number | null; libros: number | null }>
  vista: VistaMatriz
  editable: boolean
  onGuardar: (id: string, lado: 'declarado' | 'libros', valor: number | null) => void
  onDiferencia: (r: RenglonCifra, valores: { declarado: number | null; libros: number | null }) => void
}) {
  const matriz = seccion.matriz!
  const porId = new Map(seccion.renglones.map((r) => [r.id, r]))
  // Sin símbolo de moneda: en una matriz densa el "$" en cada celda estorba.
  const numero = (v: number) => Math.round(v).toLocaleString('es-CO')
  // Compacta (actividades del ICA): hasta la última fila con valor, más una vacía para seguir digitando.
  const conValor = (f: (typeof matriz.filas)[number]) => f.celdas.some((id) => id && (valores[id]?.declarado != null || valores[id]?.libros != null))
  const ultima = matriz.filas.reduce((u, f, i) => (conValor(f) ? i : u), -1)
  const filasVisibles = matriz.compacta ? matriz.filas.slice(0, Math.max(ultima + (editable ? 2 : 1), 1)) : matriz.filas

  const celda = (id: string | null, clave: string, esTotal = false) => {
    if (!id) {
      // Casilla inexistente en el formulario: gris, como en el 350. En el pie, vacía.
      return <td key={clave} className={cn('border-l border-gray-100', !esTotal && 'bg-gray-100')} />
    }
    const r = porId.get(id)!
    const v = valores[id] ?? { declarado: null, libros: null }
    const dif = v.declarado !== null && v.libros !== null ? v.declarado - v.libros : null

    let contenido: ReactNode
    if (vista === 'diferencia') {
      contenido =
        dif === null ? (
          <span className="block px-2 py-1.5 text-right text-gray-300">—</span>
        ) : dif === 0 ? (
          <span className="block px-2 py-1.5 text-right text-emerald-600">✓</span>
        ) : editable && !esTotal ? (
          <button
            onClick={() => onDiferencia(r, v)}
            title="Crear hallazgo con esta diferencia"
            className="block w-full px-2 py-1.5 text-right font-medium text-amber-700 transition-colors hover:bg-amber-50 hover:underline"
          >
            {numero(dif)}
          </button>
        ) : (
          <span className="block px-2 py-1.5 text-right font-medium text-amber-700">{numero(dif)}</span>
        )
    } else if (editable && r.tipo === 'digitable') {
      contenido = (
        <InputMiles
          key={`${id}-${vista}`}
          valor={v[vista]}
          onValor={(x) => onGuardar(id, vista, x)}
          placeholder="—"
          className="w-full bg-transparent px-2 py-1.5 text-right text-gray-700 placeholder:text-gray-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-inset focus:ring-indigo-300"
        />
      )
    } else {
      const x = v[vista]
      contenido = <span className="block px-2 py-1.5 text-right text-gray-700">{x !== null ? numero(x) : '—'}</span>
    }

    return (
      <td key={clave} className="border-l border-gray-100 p-0">
        <div className="relative flex items-stretch">
          {r.casilla && (
            <span className="flex w-8 shrink-0 items-center justify-center bg-gray-50 text-[10px] text-gray-400">
              {r.casilla}
            </span>
          )}
          <div className="min-w-0 flex-1">{contenido}</div>
          {/* Aviso de diferencia sin tener que cambiar de vista. */}
          {vista !== 'diferencia' && dif !== null && dif !== 0 && (
            <span
              title="Declarado y libros no coinciden"
              className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-amber-400"
            />
          )}
        </div>
      </td>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-xs" style={{ minWidth: 820 }}>
        <thead>
          <tr className="bg-indigo-50 text-[11px] font-semibold text-indigo-900">
            <th rowSpan={2} className="px-3 py-2 text-left align-bottom">
              Concepto
            </th>
            {matriz.grupos.map((g) => (
              <th key={g.label} colSpan={g.columnas.length} className="border-l border-indigo-100 px-2 py-1.5 text-center">
                {g.label}
              </th>
            ))}
          </tr>
          <tr className="bg-indigo-50/50 text-[10px] font-medium text-indigo-700">
            {matriz.grupos.flatMap((g) =>
              g.columnas.map((c) => (
                <th key={`${g.label}-${c}`} className="w-[17%] border-l border-indigo-100 px-2 py-1 text-center">
                  {c}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filasVisibles.map((f) => (
            <tr key={f.label} className="hover:bg-slate-50/60">
              <td className={cn('px-3 py-1.5 text-gray-700', f.ayuda && 'cursor-help')} title={f.ayuda}>
                {f.label}
              </td>
              {f.celdas.map((id, i) => celda(id, `${f.label}-${i}`))}
            </tr>
          ))}
        </tbody>
        {matriz.total && (
          <tfoot>
            <tr className="border-t-2 border-indigo-100 bg-indigo-50/60 font-semibold text-indigo-900">
              <td className="px-3 py-2">{matriz.total.label}</td>
              {matriz.total.celdas.map((id, i) => celda(id, `total-${i}`, true))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

// ─── Lectura del borrador de la declaración con IA ───────────────────────────
// Sube el PDF/imagen del borrador (MUISCA), la IA extrae los valores por
// renglón y se aplican a la columna "Declarado"; el revisor digita libros y
// audita las diferencias.

type LecturaBorrador = {
  renglones: Record<string, number | null>
  advertencias: string[]
  adjuntoId: string | null
  /** Qué leyó el formulario: el workflow propio o el LLM (fallback). */
  fuente?: 'n8n' | 'llm'
}

function ModalBorrador({
  open,
  onClose,
  revision,
  onCambio,
}: {
  open: boolean
  onClose: () => void
  revision: RevisionTributariaDetalle
  onCambio: () => void
}) {
  const [archivo, setArchivo] = useState<File | null>(null)
  const [guardarSoporte, setGuardarSoporte] = useState(true)
  const [resultado, setResultado] = useState<{
    aplicados: number
    advertencias: string[]
    fuente?: 'n8n' | 'llm'
  } | null>(null)
  const inputArchivo = useRef<HTMLInputElement>(null)

  const leer = useMutation({
    mutationFn: async () => {
      const fd = new FormData()
      fd.append('archivo', archivo!)
      fd.append('guardarSoporte', guardarSoporte ? '1' : '0')
      const lectura = await api.upload<LecturaBorrador>(
        `/tributario/revisiones/${revision.id}/ia/leer-borrador`,
        fd,
      )

      // Aplica solo los valores leídos, y solo la columna "Declarado" — el
      // backend funde a nivel de campo (mergeJsonbPatch), así que "Según libros"
      // digitado durante los ~120s de la lectura IA no se pierde.
      const cifras: Record<string, { declarado: number }> = {}
      let aplicados = 0
      for (const [id, valor] of Object.entries(lectura.renglones)) {
        if (valor === null) continue
        cifras[id] = { declarado: valor }
        aplicados++
      }
      if (aplicados > 0) {
        await api.patch(`/tributario/revisiones/${revision.id}`, { cifras })
      }
      return { aplicados, advertencias: lectura.advertencias, fuente: lectura.fuente }
    },
    onSuccess: (r) => {
      onCambio()
      setResultado(r)
      setArchivo(null)
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo leer el borrador'),
  })

  const cerrar = () => {
    setResultado(null)
    setArchivo(null)
    onClose()
  }

  return (
    <Modal open={open} onClose={cerrar} title="Leer borrador de la declaración">
      {resultado ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
            <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />
            Se diligenciaron {resultado.aplicados} renglón(es) en la columna "Declarado"
            {resultado.fuente === 'llm' ? ' (leído por el LLM: el workflow no respondió)' : ''}.
          </div>
          {resultado.advertencias.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
              <p className="mb-1 text-xs font-semibold text-amber-800">Advertencias de la lectura</p>
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-amber-700">
                {resultado.advertencias.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-gray-400">
            Verifica los valores contra el borrador antes de confiar en ellos: la lectura automática puede
            equivocarse. Ahora digita la columna "Según libros" para auditar las diferencias.
          </p>
          <div className="flex justify-end pt-1">
            <Button onClick={cerrar}>Listo</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Sube el borrador de la declaración de <strong>{nombreObligacion(revision.obligacion)}</strong> (PDF del
            MUISCA o una imagen legible) y la IA diligenciará la columna "Declarado" renglón por renglón.
          </p>
          <input
            ref={inputArchivo}
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          />
          <button
            onClick={() => inputArchivo.current?.click()}
            className="flex w-full items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2.5 text-sm text-gray-500 transition-colors hover:border-indigo-300 hover:text-indigo-600"
          >
            <Paperclip size={14} />
            {archivo ? (
              <span className="truncate text-gray-700">
                {archivo.name} · {formatoTamano(archivo.size)}
              </span>
            ) : (
              'Seleccionar el borrador (PDF o imagen, máx. 10 MB)…'
            )}
          </button>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={guardarSoporte}
              onChange={(e) => setGuardarSoporte(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Guardar también como soporte de la revisión (declaración)
          </label>
          <p className="text-xs text-gray-400">
            Los valores leídos reemplazan lo que haya en "Declarado" en esos renglones; la columna "Según libros"
            no se toca.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={cerrar}>
              Cancelar
            </Button>
            <Button onClick={() => leer.mutate()} loading={leer.isPending} disabled={!archivo}>
              <Sparkles size={13} className="mr-1.5" /> Leer y diligenciar
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function ModalAdjunto({
  open,
  onClose,
  revisionId,
  hallazgoId,
  onSubido,
  soloPostFirma,
}: {
  open: boolean
  onClose: () => void
  revisionId: string
  /** Evidencia de ese hallazgo; null = soporte de la revisión. */
  hallazgoId: string | null
  onSubido: () => void
  /** Revisión firmada: solo declaración presentada o recibo de pago. */
  soloPostFirma: boolean
}) {
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<TipoAdjuntoTributario>('declaracion')
  const [archivo, setArchivo] = useState<File | null>(null)
  const inputArchivo = useRef<HTMLInputElement>(null)
  // Opciones según el destino: la evidencia solo aplica a un hallazgo y, con la
  // revisión firmada, solo entran declaración y pago.
  const opciones: readonly TipoAdjuntoTributario[] = hallazgoId
    ? TIPOS_ADJUNTO_EVIDENCIA
    : soloPostFirma
      ? TIPOS_ADJUNTO_POST_FIRMA
      : TIPOS_ADJUNTO_TRIBUTARIO.filter((t) => t !== 'evidencia')
  // El modal no se desmonta: si el tipo elegido antes no aplica al destino
  // actual, cae en el primero válido (el backend rechazaría el que no aplica).
  const tipoEfectivo: TipoAdjuntoTributario = opciones.includes(tipo) ? tipo : opciones[0]

  const subir = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append('archivo', archivo!)
      fd.append('tipo', tipoEfectivo)
      if (hallazgoId) fd.append('hallazgoId', hallazgoId)
      if (nombre.trim()) fd.append('nombre', nombre.trim())
      return api.upload(`/tributario/revisiones/${revisionId}/adjuntos`, fd)
    },
    onSuccess: () => {
      onSubido()
      toast.success(hallazgoId ? 'Evidencia adjuntada' : 'Soporte adjuntado')
      setNombre('')
      setArchivo(null)
      onClose()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo subir el archivo'),
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        hallazgoId
          ? 'Adjuntar evidencia del hallazgo'
          : soloPostFirma
            ? 'Adjuntar soporte posterior a la firma'
            : 'Adjuntar soporte'
      }
      size="sm"
    >
      <div className="space-y-4">
        <Select
          label="Tipo de soporte"
          value={tipoEfectivo}
          onChange={(e) => setTipo(e.target.value as TipoAdjuntoTributario)}
          options={opciones.map((t) => ({ value: t, label: TIPO_ADJUNTO_LABELS[t] }))}
        />
        <Input
          label="Nombre del soporte"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="p. ej. Formulario 350 marzo firmado"
        />
        <p className="-mt-2 text-xs text-gray-400">Si lo dejas vacío se usa el nombre del archivo.</p>
        <input
          ref={inputArchivo}
          type="file"
          className="hidden"
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
        />
        <button
          onClick={() => inputArchivo.current?.click()}
          className="flex w-full items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2.5 text-sm text-gray-500 transition-colors hover:border-indigo-300 hover:text-indigo-600"
        >
          <Paperclip size={14} />
          {archivo ? (
            <span className="truncate text-gray-700">
              {archivo.name} · {formatoTamano(archivo.size)}
            </span>
          ) : (
            'Seleccionar archivo…'
          )}
        </button>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => subir.mutate()} loading={subir.isPending} disabled={!archivo}>
            Adjuntar
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function ModalFirmar({
  open,
  onClose,
  revision,
  onFirmada,
  hayDiferencias,
  onVerDiferencias,
}: {
  open: boolean
  onClose: () => void
  revision: RevisionTributariaDetalle
  onFirmada: () => void
  /** Diferencias declarado vs. libros: no bloquean, pero no saldrán en la constancia. */
  hayDiferencias: boolean
  onVerDiferencias: () => void
}) {
  const [resultado, setResultado] = useState<ResultadoRevisionTributaria>('sin_observaciones')

  const firmar = useMutation({
    mutationFn: () => api.post(`/tributario/revisiones/${revision.id}/firmar`, { resultado }),
    onSuccess: () => {
      onFirmada()
      toast.success('Revisión firmada: la constancia quedó sellada')
      onClose()
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo firmar la revisión'),
  })

  const sinConclusion = !(revision.conclusion ?? '').trim()
  const pendientes = revision.hallazgos.filter(hallazgoTributarioPendiente).length
  const sinObservaciones =
    resultado === 'con_observaciones' && revision.hallazgos.length === 0 && !(revision.observaciones ?? '').trim()
  const conflictoHallazgos = resultado === 'sin_observaciones' && pendientes > 0

  return (
    <Modal open={open} onClose={onClose} title="Firmar revisión" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Al firmar, la revisión de{' '}
          <strong>
            {nombreObligacion(revision.obligacion)} —{' '}
            {etiquetaPeriodo(revision.obligacion.periodicidad, revision.periodo)} {revision.obligacion.anioFiscal}
          </strong>{' '}
          queda sellada como constancia: se guarda una copia inmutable del checklist, las cifras, la conclusión y los
          soportes, y no podrá editarse sin que un socio la reabra.
        </p>
        <Select
          label="Resultado"
          value={resultado}
          onChange={(e) => setResultado(e.target.value as ResultadoRevisionTributaria)}
          options={[
            { value: 'sin_observaciones', label: 'Sin observaciones' },
            { value: 'con_observaciones', label: 'Con observaciones' },
          ]}
        />
        {sinConclusion && (
          <p className="text-xs text-amber-600">Escribe la conclusión antes de firmar.</p>
        )}
        {sinObservaciones && (
          <p className="text-xs text-amber-600">
            Documenta las observaciones o registra un hallazgo antes de firmar con ese resultado.
          </p>
        )}
        {conflictoHallazgos && (
          <p className="text-xs text-amber-600">
            Hay {pendientes} hallazgo(s) pendiente(s) (abiertos o en trámite): firma "con observaciones" o
            resuélvelos primero.
          </p>
        )}
        {/* Informativo, no bloquea: la constancia solo lleva hallazgos documentados. */}
        {hayDiferencias && (
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
            Hay diferencias entre la declaración y libros. No saldrán en la constancia: solo se informan los
            hallazgos documentados.{' '}
            <button onClick={onVerDiferencias} className="font-medium underline underline-offset-2 hover:text-sky-900">
              Ver diferencias
            </button>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => firmar.mutate()}
            loading={firmar.isPending}
            disabled={sinConclusion || sinObservaciones || conflictoHallazgos}
          >
            Firmar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
