ALTER TABLE "auditorias" ADD COLUMN "tipo_servicio" text DEFAULT 'revisoria_fiscal' NOT NULL;
--> statement-breakpoint
ALTER TABLE "auditorias" ALTER COLUMN "tipo" DROP NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "programas_ai" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auditoria_id" uuid NOT NULL,
	"area" text NOT NULL,
	"objetivo" text,
	"alcance" text,
	"estado" text DEFAULT 'no_iniciado' NOT NULL,
	"asignado_a" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hallazgos_ai" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auditoria_id" uuid NOT NULL,
	"programa_id" uuid,
	"titulo" text NOT NULL,
	"condicion" text NOT NULL,
	"criterio" text NOT NULL,
	"causa" text NOT NULL,
	"efecto" text NOT NULL,
	"nivel_riesgo" text NOT NULL,
	"recomendacion" text NOT NULL,
	"respuesta_administracion" text,
	"responsable_gestion" text,
	"fecha_compromiso" timestamp,
	"estado_seguimiento" text DEFAULT 'pendiente' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "programas_ai" ADD CONSTRAINT "programas_ai_auditoria_id_auditorias_id_fk" FOREIGN KEY ("auditoria_id") REFERENCES "public"."auditorias"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "programas_ai" ADD CONSTRAINT "programas_ai_asignado_a_usuarios_id_fk" FOREIGN KEY ("asignado_a") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hallazgos_ai" ADD CONSTRAINT "hallazgos_ai_auditoria_id_auditorias_id_fk" FOREIGN KEY ("auditoria_id") REFERENCES "public"."auditorias"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hallazgos_ai" ADD CONSTRAINT "hallazgos_ai_programa_id_programas_ai_id_fk" FOREIGN KEY ("programa_id") REFERENCES "public"."programas_ai"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
