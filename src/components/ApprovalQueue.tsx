"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, Clock3, ListChecks, MessageSquareText, Pencil, RotateCcw, Save, ShieldAlert } from "lucide-react";
import type { Approval, Message, Task } from "@/lib/types";

interface ApprovalQueueProps {
  approvals: Approval[];
  messages?: Message[];
  tasks?: Task[];
  onApprove: (approvalId: string, draftText?: string) => void;
  onSaveDraft?: (approvalId: string, draftText: string) => void;
  onOpenMessage?: (messageId: string) => void;
  onOpenTask?: (taskId: string) => void;
}

type ReplyStatusFilter = "all" | "pending" | "executed" | "failed" | "execution_pending";
type ReplySourceFilter = "all" | "website" | "email" | "comment";

const statusFilters: Array<{ value: ReplyStatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "executed", label: "Executed" },
  { value: "failed", label: "Failed" },
  { value: "execution_pending", label: "Execution Pending" },
];

const sourceFilters: Array<{ value: ReplySourceFilter; label: string }> = [
  { value: "all", label: "All Sources" },
  { value: "website", label: "Website" },
  { value: "email", label: "Email" },
  { value: "comment", label: "Comment" },
];

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

function approvalCardClass(status: Approval["execution_status"]) {
  if (status === "executed") {
    return "border-emerald-400/30 bg-emerald-400/10";
  }

  if (status === "failed") {
    return "border-rose-400/30 bg-rose-400/10";
  }

  if (status === "execution_pending" || status === "executing") {
    return "border-sky-400/30 bg-sky-400/10";
  }

  return "border-amber-400/30 bg-amber-400/10";
}

function actionSummary(approval: Approval) {
  if (approval.action_type === "reply_comment") {
    return "Reply to the selected comment through the connector.";
  }

  if (approval.action_type === "reply_message") {
    if (approval.connector === "website") {
      return "Send an email reply to the website contact through the custom email connector.";
    }

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

function metadataText(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function executionMetadata(approval: Approval) {
  const result = executionResultRecord(approval);

  const metadata = result?.metadata;

  return metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : undefined;
}

function executionResultRecord(approval: Approval) {
  const result = approval.metadata.execution_result;

  return result && typeof result === "object" ? (result as Record<string, unknown>) : undefined;
}

function firstMetadataText(records: Array<Record<string, unknown> | undefined>, keys: string[]) {
  for (const record of records) {
    for (const key of keys) {
      const value = metadataText(record, key);

      if (value) {
        return value;
      }
    }
  }

  return "";
}

function requestedActionTargetId(approval: Approval) {
  const separatorIndex = approval.requested_action.indexOf(":");

  return separatorIndex >= 0 ? approval.requested_action.slice(separatorIndex + 1).trim() : "";
}

function approvalMessageId(approval: Approval) {
  return metadataText(approval.metadata, "message_id") || approval.target_id || requestedActionTargetId(approval);
}

function isPendingReview(approval: Approval) {
  return approval.status === "pending" && (approval.execution_status === "pending_review" || approval.execution_status === "executing");
}

function needsAttention(approval: Approval) {
  return approval.execution_status === "failed" || approval.execution_status === "execution_pending";
}

function canRunApproval(approval: Approval) {
  return (
    (approval.status === "pending" && approval.execution_status === "pending_review") ||
    (approval.status === "approved" && (approval.execution_status === "execution_pending" || approval.execution_status === "failed"))
  );
}

function statusMatchesFilter(approval: Approval, filter: ReplyStatusFilter) {
  if (filter === "all") {
    return true;
  }

  if (filter === "pending") {
    return isPendingReview(approval);
  }

  return approval.execution_status === filter;
}

function replySource(approval: Approval, message?: Message): ReplySourceFilter {
  if (approval.action_type === "reply_comment") {
    return "comment";
  }

  if (approval.connector === "email" || message?.source === "gmail") {
    return "email";
  }

  return "website";
}

function formatDateTime(iso?: string) {
  if (!iso) {
    return "";
  }

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function sentOrRepliedAt(approval: Approval, message?: Message) {
  const executionResult = executionResultRecord(approval);
  const executionMeta = executionMetadata(approval);
  const value = firstMetadataText(
    [executionMeta, executionResult, message?.metadata, approval.metadata],
    ["executed_at", "sent_at", "replied_at", "reply_approved_at", "reply_execution_attempted_at", "evaluated_at"],
  );

  return value || (approval.execution_status === "executed" ? approval.resolved_at ?? "" : "");
}

function statusCount(approvals: Approval[], filter: ReplyStatusFilter) {
  return approvals.filter((approval) => statusMatchesFilter(approval, filter)).length;
}

function sourceCount(approvals: Approval[], messagesById: Map<string, Message>, filter: ReplySourceFilter) {
  if (filter === "all") {
    return approvals.length;
  }

  return approvals.filter((approval) => replySource(approval, messagesById.get(approvalMessageId(approval))) === filter).length;
}

export function ApprovalQueue({
  approvals,
  messages = [],
  tasks = [],
  onApprove,
  onSaveDraft,
  onOpenMessage,
  onOpenTask,
}: ApprovalQueueProps) {
  const [draftEdits, setDraftEdits] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<ReplyStatusFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<ReplySourceFilter>("all");
  const sortedApprovals = useMemo(
    () =>
      approvals
        .slice()
        .sort((first, second) =>
          (second.resolved_at ?? second.created_at).localeCompare(first.resolved_at ?? first.created_at),
        ),
    [approvals],
  );
  const messagesById = useMemo(() => new Map(messages.map((message) => [message.id, message])), [messages]);
  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const filteredApprovals = useMemo(
    () =>
      sortedApprovals.filter((approval) => {
        const message = messagesById.get(approvalMessageId(approval));

        return statusMatchesFilter(approval, statusFilter) && (sourceFilter === "all" || replySource(approval, message) === sourceFilter);
      }),
    [messagesById, sortedApprovals, sourceFilter, statusFilter],
  );
  const pendingCount = statusCount(sortedApprovals, "pending");
  const attentionCount = sortedApprovals.filter(needsAttention).length;
  const executedCount = statusCount(sortedApprovals, "executed");

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
      <div className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-normal text-zinc-400">Unified Reply Center</h2>
          <p className="mt-1 text-lg font-semibold text-zinc-50">{pendingCount} pending review</p>
          <p className="mt-1 text-xs text-zinc-500">
            {attentionCount} need attention · {executedCount} executed in history
          </p>
        </div>
        <ShieldAlert className="hidden h-5 w-5 text-amber-300 xl:block" aria-hidden="true" />
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {statusFilters.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setStatusFilter(filter.value)}
            className={`min-h-10 rounded-lg border px-3 text-left text-sm transition ${
              statusFilter === filter.value
                ? "border-amber-300 bg-amber-300/10 text-amber-50"
                : "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-600"
            }`}
          >
            <span className="block font-medium">{filter.label}</span>
            <span className="text-xs text-zinc-500">{statusCount(sortedApprovals, filter.value)}</span>
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {sourceFilters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setSourceFilter(filter.value)}
              className={`inline-flex min-h-9 items-center justify-center rounded-lg border px-3 text-sm transition ${
                sourceFilter === filter.value
                  ? "border-sky-300 bg-sky-300/10 text-sky-50"
                  : "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-600"
              }`}
            >
              {filter.label}
              <span className="ml-2 text-xs text-zinc-500">{sourceCount(sortedApprovals, messagesById, filter.value)}</span>
            </button>
          ))}
        </div>
        <p className="text-sm text-zinc-500">{filteredApprovals.length} shown</p>
      </div>

      <div className="space-y-3">
        {filteredApprovals.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-700 p-4 text-sm text-zinc-500">No replies match these filters.</p>
        ) : (
          filteredApprovals.map((approval) => {
            const canApprove = approval.status === "pending" && approval.execution_status === "pending_review";
            const canRetry = approval.status === "approved" && (approval.execution_status === "execution_pending" || approval.execution_status === "failed");
            const canExecute = canRunApproval(approval);
            const canEditDraft = canExecute && Boolean(onSaveDraft);
            const message = messagesById.get(approvalMessageId(approval));
            const linkedTaskId = message?.linked_task_id || approval.task_id;
            const linkedTask = tasksById.get(linkedTaskId);
            const draftValue = draftEdits[approval.id] ?? approval.draft_text;
            const draftDirty = draftValue.trim() !== approval.draft_text.trim();
            const hasDraftText = draftValue.trim().length > 0;
            const metadataRecords = [approval.metadata, message?.metadata, executionMetadata(approval)];
            const commentDocId = firstMetadataText(metadataRecords, [
              "original_comment_id",
              "comment_doc_id",
              "docId",
              "firestore_original_comment_doc_id",
            ]);
            const targetType = firstMetadataText(metadataRecords, ["targetType", "target_type", "comment_target_type"]);
            const targetId = firstMetadataText(metadataRecords, ["targetId", "target_id", "comment_target_id"]);
            const replyDocId = firstMetadataText(metadataRecords, ["firestore_reply_doc_id"]);
            const emailMessageId = firstMetadataText(metadataRecords, ["email_message_id"]);
            const sentAt = sentOrRepliedAt(approval, message);
            const source = replySource(approval, message);
            const actionIcon = canRetry ? (
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            ) : canExecute ? (
              <Check className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Clock3 className="h-4 w-4" aria-hidden="true" />
            );

            return (
              <article key={approval.id} className={`rounded-md border p-3 ${approvalCardClass(approval.execution_status)}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-zinc-50">{approval.title}</h3>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${executionStatusClass(approval.execution_status)}`}>
                      {label(approval.execution_status)}
                    </span>
                    <span className="rounded-full border border-amber-300/40 px-2 py-0.5 font-mono text-xs text-amber-100/80">
                      {approval.action_type}
                    </span>
                    <span className="rounded-full border border-sky-300/40 px-2 py-0.5 text-xs font-medium text-sky-100/80">
                      {label(source)}
                    </span>
                  </div>
                  <p className="mt-2 break-words text-sm leading-6 text-zinc-300">{approval.reason}</p>
                  <div className="mt-3 grid gap-2 text-sm leading-6 text-zinc-100 lg:grid-cols-2">
                    <p>
                      <span className="font-semibold text-amber-100">After approval:</span> {actionSummary(approval)}
                    </p>
                    <p>
                      <span className="font-semibold text-amber-100">Target:</span> {label(approval.connector)} / {approval.target_type || "target"} {approval.target_id ? `(${approval.target_id})` : ""}
                    </p>
                    {message ? (
                      <p>
                        <span className="font-semibold text-amber-100">Inbox status:</span> {label(message.status)}
                      </p>
                    ) : null}
                    {linkedTask ? (
                      <p>
                        <span className="font-semibold text-amber-100">Linked task:</span> {linkedTask.title}
                      </p>
                    ) : null}
                    <p>
                      <span className="font-semibold text-amber-100">Created:</span> {formatDateTime(approval.created_at)}
                    </p>
                    {sentAt ? (
                      <p>
                        <span className="font-semibold text-emerald-100">Sent/replied:</span> {formatDateTime(sentAt)}
                      </p>
                    ) : null}
                    {commentDocId || targetType || targetId ? (
                      <p className="lg:col-span-2">
                        <span className="font-semibold text-amber-100">Website context:</span>{" "}
                        {targetType || "target"} {targetId ? `/${targetId}` : ""} {commentDocId ? `· comment ${commentDocId}` : ""}
                      </p>
                    ) : null}
                    {replyDocId ? (
                      <p className="lg:col-span-2">
                        <span className="font-semibold text-emerald-100">Executed reply:</span> comments/{replyDocId}
                      </p>
                    ) : null}
                    {emailMessageId ? (
                      <p className="lg:col-span-2">
                        <span className="font-semibold text-emerald-100">Email message:</span> {emailMessageId}
                      </p>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => message && onOpenMessage?.(message.id)}
                      disabled={!message || !onOpenMessage}
                      className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm font-medium text-zinc-100 transition hover:border-sky-300 hover:text-sky-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <MessageSquareText className="h-4 w-4" aria-hidden="true" />
                      Open Message
                    </button>
                    <button
                      type="button"
                      onClick={() => linkedTaskId && onOpenTask?.(linkedTaskId)}
                      disabled={!linkedTaskId || !onOpenTask}
                      className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm font-medium text-zinc-100 transition hover:border-emerald-300 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ListChecks className="h-4 w-4" aria-hidden="true" />
                      Open Task
                    </button>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm leading-6 text-zinc-100">
                    {approval.draft_text || canEditDraft ? (
                      <div className="rounded-lg border border-amber-300/20 bg-zinc-950/40 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-normal text-amber-100/80">Draft</p>
                          {canEditDraft ? (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-100/70">
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                              Editable before approval
                            </span>
                          ) : null}
                        </div>
                        {canEditDraft ? (
                          <>
                            <textarea
                              value={draftValue}
                              onChange={(event) =>
                                setDraftEdits((current) => ({
                                  ...current,
                                  [approval.id]: event.target.value,
                                }))
                              }
                              className="mt-2 min-h-32 w-full resize-y rounded-lg border border-amber-300/20 bg-zinc-950 px-3 py-2 text-sm leading-6 text-amber-50 outline-none transition focus:border-amber-200"
                              aria-label="Edit reply draft"
                            />
                            <button
                              type="button"
                              onClick={() => onSaveDraft?.(approval.id, draftValue)}
                              disabled={!draftDirty || !hasDraftText}
                              className="mt-3 inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-amber-300/40 px-3 text-sm font-medium text-amber-100 transition hover:border-amber-200 hover:text-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Save className="h-4 w-4" aria-hidden="true" />
                              Save Draft
                            </button>
                          </>
                        ) : (
                          <p className="mt-1 whitespace-pre-line break-words text-sm text-amber-50">{approval.draft_text}</p>
                        )}
                      </div>
                    ) : null}
                    {approval.execution_status === "execution_pending" ? (
                      <div className="flex gap-2 rounded-lg border border-amber-300/40 bg-amber-300/10 p-3 text-amber-100">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        <p>{approval.execution_error || "Approved, but connector execution still needs a retry."}</p>
                      </div>
                    ) : null}
                    {approval.execution_status === "failed" ? (
                      <div className="flex gap-2 rounded-lg border border-rose-300/30 bg-rose-300/10 p-3 text-rose-100">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        <p>This is a failed execution attempt saved in history. If a newer approval succeeded, the reply can still appear on the website.</p>
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
                  onClick={() => onApprove(approval.id, draftDirty ? draftValue : undefined)}
                  disabled={!canExecute || (draftDirty && !hasDraftText)}
                  className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-lg bg-amber-300 px-3 text-sm font-semibold text-zinc-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                  title={canRetry ? "Retry connector execution" : "Approve action"}
                >
                  {actionIcon}
                  {canApprove
                    ? draftDirty ? "Save & Approve" : "Approve"
                    : canRetry
                      ? draftDirty ? "Save & Retry" : "Retry Execution"
                      : label(approval.execution_status)}
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
