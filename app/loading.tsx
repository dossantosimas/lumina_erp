import { LoaderCircle } from 'lucide-react';

export default function Loading() {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--canvas)] p-5">
      <div className="text-center">
        <LoaderCircle className="mx-auto size-8 animate-spin text-[#9a775a]" />
        <p className="mt-4 text-sm font-semibold">Cargando datos operativos…</p>
        <p className="mt-1 text-xs text-muted-foreground">LÚMINA OS</p>
      </div>
    </main>
  );
}
