-- Módulo tributario a nivel de empresa por año fiscal (vigencia).
-- Una obligación por impuesto × vigencia; una revisión por período con
-- checklist, cifras declarado vs. libros, adjuntos y firma con snapshot.
CREATE TABLE IF NOT EXISTS "obligaciones_tributarias" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "empresa_id" uuid NOT NULL REFERENCES "empresas"("id"),
  "anio_fiscal" integer NOT NULL,
  "tipo" text NOT NULL,
  "nombre" text,
  "periodicidad" text NOT NULL,
  "asignado_a" uuid REFERENCES "usuarios"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "obligaciones_trib_empresa_anio_idx" ON "obligaciones_tributarias" ("empresa_id","anio_fiscal");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "revisiones_tributarias" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "obligacion_id" uuid NOT NULL REFERENCES "obligaciones_tributarias"("id"),
  "periodo" text NOT NULL,
  "fecha_vencimiento" date,
  "estado" text DEFAULT 'pendiente' NOT NULL,
  "checklist_estado" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "valor_declarado" numeric(20,2),
  "valor_libros" numeric(20,2),
  "observaciones" text,
  "conclusion" text,
  "resultado" text,
  "revisado_por" uuid REFERENCES "usuarios"("id"),
  "revisado_at" timestamp,
  "snapshot" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "revisiones_trib_obligacion_periodo_uq" ON "revisiones_tributarias" ("obligacion_id","periodo");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "adjuntos_tributarios" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "revision_id" uuid NOT NULL REFERENCES "revisiones_tributarias"("id"),
  "nombre" text NOT NULL,
  "archivo_key" text NOT NULL,
  "archivo_nombre" text NOT NULL,
  "archivo_mime" text NOT NULL,
  "archivo_tamano" integer NOT NULL,
  "archivo_hash" text NOT NULL,
  "subido_por" uuid REFERENCES "usuarios"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL
);
