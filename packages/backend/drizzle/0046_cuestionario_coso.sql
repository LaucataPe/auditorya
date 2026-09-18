-- Cuestionario de control interno (COSO pyme) respondido en el modo agéntico. Aditivo.
CREATE TABLE IF NOT EXISTS "respuestas_coso_agente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auditoria_id" uuid NOT NULL,
	"pregunta" text NOT NULL,
	"respuesta" text NOT NULL,
	"nota" text,
	"respondido_por" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "respuestas_coso_agente" ADD CONSTRAINT "respuestas_coso_agente_auditoria_id_auditorias_id_fk" FOREIGN KEY ("auditoria_id") REFERENCES "public"."auditorias"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "respuestas_coso_agente" ADD CONSTRAINT "respuestas_coso_agente_respondido_por_usuarios_id_fk" FOREIGN KEY ("respondido_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "respuestas_coso_agente_auditoria_pregunta_unq" ON "respuestas_coso_agente" ("auditoria_id", "pregunta");
