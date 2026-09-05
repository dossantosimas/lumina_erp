import { Suspense } from 'react';
import Image from 'next/image';
import { ResetPasswordForm } from './reset-password-form';
export default function ResetPasswordPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--canvas)] p-5">
      <section className="w-full max-w-md rounded-3xl border bg-background p-8 shadow-xl">
        <Image
          src="/brand/lumina-lockup.png"
          alt="LÚMINA Candle Studio"
          width={270}
          height={180}
          className="mx-auto h-28 w-auto object-contain"
          priority
        />
        <p className="mt-4 text-xs font-bold uppercase tracking-[.2em] text-brand">
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
