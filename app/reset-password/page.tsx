import { Suspense } from 'react';
import { ResetPasswordForm } from './reset-password-form';
export default function ResetPasswordPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--canvas)] p-5">
      <section className="w-full max-w-md rounded-3xl border bg-background p-8 shadow-xl">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-[#9a775a]">
          LÚMINA OS
        </p>
        <h1 className="mt-3 font-heading text-3xl font-semibold">
          Define tu contraseña
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Usa al menos 12 caracteres y no compartas este enlace.
        </p>
        <Suspense fallback={<p className="mt-6 text-sm">Cargando…</p>}>
          <ResetPasswordForm />
        </Suspense>
      </section>
    </main>
  );
}
