"use client";

import { ClipboardList, FileJson, Gauge, GitBranch, ShieldCheck } from "lucide-react";
import type { HandoffSummary, Task, TaskState } from "@/lib/types";

interface HandoffPanelProps {
  task?: Task;
  state?: TaskState;
  handoff?: HandoffSummary;
  targetAi: string;
  canGenerate: boolean;
  isSaving: boolean;
  onGenerate: () => void;
}

export function HandoffPanel({ task, state, handoff, targetAi, canGenerate, isSaving, onGenerate }: HandoffPanelProps) {
  const completenessScore = handoff?.completeness_score ?? 0;
  const readyForTransfer = handoff?.ready_for_transfer ?? false;

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold uppercase tracking-normal text-zinc-400">Handoff Brain</h2>
          <p className="mt-1 break-words text-lg font-semibold text-zinc-50">{task?.title ?? "No task selected"}</p>
        </div>
        <GitBranch className="h-5 w-5 shrink-0 text-emerald-300" aria-hidden="true" />
      </div>

      <button
        type="button"
        onClick={onGenerate}
        disabled={!canGenerate || isSaving}
        className="mb-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-violet-300 px-3 text-sm font-semibold text-zinc-950 transition hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-40"
        title={`Generate handoff package for ${targetAi}`}
      >
        <FileJson className="h-4 w-4" aria-hidden="true" />
        Generate Handoff
      </button>

      <div className="space-y-3 text-sm">
        <div className="rounded-md border border-zinc-800 bg-zinc-900/80 p-3">
          <div className="mb-2 flex items-center gap-2 text-zinc-300">
            <Gauge className="h-4 w-4 text-emerald-300" aria-hidden="true" />
            <span className="font-medium">Handoff Score</span>
          </div>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-normal text-zinc-500">Context Completeness</p>
              <p className="mt-1 text-2xl font-semibold text-zinc-50">{completenessScore}%</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-normal text-zinc-500">Ready For Transfer</p>
              <p className={readyForTransfer ? "mt-1 font-semibold text-emerald-300" : "mt-1 font-semibold text-amber-300"}>
                {readyForTransfer ? "YES" : "NO"}
              </p>
            </div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full rounded-full bg-emerald-300" style={{ width: `${completenessScore}%` }} />
          </div>
        </div>

        <div className="rounded-md border border-zinc-800 bg-zinc-900/80 p-3">
          <div className="mb-2 flex items-center gap-2 text-zinc-300">
            <ClipboardList className="h-4 w-4 text-sky-300" aria-hidden="true" />
            <span className="font-medium">Current State</span>
          </div>
          <dl className="grid gap-2 text-zinc-400">
            <div>
              <dt className="text-xs uppercase tracking-normal text-zinc-500">Stage</dt>
              <dd className="break-words text-zinc-200">{state?.current_stage ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-normal text-zinc-500">Next Step</dt>
              <dd className="break-words text-zinc-200">{state?.next_step ?? "-"}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-md border border-zinc-800 bg-zinc-900/80 p-3">
          <div className="mb-2 flex items-center gap-2 text-zinc-300">
            <ShieldCheck className="h-4 w-4 text-amber-300" aria-hidden="true" />
            <span className="font-medium">Latest Handoff Pack</span>
          </div>
          {handoff ? (
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-zinc-950 p-3 font-mono text-xs leading-5 text-zinc-300">
              {JSON.stringify(handoff.handoff_pack, null, 2)}
            </pre>
          ) : (
            <p className="text-zinc-500">No handoff package generated yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}
