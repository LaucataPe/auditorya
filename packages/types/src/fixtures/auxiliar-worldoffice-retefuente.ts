/**
 * Fixture: libro auxiliar de retención en la fuente de World Office con el
 * importe en UNA sola columna ("Valor") más "%" (tarifa) y "Base". Cuenta en
 * la primera fila del bloque como "código nombre", filas "Total …" por cuenta y
 * "Total general" al final. Subconjunto de un archivo real de agosto 2026 (bloques
 * de salarios, servicios no declarante, compras y autorretención), terceros
 * anonimizados conservando si son sociedades o personas naturales.
 */
export const AUXILIAR_WORLDOFFICE_RETEFUENTE: string[][] = [
  ["EMPRESA EJEMPLO S.A.S"],
  ["Libro Auxiliar entre el 01/08/2026 y el 31/08/2026"],
  [],
  ["Codigo", "Cuenta/Documento", "Fecha", "Tercero", "Valor", "%", "Base"],
  ["236405 SALARIOS Y PAGOS LABORALES", "NO 604 NELC", "46249", "PEREZA GOMEZ JUAN CARLOS", "53000", "0.19", "5255249.9946870003"],
  ["", "NO 611 NELC", "46265", "PEREZA GOMEZ JUAN CARLOS", "1230000", "0.28000000000000003", "10566219.565832"],
  ["Total 236405 SALARIOS Y PAGOS LABORALES", "", "", "", "1283000", "", "15821469.560519001"],
  ["23642501 SERVICIOS GENERALES NO DECLARANTES 6%", "FC 523 DSE", "46256", "PEREZB GOMEZ JUAN CARLOS", "23730", "0.06", "395500"],
  ["Total 23642501 SERVICIOS GENERALES NO DECLARANTES 6%", "", "", "", "23730", "", "395500"],
  ["23644001 COMPRAS DECLARANTES 2.5%", "FC 19629", "46237", "PEREZC GOMEZ JUAN CARLOS", "102000", "2.5000000000000001E-2", "4080000"],
  ["", "FC 19709", "46244", "PEREZC GOMEZ JUAN CARLOS", "124800", "2.5000000000000001E-2", "4992000"],
  ["", "FC 19802", "46253", "PEREZC GOMEZ JUAN CARLOS", "104000", "2.5000000000000001E-2", "4160000"],
  ["", "FC 19865", "46259", "PEREZC GOMEZ JUAN CARLOS", "104000", "2.5000000000000001E-2", "4160000"],
  ["", "FC 19931", "46265", "PEREZC GOMEZ JUAN CARLOS", "104000", "2.5000000000000001E-2", "4160000"],
  ["Total 23644001 COMPRAS DECLARANTES 2.5%", "", "", "", "538800", "", "21552000"],
  ["23651502 HONORARIOS DECLARANTES 11%", "FC 19757", "46248", "TERCERO D SAS", "304040", "0.11", "2764000"],
  ["23657501 AUTORRETENCION DE RENTA", "DMC 6296 AFE", "46235", "TERCERO E SAS", "-5181", "5.4999999999999997E-3", "-942000"],
  ["", "FV 301616 FE", "46235", "TERCERO F SAS", "4635", "5.4999999999999997E-3", "842638.09499999997"],
  ["", "FV 301624 FE", "46235", "TERCERO G SAS", "3531", "5.4999999999999997E-3", "641950"],
  ["", "FV 301625 FE", "46235", "PEREZH GOMEZ JUAN CARLOS", "1070", "5.4999999999999997E-3", "194608"],
  ["", "NDCL 779 NDE", "46265", "PEREZI GOMEZ JUAN CARLOS", "705", "5.4999999999999997E-3", "128150"],
  ["Total 23657501 AUTORRETENCION DE RENTA", "", "", "", "17441888", "", "3171218588.8263845"],
  ["Total general", "", "", "", "40000979.439999998", "", "3998987392.9241734"],
]
