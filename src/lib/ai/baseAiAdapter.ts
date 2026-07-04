import type { AiModelId, HandoffSummary, Task, TaskState, TokenUsage } from "@/lib/types";

export interface AiModelDefinition {
  id: AiModelId;
  label: string;
  provider: string;
  defaultModel: string;
  envModelKey: string;
}

export const AI_MODEL_DEFINITIONS: AiModelDefinition[] = [
  {
    id: "gpt",
    label: "GPT",
    provider: "OpenAI",
    defaultModel: "openai/gpt-4o-mini",
    envModelKey: "OPENROUTER_GPT_MODEL",
  },
  {
    id: "codex",
    label: "Codex",
    provider: "OpenAI",
    defaultModel: "openai/gpt-5-codex",
    envModelKey: "OPENROUTER_CODEX_MODEL",
  },
  {
    id: "gemini",
    label: "Gemini",
    provider: "Google",
    defaultModel: "google/gemini-2.5-flash",
    envModelKey: "OPENROUTER_GEMINI_MODEL",
  },
  {
    id: "claude",
    label: "Claude",
    provider: "Anthropic",
    defaultModel: "anthropic/claude-3.5-sonnet",
    envModelKey: "OPENROUTER_CLAUDE_MODEL",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    provider: "DeepSeek",
    defaultModel: "deepseek/deepseek-chat",
    envModelKey: "OPENROUTER_DEEPSEEK_MODEL",
  },
];

export interface AiHandoffInput {
  task: Task;
  taskState: TaskState;
  handoff: HandoffSummary;
  modelId: AiModelId;
}

export interface StructuredAiResult {
  current_stage: string;
  completed_steps: string[];
  next_step: string;
  response_summary: string;
  needs_review: boolean;
  raw_response?: string;
  source: "openrouter" | "mock";
  model: string;
  cost_usd?: number;
  token_usage?: TokenUsage;
}

export interface AiAdapter {
  id: string;
  label: string;
  provider: string;
  modelName: string;
  source: "openrouter" | "mock";
  continueTask(input: AiHandoffInput): Promise<StructuredAiResult>;
}

export function getAiModelDefinition(modelId: AiModelId) {
  return AI_MODEL_DEFINITIONS.find((model) => model.id === modelId) ?? AI_MODEL_DEFINITIONS[0];
}

export function getConfiguredOpenRouterModel(definition: AiModelDefinition) {
  return process.env[definition.envModelKey]?.trim() || definition.defaultModel;
}


