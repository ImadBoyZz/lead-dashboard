ALTER TABLE "audit_results" ADD COLUMN "has_google_ads_tag" boolean;--> statement-breakpoint
ALTER TABLE "audit_results" ADD COLUMN "has_social_media_links" boolean;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "recent_review_count" integer;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "review_velocity" real;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "google_photos_count_prev" integer;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "google_business_updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "has_google_ads" boolean;--> statement-breakpoint
ALTER TABLE "businesses" ADD COLUMN "has_social_media_links" boolean;