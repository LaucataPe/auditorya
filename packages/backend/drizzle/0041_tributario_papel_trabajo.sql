-- Encabezado del papel de trabajo de la revisión tributaria (NIA 230):
-- alcance y procedimientos aplicados. Texto libre; null = aún sin editar (se
-- muestra el borrador sugerido de types y se materializa al firmar).
ALTER TABLE "revisiones_tributarias" ADD COLUMN IF NOT EXISTS "alcance" text;
ALTER TABLE "revisiones_tributarias" ADD COLUMN IF NOT EXISTS "procedimientos" text;
