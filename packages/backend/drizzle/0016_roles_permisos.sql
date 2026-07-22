CREATE TABLE IF NOT EXISTS "roles_firma" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firma_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"nivel" text NOT NULL,
	"es_sistema" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rol_permisos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rol_id" uuid NOT NULL,
	"permiso" text NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "roles_firma" ADD CONSTRAINT "roles_firma_firma_id_firmas_id_fk" FOREIGN KEY ("firma_id") REFERENCES "firmas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rol_permisos" ADD CONSTRAINT "rol_permisos_rol_id_roles_firma_id_fk" FOREIGN KEY ("rol_id") REFERENCES "roles_firma"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "roles_firma_firma_nombre_unq" ON "roles_firma" ("firma_id","nombre");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rol_permisos_rol_permiso_unq" ON "rol_permisos" ("rol_id","permiso");
--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "rol_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_rol_id_roles_firma_id_fk" FOREIGN KEY ("rol_id") REFERENCES "roles_firma"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
-- Siembra de roles de sistema para las firmas existentes
INSERT INTO "roles_firma" ("firma_id", "nombre", "nivel", "es_sistema")
SELECT f."id", r."nombre", r."nivel", true
FROM "firmas" f
CROSS JOIN (VALUES
	('Socio', 'socio'),
	('Gerente', 'gerente'),
	('Senior', 'senior'),
	('Asistente', 'asistente')
) AS r("nombre", "nivel")
WHERE NOT EXISTS (
	SELECT 1 FROM "roles_firma" rf WHERE rf."firma_id" = f."id" AND rf."nivel" = r."nivel" AND rf."es_sistema" = true
);
--> statement-breakpoint
-- Siembra de permisos por rol de sistema (matriz por defecto = comportamiento actual)
INSERT INTO "rol_permisos" ("rol_id", "permiso")
SELECT rf."id", p."permiso"
FROM "roles_firma" rf
JOIN (VALUES
	('socio', 'firma.editar'),
	('socio', 'equipo.gestionar'),
	('socio', 'roles.gestionar'),
	('socio', 'empresa.crear'),
	('socio', 'empresa.editar'),
	('socio', 'empresa.evaluar'),
	('socio', 'encargo.crear'),
	('socio', 'encargo.planificar'),
	('socio', 'encargo.ejecutar'),
	('socio', 'materialidad.aprobar'),
	('socio', 'papel.aprobar'),
	('socio', 'informe.aprobar'),
	('socio', 'encargo.cerrar'),
	('gerente', 'equipo.gestionar'),
	('gerente', 'empresa.crear'),
	('gerente', 'empresa.editar'),
	('gerente', 'empresa.evaluar'),
	('gerente', 'encargo.crear'),
	('gerente', 'encargo.planificar'),
	('gerente', 'encargo.ejecutar'),
	('senior', 'empresa.crear'),
	('senior', 'empresa.editar'),
	('senior', 'empresa.evaluar'),
	('senior', 'encargo.crear'),
	('senior', 'encargo.planificar'),
	('senior', 'encargo.ejecutar'),
	('asistente', 'encargo.planificar'),
	('asistente', 'encargo.ejecutar')
) AS p("nivel", "permiso") ON p."nivel" = rf."nivel"
WHERE rf."es_sistema" = true
  AND NOT EXISTS (
	SELECT 1 FROM "rol_permisos" rp WHERE rp."rol_id" = rf."id" AND rp."permiso" = p."permiso"
  );
--> statement-breakpoint
-- Backfill: asignar a cada usuario el rol de sistema que corresponde a su nivel
UPDATE "usuarios" u
SET "rol_id" = rf."id"
FROM "roles_firma" rf
WHERE rf."firma_id" = u."firma_id"
  AND rf."nivel" = u."rol"
  AND rf."es_sistema" = true
  AND u."rol_id" IS NULL;
