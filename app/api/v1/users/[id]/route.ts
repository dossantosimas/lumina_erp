import { and, count, eq, inArray, ne } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { auditLogs, roles, session, user, userRoles } from '@/db/schema';
import { accessErrorResponse, authorize } from '@/lib/authorization';

const roleCode = z.enum([
  'ADMIN',
  'PRODUCTION',
  'SALES',
  'INVENTORY',
  'FINANCE',
  'PLANNING',
]);
const updateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  roles: z.array(roleCode).min(1).max(6),
  active: z.boolean().optional(),
  reason: z.string().trim().min(3).max(250),
});
const deleteSchema = z.object({ reason: z.string().trim().min(3).max(250) });

async function activeAdminCount(excludedUserId?: string) {
  const db = getDb();
  const filters = [eq(roles.code, 'ADMIN'), eq(user.active, true)];
  if (excludedUserId) filters.push(ne(user.id, excludedUserId));
  const [result] = await db
    .select({ value: count() })
    .from(user)
    .innerJoin(userRoles, eq(userRoles.userId, user.id))
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(and(...filters));
  return result?.value ?? 0;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await authorize(request.headers, 'users', 'admin');
    const { id } = await context.params;
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success)
      return Response.json(
        { error: 'VALIDATION_ERROR', fields: z.treeifyError(parsed.error) },
        { status: 400 },
      );
    const db = getDb();
    const [target] = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        active: user.active,
      })
      .from(user)
      .where(eq(user.id, id))
      .limit(1);
    if (!target)
      return Response.json({ error: 'USER_NOT_FOUND' }, { status: 404 });
    const uniqueRoles = [...new Set(parsed.data.roles)];
    if (
      actor.id === id &&
      (!uniqueRoles.includes('ADMIN') || parsed.data.active === false)
    )
      return Response.json(
        { error: 'SELF_ADMIN_LOCKOUT_FORBIDDEN' },
        { status: 409 },
      );
    const selectedRoles = await db
      .select({ id: roles.id, code: roles.code })
      .from(roles)
      .where(inArray(roles.code, uniqueRoles));
    if (selectedRoles.length !== uniqueRoles.length)
      return Response.json({ error: 'UNKNOWN_ROLE' }, { status: 400 });
    const currentRoles = await db
      .select({ code: roles.code })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, id));
    if (
      currentRoles.some((role) => role.code === 'ADMIN') &&
      !uniqueRoles.includes('ADMIN') &&
      (await activeAdminCount(id)) === 0
    )
      return Response.json({ error: 'LAST_ADMIN_REQUIRED' }, { status: 409 });
    const nextActive = parsed.data.active ?? target.active;
    await db.transaction(async (tx) => {
      await tx
        .update(user)
        .set({
          name: parsed.data.name,
          active: nextActive,
          banned: !nextActive,
          banReason: nextActive ? null : parsed.data.reason,
          banExpires: null,
          role: uniqueRoles.includes('ADMIN') ? 'admin' : 'user',
          updatedAt: new Date(),
        })
        .where(eq(user.id, id));
      await tx.delete(userRoles).where(eq(userRoles.userId, id));
      await tx.insert(userRoles).values(
        selectedRoles.map((role) => ({
          userId: id,
          roleId: role.id,
          assignedBy: actor.id,
        })),
      );
      if (!nextActive) await tx.delete(session).where(eq(session.userId, id));
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: nextActive ? 'USER_UPDATED' : 'USER_ACCESS_REMOVED',
        entityType: 'user',
        entityId: id,
        beforeJson: {
          name: target.name,
          active: target.active,
          roles: currentRoles.map((role) => role.code),
        },
        afterJson: {
          name: parsed.data.name,
          active: nextActive,
          roles: uniqueRoles,
        },
        reason: parsed.data.reason,
      });
    });
    return Response.json({
      data: {
        id,
        name: parsed.data.name,
        active: nextActive,
        roles: uniqueRoles,
      },
    });
  } catch (error) {
    const access = accessErrorResponse(error);
    if (access) return access;
    console.error('No fue posible actualizar el usuario.', error);
    return Response.json({ error: 'USER_UPDATE_FAILED' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await authorize(request.headers, 'users', 'admin');
    const { id } = await context.params;
    if (actor.id === id)
      return Response.json(
        { error: 'SELF_DEACTIVATION_FORBIDDEN' },
        { status: 409 },
      );
    const parsed = deleteSchema.safeParse(await request.json());
    if (!parsed.success)
      return Response.json(
        { error: 'VALIDATION_ERROR', fields: z.treeifyError(parsed.error) },
        { status: 400 },
      );
    const db = getDb();
    const [target] = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        active: user.active,
      })
      .from(user)
      .where(eq(user.id, id))
      .limit(1);
    if (!target)
      return Response.json({ error: 'USER_NOT_FOUND' }, { status: 404 });
    if (!target.active)
      return Response.json({ data: { id, active: false }, idempotent: true });
    const currentRoles = await db
      .select({ code: roles.code })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, id));
    if (
      currentRoles.some((role) => role.code === 'ADMIN') &&
      (await activeAdminCount(id)) === 0
    )
      return Response.json({ error: 'LAST_ADMIN_REQUIRED' }, { status: 409 });
    await db.transaction(async (tx) => {
      await tx
        .update(user)
        .set({
          active: false,
          banned: true,
          banReason: parsed.data.reason,
          banExpires: null,
          updatedAt: new Date(),
        })
        .where(eq(user.id, id));
      await tx.delete(session).where(eq(session.userId, id));
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'USER_ACCESS_REMOVED',
        entityType: 'user',
        entityId: id,
        beforeJson: {
          active: true,
          roles: currentRoles.map((role) => role.code),
        },
        afterJson: {
          active: false,
          roles: currentRoles.map((role) => role.code),
        },
        reason: parsed.data.reason,
      });
    });
    return Response.json({ data: { id, active: false } });
  } catch (error) {
    const access = accessErrorResponse(error);
    if (access) return access;
    console.error('No fue posible retirar el acceso.', error);
    return Response.json({ error: 'USER_DELETE_FAILED' }, { status: 500 });
  }
}
