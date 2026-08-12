-- P0 integridad: pista de auditoría inmutable + snapshots de papeles aprobados.
-- 1) La pista de auditoría debe sobrevivir al borrado del encargo: se elimina la FK
--    eventos.auditoria_id → auditorias.id (la columna queda como referencia histórica).
ALTER TABLE "eventos" DROP CONSTRAINT IF EXISTS "eventos_auditoria_id_auditorias_id_fk";--> statement-breakpoint
-- 2) Snapshot inmutable del papel de trabajo (y su evidencia) en el momento de la
--    aprobación del socio (NIA 230): reabrir y editar ya no destruye el rastro.
CREATE TABLE IF NOT EXISTS "papeles_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"papel_trabajo_id" uuid NOT NULL,
	"auditoria_id" uuid NOT NULL,
	"contenido" jsonb NOT NULL,
	"aprobado_por" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "papeles_snapshots" ADD CONSTRAINT "papeles_snapshots_papel_trabajo_id_papeles_trabajo_id_fk" FOREIGN KEY ("papel_trabajo_id") REFERENCES "public"."papeles_trabajo"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "papeles_snapshots" ADD CONSTRAINT "papeles_snapshots_auditoria_id_auditorias_id_fk" FOREIGN KEY ("auditoria_id") REFERENCES "public"."auditorias"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "papeles_snapshots" ADD CONSTRAINT "papeles_snapshots_aprobado_por_usuarios_id_fk" FOREIGN KEY ("aprobado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "papeles_snapshots_papel_idx" ON "papeles_snapshots" ("papel_trabajo_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "papeles_snapshots_auditoria_idx" ON "papeles_snapshots" ("auditoria_id");
