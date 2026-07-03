import type { AreaRiesgo } from './riesgo'

export type TipoPrueba = 'control' | 'detalle' | 'analitica'

export const TIPO_PRUEBA_LABEL: Record<TipoPrueba, string> = {
  control: 'Prueba de control',
  detalle: 'Sustantiva de detalle',
  analitica: 'Analítica sustantiva',
}

export type PruebaEstandar = {
  titulo: string
  aserciones: string[]
  procedimiento: string
  tipo: TipoPrueba
  /** Documentos que el cliente debe entregar para ejecutar la prueba (base de la lista PBC). */
  documentosRequeridos: string[]
  /** Pasos concretos del procedimiento (NIA 330/500). Guía para el auditor. */
  guia: string[]
}

/**
 * Programa de auditoría — pruebas estándar por área/ciclo (NIA 330/500).
 * Es un punto de partida: el auditor selecciona y adapta según los riesgos.
 * `documentosRequeridos` alimenta la lista PBC (Prepared By Client) y `guia`
 * ofrece los pasos del procedimiento.
 */
export const PROGRAMA_AUDITORIA: Record<AreaRiesgo, PruebaEstandar[]> = {
  efectivo: [
    {
      titulo: 'Confirmación bancaria',
      aserciones: ['existencia', 'derechos'],
      tipo: 'detalle',
      procedimiento: 'Solicitar confirmación directa a las entidades financieras de los saldos y obligaciones al cierre; comparar con los registros contables e investigar diferencias.',
      documentosRequeridos: ['Listado de cuentas bancarias y de inversión al cierre', 'Extractos bancarios del período', 'Autorización firmada para solicitar confirmaciones'],
      guia: ['Obtener el listado completo de cuentas y bancos al cierre', 'Enviar la solicitud de confirmación directamente a cada entidad financiera', 'Conciliar las respuestas con los saldos contables', 'Investigar y documentar las diferencias'],
    },
    {
      titulo: 'Conciliaciones bancarias',
      aserciones: ['existencia', 'valuación'],
      tipo: 'detalle',
      procedimiento: 'Revisar las conciliaciones bancarias al cierre; verificar la razonabilidad y antigüedad de las partidas conciliatorias.',
      documentosRequeridos: ['Conciliaciones bancarias al cierre', 'Extractos bancarios de cierre', 'Auxiliar contable de bancos'],
      guia: ['Obtener las conciliaciones preparadas por la entidad', 'Verificar la aritmética y el amarre saldo banco vs. saldo libros', 'Analizar la antigüedad de las partidas conciliatorias', 'Revisar la depuración de partidas antiguas'],
    },
    {
      titulo: 'Arqueo de caja y fondos',
      aserciones: ['existencia'],
      tipo: 'detalle',
      procedimiento: 'Realizar arqueo de caja menor y fondos fijos, y conciliar con los registros.',
      documentosRequeridos: ['Relación de cajas menores y fondos fijos', 'Auxiliar contable de caja'],
      guia: ['Realizar el conteo físico del efectivo en presencia del responsable', 'Conciliar el conteo con el saldo contable', 'Verificar los soportes de reembolso pendientes', 'Documentar diferencias y firmar el acta de arqueo'],
    },
    {
      titulo: 'Corte de movimientos de tesorería',
      aserciones: ['corte'],
      tipo: 'detalle',
      procedimiento: 'Verificar que los ingresos y egresos cercanos al cierre se registraron en el período correcto.',
      documentosRequeridos: ['Comprobantes de ingreso y egreso alrededor del cierre', 'Extractos bancarios de los últimos días del período y primeros del siguiente'],
      guia: ['Seleccionar los movimientos de los días previos y posteriores al cierre', 'Cotejar la fecha de registro contra la fecha de la transacción bancaria', 'Confirmar que quedaron en el período correcto'],
    },
  ],
  cartera: [
    {
      titulo: 'Circularización a clientes',
      aserciones: ['existencia', 'derechos'],
      tipo: 'detalle',
      procedimiento: 'Enviar solicitudes de confirmación de saldos a una muestra de clientes; realizar procedimientos alternativos ante no respuestas e investigar diferencias.',
      documentosRequeridos: ['Detalle de cartera por cliente al cierre', 'Datos de contacto de los clientes', 'Autorización para circularizar'],
      guia: ['Definir la muestra de clientes a confirmar', 'Enviar las cartas de confirmación de saldos', 'Aplicar procedimientos alternativos (recaudos posteriores, facturas) ante no respuestas', 'Conciliar e investigar diferencias'],
    },
    {
      titulo: 'Análisis de antigüedad y deterioro',
      aserciones: ['valuación'],
      tipo: 'detalle',
      procedimiento: 'Analizar la antigüedad de la cartera y evaluar la suficiencia del deterioro (provisión de incobrables).',
      documentosRequeridos: ['Reporte de cartera por edades', 'Política de deterioro / provisión de incobrables', 'Cálculo de la provisión'],
      guia: ['Obtener el reporte de cartera por edades al cierre', 'Evaluar la razonabilidad de la política de deterioro', 'Recalcular la provisión y compararla con la registrada', 'Concluir sobre la suficiencia del deterioro'],
    },
    {
      titulo: 'Recaudos posteriores',
      aserciones: ['valuación', 'existencia'],
      tipo: 'detalle',
      procedimiento: 'Revisar los recaudos posteriores al cierre como evidencia de la recuperabilidad de los saldos.',
      documentosRequeridos: ['Auxiliar de recaudos posteriores al cierre', 'Comprobantes de ingreso posteriores'],
      guia: ['Seleccionar los saldos más significativos de la cartera', 'Rastrear los recaudos posteriores al cierre', 'Concluir sobre la existencia y recuperabilidad del saldo'],
    },
    {
      titulo: 'Corte de ventas',
      aserciones: ['corte'],
      tipo: 'detalle',
      procedimiento: 'Verificar que las ventas y devoluciones cercanas al cierre se registraron en el período correcto.',
      documentosRequeridos: ['Facturas y remisiones alrededor del cierre', 'Notas crédito por devoluciones'],
      guia: ['Seleccionar las últimas y primeras facturas del corte', 'Cotejar la fecha de despacho/remisión contra la fecha de registro', 'Verificar que las devoluciones quedaron en el período correcto'],
    },
  ],
  inventarios: [
    {
      titulo: 'Observación de toma física',
      aserciones: ['existencia'],
      tipo: 'detalle',
      procedimiento: 'Presenciar el conteo físico de inventarios y realizar conteos de prueba en ambos sentidos.',
      documentosRequeridos: ['Instructivo de la toma física', 'Listados de conteo', 'Kardex / auxiliar de inventarios al cierre'],
      guia: ['Presenciar el conteo físico y evaluar los controles del proceso', 'Realizar conteos de prueba del piso al registro y del registro al piso', 'Documentar diferencias e investigarlas', 'Verificar el corte de movimientos durante el conteo'],
    },
    {
      titulo: 'Pruebas de valuación',
      aserciones: ['valuación'],
      tipo: 'detalle',
      procedimiento: 'Verificar el costeo del inventario y compararlo contra el valor neto de realización.',
      documentosRequeridos: ['Detalle de inventario valorizado', 'Soportes de costeo (facturas de compra, hojas de costo)', 'Referencias de precios de venta'],
      guia: ['Seleccionar una muestra de referencias', 'Verificar el costo unitario contra sus soportes', 'Comparar el costo contra el valor neto de realización', 'Evaluar la necesidad de ajuste a VNR'],
    },
    {
      titulo: 'Obsoletos y de lento movimiento',
      aserciones: ['valuación'],
      tipo: 'detalle',
      procedimiento: 'Identificar inventario obsoleto o de lento movimiento y evaluar la provisión correspondiente.',
      documentosRequeridos: ['Reporte de rotación / antigüedad del inventario', 'Cálculo de la provisión de obsolescencia'],
      guia: ['Analizar la rotación y antigüedad del inventario', 'Identificar referencias sin movimiento o dañadas', 'Evaluar la suficiencia de la provisión de obsolescencia'],
    },
    {
      titulo: 'Corte de inventarios',
      aserciones: ['corte'],
      tipo: 'detalle',
      procedimiento: 'Revisar los últimos y primeros documentos de entrada y salida alrededor del cierre.',
      documentosRequeridos: ['Documentos de entrada y salida alrededor del cierre', 'Últimas remisiones y facturas del período'],
      guia: ['Obtener los últimos y primeros documentos de entrada/salida del corte', 'Verificar que se registraron en el período correcto', 'Conciliar con la toma física'],
    },
  ],
  propiedad_planta_equipo: [
    {
      titulo: 'Inspección física de activos',
      aserciones: ['existencia'],
      tipo: 'detalle',
      procedimiento: 'Inspeccionar físicamente una muestra de activos y conciliarla con el registro de propiedad, planta y equipo.',
      documentosRequeridos: ['Registro / auxiliar de propiedad, planta y equipo', 'Ubicación de los activos'],
      guia: ['Seleccionar una muestra del registro de PPE', 'Inspeccionar físicamente los activos y verificar su estado', 'Conciliar la existencia con el registro contable'],
    },
    {
      titulo: 'Recálculo de depreciación',
      aserciones: ['valuación'],
      tipo: 'detalle',
      procedimiento: 'Recalcular la depreciación del período y verificar tasas, métodos y vidas útiles.',
      documentosRequeridos: ['Auxiliar de depreciación', 'Política de vidas útiles y métodos'],
      guia: ['Verificar las vidas útiles y métodos aplicados', 'Recalcular la depreciación del período', 'Comparar con la registrada e investigar diferencias'],
    },
    {
      titulo: 'Adiciones y retiros del período',
      aserciones: ['derechos', 'exactitud'],
      tipo: 'detalle',
      procedimiento: 'Revisar los soportes de las adiciones y bajas del período y su adecuada capitalización.',
      documentosRequeridos: ['Detalle de adiciones y retiros del período', 'Facturas de compra y soportes de baja'],
      guia: ['Seleccionar las adiciones y retiros significativos', 'Verificar los soportes y la titularidad', 'Evaluar el criterio de capitalización vs. gasto'],
    },
    {
      titulo: 'Evaluación de deterioro',
      aserciones: ['valuación'],
      tipo: 'detalle',
      procedimiento: 'Evaluar la existencia de indicios de deterioro y su reconocimiento.',
      documentosRequeridos: ['Análisis de indicios de deterioro', 'Cálculo del valor recuperable (si aplica)'],
      guia: ['Identificar indicios de deterioro (obsolescencia, desuso, daño)', 'Cuando existan indicios, evaluar el cálculo del valor recuperable', 'Concluir sobre el reconocimiento del deterioro'],
    },
  ],
  proveedores: [
    {
      titulo: 'Confirmación a proveedores',
      aserciones: ['integridad', 'obligaciones'],
      tipo: 'detalle',
      procedimiento: 'Circularizar a una muestra de proveedores y conciliar los saldos; investigar diferencias.',
      documentosRequeridos: ['Detalle de cuentas por pagar por proveedor', 'Datos de contacto de los proveedores'],
      guia: ['Seleccionar la muestra de proveedores (priorizar saldos altos y de mayor movimiento)', 'Enviar las confirmaciones', 'Conciliar respuestas con el auxiliar e investigar diferencias'],
    },
    {
      titulo: 'Búsqueda de pasivos no registrados',
      aserciones: ['integridad'],
      tipo: 'detalle',
      procedimiento: 'Revisar pagos y facturas posteriores al cierre para detectar pasivos omitidos.',
      documentosRequeridos: ['Pagos posteriores al cierre', 'Facturas recibidas después del cierre', 'Órdenes de compra pendientes'],
      guia: ['Revisar los desembolsos posteriores al cierre', 'Rastrear facturas de fecha anterior al cierre no registradas', 'Concluir sobre la integridad de los pasivos'],
    },
    {
      titulo: 'Corte de compras',
      aserciones: ['corte'],
      tipo: 'detalle',
      procedimiento: 'Verificar el registro de compras cercanas al cierre en el período correcto.',
      documentosRequeridos: ['Entradas de almacén y facturas de compra alrededor del cierre'],
      guia: ['Seleccionar las últimas y primeras compras del corte', 'Cotejar la fecha de recepción contra la de registro', 'Confirmar el período correcto'],
    },
  ],
  nomina: [
    {
      titulo: 'Recálculo de nómina y prestaciones',
      aserciones: ['exactitud', 'integridad'],
      tipo: 'detalle',
      procedimiento: 'Recalcular la liquidación de una muestra de la nómina y las prestaciones sociales consolidadas.',
      documentosRequeridos: ['Nómina detallada del período', 'Liquidación de prestaciones sociales', 'Contratos de una muestra de empleados'],
      guia: ['Seleccionar una muestra de empleados', 'Recalcular devengados, deducciones y neto', 'Recalcular la provisión de prestaciones sociales', 'Comparar con lo registrado'],
    },
    {
      titulo: 'Seguridad social y parafiscales',
      aserciones: ['integridad', 'cumplimiento'],
      tipo: 'detalle',
      procedimiento: 'Verificar la liquidación y el pago de aportes a seguridad social y parafiscales.',
      documentosRequeridos: ['Planillas PILA del período', 'Soportes de pago de aportes'],
      guia: ['Cotejar la base de aportes contra la nómina', 'Verificar la liquidación de la planilla PILA', 'Confirmar el pago oportuno de los aportes'],
    },
    {
      titulo: 'Existencia del personal',
      aserciones: ['existencia'],
      tipo: 'detalle',
      procedimiento: 'Cotejar la nómina con los contratos y soportes del personal.',
      documentosRequeridos: ['Listado de personal activo', 'Contratos y hojas de vida de una muestra'],
      guia: ['Seleccionar una muestra de la nómina', 'Verificar la existencia real del empleado (contrato, soportes)', 'Descartar empleados ficticios'],
    },
  ],
  impuestos: [
    {
      titulo: 'Recálculo de impuestos',
      aserciones: ['exactitud'],
      tipo: 'detalle',
      procedimiento: 'Recalcular el impuesto de renta y el IVA, y conciliarlos con las declaraciones presentadas.',
      documentosRequeridos: ['Declaraciones de renta e IVA del período', 'Papeles de trabajo de la liquidación fiscal'],
      guia: ['Recalcular la base gravable y el impuesto', 'Conciliar con las declaraciones presentadas', 'Investigar diferencias con el saldo contable'],
    },
    {
      titulo: 'Conciliación fiscal',
      aserciones: ['exactitud', 'integridad'],
      tipo: 'detalle',
      procedimiento: 'Conciliar la información contable con las declaraciones tributarias del período.',
      documentosRequeridos: ['Conciliación contable-fiscal', 'Declaraciones tributarias del período'],
      guia: ['Obtener la conciliación entre la contabilidad y las declaraciones', 'Verificar las partidas conciliatorias', 'Concluir sobre la razonabilidad de los saldos fiscales'],
    },
    {
      titulo: 'Retenciones en la fuente',
      aserciones: ['integridad'],
      tipo: 'detalle',
      procedimiento: 'Verificar la práctica, declaración y pago de las retenciones en la fuente.',
      documentosRequeridos: ['Declaraciones de retención en la fuente', 'Auxiliar de retenciones practicadas'],
      guia: ['Verificar la correcta práctica de retenciones sobre una muestra de pagos', 'Cotejar con las declaraciones presentadas', 'Confirmar el pago oportuno'],
    },
  ],
  ingresos: [
    {
      titulo: 'Pruebas de corte de ingresos',
      aserciones: ['corte'],
      tipo: 'detalle',
      procedimiento: 'Verificar que los ingresos se reconocieron en el período correcto alrededor del cierre.',
      documentosRequeridos: ['Facturas de venta y remisiones alrededor del cierre', 'Contratos con clientes (si aplica)'],
      guia: ['Seleccionar los ingresos de los días previos y posteriores al cierre', 'Verificar el cumplimiento de la obligación de desempeño', 'Confirmar el reconocimiento en el período correcto'],
    },
    {
      titulo: 'Pruebas de detalle de ingresos',
      aserciones: ['ocurrencia', 'exactitud'],
      tipo: 'detalle',
      procedimiento: 'Revisar soportes de una muestra de ingresos (facturas, contratos, remisiones).',
      documentosRequeridos: ['Detalle de ingresos del período', 'Facturas, contratos y remisiones de la muestra'],
      guia: ['Seleccionar una muestra de ingresos', 'Verificar los soportes (factura, remisión, recaudo)', 'Confirmar la ocurrencia y la exactitud del registro'],
    },
    {
      titulo: 'Análisis de márgenes',
      aserciones: ['integridad', 'exactitud'],
      tipo: 'analitica',
      procedimiento: 'Analizar la evolución de ingresos y márgenes frente a períodos anteriores y explicar variaciones.',
      documentosRequeridos: ['Estado de resultados comparativo', 'Detalle de ingresos por línea/producto'],
      guia: ['Comparar ingresos y márgenes contra períodos anteriores y el presupuesto', 'Identificar variaciones inusuales', 'Obtener y corroborar las explicaciones de la administración'],
    },
  ],
  gastos: [
    {
      titulo: 'Pruebas de soporte de gastos',
      aserciones: ['ocurrencia', 'exactitud'],
      tipo: 'detalle',
      procedimiento: 'Revisar soportes de una muestra de gastos significativos.',
      documentosRequeridos: ['Detalle de gastos del período', 'Facturas y soportes de la muestra'],
      guia: ['Seleccionar una muestra de gastos significativos', 'Verificar los soportes y la autorización', 'Confirmar la ocurrencia y la correcta clasificación'],
    },
    {
      titulo: 'Corte de gastos',
      aserciones: ['corte'],
      tipo: 'detalle',
      procedimiento: 'Verificar el registro de gastos cercanos al cierre en el período correcto.',
      documentosRequeridos: ['Facturas de gasto alrededor del cierre', 'Causaciones posteriores al cierre'],
      guia: ['Seleccionar los gastos del corte', 'Cotejar la fecha del servicio/recepción contra el registro', 'Confirmar el período correcto'],
    },
    {
      titulo: 'Análisis de razonabilidad',
      aserciones: ['integridad'],
      tipo: 'analitica',
      procedimiento: 'Comparar los gastos por naturaleza contra períodos anteriores y el presupuesto; explicar variaciones.',
      documentosRequeridos: ['Estado de resultados comparativo', 'Presupuesto de gastos (si aplica)'],
      guia: ['Comparar los gastos por naturaleza contra períodos anteriores y el presupuesto', 'Identificar variaciones significativas', 'Obtener y corroborar las explicaciones'],
    },
  ],
  patrimonio: [
    {
      titulo: 'Revisión de movimientos del patrimonio',
      aserciones: ['exactitud', 'integridad'],
      tipo: 'detalle',
      procedimiento: 'Verificar aumentos y disminuciones de capital, reservas y distribuciones contra los soportes.',
      documentosRequeridos: ['Estado de cambios en el patrimonio', 'Soportes de aumentos/disminuciones de capital y distribuciones'],
      guia: ['Analizar los movimientos del patrimonio en el período', 'Verificar los soportes de cada movimiento', 'Confirmar la correcta contabilización'],
    },
    {
      titulo: 'Revisión de actas',
      aserciones: ['presentación'],
      tipo: 'detalle',
      procedimiento: 'Revisar las actas de asamblea o junta que respaldan los movimientos del patrimonio.',
      documentosRequeridos: ['Actas de asamblea / junta de socios del período', 'Libro de actas'],
      guia: ['Obtener las actas del período', 'Verificar que las decisiones sobre el patrimonio quedaron autorizadas', 'Cotejar contra los registros contables'],
    },
  ],
  otro: [
    {
      titulo: 'Procedimiento sustantivo a la medida',
      aserciones: ['valuación'],
      tipo: 'detalle',
      procedimiento: 'Diseñar y ejecutar el procedimiento apropiado a la naturaleza de la cuenta.',
      documentosRequeridos: ['Detalle / auxiliar de la cuenta', 'Soportes según la naturaleza de la cuenta'],
      guia: ['Entender la naturaleza y composición de la cuenta', 'Diseñar el procedimiento apropiado', 'Ejecutar y documentar la conclusión'],
    },
  ],
}
