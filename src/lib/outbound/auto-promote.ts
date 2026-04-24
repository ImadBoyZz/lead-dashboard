// Auto-promote leads van 'cold' naar 'warm' zodra alle enrichment-signalen
// binnen zijn en de criteria matchen. Wordt aangeroepen op het einde van
// /api/enrich/full/[id], na KBO + qualify + website + email.
//
// Design decisions:
//   - Atomic conditional UPDATE: WHERE-clause bevat alle criteria, zodat bij
//     race conditions (twee parallelle enrich-runs) maar één promotie slaagt.
//   - Idempotent via `auto_promoted_at IS NULL`: lead wordt maximaal 1x auto-
//     gepromoot. Als user handmatig naar cold terugzet via Triage blijft dat
//     staan — auto-promote draait niet opnieuw.
//   - Geen update van `lead_scores.disqualified`: NOT EXISTS subquery, zodat
//     hard-disqualified leads (franchise, IT-sector, modern site) nooit
//     automatisch warm worden.

import { sql as dsql } from 'drizzle-orm';
import { db } from '@/lib/db';

export type AutoPromoteStatus =
  | 'promoted'
  | 'already_promoted'
  | 'manually_set'
  | 'criteria_not_met'
  | 'not_found';

export interface AutoPromoteResult {
  status: AutoPromoteStatus;
  businessId: string;
}

/**
 * Criteria (alle moeten TRUE):
 *   - `lead_temperature = 'cold'` (nog niet gepromoot)
 *   - `auto_promoted_at IS NULL` (nog niet eerder auto-gepromoot)
 *   - `opt_out = false`, `blacklisted = false`
 *   - `website_verdict IN ('none', 'outdated', 'parked')` — sweet spot voor outreach
 *   - `email_status IN ('mx_valid', 'smtp_valid')` — werkende mailbox
 *   - `chain_classification NULL OR IN ('independent', 'unknown')` — geen franchise/chain/corporate
 *   - `google_business_status IS NULL OR != 'CLOSED_PERMANENTLY'`
 *   - geen `lead_scores.disqualified = true` entry
 */
export async function tryAutoPromote(businessId: string): Promise<AutoPromoteResult> {
  const result = await db.execute<{ id: string; lead_temperature: string }>(dsql`
    UPDATE businesses
    SET
      lead_temperature = 'warm',
      auto_promoted_at = NOW(),
      updated_at = NOW()
    WHERE id = ${businessId}
      AND lead_temperature = 'cold'
      AND auto_promoted_at IS NULL
      AND opt_out = false
      AND blacklisted = false
      AND website_verdict IN ('none', 'outdated', 'parked')
      AND email_status IN ('mx_valid', 'smtp_valid')
      AND (chain_classification IS NULL OR chain_classification IN ('independent', 'unknown'))
      AND (google_business_status IS NULL OR google_business_status != 'CLOSED_PERMANENTLY')
      AND NOT EXISTS (
        SELECT 1 FROM lead_scores
        WHERE lead_scores.business_id = businesses.id
          AND lead_scores.disqualified = true
      )
    RETURNING id, lead_temperature
  `);

  const rows = (result as { rows?: unknown[] }).rows ?? (result as unknown as unknown[]);
  const updated = Array.isArray(rows) && rows.length > 0;

  if (updated) {
    return { status: 'promoted', businessId };
  }

  // Niet gepromoot — stel vast waarom, zodat enrich-step dit in steps[] kan loggen
  const current = await db.execute<{
    lead_temperature: string;
    auto_promoted_at: Date | null;
  }>(dsql`
    SELECT lead_temperature, auto_promoted_at
    FROM businesses
    WHERE id = ${businessId}
    LIMIT 1
  `);
  const curRows = (current as { rows?: unknown[] }).rows ?? (current as unknown as unknown[]);
  const row = Array.isArray(curRows)
    ? (curRows[0] as { lead_temperature?: string; auto_promoted_at?: Date | null } | undefined)
    : null;

  if (!row) return { status: 'not_found', businessId };
  if (row.lead_temperature === 'warm' && row.auto_promoted_at) {
    return { status: 'already_promoted', businessId };
  }
  if (row.lead_temperature === 'warm' && !row.auto_promoted_at) {
    return { status: 'manually_set', businessId };
  }

  return { status: 'criteria_not_met', businessId };
}
