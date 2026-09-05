'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Banknote,
  CircleDollarSign,
  Plus,
  Pencil,
  ReceiptText,
  RotateCcw,
  Sparkles,
  WalletCards,
  Trash2,
} from 'lucide-react';
import { IconAction, RecordModal } from '@/shared/components/record-modal';

type Account = {
  id: string;
  code: string;
  name: string;
  type: string;
  currency: string;
  openingBalance: string;
  movementTotal: string;
  balance: string;
  status: string;
};
type Movement = {
  id: string;
  account: string;
  type: string;
  amount: string;
  category: string;
  description: string;
  sourceType: string | null;
  reversalOfId: string | null;
  occurredAt: Date;
};
type Expense = {
  id: string;
  reference: string;
  account: string;
  category: string;
  description: string;
  amount: string;
  occurredAt: Date;
  reversedAt: Date | null;
};
type Metrics = {
  cash: number;
  collected: number;
  sales: number;
  costOfGoods: number;
  expenses: number;
  grossMargin: number;
  operatingResult: number;
};

async function post(url: string, body: unknown, method = 'POST') {
  const options: RequestInit = {
    method,
    headers: {
      'content-type': 'application/json',
      'idempotency-key': crypto.randomUUID(),
    },
  };
  options.body = JSON.stringify(body);
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error ?? 'No fue posible completar la operación.');
}

export function FinanceWorkspace({
  snapshot,
}: {
  snapshot: {
    accounts: Account[];
    movements: Movement[];
    expenses: Expense[];
    metrics: Metrics;
  };
}) {
  const router = useRouter();
  const [tab, setTab] = useState<
    'Resumen' | 'Cuentas' | 'Gastos' | 'Movimientos'
  >('Resumen');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
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
      setEditingAccount(null);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Error inesperado');
    } finally {
      setPending(false);
    }
  }
  const reversedIds = new Set(
    snapshot.movements.map((movement) => movement.reversalOfId).filter(Boolean),
  );
  return (
    <div className="min-h-screen bg-[var(--canvas)] p-4 text-foreground sm:p-8 lg:p-10">
      <div className="mx-auto max-w-[1450px]">
        <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-brand">
              Gestión gerencial
            </p>
            <h1 className="mt-2 font-heading text-4xl font-semibold">
              Finanzas
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Caja, gastos, margen y rentabilidad basados en movimientos reales.
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border bg-background px-3 py-2 text-xs">
            <Sparkles className="size-4 text-brand" />{' '}
            {snapshot.accounts.length} cuentas · {snapshot.movements.length}{' '}
            movimientos
          </span>
        </header>
        <div className="mt-8 flex gap-2 overflow-x-auto rounded-2xl border bg-background p-2">
          {(['Resumen', 'Cuentas', 'Gastos', 'Movimientos'] as const).map(
            (item) => (
              <button
                key={item}
                onClick={() => setTab(item)}
                className={`min-w-28 flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold ${tab === item ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted'}`}
              >
                {item}
              </button>
            ),
          )}
        </div>
        {(message || error) && (
          <output
            className={`mt-4 block rounded-xl p-3 text-sm ${error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}
          >
            {error || message}
          </output>
        )}
        {tab === 'Resumen' && (
          <>
            <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                label="Caja disponible"
                value={snapshot.metrics.cash}
                icon={WalletCards}
              />
              <Metric
                label="Cobrado"
                value={snapshot.metrics.collected}
                icon={Banknote}
              />
              <Metric
                label="Margen bruto"
                value={snapshot.metrics.grossMargin}
                icon={CircleDollarSign}
              />
              <Metric
                label="Resultado gerencial"
                value={snapshot.metrics.operatingResult}
                icon={Sparkles}
              />
            </section>
            <section className="panel mt-5 p-5">
              <h2 className="font-heading text-xl font-semibold">
                Rentabilidad acumulada
              </h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Value
                  label="Ventas entregadas"
                  value={snapshot.metrics.sales}
                />
                <Value
                  label="Costo de venta"
                  value={snapshot.metrics.costOfGoods}
                />
                <Value label="Gastos" value={snapshot.metrics.expenses} />
                <Value
                  label="Margen %"
                  text={
                    snapshot.metrics.sales === 0
                      ? 'Pendiente'
                      : `${((snapshot.metrics.grossMargin / snapshot.metrics.sales) * 100).toFixed(1)} %`
                  }
                />
              </div>
            </section>
          </>
        )}
        {tab === 'Cuentas' && (
          <div className="mt-5 grid gap-5 xl:grid-cols-[.72fr_1.28fr]">
            <Panel icon={WalletCards} title="Nueva cuenta">
              <form
                className="form-grid"
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  void submit(
                    '/api/v1/accounts',
                    {
                      code: data.get('code'),
                      name: data.get('name'),
                      type: data.get('type'),
                      openingBalance: Number(data.get('openingBalance') || 0),
                    },
                    'Cuenta financiera creada.',
                  );
                }}
              >
                <Field name="code" label="Código" required />
                <Field name="name" label="Nombre" required />
                <label className="text-xs font-semibold">
                  Tipo
                  <select name="type" className="input mt-2">
                    <option value="BANK">Banco</option>
                    <option value="CASH">Caja</option>
                    <option value="WALLET">Billetera</option>
                    <option value="OTHER">Otra</option>
                  </select>
                </label>
                <Field
                  name="openingBalance"
                  label="Saldo de apertura"
                  type="number"
                  step="0.01"
                />
                <Submit pending={pending} />
              </form>
            </Panel>
            <section className="panel overflow-hidden">
              <Title>Cuentas y caja</Title>
              {snapshot.accounts.length === 0 ? (
                <Empty text="Aún no existen cuentas." />
              ) : (
                <div className="divide-y">
                  {snapshot.accounts.map((account) => (
                    <article
                      key={account.id}
                      className="flex items-center justify-between gap-4 p-4"
                    >
                      <div>
                        <p className="font-semibold">
                          {account.code} · {account.name}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {account.type} · apertura{' '}
                          {cop(Number(account.openingBalance))} · movimientos{' '}
                          {cop(Number(account.movementTotal))}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="font-heading text-xl font-semibold">
                          {cop(Number(account.balance))}
                        </p>
                        <div className="flex gap-2">
                          <IconAction
                            label={`Editar ${account.name}`}
                            onClick={() => setEditingAccount(account)}
                          >
                            <Pencil className="size-4" />
                          </IconAction>
                          {account.status === 'INACTIVE' ? (
                            <IconAction
                              label={`Restaurar ${account.name}`}
                              disabled={pending}
                              onClick={() =>
                                void submit(
                                  `/api/v1/accounts/${account.id}`,
                                  { active: true },
                                  'Cuenta restaurada.',
                                  'PATCH',
                                )
                              }
                            >
                              <RotateCcw className="size-4" />
                            </IconAction>
                          ) : (
                            <IconAction
                              label={`Desactivar ${account.name}`}
                              tone="danger"
                              disabled={pending}
                              onClick={() => {
                                const reason = window.prompt(
                                  'Motivo de la desactivación:',
                                );
                                if (reason)
                                  void submit(
                                    `/api/v1/accounts/${account.id}`,
                                    { reason },
                                    'Cuenta desactivada.',
                                    'DELETE',
                                  );
                              }}
                            >
                              <Trash2 className="size-4" />
                            </IconAction>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
        {tab === 'Gastos' && (
          <div className="mt-5 grid gap-5 xl:grid-cols-[.72fr_1.28fr]">
            <Panel icon={ReceiptText} title="Registrar gasto">
              {snapshot.accounts.length === 0 ? (
                <Empty text="Crea una cuenta antes de registrar gastos." />
              ) : (
                <form
                  className="form-grid"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    void submit(
                      '/api/v1/expenses',
                      {
                        reference: data.get('reference'),
                        accountId: data.get('accountId'),
                        category: data.get('category'),
                        description: data.get('description'),
                        amount: Number(data.get('amount')),
                      },
                      'Gasto confirmado.',
                    );
                  }}
                >
                  <Field name="reference" label="Referencia" required />
                  <label className="text-xs font-semibold">
                    Cuenta
                    <select name="accountId" className="input mt-2">
                      {snapshot.accounts
                        .filter((account) => account.status === 'ACTIVE')
                        .map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name} · {cop(Number(account.balance))}
                          </option>
                        ))}
                    </select>
                  </label>
                  <Field name="category" label="Categoría" required />
                  <Field
                    name="amount"
                    label="Importe"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                  />
                  <label className="col-span-full text-xs font-semibold">
                    Descripción
                    <textarea
                      name="description"
                      required
                      minLength={3}
                      className="input mt-2 min-h-24 py-3"
                    />
                  </label>
                  <Submit pending={pending} />
                </form>
              )}
            </Panel>
            <section className="panel overflow-hidden">
              <Title>Gastos confirmados</Title>
              {snapshot.expenses.length === 0 ? (
                <Empty text="Aún no hay gastos." />
              ) : (
                <div className="divide-y">
                  {snapshot.expenses.map((expense) => (
                    <article
                      key={expense.id}
                      className={`p-4 ${expense.reversedAt ? 'opacity-50' : ''}`}
                    >
                      <div className="flex justify-between gap-4">
                        <div>
                          <p className="font-semibold">
                            {expense.reference} · {expense.category}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {expense.description} · {expense.account}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-red-700">
                            {cop(Number(expense.amount))}
                          </p>
                          {!expense.reversedAt && (
                            <IconAction
                              label={`Reversar gasto ${expense.reference}`}
                              disabled={pending}
                              onClick={() => {
                                const reason = window.prompt(
                                  'Motivo del reverso:',
                                );
                                if (reason)
                                  void submit(
                                    `/api/v1/expenses/${expense.id}/reverse`,
                                    { reason },
                                    'Gasto reversado.',
                                  );
                              }}
                            >
                              <RotateCcw className="size-4" />
                            </IconAction>
                          )}
                        </div>
                      </div>
                      {expense.reversedAt && (
                        <p className="mt-2 text-xs">REVERSADO</p>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
        {tab === 'Movimientos' && (
          <section className="panel mt-5 overflow-hidden">
            <Title>Ledger financiero</Title>
            {snapshot.movements.length === 0 ? (
              <Empty text="Aún no existen movimientos financieros." />
            ) : (
              <div className="divide-y">
                {snapshot.movements.map((movement) => {
                  const reversed = reversedIds.has(movement.id);
                  return (
                    <article
                      key={movement.id}
                      className={`grid gap-3 p-4 md:grid-cols-[150px_1fr_140px_200px] md:items-center ${reversed ? 'opacity-50' : ''}`}
                    >
                      <div className="text-xs text-muted-foreground">
                        {date(movement.occurredAt)}
                        <br />
                        {movement.account}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">
                          {movement.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {movement.type} · {movement.category}
                          {reversed ? ' · REVERSADO' : ''}
                        </p>
                      </div>
                      <p
                        className={`font-semibold ${Number(movement.amount) < 0 ? 'text-red-700' : 'text-emerald-700'}`}
                      >
                        {cop(Number(movement.amount))}
                      </p>
                      {movement.type !== 'REVERSAL' && !reversed ? (
                        <form
                          className="flex gap-2"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const reason = new FormData(
                              event.currentTarget,
                            ).get('reason');
                            if (typeof reason === 'string')
                              void submit(
                                `/api/v1/finance/movements/${movement.id}/reverse`,
                                { reason },
                                'Movimiento financiero reversado.',
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
                            aria-label="Reversar"
                            className="grid size-10 place-items-center rounded-lg border"
                          >
                            <RotateCcw className="size-4" />
                          </button>
                        </form>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {movement.type === 'REVERSAL'
                            ? 'Reverso'
                            : 'Reversado'}
                        </span>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>
      {editingAccount && (
        <RecordModal
          title="Editar cuenta"
          onClose={() => setEditingAccount(null)}
        >
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void submit(
                `/api/v1/accounts/${editingAccount.id}`,
                {
                  code: data.get('code'),
                  name: data.get('name'),
                  type: data.get('type'),
                },
                'Cuenta actualizada.',
                'PATCH',
              );
            }}
          >
            <Field
              name="code"
              label="Código"
              defaultValue={editingAccount.code}
              required
            />
            <Field
              name="name"
              label="Nombre"
              defaultValue={editingAccount.name}
              required
            />
            <label className="text-xs font-semibold">
              Tipo
              <select
                name="type"
                defaultValue={editingAccount.type}
                className="input mt-2"
              >
                <option value="BANK">Banco</option>
                <option value="CASH">Caja</option>
                <option value="WALLET">Billetera</option>
                <option value="OTHER">Otra</option>
              </select>
            </label>
            <p className="col-span-full rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
              El saldo de apertura no se edita aquí. Si es incorrecto, registra
              un ajuste o reverso para conservar la trazabilidad.
            </p>
            <Submit pending={pending} />
          </form>
        </RecordModal>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof WalletCards;
}) {
  return (
    <article className="panel p-5">
      <Icon className="size-5 text-brand" />
      <p className="mt-4 text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-2xl font-semibold">{cop(value)}</p>
    </article>
  );
}
function Value({
  label,
  value,
  text,
}: {
  label: string;
  value?: number;
  text?: string;
}) {
  return (
    <div className="rounded-xl bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{text ?? cop(value ?? 0)}</p>
    </div>
  );
}
function Panel({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof WalletCards;
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
function date(value: Date) {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  }).format(new Date(value));
}
