-- Sistema de gestión de calidad de la firma (NIGC 1, aplicación anticipada; cubre NICC 1).
-- Solo aditivo: una columna NULL en firmas y cuatro tablas nuevas.
-- Reverso en drizzle/down/0052_gestion_calidad.sql.
ALTER TABLE "firmas" ADD COLUMN IF NOT EXISTS "responsable_calidad_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "firmas" ADD CONSTRAINT "firmas_responsable_calidad_id_usuarios_id_fk" FOREIGN KEY ("responsable_calidad_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calidad_objetivos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firma_id" uuid NOT NULL,
	"componente" text NOT NULL,
	"texto" text NOT NULL,
	"base_clave" text,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calidad_riesgos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firma_id" uuid NOT NULL,
	"objetivo_id" uuid NOT NULL,
	"descripcion" text NOT NULL,
	"base_clave" text,
	"activo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calidad_respuestas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firma_id" uuid NOT NULL,
	"riesgo_id" uuid NOT NULL,
	"descripcion" text NOT NULL,
	"vinculo" text,
	"base_clave" text,
	"activo" boolean DEFAULT true NOT NULL,
	"evidencia_key" text,
	"evidencia_nombre" text,
	"evidencia_mime" text,
	"evidencia_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calidad_evaluaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firma_id" uuid NOT NULL,
	"anio" integer NOT NULL,
	"fecha_corte" date NOT NULL,
	"componentes_revisados" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resultado" text,
	"conclusion" text,
	"deficiencias" text,
	"concluido_por" uuid,
	"concluido_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calidad_objetivos" ADD CONSTRAINT "calidad_objetivos_firma_id_firmas_id_fk" FOREIGN KEY ("firma_id") REFERENCES "public"."firmas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calidad_riesgos" ADD CONSTRAINT "calidad_riesgos_firma_id_firmas_id_fk" FOREIGN KEY ("firma_id") REFERENCES "public"."firmas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calidad_riesgos" ADD CONSTRAINT "calidad_riesgos_objetivo_id_calidad_objetivos_id_fk" FOREIGN KEY ("objetivo_id") REFERENCES "public"."calidad_objetivos"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calidad_respuestas" ADD CONSTRAINT "calidad_respuestas_firma_id_firmas_id_fk" FOREIGN KEY ("firma_id") REFERENCES "public"."firmas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calidad_respuestas" ADD CONSTRAINT "calidad_respuestas_riesgo_id_calidad_riesgos_id_fk" FOREIGN KEY ("riesgo_id") REFERENCES "public"."calidad_riesgos"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calidad_evaluaciones" ADD CONSTRAINT "calidad_evaluaciones_firma_id_firmas_id_fk" FOREIGN KEY ("firma_id") REFERENCES "public"."firmas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "calidad_evaluaciones" ADD CONSTRAINT "calidad_evaluaciones_concluido_por_usuarios_id_fk" FOREIGN KEY ("concluido_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "calidad_objetivos_firma_base_unq" ON "calidad_objetivos" USING btree ("firma_id","base_clave");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "calidad_riesgos_firma_base_unq" ON "calidad_riesgos" USING btree ("firma_id","base_clave");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "calidad_respuestas_firma_base_unq" ON "calidad_respuestas" USING btree ("firma_id","base_clave");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "calidad_evaluaciones_firma_anio_unq" ON "calidad_evaluaciones" USING btree ("firma_id","anio");
