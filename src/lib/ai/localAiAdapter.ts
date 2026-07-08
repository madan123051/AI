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
  stats?: {
    input_tokens?: number;
    total_output_tokens?: number;
  };
  error?: {
    message?: string;
    code?: string;
  };
  content?: string;
  message?: {
    content?: string;
  };
  output?:
    | string
    | Array<{
        type?: string;
        content?: string;
      }>;
  response?: string;
  text?: string;
}

const LOCAL_AI_OFFLINE_MESSAGE = "Local AI server not running.";
type LocalAiEndpointMode = "openai" | "lmstudio";

function getLocalAiEndpointMode(): LocalAiEndpointMode {
  return process.env.LOCAL_AI_ENDPOINT_MODE?.trim().toLowerCase() === "lmstudio" ? "lmstudio" : "openai";
}

function getLocalAiBaseUrl(mode: LocalAiEndpointMode) {
  return (process.env.LOCAL_AI_BASE_URL?.trim() || (mode === "lmstudio" ? "http://localhost:1234" : "http://localhost:1234/v1")).replace(
    /\/+$/,
    "",
  );
}

function getLocalAiApiKey(mode: LocalAiEndpointMode) {
  const configuredKey = process.env.LOCAL_AI_API_KEY?.trim();
  return configuredKey ?? (mode === "lmstudio" ? "" : "local");
}

function buildEndpoint(baseUrl: string, mode: LocalAiEndpointMode) {
  if (mode === "lmstudio") {
    return `${baseUrl.replace(/\/api\/v1$/i, "")}/api/v1/chat`;
  }

  return baseUrl.endsWith("/v1") ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
}

function stripJsonFence(value: string) {
  const trimmed = value.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

function extractJsonObject(value: string) {
  const unfenced = stripJsonFence(value);
  const firstBrace = unfenced.indexOf("{");
  const lastBrace = unfenced.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return unfenced.slice(firstBrace, lastBrace + 1);
  }

  return unfenced;
}

function coerceStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function parseStructuredResult(content: string, modelName: string, usage: TokenUsage): StructuredAiResult {
  const parsed = JSON.parse(extractJsonObject(content)) as Partial<StructuredAiResult>;

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

function buildHeaders(apiKey: string) {
  return {
    ...(apiKey.length > 0 ? { Authorization: `Bearer ${apiKey}` } : {}),
    "Content-Type": "application/json",
  };
}

function buildRequestBody(mode: LocalAiEndpointMode, modelName: string, handoffPack: HandoffPack) {
  const systemPrompt =
    "You are the AI Handover Engine running locally. Continue task state from a handoff pack. Follow brand voice and rule engine constraints. Return only structured JSON. Do not perform external actions.";

  if (mode === "lmstudio") {
    return {
      model: modelName,
      system_prompt: systemPrompt,
      input: buildPrompt(handoffPack),
    };
  }

  return {
    model: modelName,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: buildPrompt(handoffPack),
      },
    ],
  };
}

function getLocalAiAuthError(payload: LocalAiResponse) {
  const message = payload.error?.message ?? "";
  const code = payload.error?.code ?? "";

  if (code === "invalid_api_key" || message.toLowerCase().includes("api token") || message.toLowerCase().includes("api key")) {
    return "Local AI API key is missing or invalid. Add a valid LM Studio token to LOCAL_AI_API_KEY.";
  }

  return "";
}

function extractContent(payload: LocalAiResponse) {
  if (Array.isArray(payload.output)) {
    return payload.output
      .map((item) => item.content)
      .filter((content): content is string => typeof content === "string" && content.trim().length > 0)
      .join("\n");
  }

  return (
    payload.choices?.[0]?.message?.content ??
    payload.message?.content ??
    payload.content ??
    payload.output ??
    payload.response ??
    payload.text ??
    ""
  );
}

function getTokenUsage(payload: LocalAiResponse) {
  if (payload.usage) {
    return normalizeTokenUsage(payload.usage);
  }

  return normalizeTokenUsage({
    prompt_tokens: payload.stats?.input_tokens,
    completion_tokens: payload.stats?.total_output_tokens,
    total_tokens:
      typeof payload.stats?.input_tokens === "number" && typeof payload.stats?.total_output_tokens === "number"
        ? payload.stats.input_tokens + payload.stats.total_output_tokens
        : undefined,
  });
}

async function fetchLocalAi(endpoint: string, apiKey: string, mode: LocalAiEndpointMode, modelName: string, handoffPack: HandoffPack) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);

  try {
    return await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: buildHeaders(apiKey),
      body: JSON.stringify(buildRequestBody(mode, modelName, handoffPack)),
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
      const mode = getLocalAiEndpointMode();
      const endpoint = buildEndpoint(getLocalAiBaseUrl(mode), mode);
      const response = await fetchLocalAi(endpoint, getLocalAiApiKey(mode), mode, modelName, handoff.handoff_pack);

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
        throw new Error(getLocalAiAuthError(payload) || payload.error?.message || `Local AI request failed with ${response.status}`);
      }

      const content = extractContent(payload);

      if (!content) {
        throw new Error("Local AI response did not include message content.");
      }

      const usage = getTokenUsage(payload);

      return parseStructuredResult(content, modelName, usage);
    },
  };
}
