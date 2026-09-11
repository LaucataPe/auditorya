-- Arranque guiado del encargo con agente + memoria del agente por empresa. Aditivo.
ALTER TABLE "auditorias" ADD COLUMN IF NOT EXISTS "arranque_completado_at" timestamp;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "memoria_empresa_agente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"clave" text NOT NULL,
	"valor" jsonb NOT NULL,
	"actualizado_por" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "memoria_empresa_agente" ADD CONSTRAINT "memoria_empresa_agente_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "memoria_empresa_agente" ADD CONSTRAINT "memoria_empresa_agente_actualizado_por_usuarios_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "memoria_empresa_agente_empresa_clave_unq" ON "memoria_empresa_agente" ("empresa_id", "clave");
