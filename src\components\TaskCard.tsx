"use client";

import { CheckCircle2, Clock3, ListChecks, Play, RefreshCw } from "lucide-react";
import type { Task, TaskState } from "@/lib/types";

const statusStyles = {
  queued: "border-zinc-700 bg-zinc-900 text-zinc-300",
  in_progress: "border-sky-500/40 bg-sky-500/10 text-sky-200",
  needs_review: "border-amber-400/50 bg-amber-400/10 text-amber-200",
  completed: "border-emerald-400/50 bg-emerald-400/10 text-emerald-200",
  blocked: "border-rose-400/50 bg-rose-400/10 text-rose-200",
};

interface TaskCardProps {
  task: Task;
  state: TaskState;
  selected: boolean;
  onSelect: () => void;
  onStart: () => void;
  onContinue: () => void;
}

export function TaskCard({ task, state, selected, onSelect, onStart, onContinue }: TaskCardProps) {
  const canStart = state.status === "queued";
  const canContinue = state.status === "in_progress";

  return (
    <article
      className={`rounded-lg border p-4 transition ${
        selected ? "border-emerald-300 bg-zinc-900" : "border-zinc-800 bg-zinc-950/70 hover:border-zinc-700"
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <button type="button" onClick={onSelect} className="min-w-0 text-left">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusStyles[state.status]}`}>
              {state.status.replace("_", " ")}
            </span>
            <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-400">
              {task.priority}
            </span>
          </div>
          <h3 className="text-base font-semibold text-zinc-50">{task.title}</h3>
          <p className="mt-1 text-sm leading-6 text-zinc-400">{task.goal}</p>
        </button>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={onStart}
            disabled={!canStart}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm font-medium text-zinc-100 transition hover:border-emerald-300 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-40"
            title="Run first AI pass"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            AI-1
          </button>
          <button
            type="button"
            onClick={onContinue}
            disabled={!canContinue}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-400 px-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
            title="Save handoff and continue with selected AI"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Switch AI
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
        <div className="flex min-w-0 gap-2 text-zinc-300">
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" aria-hidden="true" />
          <span className="min-w-0 break-words">{state.current_stage}</span>
        </div>
        <div className="flex min-w-0 gap-2 text-zinc-300">
          <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
          <span className="min-w-0 break-words">{state.next_step}</span>
        </div>
        <div className="flex min-w-0 gap-2 text-zinc-300">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
          <span className="min-w-0 break-words">Last AI: {state.last_ai}</span>
        </div>
      </div>
    </article>
  );
}


