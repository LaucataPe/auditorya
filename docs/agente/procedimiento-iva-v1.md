# Procedimiento I · Revisión agéntica de la declaración de IVA (v1)

Primer procedimiento del modo agéntico fuera del encargo: corre sobre una **revisión tributaria** de IVA
(módulo tributario, nivel empresa × vigencia × período). Misma filosofía que el Procedimiento V de
balances: reglas deterministas con ID estable, cero tokens salvo la lectura del borrador, el motor
calcula y el humano decide. Estamos del lado del revisor: entrega primero, pide después, no bloquea.

Lo que ya existe y se recicla tal cual:

- `CIFRAS_CATALOGO.iva` es el espejo del Formulario 300 por casillas, con columna **Declarado** y
  columna **Según libros**, totales por fórmula y diferencia por renglón que se vuelve hallazgo.
- `LECTURA_FORMULARIO.iva` + `aplicarLecturaFormulario` ya llenan Declarado desde el borrador y
  verifican los totales del formulario.
- `parseBalanceMatrix` + `leerExcelAFilas` (SheetJS en el navegador) ya leen balances con movimientos.
- Propuestas con bitácora, `DecisionCard`, `POST /propuestas/:id/decidir`, checklist del impuesto,
  hallazgos tributarios con monto y seguimiento, firma con snapshot.

Lo nuevo: el agente **llena Según libros** desde el auxiliar contable, **lee el reporte de la DIAN** y
corre las reglas I-xx sobre los tres insumos.

---

## 0. Qué produce este procedimiento

Con el borrador del 300 y el auxiliar contable (el reporte DIAN es opcional pero recomendado):

1. **Cifras completas**: Declarado (borrador) y Según libros (auxiliar) en la pestaña de cifras.
2. **Hallazgos** con bitácora, severidad, certeza, monto y norma. Al aprobar se escriben en
   `hallazgos_tributarios`. Uno por renglón, aunque varias reglas lo señalen.
3. **Ítems del checklist marcados**: cada regla alimenta un ítem del checklist de IVA; al aprobar un
   juicio, el ítem queda hecho con la nota del agente ("Verificado por el agente: …").
4. **Ítems de atención**: documento, juicio, ambigüedad. Cada uno dice para qué sirve.
5. **Limitaciones de la corrida**: qué no se pudo verificar y por qué (sin reporte DIAN, sin período
   anterior, subcuenta sin clasificar).
6. **Conclusión propuesta** por plantilla determinista, lista para el modal de firma.

---

## 1. Insumos y preparación (P-xx)

Los tres archivos quedan como soportes de la revisión (`adjuntos_tributarios`) con tipos nuevos:
`borrador`, `auxiliar`, `reporte_dian`. La columna `tipo` es texto sin CHECK: no hay migración.

| Insumo | Formato real | Cómo se lee | Para qué sirve |
|---|---|---|---|
| Borrador del Formulario 300 | PDF MUISCA o imagen | `POST …/ia/leer-borrador` (ya existe, único uso de tokens) | Columna Declarado por casilla |
| Auxiliar contable del período: cuentas 2408, clase 4 y 1355 | **Libro auxiliar por movimientos** ("AUXILIAR POR CUENTAS"): título con empresa y período, encabezado FECHA · TP.DOC. · N°.DOC. · DOC.FNT · CUENTA ("código - nombre") · TERCERO ("NIT - nombre") · CONCEPTO · CENTRO COSTOS · DEBITO · CREDITO · SALDO. Un asiento por fila. Varía por programa | `leerExcelAFilas` → `parseAuxiliarMovimientos` (nuevo: detecta el encabezado por palabras clave, separa código y nombre, normaliza fechas ISO / dd/mm/yyyy / serial) → `resumirAuxiliarPeriodo` → `mapearAuxiliarACifrasIva` | Columna Según libros; movimientos del período |
| Reporte de documentos electrónicos de la DIAN | `.xlsx`, hoja `Rp_Doc_<fecha>`, encabezado en la fila 1, 32 columnas fijas (ver §7) | `leerExcelAFilas` → `parseReporteDian` (nuevo, determinista, con test sobre un archivo real) | Tercera pierna: lo facturado electrónicamente, emitido y recibido |

| ID | Paso | Qué hace | Si falla |
|---|---|---|---|
| P-01 | Lectura del borrador | Transcripción casilla → valor por la IA; mapeo y verificación de totales deterministas (ya existe). | Advertencias de lectura → ítem de **ambigüedad** por total que no cuadra (I-01). |
| P-02 | Lectura del auxiliar | Parsea el libro por movimientos, filtra por fecha dentro del período y suma débitos y créditos por cuenta (2408, 41–42, 1355). **Excluye el asiento de cierre del IVA**: al final de cada período el programa registra un comprobante (tipo `CI` en el archivo real) que debita el generado y acredita los descontables por el total del período; si se suma, todo da cero. Se detecta como los movimientos del último día, en un mismo lado, cuyo total cancela el neto del resto; el tipo de comprobante aprendido queda en memoria (`iva_tipo_doc_cierre`). | Sin encabezado reconocible → ambigüedad "el archivo no es un auxiliar". Sin ninguna 2408 → "¿es el auxiliar correcto?". |
| P-03 | Clasificar subcuentas de 2408 | Por nombre (`clasificarSubcuentaIva`): "generado" / "ventas" → generado, con tarifa por "19 %" o "5 %"; "desc." / "descontable" → descontable, "servicios" vs "compras"; "dev." + descontable → IVA recuperado (c66); "dev." + generado → IVA de devoluciones en ventas (c79); "por pagar" / "saldo" → se ignora. Nombres reales: `IVA GENERADO 19%`, `IVA DESC. COMPRAS 19%`, `IVA DESC. COMPRAS 5%`, `IVA DESC. SERVICIOS 19%`, `DEV. IVA DESCONTABLE 19%`. Lo aprendido queda en `memoria_empresa_agente` (clave `iva_mapeo_2408`). | Subcuenta sin clasificar → ítem de **ambigüedad** con opciones (generado 19 % / generado 5 % / descontable compras / descontable servicios / IVA recuperado / no es IVA del período). Se pregunta una sola vez por empresa. |
| P-04 | Período y ventana | Toma el período de la revisión (bimestre o cuatrimestre según la obligación). Ventana de descontables = período + los dos anteriores (art. 496 ET, bimestral) o + uno (cuatrimestral). | — |
| P-05 | Lectura del reporte DIAN | Valida columnas fijas, parsea fechas `dd-mm-yyyy`, filtra por Fecha Emisión dentro del período (y ventana para recibidos). Excluye `Application response` (eventos, Total 0) y lo dice en la bitácora. | Columnas distintas → ítem de ambigüedad "el archivo no es el reporte de documentos electrónicos". |
| P-06 | Pertenencia del reporte | NIT Emisor de los "Emitido" y NIT Receptor de los "Recibido" deben ser el NIT de la empresa. | NIT distinto → ambigüedad bloqueante para el bloque C: "este reporte es de otro NIT". |
| P-07 | Clasificar documentos DIAN | Por **tipo**, no solo por grupo: `Factura electrónica` y `de contingencia` emitidas = ventas; recibidas = compras; `Documento soporte con no obligados` y su `Nota de ajuste` = compras a no obligados **aunque el grupo diga Emitido**; `Nota crédito` resta de su grupo; `Nota débito` suma. Tipo desconocido → se cuenta aparte y se informa. | — |
| P-08 | Período anterior | Carga la revisión de IVA del período anterior de la misma vigencia (o el último de la anterior) y su renglón `iva-total`. | Sin revisión anterior con cifras → I-30 queda como `requiere_evidencia` y pide la declaración anterior. |
| P-09 | Memoria de la empresa | Descartes previos por regla y mapeo de subcuentas. | Primera corrida en frío. |

---

## 2. Reglas de validación (I-xx)

Convenciones: **Sev.** severidad base (§4) · **Cert.** `ver` verificado · `evi` requiere evidencia ·
`nov` no verificable · **Checklist** = ítem de `IMPUESTOS_CATALOGO.iva.checklist` que alimenta.
Los ids de renglón son los de `CIFRAS_CATALOGO.iva`. Casillas según el Formulario 300 vigente.

Tolerancia aritmética del formulario: los valores van **aproximados a miles**, así que la tolerancia de
una suma es `500 × número de componentes`, nunca cero. Tolerancia de cruce con libros y DIAN: §10.

### Bloque A · Aritmética del formulario (solo el borrador)

| ID | Regla | Cálculo / umbral | Sev. | Cert. | Checklist |
|---|---|---|---|---|---|
| I-01 | Totales del formulario | Casillas 41, 43, 55, 57, 67, 81, 82/83, 86, 88/89 contra sus componentes (ya lo calcula `aplicarLecturaFormulario`). Hoy son advertencias; pasan a ítem de ambigüedad "¿lectura o formulario?". | medio | ver | — |
| I-02 | IVA generado a tarifa general | `iva-gen-19` (c59) vs 19 % × `iva-ing-19` (c28). Fuera de tolerancia → hallazgo con monto = diferencia. | monto | ver | iva-generado |
| I-03 | IVA generado al 5 % | `iva-gen-5` (c58) vs 5 % × `iva-ing-5` (c27). | monto | ver | iva-generado |
| I-04 | Descontable sin compras | `iva-descontable` > 0 con `iva-comp-brutas` = 0, o descontable > 19 % de compras gravadas (c45 + c44 + importaciones). | alto | ver | iva-descontable |
| I-05 | Saldo a favor y a pagar a la vez | c82 y c83 ambos > 0, o c88 y c89 ambos > 0. | alto | ver | — |
| I-06 | Devoluciones desproporcionadas | c42 / c41 > 5 % (umbral de devoluciones del Procedimiento V). | bajo | evi | ingresos-conciliados |

### Bloque B · Libros contra formulario (auxiliar contable)

El agente llena Según libros y la diferencia por renglón la calcula el catálogo. Estas reglas solo
definen **qué va en cada renglón de libros** y cuándo la diferencia es hallazgo.

| ID | Regla | Según libros | Sev. | Cert. | Checklist |
|---|---|---|---|---|---|
| I-10 | Ingresos brutos | `iva-ing-brutos` ← créditos del período de la clase 4 (sin 4175 devoluciones, sin 42 no operacionales que no sean ventas). Si el auxiliar trae subcuentas por tarifa, también `iva-ing-19` / `iva-ing-5`; si no, solo el total. | monto | ver | ingresos-conciliados |
| I-11 | Devoluciones en ventas | `iva-ing-devoluciones` ← débitos de 4175. | monto | ver | ingresos-conciliados |
| I-12 | IVA generado | `iva-generado` ← créditos del período de las subcuentas 2408 clasificadas como generado (P-03). Por tarifa si hay subcuentas. | monto | ver | iva-generado |
| I-13 | IVA descontable | `iva-descontable` ← débitos del período de las subcuentas 2408 descontable. | monto | ver | iva-descontable |
| I-14 | Retenciones de IVA que le practicaron | `iva-retenido` (c85) ← débitos del período de 1355 (subcuenta de retención de IVA; en muchos PUC 135517). | monto | ver | saldos-favor |
| I-15 | Saldo de 2408 vs saldo declarado | Saldo final de 2408 (neto) vs c88/c89. Diferencia = IVA de períodos anteriores sin pagar o pagos no aplicados. | monto | evi | presentacion-pago |
| I-16 | Ingresos gravados sin IVA en libros | Clase 4 > 0 y 2408 generado = 0 → juicio "¿la empresa es responsable de IVA o sus ventas son excluidas?" (se responde con el RUT cargado; queda en memoria). | medio | evi | ingresos-conciliados |

### Bloque C · DIAN contra formulario y libros (reporte de documentos electrónicos)

Todo lo que el reporte permite verificar con las columnas que realmente trae (§7). Como **no trae base
gravable**, la base se estima: `Total − IVA − INC − demás impuestos`; si hay retenciones en la fila,
el Total viene neto y se suman de vuelta. La bitácora dice siempre "base estimada".

| ID | Regla | Cálculo / umbral | Sev. | Cert. | Checklist |
|---|---|---|---|---|---|
| I-20 | IVA generado vs facturado | Σ IVA de facturas emitidas del período − Σ IVA de notas crédito emitidas vs `iva-generado` declarado. Diferencia → hallazgo con monto. | monto | ver | iva-generado |
| I-21 | Ventas facturadas vs ingresos declarados | Σ base estimada de facturas emitidas − notas crédito vs `iva-ing-brutos`. Facturado > declarado = ingresos omitidos; declarado > facturado = ingresos sin factura electrónica o facturación POS (juicio). | monto | evi | ingresos-conciliados |
| I-22 | Descontable con soporte | `iva-descontable` declarado vs Σ IVA de facturas recibidas en la **ventana** (período + 2 anteriores, art. 496). Declarado > recibido = descontable sin factura electrónica (art. 771-2). Declarado < recibido = descontables no tomados (informativo, bajo). | alto / bajo | ver | iva-descontable |
| I-23 | Compras a no obligados | Σ `Documento soporte` emitido − `Nota de ajuste` vs `iva-comp-no-gravadas` (c46–49, 54): el DS es compra sin IVA, debe estar en compras no gravadas. | bajo | evi | iva-descontable |
| I-24 | Notas crédito vs devoluciones | Σ notas crédito emitidas del período vs `iva-ing-devoluciones` (c42). | monto | ver | ingresos-conciliados |
| I-25 | Recepción fuera del período | Facturas recibidas con Fecha Emisión en el período y Fecha Recepción después del cierre del período: soportan descontable solo desde su recepción (juicio de oportunidad). | bajo | evi | iva-descontable |
| I-26 | Facturas de contingencia | Emitidas o recibidas de tipo contingencia: se listan para verificar su transmisión posterior. | bajo | evi | — |
| I-27 | Cobertura del reporte | Meses del período sin ningún documento emitido, o reporte que no cubre todo el período. Es limitación, no hallazgo. | — | nov | — |

### Bloque D · Continuidad, oportunidad y juicio

| ID | Regla | Cálculo / umbral | Sev. | Cert. | Checklist |
|---|---|---|---|---|---|
| I-30 | Arrastre del saldo a favor | `iva-saldo-favor-ant` (c84) vs c89 de la revisión del período anterior (P-08). Diferencia → hallazgo. Sin período anterior en la app → pide la declaración anterior. | alto | ver / evi | saldos-favor |
| I-31 | Saldo a favor sin arrastre | Período anterior con c89 > 0 y c84 = 0 en este → saldo a favor no imputado (o solicitado en devolución: juicio). | medio | evi | saldos-favor |
| I-32 | Proporcionalidad | Hay ingresos excluidos o no gravados (c39 + c40 > 0) y descontables > 0 y c80 (ajuste) = 0 → juicio "¿aplicó prorrata del art. 490?". | medio | evi | proporcionalidad |
| I-33 | Periodicidad | Ingresos brutos del año anterior (comparativo del último encargo o memoria) contra 92.000 UVT: bimestral si supera, cuatrimestral si no (art. 600 ET). Obligación configurada distinta → juicio. | medio | evi | presentacion-pago |
| I-34 | Vencimiento | Fecha de vencimiento de la revisión anterior a hoy sin presentación registrada → recordatorio (ya lo muestra la matriz; aquí entra a la bitácora). | — | ver | presentacion-pago |
| I-35 | Sanciones | c87 > 0 → juicio "¿extemporaneidad o corrección? Verificar liquidación (arts. 641 y 644)". | bajo | evi | presentacion-pago |

### Bloque E · Cruce con otras obligaciones (etapa 3)

| ID | Regla | Cálculo / umbral | Sev. | Cert. |
|---|---|---|---|---|
| I-40 | ReteIVA practicada vs 350 | Créditos de 2367 del mes vs casilla 131 del 350 del mismo mes (`rf-reteiva`). Requiere la revisión de retefuente del período. | monto | ver |
| I-41 | ReteIVA en el reporte DIAN | Σ columna `Rete IVA` de facturas recibidas vs 2367: cuando el proveedor la liquida en la factura. | bajo | evi |
| I-42 | Ingresos IVA vs renta y exógena | Σ `iva-ing-brutos` de la vigencia vs ingresos de renta y formato 1007. Corre en la revisión anual. | monto | ver |

---

## 3. Certeza

Igual que el Procedimiento V §3. Regla de oro: si no se rastrea a un cálculo del motor o a una cita
normativa, no se escribe. Lo que el reporte DIAN no trae (base gravable exacta, POS, facturación por
otros medios) siempre se marca `requiere_evidencia`, nunca `verificado`.

---

## 4. Severidad: se audita todo, la proporción solo ordena

Decisión de la usuaria (2026-09-23): **no hay umbral de materialidad que oculte diferencias.** Toda
diferencia por encima del redondeo del formulario se propone; la severidad solo sirve para ordenar
las tarjetas. Para reglas marcadas `monto`:

1. **Por proporción de la base del renglón**: |diferencia| / max(declarado, libros) ≥ 5 % → alto ·
   ≥ 1 % → medio · el resto → bajo. Nada se agrupa como trivial.
2. **Piso absoluto**: solo el redondeo a miles del formulario (500 × componentes). Por debajo no es
   diferencia, es aproximación.
3. **Referencia opcional al encargo**: si la empresa tiene un encargo con materialidad aprobada, la
   bitácora dice cuántas veces la materialidad de desempeño representa la diferencia ("equivale a
   0,4× la MD del encargo 2025"). No cambia la severidad ni filtra nada.
4. **Escaladores** (+1, tope alto): descontable sin soporte (I-22), saldo a favor (I-30, I-31),
   diferencia contra la DIAN (bloque C cuando la DIAN muestra más que lo declarado: es omisión).
5. **Reguladores** (−1): descarte previo del revisor para la misma empresa y regla (memoria).
6. Reglas sin monto usan la severidad fija de la tabla.

---

## 5. Control de ruido

- Una tarjeta por renglón: si I-12 e I-20 señalan `iva-generado`, es un hallazgo con dos reglas.
- Nada por debajo del redondeo del formulario (§4) como hallazgo.
- `Application response` y tipos desconocidos del reporte: una línea de bitácora, no propuestas.
- Regla descartada dos veces para la empresa: baja un nivel y se agrupa al final.
- Los ítems de ambigüedad de P-03 se preguntan una sola vez por empresa.

---

## 6. Mapeo auxiliar → renglones (Según libros)

| Renglón | Cuentas | Movimiento |
|---|---|---|
| `iva-ing-19`, `iva-ing-5` | 41 por subcuenta de tarifa si existe | créditos |
| `iva-ing-excluidos`, `iva-ing-no-gravadas` | subcuentas de 41 marcadas como excluidas (memoria) | créditos |
| `iva-ing-devoluciones` | 4175 | débitos |
| `iva-gen-19`, `iva-gen-5`, `iva-gen-otros` | 2408 generado por tarifa (P-03) | créditos − débitos |
| `iva-gen-recuperado` (c66) | 2408 "DEV. IVA DESCONTABLE": el proveedor anuló el servicio y devolvió el IVA | créditos − débitos |
| `iva-desc-compras`, `iva-desc-servicios`, `iva-desc-otros` | 2408 descontable; compras al 19 % y al 5 % van juntas porque el catálogo no separa el descontable por tarifa | débitos − créditos |
| `iva-desc-devoluciones` (c79) | 2408 "DEV. IVA GENERADO": IVA de ventas anuladas | débitos − créditos |
| `iva-retenido` | 1355 retención de IVA (135517 o nombre con "IVA"); las demás 1355 se ignoran | débitos |
| `iva-comp-brutas` | 14, 51, 52, 61, 62 (débitos) — solo si el auxiliar los trae; si no, `nov` | débitos |

Lo que el auxiliar no permite separar (ingresos sin tarifa en el nombre de la subcuenta) suma solo al
total `iva-ing-brutos`, que el motor compara contra el total declarado sin persistirlo (los totales del
catálogo se calculan, no se digitan). La memoria de la empresa (`mapeo` cuenta → renglón o `ignorar`)
prevalece sobre las heurísticas. Implementado en `agente-iva-libros.ts` con tests sobre el auxiliar real.

---

## 6b. Lectura de libros por programa contable (2026-09-28)

Los clientes usan programas distintos y cada uno exporta el libro a su manera. El lector no "entiende
cualquier archivo": convierte cada formato conocido al mismo modelo (`MovimientoAuxiliar` o
`ResumenCuentaAuxiliar`) y todo lo demás (resumen, mapeo, reglas, memoria) trabaja sobre ese modelo.
Dos familias de insumo, decididas por `leerLibroContable`:

- **Libro auxiliar por movimientos** (`parse-auxiliar.ts`): fecha por fila. El encabezado se elige por
  puntaje entre las primeras 40 filas (sinónimos sin tildes, tolerando "Dbitos" del xls). Variantes
  cubiertas con archivos reales anonimizados en `fixtures/`: **Pluss100** (cuenta y tercero como
  "código - nombre"), **World Office** (la cuenta va en la primera fila del bloque y las demás la
  heredan; filas SALDO INICIAL y "Total …" que se descartan; tercero solo con nombre; fecha serial;
  su auxiliar de retenciones trae UNA columna "Valor" que se asigna al lado natural de la cuenta, más
  "%" y "Base"), **Siesa** (encabezado en la fila 1, "Auxiliar" y "Desc. auxiliar" separados, "Nit
  tercero", "Base gravable", "Débitos/Créditos/Neto"). `base` y `tarifa` quedan en el movimiento:
  permiten verificar tarifa asiento por asiento (IVA) y son el insumo del 350.
- **Balance de prueba del período** (`parse-balance-periodo.ts`): sin fechas; débitos y créditos por
  cuenta bastan para las reglas de libros contra formulario, pero no se puede detectar un cierre de
  IVA ni verificar tarifas por factura. Se conservan solo cuentas hoja; las filas por tercero (World
  Office "NIT  123" en TERCERO; Siesa segunda columna "Cuentas" con el NIT) no suman dos veces. Siesa
  "COMPROBACION DE SALDOS" titula los saldos con la fecha, así que nombre y saldos se infieren por
  posición. Caso real verificado: el balance del bimestre 4 de 2026 de una empresa Siesa reproduce
  exactamente las casillas 41, 42, 59+60, 66, 71+72, 75, 79 y 85 de su borrador del 300.

Trampa encontrada: en 1355 la palabra "iva" debe buscarse como palabra ("BOLIVAR" la contiene).
Pendiente: confirmación de columnas en el modal cuando el puntaje sea bajo, y perfiles por programa
aprendidos (memoria por empresa, clave `auxiliar_perfil`).

## 7. Reporte de documentos electrónicos de la DIAN: estructura real

Tomada de un archivo real (sep 2026). Hoja `Rp_Doc_YYYYMMDD_HHMM`, encabezado en la fila 1:

| Col. | Encabezado | Uso |
|---|---|---|
| 0 | Tipo de documento | Clasificación (P-07): `Factura electrónica`, `Factura electrónica de contingencia`, `Documento soporte con no obligados`, `Nota de ajuste del documento soporte`, `Application response`; se esperan también `Nota crédito` y `Nota débito` |
| 1 | CUFE/CUDE | Identidad única (deduplicar) |
| 2–3 | Folio, Prefijo | Referencia en hallazgos y muestreo |
| 7 | Fecha Emisión | `dd-mm-yyyy`; define el período |
| 8 | Fecha Recepción | `dd-mm-yyyy hh:mm:ss`; oportunidad (I-25) |
| 9–12 | NIT y nombre emisor / receptor | Pertenencia (P-06), terceros para muestreo |
| 13 | IVA | Bloque C |
| 16 | INC | Impuesto al consumo: no es IVA, se excluye de la base |
| 14–25 | ICA, IC, Timbre, INC Bolsas, IN Carbono, IN Combustibles, IC Datos, ICL, INPP, IBUA, ICUI | Otros impuestos: se restan del Total para estimar la base |
| 26–28 | Rete IVA, Rete Renta, Rete ICA | Etapa 3 (cruce con 350); si > 0, el Total viene neto |
| 29 | Total | Base estimada = Total − impuestos + retenciones |
| 30 | Estado | `Aprobado`, `Aprobado con notificación`; otros estados → se excluyen y se informan |
| 31 | Grupo | `Emitido` / `Recibido` |

Criterio de la usuaria (2026-09-23): **ingresos = Σ facturas de venta emitidas; devoluciones = Σ notas
crédito emitidas.** El IVA generado según DIAN es el de las ventas menos el de las notas crédito.

Hechos del archivo real que condicionan el diseño:

- **No hay columna de base gravable ni subtotal.** Toda base es estimada.
- Los `Application response` son 46 de 127 filas, todos con Total 0: eventos de acuse, no documentos.
- Los `Documento soporte` vienen en el grupo Emitido pero son **compras**.
- Una sola factura recibida trae IVA en 8 meses: la empresa del ejemplo opera casi sin IVA, así que
  ese archivo sirve para probar la lectura, no las reglas del bloque C. Hace falta un reporte de una
  empresa responsable de IVA con ventas gravadas.
- No aparecen retenciones en ninguna fila: falta confirmar con un archivo que las traiga si el Total
  viene neto de retenciones o bruto.

Implementado en `parse-reporte-dian.ts` (`parseReporteDian`, `clasificarDocumentoDian`,
`resumirReporteDianPeriodo` con ventana de descontables). Fixtures anonimizados en
`packages/types/src/fixtures/`: `reporte-dian-documentos.ts` (44 filas representativas) y
`auxiliar-iva-2408.ts` (el auxiliar completo, 94 asientos, terceros y conceptos reemplazados). Los
archivos originales no se commitean.

---

## 8. Forma de la propuesta

```
I-03 · IVA generado · Declarado y facturado no coinciden
Riesgo MEDIO · Verificado · $1.240.000

Descripción   El IVA generado declarado (casilla 67) es $18.560.000; las facturas electrónicas
              emitidas en el bimestre suman $19.800.000 de IVA, netas de notas crédito.
              La diferencia equivale al 6,3 % del renglón.
Datos         declarado 18.560.000 · DIAN 19.800.000 · libros 19.790.000 · diferencia 1.240.000
Norma         Art. 429 y 617 ET · Resolución 000042 de 2020 (factura electrónica)
Bitácora
  01  Leí borrador_300_B3.pdf: 41 casillas; totales cuadran (I-01).
  02  Leí auxiliar_B3.xlsx: 212 filas, movimientos del período; 2408 con 4 subcuentas (P-02).
  03  Clasifiqué 240805 y 240810 como generado 19 % y descontable por nombre (P-03).
  04  Leí Rp_Doc_20260915.xlsx: 127 filas; 46 Application response excluidos; NIT coincide (P-05, P-06).
  05  Apliqué I-12: libros 19.790.000 vs declarado 18.560.000.
  06  Apliqué I-20: 38 facturas emitidas y 2 notas crédito en el período; IVA neto 19.800.000.
  07  Severidad MEDIO: 6,3 % del renglón, escalador "DIAN mayor que declarado" (+1 desde bajo).
Pide          Nada: verificado con libros y DIAN.
Acciones      Aprobar (crea el hallazgo y marca "IVA generado" en el checklist) · Ajustar · Omitir
```

---

## 9. Dónde escribe cada decisión

| Tipo de propuesta | Al aprobar |
|---|---|
| hallazgo | Fila en `hallazgos_tributarios` (descripción, recomendación, monto, severidad); el checklist del ítem queda con nota "hallazgo H-n". |
| juicio | `checklistEstado[item] = { hecho: true, nota: "Verificado por el agente: …" }` vía el PATCH existente. La opción elegida queda en memoria si la regla lo pide. |
| ambigüedad | Mapeo de subcuentas o confirmación de archivo en `memoria_empresa_agente`; se vuelve a correr. |
| documento | Sin tabla PBC en tributario: queda como propuesta abierta y aparece en el paso "Documentos" del asistente hasta que se suba el soporte con ese tipo. |
| conclusión | Texto en `conclusion` de la revisión (PATCH); el modal de firma es el de siempre. |

Persistencia de propuestas y corridas: `propuestas_agente` y `corridas_agente` con columna nueva
`revision_tributaria_id` (nullable) y `auditoria_id` pasando a nullable con CHECK de que exista una de
las dos. Es la única excepción a "solo aditivo"; el reverso es limpio mientras no haya propuestas
tributarias. Alternativa descartada: tablas paralelas (duplica bitácora, decidir y tarjeta).

---

## 10. Umbrales por defecto (configurables por firma)

| Parámetro | Valor |
|---|---|
| Tolerancia aritmética del formulario | 500 × componentes (redondeo a miles) |
| Tolerancia de cruce libros / DIAN | 0,1 % del renglón y mínimo $1.000 |
| Severidad por proporción | 5 % alto · 1 % medio · 0,1 % bajo |
| Piso absoluto | 1 UVT |
| Ventana de descontables | 2 períodos anteriores (bimestral) · 1 (cuatrimestral) |
| Devoluciones / ventas | 5 % |
| Tarifas | 19 % · 5 % |
| Tope de periodicidad | 92.000 UVT de ingresos brutos del año anterior |

---

## 11. Preguntas abiertas con la usuaria

Resueltas el 2026-09-23: el auxiliar es un libro por movimientos (archivo real recibido); ingresos y
devoluciones según DIAN se toman de facturas de venta y notas crédito; no hay umbral de materialidad,
se audita todo. Quedan:

1. Un reporte DIAN de una empresa **responsable de IVA con ventas gravadas y retenciones**, para
   confirmar si el Total viene neto de retenciones y probar el bloque C con datos reales.
2. Un auxiliar de otro programa contable (Siigo, Helisa, Alegra) para ampliar la detección de
   encabezados y nombres de subcuentas.
3. Para la casilla 85 usamos 1355 (retenciones que le practicaron). ¿Con "rte iva" te referías a esa o
   a 2367 (las que practica, que van al 350)?

---

## 12. Etapas

1. **Motor y lectura, sin migración.** Hecho (2026-09-24). `parse-auxiliar.ts`, `parse-reporte-dian.ts`,
   `agente-iva-libros.ts` y el motor `agente-iva.ts` (bloques A, B, C y D; I-05, I-15, I-33 y I-34 quedan
   como limitaciones) en types, con tests sobre los dos archivos reales anonimizados y escenarios
   sintéticos del 300. Frontend: `components/empresa/AgenteIvaCifras.tsx` dentro de la pestaña de
   cifras de una revisión de IVA: "Cargar auxiliar" llena Según libros (PATCH de cifras) y guarda el
   archivo como soporte tipo `auxiliar`; "Cargar reporte DIAN" lo lee y lo guarda como `reporte_dian`;
   el motor corre en el navegador y las propuestas se muestran una a la vez con la `DecisionCard` del
   encargo. Aprobar un hallazgo escribe en `hallazgos_tributarios`; aprobar un juicio marca el ítem del
   checklist con la nota del agente; ambigüedades y documentos solo se anotan (la memoria de la empresa
   es de la etapa 2). Las propuestas no se persisten todavía: viven mientras la página está abierta.
   Detalle del 300 que salió al probar: el IVA generado de la casilla 67 es **bruto**; el IVA de las notas
   crédito va a la casilla 79 (`iva-desc-devoluciones`), así que I-20 compara contra las facturas de
   venta sin restar notas crédito e I-24 cruza el IVA de las notas crédito contra la 79. I-04 e I-22
   restan la 79 del descontable porque no nace de compras.
1b. **Revisión guiada (hecho 2026-09-25).** La usuaria descartó el panel dentro de la pestaña de cifras:
   la experiencia es un **paso a paso**. `components/empresa/RevisionGuiadaIva.tsx` es la vista por
   defecto de toda revisión de IVA (las pestañas quedan en `?vista=pestanas`), con el paso en `?paso=`:
   1. *Alcance y programa*: el alcance sugerido editable y el **programa dinámico**: los pasos del
      agente (`PROGRAMA_AGENTE_IVA`, cada uno con sus reglas I-xx, insumos y punto del checklist) que el
      auditor activa o desactiva, más pasos propios que agrega y marca a mano. Se persiste en la columna
      nueva `revisiones_tributarias.programa` (jsonb, migración 0048 con reverso) y se materializa como
      texto en `procedimientos`, así el informe lo imprime. Lo desactivado no corre: `reglasOmitidas()` →
      `omitirReglas` del motor, que además no da por verificado el punto del checklist afectado.
   2. *Documentos*: tarjetas por insumo según el programa (`insumosDelPrograma`), cada una con su
      "para qué" y estado; borrador por IA o a mano, auxiliar y reporte DIAN con carga directa,
      declaración anterior solo si no está en la plataforma. Los archivos quedan como soportes y se
      **releen al abrir la revisión** (hook `useAgenteIva`), así el análisis no depende de la sesión.
   3. *Análisis*: la bitácora del motor se revela línea a línea y cierra con los conteos y las
      limitaciones.
   4. *Hallazgos*: `DecisionCard` una a la vez (aprobar hallazgo → `hallazgos_tributarios`; aprobar
      juicio → checklist con la nota del agente), los pasos propios para marcar, y la misma tabla de
      hallazgos de la pestaña para agregar otros (`HallazgosTabla` y `CampoPapel` se movieron a
      `components/empresa/HallazgosTributarios.tsx` para compartirlos).
   5. *Informe*: observaciones, conclusión, resumen de qué lleva el documento, PDF/Word y firma.
   Las propuestas siguen sin persistirse (etapa 2).
2. **Persistencia de corridas y propuestas (hecho 2026-09-28).** Migración **0049_agente_tributario** (con
   reverso): `corridas_agente`, `propuestas_agente` y `bitacora_agente` ganan `revision_tributaria_id`
   (FK) y `auditoria_id` deja de ser NOT NULL, con CHECK de que exista exactamente uno de los dos padres;
   índice único `(revision_tributaria_id, codigo)`. Es la única excepción a "solo aditivo" y el reverso
   borra las filas tributarias antes de restaurar el NOT NULL. Backend: `lib/agente/corrida-iva.ts`
   (`correrProcedimientoIva`: completa la entrada con cifras, revisión anterior, programa, numeración y
   huellas decididas; corre el motor; guarda corrida + bitácora de lectura + propuestas con su bitácora;
   escribe Según libros en `cifras` en la misma transacción; descarta como "Reemplazada" lo abierto de
   corridas anteriores) y `routes/tributario-agente.ts`: `GET /tributario/revisiones/:id/agente`,
   `POST …/agente/corridas` (recibe los resúmenes ya leídos en el navegador: `MapeoLibrosIva`,
   `ResumenDianPeriodo`, insumos con adjuntoId y líneas de lectura) y
   `POST …/agente/propuestas/:pid/decidir` (aprobar/ajustar hallazgo → `hallazgos_tributarios` con
   `entidad_destino='hallazgo_tributario'`; aprobar juicio → checklist hecho con la nota; ajustar juicio →
   solo la nota, el punto sigue abierto; omitir/descartar/retomar; línea `humano` en la bitácora y evento
   `tributario.propuesta.<decision>`). `GET /tributario/revisiones/:id` trae `agente`
   (`ResumenAgenteRevision`) y la firma lo sella en el snapshot; la constancia y el informe preliminar
   ganan la sección "Procedimientos automatizados". El endpoint del encargo `/propuestas/:id/decidir`
   responde 404 para propuestas tributarias. Frontend: `useAgenteIva` ya no corre el motor: `correr`
   (POST) y `decidir` (POST) contra el servidor; `desactualizada` compara los adjuntos usados y la huella
   de Declarado (`huellaDeclarado`) con la corrida guardada; la tabla de hallazgos muestra el código de la
   propuesta que originó cada hallazgo (`hallazgosDelAgente`).
   **Memoria por empresa (hecho 2026-09-28):** fila `memoria_empresa_agente` con clave `iva_memoria`
   (`MemoriaIvaEmpresa`: `mapeo2408` subcuenta → renglón o `'ignorar'`, `tiposDocCierre`). El agente
   aprende solo el comprobante del cierre (la corrida recibe `tiposDocCierre` del resumen y lo une a la
   memoria, con línea en la bitácora); la clasificación de una subcuenta la decide una persona: la
   ambigüedad P-03 lleva `tributario.cuentaAuxiliar` y su huella se ancla a la cuenta, la `DecisionCard`
   muestra un selector cuando hay más de dos opciones y `decidir` con `ajustes.opcion` guarda el destino
   (`entidad_destino='memoria_empresa'`). El hook aplica la memoria al resumir y mapear, la corrida guarda
   `memoriaMapeo` y si la memoria cambia después el análisis se marca desactualizado. `DELETE
   …/agente/memoria` la borra ("Olvidar" en el paso Documentos). Pendiente: bandera por firma.
3. **Bloque C completo y cruces.** Reglas I-2x con la ventana de descontables, bloque E contra el 350
   y contra renta/exógena en la revisión anual, muestreo de terceros desde el reporte DIAN.

## 13. Cédulas por procedimiento (2026-09-29)

Mismo modelo que retención en la fuente (`procedimiento-retefuente-v1.md` §5): el agente prepara una cédula por
procedimiento con todo lo comparado y el auditor escribe la conclusión de cada una; sin conclusión vigente no se
firma. La regla **I-90 ("marcar como verificado") se retiró**: el punto del checklist lo cierra la conclusión.

| Fase | Cédula | Qué muestra |
|---|---|---|
| El borrador por sí solo | `formulario` | Totales recalculados · IVA generado contra tarifa por base (I-02, I-03) · descontable contra compras gravadas (I-04) · devoluciones (I-06) |
| Los libros por sí solos | `lectura-libros` | Archivos leídos · clasificación de cada cuenta con su motivo · según libros por renglón |
| Cruce con libros | `ingresos-libros`, `generado-libros`, `descontable-libros`, `retenciones-libros` | Declarado, libros, diferencia y tolerancia por renglón |
| Facturación electrónica | `lectura-dian` | Documentos por tipo · pertenencia del reporte (NIT) · cobertura del período |
| Facturación electrónica | `dian-ventas`, `dian-compras` | Cruces I-20 a I-26 con su resultado |
| Analíticas | `saldo-favor`, `proporcionalidad` | Arrastre de la casilla 84 · excluidos, descontables y ajuste |
| Oportunidad | `oportunidad` | Presentación contra vencimiento (**I-34, nueva**) · sanciones |

Un análisis guardado antes de este cambio no tiene cédulas: la guía muestra su bitácora y no bloquea la firma
hasta que se vuelva a analizar. `reglasOmitidas` ahora solo omite los pasos que el auditor desactivó (un paso
nuevo del programa corre por defecto).
