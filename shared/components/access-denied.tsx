import Link from 'next/link';
import { ShieldX } from 'lucide-react';

export function AccessDenied() {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--canvas)] p-5">
      <section className="panel w-full max-w-xl p-8 text-center">
        <ShieldX className="mx-auto size-9 text-[#9a775a]" />
        <p className="mt-5 text-xs font-bold uppercase tracking-[.18em] text-[#9a775a]">
          Permisos insuficientes
        </p>
        <h1 className="mt-2 font-heading text-3xl font-semibold">
          Este módulo no está habilitado para tu rol
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          La sesión es válida, pero la operación requiere un permiso adicional.
          Solicita el cambio a un administrador de LÚMINA.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
        >
          Volver al resumen
        </Link>
      </section>
    </main>
  );
}
