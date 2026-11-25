-- Reverso de 0057_cambios_relevantes_calidad. La tabla solo existe gracias a esta migración.
DROP INDEX IF EXISTS "calidad_cambios_relevantes_firma_fecha_idx";--> statement-breakpoint
DROP TABLE IF EXISTS "calidad_cambios_relevantes";
