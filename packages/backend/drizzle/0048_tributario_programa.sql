-- Programa de trabajo dinámico de la revisión guiada: pasos del agente que el
-- auditor activa o desactiva y pasos propios que agrega. jsonb nullable
-- (null = aún no definido). Al guardarse se materializa también como texto en
-- `procedimientos`, así el informe y la constancia no dependen de esta columna.
ALTER TABLE "revisiones_tributarias" ADD COLUMN IF NOT EXISTS "programa" jsonb;
