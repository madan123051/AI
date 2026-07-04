"use client";

import { Bot, BrainCircuit, Cpu, SearchCode, Sparkles } from "lucide-react";
import { aiModels } from "@/lib/orchestrator/taskRunner";
import type { AiModelId } from "@/lib/types";

const iconMap = {
  gpt: Sparkles,
  gemini: BrainCircuit,
  claude: Bot,
  codex: Cpu,
  deepseek: SearchCode,
} satisfies Record<AiModelId, typeof Sparkles>;

interface AiSwitcherProps {
  selected: AiModelId;
  onSelect: (modelId: AiModelId) => void;
}

export function AiSwitcher({ selected, onSelect }: AiSwitcherProps) {
  return (
    <div className="inline-flex w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/80 p-1 sm:w-auto" aria-label="AI model switcher">
      {aiModels.map((model) => {
        const Icon = iconMap[model.id];
        const active = selected === model.id;

        return (
          <button
            key={model.id}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(model.id)}
            className={`flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition sm:flex-none ${
              active
                ? "bg-emerald-400 text-zinc-950 shadow-sm"
                : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
            }`}
            title={`${model.label} adapter`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span>{model.label}</span>
          </button>
        );
      })}
    </div>
  );
}
