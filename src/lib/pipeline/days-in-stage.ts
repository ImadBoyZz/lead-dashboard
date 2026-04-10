/**
 * Helpers voor tijd-gebaseerde berekeningen op pipeline leads.
 * Eén plek zodat stale badges, urgency score, en capacity meter hetzelfde
 * mental model delen.
 */

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function daysBetween(from: Date | string | null | undefined, to: Date = new Date()): number {
  if (!from) return 0;
  const fromMs = new Date(from).getTime();
  if (Number.isNaN(fromMs)) return 0;
  return Math.max(0, Math.floor((to.getTime() - fromMs) / MS_PER_DAY));
}

export type StaleLevel = "fresh" | "warming" | "aging" | "stale";

/**
 * Classificatie voor de stale badge:
 * - fresh    < 7 dagen in huidige stage → geen badge of groen
 * - warming  7-14 dagen → geel
 * - aging    15-30 dagen → oranje
 * - stale    > 30 dagen → rood, vraagt actie
 */
export function staleLevel(stageChangedAt: Date | string | null | undefined): StaleLevel {
  const days = daysBetween(stageChangedAt);
  if (days < 7) return "fresh";
  if (days < 15) return "warming";
  if (days < 31) return "aging";
  return "stale";
}
