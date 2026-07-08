import type { AiAdapter, AiModelDefinition, StructuredAiResult } from "@/lib/ai/baseAiAdapter";
import { normalizeTokenUsage } from "@/lib/ai/costs";
import type { HandoffPack, TokenUsage } from "@/lib/types";

interface LocalAiChoice {
  message?: {
    content?: string;
  };
}

interface LocalAiResponse {
  choices?: LocalAiChoice[];
  usage?: Partial<TokenUsage>;
  error?: {
    message?: string;
  };
}

const LOCAL_AI_OFFLINE_MESSAGE = "Local AI server not running.";

function getLocalAiBaseUrl() {
  return (process.env.LOCAL_AI_BASE_URL?.trim() || "http://localhost:1234/v1").replace(/\/+$/, "");
}

function getLocalAiApiKey() {
  return process.env.LOCAL_AI_API_KEY?.trim() || "local";
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

function parseStructuredResult(content: string, modelName: string, usage: TokenUsage): StructuredAiResult {
  const parsed = JSON.parse(stripJsonFence(content)) as Partial<StructuredAiResult>;

  if (
    typeof parsed.current_stage !== "string" ||
    typeof parsed.next_step !== "string" ||
    typeof parsed.response_summary !== "string" ||
    typeof parsed.needs_review !== "boolean"
  ) {
    throw new Error("Local AI response did not match the required handoff JSON shape.");
  }

  return {
    current_stage: parsed.current_stage,
    completed_steps: coerceStringArray(parsed.completed_steps),
    next_step: parsed.next_step,
    response_summary: parsed.response_summary,
    needs_review: parsed.needs_review,
    raw_response: content,
    source: "local",
    model: modelName,
    cost_usd: 0,
    token_usage: usage,
  };
}

function buildPrompt(handoffPack: HandoffPack) {
  return JSON.stringify(
    {
      instruction:
        "Continue this task from the saved handoff pack. Follow brand voice and rules. Return only valid JSON with the required keys. Do not include markdown fences.",
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

async function fetchLocalAi(endpoint: string, apiKey: string, modelName: string, handoffPack: HandoffPack) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);

  try {
    return await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelName,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You are the AI Handover Engine running locally. Continue task state from a handoff pack. Follow brand voice and rule engine constraints. Return only structured JSON. Do not perform external actions.",
          },
          {
            role: "user",
            content: buildPrompt(handoffPack),
          },
        ],
      }),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "AbortError" || error.message.toLowerCase().includes("fetch failed"))) {
      throw new Error(LOCAL_AI_OFFLINE_MESSAGE);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function createLocalAiAdapter(definition: AiModelDefinition, modelName: string): AiAdapter {
  return {
    id: definition.id,
    label: definition.label,
    provider: definition.provider,
    modelName,
    source: "local",
    async continueTask({ handoff }) {
      const endpoint = `${getLocalAiBaseUrl()}/chat/completions`;
      const response = await fetchLocalAi(endpoint, getLocalAiApiKey(), modelName, handoff.handoff_pack);

      let payload: LocalAiResponse;
      try {
        payload = (await response.json()) as LocalAiResponse;
      } catch {
        if (!response.ok) {
          throw new Error(`Local AI request failed with ${response.status}`);
        }

        throw new Error("Local AI response was not valid JSON.");
      }

      if (!response.ok) {
        throw new Error(payload.error?.message ?? `Local AI request failed with ${response.status}`);
      }

      const content = payload.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error("Local AI response did not include message content.");
      }

      const usage = normalizeTokenUsage(payload.usage);

      return parseStructuredResult(content, modelName, usage);
    },
  };
}
