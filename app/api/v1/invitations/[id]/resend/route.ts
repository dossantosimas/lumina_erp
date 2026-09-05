import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/db';
import { auditLogs, invitations } from '@/db/schema';
import { auth } from '@/lib/auth';
import { getAppUrl } from '@/lib/app-url';
import { accessErrorResponse, authorize } from '@/lib/authorization';
import { INVITATION_TTL_MS } from '@/modules/sistema/domain/invitation-rules';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await authorize(request.headers, 'users', 'create');
    const { id } = await params;
    const [invitation] = await getDb()
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
    await getDb()
      .update(invitations)
      .set({ expiresAt: new Date(Date.now() + INVITATION_TTL_MS) })
      .where(eq(invitations.id, id));
    let emailStatus: 'SENT' | 'FAILED' = 'SENT';
    try {
      await auth.api.requestPasswordReset({
        body: {
          email: invitation.email,
          redirectTo: `${getAppUrl()}/reset-password`,
        },
      });
    } catch (error) {
      emailStatus = 'FAILED';
      console.error('No fue posible reenviar la invitación.', error);
    }
    await getDb()
      .insert(auditLogs)
      .values({
        actorUserId: actor.id,
        operation: 'INVITATION_RESENT',
        entityType: 'invitation',
        entityId: id,
        afterJson: { email: invitation.email, emailStatus },
      });
    return Response.json({ id, email: invitation.email, emailStatus });
  } catch (error) {
    return (
      accessErrorResponse(error) ??
      Response.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
    );
  }
}
