CREATE TYPE "public"."invitation_email_status" AS ENUM('PENDING', 'SENT', 'FAILED', 'ACCEPTED');--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "email_status" "invitation_email_status" DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "last_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "provider_message_id" text;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "last_error" text;
--> statement-breakpoint
UPDATE "invitations"
SET "email_status" = 'ACCEPTED'
WHERE "accepted_at" IS NOT NULL;
