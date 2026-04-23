-- Mini-Fase-1.0: open tracking via Resend email.opened webhook
ALTER TABLE "outreach_log" ADD COLUMN IF NOT EXISTS "opened_at" timestamp;
ALTER TABLE "outreach_log" ADD COLUMN IF NOT EXISTS "opened_count" integer DEFAULT 0 NOT NULL;
