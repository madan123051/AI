import type { HandoffSummary, Task, TaskState } from "@/lib/types";

export interface GenerateResponseInput {
  task: Task;
  taskState: TaskState;
  handoff?: HandoffSummary;
}

export interface GenerateResponseResult {
  output: string;
  suggestedCompletedSteps: string[];
  suggestedNextStep: string;
  needsReview: boolean;
}

export interface AiAdapter {
  id: string;
  label: string;
  provider: string;
  generateResponse(input: GenerateResponseInput): Promise<GenerateResponseResult>;
  continueTask(input: GenerateResponseInput): Promise<GenerateResponseResult>;
  summarizeHandoff(input: GenerateResponseInput): Promise<string>;
}
