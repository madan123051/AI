import { createMockAiAdapter } from "@/lib/ai/mockAiAdapter";
import { createOpenRouterAdapter, hasOpenRouterApiKey } from "@/lib/ai/openRouterAdapter";
import { getAiModelDefinition, getConfiguredOpenRouterModel } from "@/lib/ai/baseAiAdapter";
import type { AiModelId } from "@/lib/types";

export function createSelectedAiAdapter(modelId: AiModelId) {
  const definition = getAiModelDefinition(modelId);
  const modelName = getConfiguredOpenRouterModel(definition);

  if (!hasOpenRouterApiKey()) {
    return createMockAiAdapter(definition, modelName);
  }

  return createOpenRouterAdapter(definition, modelName);
}
