CREATE TABLE IF NOT EXISTS "hallazgos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auditoria_id" uuid NOT NULL,
	"papel_trabajo_id" uuid,
	"area" text DEFAULT 'otro' NOT NULL,
	"cuenta_codigo" text,
	"descripcion" text NOT NULL,
	"recomendacion" text,
	"monto" numeric(20, 2),
	"tipo" text DEFAULT 'incorreccion' NOT NULL,
	"severidad" text DEFAULT 'media' NOT NULL,
	"estado" text DEFAULT 'abierto' NOT NULL,
	"ajuste_id" uuid,
	"comunicado_at" timestamp,
	"corregido_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hallazgos" ADD CONSTRAINT "hallazgos_auditoria_id_auditorias_id_fk" FOREIGN KEY ("auditoria_id") REFERENCES "public"."auditorias"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hallazgos" ADD CONSTRAINT "hallazgos_papel_trabajo_id_papeles_trabajo_id_fk" FOREIGN KEY ("papel_trabajo_id") REFERENCES "public"."papeles_trabajo"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hallazgos" ADD CONSTRAINT "hallazgos_ajuste_id_ajustes_id_fk" FOREIGN KEY ("ajuste_id") REFERENCES "public"."ajustes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
