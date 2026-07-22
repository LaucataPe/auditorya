-- auditorias: periodo (texto) → fecha_inicio / fecha_fin (date).
-- Backfill: toma el primer año de 4 dígitos que aparezca en `periodo`
-- (p. ej. "2024" o "2024-2025") y arma el año calendario; si no hay año
-- reconocible, usa el año de created_at.
ALTER TABLE "auditorias" ADD COLUMN IF NOT EXISTS "fecha_inicio" date;--> statement-breakpoint
ALTER TABLE "auditorias" ADD COLUMN IF NOT EXISTS "fecha_fin" date;--> statement-breakpoint
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'auditorias' AND column_name = 'periodo') THEN
  UPDATE "auditorias" SET
   "fecha_inicio" = make_date(COALESCE(substring("periodo" from '[0-9]{4}')::int, extract(year from "created_at")::int), 1, 1),
   "fecha_fin" = make_date(COALESCE(substring("periodo" from '[0-9]{4}')::int, extract(year from "created_at")::int), 12, 31)
  WHERE "fecha_inicio" IS NULL;
  ALTER TABLE "auditorias" DROP COLUMN "periodo";
 END IF;
END $$;
--> statement-breakpoint
UPDATE "auditorias" SET
 "fecha_inicio" = make_date(extract(year from "created_at")::int, 1, 1),
 "fecha_fin" = make_date(extract(year from "created_at")::int, 12, 31)
WHERE "fecha_inicio" IS NULL OR "fecha_fin" IS NULL;--> statement-breakpoint
ALTER TABLE "auditorias" ALTER COLUMN "fecha_inicio" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "auditorias" ALTER COLUMN "fecha_fin" SET NOT NULL;
