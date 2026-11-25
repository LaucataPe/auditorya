/**
 * Formatos prellenados del sistema de gestión de calidad (NIGC 1). Cada formato es la
 * evidencia de una o más respuestas del catálogo (`respuestasBase` = claves de
 * CATALOGO_CALIDAD) y se crea con los datos de la firma ya puestos. Lo que solo la firma
 * sabe queda marcado `[COMPLETAR: …]`: mientras quede alguno, el documento no se firma.
 *
 * Los textos usan marcadores `{{dato}}` que `rellenarFormato` reemplaza al crear el
 * borrador; un dato que la firma no ha registrado se convierte en un `[COMPLETAR: …]`.
 */
import {
  VINCULOS_CALIDAD,
  riesgosSinRespuesta,
  type ComponenteCalidad,
  type SistemaCalidad,
  type VinculoCalidad,
} from './calidad'

export type VigenciaFormato = 'anual' | 'permanente'

export type SeccionFormato = { key: string; label: string; texto: string }

export type FormatoCalidad = {
  clave: string
  titulo: string
  componente: ComponenteCalidad
  respuestasBase: string[]
  /** 'anual': vence al año de firmado y debe renovarse. 'permanente': se revisa en la evaluación anual. */
  vigencia: VigenciaFormato
  /** Para qué sirve, en lenguaje simple (se muestra antes de crearlo). */
  proposito: string
  secciones: SeccionFormato[]
}

export const FORMATOS_CALIDAD: FormatoCalidad[] = [
  {
    clave: 'declaracion_liderazgo',
    titulo: 'Declaración de liderazgo y compromiso con la calidad',
    componente: 'gobierno_liderazgo',
    respuestasBase: ['gl.compromiso.r1.a'],
    vigencia: 'anual',
    proposito:
      'La dirección deja por escrito que la calidad está por encima de las metas comerciales. Es lo primero que pide ver la JCC.',
    secciones: [
      {
        key: 'declaracion',
        label: 'Declaración',
        texto:
          '{{firma}}, identificada con NIT {{nit}} y domiciliada en {{domicilio}}, declara que la calidad de los encargos de auditoría, revisoría fiscal y aseguramiento es su prioridad y que ninguna consideración comercial, de honorarios o de tiempos estará por encima del cumplimiento de las normas profesionales, el Código de Ética y los requerimientos legales aplicables.',
      },
      {
        key: 'compromisos',
        label: 'Compromisos de la dirección',
        texto:
          '• Asumir la responsabilidad última del sistema de gestión de calidad (NIGC 1 ¶20).\n• Asignar al sistema de calidad el tiempo, las personas y los recursos necesarios.\n• Evaluar el desempeño de socios y gerentes con criterios de calidad, no solo de facturación.\n• Comunicar al personal la importancia de la calidad y su responsabilidad individual en ella.\n• Revisar el sistema al menos una vez al año y cada vez que cambien las circunstancias de la firma.',
      },
      {
        key: 'cultura',
        label: 'Cultura de calidad en la firma',
        texto:
          '[COMPLETAR: describa en dos o tres frases cómo promueve la firma la calidad en el día a día, por ejemplo reuniones de revisión, espacios de consulta técnica o reconocimientos al trabajo bien hecho]',
      },
      {
        key: 'vigencia',
        label: 'Vigencia',
        texto:
          'Esta declaración rige para el año {{anio}} y se renueva anualmente. Se comunica a todo el personal de la firma.\n{{ciudad}}, {{fecha}}.',
      },
    ],
  },
  {
    clave: 'designacion_responsable',
    titulo: 'Designación del responsable del sistema de gestión de calidad',
    componente: 'gobierno_liderazgo',
    respuestasBase: ['gl.responsabilidades.r1.a'],
    vigencia: 'permanente',
    proposito:
      'Deja claro quién responde por el sistema de calidad y quién lo opera. Sin esta designación, la JCC considera que nadie lo tiene a cargo.',
    secciones: [
      {
        key: 'designacion',
        label: 'Designación',
        texto:
          'La dirección de {{firma}} designa a {{responsable}} como responsable último del sistema de gestión de calidad de la firma, de acuerdo con la NIGC 1 ¶20.',
      },
      {
        key: 'responsabilidades',
        label: 'Responsabilidades',
        texto:
          '• Diseñar, implementar y operar el sistema de gestión de calidad.\n• Mantener actualizados los objetivos, riesgos y respuestas de calidad.\n• Coordinar el seguimiento del sistema y la inspección de encargos terminados.\n• Evaluar el sistema al menos una vez al año y concluir si proporciona seguridad razonable.\n• Informar a la dirección y al personal sobre los resultados y las acciones correctivas.',
      },
      {
        key: 'operativo',
        label: 'Responsable operativo',
        texto:
          '[COMPLETAR: si una persona distinta apoya la operación diaria del sistema (por ejemplo, la verificación de confirmaciones de independencia o el plan de capacitación), indique su nombre y cargo; si no, escriba «No aplica»]',
      },
      {
        key: 'autoridad',
        label: 'Autoridad y recursos',
        texto:
          'El responsable cuenta con la experiencia, el tiempo y la autoridad necesarios para cumplir esta función, y tiene acceso directo a la dirección de la firma.\n{{ciudad}}, {{fecha}}.',
      },
    ],
  },
  {
    clave: 'politica_etica_independencia',
    titulo: 'Política de ética e independencia',
    componente: 'etica',
    respuestasBase: ['et.cumplimiento.r2.a'],
    vigencia: 'permanente',
    proposito:
      'Adopta el Código de Ética y fija las reglas de independencia del personal. Es la base de las confirmaciones anuales de independencia.',
    secciones: [
      {
        key: 'adopcion',
        label: 'Adopción del Código de Ética',
        texto:
          '{{firma}} adopta el Código de Ética para Profesionales de la Contabilidad (IESBA), incorporado en Colombia mediante el Decreto 2420 de 2015 y sus modificaciones, junto con la Ley 43 de 1990. Todo el personal debe conocerlo y cumplirlo.',
      },
      {
        key: 'principios',
        label: 'Principios fundamentales',
        texto: 'Integridad, objetividad, competencia y diligencia profesionales, confidencialidad y comportamiento profesional.',
      },
      {
        key: 'independencia',
        label: 'Reglas de independencia',
        texto:
          '• Ningún miembro del equipo puede tener intereses financieros, préstamos o garantías con clientes de aseguramiento.\n• Las relaciones familiares, personales o de negocio con un cliente se informan antes de participar en su encargo.\n• No se prestan servicios distintos de aseguramiento que generen autorrevisión sobre la información auditada.\n• No se aceptan regalos ni atenciones de clientes por encima de lo trivial e intrascendente.\n• Todo el personal confirma por escrito su independencia una vez al año y al asignarse a un encargo nuevo.',
      },
      {
        key: 'amenazas',
        label: 'Tratamiento de amenazas',
        texto:
          'Cuando se identifique una amenaza, el socio responsable la evalúa, documenta las salvaguardas aplicadas o retira a la persona del encargo. Si no hay salvaguardas suficientes, la firma no acepta o no continúa el encargo.',
      },
      {
        key: 'capacitacion',
        label: 'Capacitación en ética',
        texto:
          'La firma realiza al menos una capacitación anual sobre el Código de Ética y sus actualizaciones, con registro de asistencia.\n[COMPLETAR: mes previsto para la capacitación de este año]',
      },
    ],
  },
  {
    clave: 'politica_aceptacion_continuidad',
    titulo: 'Política de aceptación y continuidad de clientes',
    componente: 'aceptacion_continuidad',
    respuestasBase: ['ac.decisiones.r1.a', 'ac.decisiones.r2.a'],
    vigencia: 'permanente',
    proposito:
      'Define cuándo la firma acepta un cliente nuevo o continúa con uno recurrente, y qué información debe tener antes de decidir.',
    secciones: [
      {
        key: 'alcance',
        label: 'Alcance',
        texto:
          'Aplica a todos los encargos de auditoría, revisoría fiscal y aseguramiento de {{firma}}: clientes nuevos y renovación de clientes recurrentes en cada vigencia.',
      },
      {
        key: 'criterios',
        label: 'Antes de aceptar o continuar se evalúa',
        texto:
          '• La integridad de los propietarios y de la administración.\n• La independencia de la firma y del equipo propuesto, y posibles conflictos de interés.\n• Si la firma tiene la competencia, el tiempo y los recursos para hacer el encargo.\n• Los honorarios pendientes y su efecto en la independencia.\n• En clientes recurrentes: cambios desde el encargo anterior y los hallazgos que dejó.',
      },
      {
        key: 'decision',
        label: 'Quién decide',
        texto:
          'La evaluación la registra el socio que tendría a cargo el encargo en AuditorYa, antes de crearlo. [COMPLETAR: indique si algún tipo de cliente (por ejemplo, entidades vigiladas o de interés público) requiere además la aprobación de otro socio]',
      },
      {
        key: 'posterior',
        label: 'Información posterior',
        texto:
          'Si después de aceptar aparece información que habría llevado a rechazar el encargo, el socio responsable la evalúa de inmediato y documenta si la firma continúa, aplica salvaguardas o se retira (NIGC 1 ¶34).',
      },
    ],
  },
  {
    clave: 'plan_capacitacion',
    titulo: 'Plan anual de capacitación',
    componente: 'recursos',
    respuestasBase: ['rc.personas.r2.a'],
    vigencia: 'anual',
    proposito: 'Muestra que el personal se mantiene actualizado. La JCC suele pedir el plan y la evidencia de asistencia.',
    secciones: [
      {
        key: 'objetivo',
        label: 'Objetivo',
        texto:
          'Mantener la competencia técnica del personal de {{firma}} en normas de aseguramiento, normas de información financiera, tributaria y ética durante {{anio}}.',
      },
      {
        key: 'temas',
        label: 'Temas y fechas previstas',
        texto:
          '[COMPLETAR: liste los temas del año con su mes y modalidad, por ejemplo: «Actualización NIA y NIGC 1 — marzo — interna»; «Reforma tributaria — junio — externa»; «Código de Ética — septiembre — interna»]',
      },
      {
        key: 'horas',
        label: 'Horas mínimas por persona',
        texto: '[COMPLETAR: horas mínimas de capacitación al año para socios, gerentes y asistentes]',
      },
      {
        key: 'registro',
        label: 'Registro de asistencia',
        texto:
          'Por cada capacitación se conserva la lista de asistencia o el certificado, y se adjunta como evidencia en AuditorYa. Al cierre del año el responsable verifica el cumplimiento de las horas mínimas.',
      },
    ],
  },
  {
    clave: 'politica_documentacion',
    titulo: 'Política de documentación, conservación y confidencialidad',
    componente: 'realizacion_encargos',
    respuestasBase: ['re.documentacion.r1.a', 're.documentacion.r2.a'],
    vigencia: 'permanente',
    proposito:
      'Fija cuándo se cierra el archivo de cada encargo, cuánto tiempo se conserva y cómo se protege la información de los clientes.',
    secciones: [
      {
        key: 'compilacion',
        label: 'Compilación del archivo final',
        texto:
          'El archivo de cada encargo se compila y se cierra dentro de los 60 días siguientes a la fecha del informe (NIA 230). Después del cierre no se eliminan documentos; cualquier adición se registra con su fecha, autor y motivo.',
      },
      {
        key: 'conservacion',
        label: 'Plazo de conservación',
        texto:
          'Los papeles de trabajo y la documentación de los encargos se conservan durante [COMPLETAR: número de años; verifique el plazo legal aplicable a sus encargos — para documentos del comerciante la referencia usual es 10 años] contados desde la fecha del informe.',
      },
      {
        key: 'confidencialidad',
        label: 'Confidencialidad y acceso',
        texto:
          '• La información de los clientes solo se usa para el encargo y no se divulga sin autorización, salvo obligación legal.\n• La evidencia se guarda en AuditorYa sin acceso público; las descargas se hacen con enlaces firmados que vencen en 15 minutos.\n• El acceso se asigna por roles y cada cambio queda en la pista de auditoría.\n• Al retirarse de la firma, la persona pierde el acceso el mismo día.',
      },
    ],
  },
  {
    clave: 'plan_seguimiento',
    titulo: 'Plan anual de seguimiento e inspección de encargos',
    componente: 'seguimiento',
    respuestasBase: ['sg.proceso.r1.a'],
    vigencia: 'anual',
    proposito:
      'Organiza cómo la firma revisa su propio trabajo: qué encargos terminados se inspeccionan, quién lo hace y qué se hace con lo que se encuentra.',
    secciones: [
      {
        key: 'ciclo',
        label: 'Ciclo de inspección',
        texto:
          'Cada socio de encargo tiene al menos un encargo terminado inspeccionado en un ciclo máximo de 3 años. En {{anio}} se inspeccionarán: [COMPLETAR: encargos o socios seleccionados este año]',
      },
      {
        key: 'inspector',
        label: 'Quién inspecciona',
        texto:
          'La inspección la hace una persona con experiencia suficiente que no participó en el encargo ni en su revisión de calidad. [COMPLETAR: nombre de la persona interna o del tercero externo que hará la inspección]',
      },
      {
        key: 'actividades',
        label: 'Otras actividades de seguimiento',
        texto:
          '• Verificación de las confirmaciones anuales de independencia.\n• Revisión de las evaluaciones de aceptación y continuidad del año.\n• Seguimiento a quejas y denuncias recibidas.\n• Revisión del cumplimiento del plan de capacitación.',
      },
      {
        key: 'deficiencias',
        label: 'Deficiencias y acciones',
        texto:
          'Cada hallazgo se evalúa para determinar si es una deficiencia, se analiza su causa y se define una acción correctiva con responsable y fecha. Los resultados se comunican al responsable del sistema y alimentan la evaluación anual.',
      },
    ],
  },
  {
    clave: 'procedimiento_quejas',
    titulo: 'Procedimiento de quejas y denuncias',
    componente: 'seguimiento',
    respuestasBase: ['sg.proceso.r2.a'],
    vigencia: 'permanente',
    proposito:
      'Define cómo cualquier persona, de adentro o de afuera de la firma, puede reportar un trabajo mal hecho o una conducta indebida, y cómo se investiga.',
    secciones: [
      {
        key: 'canal',
        label: 'Canal de recepción',
        texto:
          'Las quejas y denuncias sobre el trabajo de {{firma}} o la conducta de su personal se reciben en: {{email}} [COMPLETAR: otros canales si los hay, por ejemplo un formulario o una línea telefónica]. Se aceptan reportes anónimos.',
      },
      {
        key: 'tramite',
        label: 'Trámite',
        texto:
          '• Cada queja se registra con su fecha, el asunto y el encargo relacionado.\n• La investiga una persona que no está involucrada en el asunto.\n• Se informa al denunciante, cuando sea posible, que la queja fue recibida.\n• La investigación se concluye en un plazo máximo de [COMPLETAR: días hábiles].',
      },
      {
        key: 'proteccion',
        label: 'Protección',
        texto: 'Nadie será objeto de represalias por presentar una queja de buena fe.',
      },
      {
        key: 'resultado',
        label: 'Resultado',
        texto:
          'Si la queja revela una deficiencia, se trata como hallazgo del seguimiento: se define la acción correctiva y se considera en la evaluación anual del sistema.',
      },
    ],
  },
  {
    clave: 'comunicacion_personal',
    titulo: 'Constancia de comunicación del sistema de calidad al personal',
    componente: 'informacion_comunicacion',
    respuestasBase: ['ic.interna.r1.a'],
    vigencia: 'anual',
    proposito:
      'Deja constancia de que el equipo conoce las políticas de calidad vigentes y sus cambios. La JCC verifica que el personal sepa qué se espera de él.',
    secciones: [
      {
        key: 'comunicado',
        label: 'Qué se comunicó',
        texto:
          'Se socializaron con el personal de {{firma}} las políticas vigentes del sistema de gestión de calidad: declaración de liderazgo, política de ética e independencia, política de aceptación y continuidad, política de documentación y procedimiento de quejas y denuncias.',
      },
      {
        key: 'medio',
        label: 'Medio y fecha',
        texto: '[COMPLETAR: medio (reunión, correo, capacitación) y fecha en que se comunicó]',
      },
      {
        key: 'asistentes',
        label: 'Personas que recibieron la comunicación',
        texto: '[COMPLETAR: nombres de las personas que asistieron o confirmaron el recibido]',
      },
      {
        key: 'cambios',
        label: 'Cambios comunicados',
        texto: '[COMPLETAR: cambios del sistema comunicados en esta ocasión, o «Ninguno» si es la comunicación anual]',
      },
    ],
  },
]

export const FORMATOS_CALIDAD_CLAVES = FORMATOS_CALIDAD.map((f) => f.clave) as [string, ...string[]]

export function formatoCalidad(clave: string): FormatoCalidad | undefined {
  return FORMATOS_CALIDAD.find((f) => f.clave === clave)
}

/** Formato que evidencia una respuesta del catálogo (por su `baseClave`), si existe. */
export function formatoDeRespuesta(baseClave: string | null): FormatoCalidad | undefined {
  if (!baseClave) return undefined
  return FORMATOS_CALIDAD.find((f) => f.respuestasBase.includes(baseClave))
}

export type DatosFormato = {
  firma: string
  nit: string
  ciudad: string
  direccion: string | null
  email: string | null
  responsable: string | null
  /** Fecha en letras, p. ej. "18 de noviembre de 2026". */
  fecha: string
  anio: number
}

/** Contenido inicial del formato con los datos de la firma; los faltantes quedan por completar. */
export function rellenarFormato(formato: FormatoCalidad, datos: DatosFormato): Record<string, string> {
  const valores: Record<string, string> = {
    firma: datos.firma,
    nit: datos.nit,
    ciudad: datos.ciudad,
    domicilio: datos.direccion
      ? `${datos.direccion}, ${datos.ciudad}`
      : '[COMPLETAR: dirección de la firma — regístrela en Mi firma › Información]',
    email: datos.email ?? '[COMPLETAR: correo para quejas y denuncias]',
    responsable: datos.responsable ?? '[COMPLETAR: nombre del responsable — desígnelo en el sistema de calidad]',
    fecha: datos.fecha,
    anio: String(datos.anio),
  }
  return Object.fromEntries(
    formato.secciones.map((s) => [s.key, s.texto.replace(/\{\{(\w+)\}\}/g, (m, k: string) => valores[k] ?? m)]),
  )
}

const MARCA_COMPLETAR = /\[COMPLETAR[^\]]*\]/g

/** Cuántos espacios `[COMPLETAR: …]` quedan sin llenar en el documento. */
export function camposPorCompletar(contenido: Record<string, string>): number {
  return Object.values(contenido).reduce((n, v) => n + (v.match(MARCA_COMPLETAR)?.length ?? 0), 0)
}

/** Fecha hasta la que es vigente un formato firmado en `firmadoEl` (YYYY-MM-DD); null si es permanente. */
export function vigenteHasta(formato: FormatoCalidad, firmadoEl: string): string | null {
  if (formato.vigencia === 'permanente') return null
  const [y, m, d] = firmadoEl.split('-').map(Number)
  const fin = new Date(Date.UTC(y + 1, m - 1, d))
  return fin.toISOString().slice(0, 10)
}

/**
 * Un documento que la firma ya tenía cubre sus formatos durante un año desde su aprobación,
 * sin importar si el formato es anual o permanente (decisión de Laura): después hay que renovarlo.
 */
export function vigenciaDocumentoFirma(fechaAprobacion: string): string {
  const [y, m, d] = fechaAprobacion.split('-').map(Number)
  return new Date(Date.UTC(y + 1, m - 1, d)).toISOString().slice(0, 10)
}

/** Formato cubierto por un documento de la firma: cuál y dónde está dentro de él. */
export type CoberturaDocumentoFirma = { id: string; nombre: string; referencia: string | null }

/** Manual o política que la firma ya tenía, subido una vez para cubrir varios formatos. */
export type DocumentoFirmaCalidad = {
  id: string
  nombre: string
  fechaAprobacion: string
  aprobadoPor: string | null
  archivoNombre: string
  /** Formatos cuya versión firmada vigente es este documento. */
  formatos: string[]
  creadoPorNombre: string | null
  createdAt: string
}

export type EstadoFormato = 'sin_crear' | 'borrador' | 'firmado' | 'vencido'

export type ResumenDocumentoCalidad = {
  formato: string
  /** Última versión firmada. */
  firmado: {
    id: string
    version: number
    firmadoAt: string
    firmadoPorNombre: string | null
    vigenteHasta: string | null
    /** Nombre del archivo si la firma subió su propio documento en vez de llenar la plantilla. */
    archivoNombre: string | null
    /** Si lo cubre un documento que la firma ya tenía (su manual, una política). */
    documentoFirma: CoberturaDocumentoFirma | null
  } | null
  borrador: { id: string; version: number; pendientes: number } | null
}

export type DocumentoCalidad = {
  id: string
  formato: string
  version: number
  estado: 'borrador' | 'firmado'
  contenido: Record<string, string>
  firmadoPorNombre: string | null
  firmadoAt: string | null
  vigenteHasta: string | null
  /** Documento propio subido como archivo (contenido vacío); se abre con URL firmada. */
  archivoNombre: string | null
  /** Si lo cubre un documento que la firma ya tenía; el archivo es el de ese documento. */
  documentoFirma: CoberturaDocumentoFirma | null
  /** Versiones del mismo formato, de la más reciente a la más antigua. */
  versiones: { id: string; version: number; estado: 'borrador' | 'firmado'; firmadoAt: string | null }[]
}

/** Estado del formato hoy: un firmado vencido pesa más que un borrador en curso. */
export function estadoFormato(resumen: ResumenDocumentoCalidad | undefined, hoy: string): EstadoFormato {
  if (resumen?.firmado) {
    const vence = resumen.firmado.vigenteHasta
    if (!vence || vence > hoy) return 'firmado'
    return 'vencido'
  }
  return resumen?.borrador ? 'borrador' : 'sin_crear'
}

// ─── Cumplimiento de un componente (vista Resumen) ───────────────────────────

/**
 * - cumplido: todos los pasos hechos (diseño completo, formatos firmados y vigentes, revisado en el año).
 * - atencion: un riesgo sin respuesta o un formato vencido.
 * - sin_empezar: sin revisar y sin ningún formato creado.
 * - progreso: lo demás.
 */
export type EstadoCumplimiento = 'cumplido' | 'progreso' | 'atencion' | 'sin_empezar'

export type PasoCumplimiento = {
  clave: string
  tipo: 'diseno' | 'vinculo' | 'formato' | 'revision'
  label: string
  hecho: boolean
  detalle?: string
  /** Para los pasos de formato: clave del formato y su estado. */
  formato?: string
  estadoFormato?: EstadoFormato
}

export type CumplimientoComponente = {
  estado: EstadoCumplimiento
  pasos: PasoCumplimiento[]
  hechos: number
  /** Frase corta para la tarjeta: lo primero que falta, o el motivo de la alerta. */
  resumen: string
}

export function cumplimientoComponente(
  componente: ComponenteCalidad,
  sistema: Pick<SistemaCalidad, 'objetivos' | 'riesgos' | 'respuestas' | 'documentos' | 'evaluacion'>,
  hoy: string,
): CumplimientoComponente {
  const objetivos = sistema.objetivos.filter((o) => o.activo && o.componente === componente)
  const objetivosIds = new Set(objetivos.map((o) => o.id))
  const riesgos = sistema.riesgos.filter((r) => r.activo && objetivosIds.has(r.objetivoId))
  const riesgosIds = new Set(riesgos.map((r) => r.id))
  const respuestas = sistema.respuestas.filter((a) => a.activo && riesgosIds.has(a.riesgoId))
  const sinRespuesta = riesgosSinRespuesta(componente, sistema).length

  const pasos: PasoCumplimiento[] = [
    {
      clave: 'diseno',
      tipo: 'diseno',
      label: 'Objetivos, riesgos y respuestas definidos',
      hecho: objetivos.length > 0 && sinRespuesta === 0,
      detalle:
        sinRespuesta > 0
          ? `${sinRespuesta} riesgo(s) sin respuesta`
          : `${riesgos.length} riesgo(s), ${respuestas.length} respuesta(s)`,
    },
  ]

  const vinculos = [...new Set(respuestas.map((a) => a.vinculo).filter((v): v is VinculoCalidad => !!v))]
  for (const v of vinculos) {
    pasos.push({ clave: `vinculo.${v}`, tipo: 'vinculo', label: VINCULOS_CALIDAD[v], hecho: true, detalle: 'Cubierta por AuditorYa' })
  }

  for (const f of FORMATOS_CALIDAD.filter((x) => x.componente === componente)) {
    const resumen = sistema.documentos.find((d) => d.formato === f.clave)
    const estado = estadoFormato(resumen, hoy)
    pasos.push({
      clave: `formato.${f.clave}`,
      tipo: 'formato',
      label: `Firmar «${f.titulo}»`,
      hecho: estado === 'firmado',
      formato: f.clave,
      estadoFormato: estado,
      detalle:
        estado === 'borrador'
          ? resumen!.borrador!.pendientes > 0
            ? `Borrador con ${resumen!.borrador!.pendientes} campo(s) por completar`
            : 'Borrador listo para firmar'
          : estado === 'vencido'
            ? `Venció el ${resumen!.firmado!.vigenteHasta}`
            : estado === 'firmado'
              ? resumen!.firmado!.documentoFirma
                ? `Cubierto por «${resumen!.firmado!.documentoFirma.nombre}»`
                : resumen!.firmado!.archivoNombre
                ? `Documento propio: ${resumen!.firmado!.archivoNombre}`
                : `Versión ${resumen!.firmado!.version} firmada`
              : 'Sin crear',
    })
  }

  const revision = sistema.evaluacion.componentesRevisados[componente]
  pasos.push({
    clave: 'revision',
    tipo: 'revision',
    label: `Marcar el componente como revisado en ${sistema.evaluacion.anio}`,
    hecho: !!revision,
    detalle: revision ? `Por ${revision.porNombre}` : undefined,
  })

  const hechos = pasos.filter((p) => p.hecho).length
  const formatos = pasos.filter((p) => p.tipo === 'formato')
  const vencido = formatos.find((p) => p.estadoFormato === 'vencido')

  let estado: EstadoCumplimiento
  let resumen: string
  if (sinRespuesta > 0 || vencido) {
    estado = 'atencion'
    resumen = sinRespuesta > 0 ? `${sinRespuesta} riesgo(s) sin respuesta` : 'Formato vencido: renuévalo'
  } else if (hechos === pasos.length) {
    estado = 'cumplido'
    resumen = formatos.length ? `${formatos.length} formato(s) firmado(s)` : 'Revisado en el año'
  } else if (!revision && formatos.every((p) => p.estadoFormato === 'sin_crear')) {
    estado = 'sin_empezar'
    resumen = formatos.length ? `${formatos.length} formato(s) por crear` : 'Por revisar'
  } else {
    estado = 'progreso'
    const falta = pasos.find((p) => !p.hecho)!
    resumen = falta.tipo === 'revision' ? 'Falta: marcarlo como revisado' : `Falta: ${falta.label.charAt(0).toLowerCase()}${falta.label.slice(1)}`
  }
  return { estado, pasos, hechos, resumen }
}
