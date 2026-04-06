import { relations, sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  real,
  timestamp,
  pgEnum,
  jsonb,
  date,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

// ── Enums ──────────────────────────────────────────────

export const countryEnum = pgEnum('country', ['BE', 'NL']);

export const dataSourceEnum = pgEnum('data_source', [
  'google_places',
  'manual',
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
    blacklisted: boolean('blacklisted').default(false).notNull(),
    blacklistedAt: timestamp('blacklisted_at'),
    dataSource: dataSourceEnum('data_source').notNull(),
    scrapedAt: timestamp('scraped_at').defaultNow().notNull(),
    legalBasis: text('legal_basis').default('legitimate_interest_b2b'),
    optOut: boolean('opt_out').default(false).notNull(),
    optOutAt: timestamp('opt_out_at'),
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
  ],
);

// ── Audit Results ──────────────────────────────────────

export const auditResults = pgTable('audit_results', {
  id: uuid('id').defaultRandom().primaryKey(),
  businessId: uuid('business_id')
    .notNull()
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
});

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
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ── Status History ─────────────────────────────────────

export const statusHistory = pgTable('status_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  businessId: uuid('business_id')
    .notNull()
    .references(() => businesses.id, { onDelete: 'cascade' }),
  fromStatus: text('from_status'),
  toStatus: text('to_status').notNull(),
  changedAt: timestamp('changed_at').defaultNow().notNull(),
});

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
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('outreach_log_business_idx').on(table.businessId),
  index('outreach_log_contacted_at_idx').on(table.contactedAt),
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
