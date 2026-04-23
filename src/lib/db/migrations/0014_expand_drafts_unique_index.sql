-- Fase 1: dual-save vereist 2 actieve drafts per business
-- (variant_index 0 + 1, beide pending/approved/sending).
-- Breid guard uit: max 1 draft per (business, variant_index).

DROP INDEX IF EXISTS outreach_drafts_business_active_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS outreach_drafts_business_active_uniq
  ON outreach_drafts (business_id, variant_index)
  WHERE status IN ('pending', 'approved', 'sending');
