-- Reverso de 0056_manual_calidad. La tabla solo existe gracias a esta migración.
DROP INDEX IF EXISTS "calidad_manuales_firma_version_unq";--> statement-breakpoint
DROP TABLE IF EXISTS "calidad_manuales";
