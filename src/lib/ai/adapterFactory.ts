import { createMockAiAdapter } from "@/lib/ai/mockAiAdapter";
import { createOpenRouterAdapter, hasOpenRouterApiKey } from "@/lib/ai/openRouterAdapter";
import { createLocalAiAdapter } from "@/lib/ai/localAiAdapter";
import { getAiModelDefinition, getConfiguredLocalAiModel, getConfiguredOpenRouterModel } from "@/lib/ai/baseAiAdapter";
import type { AiModelId } from "@/lib/types";

export function createSelectedAiAdapter(modelId: AiModelId) {
  const definition = getAiModelDefinition(modelId);

  if (modelId === "local") {
    return createLocalAiAdapter(definition, getConfiguredLocalAiModel(definition));
  }

  const modelName = getConfiguredOpenRouterModel(definition);

  if (!hasOpenRouterApiKey()) {
    return createMockAiAdapter(definition, modelName);
  }

  return createOpenRouterAdapter(definition, modelName);
}
