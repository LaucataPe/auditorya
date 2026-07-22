DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cuentas_balance' AND column_name = 'saldo_anterior') THEN
  ALTER TABLE "cuentas_balance" RENAME COLUMN "saldo_anterior" TO "saldo_inicial";
 END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cuentas_balance_comparativo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auditoria_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"nombre" text,
	"nivel" integer DEFAULT 0 NOT NULL,
	"saldo" numeric(20, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "balance_meta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auditoria_id" uuid NOT NULL,
	"corte_desde" date,
	"corte_hasta" date,
	"comparativo_nombre" text,
	"comparativo_created_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "balance_meta_auditoria_id_unique" UNIQUE("auditoria_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cuentas_balance_comparativo" ADD CONSTRAINT "cuentas_balance_comparativo_auditoria_id_auditorias_id_fk" FOREIGN KEY ("auditoria_id") REFERENCES "public"."auditorias"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "balance_meta" ADD CONSTRAINT "balance_meta_auditoria_id_auditorias_id_fk" FOREIGN KEY ("auditoria_id") REFERENCES "public"."auditorias"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
