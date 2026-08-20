-- Notificaciones in-app del equipo (asignaciones, revisión de papeles, notas).
-- auditoria_id y papel_trabajo_id sin FK a propósito (igual que eventos): el
-- aviso sobrevive al borrado de la entidad a la que apunta.
CREATE TABLE IF NOT EXISTS "notificaciones" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firma_id" uuid NOT NULL REFERENCES "firmas"("id"),
  "usuario_id" uuid NOT NULL REFERENCES "usuarios"("id"),
  "tipo" text NOT NULL,
  "mensaje" text NOT NULL,
  "empresa_id" uuid REFERENCES "empresas"("id"),
  "auditoria_id" uuid,
  "papel_trabajo_id" uuid,
  "leida_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notificaciones_usuario_idx" ON "notificaciones" ("usuario_id","leida_at");
