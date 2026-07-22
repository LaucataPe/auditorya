ALTER TABLE "tareas" ADD COLUMN IF NOT EXISTS "papel_trabajo_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tareas" ADD CONSTRAINT "tareas_papel_trabajo_id_papeles_trabajo_id_fk" FOREIGN KEY ("papel_trabajo_id") REFERENCES "public"."papeles_trabajo"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
