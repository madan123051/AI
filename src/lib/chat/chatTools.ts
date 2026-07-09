import {
  createContentItemInDb,
  createTaskInDb,
  draftReplyForMessageInDb,
  persistGeneratedHandoff,
  requestChatSafetyApprovalInDb,
  requestReplyApprovalForMessageInDb,
} from "@/lib/db/controlCenterRepository";
import { generateHandoffForTask, getModelLabel } from "@/lib/orchestrator/taskRunner";
import type {
  AiModelId,
  ChatToolCall,
  ChatToolName,
  ChatToolResult,
  ContentPlatform,
  ContentType,
  ControlCenterData,
  MediaAsset,
  MediaAssetType,
  Message,
  Project,
  Task,
} from "@/lib/types";

const allowedToolNames: ChatToolName[] = [
  "search_tasks",
  "summarize_inbox",
  "create_task",
  "draft_reply",
  "review_media",
  "generate_content_ideas",
  "schedule_content",
  "list_pending_approvals",
  "open_project_context",
  "generate_handoff",
];

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function argText(args: Record<string, unknown>, key: string) {
  const value = args[key];
  return typeof value === "string" ? value.trim() : "";
}

function projectTasks(data: ControlCenterData, project?: Project) {
  return project ? data.tasks.filter((task) => task.project_id === project.id) : data.tasks;
}

function projectMessages(data: ControlCenterData, project?: Project) {
  return project ? data.messages.filter((message) => message.project_id === project.id) : data.messages;
}

function projectApprovals(data: ControlCenterData, project?: Project) {
  if (!project) {
    return data.approvals;
  }

  const taskIds = new Set(data.tasks.filter((task) => task.project_id === project.id).map((task) => task.id));
  return data.approvals.filter((approval) => taskIds.has(approval.task_id));
}

function titleFromPrompt(prompt: string, fallback: string) {
  const quoted = prompt.match(/["“](.+?)["”]/)?.[1]?.trim();

  if (quoted) {
    return quoted.slice(0, 90);
  }

  const afterColon = prompt.split(":").slice(1).join(":").trim();
  const candidate = afterColon || prompt.replace(/create\s+(a\s+)?(new\s+)?task/i, "").replace(/task\s+banao/i, "").trim();

  return (candidate || fallback).slice(0, 90);
}

function contentTypeFromText(value: string): ContentType {
  const lower = value.toLowerCase();

  if (lower.includes("story")) {
    return "story";
  }

  if (lower.includes("blog")) {
    return "blog";
  }

  if (lower.includes("reel")) {
    return "reel";
  }

  if (lower.includes("website page") || lower.includes("page")) {
    return "website_page";
  }

  return "post";
}

function platformsFromText(value: string): ContentPlatform[] {
  const lower = value.toLowerCase();
  const platforms: ContentPlatform[] = [];

  if (lower.includes("website") || lower.includes("wildsaura")) {
    platforms.push("website");
  }

  if (lower.includes("instagram")) {
    platforms.push("instagram");
  }

  if (lower.includes("facebook")) {
    platforms.push("facebook");
  }

  if (lower.includes("tiktok")) {
    platforms.push("tiktok");
  }

  return platforms.length > 0 ? platforms : ["website"];
}

function mediaAssetTypeFromText(value: string): MediaAssetType | "all" {
  const lower = value.toLowerCase();

  if (lower.includes("doc") || lower.includes("pdf") || lower.includes("contract")) {
    return "document";
  }

  if (lower.includes("photo") || lower.includes("image") || lower.includes("picture")) {
    return "image";
  }

  if (lower.includes("video") || lower.includes("reel")) {
    return "video";
  }

  if (lower.includes("audio")) {
    return "audio";
  }

  return "all";
}

function isAllowedToolName(value: unknown): value is ChatToolName {
  return typeof value === "string" && allowedToolNames.includes(value as ChatToolName);
}

function toolCall(name: ChatToolCall["name"], args: Record<string, unknown>, reason: string): ChatToolCall {
  return {
    id: makeId("tool"),
    name,
    arguments: args,
    reason,
  };
}

function parseDeterministicToolCalls(message: string): ChatToolCall[] {
  const lower = message.toLowerCase();
  const calls: ChatToolCall[] = [];

  if ((lower.includes("search") || lower.includes("find")) && lower.includes("task")) {
    calls.push(toolCall("search_tasks", { query: message }, "Search tasks requested in chat."));
  }

  if (lower.includes("summarize inbox") || lower.includes("inbox summary") || lower.includes("summarise inbox")) {
    calls.push(toolCall("summarize_inbox", {}, "Inbox summary requested in chat."));
  }

  if (lower.includes("create task") || lower.includes("new task") || lower.includes("task banao")) {
    calls.push(toolCall("create_task", { title: titleFromPrompt(message, "Chat-created task"), goal: message }, "Create task requested in chat."));
  }

  if (lower.includes("draft reply") || lower.includes("reply draft")) {
    calls.push(toolCall("draft_reply", {}, "Reply draft requested in chat."));
  }

  if (
    lower.includes("media review") ||
    lower.includes("review media") ||
    lower.includes("media upload") ||
    lower.includes("uploaded media") ||
    lower.includes("uploaded photo") ||
    lower.includes("uploaded image") ||
    lower.includes("uploaded doc") ||
    lower.includes("photo review") ||
    lower.includes("photos review") ||
    lower.includes("image review") ||
    lower.includes("doc review") ||
    lower.includes("document review") ||
    (lower.includes("review") && (lower.includes("photo") || lower.includes("image") || lower.includes("doc") || lower.includes("media")))
  ) {
    calls.push(
      toolCall(
        "review_media",
        { asset_type: mediaAssetTypeFromText(message) },
        "Uploaded media review requested in chat.",
      ),
    );
  }

  if (lower.includes("content idea") || lower.includes("content ideas") || lower.includes("ideas do")) {
    calls.push(toolCall("generate_content_ideas", {}, "Content ideas requested in chat."));
  }

  if (lower.includes("schedule content") || lower.includes("schedule post") || lower.includes("content schedule")) {
    calls.push(
      toolCall(
        "schedule_content",
        { title: titleFromPrompt(message, "Chat scheduled content"), caption_body: message },
        "Content scheduling requested in chat.",
      ),
    );
  }

  if (lower.includes("pending approval") || lower.includes("list approvals") || lower.includes("approval list")) {
    calls.push(toolCall("list_pending_approvals", {}, "Pending approval list requested in chat."));
  }

  if (lower.includes("project context") || lower.includes("brand memory") || lower.includes("project memory") || lower.includes("rules")) {
    calls.push(toolCall("open_project_context", {}, "Project context requested in chat."));
  }

  if (lower.includes("handoff")) {
    calls.push(toolCall("generate_handoff", {}, "Handoff generation requested in chat."));
  }

  return calls;
}

function detectRiskyAction(message: string, data: ControlCenterData, project?: Project): ChatToolCall | undefined {
  const lower = message.toLowerCase();

  if (!project) {
    return undefined;
  }

  const firstContent = data.content_items.find((item) => item.project_id === project.id && item.status !== "published");

  if (lower.includes("delete") || lower.includes("remove permanently")) {
    return toolCall(
      "approval_required",
      {
        action_type: "update_content",
        connector: "website",
        target_type: "delete_request",
        target_id: firstContent?.id,
        title: "Review blocked delete request",
      },
      "Delete actions are blocked from direct chat execution and must be reviewed.",
    );
  }

  if (lower.includes("publish") || lower.includes("post live") || lower.includes("go live")) {
    return toolCall(
      "approval_required",
      {
        action_type: "publish_content",
        connector: "website",
        target_type: firstContent ? "content_item" : "chat_command",
        target_id: firstContent?.id,
        title: "Approve content publish",
      },
      "Publishing requires human approval before connector execution.",
    );
  }

  if (lower.includes("send email") || lower.includes("email send") || lower.includes("mail bhejo")) {
    return toolCall(
      "approval_required",
      {
        action_type: "send_email",
        connector: "email",
        target_type: "email_message",
        title: "Approve email send",
      },
      "Sending email requires human approval.",
    );
  }

  if (lower.includes("reply comment") || lower.includes("comment reply") || lower.includes("reply to comment")) {
    return toolCall(
      "approval_required",
      {
        action_type: "reply_comment",
        connector: "website",
        target_type: "comment",
        title: "Approve comment reply",
      },
      "Comment replies require human approval.",
    );
  }

  if (lower.includes("update live") || lower.includes("edit live")) {
    return toolCall(
      "approval_required",
      {
        action_type: "update_content",
        connector: "website",
        target_type: firstContent ? "content_item" : "chat_command",
        target_id: firstContent?.id,
        title: "Approve live content update",
      },
      "Updating live content requires human approval.",
    );
  }

  return undefined;
}

export function buildChatContextSummary(data: ControlCenterData, project?: Project) {
  const tasks = projectTasks(data, project);
  const messages = projectMessages(data, project);
  const approvals = projectApprovals(data, project);
  const memory = project ? data.project_memory[project.id] : undefined;
  const statefulTasks = tasks.slice(0, 5).map((task) => {
    const state = data.task_states[task.id];
    return {
      title: task.title,
      status: task.status,
      stage: state?.current_stage,
      next_step: state?.next_step,
      last_ai: state?.last_ai,
    };
  });

  return JSON.stringify(
    {
      current_project: project?.name ?? "No project selected",
      brand_memory: memory
        ? {
            brand_tone: memory.brand_tone,
            target_channels: memory.target_channels,
            posting_style: memory.posting_style,
            hashtag_style: memory.hashtag_style,
          }
        : undefined,
      rules: data.rules.filter((rule) => rule.enabled).map((rule) => ({ action: rule.action, effect: rule.effect })),
      recent_tasks: statefulTasks,
      recent_inbox: messages.slice(0, 5).map((message) => ({
        source: message.source,
        sender: message.sender_name,
        subject: message.subject,
        status: message.status,
        priority: message.priority,
      })),
      pending_approvals: approvals.filter((approval) => approval.status === "pending").length,
      recent_media: data.media_assets
        .filter((asset) => !project || asset.project_id === project.id)
        .slice(0, 5)
        .map((asset) => ({
          title: asset.title,
          type: asset.asset_type,
          status: asset.status,
          has_url: Boolean(asset.source_url),
          has_alt_text: Boolean(asset.alt_text),
        })),
      recent_handoffs: data.handoff_summaries.slice(0, 3).map((handoff) => ({
        task_id: handoff.task_id,
        score: handoff.completeness_score,
        to_ai: handoff.to_ai,
      })),
    },
    null,
    2,
  );
}

export function mergeSafeToolCalls(modelCalls: ChatToolCall[], message: string, data: ControlCenterData, project?: Project) {
  const deterministicCalls = parseDeterministicToolCalls(message);
  const hasMediaReview = deterministicCalls.some((call) => call.name === "review_media");
  const hasExplicitCreateTask = deterministicCalls.some((call) => call.name === "create_task");
  const safeModelCalls = modelCalls
    .filter((call) => isAllowedToolName(call.name))
    .filter((call) => !hasMediaReview || hasExplicitCreateTask || call.name !== "create_task");
  const calls = [...safeModelCalls, ...deterministicCalls];
  const riskyCall = detectRiskyAction(message, data, project);

  if (riskyCall) {
    calls.unshift(riskyCall);
  }

  const seen = new Set<string>();

  return calls.filter((call) => {
    const key = `${call.name}:${JSON.stringify(call.arguments)}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function result(input: Omit<ChatToolResult, "id">): ChatToolResult {
  return { id: makeId("result"), ...input };
}

function latestMessage(messages: Message[]) {
  return [...messages].sort((a, b) => b.received_at.localeCompare(a.received_at))[0];
}

function taskPreview(task: Task) {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    goal: task.goal,
  };
}

function mediaPreview(asset: MediaAsset) {
  const uploadMetadata = asset.metadata.upload_metadata;
  const metadata = uploadMetadata && typeof uploadMetadata === "object" && !Array.isArray(uploadMetadata)
    ? (uploadMetadata as Record<string, unknown>)
    : {};

  return {
    id: asset.id,
    title: asset.title,
    asset_type: asset.asset_type,
    status: asset.status,
    linked_collection: asset.linked_collection,
    has_public_url: Boolean(asset.source_url && !asset.source_url.startsWith("local-placeholder/") && !asset.source_url.startsWith("chat-upload://")),
    has_alt_text: Boolean(asset.alt_text.trim()),
    tags: asset.tags,
    file_name: typeof metadata.uploaded_filename === "string" ? metadata.uploaded_filename : asset.storage_path,
  };
}

export async function executeChatToolCall(input: {
  call: ChatToolCall;
  data: ControlCenterData;
  project?: Project;
  modelId: AiModelId;
  userMessage: string;
}): Promise<ChatToolResult> {
  const { call, data, project, modelId, userMessage } = input;

  if (!project) {
    return result({
      name: call.name,
      status: "error",
      title: "Project required",
      summary: "Select or create a project before running this chat tool.",
      data: {},
    });
  }

  if (call.name === "approval_required") {
    const actionType = argText(call.arguments, "action_type") || "update_content";
    const connector = argText(call.arguments, "connector") || "website";
    const targetType = argText(call.arguments, "target_type") || "chat_command";
    const targetId = argText(call.arguments, "target_id");
    const approval = await requestChatSafetyApprovalInDb({
      projectId: project.id,
      prompt: userMessage,
      title: argText(call.arguments, "title") || "Review chat command",
      reason: call.reason,
      actionType:
        actionType === "reply_comment" ||
        actionType === "reply_message" ||
        actionType === "send_email" ||
        actionType === "publish_content" ||
        actionType === "update_content"
          ? actionType
          : "update_content",
      connector:
        connector === "email" || connector === "instagram" || connector === "facebook" || connector === "tiktok" || connector === "website"
          ? connector
          : "website",
      targetType,
      targetId,
      draftText: userMessage,
      metadata: {
        chat_tool_call_id: call.id,
        chat_tool_reason: call.reason,
      },
    });

    return result({
      name: "approval_required",
      status: "approval_required",
      title: "Approval required",
      summary: `${approval.approval.title} is waiting in Approvals. Nothing external was executed.`,
      data: {
        approval: approval.approval,
        task: taskPreview(approval.task),
        action_log: approval.log,
      },
    });
  }

  if (!isAllowedToolName(call.name)) {
    return result({
      name: "blocked_tool",
      status: "blocked",
      title: "Blocked tool",
      summary: "The requested tool is not whitelisted for AI Chat.",
      data: { requested_tool: call.name },
    });
  }

  if (call.name === "search_tasks") {
    const query = cleanText(argText(call.arguments, "query") || userMessage).toLowerCase();
    const tasks = projectTasks(data, project).filter((task) => {
      const state = data.task_states[task.id];
      const haystack = [task.title, task.goal, task.status, state?.current_stage, state?.next_step, state?.last_ai].filter(Boolean).join(" ").toLowerCase();
      return query ? haystack.includes(query) || query.split(" ").some((part) => part.length > 3 && haystack.includes(part)) : true;
    });

    return result({
      name: call.name,
      status: "success",
      title: "Task search",
      summary: `${tasks.length} matching task${tasks.length === 1 ? "" : "s"} found.`,
      data: { tasks: tasks.slice(0, 8).map(taskPreview) },
    });
  }

  if (call.name === "summarize_inbox") {
    const messages = projectMessages(data, project).filter((message) => message.status !== "archived");
    const unread = messages.filter((message) => message.status === "unread").length;
    const highPriority = messages.filter((message) => message.priority === "high").length;

    return result({
      name: call.name,
      status: "success",
      title: "Inbox summary",
      summary: `${messages.length} active messages, ${unread} unread, ${highPriority} high priority.`,
      data: {
        unread,
        high_priority: highPriority,
        recent: messages.slice(0, 6).map((message) => ({
          id: message.id,
          source: message.source,
          sender: message.sender_name,
          subject: message.subject,
          status: message.status,
          priority: message.priority,
        })),
      },
    });
  }

  if (call.name === "create_task") {
    const title = argText(call.arguments, "title") || titleFromPrompt(userMessage, "Chat-created task");
    const goal = argText(call.arguments, "goal") || userMessage;
    const created = await createTaskInDb({ projectId: project.id, title, goal });

    return result({
      name: call.name,
      status: "success",
      title: "Created task",
      summary: `Created task: ${created.task.title}.`,
      data: {
        task: taskPreview(created.task),
        state: created.state,
        action_log: created.log,
      },
    });
  }

  if (call.name === "draft_reply") {
    const messageId = argText(call.arguments, "message_id");
    const messages = projectMessages(data, project);
    const message = messages.find((item) => item.id === messageId) ?? latestMessage(messages);

    if (!message) {
      return result({
        name: call.name,
        status: "error",
        title: "No inbox message",
        summary: "There is no message available to draft a reply for.",
        data: {},
      });
    }

    const drafted = await draftReplyForMessageInDb(message);
    const approval = await requestReplyApprovalForMessageInDb(drafted.message);

    return result({
      name: call.name,
      status: "approval_required",
      title: "Draft reply",
      summary: `Drafted a reply for ${drafted.message.sender_name}. Approval is required before sending.`,
      data: {
        message: drafted.message,
        approval: approval.approval,
        task: taskPreview(approval.task),
      },
    });
  }

  if (call.name === "review_media") {
    const requestedType = argText(call.arguments, "asset_type") || mediaAssetTypeFromText(userMessage);
    const assets = data.media_assets.filter((asset) => {
      if (asset.project_id !== project.id || asset.status === "archived") {
        return false;
      }

      return requestedType === "all" || asset.asset_type === requestedType;
    });
    const needsAltText = assets.filter((asset) => !asset.alt_text.trim()).length;
    const localOnly = assets.filter((asset) => !asset.source_url || asset.source_url.startsWith("local-placeholder/") || asset.source_url.startsWith("chat-upload://")).length;
    const draftAssets = assets.filter((asset) => asset.status === "draft").length;
    const typeLabel = requestedType === "all" ? "media uploads" : `${requestedType} upload${requestedType === "image" ? "s" : ""}`;

    if (assets.length === 0) {
      return result({
        name: call.name,
        status: "success",
        title: "Media review",
        summary: `No active ${typeLabel} found for ${project.name}. Upload files in Publisher or Media, then ask AI Chat to review them.`,
        data: { media_assets: [] },
      });
    }

    return result({
      name: call.name,
      status: "success",
      title: requestedType === "document" ? "Document review" : requestedType === "image" ? "Photo review" : "Media review",
      summary: `${assets.length} ${typeLabel} found. ${draftAssets} draft, ${needsAltText} missing alt/description text, ${localOnly} without public storage URL.`,
      data: {
        media_assets: assets.slice(0, 8).map(mediaPreview),
        counts: {
          total: assets.length,
          draft: draftAssets,
          missing_alt_text: needsAltText,
          missing_public_url: localOnly,
        },
      },
    });
  }

  if (call.name === "generate_content_ideas") {
    const memory = data.project_memory[project.id];
    const tone = memory?.brand_tone || "clear Wildsaura voice";
    const targets = memory?.target_channels.join(", ") || "website and social";
    const ideas = [
      `A field-note post in ${tone} for ${targets}.`,
      "A short behind-the-scenes story explaining how the shot was captured.",
      "A carousel-style educational post with one observation per slide.",
      "A website gallery caption that links the image to habitat, timing, and behavior.",
      "A compact social post with medium-competition hashtags and one clear call to engage.",
    ];

    return result({
      name: call.name,
      status: "success",
      title: "Suggested content",
      summary: "Generated five safe content ideas. No publish action was taken.",
      data: { ideas },
    });
  }

  if (call.name === "schedule_content") {
    const title = argText(call.arguments, "title") || titleFromPrompt(userMessage, "Chat scheduled content");
    const captionBody = argText(call.arguments, "caption_body") || userMessage;
    const scheduledFor = argText(call.arguments, "scheduled_for") || undefined;
    const item = await createContentItemInDb({
      projectId: project.id,
      title,
      content_type: contentTypeFromText(userMessage),
      caption_body: captionBody,
      media_placeholder: "chat-command-placeholder",
      target_platforms: platformsFromText(userMessage),
      target_route: "/chat-command",
      scheduled_for: scheduledFor,
      status: "published",
      rules: data.rules,
    });

    return result({
      name: call.name,
      status: item.approval ? "approval_required" : "success",
      title: item.approval ? "Approval required" : "Scheduled content",
      summary: item.approval
        ? `Created ${item.item.title} and queued publish approval. Nothing was published.`
        : `Created ${item.item.title}.`,
      data: {
        content_item: item.item,
        routes: item.routes,
        schedule: item.schedule,
        approval: item.approval,
        task: item.task ? taskPreview(item.task) : undefined,
      },
    });
  }

  if (call.name === "list_pending_approvals") {
    const approvals = projectApprovals(data, project).filter((approval) => approval.status === "pending" || approval.execution_status === "pending_review");

    return result({
      name: call.name,
      status: "success",
      title: "Pending approvals",
      summary: `${approvals.length} approval${approvals.length === 1 ? "" : "s"} waiting for review.`,
      data: {
        approvals: approvals.slice(0, 8).map((approval) => ({
          id: approval.id,
          title: approval.title,
          action_type: approval.action_type,
          connector: approval.connector,
          execution_status: approval.execution_status,
          created_at: approval.created_at,
        })),
      },
    });
  }

  if (call.name === "open_project_context") {
    const memory = data.project_memory[project.id];
    const activeRules = data.rules.filter((rule) => rule.enabled);

    return result({
      name: call.name,
      status: "success",
      title: "Project context",
      summary: `${project.name} context loaded with ${activeRules.length} active rules and ${projectTasks(data, project).length} tasks.`,
      data: {
        project,
        memory,
        rules: activeRules,
      },
    });
  }

  if (call.name === "generate_handoff") {
    const taskId = argText(call.arguments, "task_id");
    const task = projectTasks(data, project).find((item) => item.id === taskId) ?? projectTasks(data, project)[0];

    if (!task) {
      return result({
        name: call.name,
        status: "error",
        title: "No task for handoff",
        summary: "Create a task before generating a handoff.",
        data: {},
      });
    }

    const state = data.task_states[task.id];

    if (!state) {
      return result({
        name: call.name,
        status: "error",
        title: "Task state missing",
        summary: "This task does not have saved state yet.",
        data: { task: taskPreview(task) },
      });
    }

    const generated = generateHandoffForTask({
      task,
      state,
      projectId: project.id,
      modelId,
      logs: data.action_logs.filter((log) => log.task_id === task.id),
      memory: data.project_memory[project.id],
      rules: data.rules,
    });
    const persisted = await persistGeneratedHandoff({ task, state, handoff: generated.handoff, log: generated.log });

    return result({
      name: call.name,
      status: "success",
      title: "Generated handoff",
      summary: `Handoff ready for ${getModelLabel(modelId)} with ${persisted.handoff.completeness_score}% completeness.`,
      data: {
        task: taskPreview(task),
        handoff: persisted.handoff,
        action_log: persisted.log,
      },
    });
  }

  return result({
    name: "blocked_tool",
    status: "blocked",
    title: "Blocked tool",
    summary: "The requested tool is not available in AI Chat.",
    data: { requested_tool: call.name },
  });
}
