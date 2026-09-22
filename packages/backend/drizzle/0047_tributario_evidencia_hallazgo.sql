-- Evidencia por hallazgo: el soporte se asocia opcionalmente a un hallazgo de
-- la misma revisión. Con hallazgo_id nulo sigue siendo un soporte de la
-- revisión (declaración, pago, conciliación), como hasta ahora.
ALTER TABLE "adjuntos_tributarios" ADD COLUMN IF NOT EXISTS "hallazgo_id" uuid REFERENCES "hallazgos_tributarios"("id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "adjuntos_trib_hallazgo_idx" ON "adjuntos_tributarios" ("hallazgo_id");
