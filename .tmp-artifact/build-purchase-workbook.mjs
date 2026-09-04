import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/Users/dossa/Desktop/Projects/lumina/02 ERP/public/plantillas/LUMINA_OS_Plantillas_Importacion.xlsx";
const outputDir = "C:/Users/dossa/Desktop/Projects/lumina/02 ERP/outputs/compras-2026-09-03";
const outputPath = `${outputDir}/LUMINA_OS_Plantillas_Importacion_Completada.xlsx`;
const previewDir = `${outputDir}/previews`;

const colors = {
  green: "#1F4B3C",
  tan: "#B9916C",
  cream: "#F5F1EB",
  paper: "#FFFDF9",
  text: "#2F2A25",
  muted: "#6F665E",
  border: "#DED6CC",
  pendingFill: "#F4D9CC",
  pendingText: "#8A3E21",
  completeFill: "#DDEADF",
  completeText: "#24523B",
};

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

function styleExistingData(sheet, rangeAddress) {
  const range = sheet.getRange(rangeAddress);
  range.format.fill = colors.paper;
  range.format.font = { name: "Carlito", size: 11, color: colors.text };
  range.format.borders = { preset: "all", style: "thin", color: colors.border };
  range.format.verticalAlignment = "center";
}

function addStatusFormatting(range) {
  range.conditionalFormats.add("cellIs", {
    operator: "equal",
    formula: '"PENDIENTE"',
    format: { fill: colors.pendingFill, font: { color: colors.pendingText } },
  });
  range.conditionalFormats.add("cellIs", {
    operator: "equal",
    formula: '"REVISAR"',
    format: { fill: colors.pendingFill, font: { color: colors.pendingText } },
  });
  range.conditionalFormats.add("cellIs", {
    operator: "equal",
    formula: '"COMPLETO"',
    format: { fill: colors.completeFill, font: { color: colors.completeText } },
  });
}

// Unidades requeridas por las compras.
const units = workbook.worksheets.getItem("Unidades");
units.getRange("A5:E205").clear({ applyTo: "contents" });
units.getRange("A5:E8").values = [
  ["G", "Gramo", "MASS", 1, "SI"],
  ["KG", "Kilogramo", "MASS", 1000, "SI"],
  ["UND", "Unidad", "COUNT", 1, "SI"],
  ["M", "Metro", "LENGTH", 1, "SI"],
];
styleExistingData(units, "A5:E8");
units.getRange("C5:C8").dataValidation = { rule: { type: "list", values: ["MASS", "COUNT", "LENGTH"] } };
units.getRange("E5:E8").dataValidation = { rule: { type: "list", values: ["SI", "NO"] } };

// Proveedores recibidos del usuario. NIT/correo permanecen pendientes.
const suppliers = workbook.worksheets.getItem("Proveedores");
suppliers.getRange("A5:G205").clear({ applyTo: "contents" });
suppliers.getRange("A5:G8").values = [
  ["NATURCHEM", "Naturchem", null, null, "3005267013", "SI", "PENDIENTE"],
  ["CENTROENVASES14", "CentroEnvases la 14", null, null, "3134249376", "SI", "PENDIENTE"],
  ["STICKERS-IMPACTO", "Stickers Impacto Digital", null, null, null, "SI", "PENDIENTE"],
  ["EMPAQUETATE", "Empaquetate", null, null, null, "SI", "PENDIENTE"],
];
styleExistingData(suppliers, "A5:G8");
suppliers.getRange("E5:E8").setNumberFormat("@");
suppliers.getRange("F5:F8").dataValidation = { rule: { type: "list", values: ["SI", "NO"] } };
suppliers.getRange("G5:G8").dataValidation = { rule: { type: "list", values: ["COMPLETO", "PENDIENTE"] } };
addStatusFormatting(suppliers.getRange("G5:G8"));

// Materiales comprados. Papel picado queda pendiente por falta de unidad/cantidad.
const materials = workbook.worksheets.getItem("Materiales");
materials.getRange("A5:G205").clear({ applyTo: "contents" });
materials.getRange("A5:G20").values = [
  ["MECHA", "Mecha", "SUPPLY", "M", null, "SI", "COMPLETO"],
  ["PORTA-MECHA", "Porta mecha", "SUPPLY", "UND", null, "SI", "COMPLETO"],
  ["FRAG-FRESA-CHOC", "Fragancia Fresas con chocolate", "RAW", "G", null, "SI", "COMPLETO"],
  ["FRAG-ALMENDRA-MACADAMIA", "Fragancia Almendra y macadamia", "RAW", "G", null, "SI", "COMPLETO"],
  ["FRAG-PINO", "Fragancia Pino", "RAW", "G", null, "SI", "COMPLETO"],
  ["FRAG-CREMA-WHISKEY", "Fragancia Crema de whiskey", "RAW", "G", null, "SI", "COMPLETO"],
  ["FRAG-MAGICA-NAVIDAD", "Fragancia Mágica navidad", "RAW", "G", null, "SI", "COMPLETO"],
  ["FIJADOR-AROMAS", "Fijador de aromas", "RAW", "G", null, "SI", "COMPLETO"],
  ["CERA-VASO", "Cera para vaso", "RAW", "KG", null, "SI", "COMPLETO"],
  ["ENVASE-AMBAR-240-TAPA-NEGRA", "Envase vidrio ámbar 240 ml con tapa negra", "PACKAGING", "UND", null, "SI", "COMPLETO"],
  ["STICKER-REDONDO-3X3", "Sticker redondo 3x3", "PACKAGING", "UND", null, "SI", "COMPLETO"],
  ["STICKER-CUADRADO-6X6", "Sticker cuadrado 6x6", "PACKAGING", "UND", null, "SI", "COMPLETO"],
  ["CAJA-12X12X9", "Caja 12x12x9", "PACKAGING", "UND", null, "SI", "COMPLETO"],
  ["BOLSA-YUTE-MARRON", "Bolsa de yute marrón", "PACKAGING", "UND", null, "SI", "COMPLETO"],
  ["FRASCO-FOSFORO-CORCHO", "Frasco para fósforo con corcho", "PACKAGING", "UND", null, "SI", "COMPLETO"],
  ["PAPEL-PICADO", "Papel picado", "PACKAGING", null, null, "SI", "PENDIENTE"],
];
styleExistingData(materials, "A5:G20");
materials.getRange("C5:C20").dataValidation = { rule: { type: "list", values: ["RAW", "PACKAGING", "SUPPLY"] } };
materials.getRange("D5:D20").dataValidation = { rule: { type: "list", values: ["G", "KG", "UND", "M"] } };
materials.getRange("F5:F20").dataValidation = { rule: { type: "list", values: ["SI", "NO"] } };
materials.getRange("G5:G20").dataValidation = { rule: { type: "list", values: ["COMPLETO", "PENDIENTE"] } };
addStatusFormatting(materials.getRange("G5:G20"));
materials.getRange("A4:G20").format.autofitColumns();
materials.getRange("B5:B20").format.columnWidth = 34;

// Hoja adicional para conservar el detalle contable y detectar discrepancias.
const purchases = workbook.worksheets.add("Compras");
purchases.showGridLines = false;
purchases.tabColor = colors.green;
purchases.mergeCells("A1:K1");
purchases.getRange("A1").values = [["LÚMINA · Compras registradas"]];
purchases.getRange("A1:K1").format.fill = colors.green;
purchases.getRange("A1:K1").format.font = { name: "Carlito", size: 18, bold: true, color: "#FFFFFF" };
purchases.getRange("A1:K1").format.rowHeight = 30;
purchases.mergeCells("A2:K2");
purchases.getRange("A2").values = [["Valores en COP. Los campos pendientes se dejaron en blanco y están explicados en observaciones."]];
purchases.getRange("A2:K2").format.fill = colors.cream;
purchases.getRange("A2:K2").format.font = { name: "Carlito", size: 11, italic: true, color: colors.muted };

const detailHeaders = [["fecha", "compra", "proveedor_codigo", "sku_material", "articulo", "cantidad", "unidad", "precio_unitario_cop", "total_linea_cop", "estado_dato", "observaciones"]];
purchases.getRange("A4:K4").values = detailHeaders;
const detailRows = [
  [new Date("2026-09-03T12:00:00Z"), "COMP-20260903-NAT", "NATURCHEM", "MECHA", "Mecha", 5, "M", null, 11000, "COMPLETO", "Naturchem · Barranquilla"],
  [new Date("2026-09-03T12:00:00Z"), "COMP-20260903-NAT", "NATURCHEM", "PORTA-MECHA", "Porta mecha", 50, "UND", null, 7500, "COMPLETO", null],
  [new Date("2026-09-03T12:00:00Z"), "COMP-20260903-NAT", "NATURCHEM", "FRAG-FRESA-CHOC", "Fragancia Fresas con chocolate", 500, "G", null, 80000, "COMPLETO", null],
  [new Date("2026-09-03T12:00:00Z"), "COMP-20260903-NAT", "NATURCHEM", "FRAG-ALMENDRA-MACADAMIA", "Fragancia Almendra y macadamia", 250, "G", null, 47000, "COMPLETO", null],
  [new Date("2026-09-03T12:00:00Z"), "COMP-20260903-NAT", "NATURCHEM", "FRAG-PINO", "Fragancia Pino", 250, "G", null, 47000, "COMPLETO", null],
  [new Date("2026-09-03T12:00:00Z"), "COMP-20260903-NAT", "NATURCHEM", "FRAG-CREMA-WHISKEY", "Fragancia Crema de whiskey", 250, "G", null, 47000, "COMPLETO", null],
  [new Date("2026-09-03T12:00:00Z"), "COMP-20260903-NAT", "NATURCHEM", "FRAG-MAGICA-NAVIDAD", "Fragancia Mágica navidad", 250, "G", null, 47000, "COMPLETO", null],
  [new Date("2026-09-03T12:00:00Z"), "COMP-20260903-NAT", "NATURCHEM", "FIJADOR-AROMAS", "Fijador de aromas", 50, "G", null, 6500, "COMPLETO", null],
  [new Date("2026-09-03T12:00:00Z"), "COMP-20260903-NAT", "NATURCHEM", "CERA-VASO", "Cera para vaso", 10, "KG", null, 200000, "COMPLETO", null],
  [new Date("2026-09-03T12:00:00Z"), "COMP-20260903-CEN", "CENTROENVASES14", "ENVASE-AMBAR-240-TAPA-NEGRA", "Envase vidrio ámbar 240 ml con tapa negra", 50, "UND", 4312, null, "COMPLETO", "Bogotá · envío por Interrapidísimo contraentrega"],
  [new Date("2026-09-03T12:00:00Z"), "COMP-20260903-STI", "STICKERS-IMPACTO", "STICKER-REDONDO-3X3", "Sticker redondo 3x3", 600, "UND", null, 42000, "COMPLETO", "Barranquilla"],
  [new Date("2026-09-03T12:00:00Z"), "COMP-20260903-STI", "STICKERS-IMPACTO", "STICKER-CUADRADO-6X6", "Sticker cuadrado 6x6", 220, "UND", null, 42000, "COMPLETO", null],
  [null, "COMP-PEND-EMP", "EMPAQUETATE", "CAJA-12X12X9", "Caja 12x12x9", 24, "UND", 3100, null, "PENDIENTE", "Fecha de compra no indicada · Barranquilla"],
  [null, "COMP-PEND-EMP", "EMPAQUETATE", "BOLSA-YUTE-MARRON", "Bolsa de yute marrón", 24, "UND", 800, null, "PENDIENTE", "Fecha de compra no indicada"],
  [null, "COMP-PEND-EMP", "EMPAQUETATE", "FRASCO-FOSFORO-CORCHO", "Frasco para fósforo con corcho", 24, "UND", 1200, null, "PENDIENTE", "Fecha de compra no indicada"],
  [null, "COMP-PEND-EMP", "EMPAQUETATE", "PAPEL-PICADO", "Papel picado", null, null, null, 36000, "PENDIENTE", "Faltan fecha, cantidad y unidad; sólo se informó el total"],
];
purchases.getRange("A5:K20").values = detailRows;
// Precios derivados cuando el usuario informó cantidad y total; totales derivados cuando informó precio unitario.
for (const row of [5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16]) {
  purchases.getRange(`H${row}`).formulas = [[`=IFERROR(I${row}/F${row},"")`]];
}
for (const row of [14, 17, 18, 19]) {
  purchases.getRange(`I${row}`).formulas = [[`=IFERROR(F${row}*H${row},"")`]];
}

const summaryHeaders = [["compra", "fecha", "proveedor", "subtotal_calculado", "subtotal_informado", "diferencia", "domicilio", "total_conocido", "estado", "observaciones"]];
purchases.getRange("M4:V4").values = summaryHeaders;
purchases.getRange("M5:V8").values = [
  ["COMP-20260903-NAT", new Date("2026-09-03T12:00:00Z"), "Naturchem", null, 479000, null, 10000, null, "REVISAR", "Las líneas suman $493.000, pero el subtotal informado fue $479.000."],
  ["COMP-20260903-CEN", new Date("2026-09-03T12:00:00Z"), "CentroEnvases la 14", null, 215600, null, null, null, "PENDIENTE", "Falta el valor del envío contraentrega por Interrapidísimo."],
  ["COMP-20260903-STI", new Date("2026-09-03T12:00:00Z"), "Stickers Impacto Digital", null, 84000, null, 15000, null, "COMPLETO", "Domicilio informado por separado."],
  ["COMP-PEND-EMP", null, "Empaquetate", null, 158400, null, 12000, null, "PENDIENTE", "Falta confirmar la fecha de compra y la unidad/cantidad del papel picado."],
];
for (let row = 5; row <= 8; row += 1) {
  purchases.getRange(`P${row}`).formulas = [[`=SUMIF($B$5:$B$20,M${row},$I$5:$I$20)`]];
  purchases.getRange(`R${row}`).formulas = [[`=P${row}-Q${row}`]];
  purchases.getRange(`T${row}`).formulas = [[`=IF(Q${row}="","",IF(S${row}="",Q${row},Q${row}+S${row}))`]];
}
purchases.getRange("M10:V10").values = [["TOTAL CONOCIDO", null, null, null, null, null, null, null, null, "No incluye el envío pendiente de CentroEnvases."]];
purchases.getRange("P10").formulas = [["=SUM(P5:P8)"]];
purchases.getRange("Q10").formulas = [["=SUM(Q5:Q8)"]];
purchases.getRange("R10").formulas = [["=SUM(R5:R8)"]];
purchases.getRange("S10").formulas = [["=SUM(S5:S8)"]];
purchases.getRange("T10").formulas = [["=SUM(T5:T8)"]];

// Estilo de la nueva hoja.
for (const header of [purchases.getRange("A4:K4"), purchases.getRange("M4:V4")]) {
  header.format.fill = colors.tan;
  header.format.font = { name: "Carlito", size: 11, bold: true, color: "#FFFFFF" };
  header.format.wrapText = true;
  header.format.verticalAlignment = "center";
  header.format.borders = { preset: "all", style: "thin", color: colors.border };
}
for (const body of [purchases.getRange("A5:K20"), purchases.getRange("M5:V8")]) {
  body.format.fill = colors.paper;
  body.format.font = { name: "Carlito", size: 11, color: colors.text };
  body.format.borders = { preset: "all", style: "thin", color: colors.border };
  body.format.verticalAlignment = "center";
}
purchases.getRange("M10:V10").format.fill = colors.cream;
purchases.getRange("M10:V10").format.font = { name: "Carlito", size: 11, bold: true, color: colors.text };
purchases.getRange("M10:V10").format.borders = { preset: "all", style: "thin", color: colors.border };
purchases.getRange("A5:A20").setNumberFormat("yyyy-mm-dd");
purchases.getRange("N5:N8").setNumberFormat("yyyy-mm-dd");
purchases.getRange("F5:F20").setNumberFormat("0.######");
purchases.getRange("H5:I20").setNumberFormat('"$"#,##0.00');
purchases.getRange("P5:T10").setNumberFormat('"$"#,##0');
purchases.getRange("J5:J20").dataValidation = { rule: { type: "list", values: ["COMPLETO", "PENDIENTE"] } };
purchases.getRange("U5:U8").dataValidation = { rule: { type: "list", values: ["COMPLETO", "PENDIENTE", "REVISAR"] } };
addStatusFormatting(purchases.getRange("J5:J20"));
addStatusFormatting(purchases.getRange("U5:U8"));
purchases.getRange("E5:E20").format.wrapText = true;
purchases.getRange("K5:K20").format.wrapText = true;
purchases.getRange("V5:V10").format.wrapText = true;
purchases.getRange("A4:V20").format.autofitColumns();
purchases.getRange("B5:B20").format.columnWidth = 21;
purchases.getRange("C5:C20").format.columnWidth = 20;
purchases.getRange("D5:D20").format.columnWidth = 27;
purchases.getRange("E5:E20").format.columnWidth = 34;
purchases.getRange("K5:K20").format.columnWidth = 42;
purchases.getRange("M5:M10").format.columnWidth = 21;
purchases.getRange("O5:O8").format.columnWidth = 24;
purchases.getRange("V5:V10").format.columnWidth = 48;
purchases.freezePanes.freezeRows(4);
purchases.freezePanes.freezeColumns(2);
purchases.tables.add("A4:K20", true, "ComprasDetalle");
purchases.tables.add("M4:V8", true, "ComprasResumen");

// Agregar Compras al control de completitud.
const checks = workbook.worksheets.getItem("Checks");
checks.getRange("B5").formulas = [["=COUNTA('Unidades'!A5:A205)"]];
checks.getRange("B8").formulas = [["=COUNTA('Materiales'!A5:A205)"]];
checks.getRange("B9").formulas = [["=COUNTA('Proveedores'!A5:A205)"]];
checks.getRange("A15:D15").values = [["Compras", null, null, null]];
checks.getRange("B15").formulas = [["=MAX(0,COUNTA('Compras'!B5:B205))"]];
checks.getRange("C15").formulas = [["=COUNTIF('Compras'!J5:J205,\"PENDIENTE\")+COUNTIF('Compras'!J5:J205,\"REVISAR\")"]];
checks.getRange("D15").formulas = [["=IF(C15=0,\"LISTO\",\"REVISAR\")"]];
checks.getRange("A15:D15").format.borders = { preset: "all", style: "thin", color: colors.border };
checks.getRange("A15:D15").format.font = { name: "Carlito", size: 11, color: colors.text };

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

for (const sheetName of ["Proveedores", "Materiales", "Compras", "Checks"]) {
  const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
  await fs.writeFile(`${previewDir}/${sheetName}.png`, new Uint8Array(await preview.arrayBuffer()));
}

const verification = await workbook.inspect({
  kind: "sheet,table,formula",
  maxChars: 16000,
  tableMaxRows: 24,
  tableMaxCols: 24,
  tableMaxCellChars: 140,
});
console.log(verification.ndjson ?? verification);
console.log(`OUTPUT=${outputPath}`);
