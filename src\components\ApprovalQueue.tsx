"use client";

import { Check, ShieldAlert } from "lucide-react";
import type { Approval } from "@/lib/types";

interface ApprovalQueueProps {
  approvals: Approval[];
  onApprove: (approvalId: string) => void;
}

export function ApprovalQueue({ approvals, onApprove }: ApprovalQueueProps) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-normal text-zinc-400">Approvals</h2>
          <p className="mt-1 text-lg font-semibold text-zinc-50">{approvals.length} pending</p>
        </div>
        <ShieldAlert className="h-5 w-5 text-amber-300" aria-hidden="true" />
      </div>

      <div className="space-y-3">
        {approvals.length === 0 ? (
          <p className="text-sm text-zinc-500">Approval queue is clear.</p>
        ) : (
          approvals.map((approval) => (
            <article key={approval.id} className="rounded-md border border-amber-400/30 bg-amber-400/10 p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-amber-100">{approval.title}</h3>
                    <span className="rounded-full border border-amber-300/40 px-2 py-0.5 font-mono text-xs text-amber-100/80">
                      {approval.requested_action}
                    </span>
                  </div>
                  <p className="mt-2 break-words text-sm leading-6 text-amber-100/80">{approval.reason}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onApprove(approval.id)}
                  className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-lg bg-amber-300 px-3 text-sm font-semibold text-zinc-950 transition hover:bg-amber-200"
                  title="Approve action"
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Approve
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
