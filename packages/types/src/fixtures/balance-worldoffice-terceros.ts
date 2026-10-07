/**
 * Fixture: balance de prueba de World Office con detalle por tercero: las filas
 * con TERCERO ("NIT  123") repiten el código de la cuenta y llevan el nombre del
 * tercero en la columna del nombre de cuenta. Cuenta 2367 (rete-IVA practicada)
 * de agosto 2026, anonimizado.
 */
export const BALANCE_WORLDOFFICE_TERCEROS: string[][] = [
  ["EMPRESA EJEMPLO S.A.S"],
  ["NIT 900000000-1"],
  ["Balance de Prueba entre el 01/08/2026 y el 31/08/2026"],
  ["Elaborado Bajo Normas Locales  "],
  ["CODIGO", "NOMBRE CUENTA", "TERCERO", "SALDO INICIAL", "DEBITOS", "CREDITOS", "SALDO FINAL"],
  ["2", "PASIVO", "", "5000", "5000", "25346", "25346"],
  ["23", "CUENTAS POR PAGAR", "", "5000", "5000", "25346", "25346"],
  ["2367", "IMPUESTO A LAS VENTAS RETENIDO", "", "5000", "5000", "25346", "25346"],
  ["236710", "IVA RETENIDO AL REGIMEN COMUN", "", "0", "0", "25346", "25346"],
  ["23671001", "RETEIVA 15% A RST", "", "0", "0", "25346", "25346"],
  ["23671001", "TERCERO 8 SAS", "NIT  900000001", "0", "0", "6707", "6707"],
  ["23671001", "TERCERO 9 SAS", "NIT  900000002", "8550", "0", "0", "8550"],
  ["23671001", "TERCERO 10 SAS", "NIT  900000003", "5130", "0", "0", "5130"],
  ["23671001", "TERCERO 11 SAS", "NIT  900000004", "385819", "0", "0", "385819"],
  ["23671001", "TERCERO 12 SAS", "NIT  900000005", "47481", "0", "0", "47481"],
  ["23671001", "TERCERO 13 SAS", "NIT  900000006", "42750", "0", "0", "42750"],
  ["23671001", "TERCERO 14 SAS", "NIT  900000007", "0", "0", "18639", "18639"],
  ["23671001", "TERCERO 15 SAS", "NIT  900000008", "13866", "0", "0", "13866"],
  ["23671001", "TERCERO 16 SAS", "NIT  900000009", "-789457", "0", "0", "-789457"],
  ["23671001", "TERCERO 17 SAS", "NIT  900000010", "217740", "0", "0", "217740"],
  ["23671001", "TERCERO 18 SAS", "NIT  900000011", "68121", "0", "0", "68121"],
  ["236790", "RETENCION IVA POR PAGAR", "", "5000", "5000", "0", "0"],
  ["23679005", "RETENCION IVA POR PAGAR", "", "5000", "5000", "0", "0"],
  ["23679005", "TERCERO 16 SAS", "NIT  900000009", "5000", "5000", "0", "0"],
]
