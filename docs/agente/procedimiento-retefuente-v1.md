# Procedimiento R · Revisión agéntica de la declaración de retención en la fuente (Formulario 350) — v1

Fecha: 2026-09-28. Mismo formato y misma infraestructura que `procedimiento-iva-v1.md`: motor determinista en
`packages/types/src/agente-retefuente.ts`, mapeo de libros en `agente-retefuente-libros.ts`, tarifas en
`tarifas-retefuente.ts`, registro por impuesto en `agente-tributario.ts`. La revisión guiada, el hook, las rutas
y las tablas del agente son las mismas del IVA: el procedimiento de la corrida es `'retefuente'`.

## 0. Qué produce

Propuestas con bitácora (hallazgo, juicio, ambigüedad) que el auditor decide en el paso 4 de la revisión guiada.
Aprobar un hallazgo lo escribe en `hallazgos_tributarios`; aprobar un juicio marca el punto del checklist del 350
(`bases-contabilidad`, `tarifas-conceptos`, `autorretencion`, `soportes-terceros`, `presentacion-pago`,
`periodo-anterior`); una ambigüedad de clasificación va a la memoria de la empresa (`mapeo2365`).

## 1. Insumos (P-xx)

- **P-01 Borrador del 350** → columna Declarado. La matriz concepto × beneficiario (jurídicas / naturales) ×
  (base, retención) ya existe en `CIFRAS_CATALOGO.retefuente` (`rf-{pj|pn}-{concepto}` y `…-base`,
  `rf-ar-…` para autorretenciones) y la lee `aplicarLecturaFormulario('retefuente')`.
- **P-02 Auxiliar o balance de prueba del mes** de 2365 (retefuente), 2364 (algunos planes) y 2367 (rete-IVA
  practicada) → columna Según libros. Con los ASIENTOS y su tercero se separa jurídicas de naturales; con la
  BASE por asiento (World Office "Base" + "%", Siesa "Base gravable") se verifica tarifa y cuantía mínima uno
  por uno. Con solo un balance se compara por concepto (total jurídicas + naturales).
- **P-03 Clasificación de subcuentas** por nombre (honorarios, servicios, compras, arrendamientos, salarios,
  autorretención, rete-IVA…) con el PUC como respaldo (236515, 236525, 236540…). Lo que no se reconoce es
  ambigüedad → memoria de la empresa.
- **P-04 Beneficiario**: NIT de 9 dígitos que empieza por 8 o 9 = persona jurídica; cédula = natural; sin NIT,
  por el nombre (SAS, LTDA, S.A., fundación… = jurídica; "apellido apellido nombre" = natural). Rentas de
  trabajo, pensiones y enajenación siempre a naturales; autorretención siempre a jurídicas (es la propia empresa).
  **PENDIENTE DE VALIDAR con la firma.**
  Con un balance por terceros (sin asientos) la separación se hace con el detalle por tercero de cada
  subcuenta. El NIT con el dígito de verificación pegado (10 dígitos) se reconoce validando el dígito.
- **P-04b Pagos a la DIAN**: el débito a la DIAN (NIT 800197268) en 2365/2367 es el pago de la declaración
  anterior y NO se descuenta de lo retenido en el período. Sin detalle por tercero no se puede distinguir de
  una reversión, así que se toma lo causado (créditos) y queda dicho en la bitácora.
- **P-05 Revisión del mes anterior** en la plataforma, para la variación mes a mes.

## 2. Reglas (R-xx)

### Bloque A · Formulario
- **R-01** Totales del 350 que no cuadran con sus componentes (advertencias de la lectura) → ambigüedad.
- **R-02** Tarifa implícita retención ÷ base por casilla contra las tarifas admisibles del concepto
  (`TARIFAS_RETEFUENTE`, tolerancia 0,1 puntos). Fuera de todas → hallazgo; entre la mínima y la máxima
  (mezcla de declarantes y no declarantes en la misma casilla) → juicio. Conceptos de tarifa variable (rentas
  de trabajo, dividendos, exterior, regalías…) no se verifican.
- **R-03** Retención sin base → hallazgo; base sin retención → juicio (puede ser cuantía mínima).

### Bloque B · Libros contra formulario (tolerancia = redondeo a miles × componentes, mínimo $1.000)
- **R-10** Casilla 130 + excesos (129) vs Σ 2365 del período (renta + autorretención).
- **R-11** Por concepto: si el beneficiario se conoce, por casilla (pj y pn); si no, por total del concepto.
  Concepto declarado sin subcuenta en libros → hallazgo; concepto contabilizado y no declarado → hallazgo
  (omisión, art. 647 ET).
- **R-12** Casilla 134 (131 + 132 − 133) vs 2367.
- **R-13** Autorretenciones (59–76, 113–128) vs subcuenta de autorretención (236575).
- **R-14** Base declarada vs base de los asientos, por concepto (solo con base por asiento).
- **R-15** Asiento por asiento: retención ≠ base × tarifa registrada (tolerancia $100 o 1 %) → hallazgo con
  ejemplos; tarifa no admisible para el concepto → hallazgo. Rentas de trabajo, pensiones y dividendos no se
  recalculan (no son tarifa plana).
- **R-16** Retención practicada sobre pagos bajo la cuantía mínima del concepto (UVT del año) → juicio.
  Sin UVT configurada para el año → limitación (agregar en `UVT_POR_ANIO`).

- **R-17** Razonabilidad por tercero (2026-09-29, propuesta del auditor). Con un balance por terceros (o un
  auxiliar con tercero) que traiga gasto, costo o compras y la 2365: lo causado a cada tercero es la base
  presunta; la retención de cada subcuenta se divide por su tarifa ("COMPRAS 2.5%") para obtener la base que
  explica; si difieren más del 10 % o no hubo retención sobre la cuantía mínima → juicio (nunca hallazgo).
  Base: clases 5, 6 y 7 y grupos 14 a 17; se excluyen laborales, impuestos, depreciaciones, financieros y
  bienes en tránsito (`conceptoDeCuentaBase`). Cédula `terceros-gasto`. Es lo que corre cuando el libro no
  trae base por asiento. **Clasificación de cuentas y margen PENDIENTES DE VALIDAR.**

### Bloque C · DIAN (etapa siguiente)
- **R-20..R-25** Universo de pagos por tercero desde los documentos electrónicos recibidos: terceros sin
  retención que debían tenerla. Queda como limitación en la bitácora.

### Bloque D · Continuidad y oportunidad
- **R-30** Variación del total (casilla 136) frente al mes anterior > 50 % → juicio.
- **R-31** Fecha de presentación posterior al vencimiento → hallazgo alta (art. 641 y 580-1 ET).
- **R-32** Sanción en la 137 → juicio; total a pagar (138) > 0 → juicio "confirmar pago total" con nota para el
  checklist: sin pago total la declaración es ineficaz (art. 580-1 ET).
- **R-90** Retirada (2026-09-29): ya no se propone "marcar como verificado". El punto del checklist se cierra
  con la conclusión del auditor sobre la cédula (ver §5).

## 3. Supuestos pendientes de validar (Laura)

1. Tarifas y cuantías mínimas en `tarifas-retefuente.ts` son las de 2025; la UVT 2026 no está configurada.
2. Jurídica/natural por NIT (8xx/9xx) y por nombre cuando el auxiliar no trae NIT.
3. Rete-IVA practicada = 2367 (va al 350, casilla 131); la 1355 es la que le practicaron (va al 300, casilla 85).
4. Autorretención en 236575 (o nombre con "autorretención"); no se verifica su tarifa por CIIU, solo la
   consistencia base × tarifa y el cruce con las casillas 59–76.
5. Se audita toda diferencia por encima del redondeo a miles.

## 4. Qué se probó

Auxiliar real de World Office (agosto 2026, anonimizado en `fixtures/auxiliar-worldoffice-retefuente.ts`): salarios,
servicios a no declarante 6 %, compras 2,5 %, honorarios 11 % y autorretención 0,55 %, con base y tarifa por
asiento. Mapeo por concepto y beneficiario, 0 anomalías de cálculo en el archivo real, y escenarios sintéticos de
cada regla en `agente-retefuente.test.ts`. Falta un borrador real del 350 para probar la lectura de la matriz
completa de punta a punta.

## 5. Cédulas por procedimiento (2026-09-29)

Pedido del auditor que revisó el modelo: ver qué proceso siguió el agente, no solo sus excepciones. El motor
devuelve, además de las propuestas, una **cédula por procedimiento** (`cedulas-tributarias.ts`) con objetivo,
criterio y tolerancia, fuente, reglas y **todas las partidas comparadas** con su resultado (conforme,
diferencia, por confirmar, informativo, no verificable). Principio: el agente prepara, el auditor concluye.

| Fase | Cédula | Tablas |
|---|---|---|
| El borrador por sí solo | `formulario` | Totales recalculados · tarifa implícita por casilla |
| Los libros por sí solos | `lectura-libros` | Archivos leídos · clasificación de cada subcuenta con su motivo · según libros por concepto y beneficiario |
| Cruce | `libros-renta`, `libros-reteiva`, `autorretencion` | Total · por concepto y beneficiario · bases |
| Prueba de detalle | `tarifas-asientos` | Población recalculada por concepto y tarifa (100 %) · excepciones · bajo cuantía mínima · 25 partidas de mayor valor |
| Analíticas | `terceros-gasto` | Causado contra retenido por tercero · cuentas tomadas como base · cuentas excluidas y por qué |
| Analíticas | `periodo-anterior` | Comparativo por casilla con el mes anterior |
| Oportunidad | `oportunidad` | Presentación, sanciones, pago |

- Estado de la cédula: `ejecutada`, `sin_insumos` (dice qué faltó) u `omitida` (paso desactivado en el programa).
- Cada propuesta lleva `contenido.tributario.cedula` y la fila que la originó lleva su código: se decide en
  contexto, dentro de la cédula (el paso 4 conserva la cola consolidada).
- Persistencia: las cédulas van en `corridas_agente.resultado.cedulas`; las tablas de asientos guardan máximo
  200 filas (`omitidas` dice cuántas quedaron solo en el archivo fuente).
- **Conclusión del auditor**: `PUT /tributario/revisiones/:id/agente/cedulas/:cid/conclusion` con texto y
  resultado (satisfactorio, con excepciones, no concluyente). Nombre y fecha los pone el servidor. Se guarda en
  `revisiones_tributarias.conclusiones_cedulas` (migración 0050) con la **huella** de la cédula: si un análisis
  nuevo cambia el contenido, la conclusión queda "por reconfirmar". No se acepta "satisfactorio" con propuestas
  de la cédula sin decidir.
- Al concluir todas las cédulas ejecutadas de un punto del checklist, el punto se marca con esas conclusiones.
- **Firma**: bloqueada (`CEDULAS_SIN_CONCLUIR`) mientras una cédula ejecutada no tenga conclusión vigente.
  Se puede avanzar entre pasos sin concluir.
- Documentos: el informe y la constancia llevan "Conclusiones por procedimiento" sin cifras; las cédulas
  completas se exportan aparte como papel de trabajo interno (PDF / Word).

Pendiente: muestreo para inspección de soportes (etapa 2), analíticas con el histórico de la vigencia (etapa 3)
(las cédulas del IVA ya están: ver `procedimiento-iva-v1.md`).
