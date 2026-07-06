import { NextResponse } from "next/server";
import { approveActionInDb, loadControlCenterData } from "@/lib/db/controlCenterRepository";
import { executeWebsiteApproval } from "@/lib/connectors/websiteExecutionService";
import type { Approval, ConnectorExecutionResult, ContentItem, ContentRoute, MediaAsset, Message, Task, TaskState } from "@/lib/types";

const REPLY_APPROVAL_PREFIX = "reply_comment:";
const PUBLISH_APPROVAL_PREFIX = "publish_content:";

type ApproveRequest = {
  approvalId?: unknown;
};

function errorResponse(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function approvalTargetId(requestedAction: string, prefix: string) {
  return requestedAction.startsWith(prefix) ? requestedAction.slice(prefix.length) : "";
}

function metadataText(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" ? value.trim() : "";
}

function buildApprovedState(input: {
  task: Task;
  state: TaskState;
  approval: Approval;
  message?: Message;
  isPublishApproval: boolean;
  resolvedAt: string;
}): TaskState {
  const isReplyApproval = Boolean(input.message);

  return {
    ...input.state,
    current_stage: isReplyApproval
      ? "reply draft approved, executing connector action"
      : input.isPublishApproval
        ? "content publish approved, executing connector action"
        : "approval granted, executing connector action",
    completed_steps: Array.from(
      new Set([
        ...input.state.completed_steps,
        isReplyApproval ? "reply approval granted" : input.isPublishApproval ? "publish approval granted" : "approval granted",
      ]),
    ),
    next_step: isReplyApproval
      ? "execute the approved reply through the selected connector"
      : input.isPublishApproval
        ? "execute the approved publish/update through the selected connector"
        : "execute the approved connector action",
    status: "in_progress",
    needs_review: false,
    updated_at: input.resolvedAt,
    metadata: {
      ...input.state.metadata,
      approval_execution_requested_at: input.resolvedAt,
      approval_id: input.approval.id,
    },
  };
}

function messageTargetId(approval: Approval) {
  if (approval.action_type === "reply_comment" || approval.action_type === "reply_message" || approval.action_type === "send_email") {
    return approval.target_id || metadataText(approval.metadata, "message_id") || approvalTargetId(approval.requested_action, REPLY_APPROVAL_PREFIX);
  }

  return metadataText(approval.metadata, "message_id") || approvalTargetId(approval.requested_action, REPLY_APPROVAL_PREFIX);
}

function contentTargetId(approval: Approval) {
  if (approval.action_type === "publish_content" || approval.action_type === "update_content") {
    return approval.target_id || approvalTargetId(approval.requested_action, PUBLISH_APPROVAL_PREFIX);
  }

  return approvalTargetId(approval.requested_action, PUBLISH_APPROVAL_PREFIX);
}

async function executionResultForApproval(input: {
  approval: Approval;
  message?: Message;
  contentItem?: ContentItem;
  routes?: ContentRoute[];
  mediaAsset?: MediaAsset;
  connectors: Awaited<ReturnType<typeof loadControlCenterData>>["connectors"];
}): Promise<ConnectorExecutionResult | undefined> {
  if (
    input.approval.connector === "website" &&
    (input.approval.action_type === "reply_comment" ||
      input.approval.action_type === "reply_message" ||
      input.approval.action_type === "publish_content")
  ) {
    return executeWebsiteApproval(input);
  }

  return undefined;
}

export async function POST(request: Request) {
  let body: ApproveRequest;

  try {
    body = (await request.json()) as ApproveRequest;
  } catch {
    return errorResponse("Invalid JSON payload.", 400);
  }

  const approvalId = typeof body.approvalId === "string" ? body.approvalId.trim() : "";

  if (!approvalId) {
    return errorResponse("approvalId is required.", 400);
  }

  try {
    const data = await loadControlCenterData();
    const approval = data.approvals.find((item) => item.id === approvalId);

    if (!approval) {
      return errorResponse("Approval not found.", 404);
    }

    const isPendingApproval = approval.status === "pending" && approval.execution_status === "pending_review";
    const isRetryableExecution =
      approval.status === "approved" && (approval.execution_status === "execution_pending" || approval.execution_status === "failed");

    if (!isPendingApproval && !isRetryableExecution) {
      return errorResponse(`Approval cannot be executed from current status: ${approval.execution_status}.`, 409);
    }

    const task = data.tasks.find((item) => item.id === approval.task_id);
    const state = data.task_states[approval.task_id];

    if (!task || !state) {
      return errorResponse("Approval task/state context is missing.", 409);
    }

    const replyMessageId = messageTargetId(approval);
    const publishContentId = contentTargetId(approval);
    const message = replyMessageId ? data.messages.find((item) => item.id === replyMessageId) : undefined;
    const contentItem = publishContentId ? data.content_items.find((item) => item.id === publishContentId) : undefined;
    const contentRoutes: ContentRoute[] | undefined = publishContentId
      ? data.content_routes.filter((route) => route.content_item_id === publishContentId)
      : undefined;
    const mediaAssetId = contentItem ? metadataText(contentItem.metadata, "media_asset_id") : "";
    const mediaAsset = mediaAssetId ? data.media_assets.find((item) => item.id === mediaAssetId) : undefined;
    const resolvedAt = new Date().toISOString();
    const approvedApproval: Approval = {
      ...approval,
      status: "approved",
      resolved_at: resolvedAt,
    };
    const executionResult = await executionResultForApproval({
      approval: approvedApproval,
      message,
      contentItem,
      routes: contentRoutes,
      mediaAsset,
      connectors: data.connectors,
    });
    const result = await approveActionInDb({
      task,
      state,
      approval: approvedApproval,
      updatedState: buildApprovedState({
        task,
        state,
        approval: approvedApproval,
        message,
        isPublishApproval: Boolean(contentItem),
        resolvedAt,
      }),
      message,
      contentItem,
      routes: contentRoutes,
      executionResult,
    });

    return NextResponse.json({ ok: true, ...result, execution_result: executionResult ?? null }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Approval execution failed.";

    console.error("Approval execution failed:", message);
    return errorResponse(message, 500);
  }
}
