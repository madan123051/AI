import { NextResponse } from "next/server";
import { runChatCommandModel } from "@/lib/chat/chatModel";
import {
  clearChatThreadHistory,
  deleteChatThread,
  ensureChatThread,
  loadChatData,
  saveChatMessage,
  setChatThreadPinned,
} from "@/lib/chat/chatRepository";
import { buildChatContextSummary, executeChatToolCall, mergeSafeToolCalls } from "@/lib/chat/chatTools";
import { loadControlCenterData } from "@/lib/db/controlCenterRepository";
import type { AiModelId, ChatToolResult } from "@/lib/types";

type ChatPostBody = {
  threadId?: unknown;
  projectId?: unknown;
  modelId?: unknown;
  message?: unknown;
};

type ChatPatchBody = {
  action?: unknown;
  threadId?: unknown;
  projectId?: unknown;
  pinned?: unknown;
};

const chatModelIds: AiModelId[] = ["gpt", "gemini", "claude", "deepseek", "local"];

function errorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return NextResponse.json({ ok: false, error: message }, { status });
}

function isAiModelId(value: unknown): value is AiModelId {
  return typeof value === "string" && chatModelIds.includes(value as AiModelId);
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function assistantSummary(modelAnswer: string, toolResults: ChatToolResult[]) {
  const resultLines = toolResults.map((result) => `- ${result.title}: ${result.summary}`);

  if (resultLines.length === 0) {
    return modelAnswer;
  }

  return [modelAnswer, "", "Tool results:", ...resultLines].join("\n");
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("project_id")?.trim() || undefined;
    const data = await loadChatData(projectId);

    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatPostBody;
    const message = textValue(body.message);
    const projectId = textValue(body.projectId) || undefined;
    const modelId = isAiModelId(body.modelId) ? body.modelId : "gpt";
    const threadId = textValue(body.threadId) || undefined;

    if (!message) {
      return NextResponse.json({ ok: false, error: "message is required." }, { status: 400 });
    }

    const controlData = await loadControlCenterData();
    const project = projectId ? controlData.projects.find((item) => item.id === projectId) : controlData.projects[0];
    const thread = await ensureChatThread({
      threadId,
      projectId: project?.id,
      modelId,
      titleSeed: message,
    });
    const userMessage = await saveChatMessage({
      threadId: thread.id,
      role: "user",
      content: message,
      modelId,
    });
    const contextSummary = buildChatContextSummary(controlData, project);
    const modelResult = await runChatCommandModel({ modelId, message, contextSummary });
    const toolCalls = mergeSafeToolCalls(modelResult.tool_calls, message, controlData, project);
    const toolResults: ChatToolResult[] = [];

    for (const call of toolCalls) {
      const toolResult = await executeChatToolCall({
        call,
        data: controlData,
        project,
        modelId,
        userMessage: message,
      });

      toolResults.push(toolResult);
    }

    const assistantMessage = await saveChatMessage({
      threadId: thread.id,
      role: "assistant",
      content: assistantSummary(modelResult.answer, toolResults),
      modelId,
      metadata: {
        model_source: modelResult.source,
        model_name: modelResult.model,
        model_error: modelResult.error,
        tool_calls: toolCalls,
        tool_results: toolResults,
      },
    });
    const toolMessages = [];

    for (const index of toolResults.keys()) {
      const toolResult = toolResults[index];
      const toolCall = toolCalls[index];
      toolMessages.push(
        await saveChatMessage({
          threadId: thread.id,
          role: "tool",
          content: toolResult.summary,
          modelId,
          toolName: toolResult.name,
          toolCall,
          toolResult,
          metadata: {
            source_assistant_message_id: assistantMessage.id,
          },
        }),
      );
    }

    const chatData = await loadChatData(project?.id);

    return NextResponse.json({
      ok: true,
      thread,
      user_message: userMessage,
      assistant_message: assistantMessage,
      tool_messages: toolMessages,
      tool_results: toolResults,
      threads: chatData.threads,
      messages: chatData.messages,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as ChatPatchBody;
    const action = textValue(body.action);
    const threadId = textValue(body.threadId);
    const projectId = textValue(body.projectId) || undefined;

    if (!threadId) {
      return NextResponse.json({ ok: false, error: "threadId is required." }, { status: 400 });
    }

    if (action === "pin_thread") {
      await setChatThreadPinned(threadId, body.pinned === true);
    } else if (action === "clear_history") {
      await clearChatThreadHistory(threadId);
    } else if (action === "delete_thread") {
      await deleteChatThread(threadId);
    } else {
      return NextResponse.json({ ok: false, error: "Unsupported chat action." }, { status: 400 });
    }

    const chatData = await loadChatData(projectId);

    return NextResponse.json({
      ok: true,
      action,
      threads: chatData.threads,
      messages: chatData.messages,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
