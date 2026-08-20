-- Tipografía del cuerpo (párrafos) de los documentos exportados (PDF/Word),
-- configurable por firma junto a la de titulares. Null → defecto (Georgia).
ALTER TABLE "firmas" ADD COLUMN IF NOT EXISTS "fuente_cuerpo" text;
