ALTER TABLE "empresas" ADD COLUMN IF NOT EXISTS "modelo_negocio" text;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN IF NOT EXISTS "estructura" text;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN IF NOT EXISTS "personas_clave" text;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN IF NOT EXISTS "entorno_regulatorio" text;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN IF NOT EXISTS "sistema_contable" text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "entendimiento_periodo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auditoria_id" uuid NOT NULL,
	"cambios_significativos" text,
	"eventos_significativos" text,
	"notas" text,
	"sin_cambios" boolean DEFAULT false NOT NULL,
	"confirmado" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "entendimiento_periodo_auditoria_id_unique" UNIQUE("auditoria_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "entendimiento_periodo" ADD CONSTRAINT "entendimiento_periodo_auditoria_id_auditorias_id_fk" FOREIGN KEY ("auditoria_id") REFERENCES "public"."auditorias"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
