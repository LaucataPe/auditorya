CREATE TABLE IF NOT EXISTS "papeles_trabajo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auditoria_id" uuid NOT NULL,
	"area" text NOT NULL,
	"titulo" text NOT NULL,
	"procedimiento" text,
	"alcance" text,
	"hallazgos" text,
	"conclusion" text,
	"estado" text DEFAULT 'borrador' NOT NULL,
	"preparado_por" uuid NOT NULL,
	"aprobado_por" uuid,
	"aprobado_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "evidencias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"papel_trabajo_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"tipo" text DEFAULT 'documento' NOT NULL,
	"enlace_externo" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "controles_coso" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auditoria_id" uuid NOT NULL,
	"componente" text NOT NULL,
	"calificacion" text NOT NULL,
	"observaciones" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "papeles_trabajo" ADD CONSTRAINT "papeles_trabajo_auditoria_id_auditorias_id_fk" FOREIGN KEY ("auditoria_id") REFERENCES "public"."auditorias"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "papeles_trabajo" ADD CONSTRAINT "papeles_trabajo_preparado_por_usuarios_id_fk" FOREIGN KEY ("preparado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "papeles_trabajo" ADD CONSTRAINT "papeles_trabajo_aprobado_por_usuarios_id_fk" FOREIGN KEY ("aprobado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidencias" ADD CONSTRAINT "evidencias_papel_trabajo_id_papeles_trabajo_id_fk" FOREIGN KEY ("papel_trabajo_id") REFERENCES "public"."papeles_trabajo"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "controles_coso" ADD CONSTRAINT "controles_coso_auditoria_id_auditorias_id_fk" FOREIGN KEY ("auditoria_id") REFERENCES "public"."auditorias"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "controles_coso_auditoria_componente_uq" ON "controles_coso" USING btree ("auditoria_id","componente");
