"use client";

import { Clock3, Coins, History, Sigma, Zap } from "lucide-react";
import type { AiRun } from "@/lib/types";

function formatTime(iso: string) {
  return iso.slice(11, 16);
}

function formatCost(value?: number) {
  return `$${(value ?? 0).toFixed(6)}`;
}

interface AiRunHistoryProps {
  runs: AiRun[];
}

export function AiRunHistory({ runs }: AiRunHistoryProps) {
  const totalCost = runs.reduce((sum, run) => sum + (run.cost_usd ?? 0), 0);
  const totalTokens = runs.reduce((sum, run) => sum + (run.total_tokens ?? 0), 0);

  return (
    <section className="mt-5 rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-50">AI Run History</h2>
          <p className="mt-1 text-sm text-zinc-500">{runs.length} saved run{runs.length === 1 ? "" : "s"}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400">
          <span className="inline-flex min-h-8 items-center gap-2 rounded-lg border border-zinc-800 px-2">
            <Coins className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
            {formatCost(totalCost)}
          </span>
          <span className="inline-flex min-h-8 items-center gap-2 rounded-lg border border-zinc-800 px-2">
            <Sigma className="h-3.5 w-3.5 text-sky-300" aria-hidden="true" />
            {totalTokens} tokens
          </span>
        </div>
        <History className="hidden h-4 w-4 text-emerald-300 sm:block" aria-hidden="true" />
      </div>

      {runs.length === 0 ? (
        <p className="text-sm text-zinc-500">No AI run saved for this task yet.</p>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => (
            <article key={run.id} className="rounded-md border border-zinc-800 bg-zinc-900/80 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
                <span className="inline-flex items-center gap-2 text-zinc-300">
                  <Zap className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
                  {run.ai_model}
                </span>
                <span className="inline-flex items-center gap-2">
                  <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                  <time dateTime={run.created_at}>{formatTime(run.created_at)}</time>
                </span>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-zinc-400 sm:grid-cols-2">
                <span className="rounded-md bg-zinc-950 px-2 py-1">Cost {formatCost(run.cost_usd)}</span>
                <span className="rounded-md bg-zinc-950 px-2 py-1">Tokens {run.total_tokens ?? 0}</span>
              </div>
              <pre className="mt-3 max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-md bg-zinc-950 p-3 font-mono text-xs leading-5 text-zinc-300">
                {run.output}
              </pre>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
