ALTER TABLE "inventory_movements" ALTER COLUMN "unit_cost" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "inventory_movements" ALTER COLUMN "unit_cost" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_reversal_unique" ON "inventory_movements" USING btree ("reversal_of_id") WHERE "inventory_movements"."reversal_of_id" is not null;