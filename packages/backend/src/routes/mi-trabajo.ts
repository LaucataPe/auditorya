import { Hono } from 'hono'
import { and, desc, eq, ne, or } from 'drizzle-orm'
import { db } from '../db/client'
import { auditorias, empresas, notasRevision, papelesTrabajo, tareas, usuarios } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import type { JwtPayload } from '../lib/jwt'

const app = new Hono<{ Variables: { user: JwtPayload } }>()

app.use('*', authMiddleware)

// GET /mi-trabajo — vista transversal del usuario: sus tareas pendientes, los
// papeles a su cargo y las notas de revisión abiertas que le conciernen, en
// todos los encargos activos (no finalizados) de la firma.
app.get('/mi-trabajo', async (c) => {
  const { sub, firmaId } = c.get('user')

  const [misTareas, misPapeles, notas] = await Promise.all([
    db
      .select({
        id: tareas.id,
        titulo: tareas.titulo,
        area: tareas.area,
        estado: tareas.estado,
        fechaInicio: tareas.fechaInicio,
        vencimiento: tareas.vencimiento,
        auditoriaId: tareas.auditoriaId,
        empresaId: auditorias.empresaId,
        empresaNombre: empresas.nombre,
      })
      .from(tareas)
      .innerJoin(auditorias, eq(tareas.auditoriaId, auditorias.id))
      .innerJoin(empresas, eq(auditorias.empresaId, empresas.id))
      .where(
        and(
          eq(empresas.firmaId, firmaId),
          eq(tareas.asignadoA, sub),
          ne(tareas.estado, 'completada'),
          ne(auditorias.estado, 'finalizada'),
        ),
      )
      .orderBy(desc(tareas.createdAt)),
    db
      .select({
        id: papelesTrabajo.id,
        titulo: papelesTrabajo.titulo,
        area: papelesTrabajo.area,
        estado: papelesTrabajo.estado,
        fechaFin: papelesTrabajo.fechaFin,
        auditoriaId: papelesTrabajo.auditoriaId,
        empresaId: auditorias.empresaId,
        empresaNombre: empresas.nombre,
      })
      .from(papelesTrabajo)
      .innerJoin(auditorias, eq(papelesTrabajo.auditoriaId, auditorias.id))
      .innerJoin(empresas, eq(auditorias.empresaId, empresas.id))
      .where(
        and(
          eq(empresas.firmaId, firmaId),
          ne(papelesTrabajo.estado, 'aprobado'),
          ne(auditorias.estado, 'finalizada'),
          or(eq(papelesTrabajo.asignadoA, sub), eq(papelesTrabajo.preparadoPor, sub)),
        ),
      )
      .orderBy(desc(papelesTrabajo.createdAt)),
    // Notas abiertas que me tocan: sobre un papel mío (por resolver) o creadas
    // por mí sobre papeles ajenos (en seguimiento, esperando respuesta).
    db
      .select({
        id: notasRevision.id,
        texto: notasRevision.texto,
        createdAt: notasRevision.createdAt,
        creadoPor: notasRevision.creadoPor,
        papelTrabajoId: notasRevision.papelTrabajoId,
        papelTitulo: papelesTrabajo.titulo,
        papelAsignadoA: papelesTrabajo.asignadoA,
        papelPreparadoPor: papelesTrabajo.preparadoPor,
        auditoriaId: notasRevision.auditoriaId,
        empresaId: auditorias.empresaId,
        empresaNombre: empresas.nombre,
        creadoPorNombre: usuarios.nombre,
      })
      .from(notasRevision)
      .innerJoin(papelesTrabajo, eq(notasRevision.papelTrabajoId, papelesTrabajo.id))
      .innerJoin(auditorias, eq(notasRevision.auditoriaId, auditorias.id))
      .innerJoin(empresas, eq(auditorias.empresaId, empresas.id))
      .leftJoin(usuarios, eq(notasRevision.creadoPor, usuarios.id))
      .where(
        and(
          eq(empresas.firmaId, firmaId),
          eq(notasRevision.estado, 'abierta'),
          ne(auditorias.estado, 'finalizada'),
          or(
            eq(notasRevision.creadoPor, sub),
            eq(papelesTrabajo.asignadoA, sub),
            eq(papelesTrabajo.preparadoPor, sub),
          ),
        ),
      )
      .orderBy(desc(notasRevision.createdAt)),
  ])

  // Notas abiertas por papel (las de mis papeles ya vienen completas en `notas`).
  const notasPorPapel: Record<string, number> = {}
  for (const n of notas) notasPorPapel[n.papelTrabajoId] = (notasPorPapel[n.papelTrabajoId] ?? 0) + 1

  return c.json({
    data: {
      tareas: misTareas,
      papeles: misPapeles.map((p) => ({ ...p, notasAbiertas: notasPorPapel[p.id] ?? 0 })),
      notas: notas.map((n) => ({
        id: n.id,
        texto: n.texto,
        createdAt: n.createdAt,
        papelTrabajoId: n.papelTrabajoId,
        papelTitulo: n.papelTitulo,
        auditoriaId: n.auditoriaId,
        empresaId: n.empresaId,
        empresaNombre: n.empresaNombre,
        creadoPorNombre: n.creadoPorNombre,
        origen:
          n.creadoPor !== sub && (n.papelAsignadoA === sub || n.papelPreparadoPor === sub)
            ? ('por_resolver' as const)
            : ('creada_por_mi' as const),
      })),
    },
  })
})

export default app
