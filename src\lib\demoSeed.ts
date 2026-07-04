import type { ControlCenterData } from "./types";

const now = "2026-06-28T08:45:00.000Z";

export const seedData: ControlCenterData = {
  projects: [
    {
      id: "project-wildsaura",
      name: "Wildsaura",
      description: "Creator/business workspace for wildlife content operations.",
      status: "active",
      created_at: now,
      updated_at: now,
    },
  ],
  project_memory: {
    "project-wildsaura": {
      id: "memory-wildsaura",
      project_id: "project-wildsaura",
      brand_tone: "Nature documentary",
      target_channels: ["Instagram", "TikTok"],
      posting_style: "Macro wildlife",
      hashtag_style: "Medium competition",
      notes: "Keep captions observant, specific, and calm.",
      updated_at: now,
    },
  },
  rules: [
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
      id: "rule-delete-blocked",
      name: "Delete actions blocked",
      action: "delete_resource",
      effect: "block",
      enabled: true,
    },
  ],
  tasks: [
    {
      id: "task-instagram-macro",
      project_id: "project-wildsaura",
      title: "Instagram macro insect post",
      goal: "Instagram macro insect post banana with caption and hashtags.",
      priority: "high",
      status: "queued",
      created_at: now,
      updated_at: now,
    },
  ],
  task_states: {
    "task-instagram-macro": {
      id: "state-instagram-macro",
      task_id: "task-instagram-macro",
      goal: "Instagram macro insect post banana with caption and hashtags.",
      current_stage: "Task captured, waiting for first AI pass",
      completed_steps: ["project selected", "goal saved"],
      next_step: "draft caption with AI-1",
      last_ai: "Unassigned",
      status: "queued",
      needs_review: false,
      metadata: {
        channel: "instagram",
        brand: "Wildsaura",
      },
      updated_at: now,
    },
  },
  ai_runs: [],
  handoff_summaries: [],
  action_logs: [
    {
      id: "log-seed-task-created",
      project_id: "project-wildsaura",
      task_id: "task-instagram-macro",
      actor: "User",
      action: "task.created",
      details: "Created task and initial state for Instagram macro insect post.",
      created_at: now,
    },
  ],
  approvals: [],
  connectors: [],
  messages: [],
  content_items: [],
  content_routes: [],
  content_schedule: [],
  publish_logs: [],
  media_assets: [],
  automation_rules: [],
};
