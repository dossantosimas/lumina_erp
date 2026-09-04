CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"sales_order_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"method" text NOT NULL,
	"financial_movement_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_amount_positive" CHECK ("payments"."amount" > 0)
);
--> statement-breakpoint
DROP INDEX "sales_orders_number_unique";--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_sales_order_id_sales_orders_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_financial_movement_id_financial_movements_id_fk" FOREIGN KEY ("financial_movement_id") REFERENCES "public"."financial_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_reference_unique" ON "payments" USING btree (lower("reference"));--> statement-breakpoint
CREATE UNIQUE INDEX "payments_financial_movement_unique" ON "payments" USING btree ("financial_movement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_reservation_source_unique" ON "inventory_reservations" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_order_line_variant_unique" ON "sales_order_lines" USING btree ("sales_order_id","product_variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_orders_number_unique" ON "sales_orders" USING btree (lower("number"));--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customer_type_valid" CHECK ("customers"."type" in ('B2C', 'B2B'));--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservation_quantity_positive" CHECK ("inventory_reservations"."quantity" > 0);--> statement-breakpoint
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_line_quantity_positive" CHECK ("sales_order_lines"."quantity" > 0);