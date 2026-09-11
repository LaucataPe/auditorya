-- Modo agéntico · etapa 1: banderas y tablas ADITIVAS. Nada existente cambia de
-- forma ni de significado; un encargo con agente_activado=false se comporta igual
-- que antes. Reverso en drizzle/down/0044_modo_agentico.sql.
ALTER TABLE "firmas" ADD COLUMN IF NOT EXISTS "agente_habilitado" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "auditorias" ADD COLUMN IF NOT EXISTS "agente_activado" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN IF NOT EXISTS "actor" text DEFAULT 'usuario' NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "corridas_agente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auditoria_id" uuid NOT NULL,
	"procedimiento" text NOT NULL,
	"estado" text DEFAULT 'en_cola' NOT NULL,
	"archivo_nombre" text,
	"archivo_hash" text,
	"filas" integer,
	"filas_hoja" integer,
	"filas_resumen" integer,
	"parametros" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resultado" jsonb,
	"intentos" integer DEFAULT 0 NOT NULL,
	"error" text,
	"iniciada_por" uuid NOT NULL,
	"iniciada_at" timestamp,
	"terminada_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "propuestas_agente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auditoria_id" uuid NOT NULL,
	"corrida_id" uuid,
	"paso" text NOT NULL,
	"tipo" text NOT NULL,
	"codigo" text,
	"titulo" text NOT NULL,
	"cuenta_codigo" text,
	"monto" numeric(20, 2),
	"severidad" text,
	"certeza" text,
	"reglas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"datos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"contenido" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"estado" text DEFAULT 'propuesta' NOT NULL,
	"desbloquea_id" uuid,
	"entidad_destino" text,
	"entidad_destino_id" uuid,
	"decidida_por" uuid,
	"decidida_at" timestamp,
	"motivo_decision" text,
	"orden" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bitacora_agente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auditoria_id" uuid NOT NULL,
	"propuesta_id" uuid,
	"corrida_id" uuid,
	"numero" integer NOT NULL,
	"tipo" text NOT NULL,
	"texto" text NOT NULL,
	"referencia" jsonb,
	"actor" text DEFAULT 'agente' NOT NULL,
	"usuario_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "llm_llamadas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firma_id" uuid NOT NULL,
	"auditoria_id" uuid,
	"propuesta_id" uuid,
	"proposito" text NOT NULL,
	"modelo" text NOT NULL,
	"tokens_entrada" integer DEFAULT 0 NOT NULL,
	"tokens_cache" integer DEFAULT 0 NOT NULL,
	"tokens_salida" integer DEFAULT 0 NOT NULL,
	"costo_usd" numeric(12, 6),
	"duracion_ms" integer,
	"exito" boolean DEFAULT true NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "seudonimos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"firma_id" uuid NOT NULL,
	"empresa_id" uuid,
	"tipo" text NOT NULL,
	"token" text NOT NULL,
	"valor" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "corridas_agente" ADD CONSTRAINT "corridas_agente_auditoria_id_auditorias_id_fk" FOREIGN KEY ("auditoria_id") REFERENCES "public"."auditorias"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "corridas_agente" ADD CONSTRAINT "corridas_agente_iniciada_por_usuarios_id_fk" FOREIGN KEY ("iniciada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "propuestas_agente" ADD CONSTRAINT "propuestas_agente_auditoria_id_auditorias_id_fk" FOREIGN KEY ("auditoria_id") REFERENCES "public"."auditorias"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "propuestas_agente" ADD CONSTRAINT "propuestas_agente_corrida_id_corridas_agente_id_fk" FOREIGN KEY ("corrida_id") REFERENCES "public"."corridas_agente"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "propuestas_agente" ADD CONSTRAINT "propuestas_agente_desbloquea_id_propuestas_agente_id_fk" FOREIGN KEY ("desbloquea_id") REFERENCES "public"."propuestas_agente"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "propuestas_agente" ADD CONSTRAINT "propuestas_agente_decidida_por_usuarios_id_fk" FOREIGN KEY ("decidida_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bitacora_agente" ADD CONSTRAINT "bitacora_agente_auditoria_id_auditorias_id_fk" FOREIGN KEY ("auditoria_id") REFERENCES "public"."auditorias"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bitacora_agente" ADD CONSTRAINT "bitacora_agente_propuesta_id_propuestas_agente_id_fk" FOREIGN KEY ("propuesta_id") REFERENCES "public"."propuestas_agente"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bitacora_agente" ADD CONSTRAINT "bitacora_agente_corrida_id_corridas_agente_id_fk" FOREIGN KEY ("corrida_id") REFERENCES "public"."corridas_agente"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bitacora_agente" ADD CONSTRAINT "bitacora_agente_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "llm_llamadas" ADD CONSTRAINT "llm_llamadas_firma_id_firmas_id_fk" FOREIGN KEY ("firma_id") REFERENCES "public"."firmas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "seudonimos" ADD CONSTRAINT "seudonimos_firma_id_firmas_id_fk" FOREIGN KEY ("firma_id") REFERENCES "public"."firmas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "seudonimos" ADD CONSTRAINT "seudonimos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "corridas_agente_auditoria_idx" ON "corridas_agente" ("auditoria_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "propuestas_agente_auditoria_estado_idx" ON "propuestas_agente" ("auditoria_id", "estado");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "propuestas_agente_auditoria_codigo_unq" ON "propuestas_agente" ("auditoria_id", "codigo");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bitacora_agente_propuesta_idx" ON "bitacora_agente" ("propuesta_id", "numero");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bitacora_agente_corrida_idx" ON "bitacora_agente" ("corrida_id", "numero");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llm_llamadas_firma_idx" ON "llm_llamadas" ("firma_id", "created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "seudonimos_firma_token_unq" ON "seudonimos" ("firma_id", "token");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "seudonimos_firma_tipo_valor_unq" ON "seudonimos" ("firma_id", "tipo", "valor");
