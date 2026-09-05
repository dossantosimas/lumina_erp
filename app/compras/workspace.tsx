'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Check,
  ClipboardCheck,
  Plus,
  Pencil,
  RotateCcw,
  ShoppingCart,
  Sparkles,
  Trash2,
  Truck,
} from 'lucide-react';
import { IconAction, RecordModal } from '@/shared/components/record-modal';

type Supplier = {
  id: string;
  name: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  status: string;
};
type Material = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  status: string;
};
type OrderLine = {
  id: string;
  materialId: string;
  material: string;
  unit: string;
  orderedQuantity: string;
  receivedQuantity: string;
  unitCost: string;
};
type Order = {
  id: string;
  number: string;
  supplierId: string;
  supplier: string;
  status: string;
  total: string;
  createdAt: Date;
  lines: OrderLine[];
  receipts: {
    id: string;
    number: string;
    receivedAt: Date;
    reversed: boolean;
  }[];
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
  if (!response.ok) throw new Error(result.error ?? 'No fue posible guardar.');
}

export function PurchasesWorkspace({
  snapshot,
}: {
  snapshot: { suppliers: Supplier[]; materials: Material[]; orders: Order[] };
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'Órdenes' | 'Proveedores'>('Órdenes');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [lines, setLines] = useState([
    { materialId: snapshot.materials[0]?.id ?? '', quantity: 0, unitCost: 0 },
  ]);

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
      setEditingSupplier(null);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Error inesperado');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--canvas)] p-4 text-foreground sm:p-8 lg:p-10">
      <div className="mx-auto max-w-[1450px]">
        <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-brand">
              Ciclo operativo
            </p>
            <h1 className="mt-2 font-heading text-4xl font-semibold">
              Compras
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Órdenes aprobadas, recepciones trazables y costos actualizados.
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border bg-background px-3 py-2 text-xs">
            <Sparkles className="size-4 text-brand" />{' '}
            {snapshot.suppliers.length} proveedores · {snapshot.orders.length}{' '}
            órdenes
          </span>
        </header>
        <div className="mt-8 flex gap-2 rounded-2xl border bg-background p-2">
          {(['Órdenes', 'Proveedores'] as const).map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold ${tab === item ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted'}`}
            >
              {item}
            </button>
          ))}
        </div>
        {(message || error) && (
          <output
            className={`mt-4 block rounded-xl p-3 text-sm ${error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}
          >
            {error || message}
          </output>
        )}

        {tab === 'Proveedores' ? (
          <div className="mt-5 grid gap-5 xl:grid-cols-[.72fr_1.28fr]">
            <Panel icon={Truck} title="Nuevo proveedor">
              <form
                className="form-grid"
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  void submit(
                    '/api/v1/suppliers',
                    {
                      name: data.get('name'),
                      taxId: data.get('taxId') || null,
                      email: data.get('email') || null,
                      phone: data.get('phone') || null,
                    },
                    'Proveedor creado.',
                  );
                }}
              >
                <Field name="name" label="Nombre" required />
                <Field name="taxId" label="NIT o documento" />
                <Field name="email" label="Correo" type="email" />
                <Field name="phone" label="Teléfono" />
                <Submit pending={pending} />
              </form>
            </Panel>
            <section className="panel overflow-hidden">
              <Title>Proveedores</Title>
              {snapshot.suppliers.length === 0 ? (
                <Empty text="Aún no hay proveedores." />
              ) : (
                <div className="divide-y">
                  {snapshot.suppliers.map((supplier) => (
                    <article
                      key={supplier.id}
                      className="flex items-center justify-between gap-4 p-4"
                    >
                      <div>
                        <p className="font-semibold">{supplier.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {supplier.taxId ?? 'Sin identificación'} ·{' '}
                          {supplier.email ?? 'Sin correo'} · {supplier.status}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <IconAction
                          label={`Editar ${supplier.name}`}
                          onClick={() => setEditingSupplier(supplier)}
                        >
                          <Pencil className="size-4" />
                        </IconAction>
                        {supplier.status === 'INACTIVE' ? (
                          <IconAction
                            label={`Restaurar ${supplier.name}`}
                            disabled={pending}
                            onClick={() =>
                              void submit(
                                `/api/v1/suppliers/${supplier.id}`,
                                { active: true },
                                'Proveedor restaurado.',
                                'PATCH',
                              )
                            }
                          >
                            <RotateCcw className="size-4" />
                          </IconAction>
                        ) : (
                          <IconAction
                            label={`Desactivar ${supplier.name}`}
                            tone="danger"
                            disabled={pending}
                            onClick={() => {
                              const reason = window.prompt(
                                'Motivo de la desactivación:',
                              );
                              if (reason)
                                void submit(
                                  `/api/v1/suppliers/${supplier.id}`,
                                  { reason },
                                  'Proveedor desactivado.',
                                  'DELETE',
                                );
                            }}
                          >
                            <Trash2 className="size-4" />
                          </IconAction>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="mt-5 grid gap-5 xl:grid-cols-[.78fr_1.22fr]">
            <Panel icon={ShoppingCart} title="Nueva orden">
              {snapshot.suppliers.length === 0 ||
              snapshot.materials.length === 0 ? (
                <Empty text="Crea al menos un proveedor y un material antes de generar una orden." />
              ) : (
                <form
                  className="form-grid"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    void submit(
                      '/api/v1/purchases',
                      {
                        number: data.get('number'),
                        supplierId: data.get('supplierId'),
                        lines,
                      },
                      'Orden creada en borrador.',
                    );
                  }}
                >
                  <Field name="number" label="Número de orden" required />
                  <label className="text-xs font-semibold">
                    Proveedor
                    <select name="supplierId" required className="input mt-2">
                      {snapshot.suppliers
                        .filter((supplier) => supplier.status === 'ACTIVE')
                        .map((supplier) => (
                          <option key={supplier.id} value={supplier.id}>
                            {supplier.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <div className="col-span-full space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">Materiales</span>
                      <button
                        type="button"
                        onClick={() =>
                          setLines([
                            ...lines,
                            {
                              materialId: snapshot.materials[0]?.id ?? '',
                              quantity: 0,
                              unitCost: 0,
                            },
                          ])
                        }
                        className="text-xs font-semibold text-primary"
                      >
                        <Plus className="mr-1 inline size-3" />
                        Agregar
                      </button>
                    </div>
                    {lines.map((line, index) => (
                      <div
                        key={index}
                        className="grid grid-cols-[1fr_100px_120px_32px] gap-2"
                      >
                        <select
                          aria-label="Material"
                          value={line.materialId}
                          onChange={(event) =>
                            setLines(
                              lines.map((item, i) =>
                                i === index
                                  ? { ...item, materialId: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          className="input"
                        >
                          {snapshot.materials
                            .filter(
                              (material) => material.status !== 'INACTIVE',
                            )
                            .map((material) => (
                              <option key={material.id} value={material.id}>
                                {material.name} ({material.unit})
                              </option>
                            ))}
                        </select>
                        <input
                          aria-label="Cantidad"
                          type="number"
                          min="0.000001"
                          step="0.000001"
                          placeholder="Cantidad"
                          value={line.quantity || ''}
                          onChange={(event) =>
                            setLines(
                              lines.map((item, i) =>
                                i === index
                                  ? {
                                      ...item,
                                      quantity: Number(event.target.value),
                                    }
                                  : item,
                              ),
                            )
                          }
                          className="input"
                        />
                        <input
                          aria-label="Costo unitario"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="Costo unitario"
                          value={line.unitCost || ''}
                          onChange={(event) =>
                            setLines(
                              lines.map((item, i) =>
                                i === index
                                  ? {
                                      ...item,
                                      unitCost: Number(event.target.value),
                                    }
                                  : item,
                              ),
                            )
                          }
                          className="input"
                        />
                        <button
                          type="button"
                          disabled={lines.length === 1}
                          onClick={() =>
                            setLines(lines.filter((_, i) => i !== index))
                          }
                          aria-label="Quitar línea"
                          className="grid place-items-center text-muted-foreground disabled:opacity-30"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="col-span-full rounded-xl bg-muted p-3 text-xs">
                    <span className="text-muted-foreground">
                      Total estimado:
                    </span>{' '}
                    <b>
                      {cop(
                        lines.reduce(
                          (sum, line) => sum + line.quantity * line.unitCost,
                          0,
                        ),
                      )}
                    </b>
                  </div>
                  <Submit pending={pending} />
                </form>
              )}
            </Panel>
            <section className="panel overflow-hidden">
              <Title>Órdenes de compra</Title>
              {snapshot.orders.length === 0 ? (
                <Empty text="Aún no hay órdenes." />
              ) : (
                <div className="divide-y">
                  {snapshot.orders.map((order) => (
                    <article key={order.id} className="p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">
                            {order.number} · {order.supplier}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {cop(Number(order.total))} · {order.status}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {order.status === 'DRAFT' && (
                            <>
                              <IconAction
                                label={`Editar orden ${order.number}`}
                                onClick={() => {
                                  setEditingOrder(order);
                                  setLines(
                                    order.lines.map((line) => ({
                                      materialId: line.materialId,
                                      quantity: Number(line.orderedQuantity),
                                      unitCost: Number(line.unitCost),
                                    })),
                                  );
                                }}
                              >
                                <Pencil className="size-4" />
                              </IconAction>
                              <Action
                                pending={pending}
                                onClick={() =>
                                  void submit(
                                    `/api/v1/purchases/${order.id}/submit`,
                                    {},
                                    'Orden enviada a aprobación.',
                                  )
                                }
                              >
                                Enviar a aprobación
                              </Action>
                            </>
                          )}
                          {order.status === 'PENDING_APPROVAL' && (
                            <Action
                              pending={pending}
                              onClick={() =>
                                void submit(
                                  `/api/v1/purchases/${order.id}/approve`,
                                  {},
                                  'Orden aprobada.',
                                )
                              }
                            >
                              <Check className="size-4" /> Aprobar
                            </Action>
                          )}
                          {['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(
                            order.status,
                          ) && (
                            <IconAction
                              label={`Cancelar orden ${order.number}`}
                              tone="danger"
                              disabled={pending}
                              onClick={() => {
                                const reason = window.prompt(
                                  'Motivo de cancelación:',
                                );
                                if (reason)
                                  void submit(
                                    `/api/v1/purchases/${order.id}`,
                                    { reason },
                                    'Orden cancelada.',
                                    'DELETE',
                                  );
                              }}
                            >
                              <Trash2 className="size-4" />
                            </IconAction>
                          )}
                        </div>
                      </div>
                      <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                        {order.lines.map((line) => (
                          <li key={line.id}>
                            {line.material}: {number(line.receivedQuantity)} /{' '}
                            {number(line.orderedQuantity)} {line.unit} ·{' '}
                            {cop(Number(line.unitCost))}
                          </li>
                        ))}
                      </ul>
                      {['APPROVED', 'PARTIAL'].includes(order.status) && (
                        <ReceiptForm
                          order={order}
                          pending={pending}
                          onSubmit={(body) =>
                            submit(
                              `/api/v1/purchases/${order.id}/receive`,
                              body,
                              'Recepción confirmada e inventario actualizado.',
                            )
                          }
                        />
                      )}
                      {order.receipts.length > 0 && (
                        <div className="mt-3 space-y-2 text-[11px] text-muted-foreground">
                          {order.receipts.map((receipt) => (
                            <div
                              key={receipt.id}
                              className={`flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 ${receipt.reversed ? 'opacity-50' : ''}`}
                            >
                              <span>
                                Recepción {receipt.number}
                                {receipt.reversed ? ' · REVERSADA' : ''}
                              </span>
                              {!receipt.reversed && (
                                <IconAction
                                  label={`Reversar recepción ${receipt.number}`}
                                  disabled={pending}
                                  onClick={() => {
                                    const reason = window.prompt(
                                      'Motivo del reverso:',
                                    );
                                    if (reason)
                                      void submit(
                                        `/api/v1/purchases/receipts/${receipt.id}/reverse`,
                                        { reason },
                                        'Recepción reversada e inventario compensado.',
                                      );
                                  }}
                                >
                                  <RotateCcw className="size-4" />
                                </IconAction>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
      {editingSupplier && (
        <RecordModal
          title="Editar proveedor"
          onClose={() => setEditingSupplier(null)}
        >
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void submit(
                `/api/v1/suppliers/${editingSupplier.id}`,
                {
                  name: data.get('name'),
                  taxId: data.get('taxId') || null,
                  email: data.get('email') || null,
                  phone: data.get('phone') || null,
                },
                'Proveedor actualizado.',
                'PATCH',
              );
            }}
          >
            <Field
              name="name"
              label="Nombre"
              defaultValue={editingSupplier.name}
              required
            />
            <Field
              name="taxId"
              label="NIT o documento"
              defaultValue={editingSupplier.taxId ?? ''}
            />
            <Field
              name="email"
              label="Correo"
              type="email"
              defaultValue={editingSupplier.email ?? ''}
            />
            <Field
              name="phone"
              label="Teléfono"
              defaultValue={editingSupplier.phone ?? ''}
            />
            <Submit pending={pending} />
          </form>
        </RecordModal>
      )}
      {editingOrder && (
        <RecordModal
          title="Editar orden de compra"
          onClose={() => setEditingOrder(null)}
        >
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void submit(
                `/api/v1/purchases/${editingOrder.id}`,
                {
                  number: data.get('number'),
                  supplierId: data.get('supplierId'),
                  lines,
                },
                'Orden actualizada.',
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
            <label className="text-xs font-semibold">
              Proveedor
              <select
                name="supplierId"
                defaultValue={editingOrder.supplierId}
                required
                className="input mt-2"
              >
                {snapshot.suppliers
                  .filter((supplier) => supplier.status === 'ACTIVE')
                  .map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
              </select>
            </label>
            <div className="col-span-full space-y-2">
              <span className="text-xs font-semibold">Materiales</span>
              {lines.map((line, index) => (
                <div
                  key={index}
                  className="grid grid-cols-[1fr_100px_110px_32px] gap-2"
                >
                  <select
                    aria-label="Material"
                    value={line.materialId}
                    onChange={(event) =>
                      setLines(
                        lines.map((item, i) =>
                          i === index
                            ? { ...item, materialId: event.target.value }
                            : item,
                        ),
                      )
                    }
                    className="input"
                  >
                    {snapshot.materials
                      .filter((item) => item.status !== 'INACTIVE')
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                  <input
                    aria-label="Cantidad"
                    type="number"
                    min="0.000001"
                    step="0.000001"
                    value={line.quantity}
                    onChange={(event) =>
                      setLines(
                        lines.map((item, i) =>
                          i === index
                            ? { ...item, quantity: Number(event.target.value) }
                            : item,
                        ),
                      )
                    }
                    className="input"
                  />
                  <input
                    aria-label="Costo"
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.unitCost}
                    onChange={(event) =>
                      setLines(
                        lines.map((item, i) =>
                          i === index
                            ? { ...item, unitCost: Number(event.target.value) }
                            : item,
                        ),
                      )
                    }
                    className="input"
                  />
                  <button
                    type="button"
                    aria-label="Quitar línea"
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines(lines.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                setLines([
                  ...lines,
                  {
                    materialId: snapshot.materials[0]?.id ?? '',
                    quantity: 1,
                    unitCost: 0,
                  },
                ])
              }
              className="col-span-full text-xs font-semibold text-primary"
            >
              Agregar línea
            </button>
            <Submit pending={pending} />
          </form>
        </RecordModal>
      )}
    </div>
  );
}

function ReceiptForm({
  order,
  pending,
  onSubmit,
}: {
  order: Order;
  pending: boolean;
  onSubmit: (body: unknown) => Promise<void>;
}) {
  return (
    <details className="mt-4 rounded-xl border p-3">
      <summary className="cursor-pointer text-xs font-semibold text-primary">
        Registrar recepción
      </summary>
      <form
        className="mt-3 space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const lines = order.lines
            .map((line) => ({
              purchaseOrderLineId: line.id,
              quantity: Number(data.get(`qty-${line.id}`) || 0),
              lotCode: data.get(`lot-${line.id}`) || undefined,
            }))
            .filter((line) => line.quantity > 0);
          void onSubmit({ number: data.get('number'), lines });
        }}
      >
        <Field name="number" label="Número de recepción" required />
        {order.lines
          .filter(
            (line) =>
              Number(line.receivedQuantity) < Number(line.orderedQuantity),
          )
          .map((line) => {
            const remaining =
              Number(line.orderedQuantity) - Number(line.receivedQuantity);
            return (
              <div
                key={line.id}
                className="grid grid-cols-[1fr_110px_130px] items-end gap-2"
              >
                <span className="pb-3 text-xs">
                  {line.material}
                  <br />
                  <small className="text-muted-foreground">
                    Pendiente {number(String(remaining))} {line.unit}
                  </small>
                </span>
                <Field
                  name={`qty-${line.id}`}
                  label="Cantidad"
                  type="number"
                  min="0"
                  max={remaining}
                  step="0.000001"
                />
                <Field name={`lot-${line.id}`} label="Lote" />
              </div>
            );
          })}
        <button
          disabled={pending}
          className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white"
        >
          <ClipboardCheck className="size-4" />
          Confirmar recepción
        </button>
      </form>
    </details>
  );
}
function Panel({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Truck;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel p-5">
      <div className="mb-5 flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground">
          <Icon className="size-5" />
        </span>
        <h2 className="font-heading text-xl font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}
function Title({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b p-5">
      <h2 className="font-heading text-xl font-semibold">{children}</h2>
    </div>
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
function Submit({ pending }: { pending: boolean }) {
  return (
    <button
      disabled={pending}
      className="col-span-full mt-2 h-11 rounded-xl bg-primary text-sm font-semibold text-white disabled:opacity-50"
    >
      <Plus className="mr-2 inline size-4" />
      {pending ? 'Guardando…' : 'Guardar'}
    </button>
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
function Empty({ text }: { text: string }) {
  return (
    <div className="p-8 text-center text-sm text-muted-foreground">{text}</div>
  );
}
function cop(value: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value);
}
function number(value: string) {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 6 }).format(
    Number(value),
  );
}
