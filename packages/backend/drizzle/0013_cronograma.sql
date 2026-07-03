ALTER TABLE "tareas" ADD COLUMN IF NOT EXISTS "fecha_inicio" timestamp;--> statement-breakpoint
ALTER TABLE "papeles_trabajo" ADD COLUMN IF NOT EXISTS "fecha_inicio" timestamp;--> statement-breakpoint
ALTER TABLE "papeles_trabajo" ADD COLUMN IF NOT EXISTS "fecha_fin" timestamp;--> statement-breakpoint
ALTER TABLE "papeles_trabajo" ADD COLUMN IF NOT EXISTS "asignado_a" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "papeles_trabajo" ADD CONSTRAINT "papeles_trabajo_asignado_a_usuarios_id_fk" FOREIGN KEY ("asignado_a") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
