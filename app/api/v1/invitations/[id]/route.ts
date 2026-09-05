import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/db';
import { auditLogs, invitations, user } from '@/db/schema';
import { accessErrorResponse, authorize } from '@/lib/authorization';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await authorize(request.headers, 'users', 'admin');
    const { id } = await params;
    const db = getDb();
    const [invitation] = await db
      .select({ email: invitations.email })
      .from(invitations)
      .where(
        and(
          eq(invitations.id, id),
          isNull(invitations.acceptedAt),
          isNull(invitations.cancelledAt),
        ),
      )
      .limit(1);
    if (!invitation)
      return Response.json({ error: 'INVITATION_NOT_FOUND' }, { status: 404 });
    const [invitedUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, invitation.email))
      .limit(1);
    await db.transaction(async (tx) => {
      await tx
        .update(invitations)
        .set({ cancelledAt: new Date() })
        .where(eq(invitations.id, id));
      if (invitedUser) await tx.delete(user).where(eq(user.id, invitedUser.id));
      await tx.insert(auditLogs).values({
        actorUserId: actor.id,
        operation: 'INVITATION_CANCELLED',
        entityType: 'invitation',
        entityId: id,
        beforeJson: { email: invitation.email },
      });
    });
    return Response.json({ id, cancelled: true });
  } catch (error) {
    return (
      accessErrorResponse(error) ??
      Response.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
    );
  }
}
