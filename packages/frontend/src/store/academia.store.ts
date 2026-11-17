import { create } from 'zustand'
import { PROGRESO_VACIO, checkpointAprobado, type ProgresoAcademia } from '@auditorya/types'
import { rastrear } from '../lib/analitica'
import { enviarRegistroAcademia } from '../lib/academia-registro'

/**
 * Progreso de AuditorYa Academia (curso público, sin cuenta): vive solo en este navegador, bajo
 * una clave versionada. Las prácticas igual se re-verifican contra el encargo de práctica al
 * abrir cada lección (ver lib/academia-demo).
 */
const CLAVE = 'auditorya.academia.v1'

function leer(): ProgresoAcademia {
  try {
    const raw = localStorage.getItem(CLAVE)
    if (!raw) return PROGRESO_VACIO
    const p = JSON.parse(raw) as Partial<ProgresoAcademia>
    return {
      leidas: Array.isArray(p.leidas) ? p.leidas : [],
      practicadas: Array.isArray(p.practicadas) ? p.practicadas : [],
      ejercicios: Array.isArray(p.ejercicios) ? p.ejercicios : [],
      repasos: p.repasos && typeof p.repasos === 'object' ? p.repasos : {},
    }
  } catch {
    return PROGRESO_VACIO
  }
}

function escribir(p: ProgresoAcademia) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(p))
  } catch {
    // Navegador sin almacenamiento (modo privado, cuota): el progreso queda solo en memoria.
  }
}

type AcademiaState = {
  progreso: ProgresoAcademia
  marcarLeida: (leccionId: string) => void
  marcarPracticada: (leccionId: string, practicada: boolean) => void
  marcarEjercicio: (leccionId: string) => void
  guardarRepaso: (moduloId: string, aciertos: number, total: number) => void
  reiniciarProgreso: () => void
}

export const useAcademiaStore = create<AcademiaState>((set, get) => {
  const actualizar = (fn: (p: ProgresoAcademia) => ProgresoAcademia) => {
    const nuevo = fn(get().progreso)
    escribir(nuevo)
    set({ progreso: nuevo })
  }

  // Se lee al crear el store (no en un efecto): los candados de las lecciones dependen del
  // progreso desde el primer render.
  return {
    progreso: leer(),
    // Cada avance nuevo (no los repetidos) se registra en la analítica del embudo del curso.
    marcarLeida: (id) =>
      actualizar((p) => {
        if (p.leidas.includes(id)) return p
        rastrear('academia_leccion', { leccion: id, paso: 'leida' })
        return { ...p, leidas: [...p.leidas, id] }
      }),
    marcarPracticada: (id, practicada) =>
      actualizar((p) => {
        const ya = p.practicadas.includes(id)
        if (ya === practicada) return p
        if (practicada) rastrear('academia_leccion', { leccion: id, paso: 'practica' })
        return { ...p, practicadas: practicada ? [...p.practicadas, id] : p.practicadas.filter((x) => x !== id) }
      }),
    marcarEjercicio: (id) =>
      actualizar((p) => {
        if (p.ejercicios.includes(id)) return p
        rastrear('academia_leccion', { leccion: id, paso: 'ejercicio' })
        return { ...p, ejercicios: [...p.ejercicios, id] }
      }),
    guardarRepaso: (moduloId, aciertos, total) =>
      actualizar((p) => {
        // Se registra cada intento, también los que no mejoran el resultado guardado.
        rastrear('academia_checkpoint', { modulo: moduloId, aciertos, total, aprobado: checkpointAprobado({ aciertos, total }) })
        const previo = p.repasos[moduloId]
        if (previo && previo.aciertos >= aciertos) return p
        return { ...p, repasos: { ...p.repasos, [moduloId]: { aciertos, total } } }
      }),
    reiniciarProgreso: () => actualizar(() => PROGRESO_VACIO),
  }
})

// ─── Registro de acceso al curso ─────────────────────────────────────────────

export type RolAcademia = 'socio' | 'auditor' | 'estudiante' | 'otro'

export type RegistroAcademia = {
  correo: string
  rol: RolAcademia
  /** Prueba del consentimiento (Ley 1581): qué texto aceptó, en qué versión y cuándo. */
  autorizacion: { version: string; fecha: string; texto: string }
  /** Si ya llegó al workflow de n8n; si no, se reintenta en la próxima visita. */
  enviado?: boolean
}

/**
 * Acceso al curso con correo y rol (opción «al entrar»). Se guarda en este navegador para no volver
 * a pedirlo y se envía al workflow de n8n (lib/academia-registro.ts).
 */
const CLAVE_REGISTRO = 'auditorya.academia.registro.v1'

function leerRegistro(): RegistroAcademia | null {
  try {
    const raw = localStorage.getItem(CLAVE_REGISTRO)
    if (!raw) return null
    const r = JSON.parse(raw) as Partial<RegistroAcademia>
    return r.correo && r.rol && r.autorizacion ? ({ ...r, autorizacion: { ...r.autorizacion, texto: r.autorizacion.texto ?? '' } } as RegistroAcademia) : null
  } catch {
    return null
  }
}

function guardarRegistro(registro: RegistroAcademia) {
  try {
    localStorage.setItem(CLAVE_REGISTRO, JSON.stringify(registro))
  } catch {
    // Sin almacenamiento: el acceso vale mientras la pestaña esté abierta.
  }
}

type RegistroState = {
  registro: RegistroAcademia | null
  registrar: (r: RegistroAcademia) => void
  /** Envía el registro a n8n si aún no llegó (al registrarse y en cada visita posterior). */
  enviarPendiente: () => Promise<void>
}

let enviando = false

export const useRegistroAcademiaStore = create<RegistroState>((set, get) => ({
  registro: leerRegistro(),
  registrar: (registro) => {
    guardarRegistro(registro)
    rastrear('academia_registro', { rol: registro.rol })
    set({ registro })
    void get().enviarPendiente()
  },
  enviarPendiente: async () => {
    const registro = get().registro
    if (!registro || registro.enviado || enviando) return
    enviando = true
    try {
      if (await enviarRegistroAcademia(registro)) {
        const enviado = { ...registro, enviado: true }
        guardarRegistro(enviado)
        set({ registro: enviado })
      }
    } finally {
      enviando = false
    }
  },
}))

/** Expediente del cliente: panel que se abre desde el encabezado o desde un ejercicio. */
type ExpedienteState = {
  abierto: boolean
  documentoId: string | null
  abrir: (documentoId?: string) => void
  cerrar: () => void
}

export const useExpedienteStore = create<ExpedienteState>((set) => ({
  abierto: false,
  documentoId: null,
  abrir: (documentoId) => set({ abierto: true, documentoId: documentoId ?? null }),
  cerrar: () => set({ abierto: false }),
}))
