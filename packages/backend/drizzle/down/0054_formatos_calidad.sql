-- Reverso de 0054_formatos_calidad. La tabla y las columnas solo existen gracias a esta migración.
DROP INDEX IF EXISTS "calidad_documentos_un_borrador_unq";--> statement-breakpoint
DROP INDEX IF EXISTS "calidad_documentos_firma_formato_version_unq";--> statement-breakpoint
DROP TABLE IF EXISTS "calidad_documentos";--> statement-breakpoint
ALTER TABLE "firmas" DROP COLUMN IF EXISTS "inscripcion_jcc";--> statement-breakpoint
ALTER TABLE "firmas" DROP COLUMN IF EXISTS "email";--> statement-breakpoint
ALTER TABLE "firmas" DROP COLUMN IF EXISTS "telefono";--> statement-breakpoint
ALTER TABLE "firmas" DROP COLUMN IF EXISTS "direccion";
