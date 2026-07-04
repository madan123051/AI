"use client";

import { AlertTriangle, Check, Clock3, ShieldAlert } from "lucide-react";
import type { Approval } from "@/lib/types";

interface ApprovalQueueProps {
  approvals: Approval[];
  onApprove: (approvalId: string) => void;
}

function label(value: string) {
  return value
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function executionStatusClass(status: Approval["execution_status"]) {
  if (status === "executed") {
    return "border-emerald-300/40 bg-emerald-300/10 text-emerald-100";
  }

  if (status === "failed") {
    return "border-rose-300/40 bg-rose-300/10 text-rose-100";
  }

  if (status === "execution_pending" || status === "executing") {
    return "border-sky-300/40 bg-sky-300/10 text-sky-100";
  }

  return "border-amber-300/40 bg-amber-300/10 text-amber-100";
}

function actionSummary(approval: Approval) {
  if (approval.action_type === "reply_comment") {
    return "Reply to the selected comment through the connector.";
  }

  if (approval.action_type === "reply_message") {
    return "Reply to the selected message through the connector.";
  }

  if (approval.action_type === "send_email") {
    return "Send the approved email reply through the email connector.";
  }

  if (approval.action_type === "publish_content") {
    return "Publish the approved content through the selected platform connector.";
  }

  return "Update the selected live content through the connector.";
}

export function ApprovalQueue({ approvals, onApprove }: ApprovalQueueProps) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-normal text-zinc-400">Approvals</h2>
          <p className="mt-1 text-lg font-semibold text-zinc-50">{approvals.length} active</p>
        </div>
        <ShieldAlert className="h-5 w-5 text-amber-300" aria-hidden="true" />
      </div>

      <div className="space-y-3">
        {approvals.length === 0 ? (
          <p className="text-sm text-zinc-500">Approval queue is clear.</p>
        ) : (
          approvals.map((approval) => {
            const canApprove = approval.status === "pending" && approval.execution_status === "pending_review";

            return (
            <article key={approval.id} className="rounded-md border border-amber-400/30 bg-amber-400/10 p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-amber-100">{approval.title}</h3>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${executionStatusClass(approval.execution_status)}`}>
                      {label(approval.execution_status)}
                    </span>
                    <span className="rounded-full border border-amber-300/40 px-2 py-0.5 font-mono text-xs text-amber-100/80">
                      {approval.action_type}
                    </span>
                  </div>
                  <p className="mt-2 break-words text-sm leading-6 text-amber-100/80">{approval.reason}</p>
                  <div className="mt-3 grid gap-2 text-sm leading-6 text-amber-50/90">
                    <p>
                      <span className="font-semibold text-amber-100">After approval:</span> {actionSummary(approval)}
                    </p>
                    <p>
                      <span className="font-semibold text-amber-100">Target:</span> {label(approval.connector)} / {approval.target_type || "target"} {approval.target_id ? `(${approval.target_id})` : ""}
                    </p>
                    {approval.draft_text ? (
                      <div className="rounded-lg border border-amber-300/20 bg-zinc-950/40 p-3">
                        <p className="text-xs font-semibold uppercase tracking-normal text-amber-100/80">Draft</p>
                        <p className="mt-1 whitespace-pre-line break-words text-sm text-amber-50">{approval.draft_text}</p>
                      </div>
                    ) : null}
                    {approval.execution_error ? (
                      <div className="flex gap-2 rounded-lg border border-rose-300/30 bg-rose-300/10 p-3 text-rose-100">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        <p>{approval.execution_error}</p>
                      </div>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onApprove(approval.id)}
                  disabled={!canApprove}
                  className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-lg bg-amber-300 px-3 text-sm font-semibold text-zinc-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Approve action"
                >
                  {canApprove ? <Check className="h-4 w-4" aria-hidden="true" /> : <Clock3 className="h-4 w-4" aria-hidden="true" />}
                  {canApprove ? "Approve" : label(approval.execution_status)}
                </button>
              </div>
            </article>
            );
          })
        )}
      </div>
    </section>
  );
}
