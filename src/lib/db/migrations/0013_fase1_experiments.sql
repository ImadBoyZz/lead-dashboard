-- Fase 1: experiments + reply_classifications + sequence_queue.
-- Additieve migratie - geen breaking changes op bestaande tabellen.

-- ── Enums ───────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "experiment_status" AS ENUM ('running', 'paused', 'concluded');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "reply_classification" AS ENUM ('positive', 'negative', 'unsubscribe', 'auto_reply', 'unclear');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "sequence_queue_status" AS ENUM ('pending', 'sent', 'skipped', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ── experiments ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "experiments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "test_variant" text NOT NULL,
  "control_variant" text NOT NULL,
  "split_percentage" integer DEFAULT 70 NOT NULL,
  "hypothesis" text,
  "expected_reply_rate" numeric(4,3),
  "min_sample_size" integer,
  "target_sends" integer,
  "starts_at" timestamp NOT NULL,
  "ends_at" timestamp,
  "status" "experiment_status" DEFAULT 'running' NOT NULL,
  "conclusion" text,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "experiments_status_starts_at_idx"
  ON "experiments" ("status", "starts_at");

-- ── reply_classifications ───────────────────────────────
CREATE TABLE IF NOT EXISTS "reply_classifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "outreach_log_id" uuid NOT NULL REFERENCES "outreach_log"("id") ON DELETE CASCADE,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "classification" "reply_classification" NOT NULL,
  "subtype" text,
  "reply_text" text,
  "received_at" timestamp NOT NULL,
  "classified_by" text DEFAULT 'human' NOT NULL,
  "ai_confidence" numeric(3,2),
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "reply_classifications_business_received_idx"
  ON "reply_classifications" ("business_id", "received_at");
CREATE INDEX IF NOT EXISTS "reply_classifications_classification_received_idx"
  ON "reply_classifications" ("classification", "received_at");
CREATE INDEX IF NOT EXISTS "reply_classifications_outreach_log_idx"
  ON "reply_classifications" ("outreach_log_id");

-- ── sequence_queue ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "sequence_queue" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "business_id" uuid NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "experiment_id" uuid NOT NULL REFERENCES "experiments"("id") ON DELETE RESTRICT,
  "give_first_variant" text NOT NULL,
  "sequence_step" integer NOT NULL,
  "scheduled_for" timestamp NOT NULL,
  "status" "sequence_queue_status" DEFAULT 'pending' NOT NULL,
  "sent_outreach_log_id" uuid REFERENCES "outreach_log"("id") ON DELETE SET NULL,
  "skip_reason" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "sequence_queue_status_scheduled_idx"
  ON "sequence_queue" ("status", "scheduled_for");
CREATE INDEX IF NOT EXISTS "sequence_queue_business_step_idx"
  ON "sequence_queue" ("business_id", "sequence_step");
CREATE INDEX IF NOT EXISTS "sequence_queue_experiment_status_idx"
  ON "sequence_queue" ("experiment_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "sequence_queue_business_experiment_step_uniq"
  ON "sequence_queue" ("business_id", "experiment_id", "sequence_step");

-- ── outreach_drafts: experiment_id + give_first_variant ─
ALTER TABLE "outreach_drafts" ADD COLUMN IF NOT EXISTS "experiment_id" uuid;
ALTER TABLE "outreach_drafts" ADD COLUMN IF NOT EXISTS "give_first_variant" text;

DO $$ BEGIN
  ALTER TABLE "outreach_drafts" ADD CONSTRAINT "outreach_drafts_experiment_id_fkey"
    FOREIGN KEY ("experiment_id") REFERENCES "experiments"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "outreach_drafts_experiment_idx"
  ON "outreach_drafts" ("experiment_id", "give_first_variant");

-- ── Default Cadence experiment (static UUID, voor ad-hoc sends) ──
INSERT INTO "experiments" (
  "id", "name", "test_variant", "control_variant", "split_percentage",
  "starts_at", "status", "notes"
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Default Cadence',
  'control',
  'control',
  100,
  NOW(),
  'running',
  'Auto-aangemaakt door migratie 0013. Gebruikt voor ad-hoc sends die niet onder een variant-test experiment vallen. NIET DELETEN - sequence_queue rijen kunnen hier op verwijzen.'
) ON CONFLICT ("id") DO NOTHING;
