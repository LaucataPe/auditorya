CREATE TABLE IF NOT EXISTS "tareas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auditoria_id" uuid NOT NULL,
	"area" text NOT NULL,
	"titulo" text NOT NULL,
	"descripcion" text,
	"asignado_a" uuid NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"vencimiento" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tareas" ADD CONSTRAINT "tareas_auditoria_id_auditorias_id_fk" FOREIGN KEY ("auditoria_id") REFERENCES "public"."auditorias"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tareas" ADD CONSTRAINT "tareas_asignado_a_usuarios_id_fk" FOREIGN KEY ("asignado_a") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
