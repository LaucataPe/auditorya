CREATE TABLE IF NOT EXISTS "permisos" (
	"clave" text PRIMARY KEY NOT NULL,
	"grupo" text NOT NULL,
	"label" text NOT NULL,
	"descripcion" text DEFAULT '' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "permisos" ("clave", "grupo", "label", "descripcion", "orden") VALUES
	('firma.editar', 'Firma', 'Editar la firma', 'Modificar razón social, NIT y ciudad de la firma.', 0),
	('equipo.gestionar', 'Firma', 'Gestionar el equipo', 'Crear, editar y eliminar miembros del equipo.', 1),
	('roles.gestionar', 'Firma', 'Gestionar roles', 'Crear roles y asignar permisos.', 2),
	('empresa.crear', 'Clientes', 'Registrar clientes', 'Crear nuevas empresas cliente.', 3),
	('empresa.editar', 'Clientes', 'Editar clientes', 'Modificar la información de los clientes.', 4),
	('empresa.evaluar', 'Clientes', 'Evaluar aceptación', 'Realizar la evaluación de aceptación del encargo.', 5),
	('encargo.crear', 'Encargos', 'Crear encargos', 'Iniciar nuevos encargos de auditoría.', 6),
	('encargo.planificar', 'Encargos', 'Planificar', 'Materialidad, riesgos, control interno y papeles de planeación.', 7),
	('encargo.ejecutar', 'Encargos', 'Ejecutar', 'Pruebas, papeles de trabajo, PBC y evidencia.', 8),
	('materialidad.aprobar', 'Aprobaciones', 'Aprobar materialidad', 'Aprobar la materialidad y habilitar la ejecución.', 9),
	('papel.aprobar', 'Aprobaciones', 'Aprobar papeles', 'Aprobar y reabrir papeles de trabajo.', 10),
	('informe.aprobar', 'Aprobaciones', 'Aprobar informes', 'Aprobar y reabrir informes y el dictamen.', 11),
	('encargo.cerrar', 'Aprobaciones', 'Cerrar el encargo', 'Cerrar y reabrir el encargo de auditoría.', 12)
ON CONFLICT ("clave") DO NOTHING;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rol_permisos" ADD CONSTRAINT "rol_permisos_permiso_permisos_clave_fk" FOREIGN KEY ("permiso") REFERENCES "permisos"("clave") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
