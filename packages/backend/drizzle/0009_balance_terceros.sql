ALTER TABLE "cuentas_balance" ALTER COLUMN "nombre" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cuentas_balance" ALTER COLUMN "saldo_actual" TYPE numeric(20, 2);--> statement-breakpoint
ALTER TABLE "cuentas_balance" ALTER COLUMN "saldo_anterior" TYPE numeric(20, 2);--> statement-breakpoint
ALTER TABLE "cuentas_balance" ADD COLUMN IF NOT EXISTS "nivel" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cuentas_balance" ADD COLUMN IF NOT EXISTS "tercero" text;--> statement-breakpoint
ALTER TABLE "cuentas_balance" ADD COLUMN IF NOT EXISTS "tercero_nombre" text;--> statement-breakpoint
ALTER TABLE "cuentas_balance" ADD COLUMN IF NOT EXISTS "debito" numeric(20, 2);--> statement-breakpoint
ALTER TABLE "cuentas_balance" ADD COLUMN IF NOT EXISTS "credito" numeric(20, 2);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "balance_archivos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auditoria_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"tamano" integer NOT NULL,
	"hash" text NOT NULL,
	"contenido" text NOT NULL,
	"subido_por" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "balance_archivos_auditoria_id_unique" UNIQUE("auditoria_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "balance_archivos" ADD CONSTRAINT "balance_archivos_auditoria_id_auditorias_id_fk" FOREIGN KEY ("auditoria_id") REFERENCES "public"."auditorias"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "balance_archivos" ADD CONSTRAINT "balance_archivos_subido_por_usuarios_id_fk" FOREIGN KEY ("subido_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
