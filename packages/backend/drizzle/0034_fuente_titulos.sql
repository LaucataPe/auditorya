-- Tipografía de titulares de los documentos exportados (PDF/Word), configurable
-- por firma como parte de su identidad de marca. Null → fuente por defecto (Arial).
ALTER TABLE "firmas" ADD COLUMN IF NOT EXISTS "fuente_titulos" text;
