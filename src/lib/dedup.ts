// Hard dedup gates: voorkom dat we dezelfde business of hetzelfde domein binnen
// een bepaalde window opnieuw aanschrijven. Plan C:\Users\bardi\.claude\plans\ik-wil-mijn-lead-purring-tome.md §critical files.

import { and, eq, gte, or, sql as dsql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DedupCheck {
  contacted: boolean;
  reason?: string;
  lastContactedAt?: Date;
}

/**
 * True wanneer deze business in de laatste `days` dagen al aangeschreven is
 * via outreach_log OF een actieve (pending/approved/sent) draft heeft.
 */
export async function alreadyContactedRecently(
  businessId: string,
  days = 90,
): Promise<DedupCheck> {
  const cutoff = new Date(Date.now() - days * DAY_MS);

  const [logHit] = await db
    .select({ contactedAt: schema.outreachLog.contactedAt })
    .from(schema.outreachLog)
    .where(
      and(
        eq(schema.outreachLog.businessId, businessId),
        gte(schema.outreachLog.contactedAt, cutoff),
      ),
    )
    .orderBy(dsql`${schema.outreachLog.contactedAt} desc`)
    .limit(1);

  if (logHit) {
    return {
      contacted: true,
      reason: `Al gecontacteerd binnen ${days} dagen`,
      lastContactedAt: logHit.contactedAt,
    };
  }

  const [draftHit] = await db
    .select({ id: schema.outreachDrafts.id, status: schema.outreachDrafts.status })
    .from(schema.outreachDrafts)
    .where(
      and(
        eq(schema.outreachDrafts.businessId, businessId),
        or(
          eq(schema.outreachDrafts.status, 'pending'),
          eq(schema.outreachDrafts.status, 'approved'),
          eq(schema.outreachDrafts.status, 'sent'),
        )!,
      ),
    )
    .limit(1);

  if (draftHit) {
    return {
      contacted: true,
      reason: `Actieve draft aanwezig (status=${draftHit.status})`,
    };
  }

  return { contacted: false };
}

/**
 * True wanneer een ander bedrijf op hetzelfde domein in de laatste `days` dagen
 * al aangeschreven is. Voorkomt dubbele benadering van holdings/filialen.
 */
export async function alreadyContactedDomain(
  domain: string,
  days = 30,
): Promise<DedupCheck> {
  const normalized = normalizeDomain(domain);
  if (!normalized) return { contacted: false };

  const cutoff = new Date(Date.now() - days * DAY_MS);
  const like = `%${normalized}%`;

  const rows = await db
    .select({
      contactedAt: schema.outreachLog.contactedAt,
      website: schema.businesses.website,
    })
    .from(schema.outreachLog)
    .innerJoin(
      schema.businesses,
      eq(schema.outreachLog.businessId, schema.businesses.id),
    )
    .where(
      and(
        gte(schema.outreachLog.contactedAt, cutoff),
        dsql`${schema.businesses.website} ILIKE ${like}`,
      ),
    )
    .orderBy(dsql`${schema.outreachLog.contactedAt} desc`)
    .limit(5);

  for (const row of rows) {
    if (row.website && normalizeDomain(row.website) === normalized) {
      return {
        contacted: true,
        reason: `Domein ${normalized} al aangeschreven binnen ${days} dagen`,
        lastContactedAt: row.contactedAt,
      };
    }
  }

  return { contacted: false };
}

/**
 * Normaliseer een URL/hostname naar bare domein (geen protocol, www, pad).
 * Geeft null terug als niet parsebaar.
 */
export function normalizeDomain(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  try {
    const withProto = trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? trimmed
      : `https://${trimmed}`;
    const host = new URL(withProto).hostname;
    return host.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}
