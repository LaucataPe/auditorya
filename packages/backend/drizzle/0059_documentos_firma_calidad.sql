-- Documentos que la firma ya tenía (manual o políticas): se suben una vez y cubren varios formatos,
-- y el manual anterior hecho fuera de AuditorYa se registra como versión externa.
-- Solo aditivo: una tabla nueva y columnas NULL o con DEFAULT. Reverso en drizzle/down/0059_documentos_firma_calidad.sql.
CREATE TABLE IF NOT EXISTS "calidad_documentos_firma" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firma_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"fecha_aprobacion" date NOT NULL,
	"aprobado_por" text,
	"archivo_key" text NOT NULL,
	"archivo_nombre" text NOT NULL,
	"archivo_mime" text NOT NULL,
	"hash" text NOT NULL,
	"creado_por" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calidad_documentos_firma" ADD CONSTRAINT "calidad_documentos_firma_firma_id_firmas_id_fk" FOREIGN KEY ("firma_id") REFERENCES "public"."firmas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calidad_documentos_firma" ADD CONSTRAINT "calidad_documentos_firma_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calidad_documentos_firma_firma_idx" ON "calidad_documentos_firma" USING btree ("firma_id");--> statement-breakpoint
ALTER TABLE "calidad_documentos" ADD COLUMN IF NOT EXISTS "documento_firma_id" uuid;--> statement-breakpoint
ALTER TABLE "calidad_documentos" ADD COLUMN IF NOT EXISTS "referencia" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calidad_documentos" ADD CONSTRAINT "calidad_documentos_documento_firma_id_fk" FOREIGN KEY ("documento_firma_id") REFERENCES "public"."calidad_documentos_firma"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "calidad_manuales" ADD COLUMN IF NOT EXISTS "externo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "calidad_manuales" ADD COLUMN IF NOT EXISTS "fecha_aprobacion" date;--> statement-breakpoint
ALTER TABLE "calidad_manuales" ADD COLUMN IF NOT EXISTS "archivo_key" text;--> statement-breakpoint
ALTER TABLE "calidad_manuales" ADD COLUMN IF NOT EXISTS "archivo_nombre" text;--> statement-breakpoint
ALTER TABLE "calidad_manuales" ADD COLUMN IF NOT EXISTS "archivo_mime" text;
