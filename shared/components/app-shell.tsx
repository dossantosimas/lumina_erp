'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  Boxes,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Factory,
  FileUp,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ShoppingBag,
  ShoppingCart,
  Users,
  X,
} from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import type { DashboardAccess } from '@/modules/dashboard/queries/get-dashboard-access';

type NavigationItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  allowed: boolean;
};

const routeTitles: Record<string, string> = {
  '/': 'Resumen',
  '/catalogo': 'Catálogo',
  '/inventario': 'Inventario',
  '/produccion': 'Producción',
  '/ventas': 'Ventas',
  '/compras': 'Compras',
  '/finanzas': 'Finanzas',
  '/usuarios': 'Usuarios',
  '/carga-inicial': 'Carga inicial',
};

export function AppShell({
  user,
  access,
  children,
}: {
  user: { name: string; email: string };
  access: DashboardAccess;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const collapsed = useSyncExternalStore(
    (notify) => {
      window.addEventListener('lumina-sidebar-change', notify);
      window.addEventListener('storage', notify);
      return () => {
        window.removeEventListener('lumina-sidebar-change', notify);
        window.removeEventListener('storage', notify);
      };
    },
    () => window.localStorage.getItem('lumina-sidebar-collapsed') === 'true',
    () => false,
  );

  const setDesktopCollapsed = (value: boolean) => {
    window.localStorage.setItem('lumina-sidebar-collapsed', String(value));
    window.dispatchEvent(new Event('lumina-sidebar-change'));
  };
  const operational: NavigationItem[] = [
    { href: '/', label: 'Resumen', icon: LayoutDashboard, allowed: true },
    {
      href: '/catalogo',
      label: 'Catálogo',
      icon: Package,
      allowed: access.catalog,
    },
    {
      href: '/inventario',
      label: 'Inventario',
      icon: Boxes,
      allowed: access.inventory,
    },
    {
      href: '/produccion',
      label: 'Producción',
      icon: Factory,
      allowed: access.production,
    },
    {
      href: '/ventas',
      label: 'Ventas',
      icon: ShoppingBag,
      allowed: access.sales,
    },
    {
      href: '/compras',
      label: 'Compras',
      icon: ShoppingCart,
      allowed: access.purchases,
    },
    {
      href: '/finanzas',
      label: 'Finanzas',
      icon: CircleDollarSign,
      allowed: access.finance,
    },
  ];
  const administration: NavigationItem[] = [
    {
      href: '/usuarios',
      label: 'Usuarios',
      icon: Users,
      allowed: access.users,
    },
    {
      href: '/carga-inicial',
      label: 'Carga inicial',
      icon: FileUp,
      allowed: access.initialLoad,
    },
  ];
  const title =
    Object.entries(routeTitles).find(([route]) =>
      route === '/' ? pathname === route : pathname.startsWith(route),
    )?.[1] ?? 'LÚMINA OS';

  async function signOut() {
    await authClient.signOut();
    router.push('/login');
    router.refresh();
  }

  const navigation = (label: string, items: NavigationItem[]) => {
    const visible = items.filter((item) => item.allowed);
    if (!visible.length) return null;
    return (
      <section className="px-3 py-3">
        {!collapsed && (
          <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[.18em] text-sidebar-foreground/50">
            {label}
          </p>
        )}
        <nav className="space-y-1">
          {visible.map((item) => {
            const active =
              item.href === '/'
                ? pathname === '/'
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                title={collapsed ? item.label : undefined}
                aria-current={active ? 'page' : undefined}
                className={`flex h-11 items-center rounded-xl transition ${
                  collapsed ? 'justify-center px-2' : 'gap-3 px-3'
                } ${
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                }`}
              >
                <Icon className="size-[18px] shrink-0" />
                {!collapsed && (
                  <span className="text-sm font-semibold">{item.label}</span>
                )}
              </Link>
            );
          })}
        </nav>
      </section>
    );
  };

  if (pathname === '/login' || pathname.startsWith('/reset-password'))
    return <>{children}</>;

  return (
    <div className="flex min-h-screen bg-[var(--canvas)] text-foreground">
      {mobileOpen && (
        <button
          type="button"
          aria-label="Cerrar navegación"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-foreground/35 backdrop-blur-[2px] md:hidden"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 shrink-0 flex-col border-r border-sidebar-border bg-sidebar shadow-xl transition-[transform,width] duration-200 md:sticky md:top-0 md:h-screen md:translate-x-0 md:shadow-none ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'md:w-20' : 'md:w-64'}`}
      >
        <div
          className={`flex h-20 items-center border-b border-sidebar-border ${collapsed ? 'justify-center px-3' : 'gap-3 px-5'}`}
        >
          <Link
            href="/"
            onClick={() => setMobileOpen(false)}
            className="flex min-w-0 items-center gap-3"
            aria-label="Ir al resumen"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-foreground p-1 shadow-sm">
              <Image
                src="/brand/lumina-emblem.png"
                alt=""
                width={42}
                height={42}
                className="size-9 object-contain"
                priority
              />
            </span>
            {!collapsed && (
              <span className="min-w-0">
                <b className="block truncate font-heading text-lg tracking-[.16em]">
                  LÚMINA
                </b>
                <small className="block truncate text-[9px] tracking-[.2em] text-muted-foreground">
                  CANDLE STUDIO
                </small>
              </span>
            )}
          </Link>
          <button
            type="button"
            aria-label="Cerrar navegación"
            onClick={() => setMobileOpen(false)}
            className="ml-auto rounded-lg p-2 md:hidden"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {navigation('Operación', operational)}
          {navigation('Administración', administration)}
        </div>
        <div className="border-t border-sidebar-border p-3">
          <div
            className={`flex items-center rounded-xl bg-sidebar-accent/70 p-2 ${collapsed ? 'justify-center' : 'gap-3'}`}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary font-semibold text-primary-foreground">
              {user.name[0]?.toUpperCase()}
            </span>
            {!collapsed && (
              <span className="min-w-0 flex-1">
                <b className="block truncate text-xs">{user.name}</b>
                <small className="block truncate text-[10px] text-muted-foreground">
                  {user.email}
                </small>
              </span>
            )}
            {!collapsed && (
              <button
                type="button"
                onClick={signOut}
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
                className="rounded-lg p-2 text-muted-foreground hover:bg-background hover:text-foreground"
              >
                <LogOut className="size-4" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setDesktopCollapsed(!collapsed)}
            className="mt-2 hidden h-9 w-full items-center justify-center gap-2 rounded-lg text-xs font-semibold text-muted-foreground hover:bg-sidebar-accent hover:text-foreground md:flex"
          >
            {collapsed ? (
              <ChevronRight className="size-4" />
            ) : (
              <ChevronLeft className="size-4" />
            )}
            {!collapsed && 'Contraer menú'}
          </button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-16 items-center border-b bg-background/90 px-4 backdrop-blur sm:px-6 lg:px-8">
          <button
            type="button"
            aria-label="Abrir navegación"
            onClick={() => setMobileOpen(true)}
            className="mr-3 rounded-lg border bg-background p-2 md:hidden"
          >
            <Menu className="size-5" />
          </button>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.16em] text-brand">
              LÚMINA OS · Operación
            </p>
            <h1 className="font-heading text-xl font-semibold">{title}</h1>
          </div>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <span className="hidden items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-[11px] font-semibold text-success lg:inline-flex">
              <span className="size-2 rounded-full bg-success" /> Datos
              operativos
            </span>
            <span className="hidden max-w-40 truncate text-xs font-semibold text-muted-foreground sm:block">
              {user.name}
            </span>
            <button
              type="button"
              onClick={signOut}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              className="rounded-lg border bg-background p-2 text-muted-foreground transition hover:border-primary hover:text-primary"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </header>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
