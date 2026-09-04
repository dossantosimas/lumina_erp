import { asc, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from '@/db';
import {
  bomLines,
  bomVersions,
  categories,
  materials,
  products,
  productVariants,
  units,
} from '@/db/schema';
import { AccessError, authorize } from '@/lib/authorization';
import { AccessDenied } from '@/shared/components/access-denied';
import { CatalogWorkspace } from './workspace';

export const dynamic = 'force-dynamic';

export default async function CatalogPage() {
  try {
    await authorize(await headers(), 'catalog', 'view');
  } catch (error) {
    if (error instanceof AccessError && error.status === 401)
      redirect('/login');
    if (error instanceof AccessError) return <AccessDenied />;
    throw error;
  }
  const db = getDb();
  const [
    unitRows,
    categoryRows,
    materialRows,
    productRows,
    versionRows,
    lineRows,
  ] = await Promise.all([
    db
      .select({
        id: units.id,
        code: units.code,
        name: units.name,
        dimension: units.dimension,
        status: units.status,
      })
      .from(units)
      .orderBy(asc(units.name)),
    db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        status: categories.status,
      })
      .from(categories)
      .orderBy(asc(categories.name)),
    db
      .select({
        id: materials.id,
        sku: materials.sku,
        name: materials.name,
        unitId: materials.unitId,
        unit: units.code,
        standardCost: materials.standardCost,
        minimumStock: materials.minimumStock,
        status: materials.status,
      })
      .from(materials)
      .innerJoin(units, eq(materials.unitId, units.id))
      .orderBy(asc(materials.name)),
    db
      .select({
        id: products.id,
        variantId: productVariants.id,
        sku: productVariants.sku,
        name: products.name,
        variant: productVariants.name,
        unitId: products.baseUnitId,
        unit: units.code,
        categoryId: products.categoryId,
        category: categories.name,
        salePrice: products.salePrice,
        status: products.status,
      })
      .from(products)
      .innerJoin(productVariants, eq(productVariants.productId, products.id))
      .innerJoin(units, eq(products.baseUnitId, units.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .orderBy(asc(products.name)),
    db
      .select({
        id: bomVersions.id,
        productVariantId: bomVersions.productVariantId,
        product: products.name,
        version: bomVersions.version,
        status: bomVersions.status,
        expectedYield: bomVersions.expectedYield,
        estimatedCost: bomVersions.estimatedCost,
      })
      .from(bomVersions)
      .innerJoin(
        productVariants,
        eq(bomVersions.productVariantId, productVariants.id),
      )
      .innerJoin(products, eq(productVariants.productId, products.id))
      .orderBy(asc(products.name), asc(bomVersions.version)),
    db
      .select({
        bomVersionId: bomLines.bomVersionId,
        material: materials.name,
        quantity: bomLines.quantity,
        unit: units.code,
      })
      .from(bomLines)
      .innerJoin(materials, eq(bomLines.materialId, materials.id))
      .innerJoin(units, eq(bomLines.unitId, units.id)),
  ]);
  return (
    <CatalogWorkspace
      units={unitRows}
      categories={categoryRows}
      materials={materialRows}
      products={productRows}
      boms={versionRows.map((version) => ({
        ...version,
        lines: lineRows.filter((line) => line.bomVersionId === version.id),
      }))}
    />
  );
}
