import {
  Boxes,
  CircleDollarSign,
  Factory,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
} from 'lucide-react';
import type { DashboardSnapshot } from '@/modules/dashboard/queries/get-dashboard-snapshot';
import type { DashboardAccess } from '@/modules/dashboard/queries/get-dashboard-access';

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
  snapshot,
  access,
}: {
  snapshot: DashboardSnapshot;
  access: DashboardAccess;
}) {
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
  return (
    <div className="bg-[var(--canvas)] p-4 text-foreground sm:p-8 lg:p-10">
      <div className="mx-auto max-w-[1400px]">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-brand">
          LÚMINA OS · America/Bogota
        </p>
        <h2 className="mt-2 font-heading text-4xl font-semibold tracking-tight">
          Resumen
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Indicadores calculados exclusivamente desde operaciones confirmadas.
        </p>
        <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(([label, value, Icon]) => (
            <article key={label} className="metric-card">
              <span className="grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground">
                <Icon className="size-5" />
              </span>
              <p className="mt-5 text-xs text-muted-foreground">{label}</p>
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
                Aún no hay actividad. Las métricas aparecerán con las
                operaciones reales.
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
