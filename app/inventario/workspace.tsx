'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Boxes, RotateCcw, Scale, Sparkles } from 'lucide-react';

type Item = {
  itemType: 'MATERIAL' | 'PRODUCT';
  itemId: string;
  sku: string;
  name: string;
  unit: string;
  onHand: string;
  reserved: string;
  available: string;
  minimumStock: string | null;
  status: string;
};
type Movement = {
  id: string;
  occurredAt: Date;
  type: string;
  item: string;
  quantity: string;
  unitCost: string | null;
  reason: string | null;
  reversalOfId: string | null;
};

async function post(url: string, body: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'No fue posible guardar.');
}

export function InventoryWorkspace({
  snapshot,
}: {
  snapshot: {
    warehouse: { id: string; name: string };
    items: Item[];
    movements: Movement[];
  };
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(url: string, body: unknown, success: string) {
    setPending(true);
    setMessage('');
    setError('');
    try {
      await post(url, body);
      setMessage(success);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Error inesperado');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--canvas)] p-4 text-foreground sm:p-8 lg:p-10">
      <div className="mx-auto max-w-[1450px]">
        <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <Link
              href="/"
              className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" /> Volver al resumen
            </Link>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-[#9a775a]">
              Ciclo operativo
            </p>
            <h1 className="mt-2 font-heading text-4xl font-semibold">
              Inventario
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {snapshot.warehouse.name} · saldos derivados de movimientos
              confirmados.
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border bg-background px-3 py-2 text-xs">
            <Sparkles className="size-4 text-[#9a775a]" />{' '}
            {snapshot.items.length} referencias · {snapshot.movements.length}{' '}
            movimientos recientes
          </span>
        </header>

        {(message || error) && (
          <output
            className={`mt-5 block rounded-xl p-3 text-sm ${error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}
          >
            {error || message}
          </output>
        )}

        <div className="mt-6 grid gap-5 xl:grid-cols-[.72fr_1.28fr]">
          <section className="panel p-5">
            <div className="mb-5 flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-[#eee6da] text-[#806646]">
                <Scale className="size-5" />
              </span>
              <div>
                <h2 className="font-heading text-xl font-semibold">
                  Registrar movimiento
                </h2>
                <p className="text-xs text-muted-foreground">
                  Conteo inicial o ajuste justificado.
                </p>
              </div>
            </div>
            {snapshot.items.length === 0 ? (
              <Empty text="Primero crea productos o materiales en Catálogo." />
            ) : (
              <form
                className="form-grid"
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  const item = data.get('item');
                  if (typeof item !== 'string') return;
                  const [itemType, itemId] = item.split(':');
                  void submit(
                    '/api/v1/inventory/movements',
                    {
                      itemType,
                      itemId,
                      operation: data.get('operation'),
                      quantity: Number(data.get('quantity')),
                      unitCost: data.get('unitCost')
                        ? Number(data.get('unitCost'))
                        : null,
                      lotCode: data.get('lotCode') || undefined,
                      reason: data.get('reason'),
                    },
                    'Movimiento registrado.',
                  );
                }}
              >
                <label className="col-span-full text-xs font-semibold">
                  Referencia
                  <select name="item" required className="input mt-2">
                    {snapshot.items
                      .filter((item) => item.status !== 'INACTIVE')
                      .map((item) => (
                        <option
                          key={`${item.itemType}:${item.itemId}`}
                          value={`${item.itemType}:${item.itemId}`}
                        >
                          {item.sku} · {item.name} ({item.unit})
                        </option>
                      ))}
                  </select>
                </label>
                <label className="text-xs font-semibold">
                  Operación
                  <select name="operation" required className="input mt-2">
                    <option value="OPENING">Conteo inicial</option>
                    <option value="ADJUSTMENT_IN">Ajuste de entrada</option>
                    <option value="ADJUSTMENT_OUT">Ajuste de salida</option>
                  </select>
                </label>
                <Field
                  name="quantity"
                  label="Cantidad"
                  type="number"
                  min="0.000001"
                  step="0.000001"
                  required
                />
                <Field
                  name="unitCost"
                  label="Costo unitario"
                  type="number"
                  min="0"
                  step="0.01"
                />
                <Field name="lotCode" label="Lote (opcional)" />
                <label className="col-span-full text-xs font-semibold">
                  Motivo
                  <textarea
                    name="reason"
                    required
                    minLength={3}
                    maxLength={500}
                    className="input mt-2 min-h-24 py-3"
                  />
                </label>
                <button
                  disabled={pending}
                  className="col-span-full h-11 rounded-xl bg-primary text-sm font-semibold text-white disabled:opacity-50"
                >
                  {pending ? 'Guardando…' : 'Confirmar movimiento'}
                </button>
              </form>
            )}
          </section>

          <section className="panel overflow-hidden">
            <div className="border-b p-5">
              <h2 className="font-heading text-xl font-semibold">
                Saldos actuales
              </h2>
            </div>
            {snapshot.items.length === 0 ? (
              <Empty text="No hay referencias para mostrar." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      {[
                        'SKU',
                        'Referencia',
                        'Tipo',
                        'Existencia',
                        'Reservado',
                        'Disponible',
                        'Estado',
                      ].map((header) => (
                        <th key={header} className="px-4 py-3 font-semibold">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.items.map((item) => {
                      const critical =
                        item.minimumStock !== null &&
                        Number(item.onHand) < Number(item.minimumStock);
                      return (
                        <tr
                          key={`${item.itemType}:${item.itemId}`}
                          className="border-b last:border-0"
                        >
                          <td className="px-4 py-3 font-semibold">
                            {item.sku}
                          </td>
                          <td className="px-4 py-3">{item.name}</td>
                          <td className="px-4 py-3">
                            {item.itemType === 'MATERIAL'
                              ? 'Material'
                              : 'Producto'}
                          </td>
                          <td className="px-4 py-3">
                            {number(item.onHand)} {item.unit}
                          </td>
                          <td className="px-4 py-3">{number(item.reserved)}</td>
                          <td
                            className={`px-4 py-3 font-semibold ${critical ? 'text-red-700' : ''}`}
                          >
                            {number(item.available)}
                          </td>
                          <td className="px-4 py-3">
                            {critical ? 'CRÍTICO' : item.status}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <section className="panel mt-5 overflow-hidden">
          <div className="flex items-center gap-3 border-b p-5">
            <Boxes className="size-5 text-[#9a775a]" />
            <h2 className="font-heading text-xl font-semibold">
              Ledger reciente
            </h2>
          </div>
          {snapshot.movements.length === 0 ? (
            <Empty text="Aún no existen movimientos." />
          ) : (
            <div className="divide-y">
              {snapshot.movements.map((movement) => (
                <article
                  key={movement.id}
                  className="grid gap-3 p-4 md:grid-cols-[170px_1fr_130px_1fr_auto] md:items-center"
                >
                  <div className="text-xs text-muted-foreground">
                    {date(movement.occurredAt)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{movement.item}</p>
                    <p className="text-xs text-muted-foreground">
                      {movement.type}
                    </p>
                  </div>
                  <p
                    className={`text-sm font-bold ${Number(movement.quantity) < 0 ? 'text-red-700' : 'text-emerald-700'}`}
                  >
                    {Number(movement.quantity) > 0 ? '+' : ''}
                    {number(movement.quantity)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {movement.reason}
                  </p>
                  {movement.type !== 'REVERSAL' &&
                  !snapshot.movements.some(
                    (row) => row.reversalOfId === movement.id,
                  ) ? (
                    <form
                      className="flex gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const data = new FormData(event.currentTarget);
                        void submit(
                          `/api/v1/inventory/movements/${movement.id}/reverse`,
                          { reason: data.get('reason') },
                          'Movimiento reversado.',
                        );
                      }}
                    >
                      <input
                        name="reason"
                        required
                        minLength={3}
                        aria-label="Motivo del reverso"
                        placeholder="Motivo"
                        className="input w-32"
                      />
                      <button
                        disabled={pending}
                        aria-label="Reversar movimiento"
                        className="grid size-10 place-items-center rounded-lg border text-muted-foreground hover:text-red-700"
                      >
                        <RotateCcw className="size-4" />
                      </button>
                    </form>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {movement.type === 'REVERSAL' ? 'Reverso' : 'Reversado'}
                    </span>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Field(
  props: React.InputHTMLAttributes<HTMLInputElement> & { label: string },
) {
  const { label, ...input } = props;
  return (
    <label className="text-xs font-semibold">
      {label}
      <input {...input} className="input mt-2" />
    </label>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="p-8 text-center text-sm text-muted-foreground">{text}</div>
  );
}
function number(value: string) {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 6 }).format(
    Number(value),
  );
}
function date(value: Date) {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  }).format(new Date(value));
}
