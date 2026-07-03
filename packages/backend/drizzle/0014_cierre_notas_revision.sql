CREATE TABLE IF NOT EXISTS "notas_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auditoria_id" uuid NOT NULL,
	"papel_trabajo_id" uuid NOT NULL,
	"texto" text NOT NULL,
	"estado" text DEFAULT 'abierta' NOT NULL,
	"respuesta" text,
	"creado_por" uuid NOT NULL,
	"resuelto_por" uuid,
	"resuelto_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cierres_auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auditoria_id" uuid NOT NULL,
	"hechos_posteriores" text,
	"hechos_posteriores_evaluado" boolean DEFAULT false NOT NULL,
	"negocio_marcha" text,
	"negocio_marcha_evaluado" boolean DEFAULT false NOT NULL,
	"revision_calidad" text,
	"revision_calidad_completa" boolean DEFAULT false NOT NULL,
	"cerrado" boolean DEFAULT false NOT NULL,
	"cerrado_por" uuid,
	"cerrado_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cierres_auditoria_auditoria_id_unique" UNIQUE("auditoria_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notas_revision" ADD CONSTRAINT "notas_revision_auditoria_id_auditorias_id_fk" FOREIGN KEY ("auditoria_id") REFERENCES "public"."auditorias"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notas_revision" ADD CONSTRAINT "notas_revision_papel_trabajo_id_papeles_trabajo_id_fk" FOREIGN KEY ("papel_trabajo_id") REFERENCES "public"."papeles_trabajo"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notas_revision" ADD CONSTRAINT "notas_revision_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notas_revision" ADD CONSTRAINT "notas_revision_resuelto_por_usuarios_id_fk" FOREIGN KEY ("resuelto_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cierres_auditoria" ADD CONSTRAINT "cierres_auditoria_auditoria_id_auditorias_id_fk" FOREIGN KEY ("auditoria_id") REFERENCES "public"."auditorias"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cierres_auditoria" ADD CONSTRAINT "cierres_auditoria_cerrado_por_usuarios_id_fk" FOREIGN KEY ("cerrado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
