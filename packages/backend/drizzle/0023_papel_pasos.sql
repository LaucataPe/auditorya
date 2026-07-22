ALTER TABLE "papeles_trabajo" ADD COLUMN IF NOT EXISTS "pasos_estado" jsonb DEFAULT '{}'::jsonb NOT NULL;
