import { NextResponse } from "next/server";
import { persistTaskTransition } from "@/lib/db/controlCenterRepository";
import { continueTaskWithAi } from "@/lib/orchestrator/aiContinuationRunner";
import type { ActionLog, AiModelId, HandoffSummary, ProjectMemory, Rule, Task, TaskState } from "@/lib/types";

interface ContinueAiRequest {
  task?: Task;
  state?: TaskState;
  handoff?: HandoffSummary;
  modelId?: AiModelId;
  logs?: ActionLog[];
  memory?: ProjectMemory;
  rules?: Rule[];
}

function errorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ContinueAiRequest;

    if (!body.task || !body.state || !body.modelId) {
      return NextResponse.json({ error: "task, state, and modelId are required" }, { status: 400 });
    }

    const result = await continueTaskWithAi({
      task: body.task,
      state: body.state,
      projectId: body.task.project_id,
      modelId: body.modelId,
      logs: body.logs ?? [],
      handoff: body.handoff,
      memory: body.memory,
      rules: body.rules,
    });

    const persisted = await persistTaskTransition({
      task: body.task,
      state: result.state,
      run: result.run,
      log: result.log,
      handoff: result.handoff,
      approval: result.approval,
    });

    return NextResponse.json({
      task: persisted.task,
      state: persisted.state,
      run: persisted.run ?? result.run,
      handoff: persisted.handoff ?? result.handoff,
      approval: persisted.approval ?? result.approval,
      log: persisted.log,
      ai_result: result.aiResult,
    });
  } catch (error) {
    return errorResponse(error);
  }
}


