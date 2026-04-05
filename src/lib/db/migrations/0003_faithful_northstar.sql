ALTER TABLE "import_profiles" ALTER COLUMN "batch_size" SET DEFAULT 20;--> statement-breakpoint
ALTER TABLE "kbo_candidates" ADD COLUMN "google_review_count" integer;--> statement-breakpoint
ALTER TABLE "kbo_candidates" ADD COLUMN "google_rating" real;--> statement-breakpoint
ALTER TABLE "kbo_candidates" ADD COLUMN "has_google_business_profile" boolean;--> statement-breakpoint
ALTER TABLE "kbo_candidates" ADD COLUMN "google_business_status" text;--> statement-breakpoint
ALTER TABLE "lead_scores" ADD COLUMN "maturity_cluster" text;--> statement-breakpoint
ALTER TABLE "lead_scores" ADD COLUMN "disqualified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_scores" ADD COLUMN "disqualify_reason" text;