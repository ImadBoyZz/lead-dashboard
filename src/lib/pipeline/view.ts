/**
 * View routing helpers — gedeeld tussen server (page.tsx) en client
 * (view switcher). Geen 'use client' zodat het in beide werelden werkt.
 */

export type PipelineView = "today" | "list" | "board" | "money";

export const DEFAULT_VIEW: PipelineView = "today";

export function parseView(raw: string | undefined | null): PipelineView {
  if (raw === "list" || raw === "board" || raw === "money" || raw === "today") {
    return raw;
  }
  return DEFAULT_VIEW;
}
