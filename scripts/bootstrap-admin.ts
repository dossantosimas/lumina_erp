import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { account, auditLogs, roles, user, userRoles } from '../db/schema.ts';

const connectionString = process.env.DATABASE_URL;
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const name = process.env.ADMIN_NAME?.trim();
const password = process.env.ADMIN_PASSWORD;
if (!connectionString || !email || !name || !password)
  throw new Error(
    'Define DATABASE_URL, ADMIN_EMAIL, ADMIN_NAME y ADMIN_PASSWORD.',
  );
if (password.length < 12)
  throw new Error('ADMIN_PASSWORD debe tener al menos 12 caracteres.');

const pool = new pg.Pool({ connectionString });
const db = drizzle(pool);
const [existing] = await db
  .select({ id: user.id })
  .from(user)
  .where(eq(user.email, email))
  .limit(1);
if (existing) throw new Error('Ya existe un usuario con ese correo.');
const [adminRole] = await db
  .select({ id: roles.id })
  .from(roles)
  .where(eq(roles.code, 'ADMIN'))
  .limit(1);
if (!adminRole) throw new Error('Ejecuta primero pnpm db:seed.');
const userId = randomUUID();
const now = new Date();
const passwordHash = await hashPassword(password);
await db.transaction(async (tx) => {
  await tx.insert(user).values({
    id: userId,
    name,
    email,
    emailVerified: true,
    role: 'admin',
    createdAt: now,
    updatedAt: now,
  });
  await tx.insert(account).values({
    id: randomUUID(),
    accountId: userId,
    providerId: 'credential',
    issuer: 'local:credential',
    userId,
    password: passwordHash,
    createdAt: now,
    updatedAt: now,
  });
  await tx
    .insert(userRoles)
    .values({ userId, roleId: adminRole.id, assignedBy: userId });
  await tx.insert(auditLogs).values({
    actorUserId: userId,
    operation: 'BOOTSTRAP_ADMIN_CREATED',
    entityType: 'user',
    entityId: userId,
    afterJson: { email, roles: ['ADMIN'] },
    reason: 'Ceremonia inicial de configuración',
  });
});
await pool.end();
console.info(
  `Administrador inicial creado para ${email}. Cambia la contraseña después del primer acceso.`,
);
