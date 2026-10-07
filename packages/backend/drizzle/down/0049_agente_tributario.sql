-- Reverso de 0049_agente_tributario. Las filas con revision_tributaria_id solo
-- existen gracias a esta migración: se borran para poder restaurar NOT NULL.
DROP INDEX IF EXISTS "propuestas_agente_revision_codigo_unq";--> statement-breakpoint
DROP INDEX IF EXISTS "propuestas_agente_revision_estado_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "corridas_agente_revision_idx";--> statement-breakpoint
ALTER TABLE "bitacora_agente" DROP CONSTRAINT IF EXISTS "bitacora_agente_padre_chk";--> statement-breakpoint
ALTER TABLE "propuestas_agente" DROP CONSTRAINT IF EXISTS "propuestas_agente_padre_chk";--> statement-breakpoint
ALTER TABLE "corridas_agente" DROP CONSTRAINT IF EXISTS "corridas_agente_padre_chk";--> statement-breakpoint
DELETE FROM "bitacora_agente" WHERE "revision_tributaria_id" IS NOT NULL;--> statement-breakpoint
DELETE FROM "propuestas_agente" WHERE "revision_tributaria_id" IS NOT NULL;--> statement-breakpoint
DELETE FROM "corridas_agente" WHERE "revision_tributaria_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "bitacora_agente" DROP CONSTRAINT IF EXISTS "bitacora_agente_revision_tributaria_id_fk";--> statement-breakpoint
ALTER TABLE "propuestas_agente" DROP CONSTRAINT IF EXISTS "propuestas_agente_revision_tributaria_id_fk";--> statement-breakpoint
ALTER TABLE "corridas_agente" DROP CONSTRAINT IF EXISTS "corridas_agente_revision_tributaria_id_fk";--> statement-breakpoint
ALTER TABLE "bitacora_agente" DROP COLUMN IF EXISTS "revision_tributaria_id";--> statement-breakpoint
ALTER TABLE "propuestas_agente" DROP COLUMN IF EXISTS "revision_tributaria_id";--> statement-breakpoint
ALTER TABLE "corridas_agente" DROP COLUMN IF EXISTS "revision_tributaria_id";--> statement-breakpoint
ALTER TABLE "bitacora_agente" ALTER COLUMN "auditoria_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "propuestas_agente" ALTER COLUMN "auditoria_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "corridas_agente" ALTER COLUMN "auditoria_id" SET NOT NULL;
