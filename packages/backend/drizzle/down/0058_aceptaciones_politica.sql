-- Reverso de 0058_aceptaciones_politica. ATENCIÓN: borra la prueba de aceptación; exportarla antes si ya hay registros.
DROP INDEX IF EXISTS "aceptaciones_politica_usuario_doc_version_unq";--> statement-breakpoint
DROP INDEX IF EXISTS "aceptaciones_politica_firma_idx";--> statement-breakpoint
DROP TABLE IF EXISTS "aceptaciones_politica";
