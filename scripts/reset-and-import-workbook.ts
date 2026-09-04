import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import pg from 'pg';

const workbookPath = process.argv.find((value) => value.toLowerCase().endsWith('.xlsx'));
const confirmed = process.argv.includes('--confirm-reset');
const connectionString = process.env.DATABASE_URL;

if (!connectionString) throw new Error('DATABASE_URL es obligatoria.');
if (!workbookPath) throw new Error('Indica la ruta del archivo .xlsx.');
if (!confirmed) throw new Error('Falta --confirm-reset para autorizar el borrado.');

const target = new URL(connectionString);
if (!['localhost', '127.0.0.1', '::1'].includes(target.hostname))
  throw new Error(`El script sólo permite PostgreSQL local. Host recibido: ${target.hostname}`);
if (target.pathname.slice(1) !== 'lumina_erp_dev')
  throw new Error(`Base no autorizada para reinicio: ${target.pathname.slice(1)}`);

function cellValue(value: ExcelJS.CellValue): string | number | boolean | Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    if ('result' in value) return cellValue(value.result as ExcelJS.CellValue);
    if ('text' in value) return String(value.text).trim();
    if ('richText' in value)
      return value.richText.map((part) => part.text).join('').trim();
    return null;
  }
  return typeof value === 'string' ? value.trim() : value;
}

function textValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  return '';
}

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateValue(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === 'number')
    return new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
  const text = textValue(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function loadWorkbook(path: string) {
  const archive = await JSZip.loadAsync(await readFile(path));
  await Promise.all(
    Object.values(archive.files)
      .filter((file) => !file.dir && (file.name.endsWith('.xml') || file.name.endsWith('.rels')))
      .map(async (file) => {
        let xml = await file.async('string');
        if (xml.includes('<x:'))
          xml = xml.replace(/(<\/?)(x:)/g, '$1').replace('xmlns:x=', 'xmlns=');
        if (file.name.startsWith('xl/worksheets/') && file.name.endsWith('.xml'))
          xml = xml.replace(/<tableParts[\s\S]*?<\/tableParts>/g, '');
        if (file.name.startsWith('xl/worksheets/_rels/'))
          xml = xml.replace(/<Relationship\b[^>]*\/relationships\/table[^>]*\/>/g, '');
        archive.file(file.name, xml);
      }),
  );
  const normalized = await archive.generateAsync({ type: 'nodebuffer' });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(normalized as unknown as ExcelJS.Buffer);
  return workbook;
}

function recordsFrom(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  startColumn = 1,
  endColumn?: number,
) {
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) throw new Error(`Falta la hoja ${sheetName}.`);
  const lastColumn = endColumn ?? sheet.columnCount;
  const headers = new Map<number, string>();
  for (let column = startColumn; column <= lastColumn; column += 1) {
    const header = textValue(cellValue(sheet.getRow(4).getCell(column).value)).toLowerCase();
    if (header) headers.set(column, header);
  }
  const records: Record<string, string | number | boolean | Date | null>[] = [];
  for (let rowNumber = 5; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const record: Record<string, string | number | boolean | Date | null> = {};
    for (const [column, header] of headers)
      record[header] = cellValue(sheet.getRow(rowNumber).getCell(column).value);
    if (Object.values(record).some((value) => value !== null && value !== '')) records.push(record);
  }
  return records;
}

const workbook = await loadWorkbook(workbookPath);
const unitRows = recordsFrom(workbook, 'Unidades', 1, 5);
const categoryRows = recordsFrom(workbook, 'Categorias', 1, 4);
const supplierRows = recordsFrom(workbook, 'Proveedores', 1, 7);
const materialRows = recordsFrom(workbook, 'Materiales', 1, 7);
const purchaseRows = recordsFrom(workbook, 'Compras', 1, 11);
const purchaseSummaryRows = recordsFrom(workbook, 'Compras', 13, 22).filter(
  (row) => textValue(row.compra).startsWith('COMP-'),
);

const validUnits = unitRows.filter(
  (row) => textValue(row.codigo) && textValue(row.nombre) && textValue(row.dimension),
);
const validSuppliers = supplierRows.filter(
  (row) => textValue(row.codigo) && textValue(row.nombre),
);
const purchaseCosts = new Map<string, number>();
for (const row of purchaseRows) {
  const sku = textValue(row.sku_material).toUpperCase();
  const unitCost = numberValue(row.precio_unitario_cop);
  if (sku && unitCost !== null) purchaseCosts.set(sku, unitCost);
}
const validMaterials = materialRows.filter(
  (row) =>
    textValue(row.estado_dato).toUpperCase() === 'COMPLETO' &&
    textValue(row.sku) &&
    textValue(row.nombre) &&
    textValue(row.unidad_base),
);

if (!validUnits.length || !validSuppliers.length || !validMaterials.length)
  throw new Error('El libro no contiene unidades, proveedores y materiales válidos para importar.');

const businessTables = [
  'purchase_receipt_lines',
  'purchase_receipts',
  'purchase_order_lines',
  'purchase_orders',
  'production_consumptions',
  'production_orders',
  'sales_order_lines',
  'sales_orders',
  'payments',
  'expenses',
  'financial_movements',
  'financial_accounts',
  'inventory_reservations',
  'inventory_movements',
  'inventory_lots',
  'bom_lines',
  'bom_versions',
  'product_variants',
  'products',
  'materials',
  'categories',
  'suppliers',
  'unit_conversions',
  'units',
  'audit_logs',
  'outbox_events',
  'idempotency_keys',
] as const;

const pool = new pg.Pool({ connectionString });
const client = await pool.connect();
let committed = false;
try {
  const identity = await client.query(
    `select current_database() as database, current_user as db_user, inet_server_addr()::text as host`,
  );
  const beforeCounts: Record<string, number> = {};
  for (const table of businessTables) {
    const result = await client.query(`select count(*)::int as count from "${table}"`);
    beforeCounts[table] = result.rows[0].count;
  }
  const usersBefore = await client.query(`select count(*)::int as count from "user"`);
  const actorResult = await client.query(`
    select u.id, u.email
    from "user" u
    left join user_roles ur on ur.user_id = u.id
    left join roles r on r.id = ur.role_id
    where u.active = true
    order by case when r.code = 'ADMIN' then 0 else 1 end, u.created_at
    limit 1
  `);
  if (!actorResult.rowCount) throw new Error('No existe un usuario activo para registrar la importación.');
  const actor = actorResult.rows[0] as { id: string; email: string };

  await client.query('BEGIN');
  await client.query(`select pg_advisory_xact_lock(hashtext('lumina-reset-import'))`);
  await client.query(`TRUNCATE TABLE ${businessTables.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY`);

  const unitIds = new Map<string, string>();
  for (const row of validUnits) {
    const id = randomUUID();
    const code = textValue(row.codigo).toLowerCase();
    await client.query(
      `insert into units (id, code, name, dimension, status) values ($1, $2, $3, $4, 'ACTIVE')`,
      [id, code, textValue(row.nombre), textValue(row.dimension).toUpperCase()],
    );
    unitIds.set(code, id);
  }

  let categoriesImported = 0;
  for (const row of categoryRows) {
    const name = textValue(row.nombre);
    const slug = textValue(row.codigo).toLowerCase();
    if (!name || !slug || name.toUpperCase().includes('NOMBRE REAL')) continue;
    await client.query(
      `insert into categories (id, name, slug, status) values ($1, $2, $3, 'ACTIVE')`,
      [randomUUID(), name, slug],
    );
    categoriesImported += 1;
  }

  const supplierIds = new Map<string, string>();
  for (const row of validSuppliers) {
    const id = randomUUID();
    const code = textValue(row.codigo).toUpperCase();
    await client.query(
      `insert into suppliers (id, name, tax_id, email, phone, status) values ($1, $2, $3, $4, $5, $6)`,
      [
        id,
        textValue(row.nombre),
        textValue(row.nit) || null,
        textValue(row.email) || null,
        textValue(row.telefono) || null,
        textValue(row.estado_dato).toUpperCase() === 'COMPLETO' ? 'ACTIVE' : 'PENDING',
      ],
    );
    supplierIds.set(code, id);
  }

  const materialIds = new Map<string, string>();
  for (const row of validMaterials) {
    const sku = textValue(row.sku).toUpperCase();
    const unitId = unitIds.get(textValue(row.unidad_base).toLowerCase());
    if (!unitId) throw new Error(`Unidad desconocida para ${sku}: ${textValue(row.unidad_base)}`);
    const standardCost = purchaseCosts.get(sku) ?? null;
    const id = randomUUID();
    await client.query(
      `insert into materials (id, sku, name, unit_id, standard_cost, minimum_stock, status)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        sku,
        textValue(row.nombre),
        unitId,
        standardCost === null ? null : standardCost.toFixed(2),
        (numberValue(row.stock_minimo) ?? 0).toFixed(6),
        standardCost === null ? 'PENDING' : 'ACTIVE',
      ],
    );
    materialIds.set(sku, id);
  }

  const groupedPurchases = new Map<string, typeof purchaseRows>();
  for (const row of purchaseRows) {
    const number = textValue(row.compra);
    if (!number) continue;
    const rows = groupedPurchases.get(number) ?? [];
    rows.push(row);
    groupedPurchases.set(number, rows);
  }

  let purchaseOrdersImported = 0;
  let purchaseLinesImported = 0;
  const skippedPurchaseLines: { purchase: string; sku: string; reason: string }[] = [];
  for (const [number, rows] of groupedPurchases) {
    const supplierCode = textValue(rows[0]?.proveedor_codigo).toUpperCase();
    const supplierId = supplierIds.get(supplierCode);
    if (!supplierId) throw new Error(`Proveedor desconocido en compra ${number}: ${supplierCode}`);
    const lines = rows.flatMap((row) => {
      const sku = textValue(row.sku_material).toUpperCase();
      const materialId = materialIds.get(sku);
      const quantity = numberValue(row.cantidad);
      const unitCost = numberValue(row.precio_unitario_cop);
      if (!materialId || quantity === null || quantity <= 0 || unitCost === null || unitCost < 0) {
        skippedPurchaseLines.push({
          purchase: number,
          sku,
          reason: !materialId ? 'material pendiente' : 'cantidad o costo pendiente',
        });
        return [];
      }
      return [{ materialId, sku, quantity, unitCost: Math.round(unitCost * 100) / 100 }];
    });
    if (!lines.length) continue;
    const orderId = randomUUID();
    const total = lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
    await client.query(
      `insert into purchase_orders (id, number, supplier_id, status, ordered_at, total, created_by)
       values ($1, $2, $3, 'DRAFT', $4, $5, $6)`,
      [orderId, number, supplierId, dateValue(rows[0]?.fecha), total.toFixed(2), actor.id],
    );
    for (const line of lines) {
      await client.query(
        `insert into purchase_order_lines
          (id, purchase_order_id, material_id, ordered_quantity, received_quantity, unit_cost)
         values ($1, $2, $3, $4, '0', $5)`,
        [randomUUID(), orderId, line.materialId, line.quantity.toFixed(6), line.unitCost.toFixed(2)],
      );
      purchaseLinesImported += 1;
    }
    purchaseOrdersImported += 1;
  }

  const importId = randomUUID();
  const importSummary = {
    workbook: workbookPath.split(/[\\/]/).at(-1),
    units: validUnits.length,
    categories: categoriesImported,
    suppliers: validSuppliers.length,
    materials: validMaterials.length,
    purchaseOrders: purchaseOrdersImported,
    purchaseLines: purchaseLinesImported,
    skippedPurchaseLines,
    sourcePurchaseSummary: purchaseSummaryRows,
    previousBusinessCounts: beforeCounts,
  };
  await client.query(
    `insert into audit_logs
      (id, actor_user_id, operation, entity_type, entity_id, after_json, reason)
     values ($1, $2, 'INITIAL_WORKBOOK_IMPORTED', 'initial_import', $3, $4::jsonb, $5)`,
    [importId, actor.id, importId, JSON.stringify(importSummary), 'Reinicio autorizado y carga desde Excel'],
  );
  await client.query(
    `insert into outbox_events
      (id, aggregate_type, aggregate_id, event_type, payload)
     values ($1, 'initial_import', $2, 'InitialWorkbookImported', $3::jsonb)`,
    [randomUUID(), importId, JSON.stringify(importSummary)],
  );

  const usersDuringTransaction = await client.query(`select count(*)::int as count from "user"`);
  if (usersDuringTransaction.rows[0].count !== usersBefore.rows[0].count)
    throw new Error('La cantidad de usuarios cambió durante la transacción.');

  await client.query('COMMIT');
  committed = true;

  const verification = await client.query(`
    select
      (select count(*)::int from "user") as users,
      (select count(*)::int from units) as units,
      (select count(*)::int from categories) as categories,
      (select count(*)::int from suppliers) as suppliers,
      (select count(*)::int from materials) as materials,
      (select count(*)::int from purchase_orders) as purchase_orders,
      (select count(*)::int from purchase_order_lines) as purchase_order_lines,
      (select count(*)::int from audit_logs) as audit_logs
  `);
  const orders = await client.query(`
    select po.number, s.name as supplier, po.status, po.ordered_at::date as ordered_at,
           po.total::numeric(14,2)::text as total, count(pol.id)::int as lines
    from purchase_orders po
    join suppliers s on s.id = po.supplier_id
    join purchase_order_lines pol on pol.purchase_order_id = po.id
    group by po.id, s.name
    order by po.number
  `);
  console.log(
    JSON.stringify(
      {
        target: identity.rows[0],
        actor: actor.email,
        usersPreserved: usersBefore.rows[0].count,
        imported: verification.rows[0],
        orders: orders.rows,
        skippedPurchaseLines,
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (!committed) await client.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
