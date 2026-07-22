CREATE TABLE IF NOT EXISTS "ajustes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auditoria_id" uuid NOT NULL,
	"descripcion" text NOT NULL,
	"cuenta_codigo" text,
	"monto" numeric(20, 2) NOT NULL,
	"tipo" text DEFAULT 'factual' NOT NULL,
	"efecto" text DEFAULT 'resultado' NOT NULL,
	"corregido" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ajustes" ADD CONSTRAINT "ajustes_auditoria_id_auditorias_id_fk" FOREIGN KEY ("auditoria_id") REFERENCES "public"."auditorias"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
