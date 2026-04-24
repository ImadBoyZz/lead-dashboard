// Client-safe display helpers voor lead scores. Bewust losgekoppeld van
// `scoring.ts` zodat client components (ScoreBadge) niet de hele
// franchise-classifier + DB chain in de browser-bundle krijgen.

export function getScoreColor(score: number): string {
  if (score >= 70) return 'text-green-600 bg-green-50';
  if (score >= 40) return 'text-amber-600 bg-amber-50';
  return 'text-red-600 bg-red-50';
}

export function getScoreLabel(score: number): string {
  if (score >= 70) return 'Hot';
  if (score >= 40) return 'Warm';
  return 'Koud';
}
