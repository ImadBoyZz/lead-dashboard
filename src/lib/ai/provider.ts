import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { env } from '@/lib/env';

// ── AI Provider Interface ─────────────────────────────

export interface AIResponse {
  text: string;
  usage: { promptTokens: number; completionTokens: number };
}

interface AIProvider {
  generateText(
    systemPrompt: string,
    userPrompt: string,
    options?: { maxTokens?: number; temperature?: number },
  ): Promise<AIResponse>;
  providerName: string;
  modelName: string;
}

// ── Anthropic Provider ────────────────────────────────

class AnthropicProvider implements AIProvider {
  private client: Anthropic;
  readonly providerName = 'anthropic';
  readonly modelName = 'claude-haiku-4-5-20251001';

  constructor() {
    this.client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }

  async generateText(
    systemPrompt: string,
    userPrompt: string,
    options?: { maxTokens?: number; temperature?: number },
  ): Promise<AIResponse> {
    const response = await this.client.messages.create({
      model: this.modelName,
      max_tokens: options?.maxTokens ?? 2048,
      temperature: options?.temperature ?? 0.7,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textBlock = response.content.find((b) => b.type === 'text');

    return {
      text: textBlock?.text ?? '',
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
      },
    };
  }
}

// ── OpenAI Provider ───────────────────────────────────

class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  readonly providerName = 'openai';
  readonly modelName = 'gpt-4o';

  constructor() {
    this.client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  async generateText(
    systemPrompt: string,
    userPrompt: string,
    options?: { maxTokens?: number; temperature?: number },
  ): Promise<AIResponse> {
    const response = await this.client.chat.completions.create({
      model: this.modelName,
      max_tokens: options?.maxTokens ?? 2048,
      temperature: options?.temperature ?? 0.7,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    return {
      text: response.choices[0]?.message?.content ?? '',
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }
}

// ── Factory ───────────────────────────────────────────

let cachedProvider: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (cachedProvider) return cachedProvider;

  if (env.AI_PROVIDER === 'openai') {
    if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is vereist wanneer AI_PROVIDER=openai');
    cachedProvider = new OpenAIProvider();
  } else {
    if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is vereist wanneer AI_PROVIDER=anthropic');
    cachedProvider = new AnthropicProvider();
  }

  return cachedProvider;
}
