import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const outputPath = "C:/Users/dossa/Desktop/Projects/lumina/02 ERP/outputs/compras-2026-09-03/LUMINA_OS_Plantillas_Importacion_Completada.xlsx";
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(outputPath));

for (const [sheetId, range] of [
  ["Compras", "A1:V20"],
  ["Materiales", "A1:G20"],
  ["Proveedores", "A1:G8"],
  ["Checks", "A1:D15"],
]) {
  const check = await workbook.inspect({ kind: "region", sheetId, range, maxChars: 12000, tableMaxRows: 24, tableMaxCols: 24 });
  console.log(check.ndjson ?? check);
}

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log(errors.ndjson ?? errors);
