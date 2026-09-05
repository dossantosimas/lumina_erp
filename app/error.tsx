'use client';

import Link from 'next/link';
import { CircleAlert } from 'lucide-react';

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--canvas)] p-5">
      <section className="panel w-full max-w-xl p-8 text-center">
        <CircleAlert className="mx-auto size-9 text-brand" />
        <p className="mt-5 text-xs font-bold uppercase tracking-[.18em] text-brand">
          No fue posible cargar el módulo
        </p>
        <h1 className="mt-2 font-heading text-3xl font-semibold">
          La operación no se completó
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Ningún dato fue asumido ni reemplazado. Puedes reintentar o volver al
          resumen.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
          >
            Reintentar
          </button>
          <Link
            href="/"
            className="rounded-xl border bg-background px-4 py-2.5 text-sm font-semibold"
          >
            Volver
          </Link>
        </div>
      </section>
    </main>
  );
}
