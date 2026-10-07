-- Modo agéntico en el módulo tributario (docs/agente/procedimiento-iva-v1.md, etapa 2).
-- Las corridas, propuestas y bitácora del agente pueden pertenecer a una revisión
-- tributaria en vez de a un encargo. Única excepción a "solo aditivo": auditoria_id
-- deja de ser obligatoria, con un CHECK que exige exactamente uno de los dos padres.
-- Reverso en drizzle/down/0049_agente_tributario.sql.
ALTER TABLE "corridas_agente" ALTER COLUMN "auditoria_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "corridas_agente" ADD COLUMN IF NOT EXISTS "revision_tributaria_id" uuid;--> statement-breakpoint
ALTER TABLE "propuestas_agente" ALTER COLUMN "auditoria_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "propuestas_agente" ADD COLUMN IF NOT EXISTS "revision_tributaria_id" uuid;--> statement-breakpoint
ALTER TABLE "bitacora_agente" ALTER COLUMN "auditoria_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bitacora_agente" ADD COLUMN IF NOT EXISTS "revision_tributaria_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "corridas_agente" ADD CONSTRAINT "corridas_agente_revision_tributaria_id_fk" FOREIGN KEY ("revision_tributaria_id") REFERENCES "public"."revisiones_tributarias"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "propuestas_agente" ADD CONSTRAINT "propuestas_agente_revision_tributaria_id_fk" FOREIGN KEY ("revision_tributaria_id") REFERENCES "public"."revisiones_tributarias"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bitacora_agente" ADD CONSTRAINT "bitacora_agente_revision_tributaria_id_fk" FOREIGN KEY ("revision_tributaria_id") REFERENCES "public"."revisiones_tributarias"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "corridas_agente" ADD CONSTRAINT "corridas_agente_padre_chk" CHECK (("auditoria_id" IS NOT NULL) <> ("revision_tributaria_id" IS NOT NULL));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "propuestas_agente" ADD CONSTRAINT "propuestas_agente_padre_chk" CHECK (("auditoria_id" IS NOT NULL) <> ("revision_tributaria_id" IS NOT NULL));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bitacora_agente" ADD CONSTRAINT "bitacora_agente_padre_chk" CHECK (("auditoria_id" IS NOT NULL) <> ("revision_tributaria_id" IS NOT NULL));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "corridas_agente_revision_idx" ON "corridas_agente" USING btree ("revision_tributaria_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "propuestas_agente_revision_estado_idx" ON "propuestas_agente" USING btree ("revision_tributaria_id","estado");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "propuestas_agente_revision_codigo_unq" ON "propuestas_agente" USING btree ("revision_tributaria_id","codigo");
