import { AI_MODEL_DEFINITIONS, getAiModelDefinition } from "@/lib/ai/baseAiAdapter";
import { buildHandoffPack } from "@/lib/ai/handoffBuilder";
import type { ActionLog, AiModelId, AiRun, HandoffSummary, ProjectMemory, Rule, Task, TaskState } from "@/lib/types";

export const aiModels = AI_MODEL_DEFINITIONS.map(({ id, label, provider }) => ({ id, label, provider }));

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function uniqueSteps(steps: string[]) {
  return Array.from(new Set(steps.filter((step) => step.trim().length > 0)));
}

export function getModelLabel(modelId: AiModelId) {
  return getAiModelDefinition(modelId).label;
}

function makeLog(projectId: string, taskId: string, actor: string, action: string, details: string): ActionLog {
  return {
    id: makeId("log"),
    project_id: projectId,
    task_id: taskId,
    actor,
    action,
    details,
    created_at: new Date().toISOString(),
  };
}

interface RunnerArgs {
  task: Task;
  state: TaskState;
  projectId: string;
  modelId: AiModelId;
}

interface HandoffArgs extends RunnerArgs {
  logs: ActionLog[];
  memory?: ProjectMemory;
  rules?: Rule[];
}

export interface StartTaskResult {
  state: TaskState;
  run: AiRun;
  log: ActionLog;
}

export interface GenerateHandoffResult {
  handoff: HandoffSummary;
  log: ActionLog;
}

export function startTaskWithAi({ task, state, projectId, modelId }: RunnerArgs): StartTaskResult {
  const now = new Date().toISOString();
  const aiLabel = getModelLabel(modelId);
  const output = [
    `Caption draft for ${task.title}`,
    "Small world, giant details. A tiny subject turns into a full survival story when the lens gets close.",
    "Draft status: caption ready, hashtags pending.",
  ].join("\n\n");

  const nextState: TaskState = {
    ...state,
    current_stage: "caption ready, hashtags pending",
    completed_steps: uniqueSteps([...state.completed_steps, "brief parsed", "caption draft created"]),
    next_step: "generate hashtags and prepare approval packet",
    last_ai: aiLabel,
    status: "in_progress",
    needs_review: false,
    updated_at: now,
  };

  return {
    state: nextState,
    run: {
      id: makeId("run"),
      task_id: task.id,
      ai_model: aiLabel,
      input: `Goal: ${state.goal}\nStage: ${state.current_stage}`,
      output,
      status: "completed",
      cost_usd: 0,
      created_at: now,
    },
    log: makeLog(projectId, task.id, aiLabel, "ai.run.completed", `${aiLabel} created the caption draft and saved the next step.`),
  };
}

export function generateHandoffForTask({ task, state, projectId, modelId, logs, memory, rules }: HandoffArgs): GenerateHandoffResult {
  const aiLabel = getModelLabel(modelId);
  const handoff = buildHandoffPack({ task, state, logs, fromAi: state.last_ai, toAi: aiLabel, memory, rules });

  return {
    handoff,
    log: makeLog(
      projectId,
      task.id,
      "Handoff Brain",
      "handoff.generated",
      `Generated ${handoff.completeness_score}% handoff from ${handoff.from_ai} to ${handoff.to_ai}.`,
    ),
  };
}

