'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Beaker,
  Boxes,
  Check,
  ClipboardList,
  Plus,
  Pencil,
  RotateCcw,
  Settings2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { IconAction, RecordModal } from '@/shared/components/record-modal';

type Unit = {
  id: string;
  code: string;
  name: string;
  dimension: string;
  status: string;
};
type Category = { id: string; name: string; slug: string; status: string };
type Material = {
  id: string;
  sku: string;
  name: string;
  unitId: string;
  unit: string;
  standardCost: string | null;
  minimumStock: string;
  status: string;
};
type Product = {
  id: string;
  variantId: string;
  sku: string;
  name: string;
  variant: string;
  unitId: string;
  unit: string;
  category: string | null;
  categoryId: string | null;
  salePrice: string | null;
  status: string;
};
type Bom = {
  id: string;
  productVariantId: string;
  product: string;
  version: number;
  status: string;
  expectedYield: string;
  estimatedCost: string | null;
  lines: {
    bomVersionId: string;
    material: string;
    quantity: string;
    unit: string;
  }[];
};
type Tab = 'Materiales' | 'Productos' | 'BOM' | 'Configuración';

async function mutate(url: string, body?: unknown, method = 'POST') {
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
  return result;
}

export function CatalogWorkspace({
  units,
  categories,
  materials,
  products,
  boms,
}: {
  units: Unit[];
  categories: Category[];
  materials: Material[];
  products: Product[];
  boms: Bom[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('Materiales');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState<Material | Product | null>(null);
  const [editingConfig, setEditingConfig] = useState<
    | { kind: 'unit'; record: Unit }
    | { kind: 'category'; record: Category }
    | null
  >(null);
  const [lines, setLines] = useState([
    { materialId: materials[0]?.id ?? '', quantity: 0, wastePct: 0 },
  ]);
  const estimated = useMemo(
    () =>
      lines.reduce((total, line) => {
        const material = materials.find((item) => item.id === line.materialId);
        return (
          total +
          line.quantity *
            Number(material?.standardCost ?? 0) *
            (1 + line.wastePct / 100)
        );
      }, 0),
    [lines, materials],
  );
  async function submit(
    url: string,
    body: unknown,
    success: string,
    method = 'POST',
  ) {
    setPending(true);
    setError('');
    setMessage('');
    try {
      await mutate(url, body, method);
      setMessage(success);
      setEditing(null);
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
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <Link
              href="/"
              className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
              Volver al resumen
            </Link>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-[#9a775a]">
              Fundamentos operativos
            </p>
            <h1 className="mt-2 font-heading text-4xl font-semibold">
              Catálogo y recetas
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Datos reales, trazables y listos para inventario y producción.
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border bg-background px-3 py-2 text-xs">
            <Sparkles className="size-4 text-[#9a775a]" />
            {materials.length} materiales · {products.length} productos ·{' '}
            {boms.length} versiones
          </span>
        </div>
        <div className="mt-8 flex gap-2 rounded-2xl border bg-background p-2">
          {(['Materiales', 'Productos', 'BOM', 'Configuración'] as Tab[]).map(
            (item) => (
              <button
                key={item}
                onClick={() => setTab(item)}
                className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold ${tab === item ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted'}`}
              >
                {item}
              </button>
            ),
          )}
        </div>
        {(message || error) && (
          <output
            className={`mt-4 rounded-xl p-3 text-sm ${error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}
          >
            {error || message}
          </output>
        )}
        {tab === 'Materiales' && (
          <div className="mt-5 grid gap-5 xl:grid-cols-[.72fr_1.28fr]">
            <Panel icon={Beaker} title="Nuevo material">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  void submit(
                    '/api/v1/materials',
                    {
                      sku: data.get('sku'),
                      name: data.get('name'),
                      unitId: data.get('unitId'),
                      standardCost: data.get('standardCost')
                        ? Number(data.get('standardCost'))
                        : null,
                      minimumStock: Number(data.get('minimumStock') || 0),
                    },
                    'Material creado.',
                  );
                }}
                className="form-grid"
              >
                <Field name="sku" label="SKU" required />
                <Field name="name" label="Nombre" required />
                <Select
                  name="unitId"
                  label="Unidad"
                  options={units
                    .filter((u) => u.status === 'ACTIVE')
                    .map((u) => [u.id, `${u.name} (${u.code})`])}
                />
                <Field
                  name="standardCost"
                  label="Costo conocido"
                  type="number"
                  step="0.01"
                />
                <Field
                  name="minimumStock"
                  label="Stock mínimo"
                  type="number"
                  step="0.000001"
                />
                <Submit pending={pending} />
              </form>
            </Panel>
            <Table
              title="Materiales"
              empty="Aún no hay materiales."
              headers={[
                'SKU',
                'Material',
                'Unidad',
                'Costo',
                'Mínimo',
                'Estado',
                'Acciones',
              ]}
              rows={materials.map((item) => [
                item.sku,
                item.name,
                item.unit,
                cop(item.standardCost),
                item.minimumStock,
                item.status,
                <div key="actions" className="flex gap-2">
                  <IconAction
                    label={`Editar ${item.name}`}
                    onClick={() => setEditing(item)}
                  >
                    <Pencil className="size-4" />
                  </IconAction>
                  {item.status === 'INACTIVE' ? (
                    <IconAction
                      label={`Restaurar ${item.name}`}
                      disabled={pending}
                      onClick={() =>
                        void submit(
                          `/api/v1/materials/${item.id}`,
                          { active: true },
                          'Material restaurado.',
                          'PATCH',
                        )
                      }
                    >
                      <RotateCcw className="size-4" />
                    </IconAction>
                  ) : (
                    <IconAction
                      label={`Desactivar ${item.name}`}
                      tone="danger"
                      disabled={pending}
                      onClick={() => {
                        const reason = window.prompt(
                          'Motivo de la desactivación:',
                        );
                        if (reason)
                          void submit(
                            `/api/v1/materials/${item.id}`,
                            { reason },
                            'Material desactivado.',
                            'DELETE',
                          );
                      }}
                    >
                      <Trash2 className="size-4" />
                    </IconAction>
                  )}
                </div>,
              ])}
            />
          </div>
        )}
        {tab === 'Productos' && (
          <div className="mt-5 grid gap-5 xl:grid-cols-[.72fr_1.28fr]">
            <Panel icon={Boxes} title="Nuevo producto">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  void submit(
                    '/api/v1/products',
                    {
                      sku: data.get('sku'),
                      name: data.get('name'),
                      baseUnitId: data.get('baseUnitId'),
                      categoryId: data.get('categoryId') || null,
                      salePrice: data.get('salePrice')
                        ? Number(data.get('salePrice'))
                        : null,
                    },
                    'Producto creado como pendiente de BOM.',
                  );
                }}
                className="form-grid"
              >
                <Field name="sku" label="SKU" required />
                <Field name="name" label="Nombre" required />
                <Select
                  name="baseUnitId"
                  label="Unidad de venta"
                  options={units
                    .filter((u) => u.status === 'ACTIVE')
                    .map((u) => [u.id, `${u.name} (${u.code})`])}
                />
                <Select
                  name="categoryId"
                  label="Categoría"
                  optional
                  options={categories
                    .filter((c) => c.status === 'ACTIVE')
                    .map((c) => [c.id, c.name])}
                />
                <Field
                  name="salePrice"
                  label="Precio de venta"
                  type="number"
                  step="0.01"
                />
                <Submit pending={pending} />
              </form>
            </Panel>
            <Table
              title="Productos y variantes"
              empty="Aún no hay productos."
              headers={[
                'SKU',
                'Producto',
                'Variante',
                'Categoría',
                'Precio',
                'Estado',
                'Acciones',
              ]}
              rows={products.map((item) => [
                item.sku,
                item.name,
                item.variant,
                item.category ?? 'Sin categoría',
                cop(item.salePrice),
                item.status,
                <div key="actions" className="flex gap-2">
                  <IconAction
                    label={`Editar ${item.name}`}
                    onClick={() => setEditing(item)}
                  >
                    <Pencil className="size-4" />
                  </IconAction>
                  {item.status === 'INACTIVE' ? (
                    <IconAction
                      label={`Restaurar ${item.name}`}
                      disabled={pending}
                      onClick={() =>
                        void submit(
                          `/api/v1/products/${item.id}`,
                          { active: true },
                          'Producto restaurado como pendiente de BOM.',
                          'PATCH',
                        )
                      }
                    >
                      <RotateCcw className="size-4" />
                    </IconAction>
                  ) : (
                    <IconAction
                      label={`Desactivar ${item.name}`}
                      tone="danger"
                      disabled={pending}
                      onClick={() => {
                        const reason = window.prompt(
                          'Motivo de la desactivación:',
                        );
                        if (reason)
                          void submit(
                            `/api/v1/products/${item.id}`,
                            { reason },
                            'Producto desactivado.',
                            'DELETE',
                          );
                      }}
                    >
                      <Trash2 className="size-4" />
                    </IconAction>
                  )}
                </div>,
              ])}
            />
          </div>
        )}
        {tab === 'BOM' && (
          <div className="mt-5 grid gap-5 xl:grid-cols-[.85fr_1.15fr]">
            <Panel icon={ClipboardList} title="Nueva versión BOM">
              {products.length === 0 || materials.length === 0 ? (
                <Empty text="Crea al menos un producto y un material antes de formular una BOM." />
              ) : (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    void submit(
                      '/api/v1/boms',
                      {
                        productVariantId: data.get('productVariantId'),
                        expectedYield: Number(data.get('expectedYield')),
                        standardWastePct: Number(
                          data.get('standardWastePct') || 0,
                        ),
                        lines: lines.map((line) => ({
                          ...line,
                          unitId: materials.find(
                            (material) => material.id === line.materialId,
                          )?.unitId,
                        })),
                      },
                      'Nueva versión BOM creada en borrador.',
                    );
                  }}
                  className="form-grid"
                >
                  <Select
                    name="productVariantId"
                    label="Producto"
                    options={products
                      .filter((p) => p.status !== 'INACTIVE')
                      .map((p) => [p.variantId, `${p.name} · ${p.variant}`])}
                  />
                  <Field
                    name="expectedYield"
                    label="Rendimiento esperado"
                    type="number"
                    step="0.000001"
                    required
                  />
                  <Field
                    name="standardWastePct"
                    label="Merma estándar %"
                    type="number"
                    step="0.01"
                  />
                  <div className="col-span-full space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">Componentes</span>
                      <button
                        type="button"
                        onClick={() =>
                          setLines([
                            ...lines,
                            {
                              materialId: materials[0]?.id ?? '',
                              quantity: 0,
                              wastePct: 0,
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
                        className="grid grid-cols-[1fr_100px_80px_32px] gap-2"
                      >
                        <select
                          value={line.materialId}
                          onChange={(e) =>
                            setLines(
                              lines.map((item, i) =>
                                i === index
                                  ? { ...item, materialId: e.target.value }
                                  : item,
                              ),
                            )
                          }
                          className="input"
                        >
                          <option value="">Selecciona material</option>
                          {materials
                            .filter((m) => m.status === 'ACTIVE')
                            .map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name} ({m.unit})
                              </option>
                            ))}
                        </select>
                        <input
                          aria-label="Cantidad"
                          type="number"
                          min="0.000001"
                          step="0.000001"
                          value={line.quantity || ''}
                          onChange={(e) =>
                            setLines(
                              lines.map((item, i) =>
                                i === index
                                  ? {
                                      ...item,
                                      quantity: Number(e.target.value),
                                    }
                                  : item,
                              ),
                            )
                          }
                          className="input"
                          placeholder="Cantidad"
                        />
                        <input
                          aria-label="Merma"
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={line.wastePct}
                          onChange={(e) =>
                            setLines(
                              lines.map((item, i) =>
                                i === index
                                  ? {
                                      ...item,
                                      wastePct: Number(e.target.value),
                                    }
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
                          className="grid place-items-center text-muted-foreground disabled:opacity-30"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="col-span-full rounded-xl bg-[#f4f0e9] p-3 text-xs">
                    <span className="text-muted-foreground">
                      Costo estimado antes de rendimiento:
                    </span>{' '}
                    <b>{cop(String(estimated))}</b>
                  </div>
                  <Submit pending={pending} />
                </form>
              )}
            </Panel>
            <section className="panel overflow-hidden">
              <div className="border-b p-5">
                <h2 className="font-heading text-xl font-semibold">
                  Versiones BOM
                </h2>
              </div>
              {boms.length === 0 ? (
                <Empty text="Aún no hay recetas." />
              ) : (
                <div className="divide-y">
                  {boms.map((bom) => (
                    <article key={bom.id} className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold">
                            {bom.product} · v{bom.version}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Rendimiento {bom.expectedYield} · costo unitario{' '}
                            {cop(bom.estimatedCost)}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${bom.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}
                        >
                          {bom.status}
                        </span>
                      </div>
                      <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                        {bom.lines.map((line) => (
                          <li key={`${bom.id}-${line.material}`}>
                            {line.material}: {line.quantity} {line.unit}
                          </li>
                        ))}
                      </ul>
                      {bom.status === 'DRAFT' && (
                        <div className="mt-4 flex gap-2">
                          <button
                            disabled={pending}
                            onClick={() =>
                              void submit(
                                `/api/v1/boms/${bom.id}/activate`,
                                undefined,
                                'BOM activada; el producto ya puede pasar a producción.',
                              )
                            }
                            className="inline-flex items-center gap-2 rounded-lg bg-[#1f4b3c] px-3 py-2 text-xs font-semibold text-white"
                          >
                            <Check className="size-4" /> Activar versión
                          </button>
                          <IconAction
                            label={`Descartar BOM v${bom.version}`}
                            tone="danger"
                            disabled={pending}
                            onClick={() => {
                              const reason = window.prompt(
                                'Motivo para descartar este borrador:',
                              );
                              if (reason)
                                void submit(
                                  `/api/v1/boms/${bom.id}`,
                                  { reason },
                                  'BOM en borrador descartada.',
                                  'DELETE',
                                );
                            }}
                          >
                            <Trash2 className="size-4" />
                          </IconAction>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
        {tab === 'Configuración' && (
          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <Panel icon={Settings2} title="Unidades de medida">
              <form
                className="form-grid"
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  void submit(
                    '/api/v1/units',
                    {
                      code: data.get('code'),
                      name: data.get('name'),
                      dimension: data.get('dimension'),
                    },
                    'Unidad creada.',
                  );
                }}
              >
                <Field name="code" label="Código" required />
                <Field name="name" label="Nombre" required />
                <label className="text-xs font-semibold">
                  Dimensión
                  <select name="dimension" className="input mt-2">
                    <option value="MASS">Masa</option>
                    <option value="VOLUME">Volumen</option>
                    <option value="COUNT">Conteo</option>
                    <option value="LENGTH">Longitud</option>
                  </select>
                </label>
                <Submit pending={pending} />
              </form>
              <div className="mt-5 divide-y border-t">
                {units.map((unit) => (
                  <div
                    key={unit.id}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold">
                        {unit.name} ({unit.code})
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {unit.dimension} · {unit.status}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <IconAction
                        label={`Editar ${unit.name}`}
                        onClick={() =>
                          setEditingConfig({ kind: 'unit', record: unit })
                        }
                      >
                        <Pencil className="size-4" />
                      </IconAction>
                      {unit.status === 'INACTIVE' ? (
                        <IconAction
                          label={`Restaurar ${unit.name}`}
                          onClick={() =>
                            void submit(
                              `/api/v1/units/${unit.id}`,
                              { active: true },
                              'Unidad restaurada.',
                              'PATCH',
                            )
                          }
                        >
                          <RotateCcw className="size-4" />
                        </IconAction>
                      ) : (
                        <IconAction
                          label={`Desactivar ${unit.name}`}
                          tone="danger"
                          onClick={() => {
                            const reason = window.prompt(
                              'Motivo de la desactivación:',
                            );
                            if (reason)
                              void submit(
                                `/api/v1/units/${unit.id}`,
                                { reason },
                                'Unidad desactivada.',
                                'DELETE',
                              );
                          }}
                        >
                          <Trash2 className="size-4" />
                        </IconAction>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel icon={Settings2} title="Categorías">
              <form
                className="form-grid"
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  void submit(
                    '/api/v1/categories',
                    { name: data.get('name'), slug: data.get('slug') },
                    'Categoría creada.',
                  );
                }}
              >
                <Field name="name" label="Nombre" required />
                <Field
                  name="slug"
                  label="Identificador"
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  placeholder="velas-aromaticas"
                  required
                />
                <Submit pending={pending} />
              </form>
              <div className="mt-5 divide-y border-t">
                {categories.map((category) => (
                  <div
                    key={category.id}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold">{category.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {category.slug} · {category.status}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <IconAction
                        label={`Editar ${category.name}`}
                        onClick={() =>
                          setEditingConfig({
                            kind: 'category',
                            record: category,
                          })
                        }
                      >
                        <Pencil className="size-4" />
                      </IconAction>
                      {category.status === 'INACTIVE' ? (
                        <IconAction
                          label={`Restaurar ${category.name}`}
                          onClick={() =>
                            void submit(
                              `/api/v1/categories/${category.id}`,
                              { active: true },
                              'Categoría restaurada.',
                              'PATCH',
                            )
                          }
                        >
                          <RotateCcw className="size-4" />
                        </IconAction>
                      ) : (
                        <IconAction
                          label={`Desactivar ${category.name}`}
                          tone="danger"
                          onClick={() => {
                            const reason = window.prompt(
                              'Motivo de la desactivación:',
                            );
                            if (reason)
                              void submit(
                                `/api/v1/categories/${category.id}`,
                                { reason },
                                'Categoría desactivada.',
                                'DELETE',
                              );
                          }}
                        >
                          <Trash2 className="size-4" />
                        </IconAction>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        )}
      </div>
      {editing && 'minimumStock' in editing && (
        <RecordModal title="Editar material" onClose={() => setEditing(null)}>
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void submit(
                `/api/v1/materials/${editing.id}`,
                {
                  sku: data.get('sku'),
                  name: data.get('name'),
                  unitId: data.get('unitId'),
                  standardCost: data.get('standardCost')
                    ? Number(data.get('standardCost'))
                    : null,
                  minimumStock: Number(data.get('minimumStock') || 0),
                },
                'Material actualizado.',
                'PATCH',
              );
            }}
          >
            <Field name="sku" label="SKU" defaultValue={editing.sku} required />
            <Field
              name="name"
              label="Nombre"
              defaultValue={editing.name}
              required
            />
            <Select
              name="unitId"
              label="Unidad"
              defaultValue={editing.unitId}
              options={units.map((u) => [u.id, `${u.name} (${u.code})`])}
            />
            <Field
              name="standardCost"
              label="Costo conocido"
              type="number"
              step="0.01"
              defaultValue={editing.standardCost ?? ''}
            />
            <Field
              name="minimumStock"
              label="Stock mínimo"
              type="number"
              step="0.000001"
              defaultValue={editing.minimumStock}
            />
            <Submit pending={pending} />
          </form>
        </RecordModal>
      )}
      {editing && 'variantId' in editing && (
        <RecordModal title="Editar producto" onClose={() => setEditing(null)}>
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void submit(
                `/api/v1/products/${editing.id}`,
                {
                  sku: data.get('sku'),
                  name: data.get('name'),
                  categoryId: data.get('categoryId') || null,
                  salePrice: data.get('salePrice')
                    ? Number(data.get('salePrice'))
                    : null,
                },
                'Producto actualizado.',
                'PATCH',
              );
            }}
          >
            <Field name="sku" label="SKU" defaultValue={editing.sku} required />
            <Field
              name="name"
              label="Nombre"
              defaultValue={editing.name}
              required
            />
            <Select
              name="categoryId"
              label="Categoría"
              optional
              defaultValue={editing.categoryId ?? ''}
              options={categories.map((c) => [c.id, c.name])}
            />
            <Field
              name="salePrice"
              label="Precio de venta"
              type="number"
              step="0.01"
              defaultValue={editing.salePrice ?? ''}
            />
            <Submit pending={pending} />
          </form>
        </RecordModal>
      )}
      {editingConfig?.kind === 'unit' && (
        <RecordModal
          title="Editar unidad"
          onClose={() => setEditingConfig(null)}
        >
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void submit(
                `/api/v1/units/${editingConfig.record.id}`,
                {
                  code: data.get('code'),
                  name: data.get('name'),
                  dimension: data.get('dimension'),
                },
                'Unidad actualizada.',
                'PATCH',
              );
              setEditingConfig(null);
            }}
          >
            <Field
              name="code"
              label="Código"
              defaultValue={editingConfig.record.code}
              required
            />
            <Field
              name="name"
              label="Nombre"
              defaultValue={editingConfig.record.name}
              required
            />
            <label className="text-xs font-semibold">
              Dimensión
              <select
                name="dimension"
                defaultValue={editingConfig.record.dimension}
                className="input mt-2"
              >
                <option value="MASS">Masa</option>
                <option value="VOLUME">Volumen</option>
                <option value="COUNT">Conteo</option>
                <option value="LENGTH">Longitud</option>
              </select>
            </label>
            <Submit pending={pending} />
          </form>
        </RecordModal>
      )}
      {editingConfig?.kind === 'category' && (
        <RecordModal
          title="Editar categoría"
          onClose={() => setEditingConfig(null)}
        >
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void submit(
                `/api/v1/categories/${editingConfig.record.id}`,
                { name: data.get('name'), slug: data.get('slug') },
                'Categoría actualizada.',
                'PATCH',
              );
              setEditingConfig(null);
            }}
          >
            <Field
              name="name"
              label="Nombre"
              defaultValue={editingConfig.record.name}
              required
            />
            <Field
              name="slug"
              label="Identificador"
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              defaultValue={editingConfig.record.slug}
              required
            />
            <Submit pending={pending} />
          </form>
        </RecordModal>
      )}
    </main>
  );
}

function Panel({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Beaker;
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
function Select({
  label,
  name,
  options,
  optional,
  defaultValue,
}: {
  label: string;
  name: string;
  options: [string, string][];
  optional?: boolean;
  defaultValue?: string;
}) {
  return (
    <label className="text-xs font-semibold">
      {label}
      <select
        name={name}
        required={!optional}
        defaultValue={defaultValue}
        className="input mt-2"
      >
        {optional && <option value="">Sin categoría</option>}
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
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
function Table({
  title,
  headers,
  rows,
  empty,
}: {
  title: string;
  headers: string[];
  rows: React.ReactNode[][];
  empty: string;
}) {
  return (
    <section className="panel overflow-hidden">
      <div className="border-b p-5">
        <h2 className="font-heading text-xl font-semibold">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <Empty text={empty} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-left text-xs">
            <thead>
              <tr className="border-b bg-muted/40">
                {headers.map((header) => (
                  <th key={header} className="px-4 py-3 font-semibold">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="border-b last:border-0">
                  {row.map((cell, i) => (
                    <td key={i} className="px-4 py-3">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="p-8 text-center text-sm text-muted-foreground">{text}</div>
  );
}
function cop(value: string | null) {
  if (value === null) return 'Pendiente';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(value));
}
