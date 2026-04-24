-- Autonomy Fase 2.5: auto-promote leads naar warm na enrichment.
-- Nieuwe kolom `auto_promoted_at` track of lead al eens door auto-promote
-- langs is gekomen. Zonder deze kolom zou een handmatige Triage-downgrade
-- (warm→cold) bij elke volgende qualification run weer overschreven worden.

ALTER TABLE "businesses"
  ADD COLUMN IF NOT EXISTS "auto_promoted_at" timestamp;

-- Partial index versnelt de generate-drafts candidate query (warm + never manually downgraded)
CREATE INDEX IF NOT EXISTS "businesses_auto_promoted_at_idx"
  ON "businesses" ("auto_promoted_at")
  WHERE "auto_promoted_at" IS NOT NULL;
