-- Impuestos municipales (reteICA, ICA): la obligación es por municipio, y una
-- empresa puede tener varias del mismo impuesto en la vigencia (Bogotá, Cali…).
-- Clave de la tabla de municipios de @auditorya/types o el nombre escrito.
ALTER TABLE "obligaciones_tributarias" ADD COLUMN "municipio" text;
