ALTER TABLE "papeles_trabajo" ADD COLUMN IF NOT EXISTS "riesgo_id" uuid;--> statement-breakpoint
ALTER TABLE "tareas" ADD COLUMN IF NOT EXISTS "riesgo_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "papeles_trabajo" ADD CONSTRAINT "papeles_trabajo_riesgo_id_riesgos_id_fk" FOREIGN KEY ("riesgo_id") REFERENCES "public"."riesgos"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tareas" ADD CONSTRAINT "tareas_riesgo_id_riesgos_id_fk" FOREIGN KEY ("riesgo_id") REFERENCES "public"."riesgos"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
