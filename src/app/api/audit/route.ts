import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { env } from '@/lib/env';

function authenticateN8n(request: Request): boolean {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7);
  const secret = env.N8N_WEBHOOK_SECRET;
  if (!token || !secret) return false;
  const tokenBuf = Buffer.from(token);
  const secretBuf = Buffer.from(secret);
  if (tokenBuf.length !== secretBuf.length) return false;
  return timingSafeEqual(tokenBuf, secretBuf);
}

const auditPayloadSchema = z.object({
  hasWebsite: z.boolean().optional(),
  websiteUrl: z.string().optional(),
  websiteHttpStatus: z.number().optional(),
  pagespeedMobileScore: z.number().optional(),
  pagespeedDesktopScore: z.number().optional(),
  pagespeedFcp: z.number().optional(),
  pagespeedLcp: z.number().optional(),
  pagespeedCls: z.number().optional(),
  hasSsl: z.boolean().optional(),
  sslExpiry: z.string().optional(),
  sslIssuer: z.string().optional(),
  isMobileResponsive: z.boolean().optional(),
  hasViewportMeta: z.boolean().optional(),
  detectedCms: z.string().optional(),
  cmsVersion: z.string().optional(),
  detectedTechnologies: z.array(z.unknown()).optional(),
  serverHeader: z.string().optional(),
  poweredBy: z.string().optional(),
  hasGoogleAnalytics: z.boolean().optional(),
  hasGoogleTagManager: z.boolean().optional(),
  hasFacebookPixel: z.boolean().optional(),
  hasCookieBanner: z.boolean().optional(),
  hasMetaDescription: z.boolean().optional(),
  hasOpenGraph: z.boolean().optional(),
  hasStructuredData: z.boolean().optional(),
});

const scoreSchema = z.object({
  totalScore: z.number(),
  breakdown: z.record(z.string(), z.unknown()),
});

const resultSchema = z.object({
  businessId: z.string().uuid(),
  audit: auditPayloadSchema,
  score: scoreSchema.optional(),
});

const requestSchema = z.object({
  results: z.array(resultSchema),
});

export async function POST(request: NextRequest) {
  if (!authenticateN8n(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { results } = parsed.data;
    const now = new Date();

    // Batch upsert audit results (1 query instead of 2N)
    if (results.length > 0) {
      const auditValues = results.map((result) => ({
        businessId: result.businessId,
        ...result.audit,
        sslExpiry: result.audit.sslExpiry
          ? new Date(result.audit.sslExpiry)
          : undefined,
        detectedTechnologies: result.audit.detectedTechnologies ?? [],
        auditedAt: now,
      }));

      await db
        .insert(schema.auditResults)
        .values(auditValues)
        .onConflictDoUpdate({
          target: [schema.auditResults.businessId],
          set: {
            hasWebsite: sql`excluded.has_website`,
            websiteUrl: sql`excluded.website_url`,
            websiteHttpStatus: sql`excluded.website_http_status`,
            pagespeedMobileScore: sql`excluded.pagespeed_mobile_score`,
            pagespeedDesktopScore: sql`excluded.pagespeed_desktop_score`,
            pagespeedFcp: sql`excluded.pagespeed_fcp`,
            pagespeedLcp: sql`excluded.pagespeed_lcp`,
            pagespeedCls: sql`excluded.pagespeed_cls`,
            hasSsl: sql`excluded.has_ssl`,
            sslExpiry: sql`excluded.ssl_expiry`,
            sslIssuer: sql`excluded.ssl_issuer`,
            isMobileResponsive: sql`excluded.is_mobile_responsive`,
            hasViewportMeta: sql`excluded.has_viewport_meta`,
            detectedCms: sql`excluded.detected_cms`,
            cmsVersion: sql`excluded.cms_version`,
            detectedTechnologies: sql`excluded.detected_technologies`,
            serverHeader: sql`excluded.server_header`,
            poweredBy: sql`excluded.powered_by`,
            hasGoogleAnalytics: sql`excluded.has_google_analytics`,
            hasGoogleTagManager: sql`excluded.has_google_tag_manager`,
            hasFacebookPixel: sql`excluded.has_facebook_pixel`,
            hasCookieBanner: sql`excluded.has_cookie_banner`,
            hasMetaDescription: sql`excluded.has_meta_description`,
            hasOpenGraph: sql`excluded.has_open_graph`,
            hasStructuredData: sql`excluded.has_structured_data`,
            auditedAt: sql`excluded.audited_at`,
          },
        });

      // Batch upsert lead scores for results that have scores
      const scoreResults = results.filter((r) => r.score);
      if (scoreResults.length > 0) {
        const scoreValues = scoreResults.map((result) => ({
          businessId: result.businessId,
          totalScore: result.score!.totalScore,
          scoreBreakdown: result.score!.breakdown,
          scoredAt: now,
        }));

        await db
          .insert(schema.leadScores)
          .values(scoreValues)
          .onConflictDoUpdate({
            target: [schema.leadScores.businessId],
            set: {
              totalScore: sql`excluded.total_score`,
              scoreBreakdown: sql`excluded.score_breakdown`,
              scoredAt: sql`excluded.scored_at`,
            },
          });
      }
    }

    return NextResponse.json({ processed: results.length }, { status: 200 });
  } catch (error) {
    console.error('Audit error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
