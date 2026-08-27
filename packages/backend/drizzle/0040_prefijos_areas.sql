-- Overrides globales (superadmin) de los prefijos de referenciación del catálogo
-- base de áreas. Sin fila = se usa el prefijo por defecto de AREAS_BASE (types).
-- Cambiarlos solo afecta papeles nuevos: los índices existentes no se renumeran.
CREATE TABLE IF NOT EXISTS "prefijos_areas" (
  "clave" text PRIMARY KEY,
  "prefijo" text NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
