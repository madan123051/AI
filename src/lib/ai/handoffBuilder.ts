import type {
  ActionLog,
  HandoffPack,
  HandoffScoreBreakdown,
  HandoffSummary,
  ProjectMemory,
  ProjectMemorySnapshot,
  Rule,
  Task,
  TaskState,
} from "@/lib/types";

const DEFAULT_GUARDRAILS = [
  "Draft creation is allowed without approval.",
  "Publishing, sending, deleting, payment, and refund actions require review.",
  "Never discard saved task state during an AI switch.",
];

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function cleanList(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function metadataFiles(state: TaskState) {
  const files = cleanList(state.metadata.files);
  return files.length > 0 ? files : ["No files attached for this MVP task."];
}

function calculateCompletenessScore(breakdown: HandoffScoreBreakdown) {
  const passed = Object.values(breakdown).filter(Boolean).length;
  return Math.round((passed / Object.keys(breakdown).length) * 100);
}

function formatRule(rule: Rule) {
  const effect = rule.effect === "allow" ? "SAFE" : rule.effect === "review" ? "REVIEW" : "BLOCKED";
  return `${effect}: ${rule.name} (${rule.action})`;
}

function rulesForHandoff(rules?: Rule[]) {
  const enabledRules = (rules ?? []).filter((rule) => rule.enabled);
  return enabledRules.length > 0 ? enabledRules.map(formatRule) : DEFAULT_GUARDRAILS;
}

function memorySnapshot(memory?: ProjectMemory): ProjectMemorySnapshot | undefined {
  if (!memory) {
    return undefined;
  }

  return {
    brand_voice: memory.brand_tone,
    target_channels: memory.target_channels,
    posting_style: memory.posting_style,
    hashtag_style: memory.hashtag_style,
    notes: memory.notes,
  };
}

interface ScoreInput {
  goal: string;
  currentStage: string;
  completedSteps: string[];
  nextStep: string;
  files: string[];
  rules: string[];
}

export function calculateHandoffCompleteness(input: ScoreInput) {
  const breakdown: HandoffScoreBreakdown = {
    goal: input.goal.trim().length > 0,
    current_stage: input.currentStage.trim().length > 0,
    completed_steps: input.completedSteps.length > 0,
    next_step: input.nextStep.trim().length > 0,
    files: input.files.length > 0,
    rules: input.rules.length > 0,
  };
  const completenessScore = calculateCompletenessScore(breakdown);

  return {
    breakdown,
    completenessScore,
    readyForTransfer: completenessScore >= 80,
  };
}

interface BuildHandoffArgs {
  task: Task;
  state: TaskState;
  logs: ActionLog[];
  fromAi?: string;
  toAi: string;
  memory?: ProjectMemory;
  rules?: Rule[];
}

export function buildHandoffPack({ task, state, logs, fromAi, toAi, memory, rules: activeRules }: BuildHandoffArgs): HandoffSummary {
  const createdAt = new Date().toISOString();
  const recentLogs = logs
    .filter((log) => log.task_id === task.id)
    .slice(0, 5)
    .map((log) => `${log.actor}: ${log.details}`);
  const contextNotes = recentLogs.length > 0 ? recentLogs : ["No prior action logs for this task yet."];
  const files = metadataFiles(state);
  const rules = rulesForHandoff(activeRules);
  const projectMemory = memorySnapshot(memory);
  const score = calculateHandoffCompleteness({
    goal: state.goal,
    currentStage: state.current_stage,
    completedSteps: state.completed_steps,
    nextStep: state.next_step,
    files,
    rules,
  });
  const sourceAi = fromAi ?? state.last_ai;
  const handoffPack: HandoffPack = {
    task_id: task.id,
    from_ai: sourceAi,
    to_ai: toAi,
    goal: state.goal,
    current_stage: state.current_stage,
    completed_steps: state.completed_steps,
    next_step: state.next_step,
    last_ai: state.last_ai,
    status: state.status,
    needs_review: state.needs_review,
    files,
    rules,
    context_notes: contextNotes,
    guardrails: rules,
    project_memory: projectMemory,
    completeness_score: score.completenessScore,
    ready_for_transfer: score.readyForTransfer,
    score_breakdown: score.breakdown,
    generated_at: createdAt,
  };

  return {
    id: makeId("handoff"),
    task_id: task.id,
    from_ai: sourceAi,
    to_ai: toAi,
    summary: [
      `Goal: ${state.goal}`,
      `Current stage: ${state.current_stage}`,
      `Completed: ${state.completed_steps.join(", ")}`,
      `Next: ${state.next_step}`,
      `Brand voice: ${projectMemory?.brand_voice ?? "Not set"}`,
      `Transfer: ${sourceAi} -> ${toAi}`,
      `Completeness: ${score.completenessScore}%`,
    ].join("\n"),
    handoff_pack: handoffPack,
    completeness_score: score.completenessScore,
    ready_for_transfer: score.readyForTransfer,
    created_at: createdAt,
  };
}
