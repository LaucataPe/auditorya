-- Control de IA por firma y por cliente. Solo aditivo: dos columnas NOT NULL con DEFAULT true
-- (el comportamiento actual no cambia hasta que alguien apague el interruptor).
-- Reverso en drizzle/down/0053_control_ia.sql.
ALTER TABLE "firmas" ADD COLUMN IF NOT EXISTS "ia_habilitada" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN IF NOT EXISTS "ia_permitida" boolean DEFAULT true NOT NULL;
