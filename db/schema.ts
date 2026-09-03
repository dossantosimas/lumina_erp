import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(), externalUserId: text('external_user_id').notNull(), email: text('email').notNull(),
  displayName: text('display_name').notNull(), active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(), updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, (t) => [uniqueIndex('users_external_user_id_unique').on(t.externalUserId), uniqueIndex('users_email_unique').on(t.email)]);

export const roles = sqliteTable('roles', {
  id: text('id').primaryKey(), code: text('code').notNull(), name: text('name').notNull(), description: text('description'),
  system: integer('system', { mode: 'boolean' }).notNull().default(false),
}, (t) => [uniqueIndex('roles_code_unique').on(t.code)]);

export const permissions = sqliteTable('permissions', {
  id: text('id').primaryKey(), resource: text('resource').notNull(), action: text('action').notNull(), description: text('description'),
}, (t) => [uniqueIndex('permissions_resource_action_unique').on(t.resource, t.action)]);

export const userRoles = sqliteTable('user_roles', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  roleId: text('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  assignedBy: text('assigned_by').references(() => users.id), assignedAt: integer('assigned_at', { mode: 'timestamp_ms' }).notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.roleId] }), index('idx_user_roles_role_id').on(t.roleId)]);

export const rolePermissions = sqliteTable('role_permissions', {
  roleId: text('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  permissionId: text('permission_id').notNull().references(() => permissions.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.roleId, t.permissionId] }), index('idx_role_permissions_permission_id').on(t.permissionId)]);

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(), actorUserId: text('actor_user_id').references(() => users.id), entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(), action: text('action').notNull(), beforeJson: text('before_json'), afterJson: text('after_json'),
  reason: text('reason'), occurredAt: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
}, (t) => [index('idx_audit_logs_entity').on(t.entityType, t.entityId), index('idx_audit_logs_actor_time').on(t.actorUserId, t.occurredAt)]);
