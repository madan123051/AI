import type { TokenUsage } from "@/lib/types";

interface ModelPricing {
  promptPerMillion: number;
  completionPerMillion: number;
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  "openai/gpt-4o-mini": { promptPerMillion: 0.15, completionPerMillion: 0.6 },
  "openai/gpt-5-codex": { promptPerMillion: 1.25, completionPerMillion: 10 },
  "google/gemini-2.5-flash": { promptPerMillion: 0.3, completionPerMillion: 2.5 },
  "anthropic/claude-3.5-sonnet": { promptPerMillion: 3, completionPerMillion: 15 },
  "deepseek/deepseek-chat": { promptPerMillion: 0.14, completionPerMillion: 0.28 },
};

export function normalizeTokenUsage(usage?: Partial<TokenUsage> | null): TokenUsage {
  const promptTokens = Number(usage?.prompt_tokens ?? 0);
  const completionTokens = Number(usage?.completion_tokens ?? 0);
  const totalTokens = Number(usage?.total_tokens ?? promptTokens + completionTokens);

  return {
    prompt_tokens: Number.isFinite(promptTokens) ? promptTokens : 0,
    completion_tokens: Number.isFinite(completionTokens) ? completionTokens : 0,
    total_tokens: Number.isFinite(totalTokens) ? totalTokens : 0,
  };
}

export function estimateCostUsd(modelName: string, usage: TokenUsage) {
  const pricing = MODEL_PRICING[modelName];

  if (!pricing) {
    return 0;
  }

  const promptCost = (usage.prompt_tokens / 1_000_000) * pricing.promptPerMillion;
  const completionCost = (usage.completion_tokens / 1_000_000) * pricing.completionPerMillion;

  return Number((promptCost + completionCost).toFixed(6));
}
