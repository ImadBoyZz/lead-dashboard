import { createHash } from 'node:crypto';
import { type GiveFirstVariant } from './prompts';

const ALLOWED_VARIANTS: GiveFirstVariant[] = ['control', 'geo_rapport', 'concurrent_vergelijking'];

/**
 * Hash-based variant assignment voor reproduceerbare A/B test bucketing.
 *
 * Zelfde (businessId, experimentId) geeft altijd dezelfde variant — kritiek
 * voor retry-veiligheid en bij heruitvoering van een batch. Verschillende
 * experimentIds voor dezelfde lead kunnen verschillende variants opleveren
 * (lead kan dus in experiment A 'control' krijgen en in experiment B 'test').
 *
 * Implementatie: SHA-256 over `businessId:experimentId`, eerste 8 bytes als
 * BigUint64 % 100. Bucket < splitPercentage → testVariant, anders controlVariant.
 *
 * Defensief: als testVariant of controlVariant geen geldige GiveFirstVariant
 * is (bv. typo in experiments-row), valt de assignment terug op 'control' om
 * crashes in de prompt-builder te voorkomen.
 */
export function assignVariantForLead(input: {
  businessId: string;
  experimentId: string;
  splitPercentage: number;
  testVariant: string;
  controlVariant: string;
}): GiveFirstVariant {
  const hash = createHash('sha256')
    .update(`${input.businessId}:${input.experimentId}`)
    .digest();
  const bucket = Number(hash.readBigUInt64BE(0) % 100n);
  const raw = bucket < input.splitPercentage ? input.testVariant : input.controlVariant;
  return ALLOWED_VARIANTS.includes(raw as GiveFirstVariant)
    ? (raw as GiveFirstVariant)
    : 'control';
}
