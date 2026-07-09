import { getSupabaseClient, hasSupabaseConfig } from "@/lib/supabase";
import type { AiModelId, ChatMessage, ChatMessageRole, ChatThread, ChatThreadStatus, ChatToolCall, ChatToolResult } from "@/lib/types";

type SupabaseLikeError = { code?: string; message: string } | null;

type ChatThreadRow = Partial<ChatThread> & {
  id: string;
  project_id?: string | null;
  title?: string | null;
  model_id?: string | null;
  status?: string | null;
  created_at: string;
  updated_at?: string | null;
};

type ChatMessageRow = Partial<ChatMessage> & {
  id: string;
  thread_id: string;
  role?: string | null;
  content?: string | null;
  model_id?: string | null;
  tool_name?: string | null;
  tool_call?: ChatToolCall | null;
  tool_result?: ChatToolResult | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
};

export const CHAT_SCHEMA_MISSING_MESSAGE = "Chat tables are missing. Run database/schema.sql in Supabase SQL editor, then press Reload.";
const THREAD_CONTROL_PIN = "pin";

const aiModelIds: AiModelId[] = ["gpt", "gemini", "claude", "codex", "deepseek", "local"];
const threadStatuses: ChatThreadStatus[] = ["active", "archived"];
const messageRoles: ChatMessageRole[] = ["user", "assistant", "tool", "system"];

function assertSupabaseReady() {
  if (!hasSupabaseConfig()) {
    throw new Error("Supabase env variables are missing. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
}

function isMissingTable(error: SupabaseLikeError) {
  return Boolean(error?.code === "PGRST205" || error?.message.includes("Could not find the table"));
}

function throwChatError(context: string, error: SupabaseLikeError) {
  if (!error) {
    return;
  }

  if (isMissingTable(error)) {
    throw new Error(CHAT_SCHEMA_MISSING_MESSAGE);
  }

  throw new Error(`${context}: ${error.message}`);
}

function isAiModelId(value: unknown): value is AiModelId {
  return typeof value === "string" && aiModelIds.includes(value as AiModelId);
}

function isThreadStatus(value: unknown): value is ChatThreadStatus {
  return typeof value === "string" && threadStatuses.includes(value as ChatThreadStatus);
}

function isMessageRole(value: unknown): value is ChatMessageRole {
  return typeof value === "string" && messageRoles.includes(value as ChatMessageRole);
}

function normalizeThread(row: ChatThreadRow): ChatThread {
  return {
    id: row.id,
    project_id: row.project_id ?? undefined,
    title: row.title?.trim() || "New chat",
    model_id: isAiModelId(row.model_id) ? row.model_id : "gpt",
    status: isThreadStatus(row.status) ? row.status : "active",
    pinned: Boolean(row.pinned),
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
  };
}

function normalizeMessage(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    thread_id: row.thread_id,
    role: isMessageRole(row.role) ? row.role : "assistant",
    content: row.content ?? "",
    model_id: isAiModelId(row.model_id) ? row.model_id : undefined,
    tool_name: row.tool_name ?? undefined,
    tool_call: row.tool_call ?? undefined,
    tool_result: row.tool_result ?? undefined,
    metadata: row.metadata ?? {},
    created_at: row.created_at,
  };
}

function threadTitleFromMessage(message: string) {
  const clean = message.replace(/\s+/g, " ").trim();

  if (!clean) {
    return "New command chat";
  }

  return clean.length > 56 ? `${clean.slice(0, 55).trim()}...` : clean;
}

function isThreadControlMessage(row: Pick<ChatMessageRow, "metadata">) {
  return row.metadata?.thread_control === THREAD_CONTROL_PIN;
}

function pinnedMapFromMessages(messages: ChatMessageRow[]) {
  const pinnedByThread = new Map<string, boolean>();

  for (const message of messages) {
    if (isThreadControlMessage(message)) {
      pinnedByThread.set(message.thread_id, message.metadata?.pinned === true);
    }
  }

  return pinnedByThread;
}

function sortThreads(threads: ChatThread[]) {
  return [...threads].sort((left, right) => {
    if (Boolean(left.pinned) !== Boolean(right.pinned)) {
      return left.pinned ? -1 : 1;
    }

    return right.updated_at.localeCompare(left.updated_at);
  });
}

async function touchThread(supabase: ReturnType<typeof getSupabaseClient>, threadId: string, updatedAt: string) {
  const touchResult = await supabase.from("chat_threads").update({ updated_at: updatedAt }).eq("id", threadId);
  throwChatError("Touch chat thread", touchResult.error);
}

async function insertThreadControlMessage(input: { threadId: string; pinned: boolean; createdAt: string }) {
  const supabase = getSupabaseClient();
  const messageResult = await supabase
    .from("chat_messages")
    .insert({
      thread_id: input.threadId,
      role: "system",
      content: input.pinned ? "Thread pinned" : "Thread unpinned",
      model_id: null,
      tool_name: null,
      tool_call: null,
      tool_result: null,
      metadata: {
        thread_control: THREAD_CONTROL_PIN,
        pinned: input.pinned,
      },
      created_at: input.createdAt,
    })
    .select("*")
    .single();

  throwChatError("Save chat pin state", messageResult.error);
  await touchThread(supabase, input.threadId, input.createdAt);
}

async function currentPinnedState(threadId: string) {
  const supabase = getSupabaseClient();
  const result = await supabase
    .from("chat_messages")
    .select("thread_id, metadata, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  throwChatError("Load chat pin state", result.error);
  const pinnedByThread = pinnedMapFromMessages((result.data ?? []) as ChatMessageRow[]);

  return pinnedByThread.get(threadId) ?? false;
}

export async function loadChatData(projectId?: string) {
  assertSupabaseReady();
  const supabase = getSupabaseClient();
  let threadQuery = supabase.from("chat_threads").select("*").order("updated_at", { ascending: false }).limit(40);

  if (projectId) {
    threadQuery = threadQuery.eq("project_id", projectId);
  }

  const threadResult = await threadQuery;
  throwChatError("Load chat threads", threadResult.error);
  const threads = ((threadResult.data ?? []) as ChatThreadRow[]).map(normalizeThread);
  const threadIds = threads.map((thread) => thread.id);

  if (threadIds.length === 0) {
    return { threads, messages: [] as ChatMessage[] };
  }

  const messagesResult = await supabase
    .from("chat_messages")
    .select("*")
    .in("thread_id", threadIds)
    .order("created_at", { ascending: true });

  throwChatError("Load chat messages", messagesResult.error);
  const rawMessages = (messagesResult.data ?? []) as ChatMessageRow[];
  const pinnedByThread = pinnedMapFromMessages(rawMessages);
  const decoratedThreads = threads.map((thread) => ({
    ...thread,
    pinned: pinnedByThread.get(thread.id) ?? false,
  }));

  return {
    threads: sortThreads(decoratedThreads),
    messages: rawMessages.filter((message) => !isThreadControlMessage(message)).map(normalizeMessage),
  };
}

export async function ensureChatThread(input: {
  threadId?: string;
  projectId?: string;
  modelId: AiModelId;
  titleSeed: string;
}) {
  assertSupabaseReady();
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();

  if (input.threadId) {
    const updateResult = await supabase
      .from("chat_threads")
      .update({ model_id: input.modelId, updated_at: now })
      .eq("id", input.threadId)
      .select("*")
      .single();

    throwChatError("Update chat thread", updateResult.error);

    if (updateResult.data) {
      return normalizeThread(updateResult.data as ChatThreadRow);
    }
  }

  const insertResult = await supabase
    .from("chat_threads")
    .insert({
      project_id: input.projectId ?? null,
      title: threadTitleFromMessage(input.titleSeed),
      model_id: input.modelId,
      status: "active",
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  throwChatError("Create chat thread", insertResult.error);
  return normalizeThread(insertResult.data as ChatThreadRow);
}

export async function saveChatMessage(input: {
  threadId: string;
  role: ChatMessageRole;
  content: string;
  modelId?: AiModelId;
  toolName?: string;
  toolCall?: ChatToolCall;
  toolResult?: ChatToolResult;
  metadata?: Record<string, unknown>;
}) {
  assertSupabaseReady();
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  const messageResult = await supabase
    .from("chat_messages")
    .insert({
      thread_id: input.threadId,
      role: input.role,
      content: input.content,
      model_id: input.modelId ?? null,
      tool_name: input.toolName ?? null,
      tool_call: input.toolCall ?? null,
      tool_result: input.toolResult ?? null,
      metadata: input.metadata ?? {},
      created_at: now,
    })
    .select("*")
    .single();

  throwChatError("Save chat message", messageResult.error);

  const touchResult = await supabase.from("chat_threads").update({ updated_at: now }).eq("id", input.threadId);
  throwChatError("Touch chat thread", touchResult.error);

  return normalizeMessage(messageResult.data as ChatMessageRow);
}

export async function setChatThreadPinned(threadId: string, pinned: boolean) {
  assertSupabaseReady();
  const now = new Date().toISOString();

  await insertThreadControlMessage({ threadId, pinned, createdAt: now });
}

export async function clearChatThreadHistory(threadId: string) {
  assertSupabaseReady();
  const supabase = getSupabaseClient();
  const wasPinned = await currentPinnedState(threadId);
  const deleteResult = await supabase.from("chat_messages").delete().eq("thread_id", threadId);

  throwChatError("Clear chat history", deleteResult.error);

  const now = new Date().toISOString();

  if (wasPinned) {
    await insertThreadControlMessage({ threadId, pinned: true, createdAt: now });
    return;
  }

  await touchThread(supabase, threadId, now);
}

export async function deleteChatThread(threadId: string) {
  assertSupabaseReady();
  const supabase = getSupabaseClient();
  const deleteResult = await supabase.from("chat_threads").delete().eq("id", threadId);

  throwChatError("Delete chat thread", deleteResult.error);
}
