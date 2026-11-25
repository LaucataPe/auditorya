-- Formato de calidad propio de la firma, subido como archivo en lugar de llenar la plantilla.
-- Solo aditivo: tres columnas NULL. Reverso en drizzle/down/0055_formato_propio.sql.
ALTER TABLE "calidad_documentos" ADD COLUMN IF NOT EXISTS "archivo_key" text;--> statement-breakpoint
ALTER TABLE "calidad_documentos" ADD COLUMN IF NOT EXISTS "archivo_nombre" text;--> statement-breakpoint
ALTER TABLE "calidad_documentos" ADD COLUMN IF NOT EXISTS "archivo_mime" text;
