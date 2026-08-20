import {
  Compass, TableProperties, ShieldAlert, ClipboardCheck, Calculator, CalendarClock,
  ClipboardList, ListTodo, FileText, Inbox, FileCheck2, Target, BookOpen, AlertOctagon, FileCheck,
  FileSignature, FlagTriangleRight,
} from 'lucide-react'

export type FaseNombre = 'Planificación' | 'Ejecución' | 'Informes'

export type SubTabRF =
  | 'carta_encargo' | 'entendimiento' | 'balance' | 'riesgos' | 'control_interno' | 'materialidad'
  | 'cronograma' | 'memo' | 'tareas' | 'papeles' | 'pbc' | 'informes' | 'cierre'
export type SubTabAI = 'alcance' | 'programas' | 'hallazgos' | 'informe_ai'
/** 'resumen' es la vista de inicio (dashboard); no es un paso de fase, no entra en TABS. */
export type SubTab = SubTabRF | SubTabAI | 'resumen'

export type TabConfig = {
  id: SubTab
  label: string
  icon: React.ElementType
  grupo: FaseNombre
}

export const TABS_RF: TabConfig[] = [
  { id: 'carta_encargo', label: 'Carta de encargo', icon: FileSignature, grupo: 'Planificación' },
  { id: 'entendimiento', label: 'Entendimiento', icon: Compass, grupo: 'Planificación' },
  { id: 'balance', label: 'Balance', icon: TableProperties, grupo: 'Planificación' },
  { id: 'materialidad', label: 'Materialidad', icon: Calculator, grupo: 'Planificación' },
  { id: 'riesgos', label: 'Riesgos', icon: ShieldAlert, grupo: 'Planificación' },
  { id: 'control_interno', label: 'Control interno', icon: ClipboardCheck, grupo: 'Planificación' },
  { id: 'cronograma', label: 'Cronograma', icon: CalendarClock, grupo: 'Planificación' },
  { id: 'memo', label: 'Memo de planeación', icon: ClipboardList, grupo: 'Planificación' },
  { id: 'papeles', label: 'Papeles de trabajo', icon: FileText, grupo: 'Ejecución' },
  { id: 'tareas', label: 'Tareas', icon: ListTodo, grupo: 'Ejecución' },
  { id: 'pbc', label: 'Documentos', icon: Inbox, grupo: 'Ejecución' },
  { id: 'informes', label: 'Informes', icon: FileCheck2, grupo: 'Informes' },
  { id: 'cierre', label: 'Cierre', icon: FlagTriangleRight, grupo: 'Informes' },
]

export const TABS_AI: TabConfig[] = [
  { id: 'alcance', label: 'Alcance', icon: Target, grupo: 'Planificación' },
  { id: 'programas', label: 'Programas de trabajo', icon: BookOpen, grupo: 'Ejecución' },
  { id: 'hallazgos', label: 'Hallazgos', icon: AlertOctagon, grupo: 'Ejecución' },
  { id: 'informe_ai', label: 'Informe', icon: FileCheck, grupo: 'Informes' },
]

export function tabsPorServicio(tipoServicio: string | undefined): TabConfig[] {
  return tipoServicio === 'auditoria_interna' ? TABS_AI : TABS_RF
}

export const FASES_ORDEN: FaseNombre[] = ['Planificación', 'Ejecución', 'Informes']

/** Mapea el grupo visual (fase) al id de fase que produce construirGuia. */
export const FASE_ID: Record<FaseNombre, string> = {
  'Planificación': 'planificacion',
  'Ejecución': 'ejecucion',
  'Informes': 'informes',
}

export const TIPO_LABEL: Record<string, string> = {
  financiera: 'Auditoría financiera',
  integral: 'Auditoría integral',
  especial: 'Auditoría especial',
}

export const SERVICIO_LABEL: Record<string, string> = {
  revisoria_fiscal: 'Revisoría Fiscal',
  auditoria_interna: 'Auditoría Interna',
}
