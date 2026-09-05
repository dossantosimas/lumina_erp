import 'server-only';
import { betterAuth } from 'better-auth';
import { eq } from 'drizzle-orm';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { admin } from 'better-auth/plugins/admin';
import { getDb } from '@/db';
import { user as appUser } from '@/db/schema';
import { getAppUrl } from '@/lib/app-url';
import { sendEmail } from '@/lib/email';
import {
  acceptPendingInvitations,
  sendPasswordEmail,
} from '@/lib/invitation-email';
import { INVITATION_TTL_SECONDS } from '@/modules/sistema/domain/invitation-rules';

const appUrl = getAppUrl();
const configuredSecret = process.env.BETTER_AUTH_SECRET;
if (!configuredSecret && process.env.VERCEL)
  throw new Error('BETTER_AUTH_SECRET es obligatorio en Vercel.');

export const auth = betterAuth({
  appName: 'LÚMINA OS',
  baseURL: appUrl,
  secret: configuredSecret ?? 'local-build-only-secret-replace-before-running',
  database: drizzleAdapter(getDb(), { provider: 'pg' }),
  trustedOrigins: [appUrl],
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    requireEmailVerification: true,
    minPasswordLength: 12,
    resetPasswordTokenExpiresIn: INVITATION_TTL_SECONDS,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordEmail({ email: user.email, name: user.name, url });
    },
    onPasswordReset: async ({ user }) => acceptPendingInvitations(user.email),
  },
  emailVerification: {
    sendOnSignUp: false,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: 'Verifica tu correo de LÚMINA OS',
        text: `Hola ${user.name}. Verifica tu correo: ${url}`,
        html: `<p>Hola ${user.name},</p><p><a href="${url}">Verificar correo</a></p>`,
      });
    },
  },
  rateLimit: { enabled: true, storage: 'database', window: 60, max: 100 },
  databaseHooks: {
    session: {
      create: {
        after: async (newSession) => {
          const db = getDb();
          const [member] = await db
            .select({ email: appUser.email })
            .from(appUser)
            .where(eq(appUser.id, newSession.userId))
            .limit(1);
          if (member) await acceptPendingInvitations(member.email);
        },
      },
    },
  },
  plugins: [
    admin({ defaultRole: 'user', adminRoles: ['admin'] }),
    nextCookies(),
  ],
});
