export type TaskStatus = "queued" | "in_progress" | "needs_review" | "completed" | "blocked";
export type AiModelId = "gpt" | "gemini" | "claude" | "codex" | "deepseek" | "local";
export type Priority = "low" | "medium" | "high";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type ApprovalActionType = "reply_comment" | "reply_message" | "send_email" | "publish_content" | "update_content";
export type ApprovalExecutionStatus = "pending_review" | "approved" | "executing" | "executed" | "failed" | "execution_pending";
export type ProjectStatus = "active" | "archived";
export type RuleEffect = "allow" | "review" | "block";
export type MessageSource = "gmail" | "website" | "instagram" | "facebook" | "tiktok" | "viber";
export type MessageStatus = "unread" | "read" | "drafted" | "replied" | "archived";
export type ContentType = "post" | "story" | "website_page" | "blog" | "reel";
export type ContentPlatform = "website" | "instagram" | "facebook" | "tiktok";
export type ContentStatus = "draft" | "scheduled" | "approval_required" | "approved" | "published" | "failed";
export type ContentAiAction = "generate_caption" | "generate_hashtags" | "generate_website_title" | "generate_story_text" | "generate_short_post" | "generate_alt_text";
export type MediaAssetType = "image" | "video" | "document" | "audio" | "other";
export type MediaAssetStatus = "draft" | "published" | "archived";
export type MediaLinkTarget = "photo" | "story" | "video" | "content";
export type ConnectorType = "email" | "gmail" | "instagram" | "facebook" | "tiktok" | "website" | "viber" | "storage";
export type ConnectorStatus = "not_connected" | "not_configured" | "configured" | "test_pending" | "connected" | "error" | "paused";
export type WebsiteControlStatus = "available" | "review_required" | "blocked";
export type WebsiteControlAction = "create" | "update" | "delete" | "publish" | "reply";
export type AutomationStatus = "active" | "paused";
export type AutomationTrigger = "daily_report" | "new_message" | "content_scheduled" | "handoff_completed" | "approval_pending";
export type AutomationAction = "create_task" | "draft_reply" | "generate_report" | "notify_user" | "draft_content";
export type ChatThreadStatus = "active" | "archived";
export type ChatMessageRole = "user" | "assistant" | "tool" | "system";
export type ChatToolName =
  | "search_tasks"
  | "summarize_inbox"
  | "create_task"
  | "draft_reply"
  | "review_media"
  | "generate_content_ideas"
  | "schedule_content"
  | "list_pending_approvals"
  | "open_project_context"
  | "generate_handoff";

export interface ConnectorExecutionResult {
  execution_status: ApprovalExecutionStatus;
  execution_error?: string;
  details: string;
  log_action: string;
  metadata?: Record<string, unknown>;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  archived_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectMemory {
  id: string;
  project_id: string;
  brand_tone: string;
  target_channels: string[];
  posting_style: string;
  hashtag_style: string;
  notes: string;
  updated_at: string;
}

export interface ProjectMemorySnapshot {
  brand_voice: string;
  target_channels: string[];
  posting_style: string;
  hashtag_style: string;
  notes: string;
}

export interface Task {
  id: string;
  project_id: string;
  title: string;
  goal: string;
  priority: Priority;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
}

export interface TaskState {
  id: string;
  task_id: string;
  goal: string;
  current_stage: string;
  completed_steps: string[];
  next_step: string;
  last_ai: string;
  status: TaskStatus;
  needs_review: boolean;
  metadata: Record<string, unknown>;
  updated_at: string;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface AiRun {
  id: string;
  task_id: string;
  ai_model: string;
  input: string;
  output: string;
  status: "completed" | "failed";
  cost_usd?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  created_at: string;
}

export interface HandoffScoreBreakdown {
  goal: boolean;
  current_stage: boolean;
  completed_steps: boolean;
  next_step: boolean;
  files: boolean;
  rules: boolean;
}

export interface HandoffPack {
  task_id: string;
  from_ai: string;
  to_ai: string;
  goal: string;
  current_stage: string;
  completed_steps: string[];
  next_step: string;
  last_ai: string;
  status: TaskStatus;
  needs_review: boolean;
  files: string[];
  rules: string[];
  context_notes: string[];
  guardrails: string[];
  project_memory?: ProjectMemorySnapshot;
  completeness_score: number;
  ready_for_transfer: boolean;
  score_breakdown: HandoffScoreBreakdown;
  generated_at: string;
}

export interface HandoffSummary {
  id: string;
  task_id: string;
  from_ai: string;
  to_ai: string;
  summary: string;
  handoff_pack: HandoffPack;
  completeness_score: number;
  ready_for_transfer: boolean;
  created_at: string;
}

export interface ActionLog {
  id: string;
  project_id: string;
  task_id?: string;
  actor: string;
  action: string;
  details: string;
  created_at: string;
}

export interface Rule {
  id: string;
  name: string;
  action: string;
  effect: RuleEffect;
  enabled: boolean;
}

export interface Approval {
  id: string;
  task_id: string;
  title: string;
  requested_action: string;
  reason: string;
  status: ApprovalStatus;
  action_type: ApprovalActionType;
  connector: "website" | "email" | "instagram" | "facebook" | "tiktok";
  target_id: string;
  target_type: string;
  draft_text: string;
  metadata: Record<string, unknown>;
  execution_status: ApprovalExecutionStatus;
  execution_error?: string;
  created_at: string;
  resolved_at?: string;
}

export interface Connector {
  id: string;
  project_id: string;
  type: ConnectorType;
  status: ConnectorStatus;
  config: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
}

export interface WebsiteControlMapEntry {
  id: string;
  project_id: string;
  collection_name: string;
  display_name: string;
  create_action: string;
  update_action: string;
  delete_action: string;
  publish_behavior: string;
  source_file: string;
  source_function: string;
  status: WebsiteControlStatus;
  action_statuses: Partial<Record<WebsiteControlAction, WebsiteControlStatus>>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ContentPost {
  id: string;
  project_id: string;
  task_id?: string;
  channel: "instagram" | "facebook" | "website" | "email";
  title: string;
  body: string;
  status: "draft" | "needs_review" | "scheduled" | "published";
  scheduled_for?: string;
  created_at: string;
}

export interface ContentItem {
  id: string;
  project_id: string;
  task_id?: string;
  title: string;
  content_type: ContentType;
  caption_body: string;
  media_placeholder: string;
  status: ContentStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ContentRoute {
  id: string;
  content_item_id: string;
  platform: ContentPlatform;
  target_route: string;
  route_label: string;
  status: ContentStatus;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ContentSchedule {
  id: string;
  content_item_id: string;
  scheduled_for?: string;
  timezone: string;
  status: ContentStatus;
  created_at: string;
  updated_at: string;
}

export interface PublishLog {
  id: string;
  project_id: string;
  content_item_id: string;
  route_id?: string;
  action: string;
  status: ContentStatus | "blocked";
  details: string;
  created_at: string;
}

export interface MediaAsset {
  id: string;
  project_id: string;
  content_item_id?: string;
  linked_collection?: MediaLinkTarget;
  linked_item_id?: string;
  linked_item_label?: string;
  title: string;
  asset_type: MediaAssetType;
  source_url: string;
  storage_path: string;
  alt_text: string;
  tags: string[];
  status: MediaAssetStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  project_id: string;
  connector_id?: string;
  source: MessageSource;
  sender_name: string;
  sender_handle: string;
  subject: string;
  body: string;
  received_at: string;
  status: MessageStatus;
  priority: Priority;
  linked_task_id?: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AutomationRule {
  id: string;
  project_id: string;
  name: string;
  trigger: AutomationTrigger;
  action: AutomationAction;
  schedule: string;
  status: AutomationStatus;
  config: Record<string, unknown>;
  last_run_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ChatThread {
  id: string;
  project_id?: string;
  title: string;
  model_id: AiModelId;
  status: ChatThreadStatus;
  pinned?: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChatToolCall {
  id: string;
  name: ChatToolName | "approval_required" | "blocked_tool";
  arguments: Record<string, unknown>;
  reason: string;
}

export interface ChatToolResult {
  id: string;
  name: ChatToolCall["name"];
  status: "success" | "approval_required" | "blocked" | "error";
  title: string;
  summary: string;
  data: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  thread_id: string;
  role: ChatMessageRole;
  content: string;
  model_id?: AiModelId;
  tool_name?: string;
  tool_call?: ChatToolCall;
  tool_result?: ChatToolResult;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ControlCenterData {
  projects: Project[];
  project_memory: Record<string, ProjectMemory>;
  rules: Rule[];
  tasks: Task[];
  task_states: Record<string, TaskState>;
  ai_runs: AiRun[];
  handoff_summaries: HandoffSummary[];
  action_logs: ActionLog[];
  approvals: Approval[];
  connectors: Connector[];
  website_control_map: WebsiteControlMapEntry[];
  messages: Message[];
  content_items: ContentItem[];
  content_routes: ContentRoute[];
  content_schedule: ContentSchedule[];
  publish_logs: PublishLog[];
  media_assets: MediaAsset[];
  automation_rules: AutomationRule[];
}
