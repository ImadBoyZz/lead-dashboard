-- Autonomy Fase 1: batch_runs observability tabel.
-- Per n8n cron-run houden we input/output/skipped/error bij, plus cost.
-- Idempotency partial unique index voorkomt dubbele discover-runs bij retry-storms.

CREATE TABLE IF NOT EXISTS "batch_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "job_type" text NOT NULL,
  "run_date" date NOT NULL,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "finished_at" timestamp,
  "status" text DEFAULT 'running' NOT NULL,
  "input_count" integer,
  "output_count" integer,
  "skipped_reasons" jsonb,
  "error_message" text,
  "cost_eur" numeric(10,4),
  "metadata" jsonb
);

CREATE INDEX IF NOT EXISTS "batch_runs_job_date_idx"
  ON "batch_runs" ("job_type", "run_date" DESC);

CREATE INDEX IF NOT EXISTS "batch_runs_status_idx"
  ON "batch_runs" ("status");

-- Discover idempotency: 1 geslaagde run per (dag, sector, city). Bij n8n retry
-- na timeout krijgen we 23505 bij INSERT → endpoint behandelt als no-op.
CREATE UNIQUE INDEX IF NOT EXISTS "batch_runs_discover_idempotency_idx"
  ON "batch_runs" ("job_type", "run_date", ((metadata->>'sector')), ((metadata->>'city')))
  WHERE "job_type" = 'discover' AND "status" = 'ok';
