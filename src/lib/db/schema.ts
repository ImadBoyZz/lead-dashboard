import { relations, sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  real,
  numeric,
  timestamp,
  pgEnum,
  jsonb,
  date,
  uniqueIndex,
  index,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

// ── Enums ──────────────────────────────────────────────

export const countryEnum = pgEnum('country', ['BE', 'NL']);

export const dataSourceEnum = pgEnum('data_source', [
  'google_places',
  'manual',
  'kbo_bulk',
]);

export const leadStatusEnum = pgEnum('lead_status', [
  'new',
  'contacted',
  'quote_sent',
  'replied',
  'meeting',
  'won',
  'lost',
  'disqualified',
]);

export const importStatusEnum = pgEnum('import_status', [
  'running',
  'completed',
  'failed',
]);

export const emailStatusEnum = pgEnum('email_status', [
  'unverified',
  'mx_valid',
  'smtp_valid',
  'hard_bounced',
  'soft_bounced',
  'complained',
  'invalid',
]);

// Fase 1: keten/franchise classificatie
export const chainClassificationEnum = pgEnum('chain_classification', [
  'independent',
  'franchise',
  'chain',
  'corporate',
  'unknown',
]);

// Fase 1: website "oudheid" verdict
export const websiteVerdictEnum = pgEnum('website_verdict', [
  'none',
  'parked',
  'outdated',
  'acceptable',
  'modern',
]);

// Fase 1: email bron
export const emailSourceEnum = pgEnum('email_source', [
  'google_places',
  'firecrawl',
  'manual',
  'none',
]);

// Fase 1: franchise pattern match type
export const franchisePatternMatchTypeEnum = pgEnum('franchise_pattern_match_type', [
  'exact',
  'contains_word',
  'regex',
]);

// Fase 1: dead-letter enrichment step
export const dlqEnrichmentStepEnum = pgEnum('dlq_enrichment_step', [
  'qualify',
  'website',
  'email',
  'generate',
]);

// ── Businesses ─────────────────────────────────────────

export const businesses = pgTable(
  'businesses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    registryId: text('registry_id').notNull(),
    country: countryEnum('country').notNull(),
    name: text('name').notNull(),
    legalForm: text('legal_form'),
    naceCode: text('nace_code'),
    naceDescription: text('nace_description'),
    foundedDate: date('founded_date'),
    street: text('street'),
    houseNumber: text('house_number'),
    postalCode: text('postal_code'),
    city: text('city'),
    province: text('province'),
    website: text('website'),
    email: text('email'),
    phone: text('phone'),
    facebook: text('facebook'),
    googlePlaceId: text('google_place_id'),
    googleRating: real('google_rating'),
    googleReviewCount: integer('google_review_count'),
    googleBusinessStatus: text('google_business_status'),
    googlePhotosCount: integer('google_photos_count'),
    hasGoogleBusinessProfile: boolean('has_google_business_profile'),
    googlePlacesEnrichedAt: timestamp('google_places_enriched_at'),
    // Fase 2: dynamische intent-signalen
    recentReviewCount: integer('recent_review_count'),       // reviews laatste 6 maanden
    reviewVelocity: real('review_velocity'),                  // recentReviewCount / totalReviewCount
    googlePhotosCountPrev: integer('google_photos_count_prev'), // vorige waarde voor delta-detectie
    googleBusinessUpdatedAt: timestamp('google_business_updated_at'), // laatste GBP wijziging gedetecteerd
    hasGoogleAds: boolean('has_google_ads'),                  // draait Google Ads ja/nee
    hasSocialMediaLinks: boolean('has_social_media_links'),    // social media links op website/GBP
    // Stap 4+5: Bizzy activiteit + website health
    businessActivityStatus: text('business_activity_status'), // 'active' | 'uncertain' | 'likely_inactive' | 'confirmed_closed'
    lastKnownActivityAt: timestamp('last_known_activity_at'),
    websiteHealthy: boolean('website_healthy'),
    websiteLastCheckedAt: timestamp('website_last_checked_at'),
    sector: text('sector'),  // sector gebruikt bij import (beauty, horeca, bouw, etc.)
    chainWarning: text('chain_warning'),  // reden waarom dit mogelijk een keten is, null = geen warning
    leadTemperature: text('lead_temperature').default('cold').notNull(), // 'cold' | 'warm'
    autoPromotedAt: timestamp('auto_promoted_at'), // set door auto-promote step; null = nooit auto-gepromoot. Respecteert handmatige Triage downgrades.
    blacklisted: boolean('blacklisted').default(false).notNull(),
    blacklistedAt: timestamp('blacklisted_at'),
    dataSource: dataSourceEnum('data_source').notNull(),
    scrapedAt: timestamp('scraped_at').defaultNow().notNull(),
    legalBasis: text('legal_basis').default('legitimate_interest_b2b'),
    optOut: boolean('opt_out').default(false).notNull(),
    optOutAt: timestamp('opt_out_at'),
    optOutReason: text('opt_out_reason'),
    // Fase 0: AVG paper trail voor cold outreach verantwoording
    sourceUrl: text('source_url'),
    sourceCapturedAt: timestamp('source_captured_at'),
    // Fase 0: email deliverability status
    emailStatus: emailStatusEnum('email_status').default('unverified'),
    emailStatusUpdatedAt: timestamp('email_status_updated_at'),
    emailSource: emailSourceEnum('email_source').default('none'),
    // Fase 1: keten/franchise classificatie
    chainClassification: chainClassificationEnum('chain_classification').default('unknown'),
    chainConfidence: real('chain_confidence'),
    chainClassifiedAt: timestamp('chain_classified_at'),
    chainReason: text('chain_reason'),
    // Fase 1: website verdict (combinatie van PageSpeed/SSL/visueel)
    websiteVerdict: websiteVerdictEnum('website_verdict'),
    websiteAgeEstimate: integer('website_age_estimate'),
    websiteVerdictAt: timestamp('website_verdict_at'),
    // Fase 1: AVG legitimate interest basis per lead (overschrijft legalBasis indien NACE-specifiek)
    legitimateInterestBasis: text('legitimate_interest_basis'),
    // KBO Fast-Path enrichment (plan: ik-heb-eigenlijk-een-merry-oasis.md)
    kboEnterpriseNumber: text('kbo_enterprise_number'),
    kboMatchConfidence: real('kbo_match_confidence'),
    kboMatchedAt: timestamp('kbo_matched_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('businesses_registry_country_idx').on(
      table.registryId,
      table.country,
    ),
    index('businesses_country_idx').on(table.country),
    index('businesses_postal_code_idx').on(table.postalCode),
    index('businesses_nace_code_idx').on(table.naceCode),
    index('businesses_opt_out_idx').on(table.optOut),
    index('businesses_lead_temperature_idx').on(table.leadTemperature),
    index('businesses_blacklisted_idx').on(table.blacklisted),
    index('businesses_created_at_idx').on(table.createdAt),
    index('businesses_chain_classification_idx').on(table.chainClassification),
    index('businesses_website_verdict_idx').on(table.websiteVerdict),
    index('businesses_kbo_enterprise_number_idx').on(table.kboEnterpriseNumber),
  ],
);

// ── Audit Results ──────────────────────────────────────

export const auditResults = pgTable('audit_results', {
  id: uuid('id').defaultRandom().primaryKey(),
  businessId: uuid('business_id')
    .notNull()
    .unique()
    .references(() => businesses.id, { onDelete: 'cascade' }),
  hasWebsite: boolean('has_website'),
  websiteUrl: text('website_url'),
  websiteHttpStatus: integer('website_http_status'),
  pagespeedMobileScore: integer('pagespeed_mobile_score'),
  pagespeedDesktopScore: integer('pagespeed_desktop_score'),
  pagespeedFcp: real('pagespeed_fcp'),
  pagespeedLcp: real('pagespeed_lcp'),
  pagespeedCls: real('pagespeed_cls'),
  hasSsl: boolean('has_ssl'),
  sslExpiry: timestamp('ssl_expiry'),
  sslIssuer: text('ssl_issuer'),
  isMobileResponsive: boolean('is_mobile_responsive'),
  hasViewportMeta: boolean('has_viewport_meta'),
  detectedCms: text('detected_cms'),
  cmsVersion: text('cms_version'),
  detectedTechnologies: jsonb('detected_technologies').default(
    sql`'[]'::jsonb`,
  ),
  serverHeader: text('server_header'),
  poweredBy: text('powered_by'),
  hasGoogleAnalytics: boolean('has_google_analytics'),
  hasGoogleTagManager: boolean('has_google_tag_manager'),
  hasFacebookPixel: boolean('has_facebook_pixel'),
  hasCookieBanner: boolean('has_cookie_banner'),
  hasMetaDescription: boolean('has_meta_description'),
  hasOpenGraph: boolean('has_open_graph'),
  hasStructuredData: boolean('has_structured_data'),
  // Fase 2: "bewust digitaal" signalen
  hasGoogleAdsTag: boolean('has_google_ads_tag'),       // Google Ads remarketing/conversion tag
  hasSocialMediaLinks: boolean('has_social_media_links'), // Facebook/Instagram/LinkedIn links op site
  auditedAt: timestamp('audited_at').defaultNow().notNull(),
  auditVersion: integer('audit_version').default(1).notNull(),
}, (table) => [
  index('audit_results_business_idx').on(table.businessId),
]);

// ── Lead Scores ────────────────────────────────────────

export const leadScores = pgTable(
  'lead_scores',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    businessId: uuid('business_id')
      .notNull()
      .unique()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    totalScore: integer('total_score').notNull().default(0),
    scoreBreakdown: jsonb('score_breakdown').default(sql`'{}'::jsonb`),
    maturityCluster: text('maturity_cluster'),
    disqualified: boolean('disqualified').default(false).notNull(),
    disqualifyReason: text('disqualify_reason'),
    scoredAt: timestamp('scored_at').defaultNow().notNull(),
  },
  (table) => [index('lead_scores_total_score_idx').on(table.totalScore)],
);

// ── Lead Statuses ──────────────────────────────────────

export const leadStatuses = pgTable('lead_statuses', {
  id: uuid('id').defaultRandom().primaryKey(),
  businessId: uuid('business_id')
    .notNull()
    .unique()
    .references(() => businesses.id, { onDelete: 'cascade' }),
  status: leadStatusEnum('status').notNull().default('new'),
  statusChangedAt: timestamp('status_changed_at').defaultNow().notNull(),
  contactedAt: timestamp('contacted_at'),
  contactMethod: text('contact_method'),
  repliedAt: timestamp('replied_at'),
  meetingAt: timestamp('meeting_at'),
  closedAt: timestamp('closed_at'),
  closedReason: text('closed_reason'),
});

// ── Notes ──────────────────────────────────────────────

export const notes = pgTable('notes', {
  id: uuid('id').defaultRandom().primaryKey(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  author: text('author').default('human').notNull(), // 'human' | 'agent'
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('notes_business_idx').on(table.businessId),
]);

// ── Status History ─────────────────────────────────────

export const statusHistory = pgTable('status_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id, { onDelete: 'cascade' }),
  fromStatus: text('from_status'),
  toStatus: text('to_status').notNull(),
  changedAt: timestamp('changed_at').defaultNow().notNull(),
}, (table) => [
  index('status_history_business_idx').on(table.businessId),
]);

// ── Import Logs ────────────────────────────────────────

export const importLogs = pgTable('import_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  source: dataSourceEnum('source').notNull(),
  status: importStatusEnum('status').notNull().default('running'),
  totalRecords: integer('total_records').default(0),
  newRecords: integer('new_records').default(0),
  updatedRecords: integer('updated_records').default(0),
  errorCount: integer('error_count').default(0),
  errorDetails: jsonb('error_details'),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
});

// ── Relations ──────────────────────────────────────────

export const businessesRelations = relations(businesses, ({ one, many }) => ({
  auditResult: one(auditResults, {
    fields: [businesses.id],
    references: [auditResults.businessId],
  }),
  leadScore: one(leadScores, {
    fields: [businesses.id],
    references: [leadScores.businessId],
  }),
  leadStatus: one(leadStatuses, {
    fields: [businesses.id],
    references: [leadStatuses.businessId],
  }),
  notes: many(notes),
  statusHistory: many(statusHistory),
  leadPipeline: one(leadPipeline, { fields: [businesses.id], references: [leadPipeline.businessId] }),
  outreachLogs: many(outreachLog),
  reminders: many(reminders),
  outreachDrafts: many(outreachDrafts),
  scoringFeedback: many(scoringFeedback),
  agentActions: many(agentActions),
}));

export const auditResultsRelations = relations(auditResults, ({ one }) => ({
  business: one(businesses, {
    fields: [auditResults.businessId],
    references: [businesses.id],
  }),
}));

export const leadScoresRelations = relations(leadScores, ({ one }) => ({
  business: one(businesses, {
    fields: [leadScores.businessId],
    references: [businesses.id],
  }),
}));

export const leadStatusesRelations = relations(leadStatuses, ({ one }) => ({
  business: one(businesses, {
    fields: [leadStatuses.businessId],
    references: [businesses.id],
  }),
}));

export const notesRelations = relations(notes, ({ one }) => ({
  business: one(businesses, {
    fields: [notes.businessId],
    references: [businesses.id],
  }),
}));

export const statusHistoryRelations = relations(statusHistory, ({ one }) => ({
  business: one(businesses, {
    fields: [statusHistory.businessId],
    references: [businesses.id],
  }),
}));

// ── Fase 2: Pipeline & Outreach Enums ─────────────────

export const pipelineStageEnum = pgEnum('pipeline_stage', [
  'new', 'contacted', 'quote_sent', 'meeting', 'won', 'ignored',
]);

export const outreachChannelEnum = pgEnum('outreach_channel', [
  'email', 'phone', 'linkedin', 'whatsapp', 'in_person',
]);

export const priorityEnum = pgEnum('priority', ['low', 'medium', 'high', 'urgent']);

// AI draft status enum
// Fase 3: uitgebreid met send-pipeline states. Order:
//   pending → approved → sending → sent | send_failed | bounced
//   pending → rejected (human review)
export const draftStatusEnum = pgEnum('draft_status', [
  'pending', 'approved', 'rejected', 'sent', 'sending', 'send_failed', 'bounced',
]);

// Fase 3: Feedback loop enums
export const rejectionReasonEnum = pgEnum('rejection_reason', [
  'no_budget', 'no_interest', 'has_supplier', 'bad_timing', 'no_response', 'other',
]);

export const outreachOutcomeEnum = pgEnum('outreach_outcome', [
  'no_answer', 'voicemail', 'callback_requested', 'interested', 'not_interested',
  'meeting_booked', 'wrong_contact', 'other',
]);

// ── Lead Pipeline ─────────────────────────────────────

export const leadPipeline = pgTable('lead_pipeline', {
  id: uuid('id').defaultRandom().primaryKey(),
  businessId: uuid('business_id').notNull().unique()
    .references(() => businesses.id, { onDelete: 'cascade' }),
  stage: pipelineStageEnum('stage').notNull().default('new'),
  priority: priorityEnum('priority').notNull().default('medium'),
  dealValue: real('deal_value'),
  estimatedCloseDate: date('estimated_close_date'),
  nextFollowUpAt: timestamp('next_follow_up_at'),
  followUpNote: text('follow_up_note'),
  lastOutreachAt: timestamp('last_outreach_at'),
  outreachCount: integer('outreach_count').default(0).notNull(),
  stageChangedAt: timestamp('stage_changed_at').defaultNow().notNull(),
  lostReason: text('lost_reason'),
  // Fase 3: Feedback loop
  rejectionReason: rejectionReasonEnum('rejection_reason'),
  maturityCluster: text('maturity_cluster'),           // snapshot van cluster bij import
  frozen: boolean('frozen').default(false).notNull(),   // true = geparkeerd, niet in actieve wachtrij
  frozenAt: timestamp('frozen_at'),
  wonValue: real('won_value'),                          // werkelijke deal waarde bij won
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('lead_pipeline_stage_idx').on(table.stage),
  index('lead_pipeline_priority_idx').on(table.priority),
  index('lead_pipeline_next_follow_up_idx').on(table.nextFollowUpAt),
  index('lead_pipeline_frozen_idx').on(table.frozen),
]);

// ── Outreach Log ──────────────────────────────────────

export const outreachLog = pgTable('outreach_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  businessId: uuid('business_id').notNull()
    .references(() => businesses.id, { onDelete: 'cascade' }),
  channel: outreachChannelEnum('channel').notNull(),
  subject: text('subject'),
  content: text('content'),
  outcome: text('outcome'),
  structuredOutcome: outreachOutcomeEnum('structured_outcome'),
  contactedAt: timestamp('contacted_at').defaultNow().notNull(),
  durationMinutes: integer('duration_minutes'),
  nextAction: text('next_action'),
  aiGenerated: boolean('ai_generated').default(false),
  draftId: uuid('draft_id'),
  gmailThreadId: text('gmail_thread_id'),
  // Fase 0: Resend message tracking + unsubscribe
  resendMessageId: text('resend_message_id'),
  unsubscribeToken: text('unsubscribe_token'),
  deliveryStatus: text('delivery_status'),
  deliveredAt: timestamp('delivered_at'),
  bouncedAt: timestamp('bounced_at'),
  complainedAt: timestamp('complained_at'),
  // Mini-Fase-1.0: open tracking via Resend email.opened webhook
  openedAt: timestamp('opened_at'),
  openedCount: integer('opened_count').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('outreach_log_business_idx').on(table.businessId),
  index('outreach_log_contacted_at_idx').on(table.contactedAt),
  index('outreach_log_resend_message_idx').on(table.resendMessageId),
]);

// ── Fase 3: Reminders & Templates Enums ───────────────

export const reminderTypeEnum = pgEnum('reminder_type', [
  'follow_up', 'call', 'meeting_prep', 'check_in', 'custom',
]);

export const reminderStatusEnum = pgEnum('reminder_status', [
  'pending', 'completed', 'skipped',
]);

// ── Reminders ─────────────────────────────────────────

export const reminders = pgTable('reminders', {
  id: uuid('id').defaultRandom().primaryKey(),
  businessId: uuid('business_id').notNull()
    .references(() => businesses.id, { onDelete: 'cascade' }),
  type: reminderTypeEnum('type').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  dueDate: timestamp('due_date').notNull(),
  status: reminderStatusEnum('status').notNull().default('pending'),
  completedAt: timestamp('completed_at'),
  autoGenerated: boolean('auto_generated').default(false),
  suggestedMessage: text('suggested_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('reminders_due_date_idx').on(table.dueDate),
  index('reminders_business_idx').on(table.businessId),
  index('reminders_status_idx').on(table.status),
]);

// ── Outreach Templates ────────────────────────────────

export const outreachTemplates = pgTable('outreach_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  channel: outreachChannelEnum('channel').notNull(),
  subject: text('subject'),
  body: text('body').notNull(),
  variables: jsonb('variables').default(sql`'[]'::jsonb`),
  isDefault: boolean('is_default').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ── Nieuwe Relations ──────────────────────────────────

export const leadPipelineRelations = relations(leadPipeline, ({ one }) => ({
  business: one(businesses, {
    fields: [leadPipeline.businessId],
    references: [businesses.id],
  }),
}));

export const outreachLogRelations = relations(outreachLog, ({ one }) => ({
  business: one(businesses, {
    fields: [outreachLog.businessId],
    references: [businesses.id],
  }),
}));

export const remindersRelations = relations(reminders, ({ one }) => ({
  business: one(businesses, {
    fields: [reminders.businessId],
    references: [businesses.id],
  }),
}));

export const outreachTemplatesRelations = relations(outreachTemplates, ({}) => ({}));

// ── AI: Outreach Drafts ──────────────────────────────

export const outreachDrafts = pgTable('outreach_drafts', {
  id: uuid('id').defaultRandom().primaryKey(),
  businessId: uuid('business_id').notNull()
    .references(() => businesses.id, { onDelete: 'cascade' }),
  campaignId: uuid('campaign_id'),
  channel: outreachChannelEnum('channel').notNull(),
  subject: text('subject'),
  body: text('body').notNull(),
  tone: text('tone').notNull(),
  status: draftStatusEnum('status').notNull().default('pending'),
  aiProvider: text('ai_provider'),
  aiModel: text('ai_model'),
  promptTokens: integer('prompt_tokens').default(0),
  completionTokens: integer('completion_tokens').default(0),
  variantIndex: integer('variant_index').notNull(),
  selectedVariant: boolean('selected_variant').default(false),
  templateId: uuid('template_id')
    .references(() => outreachTemplates.id),
  // Fase 1: experiment tracking. NULL voor pre-Fase-1 drafts en ad-hoc drafts.
  // Verplicht ingevuld door batch generator wanneer experimentId in payload zit.
  experimentId: uuid('experiment_id')
    .references((): AnyPgColumn => experiments.id, { onDelete: 'set null' }),
  giveFirstVariant: text('give_first_variant'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('outreach_drafts_business_idx').on(table.businessId),
  index('outreach_drafts_campaign_idx').on(table.campaignId),
  index('outreach_drafts_status_idx').on(table.status),
  index('outreach_drafts_experiment_idx').on(table.experimentId, table.giveFirstVariant),
]);

// ── AI: Scoring Feedback ─────────────────────────────

export const scoringFeedback = pgTable('scoring_feedback', {
  id: uuid('id').defaultRandom().primaryKey(),
  businessId: uuid('business_id').notNull()
    .references(() => businesses.id, { onDelete: 'cascade' }),
  channel: outreachChannelEnum('channel').notNull(),
  templateId: uuid('template_id')
    .references(() => outreachTemplates.id),
  outcome: text('outcome'),
  naceCode: text('nace_code'),
  sector: text('sector'),
  maturityCluster: text('maturity_cluster'),
  totalScore: integer('total_score').notNull(),
  scoreBreakdown: jsonb('score_breakdown').default(sql`'{}'::jsonb`),
  outreachCount: integer('outreach_count').notNull(),
  leadTemperature: text('lead_temperature'),
  conversionSuccess: boolean('conversion_success').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── AI: Usage Log ────────────────────────────────────

export const aiUsageLog = pgTable('ai_usage_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  endpoint: text('endpoint').notNull(),
  aiProvider: text('ai_provider').notNull(),
  aiModel: text('ai_model').notNull(),
  promptTokens: integer('prompt_tokens').notNull(),
  completionTokens: integer('completion_tokens').notNull(),
  totalTokens: integer('total_tokens').notNull(),
  costEstimate: real('cost_estimate'),
  businessId: uuid('business_id'),
  campaignId: uuid('campaign_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── Agent Actions ───────────────────────────────────

export const agentActions = pgTable('agent_actions', {
  id: uuid('id').defaultRandom().primaryKey(),
  businessId: uuid('business_id').notNull()
    .references(() => businesses.id, { onDelete: 'cascade' }),
  triggeredAt: timestamp('triggered_at').defaultNow().notNull(),
  inputSnapshot: jsonb('input_snapshot'),
  decision: text('decision').notNull(), // 'stage_change' | 'score_update' | 'no_action'
  previousStage: text('previous_stage'),
  newStage: text('new_stage'),
  note: text('note'),
  reasoning: text('reasoning').notNull(),
  latencyMs: integer('latency_ms'),
  modelVersion: text('model_version').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('agent_actions_business_idx').on(table.businessId),
  index('agent_actions_decision_idx').on(table.decision),
  index('agent_actions_created_at_idx').on(table.createdAt),
]);

// ── AI Relations ─────────────────────────────────────

export const outreachDraftsRelations = relations(outreachDrafts, ({ one }) => ({
  business: one(businesses, {
    fields: [outreachDrafts.businessId],
    references: [businesses.id],
  }),
}));

export const agentActionsRelations = relations(agentActions, ({ one }) => ({
  business: one(businesses, {
    fields: [agentActions.businessId],
    references: [businesses.id],
  }),
}));

export const scoringFeedbackRelations = relations(scoringFeedback, ({ one }) => ({
  business: one(businesses, {
    fields: [scoringFeedback.businessId],
    references: [businesses.id],
  }),
}));

// ── Fase 0: System Settings (kill-switch, warmup, budget) ─────────

export const systemSettings = pgTable('system_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  updatedBy: text('updated_by'),
});

// ── Mini-Fase-1.0: Webhook idempotency dedup ──────────────────────
// Resend kan dezelfde webhook event meerdere keren retryen (network glitch,
// timeout, etc). svix-id is uniek per event — door op INSERT te conflicteren
// herkennen we duplicates en slaan we dubbele DB updates over.
export const processedWebhookEvents = pgTable('processed_webhook_events', {
  svixId: text('svix_id').primaryKey(),
  eventType: text('event_type').notNull(),
  receivedAt: timestamp('received_at').defaultNow().notNull(),
});

// ── Fase 1: Franchise Patterns (CRUD via admin UI later) ──────────

export const franchisePatterns = pgTable('franchise_patterns', {
  id: uuid('id').defaultRandom().primaryKey(),
  pattern: text('pattern').notNull(),
  matchType: franchisePatternMatchTypeEnum('match_type').notNull(),
  classification: chainClassificationEnum('classification').notNull().default('franchise'),
  reason: text('reason'),
  enabled: boolean('enabled').default(true).notNull(),
  addedAt: timestamp('added_at').defaultNow().notNull(),
  addedBy: text('added_by'),
}, (table) => [
  index('franchise_patterns_enabled_idx').on(table.enabled),
  uniqueIndex('franchise_patterns_pattern_unique').on(table.pattern, table.matchType),
]);

// ── Fase 1: Daily Batches (orchestratie-log + warmup/cost tracking) ──

export const dailyBatches = pgTable('daily_batches', {
  id: uuid('id').defaultRandom().primaryKey(),
  runDate: date('run_date').notNull(),
  leadsProcessed: integer('leads_processed').default(0).notNull(),
  qualified: integer('qualified').default(0).notNull(),
  rejected: integer('rejected').default(0).notNull(),
  costEur: real('cost_eur').default(0).notNull(),
  durationSeconds: integer('duration_seconds'),
  errorLog: jsonb('error_log').default(sql`'[]'::jsonb`),
  maxSendsToday: integer('max_sends_today'),
  actualSent: integer('actual_sent').default(0).notNull(),
  deliverabilityScore: real('deliverability_score'),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
}, (table) => [
  uniqueIndex('daily_batches_run_date_unique').on(table.runDate),
  index('daily_batches_run_date_idx').on(table.runDate),
]);

// ── Fase 1: Dead-Letter Queue (per-step failure retry) ────────────

export const dlqEnrichments = pgTable('dlq_enrichments', {
  id: uuid('id').defaultRandom().primaryKey(),
  businessId: uuid('business_id').notNull()
    .references(() => businesses.id, { onDelete: 'cascade' }),
  step: dlqEnrichmentStepEnum('step').notNull(),
  error: text('error').notNull(),
  errorDetail: jsonb('error_detail'),
  attemptCount: integer('attempt_count').default(1).notNull(),
  lastAttemptAt: timestamp('last_attempt_at').defaultNow().notNull(),
  nextRetryAt: timestamp('next_retry_at'),
  resolvedAt: timestamp('resolved_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('dlq_enrichments_business_idx').on(table.businessId),
  index('dlq_enrichments_step_idx').on(table.step),
  index('dlq_enrichments_next_retry_idx').on(table.nextRetryAt),
  index('dlq_enrichments_resolved_idx').on(table.resolvedAt),
]);

// ── Fase 1: Ground-Truth Labels (handgelabelde set voor accuracy meting) ──

export const groundTruthLabels = pgTable('ground_truth_labels', {
  id: uuid('id').defaultRandom().primaryKey(),
  businessId: uuid('business_id').notNull()
    .references(() => businesses.id, { onDelete: 'cascade' }),
  expectedChainClassification: chainClassificationEnum('expected_chain_classification').notNull(),
  expectedWebsiteVerdict: websiteVerdictEnum('expected_website_verdict'),
  notes: text('notes'),
  labeledAt: timestamp('labeled_at').defaultNow().notNull(),
  labeledBy: text('labeled_by').default('imad').notNull(),
}, (table) => [
  uniqueIndex('ground_truth_business_unique').on(table.businessId),
]);

// ── Fase 1: Relations ─────────────────────────────────

export const dlqEnrichmentsRelations = relations(dlqEnrichments, ({ one }) => ({
  business: one(businesses, {
    fields: [dlqEnrichments.businessId],
    references: [businesses.id],
  }),
}));

export const groundTruthLabelsRelations = relations(groundTruthLabels, ({ one }) => ({
  business: one(businesses, {
    fields: [groundTruthLabels.businessId],
    references: [businesses.id],
  }),
}));

// ── KBO Lookup Table (Fast-Path enrichment) ───────────────────────────
// Eén gedenormaliseerde tabel ipv 4 staging tabellen om Neon 512MB quota te respecteren.
// Pre-joined tijdens import. Read-only, maandelijks refreshen via cron.
// Plan: ik-heb-eigenlijk-een-merry-oasis.md §Quota fix.

export const kboLookup = pgTable('kbo_lookup', {
  enterpriseNumber: text('enterprise_number').primaryKey(),
  denomination: text('denomination').notNull(),
  normalizedDenomination: text('normalized_denomination').notNull(),
  zipcode: text('zipcode'),
  municipality: text('municipality'),
  province: text('province'),
  naceCode: text('nace_code'),
  naceVersion: text('nace_version'),
  juridicalForm: text('juridical_form'),
  juridicalSituation: text('juridical_situation'),
  typeOfEnterprise: text('type_of_enterprise'),
  startDate: date('start_date'),
}, (table) => [
  // Composite index matcht exact op (normalized_name, zipcode) — fast-path query
  index('kbo_lookup_match_idx').on(table.normalizedDenomination, table.zipcode),
  index('kbo_lookup_zipcode_idx').on(table.zipcode),
]);

export const kboSnapshot = pgTable('kbo_snapshot', {
  id: uuid('id').defaultRandom().primaryKey(),
  snapshotDate: date('snapshot_date').notNull(),
  importedAt: timestamp('imported_at').defaultNow().notNull(),
  enterprisesCount: integer('enterprises_count').default(0).notNull(),
  denominationsCount: integer('denominations_count').default(0).notNull(),
  activitiesCount: integer('activities_count').default(0).notNull(),
  addressesCount: integer('addresses_count').default(0).notNull(),
  durationSeconds: integer('duration_seconds'),
  notes: text('notes'),
});

// ── Fase 1: Experiments + Reply Classifications + Sequence Queue ───

export const experimentStatusEnum = pgEnum('experiment_status', [
  'running',
  'paused',
  'concluded',
]);

export const replyClassificationEnum = pgEnum('reply_classification', [
  'positive',
  'negative',
  'unsubscribe',
  'auto_reply',
  'unclear',
]);

export const sequenceQueueStatusEnum = pgEnum('sequence_queue_status', [
  'pending',
  'sent',
  'skipped',
  'cancelled',
]);

/**
 * Variant-test campagnes (give-first A/B). Een experiment definieert welke
 * twee prompt-branches gebenchmarkt worden, in welke verhouding, en met welke
 * pre-registered hypothese. Metrics worden via JOIN gecomputed (geen cached counts).
 *
 * Speciale "Default Cadence" row met static UUID seedt ad-hoc sends die niet
 * onder een echt experiment vallen — zorgt dat sequence_queue.experiment_id
 * NOT NULL kan blijven.
 */
export const experiments = pgTable('experiments', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),                                     // "Fase 3: Concurrent vs GEO"
  testVariant: text('test_variant').notNull(),                      // bv. 'concurrent_vergelijking'
  controlVariant: text('control_variant').notNull(),                // bv. 'geo_rapport'
  splitPercentage: integer('split_percentage').default(70).notNull(), // 70 = 70% test / 30% control
  hypothesis: text('hypothesis'),                                    // pre-registered, vóór start
  // numeric returnt string in Drizzle - app-code moet parseFloat() doen.
  expectedReplyRate: numeric('expected_reply_rate', { precision: 4, scale: 3 }),
  minSampleSize: integer('min_sample_size'),                         // per arm
  targetSends: integer('target_sends'),                              // totaal over beide arms
  startsAt: timestamp('starts_at').notNull(),
  endsAt: timestamp('ends_at'),
  status: experimentStatusEnum('status').default('running').notNull(),
  conclusion: text('conclusion'),                                    // 'winner' | 'loser' | 'inconclusive'
  notes: text('notes'),                                              // post-hoc observaties
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('experiments_status_starts_at_idx').on(table.status, table.startsAt),
]);

/**
 * Gestructureerde reply outcomes voor positive-reply-rate metric.
 * Granulariteit-eerste-laag is bewust kort (5 buckets); subtype kolom houdt
 * ruimte open voor later finer detail (bv. 'meeting_request', 'wrong_person')
 * zonder schema migratie.
 *
 * Positive-reply metric definitie: classification = 'positive'.
 */
export const replyClassifications = pgTable('reply_classifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  outreachLogId: uuid('outreach_log_id').notNull()
    .references(() => outreachLog.id, { onDelete: 'cascade' }),
  businessId: uuid('business_id').notNull()
    .references(() => businesses.id, { onDelete: 'cascade' }),
  classification: replyClassificationEnum('classification').notNull(),
  subtype: text('subtype'),                                          // optional finer granularity, e.g. 'meeting_request'
  replyText: text('reply_text'),                                     // raw quote, app trimt op 4000 chars
  receivedAt: timestamp('received_at').notNull(),
  classifiedBy: text('classified_by').default('human').notNull(),    // 'human' | 'ai' | 'auto_rule'
  // numeric returnt string in Drizzle - app-code moet parseFloat() doen.
  aiConfidence: numeric('ai_confidence', { precision: 3, scale: 2 }), // 0.00-1.00, alleen bij ai/auto_rule
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('reply_classifications_business_received_idx').on(table.businessId, table.receivedAt),
  index('reply_classifications_classification_received_idx').on(table.classification, table.receivedAt),
  index('reply_classifications_outreach_log_idx').on(table.outreachLogId),
]);

/**
 * Follow-up cadence queue. Eén rij per geplande stap (initial + follow-ups).
 * SEQUENCE_DAYS = [0, 3, 7, 14] gehard-coded in src/lib/sequence-cadence.ts.
 *
 * experiment_id is NOT NULL — ad-hoc sends koppelen we aan de "Default Cadence"
 * experiment (static UUID) zodat we geen NULL-edge cases hoeven te handelen.
 *
 * ON DELETE RESTRICT op experiment_id: een experiment verwijderen vereist
 * eerst dat alle bijbehorende sequence_queue rijen worden gecancelled
 * (status='cancelled', skip_reason='experiment_concluded') of verwijderd.
 * Dit beschermt de Default Cadence en voorkomt accident drops.
 */
export const sequenceQueue = pgTable('sequence_queue', {
  id: uuid('id').defaultRandom().primaryKey(),
  businessId: uuid('business_id').notNull()
    .references(() => businesses.id, { onDelete: 'cascade' }),
  experimentId: uuid('experiment_id').notNull()
    .references(() => experiments.id, { onDelete: 'restrict' }),    // RESTRICT: voorkomt accident drop van experiment dat queue heeft
  giveFirstVariant: text('give_first_variant').notNull(),            // 'geo_rapport' | 'concurrent_vergelijking' | 'control'
  sequenceStep: integer('sequence_step').notNull(),                  // 0=initial, 1=day3, 2=day7, 3=day14 break-up
  scheduledFor: timestamp('scheduled_for').notNull(),                 // UTC
  status: sequenceQueueStatusEnum('status').default('pending').notNull(),
  sentOutreachLogId: uuid('sent_outreach_log_id')
    .references(() => outreachLog.id, { onDelete: 'set null' }),
  skipReason: text('skip_reason'),                                   // 'replied' | 'opted_out' | 'bounced' | 'manual_pause' | 'experiment_concluded'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('sequence_queue_status_scheduled_idx').on(table.status, table.scheduledFor),
  index('sequence_queue_business_step_idx').on(table.businessId, table.sequenceStep),
  index('sequence_queue_experiment_status_idx').on(table.experimentId, table.status),
  uniqueIndex('sequence_queue_business_experiment_step_uniq').on(
    table.businessId, table.experimentId, table.sequenceStep,
  ),
]);

// ── Fase 1 Relations ────────────────────────────────────

export const experimentsRelations = relations(experiments, ({ many }) => ({
  drafts: many(outreachDrafts),
  queueRows: many(sequenceQueue),
}));

export const replyClassificationsRelations = relations(replyClassifications, ({ one }) => ({
  outreachLog: one(outreachLog, {
    fields: [replyClassifications.outreachLogId],
    references: [outreachLog.id],
  }),
  business: one(businesses, {
    fields: [replyClassifications.businessId],
    references: [businesses.id],
  }),
}));

export const sequenceQueueRelations = relations(sequenceQueue, ({ one }) => ({
  business: one(businesses, {
    fields: [sequenceQueue.businessId],
    references: [businesses.id],
  }),
  experiment: one(experiments, {
    fields: [sequenceQueue.experimentId],
    references: [experiments.id],
  }),
  sentOutreachLog: one(outreachLog, {
    fields: [sequenceQueue.sentOutreachLogId],
    references: [outreachLog.id],
  }),
}));

// ── Autonomy: Batch Run Observability ─────────────────
// Per-cron-run record voor discover / generate-drafts / deliverability-check.
// Unique index met partial WHERE zorgt voor idempotency bij n8n retries.
export const batchRuns = pgTable('batch_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  jobType: text('job_type').notNull(),
  runDate: date('run_date').notNull(),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  finishedAt: timestamp('finished_at'),
  status: text('status').default('running').notNull(),
  inputCount: integer('input_count'),
  outputCount: integer('output_count'),
  skippedReasons: jsonb('skipped_reasons'),
  errorMessage: text('error_message'),
  costEur: numeric('cost_eur', { precision: 10, scale: 4 }),
  metadata: jsonb('metadata'),
}, (table) => [
  index('batch_runs_job_date_idx').on(table.jobType, table.runDate),
  index('batch_runs_status_idx').on(table.status),
]);
