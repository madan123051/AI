import type { AiAdapter, AiModelDefinition, StructuredAiResult } from "@/lib/ai/baseAiAdapter";
import type { HandoffPack } from "@/lib/types";

function dedupeSteps(steps: string[]) {
  return Array.from(new Set(steps.filter((step) => step.trim().length > 0)));
}

function buildMockResult(label: string, modelName: string, handoffPack: HandoffPack): StructuredAiResult {
  return {
    current_stage: `${label} structured continuation ready, review pending`,
    completed_steps: dedupeSteps([
      ...handoffPack.completed_steps,
      "handoff pack read",
      `${label} structured response generated`,
      "review packet prepared",
    ]),
    next_step: "review the structured AI continuation before any external action",
    response_summary: `${label} used the saved handoff pack to continue from ${handoffPack.current_stage}. Mock fallback was used because OPENROUTER_API_KEY is not configured.`,
    needs_review: true,
    source: "mock",
    model: modelName,
    cost_usd: 0,
    token_usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

export function createMockAiAdapter(definition: AiModelDefinition, modelName: string): AiAdapter {
  return {
    id: definition.id,
    label: definition.label,
    provider: definition.provider,
    modelName,
    source: "mock",
    async continueTask({ handoff }) {
      return buildMockResult(definition.label, modelName, handoff.handoff_pack);
    },
  };
}

