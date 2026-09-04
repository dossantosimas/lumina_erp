import ExcelJS from 'exceljs';
import JSZip from 'jszip';

const definitions = {
  Usuarios_Roles: ['email', 'nombre', 'rol', 'activo'],
  Unidades: ['codigo', 'nombre', 'dimension', 'factor_a_base', 'activo'],
  Categorias: ['codigo', 'nombre', 'categoria_padre_codigo', 'activo'],
  Productos: [
    'sku_producto',
    'nombre_producto',
    'categoria_codigo',
    'sku_variante',
    'nombre_variante',
    'precio_venta_cop',
    'activo',
    'estado_dato',
  ],
  Materiales: [
    'sku',
    'nombre',
    'tipo',
    'unidad_base',
    'stock_minimo',
    'activo',
    'estado_dato',
  ],
  Proveedores: [
    'codigo',
    'nombre',
    'nit',
    'email',
    'telefono',
    'activo',
    'estado_dato',
  ],
  Clientes: [
    'codigo',
    'tipo',
    'nombre',
    'documento',
    'email',
    'telefono',
    'activo',
    'estado_dato',
  ],
  BOM: [
    'sku_variante',
    'version',
    'rendimiento',
    'unidad_rendimiento',
    'sku_material',
    'cantidad',
    'unidad',
    'merma_pct',
    'estado_dato',
  ],
  Inventario_Inicial: [
    'fecha_corte',
    'tipo_item',
    'sku',
    'lote',
    'cantidad',
    'unidad',
    'costo_unitario_cop',
    'motivo',
    'estado_dato',
  ],
  Cuentas_Saldos: [
    'codigo',
    'nombre',
    'tipo',
    'fecha_corte',
    'saldo_cop',
    'activo',
    'estado_dato',
  ],
  Gastos_Costos: [
    'codigo',
    'nombre',
    'tipo',
    'frecuencia',
    'importe_cop',
    'criterio_asignacion',
    'activo',
    'estado_dato',
  ],
} as const;

function valueOf(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('result' in value) return valueOf(value.result as ExcelJS.CellValue);
    if ('text' in value) return String(value.text);
    if ('richText' in value)
      return value.richText.map((part) => part.text).join('');
    return '';
  }
  return String(value).trim();
}

export type InitialImportValidation = {
  valid: boolean;
  summary: { sheet: string; rows: number; complete: number; pending: number }[];
  errors: { sheet: string; row?: number; message: string }[];
};

export async function validateInitialImport(
  buffer: Buffer,
): Promise<InitialImportValidation> {
  const archive = await JSZip.loadAsync(buffer);
  await Promise.all(
    Object.values(archive.files)
      .filter(
        (file) =>
          !file.dir &&
          (file.name.endsWith('.xml') || file.name.endsWith('.rels')),
      )
      .map(async (file) => {
        let xml = await file.async('string');
        if (xml.includes('<x:'))
          xml = xml.replace(/(<\/?)(x:)/g, '$1').replace('xmlns:x=', 'xmlns=');
        if (
          file.name.startsWith('xl/worksheets/') &&
          file.name.endsWith('.xml')
        )
          xml = xml.replace(/<tableParts[\s\S]*?<\/tableParts>/g, '');
        if (file.name.startsWith('xl/worksheets/_rels/'))
          xml = xml.replace(
            /<Relationship\b[^>]*\/relationships\/table[^>]*\/>/g,
            '',
          );
        archive.file(file.name, xml);
      }),
  );
  const normalized = await archive.generateAsync({ type: 'nodebuffer' });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(normalized as unknown as ExcelJS.Buffer);
  const errors: InitialImportValidation['errors'] = [];
  const summary: InitialImportValidation['summary'] = [];
  const knownUnits = new Set<string>();
  const knownCategories = new Set<string>();
  const knownVariants = new Set<string>();
  const knownMaterials = new Set<string>();

  for (const [sheetName, expectedHeaders] of Object.entries(definitions)) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) {
      errors.push({ sheet: sheetName, message: 'Falta la hoja obligatoria.' });
      continue;
    }
    const headers = new Map<string, number>();
    sheet
      .getRow(4)
      .eachCell((cell, column) =>
        headers.set(valueOf(cell.value).toLowerCase(), column),
      );
    for (const header of expectedHeaders)
      if (!headers.has(header))
        errors.push({
          sheet: sheetName,
          row: 4,
          message: `Falta la columna ${header}.`,
        });
    let rows = 0;
    let complete = 0;
    let pending = 0;
    for (let rowNumber = 5; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const record = Object.fromEntries(
        expectedHeaders.map((header) => [
          header,
          valueOf(row.getCell(headers.get(header) ?? 0).value),
        ]),
      );
      if (Object.values(record).every((value) => !value)) continue;
      rows += 1;
      if (
        Object.values(record).some((value) =>
          value.toUpperCase().includes('NOMBRE REAL'),
        ) ||
        record.email?.toLowerCase() === 'persona@lumina.co'
      ) {
        errors.push({
          sheet: sheetName,
          row: rowNumber,
          message: 'Reemplaza los valores de ejemplo por datos reales.',
        });
      }
      const state = record.estado_dato?.toUpperCase();
      if ('estado_dato' in record && state !== 'COMPLETO') {
        pending += 1;
        errors.push({
          sheet: sheetName,
          row: rowNumber,
          message: 'El registro sigue PENDIENTE o no está marcado COMPLETO.',
        });
      } else complete += 1;
      const required = expectedHeaders.filter(
        (header) =>
          ![
            'categoria_padre_codigo',
            'nit',
            'email',
            'telefono',
            'documento',
            'lote',
            'criterio_asignacion',
            'estado_dato',
          ].includes(header),
      );
      for (const header of required)
        if (!record[header])
          errors.push({
            sheet: sheetName,
            row: rowNumber,
            message: `El campo ${header} es obligatorio.`,
          });
      if (sheetName === 'Unidades' && record.codigo)
        knownUnits.add(record.codigo.toLowerCase());
      if (
        sheetName === 'Usuarios_Roles' &&
        record.rol &&
        ![
          'ADMIN',
          'PRODUCTION',
          'SALES',
          'INVENTORY',
          'FINANCE',
          'PLANNING',
        ].includes(record.rol.toUpperCase())
      )
        errors.push({
          sheet: sheetName,
          row: rowNumber,
          message: `El rol ${record.rol} no es válido.`,
        });
      if (sheetName === 'Categorias' && record.codigo)
        knownCategories.add(record.codigo.toLowerCase());
      if (sheetName === 'Productos') {
        if (record.sku_variante)
          knownVariants.add(record.sku_variante.toLowerCase());
        if (
          record.categoria_codigo &&
          !knownCategories.has(record.categoria_codigo.toLowerCase())
        )
          errors.push({
            sheet: sheetName,
            row: rowNumber,
            message: `La categoría ${record.categoria_codigo} no existe en Categorias.`,
          });
      }
      if (sheetName === 'Materiales') {
        if (record.sku) knownMaterials.add(record.sku.toLowerCase());
        if (
          record.unidad_base &&
          !knownUnits.has(record.unidad_base.toLowerCase())
        )
          errors.push({
            sheet: sheetName,
            row: rowNumber,
            message: `La unidad ${record.unidad_base} no existe en Unidades.`,
          });
      }
      if (sheetName === 'BOM') {
        if (
          record.sku_variante &&
          !knownVariants.has(record.sku_variante.toLowerCase())
        )
          errors.push({
            sheet: sheetName,
            row: rowNumber,
            message: `La variante ${record.sku_variante} no existe en Productos.`,
          });
        if (
          record.sku_material &&
          !knownMaterials.has(record.sku_material.toLowerCase())
        )
          errors.push({
            sheet: sheetName,
            row: rowNumber,
            message: `El material ${record.sku_material} no existe en Materiales.`,
          });
      }
      if (['BOM', 'Inventario_Inicial'].includes(sheetName)) {
        const amount = Number(record.cantidad);
        if (!Number.isFinite(amount) || amount <= 0)
          errors.push({
            sheet: sheetName,
            row: rowNumber,
            message: 'La cantidad debe ser mayor que cero.',
          });
      }
    }
    summary.push({ sheet: sheetName, rows, complete, pending });
  }
  return { valid: errors.length === 0, summary, errors };
}
