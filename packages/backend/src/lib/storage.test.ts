import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

process.env.JWT_SECRET = 'secreto-de-prueba'
process.env.STORAGE_DIR = mkdtempSync(path.join(tmpdir(), 'auditorya-storage-'))
process.env.STORAGE_DRIVER = 'local'

// Import dinámico para que el módulo lea las variables de entorno de arriba.
let storage: typeof import('./storage')

beforeAll(async () => {
  storage = await import('./storage')
})

describe('storage local', () => {
  it('guarda y lee un archivo', async () => {
    const contenido = Buffer.from('evidencia de prueba')
    await storage.storage.guardar('evidencias/aud-1/archivo.txt', contenido)
    const leido = await storage.storage.leer('evidencias/aud-1/archivo.txt')
    expect(leido.toString()).toBe('evidencia de prueba')
  })

  it('elimina sin fallar aunque no exista', async () => {
    await expect(storage.storage.eliminar('no/existe.bin')).resolves.toBeUndefined()
  })

  it('rechaza claves con path traversal', async () => {
    await expect(storage.storage.leer('../../etc/passwd')).rejects.toThrow(/inválida/)
  })
})

describe('URLs firmadas', () => {
  it('firma y verifica una descarga vigente', () => {
    const { key, exp, sig } = storage.firmarDescarga('evidencias/a/b.pdf')
    expect(storage.verificarDescarga(key, exp, sig)).toBe(true)
  })

  it('rechaza firmas adulteradas', () => {
    const { key, exp, sig } = storage.firmarDescarga('evidencias/a/b.pdf')
    expect(storage.verificarDescarga('evidencias/a/OTRO.pdf', exp, sig)).toBe(false)
    expect(storage.verificarDescarga(key, exp + 100, sig)).toBe(false)
    expect(storage.verificarDescarga(key, exp, sig.replace(/^./, '0'))).toBe(false)
  })

  it('rechaza enlaces expirados', () => {
    const { key, sig } = storage.firmarDescarga('evidencias/a/b.pdf')
    const expirado = Math.floor(Date.now() / 1000) - 10
    expect(storage.verificarDescarga(key, expirado, sig)).toBe(false)
  })
})
