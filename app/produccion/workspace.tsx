'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  ArrowLeft,
  Check,
  Factory,
  PackageCheck,
  Pencil,
  Play,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import { IconAction, RecordModal } from '@/shared/components/record-modal';

type BomSnapshot = {
  version: number;
  expectedYield: string;
  lines: {
    materialId: string;
    material: string;
    unit: string;
    theoreticalQuantity: number;
  }[];
};
type ProductionOrder = {
  id: string;
  number: string;
  productVariantId: string;
  product: string;
  variant: string;
  status: string;
  plannedQuantity: string;
  completedQuantity: string;
  bomSnapshot: BomSnapshot | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  consumptions: {
    material: string;
    theoreticalQuantity: string;
    actualQuantity: string;
  }[];
};
type EligibleProduct = {
  productVariantId: string;
  product: string;
  variant: string;
  bomVersion: number;
};

async function post(url: string, body?: unknown, method = 'POST') {
  const options: RequestInit = {
    method,
    headers: {
      'content-type': 'application/json',
      'idempotency-key': crypto.randomUUID(),
    },
  };
  if (body !== undefined) options.body = JSON.stringify(body);
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error ?? 'No fue posible completar la operación.');
}

export function ProductionWorkspace({
  snapshot,
}: {
  snapshot: { eligibleProducts: EligibleProduct[]; orders: ProductionOrder[] };
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [editingOrder, setEditingOrder] = useState<ProductionOrder | null>(
    null,
  );
  async function submit(
    url: string,
    body: unknown,
    success: string,
    method = 'POST',
  ) {
    setPending(true);
    setMessage('');
    setError('');
    try {
      await post(url, body, method);
      setMessage(success);
      setEditingOrder(null);
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
              Producción
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Órdenes ligadas a recetas vigentes y consumos reales trazables.
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border bg-background px-3 py-2 text-xs">
            <Sparkles className="size-4 text-[#9a775a]" />{' '}
            {snapshot.eligibleProducts.length} productos fabricables ·{' '}
            {snapshot.orders.length} órdenes
          </span>
        </header>
        {(message || error) && (
          <output
            className={`mt-5 block rounded-xl p-3 text-sm ${error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}
          >
            {error || message}
          </output>
        )}
        <div className="mt-6 grid gap-5 xl:grid-cols-[.68fr_1.32fr]">
          <section className="panel p-5">
            <div className="mb-5 flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-[#eee6da] text-[#806646]">
                <Factory className="size-5" />
              </span>
              <div>
                <h2 className="font-heading text-xl font-semibold">
                  Nueva orden
                </h2>
                <p className="text-xs text-muted-foreground">
                  El snapshot se toma al crearla.
                </p>
              </div>
            </div>
            {snapshot.eligibleProducts.length === 0 ? (
              <Empty text="Activa una BOM válida en Catálogo antes de crear una orden." />
            ) : (
              <form
                className="form-grid"
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  void submit(
                    '/api/v1/production',
                    {
                      number: data.get('number'),
                      productVariantId: data.get('productVariantId'),
                      plannedQuantity: Number(data.get('plannedQuantity')),
                    },
                    'Orden creada con snapshot de BOM.',
                  );
                }}
              >
                <Field name="number" label="Número de orden" required />
                <label className="text-xs font-semibold">
                  Producto
                  <select
                    name="productVariantId"
                    required
                    className="input mt-2"
                  >
                    {snapshot.eligibleProducts.map((item) => (
                      <option
                        key={item.productVariantId}
                        value={item.productVariantId}
                      >
                        {item.product} · {item.variant} · BOM v{item.bomVersion}
                      </option>
                    ))}
                  </select>
                </label>
                <Field
                  name="plannedQuantity"
                  label="Cantidad planificada"
                  type="number"
                  min="0.000001"
                  step="0.000001"
                  required
                />
                <button
                  disabled={pending}
                  className="col-span-full h-11 rounded-xl bg-primary text-sm font-semibold text-white disabled:opacity-50"
                >
                  Crear orden
                </button>
              </form>
            )}
          </section>
          <section className="panel overflow-hidden">
            <div className="border-b p-5">
              <h2 className="font-heading text-xl font-semibold">
                Órdenes de producción
              </h2>
            </div>
            {snapshot.orders.length === 0 ? (
              <Empty text="Aún no hay órdenes." />
            ) : (
              <div className="divide-y">
                {snapshot.orders.map((order) => (
                  <article key={order.id} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">
                          {order.number} · {order.product} · {order.variant}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Plan {number(order.plannedQuantity)} · BOM v
                          {order.bomSnapshot?.version ?? '?'} · {order.status}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {order.status === 'DRAFT' && (
                          <IconAction
                            label={`Editar orden ${order.number}`}
                            onClick={() => setEditingOrder(order)}
                          >
                            <Pencil className="size-4" />
                          </IconAction>
                        )}
                        {order.status === 'DRAFT' && (
                          <Action
                            pending={pending}
                            onClick={() =>
                              void submit(
                                `/api/v1/production/${order.id}/release`,
                                {},
                                'Orden liberada para producción.',
                              )
                            }
                          >
                            <Play className="size-4" /> Liberar
                          </Action>
                        )}
                        {['DRAFT', 'IN_PROGRESS'].includes(order.status) && (
                          <CancelForm
                            pending={pending}
                            onSubmit={(reason) =>
                              submit(
                                `/api/v1/production/${order.id}/cancel`,
                                { reason },
                                'Orden cancelada.',
                              )
                            }
                          />
                        )}
                      </div>
                    </div>
                    {order.bomSnapshot && (
                      <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                        {order.bomSnapshot.lines.map((line) => (
                          <li key={line.materialId}>
                            {line.material}: teórico{' '}
                            {number(String(line.theoreticalQuantity))}{' '}
                            {line.unit}
                          </li>
                        ))}
                      </ul>
                    )}
                    {order.status === 'IN_PROGRESS' && order.bomSnapshot && (
                      <CompleteForm
                        order={order}
                        pending={pending}
                        onSubmit={(body) =>
                          submit(
                            `/api/v1/production/${order.id}/complete`,
                            body,
                            'Producción finalizada e inventario actualizado.',
                          )
                        }
                      />
                    )}
                    {order.status === 'COMPLETED' && (
                      <div className="mt-4 rounded-xl bg-emerald-50 p-3">
                        <p className="flex items-center gap-2 text-xs font-semibold text-emerald-800">
                          <PackageCheck className="size-4" /> Producción
                          terminada: {number(order.completedQuantity)} unidades
                        </p>
                        <ul className="mt-2 space-y-1 text-xs text-emerald-900/70">
                          {order.consumptions.map((line) => (
                            <li key={line.material}>
                              {line.material}: real{' '}
                              {number(line.actualQuantity)} / teórico{' '}
                              {number(line.theoreticalQuantity)} · diferencia{' '}
                              {number(
                                String(
                                  Number(line.actualQuantity) -
                                    Number(line.theoreticalQuantity),
                                ),
                              )}
                            </li>
                          ))}
                        </ul>
                        <button
                          disabled={pending}
                          onClick={() => {
                            const reason = window.prompt('Motivo del reverso:');
                            if (reason)
                              void submit(
                                `/api/v1/production/${order.id}/reverse`,
                                { reason },
                                'Finalización reversada; inventario compensado.',
                              );
                          }}
                          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-emerald-700/20 px-3 py-2 text-xs font-semibold text-emerald-900"
                        >
                          <RotateCcw className="size-4" /> Reversar finalización
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
      {editingOrder && (
        <RecordModal
          title="Editar orden de producción"
          onClose={() => setEditingOrder(null)}
        >
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void submit(
                `/api/v1/production/${editingOrder.id}`,
                {
                  number: data.get('number'),
                  plannedQuantity: Number(data.get('plannedQuantity')),
                },
                'Orden de producción actualizada.',
                'PATCH',
              );
            }}
          >
            <Field
              name="number"
              label="Número de orden"
              defaultValue={editingOrder.number}
              required
            />
            <Field
              name="plannedQuantity"
              label="Cantidad planificada"
              type="number"
              min="0.000001"
              step="0.000001"
              defaultValue={editingOrder.plannedQuantity}
              required
            />
            <p className="col-span-full rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
              El producto y la versión BOM permanecen congelados. Para
              cambiarlos, cancela este borrador y crea una orden nueva.
            </p>
            <button
              disabled={pending}
              className="col-span-full h-11 rounded-xl bg-primary text-sm font-semibold text-white disabled:opacity-50"
            >
              Guardar cambios
            </button>
          </form>
        </RecordModal>
      )}
    </main>
  );
}

function CompleteForm({
  order,
  pending,
  onSubmit,
}: {
  order: ProductionOrder;
  pending: boolean;
  onSubmit: (body: unknown) => Promise<void>;
}) {
  const lines = order.bomSnapshot!.lines;
  return (
    <details className="mt-4 rounded-xl border p-3">
      <summary className="cursor-pointer text-xs font-semibold text-primary">
        Finalizar producción
      </summary>
      <form
        className="mt-3 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void onSubmit({
            completedQuantity: Number(data.get('completedQuantity')),
            outputLotCode: data.get('outputLotCode'),
            reason: data.get('reason'),
            consumptions: lines.map((line) => ({
              materialId: line.materialId,
              quantity: Number(data.get(`actual-${line.materialId}`)),
            })),
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            name="completedQuantity"
            label="Cantidad terminada"
            type="number"
            min="0.000001"
            max={Number(order.plannedQuantity)}
            step="0.000001"
            defaultValue={order.plannedQuantity}
            required
          />
          <Field
            name="outputLotCode"
            label="Lote de producto terminado"
            required
          />
        </div>
        <div className="space-y-2">
          <span className="text-xs font-semibold">Consumos reales</span>
          {lines.map((line) => (
            <div
              key={line.materialId}
              className="grid grid-cols-[1fr_150px] items-end gap-3"
            >
              <span className="pb-3 text-xs">
                {line.material}
                <br />
                <small className="text-muted-foreground">
                  Teórico {number(String(line.theoreticalQuantity))} {line.unit}
                </small>
              </span>
              <Field
                name={`actual-${line.materialId}`}
                label={`Real (${line.unit})`}
                type="number"
                min="0.000001"
                step="0.000001"
                defaultValue={line.theoreticalQuantity}
                required
              />
            </div>
          ))}
        </div>
        <label className="block text-xs font-semibold">
          Observación
          <textarea
            name="reason"
            required
            minLength={3}
            maxLength={500}
            className="input mt-2 min-h-20 py-3"
          />
        </label>
        <button
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-[#1f4b3c] px-3 py-2 text-xs font-semibold text-white"
        >
          <Check className="size-4" />
          Confirmar producción
        </button>
      </form>
    </details>
  );
}
function CancelForm({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (reason: string) => Promise<void>;
}) {
  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const reason = data.get('reason');
        if (typeof reason === 'string') void onSubmit(reason);
      }}
    >
      <input
        name="reason"
        required
        minLength={3}
        aria-label="Motivo de cancelación"
        placeholder="Motivo"
        className="input w-32"
      />
      <button
        disabled={pending}
        aria-label="Cancelar orden"
        className="grid size-10 place-items-center rounded-lg border text-muted-foreground hover:text-red-700"
      >
        <X className="size-4" />
      </button>
    </form>
  );
}
function Action({
  pending,
  onClick,
  children,
}: {
  pending: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      disabled={pending}
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
    >
      {children}
    </button>
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
