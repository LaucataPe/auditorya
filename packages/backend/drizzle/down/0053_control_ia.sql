-- Reverso de 0053_control_ia: solo quita las dos columnas que creó la migración.
ALTER TABLE "empresas" DROP COLUMN IF EXISTS "ia_permitida";--> statement-breakpoint
ALTER TABLE "firmas" DROP COLUMN IF EXISTS "ia_habilitada";
