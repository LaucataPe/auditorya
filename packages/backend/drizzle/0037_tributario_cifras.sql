-- Cifras del período como mini-formulario espejo del formulario oficial:
-- jsonb {renglonId: {declarado, libros}} según CIFRAS_CATALOGO de types.
ALTER TABLE "revisiones_tributarias" ADD COLUMN IF NOT EXISTS "cifras" jsonb DEFAULT '{}'::jsonb NOT NULL;
