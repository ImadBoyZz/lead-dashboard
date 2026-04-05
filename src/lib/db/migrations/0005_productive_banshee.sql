CREATE TYPE "public"."outreach_outcome" AS ENUM('no_answer', 'voicemail', 'callback_requested', 'interested', 'not_interested', 'meeting_booked', 'wrong_contact', 'other');--> statement-breakpoint
CREATE TYPE "public"."rejection_reason" AS ENUM('no_budget', 'no_interest', 'has_supplier', 'bad_timing', 'no_response', 'other');--> statement-breakpoint
ALTER TABLE "lead_pipeline" ADD COLUMN "rejection_reason" "rejection_reason";--> statement-breakpoint
ALTER TABLE "lead_pipeline" ADD COLUMN "maturity_cluster" text;--> statement-breakpoint
ALTER TABLE "lead_pipeline" ADD COLUMN "frozen" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_pipeline" ADD COLUMN "frozen_at" timestamp;--> statement-breakpoint
ALTER TABLE "lead_pipeline" ADD COLUMN "won_value" real;--> statement-breakpoint
ALTER TABLE "outreach_log" ADD COLUMN "structured_outcome" "outreach_outcome";--> statement-breakpoint
CREATE INDEX "lead_pipeline_frozen_idx" ON "lead_pipeline" USING btree ("frozen");