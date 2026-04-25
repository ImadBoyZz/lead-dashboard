import { db } from '@/lib/db';
import { aiUsageLog } from '@/lib/db/schema';

// Token prijzen per 1M tokens (input/output)
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0 },
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-opus-4-7': { input: 15.0, output: 75.0 },
  'gpt-4o': { input: 2.5, output: 10.0 },
};

export async function logAIUsage(params: {
  endpoint: string;
  aiProvider: string;
  aiModel: string;
  promptTokens: number;
  completionTokens: number;
  businessId?: string;
  campaignId?: string;
}) {
  const totalTokens = params.promptTokens + params.completionTokens;
  const pricing = PRICING[params.aiModel] ?? { input: 0, output: 0 };
  const costEstimate =
    (params.promptTokens / 1_000_000) * pricing.input +
    (params.completionTokens / 1_000_000) * pricing.output;

  await db.insert(aiUsageLog).values({
    endpoint: params.endpoint,
    aiProvider: params.aiProvider,
    aiModel: params.aiModel,
    promptTokens: params.promptTokens,
    completionTokens: params.completionTokens,
    totalTokens,
    costEstimate,
    businessId: params.businessId ?? null,
    campaignId: params.campaignId ?? null,
  });
}
