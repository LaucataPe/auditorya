-- Tributario v2: tipo del soporte (como las evidencias de papeles) y
-- hallazgos/recomendaciones por revisión con seguimiento post-firma.
ALTER TABLE "adjuntos_tributarios" ADD COLUMN IF NOT EXISTS "tipo" text DEFAULT 'otro' NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hallazgos_tributarios" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "revision_id" uuid NOT NULL REFERENCES "revisiones_tributarias"("id"),
  "descripcion" text NOT NULL,
  "criterio" text,
  "recomendacion" text,
  "monto" numeric(20,2),
  "severidad" text DEFAULT 'media' NOT NULL,
  "estado" text DEFAULT 'abierto' NOT NULL,
  "seguimiento" text,
  "resuelto_at" timestamp,
  "creado_por" uuid REFERENCES "usuarios"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL
);
