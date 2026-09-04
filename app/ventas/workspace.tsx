'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  ArrowLeft,
  Check,
  CircleDollarSign,
  PackageCheck,
  Plus,
  Pencil,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { IconAction, RecordModal } from '@/shared/components/record-modal';

type Customer = {
  id: string;
  type: string;
  name: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  status: string;
};
type Product = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  salePrice: string | null;
  onHand: string;
  reserved: string;
  available: string;
  status: string;
};
type Order = {
  id: string;
  number: string;
  customerId: string | null;
  customer: string;
  status: string;
  total: string;
  costOfGoods: string;
  createdAt: Date;
  lines: {
    id: string;
    productVariantId: string;
    product: string;
    variant: string;
    quantity: string;
    unitPrice: string;
    unitCostSnapshot: string;
  }[];
  payments: {
    id: string;
    reference: string;
    amount: string;
    method: string;
    occurredAt: Date;
  }[];
};
type Account = { id: string; name: string };

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

export function SalesWorkspace({
  snapshot,
}: {
  snapshot: {
    customers: Customer[];
    products: Product[];
    accounts: Account[];
    orders: Order[];
  };
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'Pedidos' | 'Clientes'>('Pedidos');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [lines, setLines] = useState([
    {
      productVariantId: snapshot.products[0]?.id ?? '',
      quantity: 0,
      unitPrice: Number(snapshot.products[0]?.salePrice ?? 0),
    },
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
      setEditingCustomer(null);
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
              Ciclo comercial
            </p>
            <h1 className="mt-2 font-heading text-4xl font-semibold">Ventas</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Pedidos reservados, entregas valorizadas y pagos confirmados.
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border bg-background px-3 py-2 text-xs">
            <Sparkles className="size-4 text-[#9a775a]" />{' '}
            {snapshot.customers.length} clientes · {snapshot.orders.length}{' '}
            pedidos
          </span>
        </header>
        <div className="mt-8 flex gap-2 rounded-2xl border bg-background p-2">
          {(['Pedidos', 'Clientes'] as const).map((item) => (
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
        {tab === 'Clientes' ? (
          <div className="mt-5 grid gap-5 xl:grid-cols-[.72fr_1.28fr]">
            <Panel icon={UserPlus} title="Nuevo cliente">
              <form
                className="form-grid"
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  void submit(
                    '/api/v1/customers',
                    {
                      type: data.get('type'),
                      name: data.get('name'),
                      taxId: data.get('taxId') || null,
                      email: data.get('email') || null,
                      phone: data.get('phone') || null,
                    },
                    'Cliente creado.',
                  );
                }}
              >
                <label className="text-xs font-semibold">
                  Tipo
                  <select name="type" className="input mt-2">
                    <option value="B2C">Persona / B2C</option>
                    <option value="B2B">Empresa / B2B</option>
                  </select>
                </label>
                <Field name="name" label="Nombre" required />
                <Field name="taxId" label="Documento o NIT" />
                <Field name="email" label="Correo" type="email" />
                <Field name="phone" label="Teléfono" />
                <Submit pending={pending} />
              </form>
            </Panel>
            <section className="panel overflow-hidden">
              <Title>Clientes</Title>
              {snapshot.customers.length === 0 ? (
                <Empty text="Aún no hay clientes." />
              ) : (
                <div className="divide-y">
                  {snapshot.customers.map((customer) => (
                    <article
                      key={customer.id}
                      className="flex items-center justify-between gap-4 p-4"
                    >
                      <div>
                        <p className="font-semibold">
                          {customer.name} · {customer.type}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {customer.taxId ?? 'Sin identificación'} ·{' '}
                          {customer.email ?? 'Sin correo'} · {customer.status}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <IconAction
                          label={`Editar ${customer.name}`}
                          onClick={() => setEditingCustomer(customer)}
                        >
                          <Pencil className="size-4" />
                        </IconAction>
                        {customer.status === 'INACTIVE' ? (
                          <IconAction
                            label={`Restaurar ${customer.name}`}
                            disabled={pending}
                            onClick={() =>
                              void submit(
                                `/api/v1/customers/${customer.id}`,
                                { active: true },
                                'Cliente restaurado.',
                                'PATCH',
                              )
                            }
                          >
                            <RotateCcw className="size-4" />
                          </IconAction>
                        ) : (
                          <IconAction
                            label={`Desactivar ${customer.name}`}
                            tone="danger"
                            disabled={pending}
                            onClick={() => {
                              const reason = window.prompt(
                                'Motivo de la desactivación:',
                              );
                              if (reason)
                                void submit(
                                  `/api/v1/customers/${customer.id}`,
                                  { reason },
                                  'Cliente desactivado.',
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
            <Panel icon={ShoppingBag} title="Nuevo pedido">
              {snapshot.customers.length === 0 ||
              snapshot.products.length === 0 ? (
                <Empty text="Crea un cliente y produce inventario antes de generar pedidos." />
              ) : (
                <form
                  className="form-grid"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    void submit(
                      '/api/v1/orders',
                      {
                        number: data.get('number'),
                        customerId: data.get('customerId'),
                        lines,
                      },
                      'Pedido creado en borrador.',
                    );
                  }}
                >
                  <Field name="number" label="Número de pedido" required />
                  <label className="text-xs font-semibold">
                    Cliente
                    <select name="customerId" required className="input mt-2">
                      {snapshot.customers
                        .filter((customer) => customer.status === 'ACTIVE')
                        .map((customer) => (
                          <option key={customer.id} value={customer.id}>
                            {customer.name} · {customer.type}
                          </option>
                        ))}
                    </select>
                  </label>
                  <div className="col-span-full space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">Productos</span>
                      <button
                        type="button"
                        onClick={() => {
                          const product = snapshot.products[0];
                          setLines([
                            ...lines,
                            {
                              productVariantId: product?.id ?? '',
                              quantity: 0,
                              unitPrice: Number(product?.salePrice ?? 0),
                            },
                          ]);
                        }}
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
                          aria-label="Producto"
                          value={line.productVariantId}
                          onChange={(event) => {
                            const product = snapshot.products.find(
                              (item) => item.id === event.target.value,
                            );
                            setLines(
                              lines.map((item, i) =>
                                i === index
                                  ? {
                                      ...item,
                                      productVariantId: event.target.value,
                                      unitPrice: Number(
                                        product?.salePrice ?? 0,
                                      ),
                                    }
                                  : item,
                              ),
                            );
                          }}
                          className="input"
                        >
                          {snapshot.products
                            .filter((product) => product.status === 'ACTIVE')
                            .map((product) => (
                              <option key={product.id} value={product.id}>
                                {product.name} · disp.{' '}
                                {number(product.available)}
                              </option>
                            ))}
                        </select>
                        <input
                          aria-label="Cantidad"
                          type="number"
                          min="0.000001"
                          step="0.000001"
                          value={line.quantity || ''}
                          placeholder="Cantidad"
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
                          aria-label="Precio unitario"
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unitPrice || ''}
                          placeholder="Precio"
                          onChange={(event) =>
                            setLines(
                              lines.map((item, i) =>
                                i === index
                                  ? {
                                      ...item,
                                      unitPrice: Number(event.target.value),
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
                  <div className="col-span-full rounded-xl bg-[#f4f0e9] p-3 text-xs">
                    <span className="text-muted-foreground">Total:</span>{' '}
                    <b>
                      {cop(
                        lines.reduce(
                          (sum, line) => sum + line.quantity * line.unitPrice,
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
              <Title>Pedidos</Title>
              {snapshot.orders.length === 0 ? (
                <Empty text="Aún no hay pedidos." />
              ) : (
                <div className="divide-y">
                  {snapshot.orders.map((order) => {
                    const paid = order.payments.reduce(
                      (sum, payment) => sum + Number(payment.amount),
                      0,
                    );
                    const margin =
                      Number(order.total) - Number(order.costOfGoods);
                    return (
                      <article key={order.id} className="p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">
                              {order.number} · {order.customer}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {cop(Number(order.total))} · pagado {cop(paid)} ·{' '}
                              {order.status}
                            </p>
                            {order.status === 'COMPLETED' && (
                              <p className="mt-1 text-xs text-emerald-700">
                                Costo {cop(Number(order.costOfGoods))} · margen{' '}
                                {cop(margin)}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {order.status === 'DRAFT' && (
                              <IconAction
                                label={`Editar pedido ${order.number}`}
                                onClick={() => {
                                  setEditingOrder(order);
                                  setLines(
                                    order.lines.map((line) => ({
                                      productVariantId: line.productVariantId,
                                      quantity: Number(line.quantity),
                                      unitPrice: Number(line.unitPrice),
                                    })),
                                  );
                                }}
                              >
                                <Pencil className="size-4" />
                              </IconAction>
                            )}
                            {order.status === 'DRAFT' && (
                              <Action
                                pending={pending}
                                onClick={() =>
                                  void submit(
                                    `/api/v1/orders/${order.id}/confirm`,
                                    {},
                                    'Pedido confirmado y stock reservado.',
                                  )
                                }
                              >
                                <Check className="size-4" /> Confirmar
                              </Action>
                            )}
                            {order.status === 'APPROVED' && (
                              <ReasonAction
                                label="Entregar"
                                icon={PackageCheck}
                                pending={pending}
                                onSubmit={(reason) =>
                                  submit(
                                    `/api/v1/orders/${order.id}/deliver`,
                                    { reason },
                                    'Pedido entregado y costo reconocido.',
                                  )
                                }
                              />
                            )}
                            {order.status === 'COMPLETED' && (
                              <ReasonAction
                                label="Reversar entrega"
                                icon={RotateCcw}
                                pending={pending}
                                onSubmit={(reason) =>
                                  submit(
                                    `/api/v1/orders/${order.id}/reverse-delivery`,
                                    { reason },
                                    'Entrega reversada; existencias y reserva restauradas.',
                                  )
                                }
                              />
                            )}
                            {['DRAFT', 'APPROVED'].includes(order.status) && (
                              <ReasonAction
                                label="Cancelar"
                                icon={X}
                                pending={pending}
                                onSubmit={(reason) =>
                                  submit(
                                    `/api/v1/orders/${order.id}/cancel`,
                                    { reason },
                                    'Pedido cancelado; reservas liberadas.',
                                  )
                                }
                              />
                            )}
                          </div>
                        </div>
                        <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                          {order.lines.map((line) => (
                            <li key={line.id}>
                              {line.product} · {line.variant}:{' '}
                              {number(line.quantity)} ×{' '}
                              {cop(Number(line.unitPrice))}
                            </li>
                          ))}
                        </ul>
                        {['APPROVED', 'COMPLETED'].includes(order.status) &&
                          paid < Number(order.total) && (
                            <PaymentForm
                              order={order}
                              accounts={snapshot.accounts}
                              pending={pending}
                              onSubmit={(body) =>
                                submit(
                                  '/api/v1/payments',
                                  body,
                                  'Pago confirmado y registrado en caja.',
                                )
                              }
                            />
                          )}
                        {order.payments.length > 0 && (
                          <div className="mt-3 space-y-2 text-[11px] text-muted-foreground">
                            {order.payments.map((payment) => (
                              <div
                                key={payment.id}
                                className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2"
                              >
                                <span>
                                  Pago {payment.reference} ·{' '}
                                  {cop(Number(payment.amount))}
                                </span>
                                <IconAction
                                  label={`Reversar pago ${payment.reference}`}
                                  disabled={pending}
                                  onClick={() => {
                                    const reason = window.prompt(
                                      'Motivo del reverso:',
                                    );
                                    if (reason)
                                      void submit(
                                        `/api/v1/payments/${payment.id}/reverse`,
                                        { reason },
                                        'Pago reversado.',
                                      );
                                  }}
                                >
                                  <RotateCcw className="size-4" />
                                </IconAction>
                              </div>
                            ))}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
      {editingCustomer && (
        <RecordModal
          title="Editar cliente"
          onClose={() => setEditingCustomer(null)}
        >
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void submit(
                `/api/v1/customers/${editingCustomer.id}`,
                {
                  type: data.get('type'),
                  name: data.get('name'),
                  taxId: data.get('taxId') || null,
                  email: data.get('email') || null,
                  phone: data.get('phone') || null,
                },
                'Cliente actualizado.',
                'PATCH',
              );
            }}
          >
            <label className="text-xs font-semibold">
              Tipo
              <select
                name="type"
                defaultValue={editingCustomer.type}
                className="input mt-2"
              >
                <option value="B2C">Persona / B2C</option>
                <option value="B2B">Empresa / B2B</option>
              </select>
            </label>
            <Field
              name="name"
              label="Nombre"
              defaultValue={editingCustomer.name}
              required
            />
            <Field
              name="taxId"
              label="Documento o NIT"
              defaultValue={editingCustomer.taxId ?? ''}
            />
            <Field
              name="email"
              label="Correo"
              type="email"
              defaultValue={editingCustomer.email ?? ''}
            />
            <Field
              name="phone"
              label="Teléfono"
              defaultValue={editingCustomer.phone ?? ''}
            />
            <Submit pending={pending} />
          </form>
        </RecordModal>
      )}
      {editingOrder && (
        <RecordModal
          title="Editar pedido"
          onClose={() => setEditingOrder(null)}
        >
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void submit(
                `/api/v1/orders/${editingOrder.id}`,
                {
                  number: data.get('number'),
                  customerId: data.get('customerId'),
                  lines,
                },
                'Pedido actualizado.',
                'PATCH',
              );
            }}
          >
            <Field
              name="number"
              label="Número de pedido"
              defaultValue={editingOrder.number}
              required
            />
            <label className="text-xs font-semibold">
              Cliente
              <select
                name="customerId"
                defaultValue={editingOrder.customerId ?? ''}
                required
                className="input mt-2"
              >
                {snapshot.customers
                  .filter((customer) => customer.status === 'ACTIVE')
                  .map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
              </select>
            </label>
            <div className="col-span-full space-y-2">
              <span className="text-xs font-semibold">Productos</span>
              {lines.map((line, index) => (
                <div
                  key={index}
                  className="grid grid-cols-[1fr_100px_110px_32px] gap-2"
                >
                  <select
                    aria-label="Producto"
                    value={line.productVariantId}
                    onChange={(event) =>
                      setLines(
                        lines.map((item, i) =>
                          i === index
                            ? { ...item, productVariantId: event.target.value }
                            : item,
                        ),
                      )
                    }
                    className="input"
                  >
                    {snapshot.products
                      .filter((item) => item.status === 'ACTIVE')
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
                    aria-label="Precio"
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.unitPrice}
                    onChange={(event) =>
                      setLines(
                        lines.map((item, i) =>
                          i === index
                            ? { ...item, unitPrice: Number(event.target.value) }
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
                    productVariantId: snapshot.products[0]?.id ?? '',
                    quantity: 1,
                    unitPrice: Number(snapshot.products[0]?.salePrice ?? 0),
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
    </main>
  );
}

function PaymentForm({
  order,
  accounts,
  pending,
  onSubmit,
}: {
  order: Order;
  accounts: Account[];
  pending: boolean;
  onSubmit: (body: unknown) => Promise<void>;
}) {
  const paid = order.payments.reduce(
    (sum, payment) => sum + Number(payment.amount),
    0,
  );
  const balance = Number(order.total) - paid;
  return (
    <details className="mt-4 rounded-xl border p-3">
      <summary className="cursor-pointer text-xs font-semibold text-primary">
        Registrar pago · saldo {cop(balance)}
      </summary>
      {accounts.length === 0 ? (
        <p className="mt-3 text-xs text-amber-700">
          Crea una cuenta financiera en la siguiente fase antes de registrar
          pagos.
        </p>
      ) : (
        <form
          className="mt-3 grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void onSubmit({
              reference: data.get('reference'),
              salesOrderId: order.id,
              accountId: data.get('accountId'),
              amount: Number(data.get('amount')),
              method: data.get('method'),
            });
          }}
        >
          <Field name="reference" label="Referencia" required />
          <label className="text-xs font-semibold">
            Cuenta
            <select name="accountId" className="input mt-2">
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <Field
            name="amount"
            label="Importe"
            type="number"
            min="0.01"
            max={balance}
            step="0.01"
            defaultValue={balance}
            required
          />
          <label className="text-xs font-semibold">
            Medio
            <select name="method" className="input mt-2">
              <option value="TRANSFER">Transferencia</option>
              <option value="CASH">Efectivo</option>
              <option value="CARD">Tarjeta</option>
              <option value="OTHER">Otro</option>
            </select>
          </label>
          <button
            disabled={pending}
            className="col-span-full inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#1f4b3c] text-xs font-semibold text-white"
          >
            <CircleDollarSign className="size-4" />
            Confirmar pago
          </button>
        </form>
      )}
    </details>
  );
}
function ReasonAction({
  label,
  icon: Icon,
  pending,
  onSubmit,
}: {
  label: string;
  icon: typeof X;
  pending: boolean;
  onSubmit: (reason: string) => Promise<void>;
}) {
  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const reason = new FormData(event.currentTarget).get('reason');
        if (typeof reason === 'string') void onSubmit(reason);
      }}
    >
      <input
        name="reason"
        required
        minLength={3}
        aria-label={`Motivo para ${label}`}
        placeholder="Motivo"
        className="input w-28"
      />
      <button
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-lg border px-2 text-xs font-semibold"
      >
        <Icon className="size-4" />
        {label}
      </button>
    </form>
  );
}
function Panel({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof ShoppingBag;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel p-5">
      <div className="mb-5 flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-[#eee6da] text-[#806646]">
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
