-- Formatos prellenados del sistema de calidad y domicilio de la firma.
-- Solo aditivo: cuatro columnas NULL en firmas y una tabla nueva.
-- Reverso en drizzle/down/0054_formatos_calidad.sql.
ALTER TABLE "firmas" ADD COLUMN IF NOT EXISTS "direccion" text;--> statement-breakpoint
ALTER TABLE "firmas" ADD COLUMN IF NOT EXISTS "telefono" text;--> statement-breakpoint
ALTER TABLE "firmas" ADD COLUMN IF NOT EXISTS "email" text;--> statement-breakpoint
ALTER TABLE "firmas" ADD COLUMN IF NOT EXISTS "inscripcion_jcc" text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calidad_documentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firma_id" uuid NOT NULL,
	"formato" text NOT NULL,
	"version" integer NOT NULL,
	"estado" text DEFAULT 'borrador' NOT NULL,
	"contenido" jsonb NOT NULL,
	"firmado_por" uuid,
	"firmado_at" timestamp,
	"vigente_hasta" date,
	"creado_por" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calidad_documentos" ADD CONSTRAINT "calidad_documentos_firma_id_firmas_id_fk" FOREIGN KEY ("firma_id") REFERENCES "public"."firmas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calidad_documentos" ADD CONSTRAINT "calidad_documentos_firmado_por_usuarios_id_fk" FOREIGN KEY ("firmado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calidad_documentos" ADD CONSTRAINT "calidad_documentos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "calidad_documentos_firma_formato_version_unq" ON "calidad_documentos" USING btree ("firma_id","formato","version");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "calidad_documentos_un_borrador_unq" ON "calidad_documentos" USING btree ("firma_id","formato") WHERE "estado" = 'borrador';
