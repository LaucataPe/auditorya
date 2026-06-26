CREATE TABLE IF NOT EXISTS "informes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auditoria_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"tipo_opinion" text,
	"contenido" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"estado" text DEFAULT 'borrador' NOT NULL,
	"aprobado_por" uuid,
	"aprobado_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "informes" ADD CONSTRAINT "informes_auditoria_id_auditorias_id_fk" FOREIGN KEY ("auditoria_id") REFERENCES "public"."auditorias"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "informes" ADD CONSTRAINT "informes_aprobado_por_usuarios_id_fk" FOREIGN KEY ("aprobado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "informes_auditoria_tipo_uq" ON "informes" USING btree ("auditoria_id","tipo");
