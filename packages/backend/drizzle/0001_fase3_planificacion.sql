CREATE TABLE IF NOT EXISTS "evaluaciones_aceptacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"respuestas" jsonb NOT NULL,
	"hay_amenazas" boolean DEFAULT false NOT NULL,
	"decision" text NOT NULL,
	"evaluado_por" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "materialidades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auditoria_id" uuid NOT NULL,
	"base_calculo" text NOT NULL,
	"monto_base" numeric(18, 2) NOT NULL,
	"porcentaje" numeric(5, 2) NOT NULL,
	"materialidad" numeric(18, 2) NOT NULL,
	"porcentaje_desempeno" numeric(5, 2) NOT NULL,
	"materialidad_desempeno" numeric(18, 2) NOT NULL,
	"justificacion" text,
	"aprobada" boolean DEFAULT false NOT NULL,
	"aprobada_por" uuid,
	"aprobada_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "materialidades_auditoria_id_unique" UNIQUE("auditoria_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "riesgos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auditoria_id" uuid NOT NULL,
	"area" text NOT NULL,
	"descripcion" text NOT NULL,
	"riesgo_inherente" text NOT NULL,
	"riesgo_control" text NOT NULL,
	"riesgo_combinado" text NOT NULL,
	"respuesta_planeada" text,
	"origen" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evaluaciones_aceptacion" ADD CONSTRAINT "evaluaciones_aceptacion_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evaluaciones_aceptacion" ADD CONSTRAINT "evaluaciones_aceptacion_evaluado_por_usuarios_id_fk" FOREIGN KEY ("evaluado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "materialidades" ADD CONSTRAINT "materialidades_auditoria_id_auditorias_id_fk" FOREIGN KEY ("auditoria_id") REFERENCES "public"."auditorias"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "materialidades" ADD CONSTRAINT "materialidades_aprobada_por_usuarios_id_fk" FOREIGN KEY ("aprobada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "riesgos" ADD CONSTRAINT "riesgos_auditoria_id_auditorias_id_fk" FOREIGN KEY ("auditoria_id") REFERENCES "public"."auditorias"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
