-- Reverso de 0059_documentos_firma_calidad. Solo quita lo que esa migración agregó.
ALTER TABLE "calidad_manuales" DROP COLUMN IF EXISTS "archivo_mime";--> statement-breakpoint
ALTER TABLE "calidad_manuales" DROP COLUMN IF EXISTS "archivo_nombre";--> statement-breakpoint
ALTER TABLE "calidad_manuales" DROP COLUMN IF EXISTS "archivo_key";--> statement-breakpoint
ALTER TABLE "calidad_manuales" DROP COLUMN IF EXISTS "fecha_aprobacion";--> statement-breakpoint
ALTER TABLE "calidad_manuales" DROP COLUMN IF EXISTS "externo";--> statement-breakpoint
ALTER TABLE "calidad_documentos" DROP CONSTRAINT IF EXISTS "calidad_documentos_documento_firma_id_fk";--> statement-breakpoint
ALTER TABLE "calidad_documentos" DROP COLUMN IF EXISTS "referencia";--> statement-breakpoint
ALTER TABLE "calidad_documentos" DROP COLUMN IF EXISTS "documento_firma_id";--> statement-breakpoint
DROP INDEX IF EXISTS "calidad_documentos_firma_firma_idx";--> statement-breakpoint
DROP TABLE IF EXISTS "calidad_documentos_firma";
