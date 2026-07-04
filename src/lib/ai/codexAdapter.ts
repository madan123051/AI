import type { AiAdapter } from "./baseAdapter";

export const codexAdapter: AiAdapter = {
  id: "codex",
  label: "Codex",
  provider: "Codex",
  async generateResponse({ task }) {
    return {
      output: `Draft caption for ${task.title}: Small world, giant details. Every frame reveals a survival machine hiding in plain sight.`,
      suggestedCompletedSteps: ["brief parsed", "caption draft created"],
      suggestedNextStep: "generate hashtags and prepare review packet",
      needsReview: false,
    };
  },
  async continueTask({ taskState }) {
    return {
      output: `Continuing from saved state: ${taskState.next_step}. Hashtags: #macro #wildlife #insectsofinstagram #naturedetails #wildsaura`,
      suggestedCompletedSteps: ["handoff summary read", "hashtags generated", "approval packet prepared"],
      suggestedNextStep: "review caption and hashtags before publishing",
      needsReview: true,
    };
  },
  async summarizeHandoff({ taskState }) {
    return `Continue from ${taskState.current_stage}. Next action: ${taskState.next_step}.`;
  },
};
