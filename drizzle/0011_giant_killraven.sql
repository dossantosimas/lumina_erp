CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"account_id" uuid NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"financial_movement_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"reversed_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_amount_positive" CHECK ("expenses"."amount" > 0)
);
--> statement-breakpoint
DROP INDEX "financial_accounts_code_unique";--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "reversed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_financial_movement_id_financial_movements_id_fk" FOREIGN KEY ("financial_movement_id") REFERENCES "public"."financial_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_reference_unique" ON "expenses" USING btree (lower("reference"));--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_financial_movement_unique" ON "expenses" USING btree ("financial_movement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_reversal_unique" ON "financial_movements" USING btree ("reversal_of_id") WHERE "financial_movements"."reversal_of_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "financial_accounts_code_unique" ON "financial_accounts" USING btree (lower("code"));--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_account_type_valid" CHECK ("financial_accounts"."type" in ('CASH', 'BANK', 'WALLET', 'OTHER'));--> statement-breakpoint
ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movement_type_valid" CHECK ("financial_movements"."type" in ('INCOME', 'EXPENSE', 'REVERSAL'));--> statement-breakpoint
ALTER TABLE "financial_movements" ADD CONSTRAINT "financial_movement_amount_nonzero" CHECK ("financial_movements"."amount" <> 0);