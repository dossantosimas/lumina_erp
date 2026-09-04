DROP INDEX "bom_active_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "bom_active_unique" ON "bom_versions" USING btree ("product_variant_id") WHERE "bom_versions"."status" = 'ACTIVE';