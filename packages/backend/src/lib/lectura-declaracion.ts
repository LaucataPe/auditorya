/**
 * Lectura de una declaración (PDF o imagen) a renglones del catálogo de cifras.
 * Compartida por el botón "Leer borrador" y por el agente, que lee la declaración
 * presentada del período anterior. Los formularios con casillas (300, 350, ICA)
 * se transcriben casilla → valor y el mapeo, las sumas y el cuadre son código
 * determinista; los demás (reteICA) los mapea el LLM directo a los renglones.
 */
import { z } from 'zod'
import {
  ACTIVIDADES_ICA, CIFRAS_CATALOGO, IMPUESTOS_CATALOGO, LECTURA_FORMULARIO,
  aplicarLecturaFormulario, type TipoImpuesto,
} from '@auditorya/types'
import { completarJSONArchivo, SYSTEM_AUDITOR, type ArchivoLLM } from './llm'
import { transcribirCasillas, type FuenteLectura } from './lectura-dian'

const LecturaBorradorSchema = z.object({
  renglones: z.record(z.number().nullable()),
  advertencias: z.array(z.string()).max(20).optional(),
})

export type LecturaDeclaracion = {
  renglones: Record<string, number | null>
  advertencias: string[]
  /** Totales del formulario que no cuadran: señal de una lectura corrida. */
  descuadres: number
  fuente: FuenteLectura
}

/** Lanza si la fuente no puede leer el archivo; el llamador decide cómo avisar. */
export async function leerDeclaracion(opts: {
  tipo: TipoImpuesto
  obligacionNombre: string
  /** Texto del período, p. ej. "Enero 2026". */
  periodo: string
  empresaNombre: string
  archivo: ArchivoLLM
  /** Reintento pedido por la persona: salta n8n y lee solo con OCR. */
  forzarOcr?: boolean
  /** Cómo se llama el documento en el prompt. */
  documento?: 'BORRADOR' | 'DECLARACIÓN PRESENTADA'
}): Promise<LecturaDeclaracion> {
  const { tipo, obligacionNombre, periodo, empresaNombre, archivo, forzarOcr = false, documento = 'BORRADOR' } = opts
  const cfgCasillas = LECTURA_FORMULARIO[tipo]
  let renglones: Record<string, number | null> = {}
  let advertencias: string[] = []
  let fuente: FuenteLectura = 'llm'
  let descuadres = 0

  if (cfgCasillas) {
    // Formulario con casillas numeradas (300, 350, y el único nacional de ICA por renglón): la fuente solo TRANSCRIBE
    // casilla → valor (tarea simple y fiable); el mapeo a renglones, las sumas
    // de casillas agrupadas y la verificación de totales son código determinista.
    const prompt = tipo === 'ica'
      ? `El archivo adjunto es el ${documento} de la declaración de ${obligacionNombre} en el Formulario Único Nacional de declaración y pago del impuesto de industria y comercio, período ${periodo}, de la empresa ${empresaNombre}.

  TRANSCRIBE los renglones numerados 8 a 38 con su valor:
  - La clave es el NÚMERO del renglón como texto (p. ej. "16"); el valor, el número en pesos colombianos como ENTERO (sin puntos, comas ni símbolos).
  - Transcribe tal cual, incluidos los renglones en cero. NO calcules, NO corrijas, NO omitas renglones.
  - Omite los renglones 1 a 7 (identificación) y el 18 (capacidad instalada en kW).

  Además, transcribe la sección C "Discriminación de actividades gravadas", incluida la hoja de "otras actividades" si la hay, en el orden en que aparecen (la actividad principal es la 1):
  - "act1_ingresos": ingresos gravados de la actividad 1; "act1_impuesto": impuesto de la actividad 1 (columna IMPUESTO, tal cual, sin redondear).
  - Igual para act2, act3… hasta act${ACTIVIDADES_ICA}. Solo las actividades que tienen valores. NO transcribas el código ni la tarifa.
  - Si una casilla no se puede leer con certeza, omítela del objeto.

  Devuelve un objeto JSON: {"casillas": {"8": 7958955000, "9": 320101000, ..., "act1_ingresos": 5751351000, "act1_impuesto": 23810593, ...}}`
      : `El archivo adjunto es el ${documento} de la declaración de ${obligacionNombre} (formulario oficial de la DIAN), período ${periodo}, de la empresa ${empresaNombre}.

  TRANSCRIBE todas las casillas numeradas del formulario con su valor:
  - La clave es el NÚMERO de la casilla como texto (p. ej. "28"); el valor, el número en pesos colombianos como ENTERO (sin puntos, comas ni símbolos).
  - Transcribe tal cual, incluidas las casillas en cero. NO calcules, NO corrijas, NO omitas casillas.
  - Ignora las casillas de identificación (año, período, NIT, códigos, teléfonos): solo las casillas con valores en pesos.
  - Si una casilla no se puede leer con certeza, omítela del objeto.

  Devuelve un objeto JSON: {"casillas": {"27": 0, "28": 122149000, ...}}`

    const leido = await transcribirCasillas({
      archivo,
      tipo: tipo,
      system: SYSTEM_AUDITOR,
      prompt,
      descuadres: (c) => aplicarLecturaFormulario(tipo, c)?.descuadres ?? 0,
      forzarOcr,
    })
    fuente = leido.fuente
    const aplicado = aplicarLecturaFormulario(tipo, leido.casillas)
    renglones = aplicado?.renglones ?? {}
    advertencias = aplicado?.advertencias ?? []
    descuadres = aplicado?.descuadres ?? 0
  } else {
    // Impuestos sin formulario estándar (reteica, otros): la IA
    // mapea directo a los renglones digitables del catálogo.
    const digitables = CIFRAS_CATALOGO[tipo]
      .flatMap((s) => s.renglones.map((r) => ({ ...r, seccion: s.titulo })))
      .filter((r) => r.tipo === 'digitable')
    const listaRenglones = digitables
      .map((r) => `- "${r.id}": ${r.label} (sección: ${r.seccion}${r.ayuda ? ` · ${r.ayuda}` : ''})`)
      .join('\n')

    const prompt = `El archivo adjunto es el ${documento} de la declaración de ${obligacionNombre} (${IMPUESTOS_CATALOGO[tipo].descripcion}), período ${periodo}, de la empresa ${empresaNombre}.

  Extrae los valores del formulario y mapéalos a estos renglones (la clave es el id exacto):
  ${listaRenglones}

  Reglas:
  - Valores en pesos colombianos como números ENTEROS, tal como aparecen en el formulario (sin puntos, comas ni símbolos).
  - En retenciones los renglones piden el VALOR RETENIDO por concepto, no la base.
  - Usa null en los renglones que el formulario no traiga.
  - NO inventes valores: si algo no se puede leer con certeza, déjalo en null y explícalo en "advertencias".
  - En "advertencias" lista también los valores DISTINTOS DE CERO que no encajaron en ningún renglón (formato "concepto: valor").

  Devuelve un objeto JSON: {"renglones": {"<id>": <numero|null>, ...}, "advertencias": ["...", ...]}`

    const crudo = await completarJSONArchivo<unknown>({
      system: SYSTEM_AUDITOR,
      prompt,
      archivo,
      inicioJson: '{',
      maxTokens: 3000,
    })
    const lectura = LecturaBorradorSchema.parse(crudo)
    const idsValidos = new Set(digitables.map((r) => r.id))
    for (const [id, valor] of Object.entries(lectura.renglones)) {
      if (idsValidos.has(id)) renglones[id] = valor === null ? null : Math.round(valor)
    }
    advertencias = lectura.advertencias ?? []
  }

  return { renglones, advertencias, descuadres, fuente }
}
