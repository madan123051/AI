import { NextResponse } from "next/server";
import { buildHandoffPack } from "@/lib/ai/handoffBuilder";
import type { ActionLog, Task, TaskState } from "@/lib/types";

interface HandoffRequest {
  task?: Task;
  state?: TaskState;
  logs?: ActionLog[];
  to_ai?: string;
}

export async function POST(request: Request) {
  const body = (await request.json()) as HandoffRequest;

  if (!body.task || !body.state || !body.to_ai) {
    return NextResponse.json({ error: "task, state, and to_ai are required" }, { status: 400 });
  }

  const handoff = buildHandoffPack({
    task: body.task,
    state: body.state,
    logs: body.logs ?? [],
    fromAi: body.state.last_ai,
    toAi: body.to_ai,
  });

  return NextResponse.json({ handoff });
}
