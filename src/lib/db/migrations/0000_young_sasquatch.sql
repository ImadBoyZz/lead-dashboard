CREATE TYPE "public"."candidate_status" AS ENUM('pending', 'imported', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."country" AS ENUM('BE', 'NL');--> statement-breakpoint
CREATE TYPE "public"."data_source" AS ENUM('kbo_bulk', 'kvk_open', 'google_places', 'manual');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'contacted', 'replied', 'meeting', 'won', 'lost', 'disqualified');--> statement-breakpoint
CREATE TYPE "public"."outreach_channel" AS ENUM('email', 'phone', 'linkedin', 'whatsapp', 'in_person');--> statement-breakpoint
CREATE TYPE "public"."pipeline_stage" AS ENUM('new', 'researching', 'contacted', 'replied', 'meeting_booked', 'proposal_sent', 'negotiating', 'won', 'lost', 'not_qualified', 'nurture');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."reminder_status" AS ENUM('pending', 'completed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."reminder_type" AS ENUM('follow_up', 'call', 'meeting_prep', 'check_in', 'custom');--> statement-breakpoint
CREATE TABLE "audit_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"has_website" boolean,
	"website_url" text,
	"website_http_status" integer,
	"pagespeed_mobile_score" integer,
	"pagespeed_desktop_score" integer,
	"pagespeed_fcp" real,
	"pagespeed_lcp" real,
	"pagespeed_cls" real,
	"has_ssl" boolean,
	"ssl_expiry" timestamp,
	"ssl_issuer" text,
	"is_mobile_responsive" boolean,
	"has_viewport_meta" boolean,
	"detected_cms" text,
	"cms_version" text,
	"detected_technologies" jsonb DEFAULT '[]'::jsonb,
	"server_header" text,
	"powered_by" text,
	"has_google_analytics" boolean,
	"has_google_tag_manager" boolean,
	"has_facebook_pixel" boolean,
	"has_cookie_banner" boolean,
	"has_meta_description" boolean,
	"has_open_graph" boolean,
	"has_structured_data" boolean,
	"audited_at" timestamp DEFAULT now() NOT NULL,
	"audit_version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registry_id" text NOT NULL,
	"country" "country" NOT NULL,
	"name" text NOT NULL,
	"legal_form" text,
	"nace_code" text,
	"nace_description" text,
	"founded_date" date,
	"street" text,
	"house_number" text,
	"postal_code" text,
	"city" text,
	"province" text,
	"website" text,
	"email" text,
	"phone" text,
	"google_place_id" text,
	"google_rating" real,
	"google_review_count" integer,
	"data_source" "data_source" NOT NULL,
	"scraped_at" timestamp DEFAULT now() NOT NULL,
	"legal_basis" text DEFAULT 'legitimate_interest_b2b',
	"opt_out" boolean DEFAULT false NOT NULL,
	"opt_out_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "data_source" NOT NULL,
	"status" "import_status" DEFAULT 'running' NOT NULL,
	"total_records" integer DEFAULT 0,
	"new_records" integer DEFAULT 0,
	"updated_records" integer DEFAULT 0,
	"error_count" integer DEFAULT 0,
	"error_details" jsonb,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "import_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"batch_size" integer DEFAULT 50 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kbo_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registry_id" text NOT NULL,
	"name" text NOT NULL,
	"legal_form" text,
	"nace_code" text,
	"founded_date" date,
	"street" text,
	"house_number" text,
	"postal_code" text NOT NULL,
	"city" text,
	"province" text,
	"website" text,
	"email" text,
	"phone" text,
	"pre_score" integer DEFAULT 0 NOT NULL,
	"score_breakdown" jsonb DEFAULT '{}'::jsonb,
	"status" "candidate_status" DEFAULT 'pending' NOT NULL,
	"imported_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_pipeline" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"stage" "pipeline_stage" DEFAULT 'new' NOT NULL,
	"priority" "priority" DEFAULT 'medium' NOT NULL,
	"deal_value" real,
	"estimated_close_date" date,
	"next_follow_up_at" timestamp,
	"follow_up_note" text,
	"last_outreach_at" timestamp,
	"outreach_count" integer DEFAULT 0 NOT NULL,
	"stage_changed_at" timestamp DEFAULT now() NOT NULL,
	"lost_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lead_pipeline_business_id_unique" UNIQUE("business_id")
);
--> statement-breakpoint
CREATE TABLE "lead_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"total_score" integer DEFAULT 0 NOT NULL,
	"score_breakdown" jsonb DEFAULT '{}'::jsonb,
	"scored_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lead_scores_business_id_unique" UNIQUE("business_id")
);
--> statement-breakpoint
CREATE TABLE "lead_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"status_changed_at" timestamp DEFAULT now() NOT NULL,
	"contacted_at" timestamp,
	"contact_method" text,
	"replied_at" timestamp,
	"meeting_at" timestamp,
	"closed_at" timestamp,
	"closed_reason" text,
	CONSTRAINT "lead_statuses_business_id_unique" UNIQUE("business_id")
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"channel" "outreach_channel" NOT NULL,
	"subject" text,
	"content" text,
	"outcome" text,
	"contacted_at" timestamp DEFAULT now() NOT NULL,
	"duration_minutes" integer,
	"next_action" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"channel" "outreach_channel" NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"variables" jsonb DEFAULT '[]'::jsonb,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"type" "reminder_type" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"due_date" timestamp NOT NULL,
	"status" "reminder_status" DEFAULT 'pending' NOT NULL,
	"completed_at" timestamp,
	"auto_generated" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_results" ADD CONSTRAINT "audit_results_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_pipeline" ADD CONSTRAINT "lead_pipeline_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_scores" ADD CONSTRAINT "lead_scores_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_statuses" ADD CONSTRAINT "lead_statuses_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_log" ADD CONSTRAINT "outreach_log_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_history" ADD CONSTRAINT "status_history_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "businesses_registry_country_idx" ON "businesses" USING btree ("registry_id","country");--> statement-breakpoint
CREATE INDEX "businesses_country_idx" ON "businesses" USING btree ("country");--> statement-breakpoint
CREATE INDEX "businesses_postal_code_idx" ON "businesses" USING btree ("postal_code");--> statement-breakpoint
CREATE INDEX "businesses_nace_code_idx" ON "businesses" USING btree ("nace_code");--> statement-breakpoint
CREATE INDEX "businesses_opt_out_idx" ON "businesses" USING btree ("opt_out");--> statement-breakpoint
CREATE UNIQUE INDEX "kbo_candidates_registry_id_idx" ON "kbo_candidates" USING btree ("registry_id");--> statement-breakpoint
CREATE INDEX "kbo_candidates_status_idx" ON "kbo_candidates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "kbo_candidates_pre_score_idx" ON "kbo_candidates" USING btree ("pre_score");--> statement-breakpoint
CREATE INDEX "kbo_candidates_nace_code_idx" ON "kbo_candidates" USING btree ("nace_code");--> statement-breakpoint
CREATE INDEX "kbo_candidates_postal_code_idx" ON "kbo_candidates" USING btree ("postal_code");--> statement-breakpoint
CREATE INDEX "lead_pipeline_stage_idx" ON "lead_pipeline" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "lead_pipeline_priority_idx" ON "lead_pipeline" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "lead_pipeline_next_follow_up_idx" ON "lead_pipeline" USING btree ("next_follow_up_at");--> statement-breakpoint
CREATE INDEX "lead_scores_total_score_idx" ON "lead_scores" USING btree ("total_score");--> statement-breakpoint
CREATE INDEX "outreach_log_business_idx" ON "outreach_log" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "outreach_log_contacted_at_idx" ON "outreach_log" USING btree ("contacted_at");--> statement-breakpoint
CREATE INDEX "reminders_due_date_idx" ON "reminders" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "reminders_business_idx" ON "reminders" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "reminders_status_idx" ON "reminders" USING btree ("status");