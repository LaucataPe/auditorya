-- Índices de referenciación de papeles de trabajo (NIA 230).
-- indice = prefijo del área + consecutivo por encargo ('C-1'). El backfill numera
-- los papeles existentes por created_at. El CASE de prefijos debe coincidir con
-- AREAS_BASE y prefijoDeArea() en packages/types/src/areas.ts.
ALTER TABLE "areas_firma" ADD COLUMN IF NOT EXISTS "prefijo" text;--> statement-breakpoint
ALTER TABLE "papeles_trabajo" ADD COLUMN IF NOT EXISTS "indice" text;--> statement-breakpoint
WITH pref AS (
  SELECT id, auditoria_id, created_at,
    CASE area
      WHEN 'caja' THEN 'A'
      WHEN 'bancos' THEN 'B'
      WHEN 'inversiones' THEN 'C'
      WHEN 'cuentas_por_cobrar' THEN 'D'
      WHEN 'impuestos_por_cobrar' THEN 'E'
      WHEN 'inventarios' THEN 'F'
      WHEN 'propiedad_planta_equipo' THEN 'G'
      WHEN 'intangibles' THEN 'H'
      WHEN 'otros_activos' THEN 'I'
      WHEN 'obligaciones_financieras' THEN 'AA'
      WHEN 'proveedores' THEN 'BB'
      WHEN 'cuentas_por_pagar' THEN 'CC'
      WHEN 'impuestos_por_pagar' THEN 'DD'
      WHEN 'obligaciones_laborales' THEN 'EE'
      WHEN 'provisiones_nomina' THEN 'FF'
      WHEN 'apropiaciones_nomina' THEN 'GG'
      WHEN 'diferidos' THEN 'HH'
      WHEN 'otros_pasivos' THEN 'II'
      WHEN 'patrimonio' THEN 'P'
      WHEN 'ingresos_operacionales' THEN 'X'
      WHEN 'ingresos_no_operacionales' THEN 'XX'
      WHEN 'gastos_de_administracion' THEN 'Y'
      WHEN 'gastos_de_ventas' THEN 'YY'
      WHEN 'gastos_no_operacionales' THEN 'W'
      WHEN 'costo_de_ventas' THEN 'Z'
      WHEN 'costos_de_produccion' THEN 'ZZ'
      -- Ciclo propio de la firma: iniciales de las dos primeras palabras de la clave.
      ELSE upper(coalesce(nullif(
        left((string_to_array(area, '_'))[1], 1) || coalesce(left((string_to_array(area, '_'))[2], 1), ''),
      ''), 'Q'))
    END AS p
  FROM "papeles_trabajo"
  WHERE indice IS NULL
), num AS (
  SELECT id, p || '-' || (row_number() OVER (PARTITION BY auditoria_id, p ORDER BY created_at, id))::text AS idx
  FROM pref
)
UPDATE "papeles_trabajo" pt SET indice = num.idx FROM num WHERE pt.id = num.id;--> statement-breakpoint
ALTER TABLE "papeles_trabajo" ALTER COLUMN "indice" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "papeles_trabajo_auditoria_indice_unq" ON "papeles_trabajo" ("auditoria_id","indice");
