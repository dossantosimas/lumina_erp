import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import {
  auditLogs,
  invitationRoles,
  invitations,
  outboxEvents,
  roles,
  user,
  userRoles,
} from '@/db/schema';
import { auth } from '@/lib/auth';
import { accessErrorResponse, authorize } from '@/lib/authorization';

const roleCode = z.enum([
  'ADMIN',
  'PRODUCTION',
  'SALES',
  'INVENTORY',
  'FINANCE',
  'PLANNING',
]);
const requestSchema = z.object({
  email: z.email(),
  name: z.string().trim().min(2).max(120),
  roles: z.array(roleCode).min(1).max(6),
});

async function sendPasswordSetup(email: string) {
  await auth.api.requestPasswordReset({
    body: {
      email,
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/reset-password`,
    },
  });
}

export async function POST(request: Request) {
  try {
    const actor = await authorize(request.headers, 'users', 'create');
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success)
      return Response.json(
        { error: 'VALIDATION_ERROR', fields: z.treeifyError(parsed.error) },
        { status: 400 },
      );
    const db = getDb();
    const email = parsed.data.email.trim().toLowerCase();
    const [existingUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);
    if (existingUser) {
      const [pendingInvitation] = await db
        .select({ id: invitations.id })
        .from(invitations)
        .where(
          and(eq(invitations.email, email), isNull(invitations.acceptedAt)),
        )
        .orderBy(desc(invitations.createdAt))
        .limit(1);
      if (!pendingInvitation)
        return Response.json(
          { error: 'EMAIL_ALREADY_REGISTERED' },
          { status: 409 },
        );
      await sendPasswordSetup(email);
      await db.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'INVITATION_RESENT',
        entityType: 'invitation',
        entityId: pendingInvitation.id,
        afterJson: { email },
      });
      return Response.json({ id: pendingInvitation.id, email, resent: true });
    }
    const uniqueRoles = [...new Set(parsed.data.roles)];
    const selectedRoles = await db
      .select({ id: roles.id, code: roles.code })
      .from(roles)
      .where(inArray(roles.code, uniqueRoles));
    if (selectedRoles.length !== uniqueRoles.length)
      return Response.json({ error: 'UNKNOWN_ROLE' }, { status: 400 });
    const temporaryPassword = `${randomBytes(18).toString('base64url')}aA1!`;
    const created = await auth.api.createUser({
      headers: request.headers,
      body: {
        email,
        name: parsed.data.name,
        password: temporaryPassword,
        role: uniqueRoles.includes('ADMIN') ? 'admin' : 'user',
      },
    });
    const invitationId = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(invitations).values({
        id: invitationId,
        email,
        tokenHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
        invitedBy: actor.id,
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      });
      await tx
        .insert(invitationRoles)
        .values(
          selectedRoles.map((role) => ({ invitationId, roleId: role.id })),
        );
      await tx.insert(userRoles).values(
        selectedRoles.map((role) => ({
          userId: created.user.id,
          roleId: role.id,
          assignedBy: actor.id,
        })),
      );
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'INVITATION_CREATED',
        entityType: 'invitation',
        entityId: invitationId,
        afterJson: { email, roles: uniqueRoles },
      });
      await tx.insert(outboxEvents).values({
        aggregateType: 'invitation',
        aggregateId: invitationId,
        eventType: 'InvitationCreated',
        payload: { email, roles: uniqueRoles },
      });
    });
    await sendPasswordSetup(email);
    return Response.json(
      { id: invitationId, email, expiresInHours: 72 },
      { status: 201 },
    );
  } catch (error) {
    const access = accessErrorResponse(error);
    if (access) return access;
    console.error('No fue posible crear la invitación.', error);
    return Response.json({ error: 'INVITATION_FAILED' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    await authorize(request.headers, 'users', 'view');
    const rows = await getDb()
      .select({
        id: invitations.id,
        email: invitations.email,
        expiresAt: invitations.expiresAt,
        createdAt: invitations.createdAt,
      })
      .from(invitations)
      .where(isNull(invitations.acceptedAt))
      .orderBy(desc(invitations.createdAt));
    return Response.json({ data: rows });
  } catch (error) {
    return (
      accessErrorResponse(error) ??
      Response.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
    );
  }
}
