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
- Aprobar un hallazgo lo escribe en `hallazgos` (tabla actual) dentro del **papel de trabajo de su ciclo**
  (área por cuenta PUC; se reutiliza el papel abierto del área, preferiblemente el que atiende el riesgo que salió
  del mismo hallazgo, o se crea "Revisión de <área>" con índice NIA 230 y el programa estándar del área como
  procedimiento). Decidido con la usuaria el 2026-09-16: nunca un papel único "Validación del balance". Los
  hallazgos de integridad del archivo (sin cuenta) no van a ningún papel. Si la materialidad aún no está aprobada,
  el hallazgo queda aprobado y se escribe cuando el socio la apruebe (por el agente o por la ruta clásica).
  Aprobar un documento pedido = "Pedir al cliente": crea la solicitud PBC en el papel del área del hallazgo que
  desbloquea; al recibirla, la evidencia queda en ese papel y el agente anota en la propuesta y en el hallazgo
  que llegó el soporte (todavía no lee archivos: la conclusión es del auditor).
- LLM solo para dos cosas: redactar descripción y recomendación del hallazgo sobre los datos del motor, y
  responder "Preguntar sobre este hallazgo" citando la bitácora. Con seudonimización y costos por llamada.
- Paso **Riesgos** (añadido 2026-09-15): procedimiento determinista R-xx (`packages/types/src/agente-riesgos.ts`).
  R-01 hallazgos del balance aprobados → un riesgo por área del PUC (inherente = mayor severidad, certeza
  heredada, respuesta planeada del programa estándar del área); R-02 riesgo de control base desde COSO (medio
  si no hay); R-03 señales de los cambios del año del entendimiento → riesgos por área y control alto si cambió
  el sistema o el equipo contable; R-10 catálogo del sector solo en áreas sin riesgo. Se propone solo al
  decidir la materialidad y se recalcula con cada hallazgo del balance decidido (lo decidido se conserva; las
  propuestas abiertas idénticas conservan su código). Aprobar escribe en `riesgos` (origen `analitico` si viene
  del balance, `sugerido` si no) y desde ahí sigue el hilo riesgo → prueba → PBC de siempre.
- Paso **Control interno** (añadido 2026-09-15): cuestionario pyme de 15 preguntas (`CUESTIONARIO_COSO_PYME` en
  `packages/types/src/agente-control-interno.ts`), una a la vez, con la respuesta del año anterior como punto de
  partida (memoria por empresa, clave `coso_respuestas`). Puntaje determinista por componente (≥80 % efectivo,
  ≥50 % con deficiencias; un "no" en control clave deja al menos "con deficiencias"), acotado por señales del
  balance aprobado y del entendimiento (CI-01..CI-07). Cada "no" es una deficiencia (texto listo para la carta
  NIA 265) y sube el riesgo de control del área que toca, que la corrida de riesgos usa por área. "No sé todavía"
  pide el documento que lo confirma. Aprobar escribe en `controles_coso`; "Aprobar las 5" de un clic.
- Cabecera con contadores, rail con estado del agente, vista A en los pasos cubiertos. Los demás
  pasos se ven exactamente como hoy.

**No (fase 2)**
- Entendimiento desde RUT/cámara. Pruebas derivadas automáticamente. Reprocesamiento al llegar un documento.
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
| 4b | Riesgos (hecho 2026-09-15) | Motor R-xx, `POST /auditorias/:id/agente/corridas/riesgos`, disparo automático al decidir materialidad y hallazgos, tarjeta con área / inherente / control / respuesta ajustables, escritura en `riesgos`. | Aprobar un riesgo propuesto lo deja en la matriz con su respuesta planeada. |
| 4c | Control interno (hecho 2026-09-15) | Migración 0046 (`respuestas_coso_agente`), motor CI-xx, `GET/PUT …/agente/control-interno`, `POST …/corridas/control-interno`, `CuestionarioCoso.tsx`, tarjeta con respuestas, deficiencias y cambio de calificación en un clic. | Responder el cuestionario → 5 calificaciones propuestas → aprobar deja la evaluación COSO hecha. |
| 4d | Hallazgos y documentos a las tablas reales (hecho 2026-09-16) | `lib/agente/materializar.ts`: hallazgo aprobado → `hallazgos` + papel del ciclo; documento aprobado → `solicitudes_pbc`; recepción PBC → bitácora en propuesta y hallazgo; materialidad aprobada → escribe los hallazgos que esperaban. | Aprobar H-03 (1380) crea D-1 "Revisión de cuentas por cobrar" con el hallazgo; el auxiliar pedido llega como evidencia a D-1. |
| 4e | Riesgos → pruebas y COSO → carta 265 (hecho 2026-09-17) | Aprobar un riesgo crea la prueba de su respuesta planeada como papel del área (programa estándar, aserciones, pasos y PBC de la prueba). Aprobar un componente COSO escribe cada deficiencia con área como hallazgo tipo `deficiencia` en el papel del área, que la carta de control interno lista con Ref.; las sin área van en las observaciones del componente. Todo lo que espera materialidad se escribe al aprobarla (`materializarPendientes`). | Aprobar R-01 (ingresos) crea X-1 "Pruebas de corte de ingresos" con 2 PBC; aprobar Actividades de control con ACT-1/ACT-2 en "no" crea B-1 con dos deficiencias que salen en la carta con Ref. B-1. |
| 4f | Ejecución por ciclo (hecho 2026-09-17) | `lib/agente/ciclos.ts`: `GET …/agente/ciclos` (ciclos con estado listo / decidir / sin_iniciar / esperando / terminado, ordenados por lo que ya se puede hacer; el agente sugiere el primero y el auditor entra al que quiera), `GET …/ciclos/:area` (acciones sugeridas, papeles con pasos, evidencias, PBC, riesgos, hallazgos y propuestas pendientes), `POST …/ciclos/:area/iniciar` (riesgo desde señales del balance, catálogo del sector o programa estándar + prueba), `POST …/agente/papeles/:id/conclusion` (borrador determinista de la conclusión como propuesta CL-xx; aprobar la escribe en el papel). Frontend `CiclosAgente.tsx` en el paso Papeles del rail. | Con solo el balance, un ciclo sugiere crear riesgo y prueba; con los pasos marcados pide la conclusión; al recibir evidencia el ciclo sube al frente. |
| 4g | Riesgos por ciclo (hecho 2026-09-17) | `GET …/agente/riesgos-por-ciclo` (propuestas pendientes, omitidas, matriz con sus pruebas y catálogo del sector por ciclo), `POST …/agente/riesgos/:id/prueba`; `RiesgosPorCiclo.tsx` reemplaza la tarjeta única en el paso Riesgos: marcas los que cubres → se aprueban y crean su prueba; los no marcados quedan como propuesta omitida (no entran a la matriz ni al archivo, decisión de la usuaria); riesgo en matriz sin prueba → "Crear prueba" o "Responder sin prueba" (respuesta planeada). | Cubrir 2 de 7 en ingresos deja 2 en la matriz con X-1/X-2 y 5 omitidos retomables. |
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

## 7. Estado al 2026-09-18 y siguientes pasos

### 7.1 Qué hace el agente hoy (todo a cero tokens; sin llamadas al LLM todavía)

| Fase | Con agente | Sigue manual |
|---|---|---|
| Arranque | Bienvenida → empresa → balance → revisión en vivo → primer resultado. | — |
| Entendimiento | Lo usa como insumo (R-03, CI-xx). | Se llena a mano; no se propone desde RUT/cámara (fase 2). |
| Balance | Motor V-xx → hallazgos y documentos con bitácora. Aprobar escribe en `hallazgos` dentro del papel del ciclo; "Pedir al cliente" crea la PBC; recibirla anota en propuesta y hallazgo. | Calibración con balances reales; redacción del hallazgo (LLM). |
| Control interno | Cuestionario pyme → 5 calificaciones → deficiencias → hallazgos tipo `deficiencia` → carta NIA 265 con Ref. | — |
| Materialidad | Propuesta calculada; ajustar con el formulario autollenado; al aprobar se escribe todo lo que esperaba. | — |
| Riesgos | Vista por ciclo: cubrir (→ matriz + prueba + PBC) / no tomar (omitida, sin rastro en el archivo) / agregar del sector o propio / responder sin prueba. | — |
| Carta de encargo, memo, cronograma | — | Igual que sin agente. El memo podría armarse solo con lo que el agente ya tiene. |
| Ejecución por ciclo | Lista ordenada por lo que ya se puede hacer, sugerido, detalle con acciones, iniciar ciclo, borrador de conclusión CL-xx. | Todo lo de adentro del papel: marcar pasos, muestra, recálculos, hallazgos desde el paso, notas de revisión, pasar a revisión y aprobar. |
| Informes y cierre | La carta 265 consume las deficiencias. | Dictamen, representaciones, hoja de ajustes, cierre: sin agente. |

Transversal: eventos sí se registran en toda mutación del agente; notificaciones al equipo no. La guía por fases
(`construirGuia`) no conoce las propuestas; en modo agente el panel "Tu agente" reemplaza el checklist. Las tablas
`llm_llamadas` y `seudonimos` existen pero nada las usa. Las corridas corren en la misma petición (sin worker).
Memoria por empresa: `provisiona_renta` y `coso_respuestas`. Pruebas: 146 en `types`; el backend del agente solo
tiene pruebas de humo por script. Al 2026-09-18 hay 28 archivos sin commitear (4d–4g) pendientes de revisión.

### 7.2 Siguientes pasos, en orden

**A. Cerrar lo hecho.** Revisión de la usuaria y commits por tema (materialidad/ajustar, control interno,
materialización, ciclos, riesgos por ciclo).

**B. Flujo dentro del papel de trabajo** (acordado 2026-09-17). Todo determinista, sobre rutas que ya existen
(`PATCH /papeles/:id/pasos`, `POST /papeles/:id/muestra/generar`, `POST /papeles/:id/hallazgos`):
1. *Pasos ligados a la evidencia.* Cada paso del programa se clasifica (obtener documento / conciliar / recalcular /
   juicio). Cuando llega la PBC que corresponde, el paso "obtener" queda hecho con la nota "recibido el <fecha>,
   evidencia E-n"; los de juicio nunca se marcan solos.
2. *Muestra propuesta.* En pruebas de detalle sobre cuentas con terceros (CxC, CxP, bancos, inventarios) el agente
   genera la muestra con el motor NIA 530 actual (partidas clave ≥ materialidad de desempeño + cobertura) como
   propuesta; aprobar la escribe en `muestras` y crea la PBC de confirmaciones a esos terceros.
3. *Recálculos y analíticas con lo que ya hay.* Amarre auxiliar vs mayor, variación contra saldo inicial, ratios
   (`calcularRatios`) sobre la cuenta del papel: el paso "recalcular" queda hecho con la cifra y la diferencia en la nota.
4. *Hallazgos que nacen en el paso.* Ítem de muestra `con_diferencia` o recálculo con diferencia → propuesta de
   hallazgo con monto; si supera materialidad, la propuesta ofrece "Llevar a ajuste".
5. *Cierre del papel.* Con todos los pasos hechos y conclusión aprobada → propuesta "Pasar a revisión" que cambia
   el estado y notifica al socio; las notas de revisión abiertas aparecen como acción del ciclo hasta resolverse.

**C. Informes y cierre.** Dictamen propuesto desde la hoja de ajustes y la materialidad (limpio / con salvedades /
adverso según lo no corregido); carta de representaciones con los asuntos abiertos; checklist de cierre alimentado
por los hallazgos (hechos posteriores, negocio en marcha desde ratios).

**D. Cliente LLM seguro** (etapa 2 pendiente). Única función de llamada con seudonimización, registro en
`llm_llamadas`, modelo económico / fuerte por variable. Primeros usos: redactar descripción y recomendación del
hallazgo, "Preguntar sobre este hallazgo", y lectura de evidencia (extractos, confirmaciones) para los pasos que
hoy no se marcan solos.

**E. Calibración y piloto.** Balances reales de la usuaria contra el motor V-xx; guía por fases que cuente
propuestas; notificaciones al equipo desde el agente; pruebas del backend del agente; memoria de descartes.
