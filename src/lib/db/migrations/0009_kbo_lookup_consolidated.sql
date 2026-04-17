-- KBO consolidated lookup: vervang 4 staging tabellen door 1 gedenormaliseerde tabel.
-- Plan: ik-heb-eigenlijk-een-merry-oasis.md §Quota fix.
-- Reden: Neon 512MB quota werd 3x geraakt bij de 4-tabel aanpak door denomination + activity
-- duplicatie. In-memory joinen tijdens import geeft ~80MB totaal ipv ~500MB.

-- ── Drop oude staging tabellen (we behouden kbo_snapshot voor refresh-log) ──

DROP TABLE IF EXISTS "kbo_enterprise" CASCADE;
DROP TABLE IF EXISTS "kbo_denomination" CASCADE;
DROP TABLE IF EXISTS "kbo_activity" CASCADE;
DROP TABLE IF EXISTS "kbo_address" CASCADE;

-- ── Nieuwe kbo_lookup tabel ──

CREATE TABLE IF NOT EXISTS "kbo_lookup" (
  "enterprise_number" text PRIMARY KEY,
  "denomination" text NOT NULL,
  "normalized_denomination" text NOT NULL,
  "zipcode" text,
  "municipality" text,
  "province" text,
  "nace_code" text,
  "nace_version" text,
  "juridical_form" text,
  "juridical_situation" text,
  "type_of_enterprise" text,
  "start_date" date
);

CREATE INDEX IF NOT EXISTS "kbo_lookup_match_idx"
  ON "kbo_lookup" ("normalized_denomination", "zipcode");
CREATE INDEX IF NOT EXISTS "kbo_lookup_zipcode_idx"
  ON "kbo_lookup" ("zipcode");
