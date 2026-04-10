import { daysBetween } from "./days-in-stage";

/**
 * Minimale lead-shape die we nodig hebben voor urgency ranking.
 * Losgekoppeld van PipelineLeadRow zodat dit ook server-side werkt.
 */
export type UrgencyLead = {
  stage: string;
  frozen: boolean;
  leadScore?: number | null;
  dealValue?: number | null;
  stageChangedAt?: Date | string | null;
  nextFollowUpAt?: Date | string | null;
  lastOutreachAt?: Date | string | null;
  meetingAt?: Date | string | null;
};

/**
 * Ranking formule voor de Today view. Hogere score = meer urgent.
 * Returns 0 voor leads die vandaag niet relevant zijn (niet in de queue).
 */
export function urgencyScore(lead: UrgencyLead): number {
  if (lead.frozen) return 0;
  if (lead.stage === "won" || lead.stage === "ignored") return 0;

  let score = 0;
  const now = new Date();

  // Overdue follow-up krijgt hoogste prioriteit
  if (lead.nextFollowUpAt) {
    const followUp = new Date(lead.nextFollowUpAt);
    if (followUp <= now) {
      const daysOverdue = daysBetween(followUp);
      score += 150 + daysOverdue * 10;
    }
  }

  // Meeting vandaag = must-see
  if (lead.stage === "meeting" && lead.meetingAt) {
    const meeting = new Date(lead.meetingAt);
    const sameDay =
      meeting.getFullYear() === now.getFullYear() &&
      meeting.getMonth() === now.getMonth() &&
      meeting.getDate() === now.getDate();
    if (sameDay) score += 200;
  }

  // Quote sent > 7 dagen zonder beweging → follow-up tijd
  if (lead.stage === "quote_sent") {
    const daysStale = daysBetween(lead.stageChangedAt);
    if (daysStale > 7) score += 80 + (daysStale - 7) * 5;
  }

  // Hot untouched lead: hoge score maar al een tijd geen outreach
  if (
    (lead.leadScore ?? 0) >= 80 &&
    lead.stage === "contacted" &&
    daysBetween(lead.lastOutreachAt) > 3
  ) {
    score += 60;
  }

  // Stage decay: > 30 dagen in dezelfde stage is rode vlag
  const daysInStage = daysBetween(lead.stageChangedAt);
  if (daysInStage > 30) score += 50;
  else if (daysInStage > 14) score += 20;

  // Budget boost: grote deals krijgen kleine bonus
  if ((lead.dealValue ?? 0) >= 5000) score += 15;

  return score;
}
