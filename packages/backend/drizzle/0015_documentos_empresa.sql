CREATE TABLE IF NOT EXISTS "documentos_empresa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"nombre" text,
	"archivo_key" text NOT NULL,
	"archivo_nombre" text NOT NULL,
	"archivo_mime" text NOT NULL,
	"archivo_tamano" integer NOT NULL,
	"archivo_hash" text NOT NULL,
	"subido_por" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentos_empresa" ADD CONSTRAINT "documentos_empresa_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documentos_empresa" ADD CONSTRAINT "documentos_empresa_subido_por_usuarios_id_fk" FOREIGN KEY ("subido_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
