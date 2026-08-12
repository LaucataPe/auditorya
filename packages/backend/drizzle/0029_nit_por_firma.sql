-- P1 seguridad: la unicidad del NIT de empresas era GLOBAL, lo que impedía que dos
-- firmas registraran al mismo cliente y permitía enumerar la cartera ajena vía 409.
-- Pasa a ser única por firma.
ALTER TABLE "empresas" DROP CONSTRAINT IF EXISTS "empresas_nit_unique";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "empresas_firma_nit_unq" ON "empresas" ("firma_id","nit");
