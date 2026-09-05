export const INVITATION_TTL_SECONDS = 72 * 60 * 60;
export const INVITATION_TTL_MS = INVITATION_TTL_SECONDS * 1000;

export function sanitizeEmailFailure(error: unknown) {
  const message = error instanceof Error ? error.message : 'SMTP_UNKNOWN_ERROR';
  return message.replace(/[\r\n]+/g, ' ').slice(0, 300);
}

export function invitationIsActionable(
  invitation: {
    acceptedAt: Date | null;
    cancelledAt: Date | null;
    expiresAt: Date;
  },
  now = new Date(),
) {
  return (
    invitation.acceptedAt === null &&
    invitation.cancelledAt === null &&
    invitation.expiresAt.getTime() > now.getTime()
  );
}
