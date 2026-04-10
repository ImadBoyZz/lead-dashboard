/**
 * Ruwe kans-schatting per pipeline stage. Gebruikt door de Money view
 * om leads te sorteren op verwachte cashflow (dealValue × probability).
 * Pas aan op basis van werkelijke conversie data als die beschikbaar is.
 */
export const STAGE_PROBABILITY: Record<string, number> = {
  new: 0.05,
  contacted: 0.15,
  quote_sent: 0.3,
  meeting: 0.6,
  won: 1.0,
  ignored: 0.0,
};

export function expectedValue(
  dealValue: number | null | undefined,
  stage: string
): number {
  if (!dealValue || dealValue <= 0) return 0;
  return dealValue * (STAGE_PROBABILITY[stage] ?? 0);
}
