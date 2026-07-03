CREATE TABLE IF NOT EXISTS "solicitudes_pbc" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auditoria_id" uuid NOT NULL,
	"papel_trabajo_id" uuid,
	"descripcion" text NOT NULL,
	"estado" text DEFAULT 'solicitado' NOT NULL,
	"evidencia_id" uuid,
	"notas" text,
	"fecha_limite" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "solicitudes_pbc" ADD CONSTRAINT "solicitudes_pbc_auditoria_id_auditorias_id_fk" FOREIGN KEY ("auditoria_id") REFERENCES "public"."auditorias"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "solicitudes_pbc" ADD CONSTRAINT "solicitudes_pbc_papel_trabajo_id_papeles_trabajo_id_fk" FOREIGN KEY ("papel_trabajo_id") REFERENCES "public"."papeles_trabajo"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "solicitudes_pbc" ADD CONSTRAINT "solicitudes_pbc_evidencia_id_evidencias_id_fk" FOREIGN KEY ("evidencia_id") REFERENCES "public"."evidencias"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
