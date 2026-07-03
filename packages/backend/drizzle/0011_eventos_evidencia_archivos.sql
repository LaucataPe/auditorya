CREATE TABLE IF NOT EXISTS "eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firma_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"auditoria_id" uuid,
	"empresa_id" uuid,
	"accion" text NOT NULL,
	"entidad" text NOT NULL,
	"entidad_id" uuid,
	"detalle" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evidencias" ADD COLUMN IF NOT EXISTS "archivo_key" text;--> statement-breakpoint
ALTER TABLE "evidencias" ADD COLUMN IF NOT EXISTS "archivo_nombre" text;--> statement-breakpoint
ALTER TABLE "evidencias" ADD COLUMN IF NOT EXISTS "archivo_mime" text;--> statement-breakpoint
ALTER TABLE "evidencias" ADD COLUMN IF NOT EXISTS "archivo_tamano" integer;--> statement-breakpoint
ALTER TABLE "evidencias" ADD COLUMN IF NOT EXISTS "archivo_hash" text;--> statement-breakpoint
ALTER TABLE "evidencias" ADD COLUMN IF NOT EXISTS "subido_por" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "eventos" ADD CONSTRAINT "eventos_firma_id_firmas_id_fk" FOREIGN KEY ("firma_id") REFERENCES "public"."firmas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "eventos" ADD CONSTRAINT "eventos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "eventos" ADD CONSTRAINT "eventos_auditoria_id_auditorias_id_fk" FOREIGN KEY ("auditoria_id") REFERENCES "public"."auditorias"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "eventos" ADD CONSTRAINT "eventos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidencias" ADD CONSTRAINT "evidencias_subido_por_usuarios_id_fk" FOREIGN KEY ("subido_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eventos_auditoria_idx" ON "eventos" ("auditoria_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eventos_firma_idx" ON "eventos" ("firma_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cuentas_balance_auditoria_idx" ON "cuentas_balance" ("auditoria_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "riesgos_auditoria_idx" ON "riesgos" ("auditoria_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "papeles_trabajo_auditoria_idx" ON "papeles_trabajo" ("auditoria_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tareas_auditoria_idx" ON "tareas" ("auditoria_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evidencias_papel_idx" ON "evidencias" ("papel_trabajo_id");
