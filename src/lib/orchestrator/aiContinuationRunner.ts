import { createSelectedAiAdapter } from "@/lib/ai/adapterFactory";
import type { StructuredAiResult } from "@/lib/ai/baseAiAdapter";
import { buildHandoffPack } from "@/lib/ai/handoffBuilder";
import { getModelLabel } from "@/lib/orchestrator/taskRunner";
import { createApprovalForAction, evaluateAction } from "@/lib/rules/rulesEngine";
import type { ActionLog, AiModelId, AiRun, Approval, HandoffSummary, ProjectMemory, Rule, Task, TaskState } from "@/lib/types";

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function uniqueSteps(steps: string[]) {
  return Array.from(new Set(steps.filter((step) => step.trim().length > 0)));
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

function buildRunOutput(aiResult: StructuredAiResult) {
  return JSON.stringify(
    {
      current_stage: aiResult.current_stage,
      completed_steps: aiResult.completed_steps,
      next_step: aiResult.next_step,
      response_summary: aiResult.response_summary,
      needs_review: aiResult.needs_review,
      source: aiResult.source,
      model: aiResult.model,
      token_usage: aiResult.token_usage,
      cost_usd: aiResult.cost_usd ?? 0,
    },
    null,
    2,
  );
}

function buildApprovalReason(aiResult: StructuredAiResult, ruleReason: string, score: number) {
  return [
    ruleReason,
    `Handoff completeness: ${score}%.`,
    `AI summary: ${aiResult.response_summary}`,
  ].join(" ");
}

interface ContinueArgs {
  task: Task;
  state: TaskState;
  projectId: string;
  modelId: AiModelId;
  logs: ActionLog[];
  handoff?: HandoffSummary;
  memory?: ProjectMemory;
  rules?: Rule[];
}

export interface ContinueTaskResult {
  state: TaskState;
  run: AiRun;
  log: ActionLog;
  handoff: HandoffSummary;
  approval?: Approval;
  aiResult: StructuredAiResult;
}

export async function continueTaskWithAi({ task, state, projectId, modelId, logs, handoff, memory, rules }: ContinueArgs): Promise<ContinueTaskResult> {
  const now = new Date().toISOString();
  const aiLabel = getModelLabel(modelId);
  const handoffForRun = handoff ?? buildHandoffPack({ task, state, logs, fromAi: state.last_ai, toAi: aiLabel, memory, rules });
  const adapter = createSelectedAiAdapter(modelId);
  const aiResult = await adapter.continueTask({ task, taskState: state, handoff: handoffForRun, modelId });
  const decision = evaluateAction("publish_content", rules);
  const blocked = !decision.allowed;
  const needsReview = !blocked && (aiResult.needs_review || decision.requiresApproval);
  const tokenUsage = aiResult.token_usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  const nextState: TaskState = {
    ...state,
    current_stage: blocked ? "blocked by rule engine" : aiResult.current_stage,
    completed_steps: uniqueSteps([
      ...state.completed_steps,
      ...aiResult.completed_steps,
      blocked ? "blocked action prevented" : needsReview ? "approval reason prepared" : "safe action continued",
    ]),
    next_step: blocked ? decision.reason : aiResult.next_step,
    last_ai: aiLabel,
    status: blocked ? "blocked" : needsReview ? "needs_review" : "in_progress",
    needs_review: needsReview,
    metadata: {
      ...state.metadata,
      last_handoff_score: handoffForRun.completeness_score,
      last_handoff_ready: handoffForRun.ready_for_transfer,
      last_ai_source: aiResult.source,
      last_ai_model: aiResult.model,
      last_rule_decision: {
        action: "publish_content",
        allowed: decision.allowed,
        requires_approval: decision.requiresApproval,
        reason: decision.reason,
      },
      last_token_usage: tokenUsage,
      last_cost_usd: aiResult.cost_usd ?? 0,
    },
    updated_at: now,
  };

  return {
    state: nextState,
    run: {
      id: makeId("run"),
      task_id: task.id,
      ai_model: `${aiLabel} / ${aiResult.model}${aiResult.source === "mock" ? " (mock)" : ""}`,
      input: JSON.stringify(handoffForRun.handoff_pack, null, 2),
      output: buildRunOutput(aiResult),
      status: "completed",
      cost_usd: aiResult.cost_usd ?? 0,
      prompt_tokens: tokenUsage.prompt_tokens,
      completion_tokens: tokenUsage.completion_tokens,
      total_tokens: tokenUsage.total_tokens,
      created_at: now,
    },
    log: makeLog(
      projectId,
      task.id,
      aiLabel,
      blocked ? "ai.action.blocked" : "ai.handoff.continued",
      blocked
        ? `${aiLabel} stopped because ${decision.reason}`
        : `${aiLabel} continued from saved handoff via ${aiResult.source === "mock" ? "mock fallback" : "OpenRouter"}.`,
    ),
    handoff: handoffForRun,
    approval: needsReview
      ? createApprovalForAction(task.id, "publish_content", buildApprovalReason(aiResult, decision.reason, handoffForRun.completeness_score))
      : undefined,
    aiResult,
  };
}
