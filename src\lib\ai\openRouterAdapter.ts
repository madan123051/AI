import type { AiAdapter, AiModelDefinition, StructuredAiResult } from "@/lib/ai/baseAiAdapter";
import { estimateCostUsd, normalizeTokenUsage } from "@/lib/ai/costs";
import type { HandoffPack, TokenUsage } from "@/lib/types";

interface OpenRouterChoice {
  message?: {
    content?: string;
  };
}

interface OpenRouterUsage {
  total_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  cost?: number;
}

interface OpenRouterResponse {
  choices?: OpenRouterChoice[];
  usage?: OpenRouterUsage;
  error?: {
    message?: string;
  };
}

function getOpenRouterApiKey() {
  return process.env.OPENROUTER_API_KEY?.trim() ?? "";
}

export function hasOpenRouterApiKey() {
  return getOpenRouterApiKey().length > 0;
}

function stripJsonFence(value: string) {
  const trimmed = value.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

function coerceStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function parseStructuredResult(content: string, modelName: string, usage: TokenUsage, responseCost?: number): StructuredAiResult {
  const parsed = JSON.parse(stripJsonFence(content)) as Partial<StructuredAiResult>;

  if (
    typeof parsed.current_stage !== "string" ||
    typeof parsed.next_step !== "string" ||
    typeof parsed.response_summary !== "string" ||
    typeof parsed.needs_review !== "boolean"
  ) {
    throw new Error("OpenRouter response did not match the required handoff JSON shape.");
  }

  return {
    current_stage: parsed.current_stage,
    completed_steps: coerceStringArray(parsed.completed_steps),
    next_step: parsed.next_step,
    response_summary: parsed.response_summary,
    needs_review: parsed.needs_review,
    raw_response: content,
    source: "openrouter",
    model: modelName,
    cost_usd: typeof responseCost === "number" ? responseCost : estimateCostUsd(modelName, usage),
    token_usage: usage,
  };
}

function buildPrompt(handoffPack: HandoffPack) {
  return JSON.stringify(
    {
      instruction: "Continue this task from the saved handoff pack. Follow brand voice and rules. Return only valid JSON with the required keys.",
      required_json_shape: {
        current_stage: "string",
        completed_steps: ["string"],
        next_step: "string",
        response_summary: "string",
        needs_review: true,
      },
      handoff_pack: handoffPack,
    },
    null,
    2,
  );
}

export function createOpenRouterAdapter(definition: AiModelDefinition, modelName: string): AiAdapter {
  return {
    id: definition.id,
    label: definition.label,
    provider: definition.provider,
    modelName,
    source: "openrouter",
    async continueTask({ handoff }) {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getOpenRouterApiKey()}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
          "X-Title": "AI Handover Control Center",
        },
        body: JSON.stringify({
          model: modelName,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "You are the AI Handover Engine. Continue task state from a handoff pack. Follow brand voice and rule engine constraints. Return only structured JSON. Do not perform external actions.",
            },
            {
              role: "user",
              content: buildPrompt(handoff.handoff_pack),
            },
          ],
        }),
      });

      const payload = (await response.json()) as OpenRouterResponse;

      if (!response.ok) {
        throw new Error(payload.error?.message ?? `OpenRouter request failed with ${response.status}`);
      }

      const content = payload.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error("OpenRouter response did not include message content.");
      }

      const usage = normalizeTokenUsage({
        prompt_tokens: payload.usage?.prompt_tokens,
        completion_tokens: payload.usage?.completion_tokens,
        total_tokens: payload.usage?.total_tokens,
      });

      return parseStructuredResult(content, modelName, usage, payload.usage?.cost);
    },
  };
}
