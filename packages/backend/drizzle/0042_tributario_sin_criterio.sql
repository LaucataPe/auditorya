-- El hallazgo tributario se documenta como situación encontrada +
-- recomendación; el criterio como campo aparte se retira (la norma aplicable se
-- cita dentro del texto). No afecta constancias selladas: el snapshot de las
-- revisiones firmadas conserva su propia copia del hallazgo.
ALTER TABLE "hallazgos_tributarios" DROP COLUMN IF EXISTS "criterio";
