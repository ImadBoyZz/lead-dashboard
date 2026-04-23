/**
 * Post-processing voor AI-gegenereerde cold-email output.
 *
 * Em-dash ("—", U+2014), en-dash ("–", U+2013) en spatieomringde hyphen-minus
 * (" - ") worden als separator-dash gebruikt en voelen onmenselijk aan in
 * cold email. De prompt instrueert de AI ze te vermijden, maar empirisch
 * glippen ze er toch door. Deze helper is de harde guard VOOR de draft naar
 * de DB gaat.
 *
 * Vervangingen:
 *   em-dash "—"            →  ". "
 *   en-dash "–"            →  ", "
 *   hyphen-minus " - "     →  ", "   (alleen met spaties rondom — "auto-dealer" blijft intact)
 *
 * Omringende whitespace wordt mee weggenomen zodat we geen dubbele spaties of
 * " . " artifacts overhouden.
 */
export function stripEmDashes(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/\s*—\s*/g, '. ')
    .replace(/\s*–\s*/g, ', ')
    .replace(/ +- +/g, ', ')
    .replace(/ {2,}/g, ' ')
    .replace(/\. \. /g, '. ')
    .trim();
}

/**
 * Sanitize een volledige AI-variant (subject/body/ps) in één call.
 * Retourneert een nieuw object — input wordt niet gemuteerd.
 */
export function sanitizeVariant<T extends { subject?: string | null; body?: string | null; ps?: string | null }>(
  variant: T,
): T {
  return {
    ...variant,
    subject: variant.subject ? stripEmDashes(variant.subject) : variant.subject,
    body: variant.body ? stripEmDashes(variant.body) : variant.body,
    ps: variant.ps ? stripEmDashes(variant.ps) : variant.ps,
  };
}
