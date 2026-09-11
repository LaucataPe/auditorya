import { sql, type SQL, type SQLWrapper } from 'drizzle-orm'

/**
 * Fusiona un parche jsonb de dos niveles (id → campo → valor) dentro de la
 * columna sin leerla primero, en una sola expresión del UPDATE: dos PATCH
 * concurrentes en renglones o campos distintos nunca se pisan (a diferencia de
 * un `.set({columna: objetoCompleto})` armado desde una caché del cliente que
 * puede estar desactualizada).
 *
 * Ojo: no usar `jsonb_set(col, '{id,campo}', valor, true)`. Postgres solo crea
 * la última clave de la ruta: si el objeto `id` aún no existe devuelve la
 * columna sin cambios, y el primer valor de cada renglón o ítem se perdía en
 * silencio. Aquí cada id se funde como objeto (`existente || parche`) y se crea
 * si falta.
 */
export function mergeJsonbPatch(columna: SQLWrapper, parche: Record<string, Record<string, unknown>>): SQL {
  // Solo viajan los campos definidos; un id sin campos no crea un objeto vacío.
  const limpio = Object.fromEntries(
    Object.entries(parche)
      .map(
        ([id, campos]) =>
          [id, Object.fromEntries(Object.entries(campos).filter(([, v]) => v !== undefined))] as const,
      )
      .filter(([, campos]) => Object.keys(campos).length > 0),
  )

  return sql`coalesce(${columna}, '{}'::jsonb) || (
    select coalesce(
      jsonb_object_agg(
        p.key,
        case when jsonb_typeof(${columna} -> p.key) = 'object' then ${columna} -> p.key else '{}'::jsonb end
          || p.value
      ),
      '{}'::jsonb
    )
    from jsonb_each(${JSON.stringify(limpio)}::jsonb) as p
  )`
}
