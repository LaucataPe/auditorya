-- Reverso de 0052_gestion_calidad. Las tablas solo existen gracias a esta migración.
-- Los archivos de evidencia en el storage (calidad/<firmaId>/…) quedan huérfanos: limpiarlos aparte si aplica.
DROP INDEX IF EXISTS "calidad_evaluaciones_firma_anio_unq";--> statement-breakpoint
DROP INDEX IF EXISTS "calidad_respuestas_firma_base_unq";--> statement-breakpoint
DROP INDEX IF EXISTS "calidad_riesgos_firma_base_unq";--> statement-breakpoint
DROP INDEX IF EXISTS "calidad_objetivos_firma_base_unq";--> statement-breakpoint
DROP TABLE IF EXISTS "calidad_evaluaciones";--> statement-breakpoint
DROP TABLE IF EXISTS "calidad_respuestas";--> statement-breakpoint
DROP TABLE IF EXISTS "calidad_riesgos";--> statement-breakpoint
DROP TABLE IF EXISTS "calidad_objetivos";--> statement-breakpoint
ALTER TABLE "firmas" DROP CONSTRAINT IF EXISTS "firmas_responsable_calidad_id_usuarios_id_fk";--> statement-breakpoint
ALTER TABLE "firmas" DROP COLUMN IF EXISTS "responsable_calidad_id";
