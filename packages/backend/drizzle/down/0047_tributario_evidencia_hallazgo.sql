-- Reverso de 0047_tributario_evidencia_hallazgo.
DROP INDEX IF EXISTS "adjuntos_trib_hallazgo_idx";--> statement-breakpoint
ALTER TABLE "adjuntos_tributarios" DROP COLUMN IF EXISTS "hallazgo_id";
