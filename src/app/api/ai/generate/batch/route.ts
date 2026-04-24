import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isValidSession } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { ITEMS_PER_PAGE } from '@/lib/constants';
import { assertBudgetAvailable, BudgetExceededError } from '@/lib/cost-guard';
import {
  generateDraftsForBusinesses,
  ExperimentNotFoundError,
  DefaultCadenceMissingError,
} from '@/lib/outbound/generate-drafts-batch';

// Pro plan: ruim genoeg voor 25 sequentiële AI calls
export const maxDuration = 300;

const batchSchema = z.object({
  businessIds: z.array(z.string().uuid()).min(1).max(ITEMS_PER_PAGE),
  channel: z.enum(['email', 'phone']),
  templateStyle: z.string().optional(),
  experimentId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  if (!(await isValidSession(request))) {
    return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
  }

  const { allowed } = rateLimit('ai-batch', 3, 3_600_000); // 3 per uur
  if (!allowed) {
    return NextResponse.json({ error: 'Te veel batch verzoeken. Probeer het later opnieuw.' }, { status: 429 });
  }

  try {
    const body = await request.json();
    const parsed = batchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validatie mislukt', details: parsed.error.flatten() }, { status: 400 });
    }

    try {
      await assertBudgetAvailable();
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        return NextResponse.json(
          { error: err.message, spent: err.spent, budget: err.budget },
          { status: 429 },
        );
      }
      throw err;
    }

    const { businessIds, channel, experimentId } = parsed.data;

    try {
      const result = await generateDraftsForBusinesses({
        businessIds,
        channel,
        experimentId,
      });

      return NextResponse.json({
        campaignId: result.campaignId,
        count: result.count,
        skipped: result.skipped.length,
        skippedDetails: result.skipped,
        stoppedEarly: result.stoppedEarly,
        stoppedReason: result.stoppedReason,
        totalUsage: {
          promptTokens: result.totalPromptTokens,
          completionTokens: result.totalCompletionTokens,
        },
      });
    } catch (err) {
      if (err instanceof ExperimentNotFoundError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      if (err instanceof DefaultCadenceMissingError) {
        return NextResponse.json({ error: err.message }, { status: 500 });
      }
      throw err;
    }
  } catch (error) {
    console.error('Batch generate error:', error);
    return NextResponse.json({ error: 'Interne serverfout' }, { status: 500 });
  }
}
