import 'server-only';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  auditLogs,
  invitationRoles,
  invitations,
  roles,
  user,
  userRoles,
} from '@/db/schema';

export async function getUsersSnapshot() {
  const db = getDb();
  const [members, memberRoles, pending, pendingRoles, audit] =
    await Promise.all([
      db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          active: user.active,
          emailVerified: user.emailVerified,
          createdAt: user.createdAt,
        })
        .from(user)
        .orderBy(asc(user.name)),
      db
        .select({
          userId: userRoles.userId,
          code: roles.code,
          name: roles.name,
        })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id)),
      db
        .select({
          id: invitations.id,
          email: invitations.email,
          emailStatus: invitations.emailStatus,
          expiresAt: invitations.expiresAt,
          lastAttemptAt: invitations.lastAttemptAt,
          sentAt: invitations.sentAt,
          lastError: invitations.lastError,
          createdAt: invitations.createdAt,
        })
        .from(invitations)
        .where(
          and(isNull(invitations.acceptedAt), isNull(invitations.cancelledAt)),
        )
        .orderBy(desc(invitations.createdAt)),
      db
        .select({
          invitationId: invitationRoles.invitationId,
          code: roles.code,
          name: roles.name,
        })
        .from(invitationRoles)
        .innerJoin(roles, eq(invitationRoles.roleId, roles.id)),
      db
        .select({
          id: auditLogs.id,
          operation: auditLogs.operation,
          entityType: auditLogs.entityType,
          entityId: auditLogs.entityId,
          reason: auditLogs.reason,
          occurredAt: auditLogs.occurredAt,
          actorName: user.name,
          actorEmail: user.email,
        })
        .from(auditLogs)
        .leftJoin(user, eq(auditLogs.actorUserId, user.id))
        .orderBy(desc(auditLogs.occurredAt))
        .limit(100),
    ]);
  return {
    members: members.map((member) => ({
      ...member,
      roles: memberRoles
        .filter((role) => role.userId === member.id)
        .map(({ code, name }) => ({ code, name })),
    })),
    invitations: pending.map((invitation) => ({
      ...invitation,
      roles: pendingRoles
        .filter((role) => role.invitationId === invitation.id)
        .map(({ code, name }) => ({ code, name })),
    })),
    audit,
  };
}
