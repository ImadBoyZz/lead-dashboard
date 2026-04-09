import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { isValidSession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  if (!isValidSession(request)) {
    return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
  }

  const campaignId = request.nextUrl.searchParams.get('campaignId');
  if (!campaignId) {
    return NextResponse.json({ error: 'campaignId is vereist' }, { status: 400 });
  }

  try {
    const drafts = await db
      .select({
        id: schema.outreachDrafts.id,
        businessId: schema.outreachDrafts.businessId,
        campaignId: schema.outreachDrafts.campaignId,
        channel: schema.outreachDrafts.channel,
        subject: schema.outreachDrafts.subject,
        body: schema.outreachDrafts.body,
        tone: schema.outreachDrafts.tone,
        status: schema.outreachDrafts.status,
        variantIndex: schema.outreachDrafts.variantIndex,
        createdAt: schema.outreachDrafts.createdAt,
        businessName: schema.businesses.name,
        businessSector: schema.businesses.sector,
        businessCity: schema.businesses.city,
      })
      .from(schema.outreachDrafts)
      .leftJoin(schema.businesses, eq(schema.outreachDrafts.businessId, schema.businesses.id))
      .where(eq(schema.outreachDrafts.campaignId, campaignId))
      .orderBy(schema.businesses.name);

    return NextResponse.json(drafts);
  } catch (error) {
    console.error('Fetch drafts error:', error);
    return NextResponse.json({ error: 'Interne serverfout' }, { status: 500 });
  }
}
