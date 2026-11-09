import { useState } from 'react'
import { Printer, Download } from 'lucide-react'
import { alcanceSugerido, procedimientosSugeridos, textoConclusion, type RevisionTributariaDetalle } from '@auditorya/types'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { DocumentoEditable } from '../ui/DocumentoEditable'
import { confirmar } from '../../store/confirm.store'
import { construirHtmlInforme, descargarDocx, imprimirInforme, type FirmaMembrete } from '../../lib/informe-export'
import { exportOptsRevisionTributaria, nombreArchivoRevision } from '../../lib/informe-tributario'

/** Campos de la revisión que se escriben directamente sobre el documento. */
type Campo = 'alcance' | 'procedimientos' | 'conclusion'
const CAMPOS: Campo[] = ['alcance', 'procedimientos', 'conclusion']

/** Dónde se corrige cada sección que sale de otra parte de la revisión. */
const ORIGEN: Record<string, string> = {
  estado: 'el checklist',
  certificacion: 'la firma de la revisión',
  checklist: 'la pestaña Checklist',
  agente: 'el análisis y sus propuestas',
  cedulas: 'las cédulas de cada procedimiento',
  hallazgos: 'la pestaña Hallazgos',
  soportes: 'Conclusión y soportes',
}

/**
 * Vista previa del informe preliminar (revisión abierta) o de la constancia (firmada)
 * tal como sale en PDF/Word. Alcance, procedimientos y observaciones y conclusión (un solo
 * texto) se editan sobre la hoja y se guardan en sus mismas columnas; lo demás sale de las
 * pestañas de la revisión. Firmada, todo es de solo lectura (el contenido está sellado).
 */
export function VistaPreviaRevision({
  revision, empresaNombre, firma, sellada, guardando, onGuardar, onCerrar,
}: {
  revision: RevisionTributariaDetalle
  empresaNombre: string
  firma?: FirmaMembrete | null
  sellada: boolean
  guardando: boolean
  onGuardar: (campos: Partial<Record<Campo | 'observaciones', string | null>>) => void
  onCerrar: () => void
}) {
  const sugerido: Partial<Record<Campo, string>> = {
    alcance: alcanceSugerido({ obligacion: revision.obligacion, periodo: revision.periodo, empresaNombre }),
    procedimientos: procedimientosSugeridos(revision.obligacion.tipo),
  }
  // Lo que ve el revisor: el texto propio o, si no lo hay, el sugerido.
  const [textos, setTextos] = useState<Record<Campo, string>>(() => ({
    alcance: revision.alcance?.trim() ? revision.alcance : sugerido.alcance!,
    procedimientos: revision.procedimientos?.trim() ? revision.procedimientos : sugerido.procedimientos!,
    // Un solo texto: las observaciones heredadas de revisiones anteriores se muestran dentro.
    conclusion: textoConclusion(revision),
  }))

  // Mismo criterio que CampoPapel: dejar el sugerido tal cual (o vaciarlo) guarda null.
  const normalizar = (campo: Campo, v: string): string | null => {
    const s = sugerido[campo]
    if (!v.trim() || (s !== undefined && v.trim() === s.trim())) return null
    return v
  }
  const guardado = (campo: Campo) => {
    const v = campo === 'conclusion' ? textoConclusion(revision) : revision[campo]
    return v?.trim() ? v : null
  }
  const cambios = Object.fromEntries(
    CAMPOS.filter((c) => normalizar(c, textos[c]) !== guardado(c)).map((c) => [c, normalizar(c, textos[c])]),
  ) as Partial<Record<Campo | 'observaciones', string | null>>
  // Al guardar el texto unificado se vacían las observaciones heredadas (ya van dentro).
  if ('conclusion' in cambios) cambios.observaciones = null
  const hayCambios = Object.keys(cambios).length > 0

  const preliminar = !sellada
  const opts = exportOptsRevisionTributaria({
    revision: { ...revision, ...Object.fromEntries(CAMPOS.map((c) => [c, normalizar(c, textos[c])])), observaciones: null },
    empresaNombre,
    firma,
    preliminar,
  })

  const cerrar = async () => {
    if (hayCambios && !(await confirmar({
      titulo: '¿Cerrar sin guardar?',
      descripcion: 'Los cambios hechos sobre el documento se perderán.',
      confirmar: 'Cerrar sin guardar',
    }))) return
    onCerrar()
  }

  return (
    <Modal open onClose={cerrar} title={preliminar ? 'Informe preliminar' : 'Constancia de revisión'} size="xl">
      <div className="space-y-4">
        <DocumentoEditable
          {...opts}
          secciones={opts.secciones.map((s, i) => {
            const key = s.key ?? String(i)
            const campo = CAMPOS.includes(key as Campo) ? (key as Campo) : null
            return {
              ...s,
              key,
              // Al editar se muestra lo escrito, aunque esté vacío (el PDF vuelve al sugerido).
              contenido: campo ? textos[campo] : s.contenido,
              editable: !!campo,
              formato: 'texto' as const,
              origen: ORIGEN[key],
            }
          })}
          disabled={sellada}
          aviso={sellada
            ? 'Revisión firmada: el contenido quedó sellado. Reábrela para editar el documento.'
            : 'Así saldrá el informe preliminar. Alcance, procedimientos y observaciones y conclusión se editan aquí; lo demás se corrige en su pestaña.'}
          onChange={(key, valor) => setTextos((prev) => ({ ...prev, [key]: valor }))}
        />

        <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-gray-100 bg-white pt-4">
          {!sellada && (
            <Button size="sm" loading={guardando} disabled={!hayCambios} onClick={() => onGuardar(cambios)}>
              Guardar cambios
            </Button>
          )}
          <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => imprimirInforme(construirHtmlInforme(opts))}>
            <Printer size={13} /> PDF
          </Button>
          <Button
            size="sm" variant="secondary" className="gap-1.5"
            onClick={() => void descargarDocx(nombreArchivoRevision({ revision, empresaNombre, preliminar }), opts)}
          >
            <Download size={13} /> Word
          </Button>
          {hayCambios && <span className="ml-auto text-xs text-amber-600">Cambios sin guardar</span>}
        </div>
      </div>
    </Modal>
  )
}
