// Per-dag budget tracker. Hard fail zodra `daily_budget_eur` uit systemSettings
// overschreden is — voorkomt runaway AI-kosten bij bugs of prompt loops.
// Plan §Cost circuit breaker.

import { gte, sql as dsql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { getSetting } from '@/lib/settings/system-settings';

export class BudgetExceededError extends Error {
  readonly spent: number;
  readonly budget: number;
  constructor(spent: number, budget: number) {
    super(`Dagelijkse AI-budget overschreden: €${spent.toFixed(4)} / €${budget.toFixed(2)}`);
    this.name = 'BudgetExceededError';
    this.spent = spent;
    this.budget = budget;
  }
}

export interface BudgetStatus {
  spentEur: number;
  budgetEur: number;
  remainingEur: number;
  exceeded: boolean;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Huidige stand van zaken voor vandaag (UTC midnight tot nu).
 * Telt alle `ai_usage_log.cost_estimate` sinds start van de dag.
 */
export async function getTodayBudgetStatus(): Promise<BudgetStatus> {
  const budgetEur = await getSetting('daily_budget_eur');
  const since = startOfToday();

  const [row] = await db
    .select({
      total: dsql<number | null>`COALESCE(SUM(${schema.aiUsageLog.costEstimate}), 0)`,
    })
    .from(schema.aiUsageLog)
    .where(gte(schema.aiUsageLog.createdAt, since));

  const spentEur = Number(row?.total ?? 0);
  return {
    spentEur,
    budgetEur,
    remainingEur: Math.max(0, budgetEur - spentEur),
    exceeded: spentEur >= budgetEur,
  };
}

/**
 * Gooit BudgetExceededError wanneer vandaag het budget op is.
 * Gebruik als eerste regel in /enrich/* en /qualify endpoints.
 */
export async function assertBudgetAvailable(): Promise<void> {
  const status = await getTodayBudgetStatus();
  if (status.exceeded) {
    throw new BudgetExceededError(status.spentEur, status.budgetEur);
  }
}

/**
 * Check of na een geschatte extra kost nog ruimte is. Voor dure calls
 * (Opus visual ~€0,01, NeverBounce SMTP ~€0,007) waar we vooraf willen beslissen.
 */
export async function hasBudgetFor(estimatedEur: number): Promise<boolean> {
  const status = await getTodayBudgetStatus();
  return status.spentEur + estimatedEur <= status.budgetEur;
}

/**
 * Log een AI-call kost naar ai_usage_log. Single source of truth voor budget tracking.
 */
export async function trackAiCost(params: {
  endpoint: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costEur: number;
  businessId?: string;
  campaignId?: string;
}): Promise<void> {
  await db.insert(schema.aiUsageLog).values({
    endpoint: params.endpoint,
    aiProvider: params.provider,
    aiModel: params.model,
    promptTokens: params.promptTokens,
    completionTokens: params.completionTokens,
    totalTokens: params.promptTokens + params.completionTokens,
    costEstimate: params.costEur,
    businessId: params.businessId,
    campaignId: params.campaignId,
  });
}
