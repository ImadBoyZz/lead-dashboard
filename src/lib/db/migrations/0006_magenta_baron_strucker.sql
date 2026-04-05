ALTER TABLE "businesses" ADD COLUMN "business_activity_status" text;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "last_known_activity_at" timestamp;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "website_healthy" boolean;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "website_last_checked_at" timestamp;--> statement-breakpoint
ALTER TABLE "lead_scores" ADD COLUMN "data_completeness" integer;--> statement-breakpoint
ALTER TABLE "lead_scores" ADD COLUMN "estimated_score" integer;