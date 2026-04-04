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
  'kbo_bulk',
  'kvk_open',
  'google_places',
  'manual',
]);

export const leadStatusEnum = pgEnum('lead_status', [
  'new',
  'contacted',
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
