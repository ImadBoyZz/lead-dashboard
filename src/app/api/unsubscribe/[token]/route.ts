import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { verifyUnsubscribeToken } from '@/lib/unsubscribe';

async function processUnsubscribe(token: string): Promise<NextResponse> {
  const verification = verifyUnsubscribeToken(token);
  if (!verification.valid) {
    return NextResponse.json(
      { ok: false, reason: verification.reason },
      { status: 400 },
    );
  }

  const { businessId } = verification;

  const existing = await db
    .select({
      id: schema.businesses.id,
      optOut: schema.businesses.optOut,
      email: schema.businesses.email,
    })
    .from(schema.businesses)
    .where(eq(schema.businesses.id, businessId))
    .limit(1);

  if (existing.length === 0) {
    return NextResponse.json({ ok: false, reason: 'not_found' }, { status: 404 });
  }

  const now = new Date();

  if (!existing[0].optOut) {
    await db
      .update(schema.businesses)
      .set({
        optOut: true,
        optOutAt: now,
        optOutReason: 'user_unsubscribe_click',
        updatedAt: now,
      })
      .where(eq(schema.businesses.id, businessId));

    // Cancel alle pending + approved drafts zodat geen verdere mails vertrekken
    await db
      .update(schema.outreachDrafts)
      .set({ status: 'rejected', updatedAt: now })
      .where(
        and(
          eq(schema.outreachDrafts.businessId, businessId),
          inArray(schema.outreachDrafts.status, ['pending', 'approved']),
        ),
      );
  }

  return NextResponse.json({ ok: true });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  return processUnsubscribe(token);
}

// Sommige clients (inclusief Gmail's one-click) gebruiken GET met specifieke
// params; wij ondersteunen dat ook voor robuustheid, maar de primaire flow
// is POST via List-Unsubscribe-Post header.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  // Alleen uitvoeren als Gmail expliciet de one-click parameter meestuurt.
  const url = new URL(req.url);
  const oneClick = url.searchParams.get('List-Unsubscribe') === 'One-Click';
  if (oneClick) return processUnsubscribe(token);
  // Anders redirect naar de landing page zodat de gebruiker kan bevestigen.
  return NextResponse.redirect(new URL(`/unsubscribe/${token}`, req.url));
}
