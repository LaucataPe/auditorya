# Procedimiento IC · Revisión agéntica de la declaración de ICA (Formulario Único Nacional) — v1

Fecha: 2026-10-02. Misma infraestructura que IVA, retención en la fuente y reteICA: motor determinista en
`packages/types/src/agente-ica.ts`, lectura de libros en `agente-ica-libros.ts`, registro en `agente-tributario.ts`,
cédulas en `cedulas-tributarias.ts`. El procedimiento de la corrida es `'ica'`.

Probado con dos borradores reales del bimestre 4 de 2026 en Bogotá (una empresa industrial de alimentos con cuatro
actividades y una productora audiovisual con una) y el balance de prueba de World Office del mismo bimestre de la
primera (anonimizado en `fixtures/balance-worldoffice-ica.ts`, solo cuentas agregadas, sin terceros).

## 1. Insumos

- **Borrador**: Formulario Único Nacional de declaración y pago del ICA (Resolución 4056 de 2016 de MinHacienda), el
  mismo en Bogotá y en los demás municipios. A diferencia de reteICA, tiene renglones numerados, así que la lectura es
  la misma que la de los formularios 300 y 350: la fuente solo transcribe renglón → valor y
  `aplicarLecturaFormulario` mapea y cuadra los totales (10, 16, 20, 25, 33/34 y 38). La sección C (discriminación de
  actividades) no tiene número de renglón: se transcribe con las claves `actN_ingresos` / `actN_impuesto` (hasta 15
  actividades, incluida la hoja de "otras actividades") y su total se cuadra contra el renglón 16. El código y la
  tarifa no se guardan: la tarifa sale de impuesto ÷ ingresos.
- **Catálogo de cifras**: `CIFRAS_CATALOGO.ica` es ahora espejo del formulario (renglones 8 a 38) más la matriz de
  actividades (`compacta`: solo muestra las filas con valor y una vacía). Se conservaron los ids anteriores donde el
  renglón significa lo mismo (`ica-ingresos` 8, `ica-base` 16, `ica-impuesto` 17, `ica-avisos` 21, `ica-unidades` 22,
  `ica-retenciones` 27, `ica-saldo` 33/34). Desaparece `ica-deducciones` (el formulario las separa en 9, 11 a 15);
  en la base local no había revisiones de ICA con cifras.
- **Libros del período** (balance de prueba o auxiliar), cuenta por cuenta:
  - Clase 4: créditos de las cuentas de ingreso = renglón 8. Si el nombre de la cuenta nombra otro municipio, ese
    ingreso va al 9. Devoluciones, rebajas, descuentos y anulaciones (4175 o por el nombre) = 11. Ventas al exterior
    (solo clase 41, por el nombre) = 12, **netas de sus devoluciones y anulaciones**, que por eso no van en el 11.
    Venta de activos fijos (4245) = 13.
  - No sujetos y exentos (14 y 15) no se reconocen por el nombre: la firma clasifica las cuentas de la clase 42 una
    vez y queda en la memoria de la empresa (`mapeoIca`: cuenta → `no-sujeto` | `exento` | `gravado`).
  - 135518 (y cuentas 1355 con "industria y comercio"): débitos = retenciones que le practicaron (27). 135510 =
    anticipo (informativo).
  - 2412 y el gasto de industria y comercio: causación, para cruzar con el impuesto a cargo.
- **Municipio de la declaración**: el campo `municipio` de la obligación (o su nombre en las anteriores al campo).
- **Revisión del período anterior** en la plataforma.

Mejora transversal en `parse-balance-periodo`: si una subcuenta (6 dígitos o más) mueve más que la suma de sus hijas,
la diferencia queda como hoja "sin detalle" con advertencia. World Office no exportó una subcuenta de la 415505
(8.923.600). Solo aplica a archivos jerárquicos por PUC (cada código con su padre natural); Siesa no lo es.

## 2. Reglas y cédulas

| Cédula | Reglas | Qué hace |
|---|---|---|
| `formulario` | IC-01..IC-06 | Totales recalculados; ingresos por actividad contra el 16 y su impuesto contra el 17 (hallazgo); tarifa de cada actividad contra las del ICA del municipio (juicio); avisos y tableros al 15 % del 20 (hallazgo); sobretasas bomberil y de seguridad (juicio: la tarifa depende del acuerdo) |
| `lectura-libros` | P-02, P-03 | Archivos y cada cuenta con el renglón al que va |
| `ingresos-libros` | IC-10..IC-14 | Renglones 8, 9, 11, 12 y 13 contra libros (hallazgo, con las cuentas que los explican); base gravable según libros e impuesto estimado a la tarifa promedio declarada |
| `deducciones` | IC-09, IC-15, IC-16 | Cuentas de la clase 42 que pesan ≥ 5 % de lo restado: ambigüedad a la memoria; 14 y 15 contra libros si ya hay clasificación (hallazgo), si no juicio por la norma |
| `territorialidad` | IC-20 | Ingresos de otros municipios en libros y si la empresa tiene esa obligación de ICA en la plataforma (juicio); renglón 9 sin cuentas por municipio (juicio) |
| `retenciones` | IC-21..IC-25 | 27 contra la 135518 (hallazgo si las subcuentas separan municipios o la empresa solo opera en uno; si no, juicio); 28; anticipos 29 y 30 (juicio); saldo a favor 32 contra el 34 anterior (hallazgo si imputa de más); impuesto a cargo contra los créditos de 2412 (juicio; informativo si aún no está causado) |
| `periodo-anterior` | IC-30 | Variación de la base y del impuesto a cargo > 50 % (juicio) |
| `oportunidad` | IC-40, IC-41 | Presentación tardía (hallazgo); sanciones y pago del total (juicio) |

Limitación declarada: IC-50, cruce de los ingresos con la facturación electrónica emitida (etapa siguiente).

## 3. Lo que encontró con los archivos reales (bimestre 4 de 2026, Bogotá)

- Formulario coherente: las cuatro actividades suman el 16 (5.814.306.000); su impuesto (24.342.273) cuadra con el 17
  redondeado; tarifas 4,14 · 14 · 4,14 · 9,66 por mil, todas de Bogotá; avisos 3.651.000 = 15 % del 20.
- Renglón 9 (320.101.000) = ingresos de la cuenta "FUNZA PRODUCCION EXCLUIDOS" → conforme. La empresa no tiene la
  obligación de ICA de Funza en la plataforma (juicio).
- Ingresos brutos: 7.958.955.000 declarados contra 8.049.900.947 en libros (hallazgo de 90.945.947).
- Devoluciones: 1.043.318.000 contra 864.956.313 sin las de exportaciones. Las exportaciones declaradas
  (504.006.000) ya van netas de la anulación de ventas al exterior (186.157.214), y esa anulación parece estar también
  en el 11: **restada dos veces**. El hallazgo lo advierte.
- Exportaciones: la exportación de maíz (46.237.016) no se restó (hallazgo de 45.049.791).
- Renglón 14 (277.224.000) = diferencia en cambio realizada (42102005, 277.223.767). El agente pregunta si es no
  sujeta; al clasificarla, el 14 cuadra.
- Base según libros 6.038.563.863 contra 5.814.306.000 declarados: unos 939 mil más de impuesto si se corrige.
- Retenciones: 10.003.000 declarados contra 9.744.676 debitados en la 135518; las subcuentas no separan municipios
  (juicio).
- El impuesto del bimestre aún no está causado en la 2412 (informativo).
- La sobretasa bomberil (243.000, 1 % del ICA) queda como juicio.

## 4. Pendiente de validar (Laura)

1. Tarifas del ICA de Bogotá en `MUNICIPIOS_RETEICA[bogota].tarifasIca`: las de retención más 14 por mil
   (financieras, la que trae el borrador real para la actividad 64991). ¿Faltan otras?
2. Rango sin tabla del municipio: 2 a 14 por mil.
3. Exportaciones netas de sus devoluciones y anulaciones (y por eso fuera del 11). ¿Así lo declaran sus clientes?
4. Renglón 8 por créditos brutos: los débitos de las cuentas de ingreso no se restan (pueden ser el cierre).
5. ¿Bogotá cobra la sobretasa bomberil en el ICA? El borrador real la liquida al 1 %.
6. El workflow de n8n recibe `tipo: 'ica'`: debe devolver los renglones y las claves `actN_*`; si falla, la lectura
   cae al LLM.
7. Probar la lectura con los dos PDF reales (uno es imagen escaneada: entra por OCR).
