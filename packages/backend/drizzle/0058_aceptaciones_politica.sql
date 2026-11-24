-- Prueba de aceptación de la política de tratamiento de datos (Ley 1581). Solo aditivo: una tabla nueva.
-- Reverso en drizzle/down/0058_aceptaciones_politica.sql.
CREATE TABLE IF NOT EXISTS "aceptaciones_politica" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firma_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"documento" text NOT NULL,
	"version" text NOT NULL,
	"hash_texto" text NOT NULL,
	"texto_aceptacion" text NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "aceptaciones_politica" ADD CONSTRAINT "aceptaciones_politica_firma_id_firmas_id_fk" FOREIGN KEY ("firma_id") REFERENCES "public"."firmas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "aceptaciones_politica" ADD CONSTRAINT "aceptaciones_politica_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "aceptaciones_politica_usuario_doc_version_unq" ON "aceptaciones_politica" ("usuario_id","documento","version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "aceptaciones_politica_firma_idx" ON "aceptaciones_politica" ("firma_id","created_at");
