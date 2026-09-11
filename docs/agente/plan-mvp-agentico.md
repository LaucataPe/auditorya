# Plan MVP · Modo agéntico de AuditorYa

Fecha: 2026-09-11. Estado: acordado en conversación, pendiente de insumos (ver §5).

## 1. Decisiones tomadas

- El agente **acompaña el flujo que ya existe** (rail Planificación → Ejecución → Informes). No hay vista
  paralela ni "modo clásico" que retirar: clásico = agente apagado.
- Mecanismo único: el agente produce **propuestas**; el humano aprueba, ajusta u omite. Al aprobar, se
  escribe en la tabla que ya existe para ese paso (materialidades, hallazgos, papeles, riesgos…).
- Vista de trabajo = variante **A "una decisión a la vez"**: contadores "Te toca / Hecho" en la cabecera,
  rail con estado del agente por paso, una tarjeta al frente con bitácora plegada y tres acciones.
  El panel "El agente ahora" (variante B) se abre a un clic. La variante C queda fuera: la cubre la
  actividad del encargo que ya existe.
- Motor determinista en **TypeScript** dentro del monorepo (reutiliza `validarBalance`,
  `detectarBanderas`, `calcularRatios`). Sin servicio Python.
- Autonomía: solo nivel "reviso todo" en el MVP.
- Restricción dura intacta: cambios aditivos, nada se borra, rutas actuales no cambian, rollback probado.
- Procedimiento de referencia: `docs/agente/procedimiento-validacion-balance-v1.md`.

## 2. Alcance del MVP

**Sí**
- Bandera por firma y por encargo. Se puede activar sobre encargos existentes (el agente solo propone).
- Paso **Balance**: corrida del motor V-xx al importar el balance → hallazgos con bitácora, severidad,
  certeza y monto. Limitaciones de la corrida. Partidas triviales agrupadas.
- Paso **Materialidad**: propuesta calculada con justificación; el socio confirma o cambia el valor.
- Paso **Documentos**: ítems de atención tipo documento y juicio, cada uno con el hallazgo que desbloquea.
  Al subir el archivo se adjunta como evidencia del papel automático.
- Aprobar un hallazgo lo escribe en `hallazgos` (tabla actual) ligado a un papel de trabajo automático
  "Validación del balance de prueba" con índice NIA 230; alimenta cartas, ajustes y guía sin cambios.
- LLM solo para dos cosas: redactar descripción y recomendación del hallazgo sobre los datos del motor, y
  responder "Preguntar sobre este hallazgo" citando la bitácora. Con seudonimización y costos por llamada.
- Cabecera con contadores, rail con estado del agente, vista A en los tres pasos cubiertos. Los demás
  pasos se ven exactamente como hoy.

**No (fase 2)**
- Entendimiento desde RUT/cámara. Riesgos y pruebas derivados. Reprocesamiento al llegar un documento.
  Lectura de PDFs de evidencia. Niveles de autonomía 2 y 3. Memoria de descartes por empresa (se guarda el
  motivo desde el MVP, pero todavía no ajusta severidad).

## 3. Etapas (cada una desplegable y sin efecto para quien no tenga la bandera)

| # | Etapa | Entrega | Verificación |
|---|---|---|---|
| 0 | Base segura | Commit del módulo tributario pendiente. Convención `drizzle/down/00XX.sql` + script `db:rollback`. Ensayo restaurar → migrate → rollback → migrate sobre copia de producción. Fixtures: balances reales de la usuaria, anonimizados en local. | Rollback ensayado y documentado. |
| 1 | Banderas y tablas aditivas | `firmas.agente_habilitado`, `auditorias.agente_activado`, `eventos.actor`. Tablas nuevas: `corridas_agente`, `propuestas_agente`, `bitacora_agente`, `atencion_items`, `llm_llamadas`, `seudonimos`, `naturaleza_puc`. Toggle en superadmin y en el encargo. | Encargo con agente apagado idéntico a hoy. |
| 2 | Cliente LLM seguro | Middleware de seudonimización dentro de la única función de llamada. Captura de `usage`, costo y duración. Modelo económico / fuerte por variable de entorno. Caché de prompt del corpus normativo. | Las funciones de IA actuales siguen funcionando y ya no envían nombre ni NIT. |
| 3 | Motor de balance | Paquete `motor` con P-xx y V-xx, IDs estables, salida JSON, pruebas con los fixtures. Worker en el backend con máximo 3 reintentos. `POST /auditorias/:id/agente/corridas` + `GET`. Materialidad preliminar. | Lista cruda de hallazgos sobre los balances reales, revisada con la usuaria antes de hacer UI. |
| 4 | Vista A | Cabecera con contadores, estado del agente en el rail, tarjeta de decisión con bitácora, panel "El agente ahora", ítems de atención en Documentos, propuesta en Materialidad. | Subir balance → hallazgos visibles en minutos. |
| 5 | Aceptación y papel | Aprobar → `hallazgos` + papel automático + evidencia al recibir documento. Redacción y "Preguntar" con LLM. Eventos y notificaciones. | Hallazgo aprobado aparece en la carta de recomendaciones existente. |
| 6 | Piloto en paralelo | Un encargo real corrido por los dos caminos. Media hora semanal de calibración de reglas y umbrales. | Criterios de §4. |

## 4. Criterios de éxito del MVP

- Del balance subido al primer hallazgo visible: menos de 5 minutos.
- Falsos positivos según la usuaria: menos del 30 % tras tres corridas de calibración.
- Costo LLM por corrida de balance: menos de USD 2.
- Ningún cambio visible ni de comportamiento con el agente apagado. Cero pérdida de datos.
- Un hallazgo aprobado por el agente llega a la carta de recomendaciones sin trabajo manual extra.

## 5. Insumos pendientes de la usuaria

1. Producción: ¿el módulo tributario (migraciones 0035–0043) ya está aplicado? ¿Dump de la base para ensayar?
2. ¿Hay Redis en EasyPanel? Si no, el worker corre en memoria en el mismo proceso del backend.
3. Cuenta de OpenRouter con recolección de datos desactivada. Modelos: por defecto uno económico para
   extracción y el actual `anthropic/claude-sonnet-4.5` para redacción; se cambian por variable de entorno.
4. Tres a cinco balances .xlsx reales, y las cinco preguntas de calibración del procedimiento (§11).
5. Catálogo de naturaleza PUC: portar el seeder de contabilidadya y que la usuaria lo revise.
6. Confirmaciones: activar sobre encargos existentes (recomendado sí); agente activado por defecto en
   encargos nuevos de la firma (recomendado sí); solo nivel "reviso todo" (sí).

## 6. Cómo empezamos

1. La usuaria responde §5 y comparte los balances.
2. Etapas 0 y 1: las migraciones se muestran para revisión antes de aplicarlas; nada visible cambia.
3. Etapa 3 antes que la UI: se corre el motor sobre los balances reales y se revisa la lista cruda de
   hallazgos con la usuaria. Ahí se calibran reglas y umbrales barato.
4. Etapas 2, 4 y 5. Luego el piloto en paralelo.
