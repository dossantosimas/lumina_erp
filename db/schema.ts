import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const money = (name: string) =>
  numeric(name, { precision: 14, scale: 2 }).notNull().default('0');
const optionalMoney = (name: string) =>
  numeric(name, { precision: 14, scale: 2 });
const qty = (name: string) =>
  numeric(name, { precision: 18, scale: 6 }).notNull().default('0');

export const recordStatus = pgEnum('record_status', [
  'ACTIVE',
  'INACTIVE',
  'PENDING',
]);
export const bomStatus = pgEnum('bom_status', ['DRAFT', 'ACTIVE', 'EXPIRED']);
export const documentStatus = pgEnum('document_status', [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'IN_PROGRESS',
  'PARTIAL',
  'COMPLETED',
  'CANCELLED',
]);
export const movementType = pgEnum('inventory_movement_type', [
  'OPENING',
  'PURCHASE_RECEIPT',
  'PRODUCTION_CONSUMPTION',
  'PRODUCTION_OUTPUT',
  'SALE_DELIVERY',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'REVERSAL',
]);
export const projectionKind = pgEnum('projection_kind', [
  'REAL',
  'COMMITTED',
  'PROJECTED',
  'SIMULATED',
]);

// Better Auth canonical tables.
export const user = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    active: boolean('active').notNull().default(true),
    role: text('role').notNull().default('user'),
    banned: boolean('banned').notNull().default(false),
    banReason: text('ban_reason'),
    banExpires: timestamp('ban_expires', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('user_email_unique').on(t.email)],
);
export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    impersonatedBy: text('impersonated_by'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [
    uniqueIndex('session_token_unique').on(t.token),
    index('session_user_idx').on(t.userId),
  ],
);
export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    issuer: text('issuer').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
      withTimezone: true,
    }),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('account_user_idx').on(t.userId),
    uniqueIndex('account_issuer_unique').on(t.issuer, t.accountId),
  ],
);
export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);
export const rateLimit = pgTable(
  'rate_limit',
  {
    id: text('id').primaryKey(),
    key: text('key').notNull(),
    count: integer('count').notNull(),
    lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
  },
  (t) => [uniqueIndex('rate_limit_key_unique').on(t.key)],
);

export const roles = pgTable(
  'roles',
  {
    id: id(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    system: boolean('system').notNull().default(true),
  },
  (t) => [uniqueIndex('roles_code_unique').on(t.code)],
);
export const permissions = pgTable(
  'permissions',
  {
    id: id(),
    resource: text('resource').notNull(),
    action: text('action').notNull(),
    description: text('description'),
  },
  (t) => [
    uniqueIndex('permissions_resource_action_unique').on(t.resource, t.action),
  ],
);
export const userRoles = pgTable(
  'user_roles',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    assignedBy: text('assigned_by').references(() => user.id),
    assignedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })],
);
export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);
export const invitations = pgTable(
  'invitations',
  {
    id: id(),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull(),
    invitedBy: text('invited_by')
      .notNull()
      .references(() => user.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('invitations_token_hash_unique').on(t.tokenHash),
    index('invitations_email_idx').on(t.email),
  ],
);
export const invitationRoles = pgTable(
  'invitation_roles',
  {
    invitationId: uuid('invitation_id')
      .notNull()
      .references(() => invitations.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.invitationId, t.roleId] })],
);

export const units = pgTable(
  'units',
  {
    id: id(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    dimension: text('dimension').notNull(),
    status: recordStatus('status').notNull().default('ACTIVE'),
  },
  (t) => [uniqueIndex('units_code_unique').on(t.code)],
);
export const unitConversions = pgTable(
  'unit_conversions',
  {
    id: id(),
    fromUnitId: uuid('from_unit_id')
      .notNull()
      .references(() => units.id),
    toUnitId: uuid('to_unit_id')
      .notNull()
      .references(() => units.id),
    factor: numeric('factor', { precision: 18, scale: 9 }).notNull(),
  },
  (t) => [uniqueIndex('unit_conversion_unique').on(t.fromUnitId, t.toUnitId)],
);
export const categories = pgTable(
  'categories',
  {
    id: id(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    status: recordStatus('status').notNull().default('ACTIVE'),
  },
  (t) => [uniqueIndex('categories_slug_unique').on(t.slug)],
);
export const products = pgTable(
  'products',
  {
    id: id(),
    sku: text('sku').notNull(),
    name: text('name').notNull(),
    categoryId: uuid('category_id').references(() => categories.id),
    baseUnitId: uuid('base_unit_id')
      .notNull()
      .references(() => units.id),
    salePrice: optionalMoney('sale_price'),
    status: recordStatus('status').notNull().default('PENDING'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('products_sku_unique').on(sql`lower(${t.sku})`)],
);
export const productVariants = pgTable(
  'product_variants',
  {
    id: id(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    sku: text('sku').notNull(),
    name: text('name').notNull(),
    attributes: jsonb('attributes')
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    status: recordStatus('status').notNull().default('ACTIVE'),
  },
  (t) => [uniqueIndex('product_variants_sku_unique').on(sql`lower(${t.sku})`)],
);
export const materials = pgTable(
  'materials',
  {
    id: id(),
    sku: text('sku').notNull(),
    name: text('name').notNull(),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => units.id),
    standardCost: optionalMoney('standard_cost'),
    minimumStock: qty('minimum_stock'),
    status: recordStatus('status').notNull().default('PENDING'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('materials_sku_unique').on(sql`lower(${t.sku})`)],
);
export const bomVersions = pgTable(
  'bom_versions',
  {
    id: id(),
    productVariantId: uuid('product_variant_id')
      .notNull()
      .references(() => productVariants.id),
    version: integer('version').notNull(),
    status: bomStatus('status').notNull().default('DRAFT'),
    validFrom: timestamp('valid_from', { withTimezone: true }),
    validTo: timestamp('valid_to', { withTimezone: true }),
    expectedYield: qty('expected_yield'),
    standardWastePct: numeric('standard_waste_pct', { precision: 7, scale: 4 })
      .notNull()
      .default('0'),
    estimatedCost: optionalMoney('estimated_cost'),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('bom_version_unique').on(t.productVariantId, t.version),
    uniqueIndex('bom_active_unique')
      .on(t.productVariantId)
      .where(sql`${t.status} = 'ACTIVE'`),
  ],
);
export const bomLines = pgTable(
  'bom_lines',
  {
    id: id(),
    bomVersionId: uuid('bom_version_id')
      .notNull()
      .references(() => bomVersions.id, { onDelete: 'cascade' }),
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id),
    quantity: qty('quantity'),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => units.id),
    wastePct: numeric('waste_pct', { precision: 7, scale: 4 })
      .notNull()
      .default('0'),
  },
  (t) => [
    uniqueIndex('bom_line_material_unique').on(t.bomVersionId, t.materialId),
  ],
);

export const warehouses = pgTable(
  'warehouses',
  {
    id: id(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    timezone: text('timezone').notNull().default('America/Bogota'),
    active: boolean('active').notNull().default(true),
  },
  (t) => [uniqueIndex('warehouses_code_unique').on(t.code)],
);
export const inventoryLots = pgTable(
  'inventory_lots',
  {
    id: id(),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id),
    materialId: uuid('material_id').references(() => materials.id),
    productVariantId: uuid('product_variant_id').references(
      () => productVariants.id,
    ),
    lotCode: text('lot_code').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('inventory_lot_unique').on(t.warehouseId, t.lotCode)],
);
export const inventoryMovements = pgTable(
  'inventory_movements',
  {
    id: id(),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id),
    lotId: uuid('lot_id').references(() => inventoryLots.id),
    materialId: uuid('material_id').references(() => materials.id),
    productVariantId: uuid('product_variant_id').references(
      () => productVariants.id,
    ),
    type: movementType('type').notNull(),
    quantity: qty('quantity'),
    unitCost: optionalMoney('unit_cost'),
    sourceType: text('source_type').notNull(),
    sourceId: uuid('source_id'),
    reversalOfId: uuid('reversal_of_id'),
    reason: text('reason'),
    idempotencyKey: text('idempotency_key').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
  },
  (t) => [
    uniqueIndex('inventory_idempotency_unique').on(t.idempotencyKey),
    uniqueIndex('inventory_reversal_unique')
      .on(t.reversalOfId)
      .where(sql`${t.reversalOfId} is not null`),
    check(
      'inventory_item_exactly_one',
      sql`num_nonnulls(${t.materialId}, ${t.productVariantId}) = 1`,
    ),
    check('inventory_quantity_nonzero', sql`${t.quantity} <> 0`),
    index('inventory_item_time_idx').on(
      t.warehouseId,
      t.materialId,
      t.productVariantId,
      t.occurredAt,
    ),
  ],
);
export const inventoryReservations = pgTable(
  'inventory_reservations',
  {
    id: id(),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id),
    productVariantId: uuid('product_variant_id')
      .notNull()
      .references(() => productVariants.id),
    sourceType: text('source_type').notNull(),
    sourceId: uuid('source_id').notNull(),
    quantity: qty('quantity'),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('inventory_reservation_source_unique').on(
      t.sourceType,
      t.sourceId,
    ),
    check('inventory_reservation_quantity_positive', sql`${t.quantity} > 0`),
  ],
);

export const suppliers = pgTable('suppliers', {
  id: id(),
  name: text('name').notNull(),
  taxId: text('tax_id'),
  email: text('email'),
  phone: text('phone'),
  status: recordStatus('status').notNull().default('ACTIVE'),
  createdAt: createdAt(),
});
export const purchaseOrders = pgTable(
  'purchase_orders',
  {
    id: id(),
    number: text('number').notNull(),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    status: documentStatus('status').notNull().default('DRAFT'),
    orderedAt: timestamp('ordered_at', { withTimezone: true }),
    approvedBy: text('approved_by').references(() => user.id),
    total: money('total'),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('purchase_orders_number_unique').on(sql`lower(${t.number})`),
  ],
);
export const purchaseOrderLines = pgTable(
  'purchase_order_lines',
  {
    id: id(),
    purchaseOrderId: uuid('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id),
    orderedQuantity: qty('ordered_quantity'),
    receivedQuantity: qty('received_quantity'),
    unitCost: money('unit_cost'),
  },
  (t) => [
    uniqueIndex('purchase_order_line_material_unique').on(
      t.purchaseOrderId,
      t.materialId,
    ),
    check('purchase_order_quantity_positive', sql`${t.orderedQuantity} > 0`),
    check(
      'purchase_received_quantity_valid',
      sql`${t.receivedQuantity} >= 0 and ${t.receivedQuantity} <= ${t.orderedQuantity}`,
    ),
  ],
);
export const purchaseReceipts = pgTable(
  'purchase_receipts',
  {
    id: id(),
    number: text('number').notNull(),
    purchaseOrderId: uuid('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id),
    receivedAt: timestamp('received_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('purchase_receipts_number_unique').on(sql`lower(${t.number})`),
  ],
);
export const purchaseReceiptLines = pgTable('purchase_receipt_lines', {
  id: id(),
  purchaseReceiptId: uuid('purchase_receipt_id')
    .notNull()
    .references(() => purchaseReceipts.id, { onDelete: 'cascade' }),
  purchaseOrderLineId: uuid('purchase_order_line_id')
    .notNull()
    .references(() => purchaseOrderLines.id),
  receivedQuantity: qty('received_quantity'),
  inventoryMovementId: uuid('inventory_movement_id')
    .notNull()
    .references(() => inventoryMovements.id),
});

export const productionOrders = pgTable(
  'production_orders',
  {
    id: id(),
    number: text('number').notNull(),
    productVariantId: uuid('product_variant_id')
      .notNull()
      .references(() => productVariants.id),
    bomVersionId: uuid('bom_version_id')
      .notNull()
      .references(() => bomVersions.id),
    bomSnapshot: jsonb('bom_snapshot').notNull(),
    plannedQuantity: qty('planned_quantity'),
    completedQuantity: qty('completed_quantity'),
    status: documentStatus('status').notNull().default('DRAFT'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('production_orders_number_unique').on(sql`lower(${t.number})`),
    check(
      'production_planned_quantity_positive',
      sql`${t.plannedQuantity} > 0`,
    ),
    check(
      'production_completed_quantity_valid',
      sql`${t.completedQuantity} >= 0`,
    ),
  ],
);
export const productionConsumptions = pgTable(
  'production_consumptions',
  {
    id: id(),
    productionOrderId: uuid('production_order_id')
      .notNull()
      .references(() => productionOrders.id),
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id),
    theoreticalQuantity: qty('theoretical_quantity'),
    actualQuantity: qty('actual_quantity'),
    inventoryMovementId: uuid('inventory_movement_id').references(
      () => inventoryMovements.id,
    ),
  },
  (t) => [
    uniqueIndex('production_consumption_material_unique').on(
      t.productionOrderId,
      t.materialId,
    ),
    check(
      'production_theoretical_quantity_positive',
      sql`${t.theoreticalQuantity} > 0`,
    ),
    check('production_actual_quantity_positive', sql`${t.actualQuantity} > 0`),
  ],
);

export const customers = pgTable(
  'customers',
  {
    id: id(),
    type: text('type').notNull(),
    name: text('name').notNull(),
    taxId: text('tax_id'),
    email: text('email'),
    phone: text('phone'),
    status: recordStatus('status').notNull().default('ACTIVE'),
    createdAt: createdAt(),
  },
  (t) => [check('customer_type_valid', sql`${t.type} in ('B2C', 'B2B')`)],
);
export const salesOrders = pgTable(
  'sales_orders',
  {
    id: id(),
    number: text('number').notNull(),
    customerId: uuid('customer_id').references(() => customers.id),
    status: documentStatus('status').notNull().default('DRAFT'),
    projectionKind: projectionKind('projection_kind').notNull().default('REAL'),
    total: money('total'),
    costOfGoods: money('cost_of_goods'),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('sales_orders_number_unique').on(sql`lower(${t.number})`),
  ],
);
export const salesOrderLines = pgTable(
  'sales_order_lines',
  {
    id: id(),
    salesOrderId: uuid('sales_order_id')
      .notNull()
      .references(() => salesOrders.id, { onDelete: 'cascade' }),
    productVariantId: uuid('product_variant_id')
      .notNull()
      .references(() => productVariants.id),
    quantity: qty('quantity'),
    unitPrice: money('unit_price'),
    unitCostSnapshot: money('unit_cost_snapshot'),
  },
  (t) => [
    uniqueIndex('sales_order_line_variant_unique').on(
      t.salesOrderId,
      t.productVariantId,
    ),
    check('sales_order_line_quantity_positive', sql`${t.quantity} > 0`),
  ],
);

export const financialAccounts = pgTable(
  'financial_accounts',
  {
    id: id(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    type: text('type').notNull(),
    currency: text('currency').notNull().default('COP'),
    openingBalance: money('opening_balance'),
    status: recordStatus('status').notNull().default('ACTIVE'),
  },
  (t) => [
    uniqueIndex('financial_accounts_code_unique').on(sql`lower(${t.code})`),
    check(
      'financial_account_type_valid',
      sql`${t.type} in ('CASH', 'BANK', 'WALLET', 'OTHER')`,
    ),
  ],
);
export const financialMovements = pgTable(
  'financial_movements',
  {
    id: id(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => financialAccounts.id),
    type: text('type').notNull(),
    amount: money('amount'),
    category: text('category').notNull(),
    description: text('description').notNull(),
    sourceType: text('source_type'),
    sourceId: uuid('source_id'),
    reversalOfId: uuid('reversal_of_id'),
    projectionKind: projectionKind('projection_kind').notNull().default('REAL'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('financial_reversal_unique')
      .on(t.reversalOfId)
      .where(sql`${t.reversalOfId} is not null`),
    check(
      'financial_movement_type_valid',
      sql`${t.type} in ('INCOME', 'EXPENSE', 'REVERSAL')`,
    ),
    check('financial_movement_amount_nonzero', sql`${t.amount} <> 0`),
  ],
);

export const payments = pgTable(
  'payments',
  {
    id: id(),
    reference: text('reference').notNull(),
    salesOrderId: uuid('sales_order_id')
      .notNull()
      .references(() => salesOrders.id),
    accountId: uuid('account_id')
      .notNull()
      .references(() => financialAccounts.id),
    amount: money('amount'),
    method: text('method').notNull(),
    financialMovementId: uuid('financial_movement_id')
      .notNull()
      .references(() => financialMovements.id),
    reversedAt: timestamp('reversed_at', { withTimezone: true }),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('payments_reference_unique').on(sql`lower(${t.reference})`),
    uniqueIndex('payments_financial_movement_unique').on(t.financialMovementId),
    check('payment_amount_positive', sql`${t.amount} > 0`),
  ],
);

export const expenses = pgTable(
  'expenses',
  {
    id: id(),
    reference: text('reference').notNull(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => financialAccounts.id),
    category: text('category').notNull(),
    description: text('description').notNull(),
    amount: money('amount'),
    financialMovementId: uuid('financial_movement_id')
      .notNull()
      .references(() => financialMovements.id),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    reversedAt: timestamp('reversed_at', { withTimezone: true }),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('expenses_reference_unique').on(sql`lower(${t.reference})`),
    uniqueIndex('expenses_financial_movement_unique').on(t.financialMovementId),
    check('expense_amount_positive', sql`${t.amount} > 0`),
  ],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: id(),
    actorUserId: text('actor_user_id').references(() => user.id),
    operation: text('operation').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    beforeJson: jsonb('before_json'),
    afterJson: jsonb('after_json'),
    reason: text('reason'),
    correlationId: uuid('correlation_id').notNull().defaultRandom(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('audit_entity_idx').on(t.entityType, t.entityId)],
);
export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: id(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: uuid('aggregate_id').notNull(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
  },
  (t) => [index('outbox_unpublished_idx').on(t.publishedAt)],
);
export const idempotencyKeys = pgTable('idempotency_keys', {
  key: text('key').primaryKey(),
  operation: text('operation').notNull(),
  response: jsonb('response'),
  createdAt: createdAt(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});
export const systemSettings = pgTable('system_settings', {
  id: integer('id').primaryKey().default(1),
  companyName: text('company_name').notNull().default('LÚMINA Candle Studio'),
  currency: text('currency').notNull().default('COP'),
  timezone: text('timezone').notNull().default('America/Bogota'),
  warehouseLimit: integer('warehouse_limit').notNull().default(1),
  updatedAt: updatedAt(),
});
