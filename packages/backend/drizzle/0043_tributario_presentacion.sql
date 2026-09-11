-- Fecha de presentación de la declaración. Se registra sobre una revisión ya
-- firmada (la presentación es posterior a la firma del revisor) y no altera el
-- snapshot sellado. Firmada + presentada es el cierre completo del período.
ALTER TABLE "revisiones_tributarias" ADD COLUMN IF NOT EXISTS "fecha_presentacion" date;
