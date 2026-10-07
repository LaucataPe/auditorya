# Procedimiento RI · Revisión agéntica de la declaración de retención de ICA (reteICA) — v1

Fecha: 2026-10-01. Misma infraestructura que IVA y retención en la fuente: motor determinista en
`packages/types/src/agente-reteica.ts`, lectura de la 2368 en `agente-reteica-libros.ts`, registro en
`agente-tributario.ts`, cédulas en `cedulas-tributarias.ts`. El procedimiento de la corrida es `'reteica'`.

Probado con los borradores reales de The People del bimestre 4 de 2026 (Bogotá formulario 131 y Cali) y la 2368
de su balance de Siesa por terceros (anonimizada en `fixtures/balance-siesa-terceros-2368.ts`).

## 1. Insumos

- **Borrador**: cada municipio tiene su formulario. La lectura (LLM, sin casillas estándar) lo lleva a los renglones
  del catálogo: `ri-base`, `ri-base-autorretencion`, `ri-retenciones`, `ri-autorretenciones`, `ri-devoluciones`
  (descuento por devolución, resta), `ri-sanciones`, y el total calculado `ri-total`. Los renglones de bases de
  autorretención, autorretenciones y devoluciones son nuevos (aditivos, sin migración).
- **Libros de la 2368**, mejor por terceros. De cada subcuenta se lee por el nombre (o el de su cuenta padre) el
  **municipio** y la **tarifa por mil** ("23680501 BOGOTA TARIFA 9,66/1000"). Con detalle por tercero:
  créditos = retenciones del período; débitos a proveedores = devoluciones; débitos a la entidad territorial
  (NIT conocido o nombre: secretaría de hacienda, municipio, distrito…) = pago de la declaración anterior, que NO
  se descuenta. Sin detalle por tercero se toma lo retenido (créditos) y no se calculan devoluciones.
- **Municipio de la declaración**: el campo `municipio` de la obligación (migración 0051; obligatorio al crear
  reteICA o ICA, una obligación por municipio en la vigencia); en obligaciones anteriores sin el campo, el del
  nombre ("ReteICA Bogotá"); si no, el que eligió la firma
  (memoria `mapeo2368`, clave `obligacion:<id>`); si no, el único municipio con retención en libros. Si hay varios,
  el agente pregunta (RI-05) y la respuesta queda en la memoria.
- **Revisión del bimestre anterior** en la plataforma.

## 2. Reglas y cédulas

| Cédula | Reglas | Qué hace |
|---|---|---|
| `formulario` | RI-01..RI-04 | Total recalculado; tarifa implícita (retenciones ÷ base, por mil) contra el rango del municipio; retención sin base (hallazgo) y base sin retención (juicio); devoluciones: juicio por soporte, hallazgo si superan las retenciones |
| `lectura-libros` | P-02, P-03, RI-05 | Archivos, municipio de la declaración, clasificación de cada subcuenta (municipio, tarifa, retenido, devuelto, pagado) |
| `libros` | RI-10..RI-13 | Retenciones, devoluciones y autorretenciones declaradas contra la 2368 del municipio (tolerancia: redondeo a miles); base declarada contra la base que explican las retenciones a su tarifa (margen 5 %, juicio) |
| `tarifas` | RI-15 | Tarifa de cada subcuenta del municipio contra las admisibles (juicio si no está); retención por proveedor |
| `territorialidad` | RI-20 | Retenciones de otros municipios en la 2368 y si la empresa tiene esa obligación de reteICA en la plataforma (juicio si no) |
| `periodo-anterior` | RI-30 | Variación de las retenciones > 50 % (juicio) |
| `oportunidad` | RI-31, RI-32 | Presentación tardía (hallazgo); sanciones y pago del total (juicio) |

Limitación declarada: RI-40, cruce con la facturación electrónica recibida (etapa siguiente).

## 3. Lo que encontró con los archivos reales (bimestre 4 de 2026)

- Bogotá: retenciones declaradas 2.307.000 contra 2.306.695 en libros → conforme. Devoluciones declaradas 12.000
  contra 22.466 debitados a proveedores → diferencia de 10.466 (hallazgo). Base declarada 224.910.000 contra
  ~226 millones explicados por las retenciones → dentro del 5 %. Subcuentas al 7,66 y 8,66 por mil → fuera de la
  tabla de Bogotá (juicio).
- Cali: 57.000 declarados contra 57.340 en libros → conforme. El traslado de las subcuentas por tarifa a la de
  pago se reconoce como pago al municipio, no como devolución.

## 4. Pendiente de validar (Laura)

1. Tarifas de Bogotá en `MUNICIPIOS_RETEICA`: 4,14 · 6,9 · 7 · 9,66 · 11,04 · 13,8 por mil. ¿Qué son las de
   7,66 y 8,66 que usa The People?
2. Solo Bogotá tiene tabla de tarifas; Cali y los demás muestran las tarifas sin calificarlas. Pasar las tablas de
   los municipios donde tengan clientes.
3. NIT de las entidades territoriales: solo Bogotá (899999061) y Cali (890399011) están cargados; los demás se
   reconocen por el nombre del tercero.
4. Rango de tarifa implícita sin tabla del municipio: 1 a 15 por mil. Margen de la base: 5 %.
5. La lectura del borrador sigue siendo con el LLM (cada municipio tiene su formulario): conviene probarla con los
   dos PDF reales antes de usarla con clientes.
