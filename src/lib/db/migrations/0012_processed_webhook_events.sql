-- Mini-Fase-1.0: idempotency tabel voor Resend webhook events.
-- svix_id is uniek per event - INSERT conflict (23505) signaleert duplicate retry.
CREATE TABLE IF NOT EXISTS "processed_webhook_events" (
  "svix_id" text PRIMARY KEY NOT NULL,
  "event_type" text NOT NULL,
  "received_at" timestamp DEFAULT now() NOT NULL
);
