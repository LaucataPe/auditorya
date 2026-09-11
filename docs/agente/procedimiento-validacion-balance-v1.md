# Procedimiento V · Validación del balance de prueba (v1)

Especificación del primer procedimiento del modo agéntico. Es la "sesión de revisión" que un
revisor fiscal con criterio práctico haría sobre un balance de prueba de una PYME colombiana,
escrita como reglas deterministas con ID estable para que el motor las ejecute igual siempre.

Filosofía: **estamos del lado del auditor.** La norma es el respaldo del papel de trabajo, no un
látigo. El sistema entrega primero, pide después, nunca bloquea y produce poco ruido. Todo umbral
es un valor por defecto configurable por firma, no una regla legal.

---

## 0. Qué produce este procedimiento

Con solo el balance de prueba (y opcionalmente el comparativo), el motor corre las reglas V-xx a
cero tokens y produce:

1. **Hallazgos** con bitácora numerada, severidad, certeza, monto y norma. Uno por cuenta, aunque
   varias reglas la señalen.
2. **Ítems de atención** de tres tipos: documento, juicio, ambigüedad. Cada uno nombra el hallazgo
   que desbloquea.
3. **Materialidad preliminar** propuesta con su razonamiento, como ítem de juicio para el socio.
4. **Limitaciones de la corrida**: qué reglas no pudieron correr y por qué (sin comparativo, sin
   terceros, sin movimientos). Es un entregable, no un error.
5. **Papel de trabajo** del procedimiento, generado al aprobar.

El LLM entra después, por hallazgo, solo para interpretar y redactar sobre los datos que el motor
ya calculó. Nunca calcula montos ni decide severidad por su cuenta.

---

## 1. Preparación (P-xx): antes de validar nada

| ID | Paso | Qué hace | Si falla |
|---|---|---|---|
| P-01 | Lectura del archivo | Lee el .xlsx, detecta encabezados y mapeo con el perfil de la empresa o `detectarMapeo`. Registra filas totales. | Ítem de **ambigüedad**: "confirma qué columna es cada campo". Único caso en que no se puede avanzar. |
| P-02 | Separar resumen de hoja | Una cuenta es **hoja** si ningún otro código del archivo empieza por ella. Las filas con tercero son nivel 8. Los cálculos se hacen sobre hojas; los cruces jerárquicos sobre resumen. | Sin hojas detectables → limitación. |
| P-03 | Convención de signos | Suma los saldos de clases 2, 3 y 4. Si la mayoría es negativa, el archivo está "firmado" (crédito negativo) y se normaliza a saldo natural. Si es mixto sin patrón claro → ítem de **ambigüedad**. | Sin esto, V-20 (naturaleza) daría falsos positivos masivos. |
| P-04 | Período y factor | Toma corte desde/hasta. `factor = meses / 12`. Detecta si hay columnas de movimiento (débito/crédito) del período. | Sin fechas → ítem de juicio "¿qué período cubre?"; mientras tanto asume 12 meses y lo marca. |
| P-05 | Comparativo | Si hay balance del año anterior, lo cruza por código. | Sin comparativo, las reglas V-4x corren contra saldo inicial solo en cuentas de balance y se marcan como "base parcial". |
| P-06 | Catálogo PUC | Carga nombres, clase y **naturaleza por cuenta con excepciones** (ver §7). | Cuenta fuera del PUC → V-12. |
| P-07 | Materialidad preliminar | Calcula bases (activos, ingresos, UAI, patrimonio) y propone materialidad según el perfil de la entidad (§6). Si ya hay materialidad aprobada, la usa. | Nunca bloquea: clasifica con la preliminar y lo dice en la bitácora. |
| P-08 | Memoria de la empresa | Carga descartes previos del auditor para esta empresa ("explicación conocida"). Las reglas descartadas dos veces bajan un nivel de severidad automáticamente. | Sin memoria, primera corrida "en frío". |

---

## 2. Reglas de validación (V-xx)

Convenciones de las tablas:
- **Sev.**: severidad base, antes de los escaladores de §4. `monto` = se calcula por §4.
- **Cert.**: certeza inicial. `ver` verificado · `evi` requiere evidencia · `nov` no verificable.
- **Desbloquea**: documento que resuelve el hallazgo. Es lo que aparece en el ítem de atención.
- M = materialidad · MD = materialidad de desempeño · T = umbral de partidas triviales.

### Bloque A · Integridad del archivo (NIA 500, NIA 230)

Aritmética pura. Todo aquí es `verificado`: o cuadra o no cuadra.

| ID | Regla | Cálculo / umbral | Sev. | Cert. | Desbloquea |
|---|---|---|---|---|---|
| V-01 | Partida doble | Σ saldos hojas naturaleza débito = Σ saldos hojas naturaleza crédito, tolerancia $1 o 0,1 %. | alto | ver | Balance completo o corregido del sistema contable. |
| V-02 | Ecuación patrimonial | Activo = Pasivo + Patrimonio + (4 − 5 − 6 − 7), tolerancia 0,5 % del activo. | alto | ver | Balance completo. |
| V-03 | Jerarquía | Cada cuenta de resumen = Σ de sus hijas del nivel siguiente, tolerancia $2. | alto | ver | Balance completo (suele ser archivo truncado o filtrado). |
| V-04 | Ecuación por fila | Inicial ± movimientos = final, si hay columnas de movimiento. Reporta si falla en > 1 % de las filas. | medio | ver | Reexportar el balance. |
| V-05 | Duplicados | Mismo código sin tercero, o mismo código + NIT repetido. | medio | ver | Reexportar. |
| V-10 | Códigos inválidos | Longitud fuera de {1,2,4,6,8+} o con caracteres no numéricos. | bajo | ver | — |
| V-11 | Cuentas de orden | Clases 8 y 9 presentes: se excluyen de todo cálculo y se informa una sola vez. | info | ver | — |
| V-12 | Fuera del PUC | Código de 4 dígitos que no existe en el catálogo. Suele ser plan propio: se informa agregado. | bajo | ver | Plan de cuentas de la entidad. |
| V-13 | Nombre no coincide | Nombre de la cuenta contradice el PUC (p. ej. 1305 "Proveedores"). Señal de mapeo errado o plan raro. | bajo | ver | — |
| V-14 | Cuentas NIIF-incompatibles | Saldo en 17 cargos diferidos (1710), 19 valorizaciones, 34 revalorización, 47 ajustes por inflación, con marco NIIF/NIIF PYMES. | medio | evi | Política contable / notas del año anterior. |

### Bloque B · Naturaleza y clasificación (NIA 315, NIA 330)

| ID | Regla | Cálculo / umbral | Sev. | Cert. | Desbloquea |
|---|---|---|---|---|---|
| V-20 | Saldo contrario a la naturaleza | Para cada hoja, saldo con signo contrario al catálogo §7 (con excepciones). Monto = |saldo|. | monto | ver | Depende de la cuenta (ver V-21 a V-25). |
| V-21 | Caja o bancos en crédito | 1105 / 1110 / 1120 con saldo crédito. Es sobregiro no reclasificado (→ 2105) o retiros no registrados. Escalador: efectivo. | alto | ver | Extracto bancario y conciliación del mes de corte. |
| V-22 | Clientes en crédito | 1305 con saldo crédito global o por tercero: anticipos de clientes mal clasificados (→ 2805). | monto | ver | Auxiliar de cartera por tercero. |
| V-23 | Proveedores en débito | 2205 / 2335 con saldo débito: anticipos a proveedores (→ 1330) o pagos duplicados. | monto | ver | Auxiliar de proveedores. |
| V-24 | Impuestos en débito | 2365, 2367, 2368, 2404, 2408, 2412 con saldo débito: pagos en exceso, saldo a favor sin reclasificar a 1355, o retenciones mal causadas. Escalador: impuestos. | medio | ver | Declaraciones del período (300, 350) y recibos de pago. |
| V-25 | Obligaciones laborales en débito | 25xx con saldo débito: pagos de prestaciones sin causación previa. | medio | ver | Liquidación de nómina / PILA. |
| V-26 | Resultados con signo raro | 3605 en débito o 3610 en crédito; 3705 / 3710 idem. | medio | ver | Acta de asamblea de distribución. |

### Bloque C · Coherencia entre cuentas (NIA 520 sustantiva, NIIF PYMES)

Relaciones que un auditor con oficio revisa de memoria. Cada una da un cociente y un rango esperado.

| ID | Regla | Cálculo / umbral | Sev. | Cert. | Desbloquea |
|---|---|---|---|---|---|
| V-30 | Deterioro de cartera ausente | 1305 > MD y 1399 = 0. NIIF PYMES §11. | medio | evi | Cartera por edades al corte. |
| V-31 | Días de cartera | 1305 / (41 × factor) × días del período. > 90 días → medio; > 180 → alto. Sin 41 → nov. | monto | evi | Cartera por edades. |
| V-32 | Rotación de inventario | 14 / (61 × factor) × días. > 180 → medio; > 365 → alto. Sin 61 con 14 > MD → nov. NIIF PYMES §13. | monto | evi | Inventario físico / kárdex valorizado. |
| V-33 | Inventario sin costo | 14 > MD y 61 = 0 y 62 = 0. O costo > 0 con 14 = 0 en empresa comercial. | medio | evi | Política de inventarios. |
| V-34 | Depreciación insuficiente | Esperada = (15 − 1504 − 1508) / vida útil promedio (10 años por defecto) × factor. Registrada = movimiento crédito de 1592 o gasto 5160 + 5260. Registrada < 50 % esperada → medio; = 0 con 15 > MD → alto. NIIF PYMES §17, NIA 540. | monto | evi | Relación de activos fijos con vidas útiles. |
| V-35 | Depreciación excede el costo | |1592| > (15 − 1504 − 1508). Aritmético. | alto | ver | Relación de activos fijos. |
| V-36 | Gasto financiero vs deuda | 5305 / (21 promedio) anualizado. Tasa implícita < 3 % o > 40 % → medio. Sin 21 con 5305 > MD → medio (deuda no registrada). | monto | evi | Certificados bancarios de deuda / tabla de amortización. |
| V-37 | Margen bruto | (41 − 4175 − 61) / 41. Negativo → alto. Cae más de 10 puntos vs comparativo → medio. | monto | evi | Explicación de la administración. |
| V-38 | Devoluciones en ventas | 4175 / 41 > 5 % → medio (corte de ingresos, NIA 240). | monto | evi | Notas crédito del período. |
| V-39 | Ingresos no operacionales relevantes | 42 > 20 % de 41, o 4295 diversos > MD. | monto | evi | Auxiliar de 42 con soportes. |

### Bloque D · Cuentas bolsa y señales de fraude (NIA 240, NIA 550)

| ID | Regla | Cálculo / umbral | Sev. | Cert. | Desbloquea |
|---|---|---|---|---|---|
| V-40 | Cuentas bolsa | 1380, 2380, 4295, 5195, 5295, 5395 con saldo > MD. Las "diversos/varios" absorben lo que nadie clasificó. | monto | evi | Auxiliar detallado de la cuenta. |
| V-41 | Caja alta | 1105 > MD o > 30 días de ingresos. Efectivo sin control es el riesgo NIA 240 número uno en PYME. | monto | evi | Arqueo de caja al corte. |
| V-42 | Préstamos a socios | 1325 > T. Riesgo fiscal (intereses presuntivos, ET art. 35) y distribución encubierta. Escalador: partes relacionadas. | monto | evi | Contrato de mutuo y acta que lo autoriza. |
| V-43 | Préstamos de socios | 2355 > MD. Revelación de partes relacionadas (NIA 550, NIIF PYMES §33). | monto | evi | Contrato / soporte del ingreso del dinero. |
| V-44 | Saldos redondos en estimaciones | Saldos múltiplos exactos de $1.000.000 en 1399, 1499, 1592, 26xx. Señal de cifra "puesta" en vez de calculada. | bajo | evi | Memoria de cálculo de la provisión. |
| V-45 | Movimiento en patrimonio | Movimiento del período en 31, 33, 37 o débitos en 36. Requiere decisión de asamblea. | medio | evi | Acta de asamblea / reforma / certificado de cámara. |
| V-46 | Mismo tercero deudor y acreedor | Un NIT con saldo en 1305 y en 2205/2335. Posible compensación indebida o cruce pendiente. Requiere nivel 8. | monto | evi | Estado de cuenta con el tercero. |
| V-47 | Sin movimiento pero material | Cuenta con saldo > MD y débitos = créditos = 0 en el período. Partida vieja sin gestión (cartera, anticipos, CxP). | monto | evi | Auxiliar / gestión de cobro o pago. |

### Bloque E · Tributario y laboral (Estatuto Tributario, CST, NIIF PYMES §28 y §29)

Aquí el balance solo insinúa; la prueba está en las declaraciones. Todas piden documento.

| ID | Regla | Cálculo / umbral | Sev. | Cert. | Desbloquea |
|---|---|---|---|---|---|
| V-50 | Provisión de renta ausente | UAI = 4 − 5 − 6 − 7 + 54 > 0 y 5405 = 0. Estimación = UAI × 35 %. En cortes intermedios baja a medio y pregunta si la entidad provisiona mensualmente (memoria por empresa). | alto | evi | Política de provisión / cálculo de renta. |
| V-51 | Provisión de renta desviada | 5405 fuera de ±20 % de UAI × tarifa. | medio | evi | Conciliación fiscal. |
| V-52 | IVA generado vs ingresos | IVA generado / 41 > 19 % → alto (error). = 0 con 41 > 0 → juicio "¿responsable de IVA?" (se responde solo con el RUT cargado). | monto | evi | Formularios 300 del período. |
| V-53 | Retención en la fuente por pagar | 2365 saldo > 2,5 veces el promedio mensual causado, o = 0 con gastos > MD. | medio | evi | Formularios 350 del período. |
| V-54 | Retenciones sufridas acumuladas | 1355 crece año a año sin consumirse en renta; o 135515 / 41 > 4 %. | monto | evi | Certificados de retención. |
| V-55 | Prestaciones sociales vs sueldos | Si hay subcuentas 5105/5205: (cesantías + intereses + prima + vacaciones) / sueldos fuera de 20 %–24 % (esperado ≈ 21,8 %). Sin subcuentas → nov. | medio | evi | Liquidación de nómina. |
| V-56 | Aportes vs sueldos | (aportes EPS + pensión + ARL + parafiscales) / sueldos fuera de 4 %–35 % (rango cubre exoneración Ley 1607). | medio | evi | Planillas PILA. |
| V-57 | Pasivo laboral sin gasto | 25xx > MD con 5105 + 5205 = 0, o al revés. | medio | evi | Nómina del período. |
| V-58 | Pasivos estimados sin soporte | 26xx > MD. NIIF PYMES §21 exige obligación presente y estimación fiable. | monto | evi | Memoria de cálculo de la provisión. |

### Bloque F · Terceros (NIA 505, NIA 530) — solo si el balance trae nivel 8

| ID | Regla | Cálculo / umbral | Sev. | Cert. | Desbloquea |
|---|---|---|---|---|---|
| V-60 | NIT inválido | Dígito de verificación colombiano no cuadra, o NIT genérico (222222222, 000…). | bajo | ver | Corrección en el sistema. |
| V-61 | Tercero sin identificar | Nombre vacío, "varios", "por identificar", "N/A". Monto = Σ. | monto | ver | Auxiliar identificado. |
| V-62 | Concentración de cartera | Tercero > 20 % de 1305, o top 5 > 60 %. | monto | evi | Cartera por edades del tercero. |
| V-63 | Concentración de proveedores | Tercero > 30 % de 2205. | monto | evi | Estado de cuenta. |
| V-64 | Tercero con saldo contrario | Tercero individual con signo contrario a la cuenta aunque el total cuadre. | monto | ver | Auxiliar del tercero. |
| V-65 | Candidatos a confirmación | Terceros con saldo > MD en 1305, 2205, 1110, 21. Salida: lista propuesta para NIA 505, que alimenta la tabla de muestras existente. | info | — | Circularización. |

### Bloque G · Variaciones y tendencia (NIA 520 de planeación)

Corren contra el comparativo real. Sin comparativo, solo contra saldo inicial en clases 1, 2, 3, y la
bitácora lo dice.

| ID | Regla | Cálculo / umbral | Sev. | Cert. | Desbloquea |
|---|---|---|---|---|---|
| V-70 | Variación inusual | |Δ| ≥ 30 % y |Δ$| ≥ T. Se reporta por cuenta de nivel 4; las hijas se muestran dentro del hallazgo. | monto | evi | Explicación de la administración / auxiliar. |
| V-71 | Cambio de signo | Cuenta que pasó de débito a crédito o viceversa. | monto | evi | Auxiliar. |
| V-72 | Cuenta nueva material | Sin saldo el año anterior, > MD ahora. | monto | evi | Soporte del origen. |
| V-73 | Cuenta desaparecida | Con saldo > MD el año anterior, cero ahora. | monto | evi | Soporte de la cancelación. |
| V-74 | Cartera crece más que ventas | Δ1305 − Δ41 > 20 puntos. Ya existe en `detectarBanderas`. | medio | evi | Cartera por edades. |
| V-75 | Inventario crece más que costo | Δ14 − Δ61 > 20 puntos. Existe. | medio | evi | Kárdex. |
| V-76 | Gastos crecen más que ingresos | Δ(5+6) − Δ41 > 10 puntos. Existe. | bajo | evi | — |

### Bloque H · Negocio en marcha y patrimonio (NIA 570, Ley 2069 de 2020 art. 4, Decreto 1378 de 2021)

| ID | Regla | Cálculo / umbral | Sev. | Cert. | Desbloquea |
|---|---|---|---|---|---|
| V-80 | Patrimonio negativo | 2 > 1. Indicador directo de no cumplimiento de la hipótesis de negocio en marcha. | alto | ver | Plan de la administración / acta. |
| V-81 | Pérdidas acumuladas altas | |3710| + |3610| > 50 % de 3105. Ya no es causal legal de disolución, pero sigue siendo indicador NIA 570. | alto | ver | Acta de asamblea. |
| V-82 | Razón corriente | (11+12+13+14) / (21+22+23+24+25) < 1 → medio; < 0,7 → alto. Aproximado: el balance no separa corriente. | monto | evi | Vencimientos de la deuda. |
| V-83 | Endeudamiento | 2 / 1 > 70 % → medio; > 90 % → alto. | monto | evi | — |
| V-84 | Pérdida del ejercicio | 4 − 5 − 6 − 7 < 0. | medio | ver | — |
| V-85 | Reserva legal | Solo si tipo societario lo exige (S.A. y Ltda., C.Co. art. 452 y 371; S.A.S. no). 3305 < 50 % de 3105 y utilidad > 0 sin apropiación. Sin tipo societario conocido → juicio. | bajo | evi | Acta de asamblea. |
| V-86 | Capital vs cámara | 3105 distinto del capital del certificado de cámara cargado en documentos de la empresa. Etapa siguiente: requiere leer el PDF. | medio | evi | Certificado de cámara vigente. |

---

## 3. Certeza: qué significa cada estado

| Estado | Cuándo | Qué hace el agente |
|---|---|---|
| **verificado** | La regla se prueba con el balance solo. Aritmética o signo. | Redacta la conclusión. Listo para aprobar. |
| **requiere_evidencia** | El balance muestra la anomalía pero la explicación está fuera. | Crea el ítem de atención con el documento exacto y el hallazgo que desbloquea. Sigue con lo demás. |
| **no_verificable** | La regla no pudo correr por falta de datos (sin comparativo, sin terceros, sin movimientos, sin subcuentas). | Lo registra una sola vez en "limitaciones de la corrida", no como hallazgo por regla. Si al cierre sigue así, es limitación al alcance documentada (NIA 705). |

Regla de oro: **si no se puede rastrear a un resultado del motor o a una cita normativa, no se escribe.**

---

## 4. Severidad: cálculo determinista

Definiciones: M = materialidad (aprobada o preliminar). MD = 75 % de M. T = 5 % de M.

1. **Por monto** (reglas marcadas `monto`): ≥ M → alto · ≥ MD → medio · ≥ T → bajo · < T → no se reporta individualmente, se agrega en "partidas triviales".
2. **Escaladores** (+1 nivel, tope alto), se aplican si la cuenta o la regla toca: efectivo (11), partes relacionadas (1325, 2355), impuestos (24, 2365-2368, 1355), indicio NIA 240 (bloque D), cumplimiento legal (V-45, V-80, V-81), o afecta el resultado y ≥ MD.
3. **Reguladores** (−1 nivel, piso bajo): corte intermedio para reglas de causación anual (V-50, V-55); descarte previo del auditor para la misma empresa y regla (memoria, §1 P-08).
4. **Reglas sin monto** usan la severidad fija de la tabla.
5. El LLM puede **proponer** subir o bajar con justificación. Eso crea un ítem de juicio; nunca cambia la severidad solo. La bitácora registra ambas.

---

## 5. Control de ruido: lo que NO se reporta

- Nada por debajo de T como hallazgo individual.
- Una tarjeta por cuenta: si V-30, V-31 y V-62 señalan 1305, es un solo hallazgo con tres reglas listadas.
- Saldos en cero: nunca. Cuentas de orden: una línea informativa.
- Variaciones en cuentas de resultado sin comparativo real: no se calculan.
- Reglas descartadas dos veces por la firma para la misma empresa: bajan un nivel y se agrupan al final.
- Máximo visible por defecto: hallazgos ordenados por severidad y monto; el resto colapsado bajo "otros".

---

## 6. Materialidad preliminar (NIA 320)

El motor propone; el socio confirma con un clic o cambia el valor. Mientras no confirme, todo se
clasifica con la preliminar y cada bitácora lo dice.

| Perfil de la entidad | Base | % sugerido |
|---|---|---|
| Operación estable con utilidad | Utilidad antes de impuestos | 5 % |
| Pérdidas o utilidad volátil | Ingresos | 1 % |
| Intensiva en activos (inmobiliaria, industrial) | Activos totales | 1 % |
| Sin ánimo de lucro | Gastos totales | 1 % |
| Holding / patrimonial | Patrimonio | 2 % |

Materialidad de desempeño: 75 %. Partidas claramente triviales: 5 %. El perfil se infiere del CIIU
de la empresa y de las bases; si hay duda, ítem de juicio con las dos opciones y sus montos.

---

## 7. Catálogo de naturaleza (insumo del bloque B)

Por defecto: clases 1, 5, 6, 7 débito; clases 2, 3, 4 crédito. Excepciones (cuentas de
naturaleza contraria a su clase):

- Débito dentro de crédito: 4175 devoluciones en ventas · 3610 pérdida del ejercicio · 3710 pérdidas acumuladas · 3110 capital por suscribir.
- Crédito dentro de débito: 1299, 1399, 1499, 1599 provisiones y deterioros · 1592 depreciación acumulada · 1597 agotamiento · 1698 amortización acumulada · 1799 · 1899 · 6210 devoluciones en compras.

Este catálogo se guarda en tabla configurable. Punto de partida: seeder del PUC en contabilidadya,
revisado por la usuaria.

---

## 8. Forma del hallazgo y de la bitácora

```
H-03 · 1110 Bancos · Saldo crédito en cuenta bancaria
Riesgo ALTO · Verificado · −$12.480.000

Descripción   La cuenta 1110 presenta saldo crédito al corte. Su naturaleza es débito;
              un saldo crédito corresponde a un sobregiro no reclasificado o a retiros
              registrados sin ingreso previo.
Datos         saldo −12.480.000 · naturaleza esperada débito · M 8.000.000 · exceso 1,56x
Norma         NIA 315 (riesgo a nivel de aserción) · NIIF PYMES §11 · PUC Decreto 2650
Bitácora
  01  Leí balance_2026Q1.xlsx: 4.127 filas; 892 de resumen y 3.235 hoja (P-02).
  02  Detecté convención firmada: clases 2, 3 y 4 negativas; normalicé (P-03).
  03  Apliqué V-20 sobre 3.235 hojas: 3 cuentas con signo contrario.
  04  1110 está en efectivo: aplica V-21 y escalador "efectivo" (§4).
  05  Contrasté con el comparativo: en 2025 era débito $4.100.000 (V-71).
  06  Severidad ALTO: monto ≥ M (1,56x) y escalador efectivo.
Pide          Extracto bancario y conciliación del mes de corte → desbloquea H-03.
Acciones      Aprobar · Ajustar · Descartar (motivo) · Preguntar
```

Toda acción humana entra a la bitácora con usuario y hora: `07  Laura aprobó el hallazgo`.

---

## 9. Ítems de juicio estándar que produce la primera corrida

1. Confirmar materialidad preliminar (siempre).
2. Convención de signos, solo si P-03 no fue concluyente.
3. Período cubierto, solo si P-04 no lo encontró.
4. ¿La entidad provisiona renta mensualmente? (una sola vez por empresa, queda en memoria).
5. Tipo societario, para V-85 (una sola vez; después se lee del certificado de cámara).
6. Responsabilidades tributarias, para V-52 y V-53 (se leerán del RUT cargado en la etapa siguiente).

---

## 10. Umbrales por defecto (configurables por firma)

| Parámetro | Valor |
|---|---|
| Tolerancia aritmética | $1 por fila · 0,1 % global |
| Variación inusual | 30 % y ≥ T |
| Días de cartera | 90 medio · 180 alto |
| Rotación inventario | 180 medio · 365 alto |
| Vida útil promedio PPE | 10 años |
| Tasa implícita deuda | 3 %–40 % |
| Devoluciones / ventas | 5 % |
| No operacionales / operacionales | 20 % |
| Concentración cartera | 20 % un tercero · 60 % top 5 |
| Caja | > MD o > 30 días de ingresos |
| Prestaciones / sueldos | 20 %–24 % |
| Aportes / sueldos | 4 %–35 % |
| Tarifa renta | 35 % |
| Materialidad de desempeño · triviales | 75 % · 5 % |

---

## 11. Preguntas para calibrar con la usuaria

1. ¿Cómo vienen los saldos en los archivos de tus clientes: firmados, con columna de naturaleza, o con columnas saldo débito / saldo crédito? ¿De qué programas contables?
2. ¿Tus balances suelen traer movimientos del período y terceros, o solo saldos?
3. ¿Qué reglas de la lista te parecen ruido en tus clientes y cuáles te faltan?
4. ¿Los umbrales de §10 se parecen a los que usas?
5. ¿Tus encargos típicos son trimestrales o anuales? Cambia el peso de V-50 y V-55.
