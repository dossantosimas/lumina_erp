import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  invitationRoles,
  invitations,
  roles,
  user as appUser,
} from '@/db/schema';
import { getAppUrl } from '@/lib/app-url';
import { sendEmail } from '@/lib/email';
import { sanitizeEmailFailure } from '@/modules/sistema/domain/invitation-rules';

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      })[character]!,
  );

function bogotaDate(value: Date) {
  return value
    .toLocaleString('es-CO', {
      timeZone: 'America/Bogota',
      dateStyle: 'long',
      timeStyle: 'short',
    })
    .replace(/[\u00a0\u202f]/g, ' ');
}

export async function sendPasswordEmail({
  email,
  name,
  url,
}: {
  email: string;
  name: string;
  url: string;
}) {
  const db = getDb();
  const [invitation] = await db
    .select({
      id: invitations.id,
      expiresAt: invitations.expiresAt,
      inviterName: appUser.name,
    })
    .from(invitations)
    .innerJoin(appUser, eq(invitations.invitedBy, appUser.id))
    .where(
      and(
        eq(invitations.email, email),
        isNull(invitations.acceptedAt),
        isNull(invitations.cancelledAt),
      ),
    )
    .orderBy(desc(invitations.createdAt))
    .limit(1);

  if (!invitation) {
    return sendEmail({
      to: email,
      subject: 'Restablece tu contraseña de LÚMINA OS',
      text: `Hola ${name}. Usa este enlace seguro para restablecer tu contraseña: ${url}`,
      html: `<p>Hola ${escapeHtml(name)},</p><p>Usa este enlace seguro para restablecer tu contraseña:</p><p><a href="${escapeHtml(url)}">Restablecer contraseña</a></p>`,
    });
  }

  const roleRows = await db
    .select({ name: roles.name })
    .from(invitationRoles)
    .innerJoin(roles, eq(invitationRoles.roleId, roles.id))
    .where(eq(invitationRoles.invitationId, invitation.id));
  const roleNames = roleRows.map((role) => role.name);
  const expiry = bogotaDate(invitation.expiresAt);
  const safeUrl = escapeHtml(url);
  const logoUrl = `${getAppUrl()}/brand/lumina-lockup.png`;

  await db
    .update(invitations)
    .set({ emailStatus: 'PENDING', lastAttemptAt: new Date(), lastError: null })
    .where(eq(invitations.id, invitation.id));

  try {
    const result = await sendEmail({
      to: email,
      subject: `${name}, te invitaron a LÚMINA OS`,
      text: [
        `Hola ${name}.`,
        `${invitation.inviterName} te invitó a LÚMINA OS.`,
        `Roles: ${roleNames.join(', ')}.`,
        `Crea tu contraseña antes del ${expiry}: ${url}`,
        'LÚMINA nunca te enviará una contraseña por correo.',
      ].join('\n\n'),
      html: `<!doctype html><html lang="es"><body style="margin:0;background:#f5eddd;color:#493521;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fffaf0;border:1px solid #dfcda8;border-radius:20px;overflow:hidden"><tr><td align="center" style="padding:32px 32px 16px"><img src="${escapeHtml(logoUrl)}" width="280" alt="LÚMINA Candle Studio" style="display:block;max-width:100%;height:auto"><h1 style="font-family:Georgia,serif;font-size:28px;margin:24px 0 8px">Bienvenida a LÚMINA OS</h1><p style="line-height:1.6;margin:0">Hola ${escapeHtml(name)}, ${escapeHtml(invitation.inviterName)} te invitó a administrar la operación de LÚMINA.</p></td></tr><tr><td style="padding:16px 32px"><p style="margin:0 0 8px;font-weight:bold">Roles asignados</p><p style="margin:0;color:#735d43">${escapeHtml(roleNames.join(', '))}</p></td></tr><tr><td align="center" style="padding:16px 32px"><a href="${safeUrl}" style="display:inline-block;background:#9b6a28;color:#fffaf0;text-decoration:none;font-weight:bold;padding:14px 24px;border-radius:12px">Crear contraseña y entrar</a><p style="font-size:13px;color:#735d43;margin:18px 0 0">El enlace vence el ${escapeHtml(expiry)} (hora de Bogotá).</p></td></tr><tr><td style="padding:16px 32px 32px"><p style="font-size:12px;line-height:1.5;color:#735d43">Si el botón no funciona, copia este enlace:<br><a href="${safeUrl}" style="color:#81551d;word-break:break-all">${safeUrl}</a></p><p style="font-size:12px;color:#735d43">Por seguridad, LÚMINA nunca te enviará una contraseña por correo.</p></td></tr></table><p style="font-size:12px;color:#735d43">LÚMINA Candle Studio</p></td></tr></table></body></html>`,
    });
    await db
      .update(invitations)
      .set({
        emailStatus: 'SENT',
        sentAt: new Date(),
        providerMessageId: result.messageId,
        lastError: null,
      })
      .where(eq(invitations.id, invitation.id));
    return result;
  } catch (error) {
    await db
      .update(invitations)
      .set({ emailStatus: 'FAILED', lastError: sanitizeEmailFailure(error) })
      .where(eq(invitations.id, invitation.id));
    throw error;
  }
}

export async function acceptPendingInvitations(email: string) {
  const db = getDb();
  const pending = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(
      and(
        eq(invitations.email, email),
        isNull(invitations.acceptedAt),
        isNull(invitations.cancelledAt),
      ),
    );
  await db.transaction(async (tx) => {
    await tx
      .update(appUser)
      .set({ emailVerified: true, updatedAt: new Date() })
      .where(eq(appUser.email, email));
    if (pending.length)
      await tx
        .update(invitations)
        .set({ emailStatus: 'ACCEPTED', acceptedAt: new Date() })
        .where(
          inArray(
            invitations.id,
            pending.map(({ id }) => id),
          ),
        );
  });
}
