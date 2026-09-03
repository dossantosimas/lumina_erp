'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Bell, BookOpen, Boxes, ChevronDown, ChevronRight,
  CircleDollarSign, ClipboardList, Factory, FileText, HelpCircle,
  LayoutDashboard, Menu, PackageCheck, Plus, Search, Settings,
  ShoppingBag, ShoppingCart, Sparkles, TrendingUp, UserRound, Users, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

type UserInfo = { name: string; email: string; authenticated: boolean };
type Section = 'Resumen' | 'Inventario' | 'Producción' | 'Ventas' | 'Compras' | 'Finanzas' | 'Usuarios';

const navigation: { label: Section; icon: typeof LayoutDashboard; badge?: string }[] = [
  { label: 'Resumen', icon: LayoutDashboard }, { label: 'Inventario', icon: Boxes, badge: '3' },
  { label: 'Producción', icon: Factory, badge: '2' }, { label: 'Ventas', icon: ShoppingBag },
  { label: 'Compras', icon: ShoppingCart }, { label: 'Finanzas', icon: CircleDollarSign },
  { label: 'Usuarios', icon: Users },
];

const metrics = [
  { label: 'Ventas del mes', value: '$ 8.460.000', trend: '+12,4%', note: 'vs. agosto', icon: TrendingUp, good: true },
  { label: 'Margen bruto', value: '46,8%', trend: '+2,1%', note: 'vs. objetivo 45%', icon: CircleDollarSign, good: true },
  { label: 'Órdenes activas', value: '08', trend: '2 urgentes', note: 'esta semana', icon: ClipboardList, good: false },
  { label: 'Valor inventario', value: '$ 5.214.800', trend: '+4,6%', note: 'último conteo', icon: Boxes, good: true },
];

const orders = [
  { id: 'PED-0248', customer: 'Hotel Casa Legado', items: 'Vela Ámbar 200g × 24', total: '$ 1.512.000', status: 'En producción', tone: 'amber' },
  { id: 'PED-0247', customer: 'María Fernanda Ruiz', items: 'Kit Ritual de Calma × 2', total: '$ 286.000', status: 'Listo para entregar', tone: 'green' },
  { id: 'PED-0246', customer: 'Casa Santamaría', items: 'Vela Bosque 350g × 12', total: '$ 1.188.000', status: 'Confirmado', tone: 'blue' },
  { id: 'PED-0245', customer: 'Ana Lucía Gómez', items: 'Vela Higo 200g × 1', total: '$ 63.000', status: 'Entregado', tone: 'gray' },
];

const inventory = [
  { name: 'Cera de soya', detail: 'Materia prima · kg', stock: '8,4 kg', min: '12 kg', level: 35 },
  { name: 'Esencia Ámbar', detail: 'Materia prima · ml', stock: '920 ml', min: '1.200 ml', level: 62 },
  { name: 'Envase vidrio 200g', detail: 'Insumo · und', stock: '38 und', min: '50 und', level: 68 },
];

const production = [
  { code: 'OP-0089', product: 'Vela Ámbar 200g', units: '24 unidades', stage: 'Vertido', progress: 64, due: 'Hoy, 4:00 p. m.' },
  { code: 'OP-0090', product: 'Vela Bosque 350g', units: '12 unidades', stage: 'Preparación', progress: 24, due: 'Mañana' },
];

const modules: Record<Exclude<Section, 'Resumen'>, { eyebrow: string; title: string; description: string; icon: typeof Boxes; rows: string[] }> = {
  Inventario: { eyebrow: 'Módulo operativo', title: 'Inventario', description: 'Existencias derivadas del ledger de movimientos. El stock confirmado nunca se edita directamente.', icon: Boxes, rows: ['Cera de soya · 8,4 kg', 'Esencia Ámbar · 920 ml', 'Envase vidrio 200g · 38 und'] },
  Producción: { eyebrow: 'Módulo operativo', title: 'Producción', description: 'Órdenes, consumos, lotes y mermas con trazabilidad desde la materia prima.', icon: Factory, rows: ['OP-0089 · En vertido', 'OP-0090 · En preparación', 'Capacidad semanal · 68%'] },
  Ventas: { eyebrow: 'Módulo comercial', title: 'Ventas y pedidos', description: 'Pedidos B2C y B2B conectados con inventario, pagos y rentabilidad.', icon: ShoppingBag, rows: ['PED-0248 · Hotel Casa Legado', 'PED-0247 · María Fernanda Ruiz', 'PED-0246 · Casa Santamaría'] },
  Compras: { eyebrow: 'Módulo operativo', title: 'Compras', description: 'Solicitudes, proveedores y recepciones que actualizan costos e inventario.', icon: ShoppingCart, rows: ['Cera de soya · Reposición sugerida', 'Esencia Ámbar · Cotizar', 'Envases 200g · 50 unidades'] },
  Finanzas: { eyebrow: 'Módulo financiero', title: 'Finanzas y caja', description: 'Ingresos, gastos y movimientos separados de las finanzas personales.', icon: CircleDollarSign, rows: ['Caja operativa · $ 3.840.000', 'Ingresos septiembre · $ 8.460.000', 'Gastos registrados · $ 4.499.000'] },
  Usuarios: { eyebrow: 'Configuración', title: 'Usuarios y permisos', description: 'Un usuario físico puede reunir varios roles funcionales con permisos auditables.', icon: Users, rows: ['Daniela Rojas · Administrador', 'Laura Pérez · Producción', 'Mateo Ortiz · Ventas'] },
};

export function Dashboard({ user }: { user: UserInfo }) {
  const [section, setSection] = useState<Section>('Resumen');
  const [mobileNav, setMobileNav] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [period, setPeriod] = useState('Este mes');
  const matchingOrders = useMemo(() => orders.filter((o) => `${o.id} ${o.customer} ${o.items}`.toLowerCase().includes(search.toLowerCase())), [search]);

  useEffect(() => {
    const context = typeof document === 'undefined' ? undefined : document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: 'navigate_lumina_module', title: 'Abrir módulo de LÚMINA OS',
      description: 'Abre uno de los módulos visibles del ERP LÚMINA OS.',
      inputSchema: { type: 'object', properties: { module: { type: 'string', enum: navigation.map((item) => item.label) } }, required: ['module'], additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute(input: unknown) {
        const moduleName = (input as { module?: Section })?.module;
        if (!navigation.some((item) => item.label === moduleName)) throw new Error('Módulo no válido');
        setSection(moduleName as Section);
        return { module: moduleName, opened: true };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, []);

  function navigate(label: Section) { setSection(label); setMobileNav(false); setSearch(''); }
  function showNotice(message: string) { setNotice(message); window.setTimeout(() => setNotice(null), 2800); }

  return <div className="min-h-screen bg-[var(--canvas)] text-foreground lg:grid lg:grid-cols-[248px_1fr]">
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col border-r border-sidebar-border bg-sidebar transition-transform lg:sticky lg:top-0 lg:h-screen ${mobileNav ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
      <div className="flex h-[78px] items-center justify-between border-b border-sidebar-border px-6">
        <button onClick={() => navigate('Resumen')} className="flex items-center gap-3 text-left" aria-label="Ir al resumen">
          <span className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm"><Sparkles className="size-[18px]" /></span>
          <span><strong className="block font-heading text-[18px] tracking-[0.2em]">LÚMINA</strong><small className="block text-[9px] font-semibold tracking-[0.26em] text-muted-foreground">CANDLE STUDIO</small></span>
        </button>
        <button className="lg:hidden" onClick={() => setMobileNav(false)} aria-label="Cerrar navegación"><X className="size-5" /></button>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-6" aria-label="Navegación principal">
        <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Operación</p>
        <div className="space-y-1">{navigation.map((item) => { const Icon = item.icon; const active = section === item.label; return <button key={item.label} onClick={() => navigate(item.label)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`}><Icon className="size-[18px]"/><span>{item.label}</span>{item.badge && <span className={`ml-auto grid min-w-5 place-items-center rounded-full px-1.5 text-[10px] ${active ? 'bg-white/20' : 'bg-[#eee6da] text-[#806646]'}`}>{item.badge}</span>}</button>; })}</div>
        <p className="mb-2 mt-7 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Sistema</p>
        <button onClick={() => showNotice('La configuración requiere el rol Administrador.')} className="nav-secondary"><Settings/>Configuración</button>
        <button onClick={() => showNotice('Centro de ayuda: Bloque Fundamentos.')} className="nav-secondary"><HelpCircle/>Ayuda</button>
      </nav>
      <div className="border-t border-sidebar-border p-4"><button onClick={() => navigate('Usuarios')} className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-sidebar-accent"><span className="grid size-9 place-items-center rounded-full bg-[#e9d7c6] text-sm font-semibold text-[#5b4334]">{user.name.charAt(0).toUpperCase()}</span><span className="min-w-0 flex-1"><strong className="block truncate text-xs">{user.name}</strong><small className="block truncate text-[10px] text-muted-foreground">Administrador</small></span><ChevronDown className="size-4 text-muted-foreground"/></button></div>
    </aside>
    {mobileNav && <button aria-label="Cerrar navegación" className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setMobileNav(false)}/>}

    <main className="min-w-0">
      <header className="sticky top-0 z-30 flex h-[78px] items-center gap-3 border-b bg-background/92 px-4 backdrop-blur-xl sm:px-7 lg:px-10">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileNav(true)} aria-label="Abrir navegación"><Menu/></Button>
        <div className="relative hidden max-w-[410px] flex-1 md:block"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><input value={search} onChange={(e) => setSearch(e.target.value)} className="h-10 w-full rounded-xl border bg-muted/45 pl-10 pr-16 text-sm outline-none transition focus:border-primary/40 focus:bg-background focus:ring-3 focus:ring-primary/10" placeholder="Buscar pedido, cliente o producto…" aria-label="Buscar"/><kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">⌘ K</kbd></div>
        <div className="ml-auto flex items-center gap-2"><Button variant="ghost" size="icon" className="relative" onClick={() => showNotice('No tienes notificaciones nuevas.')} aria-label="Notificaciones"><Bell/><span className="absolute right-2 top-2 size-1.5 rounded-full bg-[#b56b45] ring-2 ring-background"/></Button><Button onClick={() => setQuickOpen(true)} className="h-10 rounded-xl bg-[#1f4b3c] px-4 hover:bg-[#173b30]"><Plus/><span className="hidden sm:inline">Registro rápido</span><span className="sm:hidden">Nuevo</span></Button></div>
      </header>

      {section === 'Resumen' ? <div className="mx-auto max-w-[1450px] px-4 py-7 sm:px-7 lg:px-10 lg:py-9">
        <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#9a775a]">Miércoles, 2 de septiembre</p><h1 className="font-heading text-3xl font-semibold tracking-[-0.035em] sm:text-[38px]">Buenos días, {user.name.split(' ')[0]}</h1><p className="mt-2 text-sm text-muted-foreground">Así está LÚMINA hoy. Tienes 5 asuntos que requieren atención.</p></div><button onClick={() => setPeriod(period === 'Este mes' ? 'Últimos 30 días' : 'Este mes')} className="flex w-fit items-center gap-2 rounded-xl border bg-background px-3.5 py-2 text-xs font-semibold shadow-sm">{period}<ChevronDown className="size-4"/></button></div>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores principales">{metrics.map((m) => { const Icon = m.icon; return <article key={m.label} className="metric-card"><div className="mb-4 flex items-start justify-between"><span className="grid size-9 place-items-center rounded-xl bg-[#f2ede5] text-[#806646]"><Icon className="size-[17px]"/></span><span className={`text-[11px] font-semibold ${m.good ? 'text-[#28745a]' : 'text-[#a15b38]'}`}>{m.trend}</span></div><p className="text-xs text-muted-foreground">{m.label}</p><p className="mt-1 font-heading text-[26px] font-semibold tracking-[-0.03em]">{m.value}</p><p className="mt-1 text-[10px] text-muted-foreground">{m.note}</p></article>; })}</section>
        <div className="mt-5 grid gap-5 xl:grid-cols-[1.55fr_0.9fr]">
          <section className="panel overflow-hidden"><PanelHeader kicker="Actividad comercial" title="Pedidos recientes" action={() => navigate('Ventas')}/><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left"><thead><tr className="border-y bg-muted/35 text-[10px] uppercase tracking-[0.12em] text-muted-foreground"><th className="px-5 py-3 font-semibold">Pedido</th><th className="px-4 py-3 font-semibold">Cliente y detalle</th><th className="px-4 py-3 font-semibold">Estado</th><th className="px-5 py-3 text-right font-semibold">Total</th></tr></thead><tbody>{matchingOrders.map((o) => <tr key={o.id} className="border-b last:border-0 hover:bg-muted/20"><td className="px-5 py-4 font-mono text-xs font-semibold">{o.id}</td><td className="px-4 py-4"><p className="text-xs font-semibold">{o.customer}</p><p className="mt-1 text-[10px] text-muted-foreground">{o.items}</p></td><td className="px-4 py-4"><span className={`status status-${o.tone}`}><span/>{o.status}</span></td><td className="px-5 py-4 text-right text-xs font-semibold">{o.total}</td></tr>)}</tbody></table>{matchingOrders.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">No encontramos pedidos con “{search}”.</div>}</div></section>
          <section className="panel p-5 sm:p-6"><div className="mb-5 flex items-center justify-between"><div><p className="panel-kicker">Septiembre</p><h2 className="panel-title">Meta de ventas</h2></div><span className="rounded-full bg-[#e6f1eb] px-2.5 py-1 text-[10px] font-bold text-[#28745a]">EN RUTA</span></div><div className="flex items-end justify-between"><div><p className="font-heading text-3xl font-semibold">$ 8,46 M</p><p className="mt-1 text-[11px] text-muted-foreground">de $ 15,0 M</p></div><p className="text-right text-xs font-semibold">56,4%<span className="block text-[10px] font-normal text-muted-foreground">alcanzado</span></p></div><Progress value={56.4} className="mt-5 [&_[data-slot=progress-track]]:h-2 [&_[data-slot=progress-indicator]]:bg-[#b9916c]"/><div className="mt-6 grid grid-cols-7 items-end gap-2 border-b pb-1" aria-label="Ventas semanales">{[38,52,44,78,57,88,68].map((h,i)=><div key={i} className="flex flex-col items-center gap-2"><div className={`w-full rounded-t-sm ${i===5?'bg-[#1f4b3c]':'bg-[#d8c3ad]'}`} style={{height:`${h}px`}}/><span className="text-[9px] text-muted-foreground">{['L','M','X','J','V','S','D'][i]}</span></div>)}</div></section>
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <section className="panel"><PanelHeader kicker="Requiere acción" title="Stock por reponer" action={() => navigate('Inventario')}/><div className="divide-y">{inventory.map((item)=><div key={item.name} className="flex items-center gap-4 px-5 py-4"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f5e7dc] text-[#9f5836]"><AlertTriangle className="size-[17px]"/></span><div className="min-w-0 flex-1"><div className="flex justify-between gap-3"><div><p className="text-xs font-semibold">{item.name}</p><p className="mt-1 text-[10px] text-muted-foreground">{item.detail}</p></div><div className="text-right"><p className="text-xs font-semibold">{item.stock}</p><p className="mt-1 text-[10px] text-muted-foreground">mín. {item.min}</p></div></div><div className="mt-2 h-1 overflow-hidden rounded-full bg-[#f0e4da]"><div className="h-full rounded-full bg-[#b66b45]" style={{width:`${item.level}%`}}/></div></div></div>)}</div></section>
          <section className="panel"><PanelHeader kicker="Taller" title="Producción en curso" action={() => navigate('Producción')}/><div className="divide-y">{production.map((item)=><div key={item.code} className="px-5 py-[18px]"><div className="flex items-start gap-4"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e6eeea] text-[#1f4b3c]"><Factory className="size-[17px]"/></span><div className="flex-1"><div className="flex justify-between gap-3"><div><p className="text-[10px] font-bold tracking-[0.08em] text-[#8c6d51]">{item.code}</p><p className="mt-1 text-xs font-semibold">{item.product}</p><p className="mt-1 text-[10px] text-muted-foreground">{item.units} · {item.stage}</p></div><p className="text-right text-[10px] text-muted-foreground">Entrega<span className="mt-1 block font-semibold text-foreground">{item.due}</span></p></div><div className="mt-3 flex items-center gap-3"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#e3ebe7]"><div className="h-full rounded-full bg-[#2c6a55]" style={{width:`${item.progress}%`}}/></div><span className="text-[10px] font-semibold">{item.progress}%</span></div></div></div></div>)}</div></section>
        </div>
      </div> : <ModuleView section={section} onBack={() => navigate('Resumen')} onAction={() => setQuickOpen(true)}/>} 
    </main>
    {quickOpen && <QuickRegister onClose={() => setQuickOpen(false)} onComplete={(label) => { setQuickOpen(false); showNotice(`${label} preparado como borrador. Confirma para afectar la operación.`); }}/>} 
    {notice && <output className="fixed bottom-5 right-5 z-[80] max-w-sm rounded-xl bg-[#183b31] px-4 py-3 text-xs font-medium text-white shadow-2xl">{notice}</output>}
  </div>;
}

function PanelHeader({ kicker, title, action }: { kicker: string; title: string; action: () => void }) { return <div className="panel-header"><div><p className="panel-kicker">{kicker}</p><h2 className="panel-title">{title}</h2></div><button onClick={action} className="view-all">Ver todos <ChevronRight/></button></div>; }

function ModuleView({ section, onBack, onAction }: { section: Exclude<Section,'Resumen'>; onBack: () => void; onAction: () => void }) {
  const data=modules[section]; const Icon=data.icon;
  return <div className="mx-auto max-w-[1450px] px-4 py-7 sm:px-7 lg:px-10 lg:py-9"><button onClick={onBack} className="mb-7 text-xs font-semibold text-muted-foreground hover:text-foreground">← Volver al resumen</button><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#9a775a]">{data.eyebrow}</p><h1 className="font-heading text-4xl font-semibold tracking-[-0.04em]">{data.title}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{data.description}</p></div><Button onClick={onAction} className="h-10 bg-[#1f4b3c] hover:bg-[#173b30]"><Plus/>Nuevo registro</Button></div><div className="mt-8 grid gap-5 lg:grid-cols-[1.4fr_0.6fr]"><section className="panel p-6"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-[#eee6da] text-[#806646]"><Icon/></span><div><p className="panel-kicker">Vista inicial</p><h2 className="panel-title">Actividad reciente</h2></div></div><div className="mt-6 divide-y rounded-xl border">{data.rows.map((row,index)=><button key={row} className="flex w-full items-center gap-4 px-4 py-4 text-left text-sm hover:bg-muted/30"><span className="font-mono text-[10px] text-muted-foreground">0{index+1}</span><span className="font-medium">{row}</span><ChevronRight className="ml-auto size-4 text-muted-foreground"/></button>)}</div></section><aside className="panel p-6"><BookOpen className="size-6 text-[#9a775a]"/><h2 className="mt-4 panel-title">Bloque Fundamentos</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">La estructura del módulo está lista. Las acciones que alteren inventario, costos o caja se habilitarán con reglas y eventos del Blueprint autoritativo.</p><Badge variant="outline" className="mt-5 border-[#ddc8b4] text-[#806646]">Implementación progresiva</Badge></aside></div></div>;
}

function QuickRegister({ onClose, onComplete }: { onClose:()=>void; onComplete:(label:string)=>void }) {
  const actions=[{label:'Nueva venta',detail:'Pedido, cliente y pago',icon:ShoppingBag},{label:'Nueva compra',detail:'Proveedor y recepción',icon:ShoppingCart},{label:'Orden de producción',detail:'BOM, lote y cantidad',icon:Factory},{label:'Ajuste de inventario',detail:'Movimiento con motivo',icon:Boxes},{label:'Registrar gasto',detail:'Cuenta y categoría',icon:FileText},{label:'Nuevo cliente',detail:'Contacto B2C o empresa',icon:UserRound}];
  return <dialog open className="fixed inset-0 z-[70] m-0 grid size-full max-h-none max-w-none place-items-center bg-[#14231e]/45 p-4 backdrop-blur-sm"><section aria-labelledby="quick-title" className="w-full max-w-xl rounded-2xl border bg-background p-5 text-foreground shadow-2xl sm:p-6"><div className="flex items-start justify-between"><div><p className="panel-kicker">Acción asistida</p><h2 id="quick-title" className="mt-1 font-heading text-2xl font-semibold">¿Qué quieres registrar?</h2><p className="mt-1 text-xs text-muted-foreground">La acción se prepara como borrador antes de confirmarse.</p></div><Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar"><X/></Button></div><div className="mt-5 grid gap-2 sm:grid-cols-2">{actions.map((a)=>{const Icon=a.icon;return <button key={a.label} onClick={()=>onComplete(a.label)} className="flex items-center gap-3 rounded-xl border p-3 text-left transition hover:border-[#b9916c] hover:bg-[#faf6f1]"><span className="grid size-10 place-items-center rounded-xl bg-[#eee6da] text-[#806646]"><Icon className="size-[18px]"/></span><span><strong className="block text-xs">{a.label}</strong><small className="mt-1 block text-[10px] text-muted-foreground">{a.detail}</small></span><ChevronRight className="ml-auto size-4 text-muted-foreground"/></button>})}</div><div className="mt-5 flex items-center gap-2 rounded-xl bg-[#f4f0e9] p-3 text-[10px] leading-4 text-[#6d5a48]"><PackageCheck className="size-4 shrink-0"/>Nada se publica ni afecta existencias sin confirmación humana explícita.</div></section></dialog>;
}

declare global { interface Document { modelContext?: { registerTool:(tool:unknown,options?:{signal?:AbortSignal})=>void|Promise<void> } } }
