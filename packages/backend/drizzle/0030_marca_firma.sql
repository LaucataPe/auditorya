-- Identidad de marca de la firma para los documentos exportados (PDF/Word):
-- color de acento y logo del membrete (data URI reducido en el cliente).
ALTER TABLE "firmas" ADD COLUMN IF NOT EXISTS "color_marca" text;--> statement-breakpoint
ALTER TABLE "firmas" ADD COLUMN IF NOT EXISTS "logo" text;
