CREATE TABLE IF NOT EXISTS "perfiles_balance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"mapeo" jsonb NOT NULL,
	"encabezados" jsonb,
	"actualizado_por" uuid NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "perfiles_balance_empresa_id_unique" UNIQUE("empresa_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "perfiles_balance" ADD CONSTRAINT "perfiles_balance_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "perfiles_balance" ADD CONSTRAINT "perfiles_balance_actualizado_por_usuarios_id_fk" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
