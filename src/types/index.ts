import type * as schema from '@/lib/db/schema';

// ── Inferred Select types ──────────────────────────────

export type Business = typeof schema.businesses.$inferSelect;
export type AuditResult = typeof schema.auditResults.$inferSelect;
export type LeadScore = typeof schema.leadScores.$inferSelect;
export type LeadStatus = typeof schema.leadStatuses.$inferSelect;
export type Note = typeof schema.notes.$inferSelect;
export type StatusHistoryEntry = typeof schema.statusHistory.$inferSelect;
export type ImportLog = typeof schema.importLogs.$inferSelect;
export type OutreachDraft = typeof schema.outreachDrafts.$inferSelect;
export type ScoringFeedback = typeof schema.scoringFeedback.$inferSelect;
export type AIUsageLog = typeof schema.aiUsageLog.$inferSelect;

// ── Inferred Insert types ──────────────────────────────

export type NewBusiness = typeof schema.businesses.$inferInsert;
export type NewAuditResult = typeof schema.auditResults.$inferInsert;
export type NewLeadScore = typeof schema.leadScores.$inferInsert;
export type NewLeadStatus = typeof schema.leadStatuses.$inferInsert;
export type NewNote = typeof schema.notes.$inferInsert;
export type NewStatusHistoryEntry = typeof schema.statusHistory.$inferInsert;
export type NewImportLog = typeof schema.importLogs.$inferInsert;
export type NewOutreachDraft = typeof schema.outreachDrafts.$inferInsert;
export type NewScoringFeedback = typeof schema.scoringFeedback.$inferInsert;
export type AgentAction = typeof schema.agentActions.$inferSelect;
export type NewAgentAction = typeof schema.agentActions.$inferInsert;

// ── Composite types ────────────────────────────────────

export type LeadWithDetails = Business & {
  auditResult: AuditResult | null;
  leadScore: LeadScore | null;
  leadStatus: LeadStatus | null;
  notes: Note[];
};

// ── Filter & query types ───────────────────────────────

export type LeadFilters = {
  country?: 'BE' | 'NL';
  province?: string;
  status?: 'new' | 'contacted' | 'quote_sent' | 'replied' | 'meeting' | 'won' | 'lost' | 'disqualified';
  scoreMin?: number;
  scoreMax?: number;
  search?: string;
  naceCode?: string;
  hasWebsite?: boolean;
  page: number;
  limit: number;
  sort?: string;
  order?: 'asc' | 'desc';
};

// ── Score types ────────────────────────────────────────

export type ScoreBreakdown = Record<
  string,
  { points: number; reason: string; dimension?: string }
>;
