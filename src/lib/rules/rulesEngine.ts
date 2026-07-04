import type { Approval, Rule } from "@/lib/types";

export const defaultRules: Rule[] = [
  {
    id: "rule-draft-allowed",
    name: "Create Draft",
    action: "draft_content",
    effect: "allow",
    enabled: true,
  },
  {
    id: "rule-publish-review",
    name: "Publish Content",
    action: "publish_content",
    effect: "review",
    enabled: true,
  },
  {
    id: "rule-update-live-review",
    name: "Update Live Content",
    action: "update_live_content",
    effect: "review",
    enabled: true,
  },
  {
    id: "rule-delete-blocked",
    name: "Delete Resource",
    action: "delete_resource",
    effect: "block",
    enabled: true,
  },
  {
    id: "rule-comment-reply-review",
    name: "Reply Comment",
    action: "reply_comment",
    effect: "review",
    enabled: true,
  },
  {
    id: "rule-email-review",
    name: "Review before send",
    action: "send_email",
    effect: "review",
    enabled: true,
  },
];

export interface RuleDecision {
  allowed: boolean;
  requiresApproval: boolean;
  reason: string;
}

export function evaluateAction(action: string, rules = defaultRules): RuleDecision {
  const rule = rules.find((item) => item.enabled && item.action === action);

  if (!rule) {
    return {
      allowed: true,
      requiresApproval: true,
      reason: "Unknown action requires review by default.",
    };
  }

  if (rule.effect === "block") {
    return {
      allowed: false,
      requiresApproval: false,
      reason: `${rule.name}: blocked by rule engine.`,
    };
  }

  if (rule.effect === "review") {
    return {
      allowed: true,
      requiresApproval: true,
      reason: `${rule.name}: approval required.`,
    };
  }

  return {
    allowed: true,
    requiresApproval: false,
    reason: `${rule.name}: allowed.`,
  };
}

export function createApprovalForAction(taskId: string, action: string, reason: string): Approval {
  const now = new Date().toISOString();
  const actionType = action === "send_email"
    ? "send_email"
    : action === "update_content" || action === "update_live_content"
      ? "update_content"
      : action === "reply_comment"
        ? "reply_comment"
        : action === "reply_message"
          ? "reply_message"
          : "publish_content";

  return {
    id: `approval-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    task_id: taskId,
    title: "Review AI draft",
    requested_action: action,
    reason,
    status: "pending",
    action_type: actionType,
    connector: actionType === "send_email" ? "email" : "website",
    target_id: taskId,
    target_type: "task",
    draft_text: "",
    metadata: {
      source: "rules_engine",
      original_action: action,
    },
    execution_status: "pending_review",
    created_at: now,
  };
}
