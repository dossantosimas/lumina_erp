import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/Users/dossa/Desktop/Projects/lumina/02 ERP/public/plantillas/LUMINA_OS_Plantillas_Importacion.xlsx";
const previewDir = "C:/Users/dossa/Desktop/Projects/lumina/02 ERP/.tmp-artifact/previews";

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);
const summary = await workbook.inspect({
  kind: "workbook,sheet,table",
  maxChars: 10000,
  tableMaxRows: 8,
  tableMaxCols: 16,
  tableMaxCellChars: 100,
});
console.log(summary.ndjson ?? summary);

await fs.mkdir(previewDir, { recursive: true });
for (const sheetName of ["Proveedores", "Materiales", "Unidades"]) {
  const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
  await fs.writeFile(`${previewDir}/${sheetName}.png`, new Uint8Array(await preview.arrayBuffer()));
}

for (const [sheetId, range] of [["Checks", "A1:D20"], ["Proveedores", "A1:G8"], ["Materiales", "A1:G22"], ["Unidades", "A1:E8"]]) {
  const region = await workbook.inspect({ kind: "region,formula,computedStyle", sheetId, range, maxChars: 12000 });
  console.log(region.ndjson ?? region);
}
