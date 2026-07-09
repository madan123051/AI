import { getAiModelDefinition, getConfiguredLocalAiModel, getConfiguredOpenRouterModel } from "@/lib/ai/baseAiAdapter";
import { hasOpenRouterApiKey } from "@/lib/ai/openRouterAdapter";
import type { AiModelId, ChatToolCall, ChatToolName } from "@/lib/types";

type ChatModelResult = {
  answer: string;
  tool_calls: ChatToolCall[];
  source: "openrouter" | "local" | "mock";
  model: string;
  error?: string;
};

type ChatJsonPayload = {
  answer?: unknown;
  tool_calls?: unknown;
};

type OpenRouterPayload = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

type LocalPayload = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string; code?: string };
  content?: string;
  message?: { content?: string };
  output?: string | Array<{ content?: string }>;
  response?: string;
  text?: string;
};

const allowedToolNames: ChatToolName[] = [
  "search_tasks",
  "summarize_inbox",
  "create_task",
  "draft_reply",
  "review_media",
  "generate_content_ideas",
  "schedule_content",
  "list_pending_approvals",
  "open_project_context",
  "generate_handoff",
];

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
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

function isAllowedToolName(value: unknown): value is ChatToolName {
  return typeof value === "string" && allowedToolNames.includes(value as ChatToolName);
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function parseToolCalls(value: unknown): ChatToolCall[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => recordValue(item))
    .filter((item) => isAllowedToolName(item.name))
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : makeId("tool"),
      name: item.name as ChatToolName,
      arguments: recordValue(item.arguments),
      reason: typeof item.reason === "string" ? item.reason : "AI requested this safe tool.",
    }));
}

function parseChatResult(content: string, source: ChatModelResult["source"], model: string): ChatModelResult {
  const parsed = JSON.parse(extractJsonObject(content)) as ChatJsonPayload;

  return {
    answer:
      typeof parsed.answer === "string" && parsed.answer.trim()
        ? parsed.answer.trim()
        : "I reviewed the current Control Center context and prepared the next safe step.",
    tool_calls: parseToolCalls(parsed.tool_calls),
    source,
    model,
  };
}

function buildSystemPrompt() {
  return [
    "You are AI Chat Command Center for AI Control Center.",
    "Return only valid JSON with keys: answer (string), tool_calls (array).",
    `Allowed tool names: ${allowedToolNames.join(", ")}.`,
    "Never invent tools. Never execute publish, delete, send email, reply comment, or update live content directly.",
    "If the user asks for risky external action, explain that approval is required; the app will create the approval through its safety layer.",
  ].join(" ");
}

function buildUserPrompt(input: { message: string; contextSummary: string }) {
  return JSON.stringify(
    {
      user_message: input.message,
      control_center_context: input.contextSummary,
      tool_call_shape: {
        id: "string",
        name: allowedToolNames[0],
        arguments: {},
        reason: "short reason",
      },
      answer_style: "Be concise, practical, and mention any tool cards created by the app.",
    },
    null,
    2,
  );
}

function fallbackResult(input: { message: string; model: string; error?: string }): ChatModelResult {
  const errorNote = input.error ? ` ${input.error}` : "";

  return {
    answer: `I can help from here. I will use the safe Control Center tools when your message asks for tasks, inbox summaries, drafts, schedules, approvals, project context, or handoffs.${errorNote}`,
    tool_calls: [],
    source: "mock",
    model: input.model,
    error: input.error,
  };
}

function localEndpointMode() {
  return process.env.LOCAL_AI_ENDPOINT_MODE?.trim().toLowerCase() === "lmstudio" ? "lmstudio" : "openai";
}

function localBaseUrl(mode: string) {
  return (process.env.LOCAL_AI_BASE_URL?.trim() || (mode === "lmstudio" ? "http://localhost:1234" : "http://localhost:1234/v1")).replace(
    /\/+$/,
    "",
  );
}

function localEndpoint(baseUrl: string, mode: string) {
  if (mode === "lmstudio") {
    return `${baseUrl.replace(/\/api\/v1$/i, "")}/api/v1/chat`;
  }

  return baseUrl.endsWith("/v1") ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
}

function extractLocalContent(payload: LocalPayload) {
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

async function runLocalChat(input: { modelId: AiModelId; message: string; contextSummary: string }) {
  const definition = getAiModelDefinition(input.modelId);
  const model = getConfiguredLocalAiModel(definition);
  const mode = localEndpointMode();
  const endpoint = localEndpoint(localBaseUrl(mode), mode);
  const apiKey = process.env.LOCAL_AI_API_KEY?.trim() ?? (mode === "lmstudio" ? "" : "local");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);

  try {
    const body =
      mode === "lmstudio"
        ? {
            model,
            system_prompt: buildSystemPrompt(),
            input: buildUserPrompt(input),
          }
        : {
            model,
            temperature: 0.2,
            messages: [
              { role: "system", content: buildSystemPrompt() },
              { role: "user", content: buildUserPrompt(input) },
            ],
          };
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as LocalPayload;

    if (!response.ok) {
      throw new Error(payload.error?.message || `Local AI request failed with ${response.status}`);
    }

    const content = extractLocalContent(payload);

    if (!content) {
      throw new Error("Local AI response did not include message content.");
    }

    return parseChatResult(content, "local", model);
  } catch (error) {
    const message = error instanceof Error && (error.name === "AbortError" || error.message.toLowerCase().includes("fetch failed"))
      ? "Local AI server not running."
      : error instanceof Error
        ? error.message
        : "Local AI failed.";

    return fallbackResult({ message: input.message, model, error: message });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function runOpenRouterChat(input: { modelId: AiModelId; message: string; contextSummary: string }) {
  const definition = getAiModelDefinition(input.modelId);
  const model = getConfiguredOpenRouterModel(definition);

  if (!hasOpenRouterApiKey()) {
    return fallbackResult({ message: input.message, model, error: "OpenRouter key is not configured, so mock planning was used." });
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY?.trim() ?? ""}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
        "X-Title": "AI Handover Control Center",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: buildUserPrompt(input) },
        ],
      }),
    });
    const payload = (await response.json()) as OpenRouterPayload;

    if (!response.ok) {
      throw new Error(payload.error?.message ?? `OpenRouter request failed with ${response.status}`);
    }

    const content = payload.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("OpenRouter response did not include message content.");
    }

    return parseChatResult(content, "openrouter", model);
  } catch (error) {
    return fallbackResult({
      message: input.message,
      model,
      error: error instanceof Error ? error.message : "OpenRouter chat failed.",
    });
  }
}

export async function runChatCommandModel(input: { modelId: AiModelId; message: string; contextSummary: string }) {
  if (input.modelId === "local") {
    return runLocalChat(input);
  }

  return runOpenRouterChat(input);
}
