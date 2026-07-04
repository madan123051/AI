import { NextResponse } from "next/server";
import { createTaskInDb, loadControlCenterData } from "@/lib/db/controlCenterRepository";
import type { Task } from "@/lib/types";

function errorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  try {
    const data = await loadControlCenterData();
    return NextResponse.json(data);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<Pick<Task, "project_id" | "title" | "goal">>;
    const projectId = body.project_id;
    const goal = body.goal?.trim();

    if (!projectId || !goal) {
      return NextResponse.json({ error: "project_id and goal are required" }, { status: 400 });
    }

    const result = await createTaskInDb({
      projectId,
      goal,
      title: body.title?.trim() || goal.slice(0, 54),
    });

    return NextResponse.json({ task: result.task, task_state: result.state, action_log: result.log }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
