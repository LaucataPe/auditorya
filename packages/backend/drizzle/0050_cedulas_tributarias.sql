-- Conclusión del auditor por cédula (procedimiento) de la revisión tributaria
-- agéntica. Clave = id de la cédula; valor = { texto, resultado, huella,
-- corridaId, porId, porNombre, at }. Las cédulas viven en el resultado de la
-- corrida del agente; aquí solo lo que escribe y firma una persona.
ALTER TABLE "revisiones_tributarias" ADD COLUMN "conclusiones_cedulas" jsonb DEFAULT '{}'::jsonb NOT NULL;
