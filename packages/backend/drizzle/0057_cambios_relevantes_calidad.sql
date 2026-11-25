-- Cambios relevantes del sistema de calidad (NIGC 1 ¶27): qué pasó, a qué componentes afecta y qué se decidió.
-- Solo aditivo: una tabla nueva. Reverso en drizzle/down/0057_cambios_relevantes_calidad.sql.
CREATE TABLE IF NOT EXISTS "calidad_cambios_relevantes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firma_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"tipo" text NOT NULL,
	"descripcion" text NOT NULL,
	"componentes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"decision" text,
	"justificacion" text,
	"evaluado_por" uuid,
	"evaluado_at" timestamp,
	"creado_por" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calidad_cambios_relevantes" ADD CONSTRAINT "calidad_cambios_relevantes_firma_id_firmas_id_fk" FOREIGN KEY ("firma_id") REFERENCES "public"."firmas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calidad_cambios_relevantes" ADD CONSTRAINT "calidad_cambios_relevantes_evaluado_por_usuarios_id_fk" FOREIGN KEY ("evaluado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calidad_cambios_relevantes" ADD CONSTRAINT "calidad_cambios_relevantes_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calidad_cambios_relevantes_firma_fecha_idx" ON "calidad_cambios_relevantes" USING btree ("firma_id","fecha");
