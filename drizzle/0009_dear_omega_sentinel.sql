DROP INDEX "production_orders_number_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "production_consumption_material_unique" ON "production_consumptions" USING btree ("production_order_id","material_id");--> statement-breakpoint
CREATE UNIQUE INDEX "production_orders_number_unique" ON "production_orders" USING btree (lower("number"));--> statement-breakpoint
ALTER TABLE "production_consumptions" ADD CONSTRAINT "production_theoretical_quantity_positive" CHECK ("production_consumptions"."theoretical_quantity" > 0);--> statement-breakpoint
ALTER TABLE "production_consumptions" ADD CONSTRAINT "production_actual_quantity_positive" CHECK ("production_consumptions"."actual_quantity" > 0);--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_planned_quantity_positive" CHECK ("production_orders"."planned_quantity" > 0);--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_completed_quantity_valid" CHECK ("production_orders"."completed_quantity" >= 0);