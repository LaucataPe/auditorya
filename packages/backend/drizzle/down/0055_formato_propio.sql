-- Reverso de 0055_formato_propio. Los archivos subidos (calidad/<firmaId>/…) quedan huérfanos en el storage.
ALTER TABLE "calidad_documentos" DROP COLUMN IF EXISTS "archivo_mime";--> statement-breakpoint
ALTER TABLE "calidad_documentos" DROP COLUMN IF EXISTS "archivo_nombre";--> statement-breakpoint
ALTER TABLE "calidad_documentos" DROP COLUMN IF EXISTS "archivo_key";
