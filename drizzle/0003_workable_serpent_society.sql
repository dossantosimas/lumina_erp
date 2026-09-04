DROP INDEX "account_provider_unique";--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "issuer" text DEFAULT 'local:credential' NOT NULL;--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "issuer" DROP DEFAULT;--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_unique" ON "account" USING btree ("issuer","account_id");
