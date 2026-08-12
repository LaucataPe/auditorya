-- Homologación de datos: las claves del catálogo de áreas anterior pasan a su
-- área homóloga del catálogo nuevo (26 ciclos). Tras esto, las claves legadas
-- dejan de ser válidas en el código.
UPDATE "riesgos" SET "area" = CASE "area"
  WHEN 'efectivo' THEN 'bancos'
  WHEN 'cartera' THEN 'cuentas_por_cobrar'
  WHEN 'nomina' THEN 'obligaciones_laborales'
  WHEN 'impuestos' THEN 'impuestos_por_pagar'
  WHEN 'ingresos' THEN 'ingresos_operacionales'
  WHEN 'gastos' THEN 'gastos_de_administracion'
  WHEN 'otro' THEN 'otros_activos'
  ELSE "area" END
WHERE "area" IN ('efectivo','cartera','nomina','impuestos','ingresos','gastos','otro');--> statement-breakpoint
UPDATE "papeles_trabajo" SET "area" = CASE "area"
  WHEN 'efectivo' THEN 'bancos'
  WHEN 'cartera' THEN 'cuentas_por_cobrar'
  WHEN 'nomina' THEN 'obligaciones_laborales'
  WHEN 'impuestos' THEN 'impuestos_por_pagar'
  WHEN 'ingresos' THEN 'ingresos_operacionales'
  WHEN 'gastos' THEN 'gastos_de_administracion'
  WHEN 'otro' THEN 'otros_activos'
  ELSE "area" END
WHERE "area" IN ('efectivo','cartera','nomina','impuestos','ingresos','gastos','otro');--> statement-breakpoint
UPDATE "tareas" SET "area" = CASE "area"
  WHEN 'efectivo' THEN 'bancos'
  WHEN 'cartera' THEN 'cuentas_por_cobrar'
  WHEN 'nomina' THEN 'obligaciones_laborales'
  WHEN 'impuestos' THEN 'impuestos_por_pagar'
  WHEN 'ingresos' THEN 'ingresos_operacionales'
  WHEN 'gastos' THEN 'gastos_de_administracion'
  WHEN 'otro' THEN 'otros_activos'
  ELSE "area" END
WHERE "area" IN ('efectivo','cartera','nomina','impuestos','ingresos','gastos','otro');--> statement-breakpoint
UPDATE "hallazgos" SET "area" = CASE "area"
  WHEN 'efectivo' THEN 'bancos'
  WHEN 'cartera' THEN 'cuentas_por_cobrar'
  WHEN 'nomina' THEN 'obligaciones_laborales'
  WHEN 'impuestos' THEN 'impuestos_por_pagar'
  WHEN 'ingresos' THEN 'ingresos_operacionales'
  WHEN 'gastos' THEN 'gastos_de_administracion'
  WHEN 'otro' THEN 'otros_activos'
  ELSE "area" END
WHERE "area" IN ('efectivo','cartera','nomina','impuestos','ingresos','gastos','otro');--> statement-breakpoint
-- El default 'otro' de hallazgos era solo un respaldo (el área siempre se hereda del papel).
ALTER TABLE "hallazgos" ALTER COLUMN "area" DROP DEFAULT;
