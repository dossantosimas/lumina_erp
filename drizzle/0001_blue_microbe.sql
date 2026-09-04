DROP INDEX "rate_limit_key_unique";--> statement-breakpoint
ALTER TABLE "rate_limit" DROP CONSTRAINT "rate_limit_pkey";--> statement-breakpoint
ALTER TABLE "rate_limit" ADD PRIMARY KEY ("key");--> statement-breakpoint
ALTER TABLE "rate_limit" ALTER COLUMN "last_request" SET DATA TYPE bigint USING (extract(epoch from "last_request") * 1000)::bigint;--> statement-breakpoint
ALTER TABLE "rate_limit" DROP COLUMN "id";
