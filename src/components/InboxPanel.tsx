"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Archive, BrainCircuit, Check, Inbox, Link2, ListPlus, MailPlus, WandSparkles } from "lucide-react";
import type { Message, MessageSource, MessageStatus, Priority, Project } from "@/lib/types";

type CreateMessageInput = {
  projectId: string;
  source: MessageSource;
  sender_name: string;
  sender_handle: string;
  subject: string;
  body: string;
  priority: Priority;
};

type InboxPanelProps = {
  project?: Project;
  messages: Message[];
  isSaving: boolean;
  onCreateMessage: (input: CreateMessageInput) => Promise<void> | void;
  onCreateTask: (messageId: string) => Promise<void> | void;
  onDraftReply: (messageId: string) => Promise<void> | void;
  onUpdateStatus: (messageId: string, status: MessageStatus) => Promise<void> | void;
};

const sourceOptions: MessageSource[] = ["gmail", "website", "instagram", "facebook", "viber"];
const priorityOptions: Priority[] = ["low", "medium", "high"];

function titleCase(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function formatMessageTime(iso: string) {
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

function priorityClass(priority: Priority) {
  if (priority === "high") {
    return "border-rose-300/40 bg-rose-300/10 text-rose-100";
  }

  if (priority === "low") {
    return "border-zinc-700 bg-zinc-900 text-zinc-300";
  }

  return "border-amber-300/40 bg-amber-300/10 text-amber-100";
}

function statusClass(status: MessageStatus) {
  if (status === "unread") {
    return "border-emerald-300/40 bg-emerald-300/10 text-emerald-100";
  }

  if (status === "archived") {
    return "border-zinc-700 bg-zinc-900 text-zinc-400";
  }

  if (status === "drafted") {
    return "border-sky-300/40 bg-sky-300/10 text-sky-100";
  }

  return "border-zinc-700 bg-zinc-900 text-zinc-300";
}

function metadataString(message: Message, key: string) {
  const value = message.metadata[key];
  return typeof value === "string" ? value : "";
}

function metadataStringArray(message: Message, key: string) {
  const value = message.metadata[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function metadataPriority(message: Message) {
  const value = metadataString(message, "ai_suggested_priority");
  return value === "low" || value === "medium" || value === "high" ? value : undefined;
}

export function InboxPanel({
  project,
  messages,
  isSaving,
  onCreateMessage,
  onCreateTask,
  onDraftReply,
  onUpdateStatus,
}: InboxPanelProps) {
  const [source, setSource] = useState<MessageSource>("gmail");
  const [senderName, setSenderName] = useState("");
  const [senderHandle, setSenderHandle] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");

  const visibleMessages = useMemo(
    () => messages.filter((message) => message.status !== "archived"),
    [messages],
  );
  const unreadCount = visibleMessages.filter((message) => message.status === "unread").length;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!project || !body.trim()) {
      return;
    }

    await onCreateMessage({
      projectId: project.id,
      source,
      sender_name: senderName.trim() || "Unknown sender",
      sender_handle: senderHandle.trim(),
      subject: subject.trim(),
      body: body.trim(),
      priority,
    });
    setSenderName("");
    setSenderHandle("");
    setSubject("");
    setBody("");
    setPriority("medium");
  }

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Inbox className="h-4 w-4 text-emerald-300" aria-hidden="true" />
            <h2 className="text-base font-semibold text-zinc-50">Unified Inbox</h2>
          </div>
          <p className="mt-1 text-sm text-zinc-400">{unreadCount} unread</p>
        </div>
        <span className="inline-flex min-h-8 items-center justify-center rounded-lg border border-zinc-700 px-3 text-xs font-medium text-zinc-300">
          {project?.name ?? "No project"}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 md:grid-cols-2">
        <label className="block text-sm text-zinc-400" htmlFor="message-source">
          Source
          <select
            id="message-source"
            value={source}
            onChange={(event) => setSource(event.target.value as MessageSource)}
            className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-300"
          >
            {sourceOptions.map((option) => (
              <option key={option} value={option}>{titleCase(option)}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-zinc-400" htmlFor="message-priority">
          Priority
          <select
            id="message-priority"
            value={priority}
            onChange={(event) => setPriority(event.target.value as Priority)}
            className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-300"
          >
            {priorityOptions.map((option) => (
              <option key={option} value={option}>{titleCase(option)}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-zinc-400" htmlFor="message-sender">
          Sender
          <input
            id="message-sender"
            value={senderName}
            onChange={(event) => setSenderName(event.target.value)}
            className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
            placeholder="Name"
          />
        </label>
        <label className="block text-sm text-zinc-400" htmlFor="message-handle">
          Handle
          <input
            id="message-handle"
            value={senderHandle}
            onChange={(event) => setSenderHandle(event.target.value)}
            className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
            placeholder="@handle or email"
          />
        </label>
        <label className="block text-sm text-zinc-400 md:col-span-2" htmlFor="message-subject">
          Subject
          <input
            id="message-subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
            placeholder="Short subject"
          />
        </label>
        <label className="block text-sm text-zinc-400 md:col-span-2" htmlFor="message-body">
          Body
          <textarea
            id="message-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="mt-2 min-h-24 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
            placeholder="Message text"
          />
        </label>
        <button
          type="submit"
          disabled={!project || isSaving || !body.trim()}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-400 px-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50 md:col-span-2"
        >
          <MailPlus className="h-4 w-4" aria-hidden="true" />
          Add Message
        </button>
      </form>

      <div className="mt-4 grid gap-3">
        {visibleMessages.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-700 p-4 text-sm text-zinc-500">
            No inbox messages for this project.
          </div>
        ) : null}
        {visibleMessages.map((message) => {
          const draftReply = metadataString(message, "ai_draft_reply");
          const aiSummary = metadataString(message, "ai_summary");
          const suggestedPriority = metadataPriority(message);
          const triageReasons = metadataStringArray(message, "ai_triage_reasons");
          const linkedTaskTitle = metadataString(message, "linked_task_title");

          return (
            <article key={message.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg border border-zinc-700 px-2 py-1 text-xs font-medium text-zinc-300">
                      {titleCase(message.source)}
                    </span>
                    <span className={`rounded-lg border px-2 py-1 text-xs font-medium ${statusClass(message.status)}`}>
                      {titleCase(message.status)}
                    </span>
                    <span className={`rounded-lg border px-2 py-1 text-xs font-medium ${priorityClass(message.priority)}`}>
                      {titleCase(message.priority)}
                    </span>
                  </div>
                  <h3 className="mt-3 break-words text-base font-semibold text-zinc-50">
                    {message.subject || `Message from ${message.sender_name}`}
                  </h3>
                  <p className="mt-1 text-sm text-zinc-400">
                    {message.sender_name}
                    {message.sender_handle ? <span> - {message.sender_handle}</span> : null}
                  </p>
                </div>
                <time className="shrink-0 text-sm text-zinc-500" dateTime={message.received_at}>
                  {formatMessageTime(message.received_at)}
                </time>
              </div>

              <p className="mt-3 break-words text-sm leading-6 text-zinc-300">{message.body}</p>

              {aiSummary || suggestedPriority || linkedTaskTitle ? (
                <div className="mt-3 rounded-lg border border-violet-300/30 bg-violet-300/10 p-3">
                  <div className="mb-3 flex items-center gap-2">
                    <BrainCircuit className="h-4 w-4 text-violet-200" aria-hidden="true" />
                    <h4 className="text-sm font-semibold text-violet-50">AI Triage</h4>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {aiSummary ? (
                      <div>
                        <p className="text-xs font-medium text-violet-100/80">Summary</p>
                        <p className="mt-1 break-words text-sm leading-6 text-violet-50">{aiSummary}</p>
                      </div>
                    ) : null}
                    {suggestedPriority ? (
                      <div>
                        <p className="text-xs font-medium text-violet-100/80">Suggested Priority</p>
                        <span className={`mt-2 inline-flex rounded-lg border px-2 py-1 text-xs font-medium ${priorityClass(suggestedPriority)}`}>
                          {titleCase(suggestedPriority)}
                        </span>
                      </div>
                    ) : null}
                    {triageReasons.length > 0 ? (
                      <div>
                        <p className="text-xs font-medium text-violet-100/80">Reason</p>
                        <p className="mt-1 break-words text-sm leading-6 text-violet-50">{triageReasons.join(" ")}</p>
                      </div>
                    ) : null}
                    {linkedTaskTitle ? (
                      <div>
                        <p className="text-xs font-medium text-violet-100/80">Linked Review Task</p>
                        <p className="mt-1 inline-flex items-start gap-2 break-words text-sm leading-6 text-violet-50">
                          <Link2 className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
                          <span>{linkedTaskTitle}</span>
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {draftReply ? (
                <div className="mt-3 rounded-lg border border-sky-300/30 bg-sky-300/10 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <WandSparkles className="h-4 w-4 text-sky-200" aria-hidden="true" />
                    <h4 className="text-sm font-semibold text-sky-50">Suggested Reply Draft</h4>
                  </div>
                  <p className="whitespace-pre-line break-words text-sm leading-6 text-sky-50">{draftReply}</p>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void onCreateTask(message.id)}
                  disabled={isSaving || Boolean(message.linked_task_id)}
                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm font-medium text-zinc-100 transition hover:border-emerald-300 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Create task from message"
                >
                  <ListPlus className="h-4 w-4" aria-hidden="true" />
                  {message.linked_task_id ? "Task Linked" : "Create Task"}
                </button>
                <button
                  type="button"
                  onClick={() => void onDraftReply(message.id)}
                  disabled={isSaving}
                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm font-medium text-zinc-100 transition hover:border-sky-300 hover:text-sky-200 disabled:cursor-not-allowed disabled:opacity-50"
                  title="AI draft reply placeholder"
                >
                  <WandSparkles className="h-4 w-4" aria-hidden="true" />
                  Draft Reply
                </button>
                {message.status === "unread" ? (
                  <button
                    type="button"
                    onClick={() => void onUpdateStatus(message.id, "read")}
                    disabled={isSaving}
                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm font-medium text-zinc-100 transition hover:border-emerald-300 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
                    title="Mark read"
                  >
                    <Check className="h-4 w-4" aria-hidden="true" />
                    Read
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void onUpdateStatus(message.id, "archived")}
                  disabled={isSaving}
                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm font-medium text-zinc-100 transition hover:border-amber-300 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Archive message"
                >
                  <Archive className="h-4 w-4" aria-hidden="true" />
                  Archive
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
