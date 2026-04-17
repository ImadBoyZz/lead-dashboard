-- Fase 3: draft_status uitbreiden voor send pipeline states
-- Plan: ik-wil-mijn-lead-purring-tome.md §Schema wijzigingen.
--
-- Nieuwe states:
--   sending       = n8n pickte draft op, Resend call in flight
--   send_failed   = Resend gaf fout (transient) → kan retry
--   bounced       = hard bounce via Resend webhook → lead emailStatus=hard_bounced
--
-- Neon HTTP heeft geen DDL-in-transaction, stappen zijn idempotent.

-- ALTER TYPE kan niet met IF NOT EXISTS op Postgres < 16. Wrap in DO block.
DO $$ BEGIN
  ALTER TYPE draft_status ADD VALUE IF NOT EXISTS 'sending';
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE draft_status ADD VALUE IF NOT EXISTS 'send_failed';
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE draft_status ADD VALUE IF NOT EXISTS 'bounced';
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- Voorkomt dubbele actieve drafts per business (UI of batch-dedup bug-guard)
CREATE UNIQUE INDEX IF NOT EXISTS outreach_drafts_business_active_uniq
  ON outreach_drafts (business_id)
  WHERE status IN ('pending', 'approved', 'sending');

-- Index voor to-send query (pak oudste approved)
CREATE INDEX IF NOT EXISTS outreach_drafts_approved_created_idx
  ON outreach_drafts (created_at)
  WHERE status = 'approved';
