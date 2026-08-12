import { Hono } from 'hono'
import { zValidator } from '../lib/validacion'
import { z } from 'zod'
import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { firmas, empresas, auditorias, informes } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import type { JwtPayload } from '../lib/jwt'
import { registrarEvento } from '../lib/eventos'

const app = new Hono<{ Variables: { user: JwtPayload } }>()

app.use('*', authMiddleware)

// GET /firmas/mia/resumen — métricas reales para el dashboard
app.get('/mia/resumen', async (c) => {
  const { firmaId } = c.get('user')

  const [empresasRows, auditoriasRows, informesAprobados] = await Promise.all([
    db
      .select({ id: empresas.id, estadoEncargo: empresas.estadoEncargo })
      .from(empresas)
      .where(eq(empresas.firmaId, firmaId)),
    db
      .select({
        id: auditorias.id,
        estado: auditorias.estado,
        fechaInicio: auditorias.fechaInicio,
        fechaFin: auditorias.fechaFin,
        tipoServicio: auditorias.tipoServicio,
        createdAt: auditorias.createdAt,
        empresaId: empresas.id,
        empresaNombre: empresas.nombre,
      })
      .from(auditorias)
      .innerJoin(empresas, eq(auditorias.empresaId, empresas.id))
      .where(eq(empresas.firmaId, firmaId))
      .orderBy(desc(auditorias.createdAt)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(informes)
      .innerJoin(auditorias, eq(informes.auditoriaId, auditorias.id))
      .innerJoin(empresas, eq(auditorias.empresaId, empresas.id))
      .where(and(eq(empresas.firmaId, firmaId), eq(informes.estado, 'aprobado'))),
  ])

  const activas = auditoriasRows.filter((a) => a.estado !== 'finalizada')

  return c.json({
    data: {
      empresas: empresasRows.length,
      encargosPendientes: empresasRows.filter((e) => e.estadoEncargo === 'pendiente').length,
      auditoriasActivas: activas.length,
      informesAprobados: Number(informesAprobados[0]?.n ?? 0),
      auditoriasRecientes: auditoriasRows.slice(0, 5),
    },
  })
})

// GET /firmas/mia
app.get('/mia', async (c) => {
  const { firmaId } = c.get('user')
  const [firma] = await db.select().from(firmas).where(eq(firmas.id, firmaId))
  if (!firma) return c.json({ error: { code: 'NOT_FOUND', message: 'Firma no encontrada' } }, 404)
  return c.json({ data: firma })
})

// PUT /firmas/mia
app.put(
  '/mia',
  zValidator(
    'json',
    z.object({
      nombre: z.string().min(2).optional(),
      nit: z.string().min(5).optional(),
      ciudad: z.string().min(2).optional(),
      // Identidad de marca de los documentos. null limpia el valor (vuelve al defecto).
      colorMarca: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido (formato #rrggbb)').nullable().optional(),
      logo: z
        .string()
        .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, 'Logo inválido (se espera una imagen en data URI)')
        .max(400_000, 'El logo es demasiado grande (máx. ~300 KB)')
        .nullable()
        .optional(),
    }),
  ),
  async (c) => {
    const user = c.get('user')
    const { firmaId, rol } = user
    if (rol !== 'socio') {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Solo el socio puede actualizar la firma' } }, 403)
    }

    const body = c.req.valid('json')
    if (Object.keys(body).length === 0) {
      return c.json({ error: { code: 'BAD_REQUEST', message: 'Sin campos para actualizar' } }, 400)
    }

    const [firma] = await db.update(firmas).set(body).where(eq(firmas.id, firmaId)).returning()

    registrarEvento(user, {
      accion: 'firma.actualizar',
      entidad: 'firma',
      entidadId: firmaId,
      // El logo no se vuelca al detalle (pesa); se deja constancia de qué campos cambiaron.
      detalle: {
        campos: Object.keys(body),
        ...(body.colorMarca !== undefined ? { colorMarca: body.colorMarca } : {}),
      },
    })

    return c.json({ data: firma })
  },
)

export default app
