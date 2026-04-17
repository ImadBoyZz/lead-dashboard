-- KBO Fast-Path: staging tabellen + businesses.kbo* kolommen + dataSource enum waarde
-- Plan: C:\Users\bardi\.claude\plans\ik-heb-eigenlijk-een-merry-oasis.md
-- Idempotent (IF NOT EXISTS overal) zodat herhaalde runs veilig zijn.

-- ── pg_trgm extensie (Neon ondersteunt dit) ───────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── dataSource enum: 'kbo_bulk' toevoegen ─────────────────────────────
DO $$ BEGIN
  ALTER TYPE "public"."data_source" ADD VALUE IF NOT EXISTS 'kbo_bulk';
EXCEPTION WHEN others THEN NULL; END $$;

-- ── businesses: KBO match-velden (fast-path) ──────────────────────────
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "kbo_enterprise_number" text;
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "kbo_match_confidence" real;
ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "kbo_matched_at" timestamp;

CREATE INDEX IF NOT EXISTS "businesses_kbo_enterprise_number_idx"
  ON "businesses" ("kbo_enterprise_number");

-- ── kbo_enterprise ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "kbo_enterprise" (
  "enterprise_number" text PRIMARY KEY,
  "status" text,
  "juridical_situation" text,
  "type_of_enterprise" text,
  "juridical_form" text,
  "start_date" date
);
CREATE INDEX IF NOT EXISTS "kbo_enterprise_status_idx" ON "kbo_enterprise" ("status");

-- ── kbo_denomination ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "kbo_denomination" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  "entity_number" text NOT NULL,
  "language" text,
  "type_of_denomination" text,
  "denomination" text NOT NULL,
  "normalized_denomination" text NOT NULL
);
CREATE INDEX IF NOT EXISTS "kbo_denomination_entity_idx" ON "kbo_denomination" ("entity_number");
CREATE INDEX IF NOT EXISTS "kbo_denomination_normalized_idx" ON "kbo_denomination" ("normalized_denomination");
-- Trigram index voor fuzzy matching wordt pas aangemaakt wanneer exact-match recall <60%.
-- Reden: ~200MB index op 1.5M denominations overschrijdt Neon free tier 512MB quota.
-- Manueel aan te maken zodra je upgrade hebt OF match-rate onder 60% blijkt:
--   CREATE INDEX "kbo_denomination_trgm_idx"
--     ON "kbo_denomination" USING gin ("normalized_denomination" gin_trgm_ops);

-- ── kbo_activity ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "kbo_activity" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  "entity_number" text NOT NULL,
  "nace_version" text,
  "nace_code" text NOT NULL,
  "classification" text
);
CREATE INDEX IF NOT EXISTS "kbo_activity_entity_idx" ON "kbo_activity" ("entity_number");
CREATE INDEX IF NOT EXISTS "kbo_activity_classification_idx" ON "kbo_activity" ("classification");

-- ── kbo_address ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "kbo_address" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  "entity_number" text NOT NULL,
  "zipcode" text,
  "municipality" text,
  "street" text,
  "house_number" text,
  "province" text
);
CREATE INDEX IF NOT EXISTS "kbo_address_entity_idx" ON "kbo_address" ("entity_number");
CREATE INDEX IF NOT EXISTS "kbo_address_zipcode_idx" ON "kbo_address" ("zipcode");

-- ── kbo_snapshot (refresh-log) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "kbo_snapshot" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  "snapshot_date" date NOT NULL,
  "imported_at" timestamp DEFAULT now() NOT NULL,
  "enterprises_count" integer DEFAULT 0 NOT NULL,
  "denominations_count" integer DEFAULT 0 NOT NULL,
  "activities_count" integer DEFAULT 0 NOT NULL,
  "addresses_count" integer DEFAULT 0 NOT NULL,
  "duration_seconds" integer,
  "notes" text
);
