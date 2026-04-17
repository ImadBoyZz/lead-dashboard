-- Fase 1: Classification, website verdict, franchise patterns, DLQ, daily batches, ground truth
-- Idempotent: Fase 0 kolommen (email_status enum etc.) zijn al via push toegevoegd, dus alles met IF NOT EXISTS
-- Reden: memory project_leaddashboard_automation_state.md documenteert dat Fase 0 geen migratie file had.

-- ── Enums ──────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "public"."email_status" AS ENUM('unverified','mx_valid','smtp_valid','hard_bounced','soft_bounced','complained','invalid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."chain_classification" AS ENUM('independent','franchise','chain','corporate','unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."website_verdict" AS ENUM('none','parked','outdated','acceptable','modern');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."email_source" AS ENUM('google_places','firecrawl','manual','none');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."franchise_pattern_match_type" AS ENUM('exact','contains_word','regex');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."dlq_enrichment_step" AS ENUM('qualify','website','email','generate');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── businesses uitbreiden (Fase 0 kolommen al aanwezig, Fase 1 nieuw) ──

ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "source_url" text;
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "source_captured_at" timestamp;
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "email_status" "email_status" DEFAULT 'unverified';
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "email_status_updated_at" timestamp;
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "opt_out_reason" text;

ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "email_source" "email_source" DEFAULT 'none';
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "chain_classification" "chain_classification" DEFAULT 'unknown';
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "chain_confidence" real;
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "chain_classified_at" timestamp;
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "chain_reason" text;
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "website_verdict" "website_verdict";
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "website_age_estimate" integer;
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "website_verdict_at" timestamp;
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "legitimate_interest_basis" text;

CREATE INDEX IF NOT EXISTS "businesses_chain_classification_idx" ON "businesses" ("chain_classification");
CREATE INDEX IF NOT EXISTS "businesses_website_verdict_idx" ON "businesses" ("website_verdict");

-- ── outreach_log Fase 0 kolommen (al in DB via push, idempotent) ──

ALTER TABLE "outreach_log" ADD COLUMN IF NOT EXISTS "resend_message_id" text;
ALTER TABLE "outreach_log" ADD COLUMN IF NOT EXISTS "unsubscribe_token" text;
ALTER TABLE "outreach_log" ADD COLUMN IF NOT EXISTS "delivery_status" text;
ALTER TABLE "outreach_log" ADD COLUMN IF NOT EXISTS "delivered_at" timestamp;
ALTER TABLE "outreach_log" ADD COLUMN IF NOT EXISTS "bounced_at" timestamp;
ALTER TABLE "outreach_log" ADD COLUMN IF NOT EXISTS "complained_at" timestamp;
CREATE INDEX IF NOT EXISTS "outreach_log_resend_message_idx" ON "outreach_log" ("resend_message_id");

-- ── system_settings (Fase 0, al in DB via push, idempotent) ──

CREATE TABLE IF NOT EXISTS "system_settings" (
  "key" text PRIMARY KEY NOT NULL,
  "value" jsonb NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "updated_by" text
);

-- ── franchise_patterns ──

CREATE TABLE IF NOT EXISTS "franchise_patterns" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  "pattern" text NOT NULL,
  "match_type" "franchise_pattern_match_type" NOT NULL,
  "classification" "chain_classification" DEFAULT 'franchise' NOT NULL,
  "reason" text,
  "enabled" boolean DEFAULT true NOT NULL,
  "added_at" timestamp DEFAULT now() NOT NULL,
  "added_by" text
);

CREATE INDEX IF NOT EXISTS "franchise_patterns_enabled_idx" ON "franchise_patterns" ("enabled");
CREATE UNIQUE INDEX IF NOT EXISTS "franchise_patterns_pattern_unique" ON "franchise_patterns" ("pattern","match_type");

-- ── daily_batches ──

CREATE TABLE IF NOT EXISTS "daily_batches" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  "run_date" date NOT NULL,
  "leads_processed" integer DEFAULT 0 NOT NULL,
  "qualified" integer DEFAULT 0 NOT NULL,
  "rejected" integer DEFAULT 0 NOT NULL,
  "cost_eur" real DEFAULT 0 NOT NULL,
  "duration_seconds" integer,
  "error_log" jsonb DEFAULT '[]'::jsonb,
  "max_sends_today" integer,
  "actual_sent" integer DEFAULT 0 NOT NULL,
  "deliverability_score" real,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS "daily_batches_run_date_unique" ON "daily_batches" ("run_date");
CREATE INDEX IF NOT EXISTS "daily_batches_run_date_idx" ON "daily_batches" ("run_date");

-- ── dlq_enrichments ──

CREATE TABLE IF NOT EXISTS "dlq_enrichments" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "step" "dlq_enrichment_step" NOT NULL,
  "error" text NOT NULL,
  "error_detail" jsonb,
  "attempt_count" integer DEFAULT 1 NOT NULL,
  "last_attempt_at" timestamp DEFAULT now() NOT NULL,
  "next_retry_at" timestamp,
  "resolved_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "dlq_enrichments_business_idx" ON "dlq_enrichments" ("business_id");
CREATE INDEX IF NOT EXISTS "dlq_enrichments_step_idx" ON "dlq_enrichments" ("step");
CREATE INDEX IF NOT EXISTS "dlq_enrichments_next_retry_idx" ON "dlq_enrichments" ("next_retry_at");
CREATE INDEX IF NOT EXISTS "dlq_enrichments_resolved_idx" ON "dlq_enrichments" ("resolved_at");

-- ── ground_truth_labels ──

CREATE TABLE IF NOT EXISTS "ground_truth_labels" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "expected_chain_classification" "chain_classification" NOT NULL,
  "expected_website_verdict" "website_verdict",
  "notes" text,
  "labeled_at" timestamp DEFAULT now() NOT NULL,
  "labeled_by" text DEFAULT 'imad' NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ground_truth_business_unique" ON "ground_truth_labels" ("business_id");
