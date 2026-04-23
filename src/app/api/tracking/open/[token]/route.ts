import { NextRequest, NextResponse } from 'next/server';
import { eq, sql as dsql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { verifyOpenTrackingToken } from '@/lib/tracking';

// 1x1 transparent PNG (67 bytes, smallest valid).
const PIXEL_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

function pixelResponse(): NextResponse {
  return new NextResponse(PIXEL_BYTES, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(PIXEL_BYTES.length),
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const verified = verifyOpenTrackingToken(token);

  // Graceful failure: altijd PNG return zodat client geen broken-image krijgt;
  // log intern voor diagnose.
  if (!verified.valid) {
    console.warn(`[tracking/open] invalid token (${verified.reason}): ${token.slice(0, 40)}...`);
    return pixelResponse();
  }

  try {
    await db
      .update(schema.outreachLog)
      .set({
        openedAt: dsql`COALESCE(${schema.outreachLog.openedAt}, NOW())`,
        openedCount: dsql`${schema.outreachLog.openedCount} + 1`,
      })
      .where(eq(schema.outreachLog.id, verified.outreachLogId));
  } catch (err) {
    console.error('[tracking/open] DB update failed', err);
  }

  return pixelResponse();
}
