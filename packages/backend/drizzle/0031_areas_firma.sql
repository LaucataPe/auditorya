-- Ciclos/áreas propios por firma. Complementan el catálogo base fijo (AREAS_BASE en
-- @auditorya/types); la clave convive con las claves base en las columnas `area` de
-- riesgos, papeles_trabajo, tareas y hallazgos (que son texto sin constraint).
CREATE TABLE IF NOT EXISTS "areas_firma" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "firma_id" uuid NOT NULL REFERENCES "firmas"("id"),
  "clave" text NOT NULL,
  "nombre" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "areas_firma_firma_clave_unq" ON "areas_firma" ("firma_id","clave");
