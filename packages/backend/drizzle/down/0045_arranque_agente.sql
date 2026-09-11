-- Reverso de 0045_arranque_agente.
DROP TABLE IF EXISTS "memoria_empresa_agente";--> statement-breakpoint
ALTER TABLE "auditorias" DROP COLUMN IF EXISTS "arranque_completado_at";
