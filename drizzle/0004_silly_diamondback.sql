DROP INDEX "materials_sku_unique";--> statement-breakpoint
DROP INDEX "product_variants_sku_unique";--> statement-breakpoint
DROP INDEX "products_sku_unique";--> statement-breakpoint
ALTER TABLE "bom_versions" ALTER COLUMN "estimated_cost" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "bom_versions" ALTER COLUMN "estimated_cost" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "materials" ALTER COLUMN "standard_cost" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "materials" ALTER COLUMN "standard_cost" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "sale_price" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "sale_price" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "materials_sku_unique" ON "materials" USING btree (lower("sku"));--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_sku_unique" ON "product_variants" USING btree (lower("sku"));--> statement-breakpoint
CREATE UNIQUE INDEX "products_sku_unique" ON "products" USING btree (lower("sku"));