/**
 * Fixture: "COMPROBACION DE SALDOS" de Siesa (balance de prueba del bimestre):
 * títulos, encabezado en la fila 12 (Cuentas · nombre · Saldo inicial · Débitos
 * · Créditos · Saldo final · L/G nivel), códigos como número y todos los niveles
 * (clase, grupo, cuenta, subcuenta, auxiliar). Subconjunto real: 1355, 2408 y
 * 41 del bimestre 4 de 2026, empresa anonimizada.
 */
export const BALANCE_SIESA_PERIODO: string[][] = [
  ["COMPROBACION DE SALDOS", "", "", "", "", "", ""],
  ["", "", "", "", "", "", ""],
  ["", "", "", "", "", "", ""],
  ["", "", "", "", "", "", ""],
  ["EMPRESA EJEMPLO S.A.S", "", "", "", "", "", ""],
  ["", "", "", "", "", "", ""],
  ["900000000-1", "", "", "", "", "46283", ""],
  ["Libro:", "NIIF", "", "", "", "0.6529398148148148", ""],
  ["", "", "", "", "", "", ""],
  ["Cifras en PESOS", "", "", "", "", "", ""],
  ["", "", "Saldo inicial a", "", "", "Saldo final a", ""],
  ["Cuentas", "", "2026/07", "Débitos", "Créditos", "2026/08", "L/G"],
  ["1", "ACTIVO", "7157926927.77", "27784210294.77", "28178103737.04", "6764033485.5", "1"],
  ["11", " DISPONIBLE", "20009759.77", "14075172729.71", "14086877617.07", "8304872.41", "2"],
  ["1355", "ANTI DE IMPU Y CONTRIB O SALDOS A FAV ", "1241628783.01", "193914467.78", "12558665.07", "1422984585.72", "4"],
  ["135510", " ANTI DE IMPUESTOS DE INDUSTRIA Y COMER", "344000", "0", "0", "344000", "6"],
  ["13551001", "ANTICIPO DE IMPUESTOS DE INDUSTRIA Y COM", "344000", "0", "0", "344000", "8"],
  ["135515", " RETENCION EN LA FUENTE", "416431683.35", "170470610.78", "12289196.07", "574613098.06", "6"],
  ["13551502", "RETENCION EN LA FUENTE 2%", "23866512", "8969544", "265238", "32570818", "8"],
  ["13551503", "RETENCION EN LA FUENTE 2.5%", "0", "98882", "98882", "0", "8"],
  ["13551504", "RETENCION EN LA FUENTE 4%", "323669655", "122119044", "3400879", "442387820", "8"],
  ["13551506", "RETENCION EN LA FUENTE 7%", "1879902.05", "1174243.78", "0", "3054145.83", "8"],
  ["13551507", "AUTORETENCION 1.10%", "67015614.3", "38108897", "8524197.07", "96600314.23", "8"],
  ["135517", " IMPUESTO A LAS VENTAS RETENIDO", "0", "7829316", "93702", "7735614", "6"],
  ["13551701", "IMPUESTO A LAS VENTAS RETENIDO", "0", "7829316", "93702", "7735614", "8"],
  ["2408", "IMPUESTO SOBRE LAS VENTAS POR PAGAR ", "-302276000", "164707634.15", "109405227", "-246973592.85", "4"],
  ["240801", " IVA DESCONTABLE ", "0", "56586700.15", "231040", "56355660.15", "6"],
  ["24080103", "IVA DESCONTABLE SERVICIOS 19%", "0", "20490356.15", "0", "20490356.15", "8"],
  ["24080105", "IVA DESCONTABLE COMPRAS 19%", "0", "36080096", "0", "36080096", "8"],
  ["24080106", "IVA DESCONTABLE COMPRAS 5%", "0", "16248", "0", "16248", "8"],
  ["24080201", "DEVOLUCION IVA DESCONTABLE SERVICIOS 19%", "0", "0", "231040", "-231040", "8"],
  ["240805", " IVA GENERADO", "0", "1822934", "109174187", "-107351253", "6"],
  ["24080501", "IVA GENERADO EN VENTAS DEL 19%", "0", "0", "109174187", "-109174187", "8"],
  ["24081001", "DEVOLUCION IVA GENERADO EN VENTAS DE 19%", "0", "1822934", "0", "1822934", "8"],
  ["240899", " IVA POR PAGAR ", "-302276000", "106298000", "0", "-195978000", "6"],
  ["24089901", "IVA POR PAGAR ", "-302276000", "106298000", "0", "-195978000", "8"],
  ["4", "INGRESOS", "-18949027423.33", "158820309.36", "6890733088.55", "-25680940202.52", "1"],
  ["41", " OPERACIONALES", "-18918428738", "158820309", "6876238435", "-25635846864", "2"],
]
