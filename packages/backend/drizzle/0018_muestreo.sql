CREATE TABLE IF NOT EXISTS "muestras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"papel_trabajo_id" uuid NOT NULL,
	"auditoria_id" uuid NOT NULL,
	"codigo_cuenta" text NOT NULL,
	"metodo" text DEFAULT 'cobertura' NOT NULL,
	"cobertura_objetivo" numeric(4, 2) DEFAULT '0.80' NOT NULL,
	"materialidad" numeric(20, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "muestras_papel_trabajo_id_unique" UNIQUE("papel_trabajo_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "muestra_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"muestra_id" uuid NOT NULL,
	"tercero" text,
	"tercero_nombre" text,
	"saldo" numeric(20, 2) NOT NULL,
	"es_clave" boolean DEFAULT false NOT NULL,
	"incluido" boolean DEFAULT true NOT NULL,
	"resultado" text DEFAULT 'pendiente' NOT NULL,
	"diferencia" numeric(20, 2),
	"nota" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "muestras" ADD CONSTRAINT "muestras_papel_trabajo_id_papeles_trabajo_id_fk" FOREIGN KEY ("papel_trabajo_id") REFERENCES "public"."papeles_trabajo"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "muestras" ADD CONSTRAINT "muestras_auditoria_id_auditorias_id_fk" FOREIGN KEY ("auditoria_id") REFERENCES "public"."auditorias"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "muestra_items" ADD CONSTRAINT "muestra_items_muestra_id_muestras_id_fk" FOREIGN KEY ("muestra_id") REFERENCES "public"."muestras"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
