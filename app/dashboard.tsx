'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Boxes,
  CircleDollarSign,
  Factory,
  LayoutDashboard,
  Menu,
  Package,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import type { DashboardSnapshot } from '@/modules/dashboard/queries/get-dashboard-snapshot';
import type { DashboardAccess } from '@/modules/dashboard/queries/get-dashboard-access';

type Section =
  | 'Resumen'
  | 'Catálogo'
  | 'Inventario'
  | 'Producción'
  | 'Ventas'
  | 'Compras'
  | 'Finanzas'
  | 'Usuarios';
const nav = [
  ['Resumen', LayoutDashboard],
  ['Catálogo', Package],
  ['Inventario', Boxes],
  ['Producción', Factory],
  ['Ventas', ShoppingBag],
  ['Compras', ShoppingCart],
  ['Finanzas', CircleDollarSign],
  ['Usuarios', Users],
] as const;
const routes: Partial<Record<Section, string>> = {
  Catálogo: '/catalogo',
  Inventario: '/inventario',
  Producción: '/produccion',
  Ventas: '/ventas',
  Compras: '/compras',
  Finanzas: '/finanzas',
  Usuarios: '/usuarios',
};
const descriptions: Record<Section, string> = {
  Resumen: 'Indicadores calculados desde las operaciones confirmadas.',
  Catálogo: 'Productos, materiales, unidades y versiones de BOM.',
  Inventario: 'Ledger append-only, lotes, reservas, conteos y mínimos.',
  Producción: 'Órdenes con snapshot de BOM, consumos, mermas y lotes.',
  Ventas: 'Clientes, pedidos, reservas, entregas, pagos y costo de venta.',
  Compras: 'Proveedores, órdenes, aprobaciones y recepciones parciales.',
  Finanzas: 'Caja, cuentas, gastos, margen y rentabilidad gerencial.',
  Usuarios: 'Invitaciones, múltiples roles, permisos y auditoría.',
};

function cop(value: string) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function bogotaDate(value: Date) {
  return new Date(value)
    .toLocaleString('es-CO', { timeZone: 'America/Bogota' })
    .replace(/[\u00a0\u202f]/g, ' ');
}

export function Dashboard({
  user,
  snapshot,
  access,
}: {
  user: { name: string; email: string };
  snapshot: DashboardSnapshot;
  access: DashboardAccess;
}) {
  const [section, setSection] = useState<Section>('Resumen');
  const [open, setOpen] = useState(false);
  const metrics = [
    snapshot.salesTotal === null
      ? null
      : ['Ventas confirmadas', cop(snapshot.salesTotal), CircleDollarSign],
    snapshot.cash === null
      ? null
      : ['Caja disponible', cop(snapshot.cash), CircleDollarSign],
    snapshot.grossMargin === null
      ? null
      : ['Margen bruto', cop(snapshot.grossMargin), Sparkles],
    snapshot.activeOrders === null
      ? null
      : ['Pedidos activos', String(snapshot.activeOrders), ShoppingBag],
    snapshot.activeProduction === null
      ? null
      : ['Producciones activas', String(snapshot.activeProduction), Factory],
    snapshot.pendingPurchases === null
      ? null
      : ['Compras abiertas', String(snapshot.pendingPurchases), ShoppingCart],
    snapshot.inventoryAlerts === null
      ? null
      : ['Alertas de inventario', String(snapshot.inventoryAlerts), Boxes],
  ].filter(
    (metric): metric is [string, string, typeof CircleDollarSign] =>
      metric !== null,
  );
  const moduleAllowed: Record<Section, boolean> = {
    Resumen: true,
    Catálogo: access.catalog,
    Inventario: access.inventory,
    Producción: access.production,
    Ventas: access.sales,
    Compras: access.purchases,
    Finanzas: access.finance,
    Usuarios: access.users,
  };
  return (
    <div className="min-h-screen bg-[var(--canvas)] text-foreground lg:grid lg:grid-cols-[248px_1fr]">
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col border-r bg-sidebar transition-transform lg:sticky lg:top-0 lg:h-screen ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <div className="flex h-[78px] items-center justify-between border-b px-6">
          <button
            onClick={() => setSection('Resumen')}
            className="flex items-center gap-3"
          >
            <span className="grid size-10 place-items-center rounded-full bg-primary text-white">
              <Sparkles className="size-4" />
            </span>
            <span className="text-left">
              <b className="block font-heading tracking-[.2em]">LÚMINA</b>
              <small className="text-[9px] tracking-[.2em] text-muted-foreground">
                CANDLE STUDIO
              </small>
            </span>
          </button>
          <button className="lg:hidden" onClick={() => setOpen(false)}>
            <X />
          </button>
        </div>
        <nav className="flex-1 space-y-1 p-4 pt-7">
          {nav
            .filter(([label]) => moduleAllowed[label])
            .map(([label, Icon]) => {
              const href = routes[label];
              const className = `flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${section === label ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-sidebar-accent'}`;
              return href ? (
                <Link
                  key={label}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={className}
                >
                  <Icon className="size-[18px]" />
                  {label}
                </Link>
              ) : (
                <button
                  key={label}
                  onClick={() => {
                    setSection(label);
                    setOpen(false);
                  }}
                  className={className}
                >
                  <Icon className="size-[18px]" />
                  {label}
                </button>
              );
            })}
        </nav>
        <div className="border-t p-4">
          <div className="flex items-center gap-3 rounded-xl p-2">
            <span className="grid size-9 place-items-center rounded-full bg-[#e9d7c6] font-semibold">
              {user.name[0]?.toUpperCase()}
            </span>
            <span className="min-w-0">
              <b className="block truncate text-xs">{user.name}</b>
              <small className="block truncate text-[10px] text-muted-foreground">
                {user.email}
              </small>
            </span>
          </div>
        </div>
      </aside>
      {open && (
        <button
          aria-label="Cerrar menú"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
        />
      )}
      <main className="min-w-0">
        <header className="flex h-[78px] items-center border-b bg-background/90 px-5 backdrop-blur lg:px-10">
          <button className="lg:hidden" onClick={() => setOpen(true)}>
            <Menu />
          </button>
          {access.initialLoad && (
            <Link
              href="/carga-inicial"
              className="ml-auto mr-3 hidden rounded-xl border bg-background px-3 py-2 text-xs font-semibold sm:inline-flex"
            >
              Carga inicial
            </Link>
          )}
          <span
            className={`${access.initialLoad ? '' : 'ml-auto '}inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-[11px] font-semibold text-[#28745a]`}
          >
            <span className="size-2 rounded-full bg-[#398a69]" />
            Datos operativos
          </span>
        </header>
        <div className="mx-auto max-w-[1400px] p-5 sm:p-8 lg:p-10">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-[#9a775a]">
            LÚMINA OS · America/Bogota
          </p>
          <h1 className="mt-2 font-heading text-4xl font-semibold tracking-tight">
            {section}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {descriptions[section]}
          </p>
          {section === 'Resumen' ? (
            <>
              <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {metrics.map(([label, value, Icon]) => (
                  <article key={label} className="metric-card">
                    <span className="grid size-10 place-items-center rounded-xl bg-[#eee6da] text-[#806646]">
                      <Icon className="size-5" />
                    </span>
                    <p className="mt-5 text-xs text-muted-foreground">
                      {label}
                    </p>
                    <p className="mt-1 font-heading text-3xl font-semibold">
                      {value}
                    </p>
                  </article>
                ))}
              </section>
              {access.audit && (
                <section className="panel mt-5 overflow-hidden">
                  <div className="panel-header">
                    <div>
                      <p className="panel-kicker">Trazabilidad</p>
                      <h2 className="panel-title">Actividad reciente</h2>
                    </div>
                  </div>
                  {snapshot.recentActivity.length ? (
                    <div>
                      {snapshot.recentActivity.map((activity) => (
                        <div
                          key={activity.id}
                          className="flex flex-col justify-between gap-2 border-t px-5 py-4 sm:flex-row sm:items-center"
                        >
                          <div>
                            <b className="text-sm">{activity.operation}</b>
                            <p className="text-xs text-muted-foreground">
                              {activity.entityType} · {activity.actor}
                            </p>
                          </div>
                          <time className="text-xs text-muted-foreground">
                            {bogotaDate(activity.occurredAt)}
                          </time>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="border-t p-8 text-sm text-muted-foreground">
                      Aún no hay actividad. Carga catálogo, BOM, conteo físico y
                      saldos de apertura; las métricas aparecerán únicamente con
                      operaciones reales.
                    </p>
                  )}
                </section>
              )}
            </>
          ) : section === 'Catálogo' ? (
            <section className="panel mt-8 p-8">
              <Package className="size-6 text-[#9a775a]" />
              <h2 className="mt-4 font-heading text-xl font-semibold">
                Catálogo y BOM operativo
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Administra productos, materiales y recetas versionadas.
              </p>
              <Link
                href="/catalogo"
                className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
              >
                Abrir módulo
              </Link>
            </section>
          ) : section === 'Inventario' ? (
            <section className="panel mt-8 p-8">
              <Boxes className="size-6 text-[#9a775a]" />
              <h2 className="mt-4 font-heading text-xl font-semibold">
                Inventario operativo
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Registra conteos iniciales, ajustes, lotes y reversos sobre un
                ledger trazable.
              </p>
              <Link
                href="/inventario"
                className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
              >
                Abrir módulo
              </Link>
            </section>
          ) : section === 'Finanzas' ? (
            <section className="panel mt-8 p-8">
              <CircleDollarSign className="size-6 text-[#9a775a]" />
              <h2 className="mt-4 font-heading text-xl font-semibold">
                Finanzas operativas
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Consulta caja, gastos, cobros, márgenes, rentabilidad y
                reversos.
              </p>
              <Link
                href="/finanzas"
                className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
              >
                Abrir módulo
              </Link>
            </section>
          ) : section === 'Ventas' ? (
            <section className="panel mt-8 p-8">
              <ShoppingBag className="size-6 text-[#9a775a]" />
              <h2 className="mt-4 font-heading text-xl font-semibold">
                Ventas operativas
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Gestiona clientes, reservas, entregas, pagos y costo de venta.
              </p>
              <Link
                href="/ventas"
                className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
              >
                Abrir módulo
              </Link>
            </section>
          ) : section === 'Producción' ? (
            <section className="panel mt-8 p-8">
              <Factory className="size-6 text-[#9a775a]" />
              <h2 className="mt-4 font-heading text-xl font-semibold">
                Producción operativa
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Ejecuta órdenes con snapshot de BOM, consumos reales, mermas y
                lotes terminados.
              </p>
              <Link
                href="/produccion"
                className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
              >
                Abrir módulo
              </Link>
            </section>
          ) : section === 'Compras' ? (
            <section className="panel mt-8 p-8">
              <ShoppingCart className="size-6 text-[#9a775a]" />
              <h2 className="mt-4 font-heading text-xl font-semibold">
                Compras operativas
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Gestiona proveedores, aprobaciones y recepciones conectadas al
                inventario.
              </p>
              <Link
                href="/compras"
                className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
              >
                Abrir módulo
              </Link>
            </section>
          ) : section === 'Usuarios' ? (
            <section className="panel mt-8 p-8">
              <ShieldCheck className="size-6 text-[#9a775a]" />
              <h2 className="mt-4 font-heading text-xl font-semibold">
                Equipo y auditoría
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Invita integrantes, asigna múltiples roles y consulta la
                bitácora de operaciones.
              </p>
              <Link
                href="/usuarios"
                className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
              >
                Abrir módulo
              </Link>
            </section>
          ) : (
            <section className="panel mt-8 p-8">
              <Settings className="size-6 text-[#9a775a]" />
              <h2 className="mt-4 font-heading text-xl font-semibold">
                Módulo preparado
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                El modelo, estados, permisos y endpoints de dominio están
                definidos. La interfaz transaccional se habilitará por etapas.
              </p>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
