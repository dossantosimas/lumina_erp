import 'server-only';
import { betterAuth } from 'better-auth';
import { and, eq, isNull } from 'drizzle-orm';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { admin } from 'better-auth/plugins/admin';
import { getDb } from '@/db';
import { invitations, user as appUser } from '@/db/schema';
import { sendEmail } from '@/lib/email';

const appUrl =
  process.env.BETTER_AUTH_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  'http://localhost:3000';
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
    sendResetPassword: async ({ user, url }) =>
      sendEmail({
        to: user.email,
        subject: 'Define tu contraseña de LÚMINA OS',
        html: `<p>Hola ${user.name},</p><p>Usa este enlace seguro para definir tu contraseña:</p><p><a href="${url}">Definir contraseña</a></p>`,
      }),
  },
  emailVerification: {
    sendOnSignUp: false,
    sendVerificationEmail: async ({ user, url }) =>
      sendEmail({
        to: user.email,
        subject: 'Verifica tu correo de LÚMINA OS',
        html: `<p>Hola ${user.name},</p><p><a href="${url}">Verificar correo</a></p>`,
      }),
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
          if (member)
            await db
              .update(invitations)
              .set({ acceptedAt: new Date() })
              .where(
                and(
                  eq(invitations.email, member.email),
                  isNull(invitations.acceptedAt),
                ),
              );
        },
      },
    },
  },
  plugins: [
    admin({ defaultRole: 'user', adminRoles: ['admin'] }),
    nextCookies(),
  ],
});
