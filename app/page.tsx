import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Dashboard } from './dashboard';
import { isDatabaseConfigured } from '@/db';
import { auth } from '@/lib/auth';
import { getDashboardSnapshot } from '@/modules/dashboard/queries/get-dashboard-snapshot';
import { getDashboardAccess } from '@/modules/dashboard/queries/get-dashboard-access';

export const dynamic = 'force-dynamic';

export default async function Home() {
  if (!isDatabaseConfigured()) return <SetupRequired />;
  const current = await auth.api.getSession({ headers: await headers() });
  if (!current) redirect('/login');
  const access = await getDashboardAccess(current.user.id);
  const snapshot = await getDashboardSnapshot(access);
  return (
    <Dashboard
      user={{ name: current.user.name, email: current.user.email }}
      snapshot={snapshot}
      access={access}
    />
  );
}

function SetupRequired() {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--canvas)] p-5">
      <section className="w-full max-w-2xl rounded-3xl border bg-background p-8 shadow-xl">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-[#9a775a]">
          LÚMINA OS · Configuración segura
        </p>
        <h1 className="mt-3 font-heading text-4xl font-semibold">
          Falta conectar Neon
        </h1>
        <p className="mt-4 leading-7 text-muted-foreground">
          La aplicación ya no muestra datos demostrativos. Define las variables
          de entorno, ejecuta la migración PostgreSQL y crea el primer
          administrador para comenzar la carga inicial.
        </p>
        <code className="mt-6 block rounded-xl bg-[#183b31] p-4 text-sm text-white">
          DATABASE_URL · BETTER_AUTH_SECRET · BETTER_AUTH_URL
        </code>
      </section>
    </main>
  );
}
