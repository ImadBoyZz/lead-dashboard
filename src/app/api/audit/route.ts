import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';

function authenticateN8n(request: Request): boolean {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return false;
  return auth.slice(7) === process.env.N8N_WEBHOOK_SECRET;
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
    let processed = 0;

    for (const result of results) {
      // Upsert audit results
      const auditValues = {
        businessId: result.businessId,
        ...result.audit,
        sslExpiry: result.audit.sslExpiry
          ? new Date(result.audit.sslExpiry)
          : undefined,
        detectedTechnologies: result.audit.detectedTechnologies ?? [],
        auditedAt: new Date(),
      };

      // Check if audit exists for this business
      const existing = await db
        .select({ id: schema.auditResults.id })
        .from(schema.auditResults)
        .where(eq(schema.auditResults.businessId, result.businessId))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(schema.auditResults)
          .set(auditValues)
          .where(eq(schema.auditResults.businessId, result.businessId));
      } else {
        await db.insert(schema.auditResults).values(auditValues);
      }

      // Upsert lead score if provided
      if (result.score) {
        const existingScore = await db
          .select({ id: schema.leadScores.id })
          .from(schema.leadScores)
          .where(eq(schema.leadScores.businessId, result.businessId))
          .limit(1);

        if (existingScore.length > 0) {
          await db
            .update(schema.leadScores)
            .set({
              totalScore: result.score.totalScore,
              scoreBreakdown: result.score.breakdown,
              scoredAt: new Date(),
            })
            .where(eq(schema.leadScores.businessId, result.businessId));
        } else {
          await db.insert(schema.leadScores).values({
            businessId: result.businessId,
            totalScore: result.score.totalScore,
            scoreBreakdown: result.score.breakdown,
          });
        }
      }

      processed++;
    }

    return NextResponse.json({ processed }, { status: 200 });
  } catch (error) {
    console.error('Audit error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
