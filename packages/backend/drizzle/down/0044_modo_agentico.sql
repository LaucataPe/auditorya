-- Reverso de 0044_modo_agentico. Solo toca lo que esa migración creó.
-- ADVERTENCIA: borra las tablas del agente con su contenido (propuestas, bitácora, corridas, costos, seudónimos).
DROP TABLE IF EXISTS "bitacora_agente";--> statement-breakpoint
DROP TABLE IF EXISTS "propuestas_agente";--> statement-breakpoint
DROP TABLE IF EXISTS "corridas_agente";--> statement-breakpoint
DROP TABLE IF EXISTS "llm_llamadas";--> statement-breakpoint
DROP TABLE IF EXISTS "seudonimos";--> statement-breakpoint
ALTER TABLE "eventos" DROP COLUMN IF EXISTS "actor";--> statement-breakpoint
ALTER TABLE "auditorias" DROP COLUMN IF EXISTS "agente_activado";--> statement-breakpoint
ALTER TABLE "firmas" DROP COLUMN IF EXISTS "agente_habilitado";
