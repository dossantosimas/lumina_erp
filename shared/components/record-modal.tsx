'use client';

import { X } from 'lucide-react';

export function RecordModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <dialog
      open
      className="fixed inset-0 z-50 m-0 grid h-screen max-h-none w-screen max-w-none place-items-center bg-black/45 p-4"
    >
      <section className="panel max-h-[90vh] w-full max-w-xl overflow-y-auto bg-background p-5 shadow-2xl">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="font-heading text-xl font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            title="Cerrar"
            className="grid size-9 place-items-center rounded-lg border hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </section>
    </dialog>
  );
}

export function IconAction({
  label,
  tone = 'default',
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  tone?: 'default' | 'danger';
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={`grid size-9 place-items-center rounded-lg border transition hover:bg-muted disabled:opacity-40 ${tone === 'danger' ? 'text-red-700' : ''}`}
    >
      {children}
    </button>
  );
}
