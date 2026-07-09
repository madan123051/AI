"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Eraser,
  FileText,
  Image as ImageIcon,
  Loader2,
  MessageSquareText,
  Pin,
  PinOff,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { AiModelId, ChatMessage, ChatThread, ChatToolResult, Project } from "@/lib/types";

type ChatApiResponse = {
  ok?: boolean;
  error?: string;
  thread?: ChatThread;
  threads?: ChatThread[];
  messages?: ChatMessage[];
  tool_results?: ChatToolResult[];
};

const chatModels: Array<{ id: AiModelId; label: string }> = [
  { id: "gpt", label: "GPT" },
  { id: "gemini", label: "Gemini" },
  { id: "claude", label: "Claude" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "local", label: "Local AI" },
];

function formatTime(iso: string) {
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

function toolTone(result: ChatToolResult) {
  if (result.status === "approval_required") {
    return "border-amber-300/40 bg-amber-300/10 text-amber-100";
  }

  if (result.status === "error" || result.status === "blocked") {
    return "border-rose-300/40 bg-rose-300/10 text-rose-100";
  }

  return "border-emerald-300/40 bg-emerald-300/10 text-emerald-100";
}

function ToolResultIcon({ result }: { result: ChatToolResult }) {
  if (result.status === "approval_required") {
    return <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />;
  }

  if (result.status === "error" || result.status === "blocked") {
    return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />;
  }

  if (result.name === "search_tasks") {
    return <Search className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />;
  }

  return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />;
}

function getTaskData(result: ChatToolResult) {
  const task = result.data.task;

  if (task && typeof task === "object" && "id" in task && "title" in task) {
    return task as { id: string; title: string; status?: string };
  }

  return undefined;
}

function getApprovalData(result: ChatToolResult) {
  const approval = result.data.approval;

  if (approval && typeof approval === "object" && "id" in approval && "title" in approval) {
    return approval as { id: string; title: string; execution_status?: string };
  }

  return undefined;
}

function getMediaAssets(result: ChatToolResult) {
  const assets = result.data.media_assets;

  if (!Array.isArray(assets)) {
    return [];
  }

  return assets
    .filter((asset): asset is Record<string, unknown> => Boolean(asset) && typeof asset === "object" && !Array.isArray(asset))
    .map((asset) => ({
      id: typeof asset.id === "string" ? asset.id : String(Math.random()),
      title: typeof asset.title === "string" ? asset.title : "Untitled media",
      asset_type: typeof asset.asset_type === "string" ? asset.asset_type : "media",
      status: typeof asset.status === "string" ? asset.status : "draft",
      has_public_url: asset.has_public_url === true,
      has_alt_text: asset.has_alt_text === true,
    }));
}

function ToolResultCard({ result }: { result: ChatToolResult }) {
  const task = getTaskData(result);
  const approval = getApprovalData(result);
  const ideas = Array.isArray(result.data.ideas) ? result.data.ideas.filter((item): item is string => typeof item === "string") : [];
  const mediaAssets = getMediaAssets(result);

  return (
    <article className={`rounded-lg border p-3 ${toolTone(result)}`}>
      <div className="flex items-start gap-3">
        <ToolResultIcon result={result} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{result.title}</h3>
            <span className="rounded-full border border-current/25 px-2 py-0.5 font-mono text-[11px] uppercase tracking-normal opacity-80">
              {result.status}
            </span>
          </div>
          <p className="mt-2 whitespace-pre-line break-words text-sm leading-6 opacity-90">{result.summary}</p>
          {task || approval ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {task ? (
                <Link
                  href="/tasks"
                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-current/25 px-3 text-sm font-medium transition hover:bg-white/10"
                >
                  <ClipboardList className="h-4 w-4" aria-hidden="true" />
                  Open Task
                </Link>
              ) : null}
              {approval ? (
                <Link
                  href="/approvals"
                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-current/25 px-3 text-sm font-medium transition hover:bg-white/10"
                >
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  Open Approval
                </Link>
              ) : null}
            </div>
          ) : null}
          {ideas.length > 0 ? (
            <div className="mt-3 grid gap-2">
              {ideas.map((idea) => (
                <p key={idea} className="rounded-lg border border-current/15 bg-black/20 p-2 text-sm leading-6">
                  {idea}
                </p>
              ))}
            </div>
          ) : null}
          {mediaAssets.length > 0 ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {mediaAssets.map((asset) => (
                <div key={asset.id} className="rounded-lg border border-current/15 bg-black/20 p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{asset.title}</p>
                      <p className="mt-1 font-mono text-[11px] uppercase tracking-normal opacity-70">{asset.asset_type} / {asset.status}</p>
                    </div>
                    {asset.asset_type === "document" ? (
                      <FileText className="h-4 w-4 shrink-0 opacity-70" aria-hidden="true" />
                    ) : (
                      <ImageIcon className="h-4 w-4 shrink-0 opacity-70" aria-hidden="true" />
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs opacity-80">
                    <span className="rounded-full border border-current/20 px-2 py-0.5">{asset.has_alt_text ? "alt ready" : "alt missing"}</span>
                    <span className="rounded-full border border-current/20 px-2 py-0.5">{asset.has_public_url ? "public URL" : "URL needed"}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "tool" && message.tool_result) {
    return <ToolResultCard result={message.tool_result} />;
  }

  const isUser = message.role === "user";

  return (
    <article className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[min(48rem,100%)] rounded-lg border p-4 ${
          isUser
            ? "border-sky-300/30 bg-sky-300/10 text-sky-50"
            : "border-zinc-800 bg-zinc-950/80 text-zinc-100"
        }`}
      >
        <div className="mb-2 flex items-center justify-between gap-3 text-xs text-zinc-500">
          <span>{isUser ? "You" : message.model_id ? chatModels.find((model) => model.id === message.model_id)?.label ?? "AI" : "AI"}</span>
          <time dateTime={message.created_at}>{formatTime(message.created_at)}</time>
        </div>
        <p className="whitespace-pre-line break-words text-sm leading-6">{message.content}</p>
      </div>
    </article>
  );
}

export function ChatCommandCenterPanel({ project }: { project?: Project }) {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | undefined>();
  const [selectedModel, setSelectedModel] = useState<AiModelId>("gpt");
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [threadActionId, setThreadActionId] = useState<string | undefined>();
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const activeThread = useMemo(() => threads.find((thread) => thread.id === selectedThreadId), [selectedThreadId, threads]);
  const activeMessages = useMemo(
    () => messages.filter((message) => message.thread_id === selectedThreadId),
    [messages, selectedThreadId],
  );

  useEffect(() => {
    let ignore = false;
    const projectQuery = project?.id ? `?project_id=${encodeURIComponent(project.id)}` : "";

    Promise.resolve()
      .then(() => {
        if (!ignore) {
          setIsLoading(true);
          setError("");
        }

        return fetch(`/api/chat${projectQuery}`);
      })
      .then(async (response) => {
        const payload = (await response.json()) as ChatApiResponse;

        if (!response.ok || payload.ok === false) {
          throw new Error(payload.error || `Chat load failed with ${response.status}`);
        }

        if (!ignore) {
          const nextThreads = payload.threads ?? [];
          setThreads(nextThreads);
          setMessages(payload.messages ?? []);
          setSelectedThreadId((current) => (current && nextThreads.some((thread) => thread.id === current) ? current : nextThreads[0]?.id));
        }
      })
      .catch((loadError: unknown) => {
        if (!ignore) {
          setError(loadError instanceof Error ? loadError.message : "Chat load failed.");
        }
      })
      .finally(() => {
        if (!ignore) {
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [project?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [activeMessages.length, isSending]);

  function setQuickPrompt(prompt: string) {
    setInput(prompt);
    inputRef.current?.focus();
  }

  async function handleThreadAction(action: "pin_thread" | "clear_history" | "delete_thread", thread: ChatThread, pinned?: boolean) {
    if (threadActionId) {
      return;
    }

    if (action === "clear_history" && !window.confirm(`Delete message history for "${thread.title}"?`)) {
      return;
    }

    if (action === "delete_thread" && !window.confirm(`Delete chat "${thread.title}"?`)) {
      return;
    }

    setThreadActionId(`${action}:${thread.id}`);
    setError("");

    try {
      const response = await fetch("/api/chat", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          threadId: thread.id,
          projectId: project?.id,
          pinned,
        }),
      });
      const payload = (await response.json()) as ChatApiResponse;

      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error || `Chat action failed with ${response.status}`);
      }

      const nextThreads = payload.threads ?? [];
      setThreads(nextThreads);
      setMessages(payload.messages ?? []);

      if (action === "delete_thread" && selectedThreadId === thread.id) {
        setSelectedThreadId(nextThreads[0]?.id);
      } else {
        setSelectedThreadId((current) => (current && nextThreads.some((item) => item.id === current) ? current : nextThreads[0]?.id));
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Chat action failed.");
    } finally {
      setThreadActionId(undefined);
    }
  }

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = input.trim();

    if (!message || isSending) {
      return;
    }

    setIsSending(true);
    setError("");
    setInput("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: selectedThreadId,
          projectId: project?.id,
          modelId: selectedModel,
          message,
        }),
      });
      const payload = (await response.json()) as ChatApiResponse;

      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error || `Chat send failed with ${response.status}`);
      }

      setThreads(payload.threads ?? []);
      setMessages(payload.messages ?? []);
      setSelectedThreadId(payload.thread?.id ?? selectedThreadId);
    } catch (sendError) {
      setInput(message);
      setError(sendError instanceof Error ? sendError.message : "Chat send failed.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="grid min-h-[calc(100dvh-10rem)] gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-normal text-zinc-500">AI Chat</p>
            <h2 className="truncate text-base font-semibold text-zinc-50">{project?.name ?? "No project"}</h2>
          </div>
          <button
            type="button"
            onClick={() => setSelectedThreadId(undefined)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-800 text-zinc-300 transition hover:border-emerald-300 hover:text-emerald-100"
            title="New chat"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="grid gap-2">
          {isLoading ? (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3 text-sm text-zinc-500">Loading chats...</div>
          ) : null}
          {!isLoading && threads.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-950/60 p-4 text-sm leading-6 text-zinc-500">
              No chat threads yet.
            </div>
          ) : null}
          {threads.map((thread) => (
            <article
              key={thread.id}
              className={`group rounded-lg border p-2 transition ${
                thread.id === selectedThreadId
                  ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-50"
                  : "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-600"
              }`}
            >
              <div className="flex items-start gap-2">
                <button type="button" onClick={() => setSelectedThreadId(thread.id)} className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-2">
                    {thread.pinned ? <Pin className="h-3.5 w-3.5 shrink-0 text-amber-200" aria-hidden="true" /> : null}
                    <p className="truncate text-sm font-semibold">{thread.title}</p>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">{formatTime(thread.updated_at)}</p>
                </button>
                <div className="flex shrink-0 items-center gap-1 opacity-100 sm:opacity-0 sm:transition sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                  <button
                    type="button"
                    onClick={() => void handleThreadAction("pin_thread", thread, !thread.pinned)}
                    disabled={Boolean(threadActionId)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-700 text-zinc-400 transition hover:border-amber-200 hover:text-amber-100 disabled:opacity-50"
                    title={thread.pinned ? "Unpin chat" : "Pin chat"}
                  >
                    {thread.pinned ? <PinOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Pin className="h-3.5 w-3.5" aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleThreadAction("delete_thread", thread)}
                    disabled={Boolean(threadActionId)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-700 text-zinc-400 transition hover:border-rose-300 hover:text-rose-100 disabled:opacity-50"
                    title="Delete chat"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </aside>
      <div className="flex min-h-0 flex-col rounded-lg border border-zinc-800 bg-zinc-950/80">
        <div className="flex flex-col gap-3 border-b border-zinc-800 p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-300/30 bg-emerald-300/10 text-emerald-100">
              <MessageSquareText className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-zinc-50">{activeThread?.title ?? "New command chat"}</h2>
              <p className="text-sm text-zinc-500">Project context, memory, inbox, tasks, approvals, and handoffs</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {activeThread ? (
              <>
                <button
                  type="button"
                  onClick={() => void handleThreadAction("pin_thread", activeThread, !activeThread.pinned)}
                  disabled={Boolean(threadActionId)}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 text-sm font-medium text-zinc-300 transition hover:border-amber-200 hover:text-amber-100 disabled:opacity-50"
                >
                  {activeThread.pinned ? <PinOff className="h-4 w-4" aria-hidden="true" /> : <Pin className="h-4 w-4" aria-hidden="true" />}
                  {activeThread.pinned ? "Unpin" : "Pin"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleThreadAction("clear_history", activeThread)}
                  disabled={Boolean(threadActionId)}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 text-sm font-medium text-zinc-300 transition hover:border-sky-300 hover:text-sky-100 disabled:opacity-50"
                >
                  <Eraser className="h-4 w-4" aria-hidden="true" />
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => void handleThreadAction("delete_thread", activeThread)}
                  disabled={Boolean(threadActionId)}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 text-sm font-medium text-zinc-300 transition hover:border-rose-300 hover:text-rose-100 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Delete
                </button>
              </>
            ) : null}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsModelMenuOpen((current) => !current)}
                className="inline-flex min-h-10 min-w-36 items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/90 px-3 text-sm font-semibold text-zinc-100 shadow-lg shadow-black/10 transition hover:border-emerald-300/50"
                aria-haspopup="listbox"
                aria-expanded={isModelMenuOpen}
              >
                <span className="inline-flex min-w-0 items-center gap-2">
                  <Bot className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
                  <span className="truncate">{chatModels.find((model) => model.id === selectedModel)?.label ?? "GPT"}</span>
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-500 transition ${isModelMenuOpen ? "rotate-180" : ""}`} aria-hidden="true" />
              </button>
              {isModelMenuOpen ? (
                <div
                  role="listbox"
                  aria-label="AI model"
                  className="absolute right-0 z-30 mt-2 w-44 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 p-1 shadow-2xl shadow-black/40"
                >
                  {chatModels.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      role="option"
                      aria-selected={selectedModel === model.id}
                      onClick={() => {
                        setSelectedModel(model.id);
                        setIsModelMenuOpen(false);
                      }}
                      className={`flex min-h-10 w-full items-center justify-between rounded-md px-3 text-left text-sm transition ${
                        selectedModel === model.id
                          ? "bg-emerald-300/15 text-emerald-100"
                          : "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
                      }`}
                    >
                      {model.label}
                      {selectedModel === model.id ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="min-h-[28rem] flex-1 overflow-y-auto p-4">
          {error ? (
            <div className="mb-4 rounded-lg border border-rose-300/40 bg-rose-300/10 p-4 text-sm leading-6 text-rose-100" role="alert">
              {error}
            </div>
          ) : null}
          {activeMessages.length === 0 ? (
            <div className="flex min-h-[24rem] items-center justify-center rounded-lg border border-dashed border-zinc-800 bg-zinc-950/60 p-8 text-center">
              <div className="max-w-md">
                <Sparkles className="mx-auto h-8 w-8 text-emerald-300" aria-hidden="true" />
                <h3 className="mt-4 text-lg font-semibold text-zinc-50">Ready for a command</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  Ask a question or request a safe app action.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {[
                    ["Review photos", "Review uploaded photos and tell me which need captions, alt text, or public URLs."],
                    ["Review docs", "Review uploaded documents and summarize what needs attention."],
                    ["Media upload", "Review recent media uploads and show missing metadata."],
                    ["Inbox summary", "Summarize inbox"],
                  ].map(([label, prompt]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setQuickPrompt(prompt)}
                      className="inline-flex min-h-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 text-sm font-medium text-zinc-300 transition hover:border-emerald-300 hover:text-emerald-100"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              {activeMessages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {isSending ? (
                <div className="flex justify-start">
                  <div className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/70 px-4 py-3 text-sm text-zinc-400">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Thinking
                  </div>
                </div>
              ) : null}
              <div ref={bottomRef} />
            </div>
          )}
        </div>
        <form onSubmit={handleSend} className="border-t border-zinc-800 p-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="min-w-0 flex-1" htmlFor="ai-chat-input">
              <span className="sr-only">Message</span>
              <textarea
                id="ai-chat-input"
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                disabled={isSending}
                className="min-h-24 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-3 text-sm leading-6 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Ask AI Chat or request a safe Control Center action..."
              />
            </label>
            <button
              type="submit"
              disabled={!input.trim() || isSending}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-emerald-400 px-5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
              Send
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
