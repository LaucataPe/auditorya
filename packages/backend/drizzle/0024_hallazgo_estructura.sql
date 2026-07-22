ALTER TABLE "hallazgos" ADD COLUMN IF NOT EXISTS "criterio" text;
--> statement-breakpoint
ALTER TABLE "hallazgos" ADD COLUMN IF NOT EXISTS "causa" text;
--> statement-breakpoint
ALTER TABLE "hallazgos" ADD COLUMN IF NOT EXISTS "efecto" text;
