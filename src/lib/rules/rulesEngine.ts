import type { Approval, Rule } from "@/lib/types";

export const defaultRules: Rule[] = [
  {
    id: "rule-draft-allowed",
    name: "Drafts are allowed",
    action: "draft_content",
    effect: "allow",
    enabled: true,
  },
  {
    id: "rule-publish-review",
    name: "Review before publish",
    action: "publish_content",
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
  {
    id: "rule-delete-blocked",
    name: "Delete actions blocked",
    action: "delete_resource",
    effect: "block",
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

  return {
    id: `approval-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    task_id: taskId,
    title: "Review AI draft",
    requested_action: action,
    reason,
    status: "pending",
    created_at: now,
  };
}
