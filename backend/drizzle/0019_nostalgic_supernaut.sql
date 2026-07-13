CREATE TYPE "public"."report_category" AS ENUM('spam', 'harassment', 'inappropriate_content', 'other');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'report_resolved';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'report_dismissed';--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "reason" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "category" "report_category" DEFAULT 'other' NOT NULL;