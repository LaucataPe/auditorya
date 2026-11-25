-- Manual del sistema de gestión de calidad, versionado (foto del sistema en cada versión).
-- Solo aditivo: una tabla nueva. Reverso en drizzle/down/0056_manual_calidad.sql.
CREATE TABLE IF NOT EXISTS "calidad_manuales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firma_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"anio" integer NOT NULL,
	"contenido" jsonb NOT NULL,
	"hash" text NOT NULL,
	"generado_por" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calidad_manuales" ADD CONSTRAINT "calidad_manuales_firma_id_firmas_id_fk" FOREIGN KEY ("firma_id") REFERENCES "public"."firmas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calidad_manuales" ADD CONSTRAINT "calidad_manuales_generado_por_usuarios_id_fk" FOREIGN KEY ("generado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "calidad_manuales_firma_version_unq" ON "calidad_manuales" USING btree ("firma_id","version");
