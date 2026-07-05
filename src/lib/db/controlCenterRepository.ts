import { getSupabaseClient, hasSupabaseConfig } from "@/lib/supabase";
import { defaultRules, evaluateAction } from "@/lib/rules/rulesEngine";
import type {
  ActionLog,
  AiRun,
  Approval,
  ApprovalActionType,
  ApprovalExecutionStatus,
  AutomationAction,
  AutomationRule,
  AutomationStatus,
  AutomationTrigger,
  Connector,
  ConnectorExecutionResult,
  ConnectorStatus,
  ConnectorType,
  ContentAiAction,
  ContentItem,
  ContentPlatform,
  ContentRoute,
  ContentSchedule,
  ContentStatus,
  ContentType,
  ControlCenterData,
  HandoffPack,
  HandoffSummary,
  MediaAsset,
  MediaLinkTarget,
  MediaAssetStatus,
  MediaAssetType,
  Message,
  MessageSource,
  MessageStatus,
  Priority,
  Project,
  ProjectMemory,
  PublishLog,
  Rule,
  Task,
  TaskState,
  TokenUsage,
  WebsiteControlAction,
  WebsiteControlMapEntry,
  WebsiteControlStatus,
} from "@/lib/types";

type SupabaseLikeError = { code?: string; message: string } | null;
type SupabaseClientInstance = ReturnType<typeof getSupabaseClient>;

type ActionLogRow = Partial<ActionLog> & {
  id: string;
  action: string;
  created_at: string;
  task_id?: string | null;
  project_id?: string | null;
};

type ApprovalRow = Partial<Approval> & {
  id: string;
  task_id: string;
  title: string;
  requested_action: string;
  reason: string;
  status: Approval["status"];
  created_at: string;
  resolved_at?: string | null;
  metadata?: Record<string, unknown> | null;
  execution_error?: string | null;
};

type HandoffRow = Partial<Omit<HandoffSummary, "handoff_pack">> & {
  id: string;
  task_id: string;
  summary?: string | null;
  handoff_pack?: HandoffPack | null;
  created_at: string;
};

type AiRunRow = Omit<AiRun, "cost_usd" | "prompt_tokens" | "completion_tokens" | "total_tokens"> & {
  cost_usd?: number | string | null;
  prompt_tokens?: number | string | null;
  completion_tokens?: number | string | null;
  total_tokens?: number | string | null;
};

type ConnectorRow = Connector & {
  config?: Record<string, unknown> | null;
  updated_at?: string | null;
};

type AutomationRuleRow = AutomationRule & {
  config?: Record<string, unknown> | null;
  last_run_at?: string | null;
  updated_at?: string | null;
};

type MessageRow = Partial<Message> & {
  id: string;
  project_id: string;
  connector_id?: string | null;
  direction?: "inbound" | "outbound" | null;
  sender?: string | null;
  status?: MessageStatus | "new" | "summarized" | "closed" | null;
  created_at: string;
};

type ContentItemRow = ContentItem & {
  task_id?: string | null;
  metadata?: Record<string, unknown> | null;
  updated_at?: string | null;
};

type ContentRouteRow = ContentRoute & {
  metadata?: Record<string, unknown> | null;
};

type ContentScheduleRow = ContentSchedule & {
  scheduled_for?: string | null;
  updated_at?: string | null;
};

type PublishLogRow = PublishLog & {
  route_id?: string | null;
};

type MediaAssetRow = MediaAsset & {
  content_item_id?: string | null;
  status?: MediaAssetStatus | "available" | "attached" | null;
  metadata?: Record<string, unknown> | null;
  tags?: string[] | null;
  updated_at?: string | null;
};

type WebsiteControlMapRow = WebsiteControlMapEntry & {
  action_statuses?: Partial<Record<WebsiteControlAction, WebsiteControlStatus>> | null;
  metadata?: Record<string, unknown> | null;
  updated_at?: string | null;
};

const FALLBACK_HANDOFF_MARKER = "\n\nHANDOFF_PACK_JSON:";
const REPLY_APPROVAL_PREFIX = "reply_comment:";
const PUBLISH_APPROVAL_PREFIX = "publish_content:";

export function emptyControlCenterData(): ControlCenterData {
  return {
    projects: [],
    project_memory: {},
    rules: defaultRules,
    tasks: [],
    task_states: {},
    ai_runs: [],
    handoff_summaries: [],
    action_logs: [],
    approvals: [],
    connectors: [],
    website_control_map: [],
    messages: [],
    content_items: [],
    content_routes: [],
    content_schedule: [],
    publish_logs: [],
    media_assets: [],
    automation_rules: [],
  };
}

function assertSupabaseReady() {
  if (!hasSupabaseConfig()) {
    throw new Error("Supabase env variables are missing. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
}

function isMissingTable(error: SupabaseLikeError) {
  return Boolean(error?.code === "PGRST205" || error?.message.includes("Could not find the table"));
}

function isSchemaMismatch(error: SupabaseLikeError) {
  return Boolean(
    error?.code === "PGRST204" ||
      error?.code === "42703" ||
      error?.message.includes("schema cache") ||
      error?.message.includes("column"),
  );
}

function isLegacyMessageShapeError(error: SupabaseLikeError) {
  return Boolean(
    isSchemaMismatch(error) ||
      error?.code === "23514" ||
      error?.message.includes("messages_status_check") ||
      error?.message.includes("messages_source_check") ||
      error?.message.includes("messages_priority_check"),
  );
}

function throwIfError(context: string, error: SupabaseLikeError) {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }
}

function throwUnlessMissingTable(context: string, error: SupabaseLikeError) {
  if (error && !isMissingTable(error)) {
    throw new Error(`${context}: ${error.message}`);
  }
}

async function deleteEq(supabase: SupabaseClientInstance, table: string, column: string, value: string, context: string) {
  const result = await supabase.from(table).delete().eq(column, value);
  throwUnlessMissingTable(context, result.error);
}

async function deleteIn(supabase: SupabaseClientInstance, table: string, column: string, values: string[], context: string) {
  if (values.length === 0) {
    return;
  }

  const result = await supabase.from(table).delete().in(column, values);
  throwUnlessMissingTable(context, result.error);
}

function normalizeProject(
  row: Project & { updated_at?: string | null; description?: string | null; status?: Project["status"] | null; archived_at?: string | null },
): Project {
  return {
    ...row,
    description: row.description ?? "",
    status: row.status ?? "active",
    archived_at: row.archived_at ?? undefined,
    updated_at: row.updated_at ?? row.created_at,
  };
}

function defaultProjectMemory(projectId: string): ProjectMemory {
  return {
    id: `default-memory-${projectId}`,
    project_id: projectId,
    brand_tone: "Nature documentary",
    target_channels: ["Instagram", "TikTok"],
    posting_style: "Macro wildlife",
    hashtag_style: "Medium competition",
    notes: "",
    updated_at: new Date().toISOString(),
  };
}

function normalizeProjectMemory(row: ProjectMemory & { target_channels?: string[] | null; notes?: string | null }): ProjectMemory {
  return {
    ...row,
    brand_tone: row.brand_tone ?? "Nature documentary",
    target_channels: row.target_channels ?? ["Instagram", "TikTok"],
    posting_style: row.posting_style ?? "Macro wildlife",
    hashtag_style: row.hashtag_style ?? "Medium competition",
    notes: row.notes ?? "",
  };
}

function buildProjectMemoryMap(projects: Project[], memories: ProjectMemory[]) {
  const memoryMap = memories.reduce<Record<string, ProjectMemory>>((accumulator, memory) => {
    accumulator[memory.project_id] = memory;
    return accumulator;
  }, {});

  for (const project of projects) {
    if (!memoryMap[project.id]) {
      memoryMap[project.id] = defaultProjectMemory(project.id);
    }
  }

  return memoryMap;
}

function normalizeRule(row: Rule): Rule {
  return {
    id: row.id,
    name: row.name,
    action: row.action,
    effect: row.effect,
    enabled: row.enabled,
  };
}

function normalizeConnector(row: ConnectorRow): Connector {
  return {
    id: row.id,
    project_id: row.project_id,
    type: isConnectorType(row.type) ? row.type : "website",
    status: isConnectorStatus(row.status) ? row.status : "not_connected",
    config: row.config ?? {},
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
  };
}

function isWebsiteControlStatus(value: unknown): value is WebsiteControlStatus {
  return value === "available" || value === "review_required" || value === "blocked";
}

function normalizeWebsiteControlStatus(value: unknown): WebsiteControlStatus {
  return isWebsiteControlStatus(value) ? value : "review_required";
}

function normalizeWebsiteActionStatuses(value: unknown): Partial<Record<WebsiteControlAction, WebsiteControlStatus>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const source = value as Record<string, unknown>;
  const normalized: Partial<Record<WebsiteControlAction, WebsiteControlStatus>> = {};

  for (const action of ["create", "update", "delete", "publish", "reply"] as WebsiteControlAction[]) {
    if (isWebsiteControlStatus(source[action])) {
      normalized[action] = source[action];
    }
  }

  return normalized;
}

function normalizeWebsiteControlMapEntry(row: WebsiteControlMapRow): WebsiteControlMapEntry {
  return {
    id: row.id,
    project_id: row.project_id,
    collection_name: row.collection_name,
    display_name: row.display_name || row.collection_name,
    create_action: row.create_action ?? "",
    update_action: row.update_action ?? "",
    delete_action: row.delete_action ?? "",
    publish_behavior: row.publish_behavior ?? "",
    source_file: row.source_file ?? "",
    source_function: row.source_function ?? "",
    status: normalizeWebsiteControlStatus(row.status),
    action_statuses: normalizeWebsiteActionStatuses(row.action_statuses),
    metadata: row.metadata ?? {},
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
  };
}

function defaultWebsiteControlMapEntries(projectId: string): WebsiteControlMapEntry[] {
  const now = new Date().toISOString();
  const base = {
    project_id: projectId,
    metadata: { source: "wildsaura_audit", writes_enabled: false, persisted: false },
    created_at: now,
    updated_at: now,
  };

  return [
    {
      ...base,
      id: `default-control-${projectId}-photos`,
      collection_name: "photos",
      display_name: "Photos",
      create_action: "addPhotoToFirestore",
      update_action: "updatePhotoInFirestore",
      delete_action: "deletePhotoFromFirestore",
      publish_behavior: "Create writes live Wildsaura photos with status approved, isPublic true, and published true.",
      source_file: "work/wildsaura/src/services/photoService.ts",
      source_function: "addPhotoToFirestore / updatePhotoInFirestore / deletePhotoFromFirestore",
      status: "review_required",
      action_statuses: { create: "review_required", update: "review_required", delete: "blocked", publish: "review_required" },
    },
    {
      ...base,
      id: `default-control-${projectId}-stories`,
      collection_name: "stories",
      display_name: "Stories",
      create_action: "addStoryToFirestore",
      update_action: "updateStoryInFirestore",
      delete_action: "deleteStoryFromFirestore",
      publish_behavior: "Stories become visible through the live stories subscription after create.",
      source_file: "work/wildsaura/src/services/storyService.ts",
      source_function: "addStoryToFirestore / updateStoryInFirestore / deleteStoryFromFirestore",
      status: "review_required",
      action_statuses: { create: "review_required", update: "review_required", delete: "blocked", publish: "review_required" },
    },
    {
      ...base,
      id: `default-control-${projectId}-videos`,
      collection_name: "videos",
      display_name: "Videos",
      create_action: "addVideoToFirestore",
      update_action: "updateVideoInFirestore",
      delete_action: "deleteVideoFromFirestore",
      publish_behavior: "Videos become visible through the live videos subscription after create.",
      source_file: "work/wildsaura/src/services/videoService.ts",
      source_function: "addVideoToFirestore / updateVideoInFirestore / deleteVideoFromFirestore",
      status: "review_required",
      action_statuses: { create: "review_required", update: "review_required", delete: "blocked", publish: "review_required" },
    },
    {
      ...base,
      id: `default-control-${projectId}-comments`,
      collection_name: "comments",
      display_name: "Comments",
      create_action: "addCommentToFirestore",
      update_action: "not implemented",
      delete_action: "deleteCommentFromFirestore",
      publish_behavior: "Inbound photo, story, and video comments are captured into AI Control Center; AI replies require review.",
      source_file: "work/wildsaura/src/services/commentService.ts",
      source_function: "addCommentToFirestore / deleteCommentFromFirestore / sendToAiControlCenter",
      status: "available",
      action_statuses: { create: "available", update: "blocked", delete: "blocked", publish: "review_required", reply: "review_required" },
    },
    {
      ...base,
      id: `default-control-${projectId}-community-posts`,
      collection_name: "community_posts",
      display_name: "Community Posts",
      create_action: "handleSubmitPost",
      update_action: "handleEditPost",
      delete_action: "handleDeletePost",
      publish_behavior: "Community posts and comments are live after authenticated Firestore writes; comment replies require review.",
      source_file: "work/wildsaura/src/components/CommunityPage.tsx",
      source_function: "handleSubmitPost / handleEditPost / handleDeletePost / handleComment",
      status: "review_required",
      action_statuses: { create: "review_required", update: "review_required", delete: "blocked", publish: "review_required", reply: "review_required" },
    },
  ];
}

async function ensureDefaultWebsiteRules(supabase: SupabaseClientInstance, rules: Rule[]) {
  const requiredRules: Array<Omit<Rule, "id">> = [
    { name: "Create Draft", action: "draft_content", effect: "allow", enabled: true },
    { name: "Publish Content", action: "publish_content", effect: "review", enabled: true },
    { name: "Update Live Content", action: "update_live_content", effect: "review", enabled: true },
    { name: "Delete Resource", action: "delete_resource", effect: "block", enabled: true },
    { name: "Reply Comment", action: "reply_comment", effect: "review", enabled: true },
  ];
  const existingActions = new Set(rules.map((rule) => rule.action));
  const missingRules = requiredRules.filter((rule) => !existingActions.has(rule.action));

  if (missingRules.length === 0) {
    return rules;
  }

  const result = await supabase.from("rules").insert(missingRules).select("*");
  throwUnlessMissingTable("Seed website control rules", result.error);

  return [...rules, ...(((result.data ?? []) as Rule[]).map(normalizeRule))];
}

async function ensureWebsiteControlMapEntries(
  supabase: SupabaseClientInstance,
  projects: Project[],
  rows: WebsiteControlMapEntry[],
) {
  if (projects.length === 0) {
    return rows;
  }

  const missingRows = projects.flatMap((project) => {
    const existingCollectionNames = new Set(rows.filter((row) => row.project_id === project.id).map((row) => row.collection_name));

    return defaultWebsiteControlMapEntries(project.id)
      .filter((entry) => !existingCollectionNames.has(entry.collection_name))
      .map((entry) => ({
        project_id: entry.project_id,
        collection_name: entry.collection_name,
        display_name: entry.display_name,
        create_action: entry.create_action,
        update_action: entry.update_action,
        delete_action: entry.delete_action,
        publish_behavior: entry.publish_behavior,
        source_file: entry.source_file,
        source_function: entry.source_function,
        status: entry.status,
        action_statuses: entry.action_statuses,
        metadata: { ...entry.metadata, persisted: true },
      }));
  });

  if (missingRows.length === 0) {
    return rows;
  }

  const result = await supabase.from("website_control_map").insert(missingRows).select("*");
  throwUnlessMissingTable("Seed website control map", result.error);

  return [...rows, ...(((result.data ?? []) as WebsiteControlMapRow[]).map(normalizeWebsiteControlMapEntry))];
}

function isConnectorType(value: unknown): value is ConnectorType {
  return value === "email" || value === "gmail" || value === "instagram" || value === "facebook" || value === "website" || value === "viber" || value === "storage";
}

function isConnectorStatus(value: unknown): value is ConnectorStatus {
  return (
    value === "not_connected" ||
    value === "not_configured" ||
    value === "configured" ||
    value === "test_pending" ||
    value === "connected" ||
    value === "error" ||
    value === "paused"
  );
}

function isAutomationTrigger(value: unknown): value is AutomationTrigger {
  return (
    value === "daily_report" ||
    value === "new_message" ||
    value === "content_scheduled" ||
    value === "handoff_completed" ||
    value === "approval_pending"
  );
}

function isAutomationAction(value: unknown): value is AutomationAction {
  return value === "create_task" || value === "draft_reply" || value === "generate_report" || value === "notify_user" || value === "draft_content";
}

function isAutomationStatus(value: unknown): value is AutomationStatus {
  return value === "active" || value === "paused";
}

function normalizeAutomationRule(row: AutomationRuleRow): AutomationRule {
  return {
    id: row.id,
    project_id: row.project_id,
    name: row.name,
    trigger: isAutomationTrigger(row.trigger) ? row.trigger : "daily_report",
    action: isAutomationAction(row.action) ? row.action : "generate_report",
    schedule: row.schedule ?? "manual",
    status: isAutomationStatus(row.status) ? row.status : "paused",
    config: row.config ?? {},
    last_run_at: row.last_run_at ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
  };
}

function isMessageSource(value: unknown): value is MessageSource {
  return value === "gmail" || value === "website" || value === "instagram" || value === "facebook" || value === "viber";
}

function isMessageStatus(value: unknown): value is MessageStatus {
  return value === "unread" || value === "read" || value === "drafted" || value === "replied" || value === "archived";
}

function normalizeLegacyMessageStatus(status: MessageRow["status"]): MessageStatus {
  if (isMessageStatus(status)) {
    return status;
  }

  if (status === "summarized") {
    return "read";
  }

  if (status === "drafted") {
    return "drafted";
  }

  if (status === "closed") {
    return "archived";
  }

  return "unread";
}

function normalizePriority(value: unknown): Priority {
  return value === "low" || value === "high" ? value : "medium";
}

function normalizeMessage(row: MessageRow): Message {
  const senderName = row.sender_name ?? row.sender ?? "Unknown sender";
  const receivedAt = row.received_at ?? row.created_at;

  return {
    id: row.id,
    project_id: row.project_id,
    connector_id: row.connector_id ?? undefined,
    source: isMessageSource(row.source) ? row.source : "website",
    sender_name: senderName,
    sender_handle: row.sender_handle ?? row.sender ?? "",
    subject: row.subject ?? "",
    body: row.body ?? "",
    received_at: receivedAt,
    status: normalizeLegacyMessageStatus(row.status),
    priority: normalizePriority(row.priority),
    linked_task_id: row.linked_task_id ?? undefined,
    metadata: row.metadata ?? {},
    created_at: row.created_at,
  };
}

function isContentType(value: unknown): value is ContentType {
  return value === "post" || value === "story" || value === "website_page" || value === "blog" || value === "reel";
}

function isContentPlatform(value: unknown): value is ContentPlatform {
  return value === "website" || value === "instagram" || value === "facebook";
}

function isContentStatus(value: unknown): value is ContentStatus {
  return value === "draft" || value === "scheduled" || value === "approval_required" || value === "published" || value === "failed";
}

function normalizeContentStatus(value: unknown): ContentStatus {
  if (isContentStatus(value)) {
    return value;
  }

  if (value === "needs_review") {
    return "approval_required";
  }

  return "draft";
}

function normalizeContentItem(row: ContentItemRow): ContentItem {
  return {
    id: row.id,
    project_id: row.project_id,
    task_id: row.task_id ?? undefined,
    title: row.title,
    content_type: isContentType(row.content_type) ? row.content_type : "post",
    caption_body: row.caption_body ?? "",
    media_placeholder: row.media_placeholder ?? "",
    status: normalizeContentStatus(row.status),
    metadata: row.metadata ?? {},
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
  };
}

function normalizeContentRoute(row: ContentRouteRow): ContentRoute {
  return {
    id: row.id,
    content_item_id: row.content_item_id,
    platform: isContentPlatform(row.platform) ? row.platform : "website",
    target_route: row.target_route ?? "",
    route_label: row.route_label ?? row.target_route ?? "",
    status: normalizeContentStatus(row.status),
    metadata: row.metadata ?? {},
    created_at: row.created_at,
  };
}

function normalizeContentSchedule(row: ContentScheduleRow): ContentSchedule {
  return {
    id: row.id,
    content_item_id: row.content_item_id,
    scheduled_for: row.scheduled_for ?? undefined,
    timezone: row.timezone ?? "local",
    status: normalizeContentStatus(row.status),
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
  };
}

function normalizePublishLog(row: PublishLogRow): PublishLog {
  return {
    id: row.id,
    project_id: row.project_id,
    content_item_id: row.content_item_id,
    route_id: row.route_id ?? undefined,
    action: row.action,
    status: row.status === "blocked" ? "blocked" : normalizeContentStatus(row.status),
    details: row.details ?? "",
    created_at: row.created_at,
  };
}

function isMediaAssetType(value: unknown): value is MediaAssetType {
  return value === "image" || value === "video" || value === "document" || value === "audio" || value === "other";
}

function isMediaAssetStatus(value: unknown): value is MediaAssetStatus {
  return value === "draft" || value === "published" || value === "archived";
}

function isMediaLinkTarget(value: unknown): value is MediaLinkTarget {
  return value === "photo" || value === "story" || value === "video" || value === "content";
}

function metadataString(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : "";
}

function normalizeMediaAssetStatus(status: unknown, metadata: Record<string, unknown> | undefined): MediaAssetStatus {
  const workflowStatus = metadataString(metadata, "workflow_status");

  if (isMediaAssetStatus(workflowStatus)) {
    return workflowStatus;
  }

  if (isMediaAssetStatus(status)) {
    return status;
  }

  if (status === "attached") {
    return "published";
  }

  return status === "archived" ? "archived" : "draft";
}

function legacyMediaStatus(status: MediaAssetStatus) {
  if (status === "published") {
    return "attached";
  }

  if (status === "archived") {
    return "archived";
  }

  return "available";
}

function isLegacyMediaStatusError(error: SupabaseLikeError) {
  return Boolean(error?.code === "23514" || error?.message.includes("media_assets_status_check"));
}

function normalizeMediaAsset(row: MediaAssetRow): MediaAsset {
  const metadata = row.metadata ?? {};
  const linkedCollection = metadataString(metadata, "linked_collection");

  return {
    id: row.id,
    project_id: row.project_id,
    content_item_id: row.content_item_id ?? undefined,
    linked_collection: isMediaLinkTarget(linkedCollection) ? linkedCollection : undefined,
    linked_item_id: metadataString(metadata, "linked_item_id") || row.content_item_id || undefined,
    linked_item_label: metadataString(metadata, "linked_item_label") || undefined,
    title: row.title,
    asset_type: isMediaAssetType(row.asset_type) ? row.asset_type : "image",
    source_url: row.source_url ?? "",
    storage_path: row.storage_path ?? "",
    alt_text: row.alt_text ?? "",
    tags: row.tags ?? [],
    status: normalizeMediaAssetStatus(row.status, metadata),
    metadata,
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
  };
}

function defaultRouteForPlatform(platform: ContentPlatform, contentType: ContentType, route: string) {
  if (platform === "website") {
    return route.trim() || "/content/draft";
  }

  if (contentType === "story") {
    return `${platform} story`;
  }

  if (contentType === "reel") {
    return `${platform} reel`;
  }

  return `${platform} post`;
}

function labelForContentPlatform(platform: ContentPlatform) {
  if (platform === "website") {
    return "Website";
  }

  if (platform === "instagram") {
    return "Instagram";
  }

  return "Facebook";
}

function legacyStatusFromMessageStatus(status: MessageStatus) {
  if (status === "read") {
    return "summarized";
  }

  if (status === "drafted") {
    return "drafted";
  }

  if (status === "replied" || status === "archived") {
    return "closed";
  }

  return "new";
}

function messageActor(message: Message) {
  return message.sender_handle || message.sender_name || "Unknown sender";
}

function isCommentLikeTarget(value: string) {
  return value.toLowerCase().includes("comment");
}

function approvalConnectorForMessage(message: Message): ApprovalConnector {
  if (message.source === "gmail") {
    return "email";
  }

  if (message.source === "instagram" || message.source === "facebook") {
    return message.source;
  }

  return "website";
}

function approvalActionTypeForMessage(message: Message): ApprovalActionType {
  const connector = approvalConnectorForMessage(message);
  const eventType = metadataString(message.metadata, "connector_event_type") || metadataString(message.metadata, "type");

  if (connector === "email") {
    return "send_email";
  }

  if (isCommentLikeTarget(eventType) || message.source === "instagram" || message.source === "facebook") {
    return "reply_comment";
  }

  return "reply_message";
}

function approvalTargetTypeForMessage(message: Message) {
  const eventType = metadataString(message.metadata, "connector_event_type") || metadataString(message.metadata, "type");

  if (eventType) {
    return eventType;
  }

  return approvalActionTypeForMessage(message) === "reply_comment" ? "comment" : "message";
}

function connectorForContentRoutes(routes: ContentRoute[]): ApprovalConnector {
  const route = routes.find((item) => item.platform === "instagram" || item.platform === "facebook" || item.platform === "website");
  return route?.platform === "instagram" || route?.platform === "facebook" ? route.platform : "website";
}

async function updateMessageWithFallback(
  supabase: SupabaseClientInstance,
  message: Message,
  modernPatch: Record<string, unknown>,
  legacyPatch: Record<string, unknown>,
  context: string,
) {
  const modernResult = await supabase.from("messages").update(modernPatch).eq("id", message.id).select("*").single();

  if (!modernResult.error && modernResult.data) {
    return normalizeMessage(modernResult.data as MessageRow);
  }

  if (isMissingTable(modernResult.error)) {
    throwIfError(context, modernResult.error);
  }

  if (!isLegacyMessageShapeError(modernResult.error)) {
    throwIfError(context, modernResult.error);
  }

  const legacyResult = await supabase.from("messages").update(legacyPatch).eq("id", message.id).select("*").single();

  if (!legacyResult.error && legacyResult.data) {
    return normalizeMessage(legacyResult.data as MessageRow);
  }

  throwIfError(`${context} fallback`, legacyResult.error);
  return message;
}

function normalizeTask(row: Task & { priority?: Task["priority"] | null; status?: Task["status"] | null; updated_at?: string | null }): Task {
  return {
    ...row,
    priority: row.priority ?? "medium",
    status: row.status ?? "queued",
    updated_at: row.updated_at ?? row.created_at,
  };
}

function normalizeLog(row: ActionLogRow): ActionLog {
  return {
    id: row.id,
    project_id: row.project_id ?? "legacy-action-logs",
    task_id: row.task_id ?? undefined,
    actor: row.actor ?? "System",
    action: row.action,
    details: row.details ?? row.action,
    created_at: row.created_at,
  };
}

function normalizeTaskState(row: TaskState & { metadata?: Record<string, unknown> | null }): TaskState {
  return {
    ...row,
    completed_steps: row.completed_steps ?? [],
    metadata: row.metadata ?? {},
  };
}

function tokenUsageFromOutput(output: string): TokenUsage {
  try {
    const parsed = JSON.parse(output) as { token_usage?: Partial<TokenUsage> };
    return {
      prompt_tokens: Number(parsed.token_usage?.prompt_tokens ?? 0),
      completion_tokens: Number(parsed.token_usage?.completion_tokens ?? 0),
      total_tokens: Number(parsed.token_usage?.total_tokens ?? 0),
    };
  } catch {
    return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  }
}

function normalizeRun(row: AiRunRow): AiRun {
  const outputUsage = tokenUsageFromOutput(row.output);

  return {
    ...row,
    cost_usd: Number(row.cost_usd ?? 0),
    prompt_tokens: Number(row.prompt_tokens ?? outputUsage.prompt_tokens ?? 0),
    completion_tokens: Number(row.completion_tokens ?? outputUsage.completion_tokens ?? 0),
    total_tokens: Number(row.total_tokens ?? outputUsage.total_tokens ?? 0),
  };
}

function splitFallbackHandoffSummary(summary: string) {
  const markerIndex = summary.indexOf(FALLBACK_HANDOFF_MARKER);

  if (markerIndex === -1) {
    return { summary, pack: null as HandoffPack | null };
  }

  const cleanSummary = summary.slice(0, markerIndex);
  const rawJson = summary.slice(markerIndex + FALLBACK_HANDOFF_MARKER.length);

  try {
    return { summary: cleanSummary, pack: JSON.parse(rawJson) as HandoffPack };
  } catch {
    return { summary: cleanSummary, pack: null as HandoffPack | null };
  }
}

function fallbackHandoffPack(row: HandoffRow, summary: string): HandoffPack {
  const completenessScore = Number(row.completeness_score ?? 0);
  const readyForTransfer = Boolean(row.ready_for_transfer ?? completenessScore >= 80);

  return {
    task_id: row.task_id,
    from_ai: row.from_ai ?? "Unknown",
    to_ai: row.to_ai ?? "Unknown",
    goal: summary,
    current_stage: "Loaded from legacy handoff summary",
    completed_steps: [],
    next_step: "Review saved summary before continuing",
    last_ai: row.from_ai ?? "Unknown",
    status: "in_progress",
    needs_review: false,
    files: ["No files attached for this MVP task."],
    rules: [],
    context_notes: [summary || "Legacy handoff summary did not include a pack."],
    guardrails: [],
    completeness_score: completenessScore,
    ready_for_transfer: readyForTransfer,
    score_breakdown: {
      goal: summary.trim().length > 0,
      current_stage: false,
      completed_steps: false,
      next_step: false,
      files: true,
      rules: false,
    },
    generated_at: row.created_at,
  };
}

function normalizeHandoff(row: HandoffRow): HandoffSummary {
  const split = splitFallbackHandoffSummary(row.summary ?? "");
  const handoffPack = row.handoff_pack ?? split.pack ?? fallbackHandoffPack(row, split.summary);
  const completenessScore = Number(row.completeness_score ?? handoffPack.completeness_score ?? 0);
  const readyForTransfer = Boolean(row.ready_for_transfer ?? handoffPack.ready_for_transfer ?? completenessScore >= 80);

  return {
    id: row.id,
    task_id: row.task_id,
    from_ai: row.from_ai ?? handoffPack.from_ai ?? "Unknown",
    to_ai: row.to_ai ?? handoffPack.to_ai ?? "Unknown",
    summary: split.summary,
    handoff_pack: {
      ...handoffPack,
      completeness_score: completenessScore,
      ready_for_transfer: readyForTransfer,
    },
    completeness_score: completenessScore,
    ready_for_transfer: readyForTransfer,
    created_at: row.created_at,
  };
}


function localLog(input: Omit<ActionLog, "id" | "created_at" | "project_id"> & { project_id?: string; created_at?: string }): ActionLog {
  return {
    id: `local-log-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    created_at: input.created_at ?? new Date().toISOString(),
    ...input,
    project_id: input.project_id ?? "legacy-action-logs",
  };
}

type ApprovalConnector = Approval["connector"];

type ApprovalInput = Omit<
  Approval,
  "id" | "created_at" | "status" | "action_type" | "connector" | "target_id" | "target_type" | "draft_text" | "metadata" | "execution_status" | "execution_error"
> &
  Partial<Pick<Approval, "action_type" | "connector" | "target_id" | "target_type" | "draft_text" | "metadata" | "execution_status" | "execution_error">> & {
    created_at?: string;
    status?: Approval["status"];
  };

function approvalTargetId(requestedAction: string, prefix: string) {
  return requestedAction.startsWith(prefix) ? requestedAction.slice(prefix.length) : "";
}

function isApprovalActionType(value: unknown): value is ApprovalActionType {
  return value === "reply_comment" || value === "reply_message" || value === "send_email" || value === "publish_content" || value === "update_content";
}

function isApprovalConnector(value: unknown): value is ApprovalConnector {
  return value === "website" || value === "email" || value === "instagram" || value === "facebook";
}

function isApprovalExecutionStatus(value: unknown): value is ApprovalExecutionStatus {
  return value === "pending_review" || value === "approved" || value === "executing" || value === "executed" || value === "failed" || value === "execution_pending";
}

function actionTypeFromRequestedAction(requestedAction: string): ApprovalActionType {
  if (requestedAction.startsWith(REPLY_APPROVAL_PREFIX)) {
    return "reply_comment";
  }

  if (requestedAction.startsWith(PUBLISH_APPROVAL_PREFIX)) {
    return "publish_content";
  }

  if (requestedAction === "send_email") {
    return "send_email";
  }

  if (requestedAction === "update_live_content" || requestedAction === "update_content") {
    return "update_content";
  }

  if (requestedAction === "reply_message") {
    return "reply_message";
  }

  return "reply_message";
}

function executionStatusFromApprovalStatus(status: Approval["status"]): ApprovalExecutionStatus {
  if (status === "pending") {
    return "pending_review";
  }

  if (status === "approved") {
    return "approved";
  }

  return "failed";
}

function targetIdFromRequestedAction(requestedAction: string) {
  return approvalTargetId(requestedAction, REPLY_APPROVAL_PREFIX) || approvalTargetId(requestedAction, PUBLISH_APPROVAL_PREFIX);
}

function targetTypeFromActionType(actionType: ApprovalActionType) {
  if (actionType === "publish_content" || actionType === "update_content") {
    return "content_item";
  }

  return "message";
}

function normalizeApprovalInput(input: ApprovalInput): Omit<Approval, "id" | "created_at"> & { created_at?: string } {
  const actionType = isApprovalActionType(input.action_type) ? input.action_type : actionTypeFromRequestedAction(input.requested_action);

  return {
    task_id: input.task_id,
    title: input.title,
    requested_action: input.requested_action,
    reason: input.reason,
    status: input.status ?? "pending",
    action_type: actionType,
    connector: isApprovalConnector(input.connector) ? input.connector : actionType === "send_email" ? "email" : "website",
    target_id: input.target_id ?? targetIdFromRequestedAction(input.requested_action),
    target_type: input.target_type ?? targetTypeFromActionType(actionType),
    draft_text: input.draft_text ?? "",
    metadata: input.metadata ?? {},
    execution_status: isApprovalExecutionStatus(input.execution_status) ? input.execution_status : "pending_review",
    execution_error: input.execution_error,
    created_at: input.created_at,
    resolved_at: input.resolved_at,
  };
}

function approvalExecutionSchemaError(context: string, error: SupabaseLikeError) {
  if (error && isSchemaMismatch(error)) {
    throw new Error(`${context}: approval execution columns are missing. Run database/phase8b_approval_execution.sql in Supabase SQL editor.`);
  }
}

function localApproval(input: ApprovalInput): Approval {
  const normalized = normalizeApprovalInput(input);

  return {
    id: `local-approval-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    created_at: normalized.created_at ?? new Date().toISOString(),
    ...normalized,
  };
}

function normalizeApproval(row: ApprovalRow): Approval {
  const actionType = isApprovalActionType(row.action_type) ? row.action_type : actionTypeFromRequestedAction(row.requested_action);
  const status = row.status ?? "pending";

  return {
    id: row.id,
    task_id: row.task_id,
    title: row.title,
    requested_action: row.requested_action,
    reason: row.reason,
    status,
    action_type: actionType,
    connector: isApprovalConnector(row.connector) ? row.connector : actionType === "send_email" ? "email" : "website",
    target_id: row.target_id ?? targetIdFromRequestedAction(row.requested_action),
    target_type: row.target_type ?? targetTypeFromActionType(actionType),
    draft_text: row.draft_text ?? "",
    metadata: row.metadata ?? {},
    execution_status: isApprovalExecutionStatus(row.execution_status) ? row.execution_status : executionStatusFromApprovalStatus(status),
    execution_error: row.execution_error ?? undefined,
    created_at: row.created_at,
    resolved_at: row.resolved_at ?? undefined,
  };
}

async function insertApproval(
  supabase: SupabaseClientInstance,
  input: ApprovalInput,
): Promise<Approval | null> {
  const approval = normalizeApprovalInput(input);
  const result = await supabase
    .from("approvals")
    .insert({
      task_id: approval.task_id,
      title: approval.title,
      requested_action: approval.requested_action,
      reason: approval.reason,
      status: approval.status,
      action_type: approval.action_type,
      connector: approval.connector,
      target_id: approval.target_id,
      target_type: approval.target_type,
      draft_text: approval.draft_text,
      metadata: approval.metadata,
      execution_status: approval.execution_status,
      execution_error: approval.execution_error ?? null,
      created_at: approval.created_at,
      resolved_at: approval.resolved_at ?? null,
    })
    .select("*")
    .single();

  if (isMissingTable(result.error)) {
    return null;
  }

  approvalExecutionSchemaError("Create approval", result.error);
  throwUnlessMissingTable("Create approval", result.error);

  return result.data ? normalizeApproval(result.data as ApprovalRow) : null;
}

async function insertActionLog(
  supabase: SupabaseClientInstance,
  input: Omit<ActionLog, "id" | "created_at" | "project_id"> & { project_id?: string; created_at?: string },
): Promise<ActionLog | null> {
  const fullResult = await supabase
    .from("action_logs")
    .insert({
      project_id: input.project_id ?? null,
      task_id: input.task_id ?? null,
      actor: input.actor,
      action: input.action,
      details: input.details,
      created_at: input.created_at,
    })
    .select("*")
    .single();

  if (!fullResult.error && fullResult.data) {
    return normalizeLog(fullResult.data as ActionLogRow);
  }

  if (isMissingTable(fullResult.error)) {
    return null;
  }

  if (!isSchemaMismatch(fullResult.error)) {
    throwIfError("Create action log", fullResult.error);
  }

  const fallbackResult = await supabase
    .from("action_logs")
    .insert({
      task_id: input.task_id ?? null,
      action: `${input.action}: ${input.details}`,
    })
    .select("*")
    .single();

  if (!fallbackResult.error && fallbackResult.data) {
    return normalizeLog(fallbackResult.data as ActionLogRow);
  }

  if (isMissingTable(fallbackResult.error) || isSchemaMismatch(fallbackResult.error)) {
    return null;
  }

  throwIfError("Create fallback action log", fallbackResult.error);
  return null;
}

export async function updateApprovalDraftInDb(approval: Approval, draftText: string, message?: Message) {
  assertSupabaseReady();
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  const trimmedDraft = draftText.trim();

  if (!trimmedDraft) {
    throw new Error("Reply draft cannot be empty.");
  }

  if (approval.status !== "pending" || approval.execution_status !== "pending_review") {
    throw new Error("Only pending approval drafts can be edited.");
  }

  const metadata = {
    ...approval.metadata,
    draft_edited_at: now,
    draft_edited_by: "User",
    manual_draft: true,
  };
  const approvalResult = await supabase
    .from("approvals")
    .update({
      draft_text: trimmedDraft,
      metadata,
    })
    .eq("id", approval.id)
    .select("*")
    .single();

  approvalExecutionSchemaError("Update approval draft", approvalResult.error);
  throwUnlessMissingTable("Update approval draft", approvalResult.error);

  const updatedApproval = approvalResult.data
    ? normalizeApproval(approvalResult.data as ApprovalRow)
    : {
        ...approval,
        draft_text: trimmedDraft,
        metadata,
      };

  let updatedMessage: Message | undefined;

  if (message) {
    updatedMessage = await updateMessageWithFallback(
      supabase,
      message,
      {
        metadata: {
          ...message.metadata,
          ai_draft_reply: trimmedDraft,
          ai_draft_status: "edited",
          ai_draft_edited_at: now,
          reply_approval_id: approval.id,
        },
      },
      {},
      "Update approval message draft",
    );
  }

  const log =
    (await insertActionLog(supabase, {
      project_id: message?.project_id,
      task_id: approval.task_id,
      actor: "User",
      action: "approval.draft_updated",
      details: `Updated reply draft for ${approval.title}.`,
      created_at: now,
    })) ??
    localLog({
      project_id: message?.project_id,
      task_id: approval.task_id,
      actor: "User",
      action: "approval.draft_updated",
      details: `Updated reply draft for ${approval.title}.`,
      created_at: now,
    });

  return { approval: updatedApproval, message: updatedMessage, log };
}

async function insertAiRun(supabase: SupabaseClientInstance, run: AiRun): Promise<AiRun | null> {
  const fullResult = await supabase
    .from("ai_runs")
    .insert({
      task_id: run.task_id,
      ai_model: run.ai_model,
      input: run.input,
      output: run.output,
      status: run.status,
      cost_usd: run.cost_usd ?? 0,
      prompt_tokens: run.prompt_tokens ?? 0,
      completion_tokens: run.completion_tokens ?? 0,
      total_tokens: run.total_tokens ?? 0,
      created_at: run.created_at,
    })
    .select("*")
    .single();

  if (!fullResult.error && fullResult.data) {
    return normalizeRun(fullResult.data as AiRunRow);
  }

  if (isMissingTable(fullResult.error)) {
    return null;
  }

  if (!isSchemaMismatch(fullResult.error)) {
    throwIfError("Create AI run", fullResult.error);
  }

  const fallbackResult = await supabase
    .from("ai_runs")
    .insert({
      task_id: run.task_id,
      ai_model: run.ai_model,
      input: run.input,
      output: run.output,
      status: run.status,
      cost_usd: run.cost_usd ?? 0,
      created_at: run.created_at,
    })
    .select("*")
    .single();

  if (!fallbackResult.error && fallbackResult.data) {
    return normalizeRun(fallbackResult.data as AiRunRow);
  }

  if (isMissingTable(fallbackResult.error) || isSchemaMismatch(fallbackResult.error)) {
    return null;
  }

  throwIfError("Create fallback AI run", fallbackResult.error);
  return null;
}

async function insertHandoffSummary(supabase: SupabaseClientInstance, handoff: HandoffSummary): Promise<HandoffSummary | null> {
  const result = await supabase
    .from("handoff_summaries")
    .insert({
      task_id: handoff.task_id,
      from_ai: handoff.from_ai,
      to_ai: handoff.to_ai,
      summary: handoff.summary,
      handoff_pack: handoff.handoff_pack,
      completeness_score: handoff.completeness_score,
      ready_for_transfer: handoff.ready_for_transfer,
      created_at: handoff.created_at,
    })
    .select("*")
    .single();

  if (!result.error && result.data) {
    return normalizeHandoff(result.data as HandoffRow);
  }

  if (isMissingTable(result.error)) {
    return null;
  }

  throwIfError("Create handoff summary", result.error);
  return null;
}
function deriveTaskState(task: Task): TaskState {
  const inProgress = task.status === "in_progress";
  const needsReview = task.status === "needs_review";
  const completed = task.status === "completed";

  return {
    id: `derived-${task.id}`,
    task_id: task.id,
    goal: task.goal,
    current_stage: completed
      ? "completed"
      : needsReview
        ? "review required"
        : inProgress
          ? "task in progress"
          : "Task captured, waiting for first AI pass",
    completed_steps: ["project selected", "goal saved"],
    next_step: completed
      ? "no next step"
      : needsReview
        ? "review pending action"
        : inProgress
          ? "continue from saved task status"
          : "draft caption with AI-1",
    last_ai: "Unassigned",
    status: task.status,
    needs_review: needsReview,
    metadata: { source: "derived from tasks table" },
    updated_at: task.updated_at,
  };
}

function buildTaskStateMap(tasks: Task[], states: TaskState[]) {
  const stateMap = states.reduce<Record<string, TaskState>>((accumulator, row) => {
    accumulator[row.task_id] = row;
    return accumulator;
  }, {});

  for (const task of tasks) {
    if (!stateMap[task.id]) {
      stateMap[task.id] = deriveTaskState(task);
    }
  }

  return stateMap;
}

export async function loadControlCenterData(): Promise<ControlCenterData> {
  assertSupabaseReady();
  const supabase = getSupabaseClient();

  const [
    projectsResult,
    tasksResult,
    statesResult,
    logsResult,
    handoffsResult,
    runsResult,
    approvalsResult,
    rulesResult,
    memoryResult,
    connectorsResult,
    websiteControlMapResult,
    messagesResult,
    contentItemsResult,
    contentRoutesResult,
    contentScheduleResult,
    publishLogsResult,
    mediaAssetsResult,
    automationRulesResult,
  ] = await Promise.all([
    supabase.from("projects").select("*").order("created_at", { ascending: false }),
    supabase.from("tasks").select("*").order("created_at", { ascending: false }),
    supabase.from("task_states").select("*").order("updated_at", { ascending: false }),
    supabase.from("action_logs").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("handoff_summaries").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("ai_runs").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("approvals").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("rules").select("*").order("created_at", { ascending: true }),
    supabase.from("project_memory").select("*"),
    supabase.from("connectors").select("*").order("created_at", { ascending: false }),
    supabase.from("website_control_map").select("*").order("collection_name", { ascending: true }),
    supabase.from("messages").select("*").order("created_at", { ascending: false }).limit(80),
    supabase.from("content_items").select("*").order("created_at", { ascending: false }).limit(80),
    supabase.from("content_routes").select("*").order("created_at", { ascending: false }).limit(200),
    supabase.from("content_schedule").select("*").order("created_at", { ascending: false }).limit(80),
    supabase.from("publish_logs").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("media_assets").select("*").order("created_at", { ascending: false }).limit(120),
    supabase.from("automation_rules").select("*").order("created_at", { ascending: false }).limit(100),
  ]);

  throwIfError("Load projects", projectsResult.error);
  throwIfError("Load tasks", tasksResult.error);
  throwUnlessMissingTable("Load task states", statesResult.error);
  throwUnlessMissingTable("Load action logs", logsResult.error);
  throwUnlessMissingTable("Load handoff summaries", handoffsResult.error);
  throwUnlessMissingTable("Load AI runs", runsResult.error);
  throwUnlessMissingTable("Load approvals", approvalsResult.error);
  throwUnlessMissingTable("Load rules", rulesResult.error);
  throwUnlessMissingTable("Load project memory", memoryResult.error);
  throwUnlessMissingTable("Load connectors", connectorsResult.error);
  throwUnlessMissingTable("Load website control map", websiteControlMapResult.error);
  throwUnlessMissingTable("Load messages", messagesResult.error);
  throwUnlessMissingTable("Load content items", contentItemsResult.error);
  throwUnlessMissingTable("Load content routes", contentRoutesResult.error);
  throwUnlessMissingTable("Load content schedule", contentScheduleResult.error);
  throwUnlessMissingTable("Load publish logs", publishLogsResult.error);
  throwUnlessMissingTable("Load media assets", mediaAssetsResult.error);
  throwUnlessMissingTable("Load automation rules", automationRulesResult.error);

  const projects = ((projectsResult.data ?? []) as Array<
    Project & { updated_at?: string | null; description?: string | null; status?: Project["status"] | null; archived_at?: string | null }
  >).map(normalizeProject);
  const tasks = ((tasksResult.data ?? []) as Array<Task & { priority?: Task["priority"] | null; status?: Task["status"] | null; updated_at?: string | null }>).map(normalizeTask);
  const states = isMissingTable(statesResult.error)
    ? []
    : ((statesResult.data ?? []) as Array<TaskState & { metadata?: Record<string, unknown> | null }>).map(normalizeTaskState);
  const memories = isMissingTable(memoryResult.error)
    ? []
    : ((memoryResult.data ?? []) as Array<ProjectMemory & { target_channels?: string[] | null; notes?: string | null }>).map(normalizeProjectMemory);
  let rules = isMissingTable(rulesResult.error) ? defaultRules : ((rulesResult.data ?? []) as Rule[]).map(normalizeRule);
  if (!isMissingTable(rulesResult.error)) {
    rules = await ensureDefaultWebsiteRules(supabase, rules);
  }
  const websiteControlMapRows = isMissingTable(websiteControlMapResult.error)
    ? projects.flatMap((project) => defaultWebsiteControlMapEntries(project.id))
    : ((websiteControlMapResult.data ?? []) as WebsiteControlMapRow[]).map(normalizeWebsiteControlMapEntry);
  const websiteControlMap = isMissingTable(websiteControlMapResult.error)
    ? websiteControlMapRows
    : await ensureWebsiteControlMapEntries(supabase, projects, websiteControlMapRows);

  return {
    projects,
    project_memory: buildProjectMemoryMap(projects, memories),
    rules: rules.length > 0 ? rules : defaultRules,
    tasks,
    task_states: buildTaskStateMap(tasks, states),
    action_logs: isMissingTable(logsResult.error) ? [] : ((logsResult.data ?? []) as ActionLogRow[]).map(normalizeLog),
    handoff_summaries: isMissingTable(handoffsResult.error) ? [] : ((handoffsResult.data ?? []) as HandoffRow[]).map(normalizeHandoff),
    ai_runs: isMissingTable(runsResult.error) ? [] : ((runsResult.data ?? []) as AiRunRow[]).map(normalizeRun),
    approvals: isMissingTable(approvalsResult.error) ? [] : ((approvalsResult.data ?? []) as ApprovalRow[]).map(normalizeApproval),
    connectors: isMissingTable(connectorsResult.error) ? [] : ((connectorsResult.data ?? []) as ConnectorRow[]).map(normalizeConnector),
    website_control_map: websiteControlMap,
    messages: isMissingTable(messagesResult.error) ? [] : ((messagesResult.data ?? []) as MessageRow[]).map(normalizeMessage),
    content_items: isMissingTable(contentItemsResult.error) ? [] : ((contentItemsResult.data ?? []) as ContentItemRow[]).map(normalizeContentItem),
    content_routes: isMissingTable(contentRoutesResult.error) ? [] : ((contentRoutesResult.data ?? []) as ContentRouteRow[]).map(normalizeContentRoute),
    content_schedule: isMissingTable(contentScheduleResult.error) ? [] : ((contentScheduleResult.data ?? []) as ContentScheduleRow[]).map(normalizeContentSchedule),
    publish_logs: isMissingTable(publishLogsResult.error) ? [] : ((publishLogsResult.data ?? []) as PublishLogRow[]).map(normalizePublishLog),
    media_assets: isMissingTable(mediaAssetsResult.error) ? [] : ((mediaAssetsResult.data ?? []) as MediaAssetRow[]).map(normalizeMediaAsset),
    automation_rules: isMissingTable(automationRulesResult.error) ? [] : ((automationRulesResult.data ?? []) as AutomationRuleRow[]).map(normalizeAutomationRule),
  };
}

export async function createProjectInDb(input: { name: string; description: string }) {
  assertSupabaseReady();
  const supabase = getSupabaseClient();

  const projectResult = await supabase
    .from("projects")
    .insert({ name: input.name, description: input.description })
    .select("*")
    .single();

  throwIfError("Create project", projectResult.error);
  const project = normalizeProject(
    projectResult.data as Project & { updated_at?: string | null; description?: string | null; status?: Project["status"] | null; archived_at?: string | null },
  );
  const memoryResult = await supabase
    .from("project_memory")
    .insert({
      project_id: project.id,
      brand_tone: "Nature documentary",
      target_channels: ["Instagram", "TikTok"],
      posting_style: "Macro wildlife",
      hashtag_style: "Medium competition",
      notes: "",
    })
    .select("*")
    .single();

  throwUnlessMissingTable("Create project memory", memoryResult.error);

  const log =
    (await insertActionLog(supabase, {
      project_id: project.id,
      actor: "User",
      action: "project.created",
      details: `Created project ${project.name}.`,
      created_at: project.created_at,
    })) ??
    localLog({
      project_id: project.id,
      actor: "User",
      action: "project.created",
      details: `Created project ${project.name}.`,
      created_at: project.created_at,
    });

  return {
    project,
    memory: memoryResult.data ? normalizeProjectMemory(memoryResult.data as ProjectMemory) : defaultProjectMemory(project.id),
    log,
  };
}

export async function createTaskInDb(input: { projectId: string; title: string; goal: string }) {
  assertSupabaseReady();
  const supabase = getSupabaseClient();

  const taskResult = await supabase
    .from("tasks")
    .insert({
      project_id: input.projectId,
      title: input.title,
      goal: input.goal,
      status: "queued",
    })
    .select("*")
    .single();

  throwIfError("Create task", taskResult.error);
  const task = normalizeTask(taskResult.data as Task & { priority?: Task["priority"] | null; status?: Task["status"] | null; updated_at?: string | null });

  const stateResult = await supabase
    .from("task_states")
    .insert({
      task_id: task.id,
      goal: task.goal,
      current_stage: "Task captured, waiting for first AI pass",
      completed_steps: ["project selected", "goal saved"],
      next_step: "draft caption with AI-1",
      last_ai: "Unassigned",
      status: "queued",
      needs_review: false,
      metadata: {},
    })
    .select("*")
    .single();

  throwUnlessMissingTable("Create task state", stateResult.error);

  const log =
    (await insertActionLog(supabase, {
      project_id: task.project_id,
      task_id: task.id,
      actor: "User",
      action: "task.created",
      details: `Created task: ${task.title}.`,
      created_at: task.created_at,
    })) ??
    localLog({
      project_id: task.project_id,
      task_id: task.id,
      actor: "User",
      action: "task.created",
      details: `Created task: ${task.title}.`,
      created_at: task.created_at,
    });

  return {
    task,
    state: stateResult.data ? normalizeTaskState(stateResult.data as TaskState) : deriveTaskState(task),
    log,
  };
}

export async function deleteTaskHistoryInDb(task: Task) {
  assertSupabaseReady();
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();

  await deleteEq(supabase, "action_logs", "task_id", task.id, "Delete task action logs");
  await deleteEq(supabase, "ai_runs", "task_id", task.id, "Delete task AI runs");
  await deleteEq(supabase, "handoff_summaries", "task_id", task.id, "Delete task handoff history");

  const log =
    (await insertActionLog(supabase, {
      project_id: task.project_id,
      task_id: task.id,
      actor: "User",
      action: "task.history_cleared",
      details: `Cleared history for task: ${task.title}.`,
      created_at: now,
    })) ??
    localLog({
      project_id: task.project_id,
      task_id: task.id,
      actor: "User",
      action: "task.history_cleared",
      details: `Cleared history for task: ${task.title}.`,
      created_at: now,
    });

  return { taskId: task.id, log };
}

export async function deleteProjectTaskHistoryInDb(project: Project, tasks: Task[]) {
  assertSupabaseReady();
  const supabase = getSupabaseClient();
  const taskIds = tasks.filter((task) => task.project_id === project.id).map((task) => task.id);
  const now = new Date().toISOString();

  await deleteIn(supabase, "action_logs", "task_id", taskIds, "Delete project task action logs");
  await deleteIn(supabase, "ai_runs", "task_id", taskIds, "Delete project task AI runs");
  await deleteIn(supabase, "handoff_summaries", "task_id", taskIds, "Delete project task handoff history");

  const log =
    (await insertActionLog(supabase, {
      project_id: project.id,
      actor: "User",
      action: "task_history.cleared",
      details: `Cleared history for ${taskIds.length} task${taskIds.length === 1 ? "" : "s"} in ${project.name}.`,
      created_at: now,
    })) ??
    localLog({
      project_id: project.id,
      actor: "User",
      action: "task_history.cleared",
      details: `Cleared history for ${taskIds.length} task${taskIds.length === 1 ? "" : "s"} in ${project.name}.`,
      created_at: now,
    });

  return { taskIds, log };
}

export async function deleteTaskInDb(task: Task) {
  assertSupabaseReady();
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  const contentItemsResult = await supabase.from("content_items").select("id").eq("task_id", task.id);

  throwUnlessMissingTable("Load linked task content items", contentItemsResult.error);
  const contentItemIds = isMissingTable(contentItemsResult.error)
    ? []
    : ((contentItemsResult.data ?? []) as Array<{ id: string }>).map((item) => item.id);

  await deleteEq(supabase, "action_logs", "task_id", task.id, "Delete task action logs");

  const log =
    (await insertActionLog(supabase, {
      project_id: task.project_id,
      actor: "User",
      action: "task.deleted",
      details: `Deleted task: ${task.title}.`,
      created_at: now,
    })) ??
    localLog({
      project_id: task.project_id,
      actor: "User",
      action: "task.deleted",
      details: `Deleted task: ${task.title}.`,
      created_at: now,
    });

  await deleteEq(supabase, "approvals", "task_id", task.id, "Delete task approvals");
  await deleteEq(supabase, "ai_runs", "task_id", task.id, "Delete task AI runs");
  await deleteEq(supabase, "handoff_summaries", "task_id", task.id, "Delete task handoff summaries");
  await deleteEq(supabase, "task_states", "task_id", task.id, "Delete task state");
  await deleteEq(supabase, "content_posts", "task_id", task.id, "Delete task content posts");
  await deleteIn(supabase, "publish_logs", "content_item_id", contentItemIds, "Delete task publish logs");
  await deleteIn(supabase, "content_schedule", "content_item_id", contentItemIds, "Delete task content schedules");
  await deleteIn(supabase, "content_routes", "content_item_id", contentItemIds, "Delete task content routes");
  await deleteEq(supabase, "content_items", "task_id", task.id, "Delete task content items");

  const messageResult = await supabase
    .from("messages")
    .update({ linked_task_id: null })
    .eq("linked_task_id", task.id)
    .select("*");

  throwUnlessMissingTable("Unlink task inbox messages", messageResult.error);

  const deleteResult = await supabase.from("tasks").delete().eq("id", task.id).select("id");
  throwIfError("Delete task", deleteResult.error);

  if ((deleteResult.data ?? []).length === 0) {
    throw new Error("Task was not deleted. Run database/schema.sql in Supabase SQL editor to add task delete policies, then press Reload.");
  }

  return {
    taskId: task.id,
    projectId: task.project_id,
    contentItemIds,
    messages: isMissingTable(messageResult.error) ? [] : ((messageResult.data ?? []) as MessageRow[]).map(normalizeMessage),
    log,
  };
}

export async function createInboxMessageInDb(input: {
  projectId: string;
  source: MessageSource;
  sender_name: string;
  sender_handle: string;
  subject: string;
  body: string;
  priority: Priority;
  received_at?: string;
  metadata?: Record<string, unknown>;
}) {
  assertSupabaseReady();
  const supabase = getSupabaseClient();
  const receivedAt = input.received_at ?? new Date().toISOString();
  const sender = input.sender_handle.trim() || input.sender_name.trim() || "Unknown sender";

  const modernResult = await supabase
    .from("messages")
    .insert({
      project_id: input.projectId,
      source: input.source,
      sender_name: input.sender_name.trim() || sender,
      sender_handle: input.sender_handle.trim(),
      subject: input.subject.trim(),
      body: input.body.trim(),
      received_at: receivedAt,
      status: "unread",
      priority: input.priority,
      linked_task_id: null,
      metadata: input.metadata ?? {},
      direction: "inbound",
      sender,
      created_at: receivedAt,
    })
    .select("*")
    .single();

  let message: Message;

  if (!modernResult.error && modernResult.data) {
    message = normalizeMessage(modernResult.data as MessageRow);
  } else {
    if (isMissingTable(modernResult.error)) {
      throwIfError("Create inbox message", modernResult.error);
    }

    if (!isLegacyMessageShapeError(modernResult.error)) {
      throwIfError("Create inbox message", modernResult.error);
    }

    const fallbackResult = await supabase
      .from("messages")
      .insert({
        project_id: input.projectId,
        direction: "inbound",
        sender,
        subject: input.subject.trim(),
        body: input.body.trim(),
        status: "new",
        created_at: receivedAt,
      })
      .select("*")
      .single();

    throwIfError("Create legacy inbox message", fallbackResult.error);
    message = normalizeMessage(fallbackResult.data as MessageRow);
  }

  const log =
    (await insertActionLog(supabase, {
      project_id: input.projectId,
      actor: "User",
      action: "inbox.message.created",
      details: `Added ${message.source} message from ${messageActor(message)}.`,
      created_at: message.created_at,
    })) ??
    localLog({
      project_id: input.projectId,
      actor: "User",
      action: "inbox.message.created",
      details: `Added ${message.source} message from ${messageActor(message)}.`,
      created_at: message.created_at,
    });

  return { message, log };
}

function metadataText(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" ? value.trim() : "";
}

function normalizeWebhookMetadata(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return metadata as Record<string, unknown>;
}

async function findProjectById(supabase: SupabaseClientInstance, projectId: string) {
  if (!projectId) {
    return undefined;
  }

  const result = await supabase.from("projects").select("*").eq("id", projectId).limit(1);
  throwIfError("Resolve webhook project", result.error);
  const project = ((result.data ?? []) as Array<
    Project & { updated_at?: string | null; description?: string | null; status?: Project["status"] | null; archived_at?: string | null }
  >)[0];

  return project ? normalizeProject(project) : undefined;
}

async function findProjectByName(supabase: SupabaseClientInstance, projectName: string) {
  if (!projectName) {
    return undefined;
  }

  const result = await supabase.from("projects").select("*").eq("name", projectName).limit(1);
  throwIfError("Resolve webhook project by name", result.error);
  const project = ((result.data ?? []) as Array<
    Project & { updated_at?: string | null; description?: string | null; status?: Project["status"] | null; archived_at?: string | null }
  >)[0];

  return project ? normalizeProject(project) : undefined;
}

async function findLatestActiveProject(supabase: SupabaseClientInstance) {
  const result = await supabase.from("projects").select("*").eq("status", "active").order("created_at", { ascending: false }).limit(1);
  throwIfError("Resolve active webhook project", result.error);
  const project = ((result.data ?? []) as Array<
    Project & { updated_at?: string | null; description?: string | null; status?: Project["status"] | null; archived_at?: string | null }
  >)[0];

  return project ? normalizeProject(project) : undefined;
}

async function resolveWebsiteWebhookProject(input: {
  supabase: SupabaseClientInstance;
  metadata: Record<string, unknown>;
  defaultProjectId?: string;
}) {
  const metadataProjectId = metadataText(input.metadata, "project_id");
  const explicitProject = await findProjectById(input.supabase, metadataProjectId || input.defaultProjectId || "");

  if (explicitProject) {
    return explicitProject;
  }

  const requestedProjectName = metadataText(input.metadata, "project_name") || metadataText(input.metadata, "project");
  const namedProject = await findProjectByName(input.supabase, requestedProjectName);

  if (namedProject) {
    return namedProject;
  }

  if (requestedProjectName) {
    const created = await createProjectInDb({
      name: requestedProjectName,
      description: "Website connector inbox workspace.",
    });

    return created.project;
  }

  const activeProject = await findLatestActiveProject(input.supabase);

  if (activeProject) {
    return activeProject;
  }

  const created = await createProjectInDb({
    name: "Wildsaura",
    description: "Website connector inbox workspace.",
  });

  return created.project;
}

function webhookPriority(metadata: Record<string, unknown>): Priority {
  return normalizePriority(metadata.priority);
}

type WebsiteMessageTriage = {
  summary: string;
  suggested_priority: Priority;
  reply_draft: string;
  reasons: string[];
  model: string;
  needs_review: true;
};

function compactText(value: string, maxLength: number) {
  const clean = value.replace(/\s+/g, " ").trim();

  if (clean.length <= maxLength) {
    return clean;
  }

  return `${clean.slice(0, maxLength - 1).trim()}...`;
}

function includesAny(value: string, terms: string[]) {
  const lowerValue = value.toLowerCase();
  return terms.some((term) => lowerValue.includes(term));
}

function buildWebsiteMessageTriage(input: {
  eventType: string;
  senderName: string;
  senderHandle: string;
  subject: string;
  body: string;
  metadata: Record<string, unknown>;
}): WebsiteMessageTriage {
  const combinedText = `${input.subject}\n${input.body}`;
  const metadataPriority = webhookPriority(input.metadata);
  const urgentTerms = ["urgent", "asap", "immediately", "emergency", "complaint", "angry", "refund", "payment", "broken", "not working", "issue"];
  const planningTerms = ["quote", "booking", "collab", "collaboration", "sponsor", "business", "order", "price", "pricing", "question", "help"];
  const lowTerms = ["thanks", "thank you", "newsletter", "subscribe", "hello", "nice work"];
  let suggestedPriority: Priority = metadataPriority;
  const reasons: string[] = [];

  if (includesAny(combinedText, urgentTerms)) {
    suggestedPriority = "high";
    reasons.push("Urgent or risk-sensitive language detected.");
  } else if (metadataPriority === "high") {
    suggestedPriority = "high";
    reasons.push("Webhook metadata marked the message as high priority.");
  } else if (includesAny(combinedText, planningTerms)) {
    suggestedPriority = "medium";
    reasons.push("Message appears to need a business or support response.");
  } else if (metadataPriority === "low" || includesAny(combinedText, lowTerms)) {
    suggestedPriority = "low";
    reasons.push("Message appears informational or low urgency.");
  } else {
    suggestedPriority = "medium";
    reasons.push("Default review priority for website inbox intake.");
  }

  const senderLabel = input.senderHandle ? `${input.senderName} (${input.senderHandle})` : input.senderName;
  const summary = compactText(
    `${senderLabel} sent a ${input.eventType} website message${input.subject ? ` about "${input.subject}"` : ""}. ${input.body}`,
    240,
  );
  const replyDraft = [
    `Hi ${input.senderName || "there"},`,
    "",
    "Thanks for reaching out through the website. I saw your message and I am reviewing the details now.",
    input.subject ? `Regarding "${input.subject}", I will follow up with the right next step shortly.` : "I will follow up with the right next step shortly.",
    "",
    "Best,",
    "Wildsaura Team",
  ].join("\n");

  return {
    summary,
    suggested_priority: suggestedPriority,
    reply_draft: replyDraft,
    reasons,
    model: "mock-website-triage-v1",
    needs_review: true,
  };
}

async function createWebsiteReviewTask(input: {
  supabase: SupabaseClientInstance;
  project: Project;
  eventType: string;
  message: Message;
  triage: WebsiteMessageTriage;
  createdAt: string;
}) {
  const titleSource = input.message.subject.trim() || `Message from ${messageActor(input.message)}`;
  const title = compactText(`Review website message: ${titleSource}`, 90);
  const goal = [
    "Review this auto-triaged website connector message before replying.",
    `Sender: ${input.message.sender_name}${input.message.sender_handle ? ` (${input.message.sender_handle})` : ""}`,
    input.message.subject ? `Subject: ${input.message.subject}` : "",
    `AI summary: ${input.triage.summary}`,
    `Suggested priority: ${input.triage.suggested_priority}`,
    "Suggested reply draft:",
    input.triage.reply_draft,
    "Original message:",
    input.message.body,
  ]
    .filter(Boolean)
    .join("\n");
  const taskResult = await input.supabase
    .from("tasks")
    .insert({
      project_id: input.project.id,
      title,
      goal,
      priority: input.triage.suggested_priority,
      status: "needs_review",
      created_at: input.createdAt,
      updated_at: input.createdAt,
    })
    .select("*")
    .single();

  throwIfError("Create website triage review task", taskResult.error);
  const task = normalizeTask(
    taskResult.data as Task & { priority?: Task["priority"] | null; status?: Task["status"] | null; updated_at?: string | null },
  );
  const stateResult = await input.supabase
    .from("task_states")
    .insert({
      task_id: task.id,
      goal: task.goal,
      current_stage: "AI triage completed, reply draft needs human review",
      completed_steps: ["website message saved", "AI summary generated", "priority suggested", "reply draft prepared"],
      next_step: "Review the suggested reply and decide whether to send, edit, or create follow-up work.",
      last_ai: "Website Triage AI",
      status: "needs_review",
      needs_review: true,
      metadata: {
        source: "website_connector",
        source_message_id: input.message.id,
        connector_event_type: input.eventType,
        ai_summary: input.triage.summary,
        ai_suggested_priority: input.triage.suggested_priority,
        ai_draft_reply: input.triage.reply_draft,
        ai_triage_reasons: input.triage.reasons,
      },
      updated_at: input.createdAt,
    })
    .select("*")
    .single();

  throwUnlessMissingTable("Create website triage task state", stateResult.error);

  return {
    task,
    state: stateResult.data ? normalizeTaskState(stateResult.data as TaskState & { metadata?: Record<string, unknown> | null }) : deriveTaskState(task),
  };
}

async function createApprovalReviewTask(input: {
  supabase: SupabaseClientInstance;
  projectId: string;
  title: string;
  goal: string;
  priority?: Priority;
  currentStage: string;
  completedSteps: string[];
  nextStep: string;
  lastAi: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}) {
  const taskResult = await input.supabase
    .from("tasks")
    .insert({
      project_id: input.projectId,
      title: input.title,
      goal: input.goal,
      priority: input.priority ?? "medium",
      status: "needs_review",
      created_at: input.createdAt,
      updated_at: input.createdAt,
    })
    .select("*")
    .single();

  throwIfError("Create approval review task", taskResult.error);
  const task = normalizeTask(
    taskResult.data as Task & { priority?: Task["priority"] | null; status?: Task["status"] | null; updated_at?: string | null },
  );
  const stateResult = await input.supabase
    .from("task_states")
    .insert({
      task_id: task.id,
      goal: task.goal,
      current_stage: input.currentStage,
      completed_steps: input.completedSteps,
      next_step: input.nextStep,
      last_ai: input.lastAi,
      status: "needs_review",
      needs_review: true,
      metadata: input.metadata,
      updated_at: input.createdAt,
    })
    .select("*")
    .single();

  throwUnlessMissingTable("Create approval task state", stateResult.error);

  return {
    task,
    state: stateResult.data ? normalizeTaskState(stateResult.data as TaskState & { metadata?: Record<string, unknown> | null }) : deriveTaskState(task),
  };
}

export async function createWebsiteConnectorMessageInDb(input: {
  source?: string;
  type?: string;
  sender_name?: string;
  sender_handle?: string;
  subject?: string;
  body: string;
  metadata?: unknown;
  defaultProjectId?: string;
}) {
  assertSupabaseReady();
  const supabase = getSupabaseClient();
  const receivedAt = new Date().toISOString();
  const metadata = normalizeWebhookMetadata(input.metadata);
  const project = await resolveWebsiteWebhookProject({
    supabase,
    metadata,
    defaultProjectId: input.defaultProjectId,
  });
  const eventType = input.type?.trim() || metadataText(metadata, "type") || "website_message";
  const originalSource = input.source?.trim() || metadataText(metadata, "source") || "website";
  const senderName = input.sender_name?.trim() || metadataText(metadata, "sender_name") || "Website visitor";
  const senderHandle = input.sender_handle?.trim() || metadataText(metadata, "sender_handle") || "";
  const subject = input.subject?.trim() || metadataText(metadata, "subject") || "Website message";
  const notification = {
    title: "New website message received",
    detail: subject,
    source: "website",
    created_at: receivedAt,
  };
  const enrichedMetadata = {
    ...metadata,
    connector: "website",
    connector_event_type: eventType,
    original_source: originalSource,
    notification,
  };
  const result = await createInboxMessageInDb({
    projectId: project.id,
    source: "website",
    sender_name: senderName,
    sender_handle: senderHandle,
    subject,
    body: input.body,
    priority: webhookPriority(metadata),
    received_at: receivedAt,
    metadata: enrichedMetadata,
  });
  const triage = buildWebsiteMessageTriage({
    eventType,
    senderName,
    senderHandle,
    subject,
    body: input.body,
    metadata,
  });
  const reviewTask = await createWebsiteReviewTask({
    supabase,
    project,
    eventType,
    message: result.message,
    triage,
    createdAt: receivedAt,
  });
  const triagedMetadata = {
    ...result.message.metadata,
    ai_summary: triage.summary,
    ai_suggested_priority: triage.suggested_priority,
    ai_draft_reply: triage.reply_draft,
    ai_draft_status: "needs_review",
    ai_triage_reasons: triage.reasons,
    ai_triage_model: triage.model,
    ai_triage_created_at: receivedAt,
    linked_task_created_at: receivedAt,
    linked_task_title: reviewTask.task.title,
    linked_task_status: reviewTask.task.status,
    reply_approval_status: "pending",
    reply_approval_requested_at: receivedAt,
  };
  const triagedMessage = await updateMessageWithFallback(
    supabase,
    result.message,
    {
      linked_task_id: reviewTask.task.id,
      priority: triage.suggested_priority,
      metadata: triagedMetadata,
    },
    {
      status: "new",
    },
    "Apply website connector triage",
  );
  const connectorLog =
    (await insertActionLog(supabase, {
      project_id: project.id,
      actor: "Website Connector",
      action: "connector.website.webhook_received",
      details: `Received ${eventType} from ${senderHandle || senderName}.`,
      created_at: receivedAt,
    })) ??
    localLog({
      project_id: project.id,
      actor: "Website Connector",
      action: "connector.website.webhook_received",
      details: `Received ${eventType} from ${senderHandle || senderName}.`,
      created_at: receivedAt,
    });
  const triageLog =
    (await insertActionLog(supabase, {
      project_id: project.id,
      task_id: reviewTask.task.id,
      actor: "Website Triage AI",
      action: "connector.website.auto_triaged",
      details: `Summarized website message, suggested ${triage.suggested_priority} priority, drafted reply, and created review task.`,
      created_at: receivedAt,
    })) ??
    localLog({
      project_id: project.id,
      task_id: reviewTask.task.id,
      actor: "Website Triage AI",
      action: "connector.website.auto_triaged",
      details: `Summarized website message, suggested ${triage.suggested_priority} priority, drafted reply, and created review task.`,
      created_at: receivedAt,
    });
  const approvalPayload = {
    task_id: reviewTask.task.id,
    title: "Approve website reply draft",
    requested_action: `${REPLY_APPROVAL_PREFIX}${triagedMessage.id}`,
    reason: `Review the AI suggested reply for ${messageActor(triagedMessage)} before sending or publishing it.`,
    status: "pending" as const,
    action_type: approvalActionTypeForMessage(triagedMessage),
    connector: approvalConnectorForMessage(triagedMessage),
    target_id: triagedMessage.id,
    target_type: approvalTargetTypeForMessage(triagedMessage),
    draft_text: triage.reply_draft,
    metadata: {
      source: "website_connector",
      connector_event_type: eventType,
      original_source: originalSource,
      message_id: triagedMessage.id,
      sender: messageActor(triagedMessage),
    },
    execution_status: "pending_review" as const,
    created_at: receivedAt,
  };
  const approval = (await insertApproval(supabase, approvalPayload)) ?? localApproval(approvalPayload);
  const approvalLog =
    (await insertActionLog(supabase, {
      project_id: project.id,
      task_id: reviewTask.task.id,
      actor: "Rules Engine",
      action: "approval.requested",
      details: `Queued reply approval for ${messageActor(triagedMessage)}.`,
      created_at: receivedAt,
    })) ??
    localLog({
      project_id: project.id,
      task_id: reviewTask.task.id,
      actor: "Rules Engine",
      action: "approval.requested",
      details: `Queued reply approval for ${messageActor(triagedMessage)}.`,
      created_at: receivedAt,
    });

  return {
    project,
    message: triagedMessage,
    notification,
    triage,
    task: reviewTask.task,
    taskState: reviewTask.state,
    approval,
    inboxLog: result.log,
    connectorLog,
    triageLog,
    approvalLog,
  };
}

export async function updateInboxMessageStatusInDb(message: Message, status: MessageStatus) {
  assertSupabaseReady();
  const supabase = getSupabaseClient();

  const updatedMessage = await updateMessageWithFallback(
    supabase,
    message,
    { status },
    { status: legacyStatusFromMessageStatus(status) },
    "Update inbox message status",
  );

  const log =
    (await insertActionLog(supabase, {
      project_id: message.project_id,
      task_id: message.linked_task_id,
      actor: "User",
      action: "inbox.message.status_updated",
      details: `Marked message from ${messageActor(message)} as ${status}.`,
    })) ??
    localLog({
      project_id: message.project_id,
      task_id: message.linked_task_id,
      actor: "User",
      action: "inbox.message.status_updated",
      details: `Marked message from ${messageActor(message)} as ${status}.`,
    });

  return { message: updatedMessage, log };
}

export async function createTaskFromMessageInDb(message: Message) {
  const titleSource = message.subject.trim() || `Message from ${messageActor(message)}`;
  const result = await createTaskInDb({
    projectId: message.project_id,
    title: `Reply: ${titleSource}`.slice(0, 90),
    goal: [
      `Create a response plan for this ${message.source} message.`,
      `Sender: ${message.sender_name}${message.sender_handle ? ` (${message.sender_handle})` : ""}`,
      message.subject ? `Subject: ${message.subject}` : "",
      `Message: ${message.body}`,
    ]
      .filter(Boolean)
      .join("\n"),
  });

  const supabase = getSupabaseClient();
  const metadata = {
    ...message.metadata,
    linked_task_created_at: new Date().toISOString(),
    linked_task_title: result.task.title,
  };
  const updatedMessage = await updateMessageWithFallback(
    supabase,
    message,
    { linked_task_id: result.task.id, status: "read", metadata },
    { status: "summarized" },
    "Link inbox message to task",
  );

  const log =
    (await insertActionLog(supabase, {
      project_id: message.project_id,
      task_id: result.task.id,
      actor: "User",
      action: "inbox.message.task_created",
      details: `Created task from ${message.source} message: ${result.task.title}.`,
    })) ??
    localLog({
      project_id: message.project_id,
      task_id: result.task.id,
      actor: "User",
      action: "inbox.message.task_created",
      details: `Created task from ${message.source} message: ${result.task.title}.`,
    });

  return {
    task: result.task,
    state: result.state,
    message: updatedMessage,
    logs: [log, result.log],
  };
}

export async function draftReplyForMessageInDb(message: Message) {
  assertSupabaseReady();
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  const draftReply = `Hi ${message.sender_name || "there"}, thanks for reaching out. I reviewed your message and will follow up with a clear answer shortly.`;
  const metadata = {
    ...message.metadata,
    ai_draft_reply: draftReply,
    ai_draft_created_at: now,
    ai_draft_status: "placeholder",
  };

  const updatedMessage = await updateMessageWithFallback(
    supabase,
    message,
    { status: "drafted", metadata },
    { status: "drafted" },
    "Draft inbox reply",
  );

  const log =
    (await insertActionLog(supabase, {
      project_id: message.project_id,
      task_id: message.linked_task_id,
      actor: "Mock AI",
      action: "inbox.reply.drafted",
      details: `Created placeholder draft reply for ${messageActor(message)}.`,
      created_at: now,
    })) ??
    localLog({
      project_id: message.project_id,
      task_id: message.linked_task_id,
      actor: "Mock AI",
      action: "inbox.reply.drafted",
      details: `Created placeholder draft reply for ${messageActor(message)}.`,
      created_at: now,
    });

  return { message: updatedMessage, log };
}

export async function requestReplyApprovalForMessageInDb(message: Message) {
  assertSupabaseReady();
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  const draftReply =
    metadataText(message.metadata, "ai_draft_reply") ||
    `Hi ${message.sender_name || "there"}, thanks for reaching out. I reviewed your message and will follow up with a clear answer shortly.`;
  let task: Task | undefined;
  let state: TaskState | undefined;

  if (message.linked_task_id) {
    const [taskResult, stateResult] = await Promise.all([
      supabase.from("tasks").select("*").eq("id", message.linked_task_id).single(),
      supabase.from("task_states").select("*").eq("task_id", message.linked_task_id).single(),
    ]);

    if (!taskResult.error && taskResult.data) {
      task = normalizeTask(taskResult.data as Task & { priority?: Task["priority"] | null; status?: Task["status"] | null; updated_at?: string | null });
    }

    if (!stateResult.error && stateResult.data) {
      state = normalizeTaskState(stateResult.data as TaskState & { metadata?: Record<string, unknown> | null });
    }
  }

  if (!task || !state) {
    const titleSource = message.subject.trim() || `Message from ${messageActor(message)}`;
    const reviewTask = await createApprovalReviewTask({
      supabase,
      projectId: message.project_id,
      title: compactText(`Approve reply: ${titleSource}`, 90),
      goal: [
        `Approve the AI reply draft for this ${message.source} message before sending or publishing it.`,
        `Sender: ${message.sender_name}${message.sender_handle ? ` (${message.sender_handle})` : ""}`,
        message.subject ? `Subject: ${message.subject}` : "",
        "Suggested reply draft:",
        draftReply,
        "Original message:",
        message.body,
      ]
        .filter(Boolean)
        .join("\n"),
      priority: message.priority,
      currentStage: "Reply draft prepared, waiting for approval",
      completedSteps: ["message saved", "reply draft prepared"],
      nextStep: "Approve reply draft before any external response is sent.",
      lastAi: "Mock AI",
      metadata: {
        source: "inbox_reply_approval",
        source_message_id: message.id,
        ai_draft_reply: draftReply,
      },
      createdAt: now,
    });

    task = reviewTask.task;
    state = reviewTask.state;
  }

  const metadata = {
    ...message.metadata,
    ai_draft_reply: draftReply,
    ai_draft_status: "needs_review",
    reply_approval_status: "pending",
    reply_approval_requested_at: now,
    reply_approval_task_id: task.id,
    linked_task_title: task.title,
  };
  const updatedMessage = await updateMessageWithFallback(
    supabase,
    message,
    { linked_task_id: task.id, status: "drafted", metadata },
    { status: "drafted" },
    "Request reply approval",
  );
  const approvalPayload = {
    task_id: task.id,
    title: "Approve reply draft",
    requested_action: `${REPLY_APPROVAL_PREFIX}${updatedMessage.id}`,
    reason: `Review the AI suggested reply for ${messageActor(updatedMessage)} before sending or publishing it.`,
    status: "pending" as const,
    action_type: approvalActionTypeForMessage(updatedMessage),
    connector: approvalConnectorForMessage(updatedMessage),
    target_id: updatedMessage.id,
    target_type: approvalTargetTypeForMessage(updatedMessage),
    draft_text: draftReply,
    metadata: {
      source: "inbox_reply_approval",
      message_id: updatedMessage.id,
      message_source: updatedMessage.source,
      sender: messageActor(updatedMessage),
    },
    execution_status: "pending_review" as const,
    created_at: now,
  };
  const approval = (await insertApproval(supabase, approvalPayload)) ?? localApproval(approvalPayload);
  const log =
    (await insertActionLog(supabase, {
      project_id: message.project_id,
      task_id: task.id,
      actor: "Rules Engine",
      action: "approval.requested",
      details: `Queued reply approval for ${messageActor(updatedMessage)}.`,
      created_at: now,
    })) ??
    localLog({
      project_id: message.project_id,
      task_id: task.id,
      actor: "Rules Engine",
      action: "approval.requested",
      details: `Queued reply approval for ${messageActor(updatedMessage)}.`,
      created_at: now,
    });

  return { message: updatedMessage, task, state, approval, log };
}

export async function createContentItemInDb(input: {
  projectId: string;
  title: string;
  content_type: ContentType;
  caption_body: string;
  media_placeholder: string;
  target_platforms: ContentPlatform[];
  target_route: string;
  scheduled_for?: string;
  status: ContentStatus;
  rules: Rule[];
}) {
  assertSupabaseReady();
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  const requestedStatus = input.status;
  const publishDecision = requestedStatus === "published" ? evaluateAction("publish_content", input.rules) : null;
  const draftDecision = requestedStatus === "published" ? null : evaluateAction("draft_content", input.rules);
  const status: ContentStatus = publishDecision
    ? publishDecision.allowed
      ? publishDecision.requiresApproval
        ? "approval_required"
        : "published"
      : "failed"
    : draftDecision?.allowed
      ? requestedStatus
      : "failed";
  const routePlatforms = input.target_platforms.length > 0 ? input.target_platforms : (["website"] as ContentPlatform[]);

  const itemResult = await supabase
    .from("content_items")
    .insert({
      project_id: input.projectId,
      title: input.title.trim(),
      content_type: input.content_type,
      caption_body: input.caption_body.trim(),
      media_placeholder: input.media_placeholder.trim(),
      status,
      metadata: {
        rule_decision: publishDecision?.reason ?? draftDecision?.reason ?? "Draft captured.",
        target_platforms: routePlatforms,
      },
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (isMissingTable(itemResult.error)) {
    throw new Error("Content calendar tables are missing. Run database/schema.sql in Supabase SQL editor, then press Reload.");
  }

  throwIfError("Create content item", itemResult.error);
  const item = normalizeContentItem(itemResult.data as ContentItemRow);

  const routeRows = routePlatforms.map((platform) => {
    const route = defaultRouteForPlatform(platform, input.content_type, input.target_route);

    return {
      content_item_id: item.id,
      platform,
      target_route: route,
      route_label: `${labelForContentPlatform(platform)} - ${route}`,
      status: item.status,
      metadata: {},
      created_at: now,
    };
  });
  const routesResult = await supabase.from("content_routes").insert(routeRows).select("*");
  throwIfError("Create content routes", routesResult.error);
  const routes = ((routesResult.data ?? []) as ContentRouteRow[]).map(normalizeContentRoute);

  let schedule: ContentSchedule | undefined;

  if (input.scheduled_for || item.status === "scheduled") {
    const scheduleResult = await supabase
      .from("content_schedule")
      .insert({
        content_item_id: item.id,
        scheduled_for: input.scheduled_for ?? null,
        timezone: "local",
        status: item.status,
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();

    throwIfError("Create content schedule", scheduleResult.error);
    schedule = normalizeContentSchedule(scheduleResult.data as ContentScheduleRow);
  }

  const log =
    (await insertActionLog(supabase, {
      project_id: input.projectId,
      actor: "User",
      action: "content.created",
      details: `Created ${item.content_type} content item: ${item.title}.`,
      created_at: item.created_at,
    })) ??
    localLog({
      project_id: input.projectId,
      actor: "User",
      action: "content.created",
      details: `Created ${item.content_type} content item: ${item.title}.`,
      created_at: item.created_at,
    });

  const approvalResult = publishDecision?.allowed && publishDecision.requiresApproval
    ? await requestContentPublishApproval({
        supabase,
        item,
        routes,
        reason: publishDecision.reason,
        requestedAt: now,
      })
    : undefined;

  return {
    item: approvalResult?.item ?? item,
    routes,
    schedule,
    log,
    task: approvalResult?.task,
    state: approvalResult?.state,
    approval: approvalResult?.approval,
    approvalLog: approvalResult?.log,
  };
}

export async function runContentAiActionInDb(input: {
  item: ContentItem;
  action: ContentAiAction;
  memory?: ProjectMemory;
  rules: Rule[];
}) {
  assertSupabaseReady();
  const supabase = getSupabaseClient();
  const decision = evaluateAction("draft_content", input.rules);
  const now = new Date().toISOString();

  if (!decision.allowed) {
    const failedItem = { ...input.item, status: "failed" as const, updated_at: now };
    const failedResult = await supabase
      .from("content_items")
      .update({ status: failedItem.status, updated_at: now })
      .eq("id", input.item.id)
      .select("*")
      .single();

    throwIfError("Mark blocked content AI action", failedResult.error);

    const log =
      (await insertActionLog(supabase, {
        project_id: input.item.project_id,
        actor: "Rules Engine",
        action: `content.ai.${input.action}`,
        details: decision.reason,
        created_at: now,
      })) ??
      localLog({
        project_id: input.item.project_id,
        actor: "Rules Engine",
        action: `content.ai.${input.action}`,
        details: decision.reason,
        created_at: now,
      });

    return { item: normalizeContentItem(failedResult.data as ContentItemRow), log };
  }

  const brandTone = input.memory?.brand_tone || "clear brand voice";
  const targetChannels = input.memory?.target_channels.join(", ") || "social channels";
  const metadata = { ...input.item.metadata };
  let title = input.item.title;
  let captionBody = input.item.caption_body;
  let details = "";

  if (input.action === "generate_caption") {
    captionBody = `${captionBody ? `${captionBody}\n\n` : ""}${input.item.title}: a ${brandTone.toLowerCase()} caption shaped for ${targetChannels}.`;
    metadata.ai_caption_generated_at = now;
    details = `Generated caption for ${input.item.title}.`;
  }

  if (input.action === "generate_hashtags") {
    const hashtags = ["#Wildlife", "#MacroPhotography", "#NatureStory", "#CreatorWorkflow", "#AIContent"];
    captionBody = `${captionBody ? `${captionBody}\n\n` : ""}${hashtags.join(" ")}`;
    metadata.ai_hashtags = hashtags;
    metadata.ai_hashtags_generated_at = now;
    details = `Generated hashtags for ${input.item.title}.`;
  }

  if (input.action === "generate_website_title") {
    title = `${input.item.title.replace(/\s+\|\s+Website$/i, "")} | Website`;
    metadata.ai_website_title_generated_at = now;
    details = `Generated website title for ${input.item.title}.`;
  }

  if (input.action === "generate_story_text") {
    const storyText = `${input.item.title}. One clear moment, one strong detail, one reason to look closer.`;
    captionBody = `${captionBody ? `${captionBody}\n\n` : ""}${storyText}`;
    metadata.ai_story_text = storyText;
    metadata.ai_story_text_generated_at = now;
    details = `Generated short story text for ${input.item.title}.`;
  }

  metadata.last_ai_action = input.action;
  metadata.last_ai_action_rule = decision.reason;

  const itemResult = await supabase
    .from("content_items")
    .update({
      title,
      caption_body: captionBody,
      status: input.item.status === "published" ? "draft" : input.item.status,
      metadata,
      updated_at: now,
    })
    .eq("id", input.item.id)
    .select("*")
    .single();

  throwIfError("Run content AI action", itemResult.error);
  const item = normalizeContentItem(itemResult.data as ContentItemRow);
  const log =
    (await insertActionLog(supabase, {
      project_id: item.project_id,
      actor: "Mock AI",
      action: `content.ai.${input.action}`,
      details,
      created_at: now,
    })) ??
    localLog({
      project_id: item.project_id,
      actor: "Mock AI",
      action: `content.ai.${input.action}`,
      details,
      created_at: now,
    });

  return { item, log };
}

async function requestContentPublishApproval(input: {
  supabase: SupabaseClientInstance;
  item: ContentItem;
  routes: ContentRoute[];
  reason: string;
  requestedAt: string;
}) {
  let task: Task | undefined;
  let state: TaskState | undefined;

  if (input.item.task_id) {
    const [taskResult, stateResult] = await Promise.all([
      input.supabase.from("tasks").select("*").eq("id", input.item.task_id).single(),
      input.supabase.from("task_states").select("*").eq("task_id", input.item.task_id).single(),
    ]);

    if (!taskResult.error && taskResult.data) {
      task = normalizeTask(taskResult.data as Task & { priority?: Task["priority"] | null; status?: Task["status"] | null; updated_at?: string | null });
    }

    if (!stateResult.error && stateResult.data) {
      state = normalizeTaskState(stateResult.data as TaskState & { metadata?: Record<string, unknown> | null });
    }
  }

  if (!task || !state) {
    const routeSummary = input.routes.map((route) => route.route_label || route.target_route).join(", ") || "No routes selected";
    const reviewTask = await createApprovalReviewTask({
      supabase: input.supabase,
      projectId: input.item.project_id,
      title: compactText(`Approve publish: ${input.item.title}`, 90),
      goal: [
        `Approve publishing this ${input.item.content_type} content item before any external publish action.`,
        `Title: ${input.item.title}`,
        `Routes: ${routeSummary}`,
        "Caption/body:",
        input.item.caption_body,
      ]
        .filter(Boolean)
        .join("\n"),
      priority: "medium",
      currentStage: "Publish requested, waiting for approval",
      completedSteps: ["content drafted", "publish requested", "rules engine required review"],
      nextStep: "Approve publish before external website/social APIs are connected.",
      lastAi: "Rules Engine",
      metadata: {
        source: "content_publish_approval",
        content_item_id: input.item.id,
        routes: input.routes.map((route) => route.id),
      },
      createdAt: input.requestedAt,
    });

    task = reviewTask.task;
    state = reviewTask.state;
  }

  const metadata = {
    ...input.item.metadata,
    publish_approval_status: "pending",
    publish_approval_requested_at: input.requestedAt,
    publish_approval_task_id: task.id,
    rule_decision: input.reason,
  };
  const itemResult = await input.supabase
    .from("content_items")
    .update({
      task_id: task.id,
      status: "approval_required",
      metadata,
      updated_at: input.requestedAt,
    })
    .eq("id", input.item.id)
    .select("*")
    .single();

  throwIfError("Request content publish approval", itemResult.error);
  const item = normalizeContentItem(itemResult.data as ContentItemRow);
  const approvalPayload = {
    task_id: task.id,
    title: "Approve content publish",
    requested_action: `${PUBLISH_APPROVAL_PREFIX}${item.id}`,
    reason: `Review publishing ${item.title}. ${input.reason}`,
    status: "pending" as const,
    action_type: "publish_content" as const,
    connector: connectorForContentRoutes(input.routes),
    target_id: item.id,
    target_type: "content_item",
    draft_text: item.caption_body,
    metadata: {
      source: "content_calendar",
      content_item_id: item.id,
      content_type: item.content_type,
      target_platforms: input.routes.map((route) => route.platform),
      route_ids: input.routes.map((route) => route.id),
      route_labels: input.routes.map((route) => route.route_label || route.target_route),
    },
    execution_status: "pending_review" as const,
    created_at: input.requestedAt,
  };
  const approval = (await insertApproval(input.supabase, approvalPayload)) ?? localApproval(approvalPayload);
  const log =
    (await insertActionLog(input.supabase, {
      project_id: item.project_id,
      task_id: task.id,
      actor: "Rules Engine",
      action: "approval.requested",
      details: `Queued publish approval for ${item.title}.`,
      created_at: input.requestedAt,
    })) ??
    localLog({
      project_id: item.project_id,
      task_id: task.id,
      actor: "Rules Engine",
      action: "approval.requested",
      details: `Queued publish approval for ${item.title}.`,
      created_at: input.requestedAt,
    });

  return { item, task, state, approval, log };
}

export async function mockPublishContentInDb(input: {
  item: ContentItem;
  routes: ContentRoute[];
  rules: Rule[];
}) {
  assertSupabaseReady();
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  const decision = evaluateAction("publish_content", input.rules);
  const status: ContentStatus = decision.allowed ? (decision.requiresApproval ? "approval_required" : "published") : "failed";
  const logStatus: PublishLog["status"] = decision.allowed ? status : "blocked";
  const routes = input.routes.length > 0 ? input.routes : [];
  const details = decision.requiresApproval
    ? `Mock publish paused for review. ${decision.reason}`
    : decision.allowed
      ? "Mock publish completed without external API calls."
      : decision.reason;

  const itemResult = await supabase
    .from("content_items")
    .update({ status, updated_at: now })
    .eq("id", input.item.id)
    .select("*")
    .single();

  throwIfError("Update content publish status", itemResult.error);

  let updatedRoutes = routes;

  if (routes.length > 0) {
    const routeUpdateResult = await supabase
      .from("content_routes")
      .update({ status })
      .in("id", routes.map((route) => route.id))
      .select("*");

    throwIfError("Update content route status", routeUpdateResult.error);
    updatedRoutes = ((routeUpdateResult.data ?? []) as ContentRouteRow[]).map(normalizeContentRoute);
  }

  const publishRows = (routes.length > 0 ? routes : [{ id: null }]).map((route) => ({
    project_id: input.item.project_id,
    content_item_id: input.item.id,
    route_id: route.id,
    action: "mock_publish",
    status: logStatus,
    details,
    created_at: now,
  }));
  const publishResult = await supabase.from("publish_logs").insert(publishRows).select("*");
  throwIfError("Create publish logs", publishResult.error);

  const scheduleResult = await supabase
    .from("content_schedule")
    .update({ status, updated_at: now })
    .eq("content_item_id", input.item.id);

  throwUnlessMissingTable("Update content schedule status", scheduleResult.error);

  const actionLog =
    (await insertActionLog(supabase, {
      project_id: input.item.project_id,
      actor: "Rules Engine",
      action: "content.mock_publish",
      details,
      created_at: now,
    })) ??
    localLog({
      project_id: input.item.project_id,
      actor: "Rules Engine",
      action: "content.mock_publish",
      details,
      created_at: now,
    });
  const updatedItem = normalizeContentItem(itemResult.data as ContentItemRow);
  const approvalResult = decision.allowed && decision.requiresApproval
    ? await requestContentPublishApproval({
        supabase,
        item: updatedItem,
        routes: updatedRoutes,
        reason: decision.reason,
        requestedAt: now,
      })
    : undefined;

  return {
    item: approvalResult?.item ?? updatedItem,
    routes: updatedRoutes,
    publishLogs: ((publishResult.data ?? []) as PublishLogRow[]).map(normalizePublishLog),
    log: actionLog,
    task: approvalResult?.task,
    state: approvalResult?.state,
    approval: approvalResult?.approval,
    approvalLog: approvalResult?.log,
  };
}

export async function attemptDeleteContentInDb(input: { item: ContentItem; rules: Rule[] }) {
  assertSupabaseReady();
  const supabase = getSupabaseClient();
  const decision = evaluateAction("delete_resource", input.rules);
  const now = new Date().toISOString();
  const details = decision.allowed
    ? "Delete is not implemented in Phase 6B mock mode."
    : decision.reason;

  const log =
    (await insertActionLog(supabase, {
      project_id: input.item.project_id,
      actor: "Rules Engine",
      action: "content.delete_attempted",
      details: `${input.item.title}: ${details}`,
      created_at: now,
    })) ??
    localLog({
      project_id: input.item.project_id,
      actor: "Rules Engine",
      action: "content.delete_attempted",
      details: `${input.item.title}: ${details}`,
      created_at: now,
    });

  return { log };
}

export async function createMediaAssetInDb(input: {
  projectId: string;
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
  upload_metadata: Record<string, string>;
  notes: string;
}) {
  assertSupabaseReady();
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();

  const metadata = {
    notes: input.notes.trim(),
    workflow_status: input.status,
    linked_collection: input.linked_collection ?? (input.content_item_id ? "content" : ""),
    linked_item_id: input.linked_item_id ?? input.content_item_id ?? "",
    linked_item_label: input.linked_item_label ?? "",
    upload_metadata: input.upload_metadata,
    writes_enabled: false,
  };
  const mediaPayload = (status: string) => ({
    project_id: input.projectId,
    content_item_id: input.content_item_id ?? null,
    title: input.title.trim(),
    asset_type: input.asset_type,
    source_url: input.source_url.trim(),
    storage_path: input.storage_path.trim(),
    alt_text: input.alt_text.trim(),
    tags: input.tags,
    status,
    metadata,
    created_at: now,
    updated_at: now,
  });
  let assetResult = await supabase
    .from("media_assets")
    .insert(mediaPayload(input.status))
    .select("*")
    .single();

  if (isLegacyMediaStatusError(assetResult.error)) {
    assetResult = await supabase
      .from("media_assets")
      .insert(mediaPayload(legacyMediaStatus(input.status)))
      .select("*")
      .single();
  }

  if (isMissingTable(assetResult.error)) {
    throw new Error("Media library table is missing. Run database/schema.sql in Supabase SQL editor, then press Reload.");
  }

  throwIfError("Create media asset", assetResult.error);
  const asset = normalizeMediaAsset(assetResult.data as MediaAssetRow);
  const log =
    (await insertActionLog(supabase, {
      project_id: input.projectId,
      actor: "User",
      action: "media.created",
      details: `Added media asset: ${asset.title}.`,
      created_at: now,
    })) ??
    localLog({
      project_id: input.projectId,
      actor: "User",
      action: "media.created",
      details: `Added media asset: ${asset.title}.`,
      created_at: now,
    });

  return { asset, log };
}

export async function updateMediaAssetStatusInDb(asset: MediaAsset, status: MediaAssetStatus) {
  assertSupabaseReady();
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  const metadata = {
    ...asset.metadata,
    workflow_status: status,
  };
  let assetResult = await supabase
    .from("media_assets")
    .update({ status, metadata, updated_at: now })
    .eq("id", asset.id)
    .select("*")
    .single();

  if (isLegacyMediaStatusError(assetResult.error)) {
    assetResult = await supabase
      .from("media_assets")
      .update({ status: legacyMediaStatus(status), metadata, updated_at: now })
      .eq("id", asset.id)
      .select("*")
      .single();
  }

  if (isMissingTable(assetResult.error)) {
    throw new Error("Media library table is missing. Run database/schema.sql in Supabase SQL editor, then press Reload.");
  }

  throwIfError("Update media asset", assetResult.error);
  const updatedAsset = normalizeMediaAsset(assetResult.data as MediaAssetRow);
  const action = status === "archived" ? "media.archived" : status === "published" ? "media.published" : "media.drafted";
  const log =
    (await insertActionLog(supabase, {
      project_id: asset.project_id,
      actor: "User",
      action,
      details: `${updatedAsset.title} is now ${updatedAsset.status}.`,
      created_at: now,
    })) ??
    localLog({
      project_id: asset.project_id,
      actor: "User",
      action,
      details: `${updatedAsset.title} is now ${updatedAsset.status}.`,
      created_at: now,
    });

  return { asset: updatedAsset, log };
}

export async function upsertConnectorInDb(input: {
  projectId: string;
  type: ConnectorType;
  status: ConnectorStatus;
  config: Record<string, unknown>;
}) {
  assertSupabaseReady();
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  const existingResult = await supabase
    .from("connectors")
    .select("*")
    .eq("project_id", input.projectId)
    .eq("type", input.type)
    .limit(1);

  if (isMissingTable(existingResult.error)) {
    throw new Error("Connectors table is missing. Run database/schema.sql in Supabase SQL editor, then press Reload.");
  }

  throwIfError("Load connector", existingResult.error);

  const existing = ((existingResult.data ?? []) as ConnectorRow[])[0];
  const payload = {
    project_id: input.projectId,
    type: input.type,
    status: input.status,
    config: {
      ...input.config,
      mode: "mock",
    },
    updated_at: now,
  };
  const legacyPayload = {
    project_id: input.projectId,
    type: input.type,
    status: input.status,
    config: payload.config,
  };
  const connectorResult = existing
    ? await supabase.from("connectors").update(payload).eq("id", existing.id).select("*").single()
    : await supabase.from("connectors").insert({ ...payload, created_at: now }).select("*").single();
  const finalConnectorResult =
    connectorResult.error && isSchemaMismatch(connectorResult.error)
      ? existing
        ? await supabase.from("connectors").update(legacyPayload).eq("id", existing.id).select("*").single()
        : await supabase.from("connectors").insert({ ...legacyPayload, created_at: now }).select("*").single()
      : connectorResult;

  if (isMissingTable(finalConnectorResult.error)) {
    throw new Error("Connectors table is missing. Run database/schema.sql in Supabase SQL editor, then press Reload.");
  }

  throwIfError("Save connector", finalConnectorResult.error);

  const connector = normalizeConnector(finalConnectorResult.data as ConnectorRow);
  const log =
    (await insertActionLog(supabase, {
      project_id: input.projectId,
      actor: "User",
      action: "connector.saved",
      details: `${connector.type} connector saved as ${connector.status}. External API auth is still disabled.`,
      created_at: now,
    })) ??
    localLog({
      project_id: input.projectId,
      actor: "User",
      action: "connector.saved",
      details: `${connector.type} connector saved as ${connector.status}. External API auth is still disabled.`,
      created_at: now,
    });

  return { connector, log };
}

export async function createAutomationRuleInDb(input: {
  projectId: string;
  name: string;
  trigger: AutomationTrigger;
  action: AutomationAction;
  schedule: string;
  status: AutomationStatus;
  config: Record<string, unknown>;
}) {
  assertSupabaseReady();
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  const ruleResult = await supabase
    .from("automation_rules")
    .insert({
      project_id: input.projectId,
      name: input.name.trim(),
      trigger: input.trigger,
      action: input.action,
      schedule: input.schedule.trim() || "manual",
      status: input.status,
      config: input.config,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (isMissingTable(ruleResult.error)) {
    throw new Error("Automation rules table is missing. Run database/phase9_automation_rules.sql in Supabase SQL editor, then press Reload.");
  }

  throwIfError("Create automation rule", ruleResult.error);

  const rule = normalizeAutomationRule(ruleResult.data as AutomationRuleRow);
  const log =
    (await insertActionLog(supabase, {
      project_id: input.projectId,
      actor: "User",
      action: "automation.created",
      details: `Created automation: ${rule.name}.`,
      created_at: now,
    })) ??
    localLog({
      project_id: input.projectId,
      actor: "User",
      action: "automation.created",
      details: `Created automation: ${rule.name}.`,
      created_at: now,
    });

  return { rule, log };
}

export async function updateAutomationRuleStatusInDb(rule: AutomationRule, status: AutomationStatus) {
  assertSupabaseReady();
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  const ruleResult = await supabase
    .from("automation_rules")
    .update({ status, updated_at: now })
    .eq("id", rule.id)
    .select("*")
    .single();

  if (isMissingTable(ruleResult.error)) {
    throw new Error("Automation rules table is missing. Run database/phase9_automation_rules.sql in Supabase SQL editor, then press Reload.");
  }

  throwIfError("Update automation rule", ruleResult.error);

  const updatedRule = normalizeAutomationRule(ruleResult.data as AutomationRuleRow);
  const log =
    (await insertActionLog(supabase, {
      project_id: rule.project_id,
      actor: "User",
      action: status === "active" ? "automation.resumed" : "automation.paused",
      details: `${updatedRule.name} is now ${updatedRule.status}.`,
      created_at: now,
    })) ??
    localLog({
      project_id: rule.project_id,
      actor: "User",
      action: status === "active" ? "automation.resumed" : "automation.paused",
      details: `${updatedRule.name} is now ${updatedRule.status}.`,
      created_at: now,
    });

  return { rule: updatedRule, log };
}

export async function runAutomationRuleNowInDb(rule: AutomationRule) {
  assertSupabaseReady();
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  const ruleResult = await supabase
    .from("automation_rules")
    .update({ last_run_at: now, updated_at: now })
    .eq("id", rule.id)
    .select("*")
    .single();

  if (isMissingTable(ruleResult.error)) {
    throw new Error("Automation rules table is missing. Run database/phase9_automation_rules.sql in Supabase SQL editor, then press Reload.");
  }

  throwIfError("Run automation rule", ruleResult.error);

  const updatedRule = normalizeAutomationRule(ruleResult.data as AutomationRuleRow);
  const log =
    (await insertActionLog(supabase, {
      project_id: rule.project_id,
      actor: "Automation",
      action: "automation.run",
      details: `${updatedRule.name} mock run completed. No external connector actions were executed.`,
      created_at: now,
    })) ??
    localLog({
      project_id: rule.project_id,
      actor: "Automation",
      action: "automation.run",
      details: `${updatedRule.name} mock run completed. No external connector actions were executed.`,
      created_at: now,
    });

  return { rule: updatedRule, log };
}

function taskStatePayload(state: TaskState) {
  return {
    task_id: state.task_id,
    goal: state.goal,
    current_stage: state.current_stage,
    completed_steps: state.completed_steps,
    next_step: state.next_step,
    last_ai: state.last_ai,
    status: state.status,
    needs_review: state.needs_review,
    metadata: state.metadata,
    updated_at: state.updated_at,
  };
}

export async function persistGeneratedHandoff(input: {
  task: Task;
  state: TaskState;
  handoff: HandoffSummary;
  log: ActionLog;
}) {
  assertSupabaseReady();
  const supabase = getSupabaseClient();

  const stateResult = await supabase
    .from("task_states")
    .upsert(taskStatePayload(input.state), { onConflict: "task_id" })
    .select("*")
    .single();

  throwUnlessMissingTable("Save handoff source state", stateResult.error);

  const handoff = (await insertHandoffSummary(supabase, input.handoff)) ?? input.handoff;
  const log = (await insertActionLog(supabase, input.log)) ?? input.log;

  return {
    state: stateResult.data ? normalizeTaskState(stateResult.data as TaskState) : input.state,
    handoff,
    log,
  };
}

export async function persistTaskTransition(input: {
  task: Task;
  state: TaskState;
  run?: AiRun;
  log: ActionLog;
  handoff?: HandoffSummary;
  approval?: Approval;
}) {
  assertSupabaseReady();
  const supabase = getSupabaseClient();

  const taskResult = await supabase
    .from("tasks")
    .update({ status: input.state.status })
    .eq("id", input.task.id)
    .select("*")
    .single();

  throwIfError("Update task", taskResult.error);

  const stateResult = await supabase
    .from("task_states")
    .upsert(taskStatePayload(input.state), { onConflict: "task_id" })
    .select("*")
    .single();

  throwUnlessMissingTable("Upsert task state", stateResult.error);

  const run = input.run ? (await insertAiRun(supabase, input.run)) ?? input.run : undefined;
  const handoff = input.handoff ? (await insertHandoffSummary(supabase, input.handoff)) ?? input.handoff : undefined;

  const approval = input.approval ? (await insertApproval(supabase, input.approval)) ?? input.approval : undefined;

  const log = (await insertActionLog(supabase, input.log)) ?? input.log;

  return {
    task: normalizeTask(taskResult.data as Task & { priority?: Task["priority"] | null; status?: Task["status"] | null; updated_at?: string | null }),
    state: stateResult.data ? normalizeTaskState(stateResult.data as TaskState) : input.state,
    run,
    handoff,
    approval,
    log,
  };
}

function connectorExecutionPlaceholder(approval: Approval): ConnectorExecutionResult {
  if (approval.requested_action.includes("delete")) {
    return {
      execution_status: "failed",
      execution_error: "Delete actions are blocked by the rules engine.",
      details: "Delete action approval was blocked and no connector action was executed.",
      log_action: "approval.execution_blocked",
    };
  }

  if (approval.action_type === "reply_comment" && approval.connector === "website") {
    return {
      execution_status: "execution_pending",
      execution_error: "Approved, but connector reply execution is not implemented yet.",
      details: "Approved, but connector reply execution is not implemented yet.",
      log_action: "connector.website.reply_execution_pending",
    };
  }

  if (approval.action_type === "reply_message" && approval.connector === "website") {
    return {
      execution_status: "execution_pending",
      execution_error: "Approved, but website message reply execution is not implemented yet.",
      details: "Approved, but website message reply execution is not implemented yet.",
      log_action: "connector.website.message_reply_execution_pending",
    };
  }

  if (approval.action_type === "send_email" || approval.connector === "email") {
    return {
      execution_status: "execution_pending",
      execution_error: "Approved, but email sending is not implemented yet.",
      details: "Approved, but email sending is not implemented yet.",
      log_action: "connector.email.send_execution_pending",
    };
  }

  if (approval.action_type === "reply_comment" || approval.action_type === "reply_message") {
    return {
      execution_status: "execution_pending",
      execution_error: `Approved, but ${approval.connector} reply execution is not implemented yet.`,
      details: `Approved, but ${approval.connector} reply execution is not implemented yet.`,
      log_action: `connector.${approval.connector}.reply_execution_pending`,
    };
  }

  if (approval.action_type === "publish_content" || approval.action_type === "update_content") {
    return {
      execution_status: "execution_pending",
      execution_error: `Approved, but ${approval.connector} ${approval.action_type === "publish_content" ? "publish" : "update"} execution is not implemented yet.`,
      details: `Approved, but ${approval.connector} ${approval.action_type === "publish_content" ? "publish" : "update"} execution is not implemented yet.`,
      log_action: `connector.${approval.connector}.${approval.action_type}_execution_pending`,
    };
  }

  return {
    execution_status: "execution_pending",
    execution_error: "Approved, but no connector execution handler is available for this action.",
    details: "Approved, but no connector execution handler is available for this action.",
    log_action: "approval.execution_pending",
  };
}

export async function approveActionInDb(input: {
  task: Task;
  state: TaskState;
  approval: Approval;
  updatedState: TaskState;
  message?: Message;
  contentItem?: ContentItem;
  routes?: ContentRoute[];
  executionResult?: ConnectorExecutionResult;
}) {
  assertSupabaseReady();
  const supabase = getSupabaseClient();
  const resolvedAt = input.approval.resolved_at ?? new Date().toISOString();
  const executionResult = input.executionResult ?? connectorExecutionPlaceholder(input.approval);
  const finalTaskStatus: Task["status"] =
    executionResult.execution_status === "executed"
      ? "completed"
      : executionResult.execution_status === "failed"
        ? "blocked"
        : "in_progress";
  const finalState: TaskState = {
    ...input.updatedState,
    current_stage: executionResult.execution_status === "executed"
      ? input.updatedState.current_stage
      : executionResult.execution_status === "failed"
        ? "approval granted, connector execution failed"
        : "approval granted, connector execution pending",
    completed_steps: Array.from(new Set([...input.updatedState.completed_steps, "connector execution evaluated"])),
    next_step: executionResult.details,
    status: finalTaskStatus,
    needs_review: false,
    metadata: {
      ...input.updatedState.metadata,
      approval_execution: {
        approval_id: input.approval.id,
        action_type: input.approval.action_type,
        connector: input.approval.connector,
        target_id: input.approval.target_id,
        target_type: input.approval.target_type,
        execution_status: executionResult.execution_status,
        execution_error: executionResult.execution_error,
        evaluated_at: resolvedAt,
      },
    },
    updated_at: resolvedAt,
  };
  const approvalMetadata = {
    ...input.approval.metadata,
    execution_result: {
      status: executionResult.execution_status,
      details: executionResult.details,
      evaluated_at: resolvedAt,
      ...(executionResult.metadata ? { metadata: executionResult.metadata } : {}),
    },
  };
  const approvalResult = await supabase
    .from("approvals")
    .update({
      status: "approved",
      resolved_at: resolvedAt,
      action_type: input.approval.action_type,
      connector: input.approval.connector,
      target_id: input.approval.target_id,
      target_type: input.approval.target_type,
      draft_text: input.approval.draft_text,
      metadata: approvalMetadata,
      execution_status: executionResult.execution_status,
      execution_error: executionResult.execution_error ?? null,
    })
    .eq("id", input.approval.id)
    .select("*")
    .single();

  approvalExecutionSchemaError("Approve approval update", approvalResult.error);
  throwUnlessMissingTable("Approve approval update", approvalResult.error);

  const approvedApproval = approvalResult.data
    ? normalizeApproval(approvalResult.data as ApprovalRow)
    : {
        ...input.approval,
        status: "approved" as const,
        resolved_at: resolvedAt,
        metadata: approvalMetadata,
        execution_status: executionResult.execution_status,
        execution_error: executionResult.execution_error,
      };

  let message: Message | undefined;

  if (input.message) {
    const metadata = {
      ...input.message.metadata,
      ai_draft_status: "approved",
      reply_approval_status: "approved",
      reply_approval_id: approvedApproval.id,
      reply_approved_at: resolvedAt,
      reply_execution_status: executionResult.execution_status,
      reply_execution_error: executionResult.execution_error,
      reply_execution_attempted_at: resolvedAt,
    };

    message = await updateMessageWithFallback(
      supabase,
      input.message,
      { status: executionResult.execution_status === "executed" ? "replied" : "drafted", metadata },
      { status: executionResult.execution_status === "executed" ? "closed" : "drafted" },
      "Approve reply draft",
    );
  }

  let item: ContentItem | undefined;
  let routes = input.routes ?? [];
  let publishLogs: PublishLog[] = [];

  if (input.contentItem) {
    const itemMetadata = {
      ...input.contentItem.metadata,
      publish_approval_status: "approved",
      publish_approval_id: approvedApproval.id,
      publish_approved_at: resolvedAt,
      publish_execution_status: executionResult.execution_status,
      publish_execution_error: executionResult.execution_error,
      publish_execution_attempted_at: resolvedAt,
    };
    const contentStatus: ContentStatus = executionResult.execution_status === "executed" ? "published" : input.contentItem.status;
    const itemResult = await supabase
      .from("content_items")
      .update({ status: contentStatus, metadata: itemMetadata, updated_at: resolvedAt })
      .eq("id", input.contentItem.id)
      .select("*")
      .single();

    throwIfError("Approve content publish item", itemResult.error);
    item = normalizeContentItem(itemResult.data as ContentItemRow);

    if (routes.length === 0) {
      const routesResult = await supabase.from("content_routes").select("*").eq("content_item_id", input.contentItem.id);

      throwIfError("Load content routes for approval", routesResult.error);
      routes = ((routesResult.data ?? []) as ContentRouteRow[]).map(normalizeContentRoute);
    }

    if (routes.length > 0) {
      const routeResult = await supabase
        .from("content_routes")
        .update({ status: contentStatus })
        .in("id", routes.map((route) => route.id))
        .select("*");

      throwIfError("Approve content publish routes", routeResult.error);
      routes = ((routeResult.data ?? []) as ContentRouteRow[]).map(normalizeContentRoute);
    }

    const scheduleResult = await supabase
      .from("content_schedule")
      .update({ status: contentStatus, updated_at: resolvedAt })
      .eq("content_item_id", input.contentItem.id);

    throwUnlessMissingTable("Approve content schedule", scheduleResult.error);

    const publishRows = (routes.length > 0 ? routes : [{ id: null }]).map((route) => ({
      project_id: input.contentItem?.project_id,
      content_item_id: input.contentItem?.id,
      route_id: route.id,
      action: executionResult.execution_status === "executed" ? "connector_publish_executed" : "connector_publish_execution_pending",
      status: executionResult.execution_status === "executed" ? "published" : contentStatus,
      details: executionResult.details,
      created_at: resolvedAt,
    }));
    const publishResult = await supabase.from("publish_logs").insert(publishRows).select("*");

    throwIfError("Create approved publish logs", publishResult.error);
    publishLogs = ((publishResult.data ?? []) as PublishLogRow[]).map(normalizePublishLog);
  }

  const taskResult = await supabase
    .from("tasks")
    .update({ status: finalState.status, updated_at: finalState.updated_at })
    .eq("id", input.task.id)
    .select("*")
    .single();
  const stateResult = await supabase
    .from("task_states")
    .upsert(taskStatePayload(finalState), { onConflict: "task_id" })
    .select("*")
    .single();

  throwIfError("Approve task update", taskResult.error);
  throwUnlessMissingTable("Approve state update", stateResult.error);

  const approvedTask = taskResult.data
    ? normalizeTask(taskResult.data as Task & { priority?: Task["priority"] | null; status?: Task["status"] | null; updated_at?: string | null })
    : { ...input.task, status: finalState.status, updated_at: finalState.updated_at };
  const approvedState = stateResult.data ? normalizeTaskState(stateResult.data as TaskState) : finalState;
  const approvalDetail = `${executionResult.details} (${input.approval.action_type} via ${input.approval.connector})`;
  const log =
    (await insertActionLog(supabase, {
      project_id: input.task.project_id,
      task_id: input.task.id,
      actor: executionResult.execution_status === "execution_pending" ? "Connector Executor" : "User",
      action: executionResult.log_action,
      details: approvalDetail,
      created_at: resolvedAt,
    })) ??
    localLog({
      project_id: input.task.project_id,
      task_id: input.task.id,
      actor: executionResult.execution_status === "execution_pending" ? "Connector Executor" : "User",
      action: executionResult.log_action,
      details: approvalDetail,
      created_at: resolvedAt,
    });

  return {
    task: approvedTask,
    state: approvedState,
    approval: approvedApproval,
    message,
    item,
    routes,
    publishLogs,
    log,
  };
}







export async function updateProjectMemoryInDb(memory: ProjectMemory) {
  assertSupabaseReady();
  const supabase = getSupabaseClient();

  const memoryResult = await supabase
    .from("project_memory")
    .upsert(
      {
        project_id: memory.project_id,
        brand_tone: memory.brand_tone,
        target_channels: memory.target_channels,
        posting_style: memory.posting_style,
        hashtag_style: memory.hashtag_style,
        notes: memory.notes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id" },
    )
    .select("*")
    .single();

  throwUnlessMissingTable("Save project memory", memoryResult.error);

  const savedMemory = memoryResult.data ? normalizeProjectMemory(memoryResult.data as ProjectMemory) : memory;
  await insertActionLog(supabase, {
    project_id: memory.project_id,
    actor: "User",
    action: "project_memory.updated",
    details: `Updated brand voice: ${savedMemory.brand_tone}.`,
  });

  return savedMemory;
}

export async function archiveProjectInDb(project: Project, archived: boolean) {
  assertSupabaseReady();
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  const projectResult = await supabase
    .from("projects")
    .update({
      status: archived ? "archived" : "active",
      archived_at: archived ? now : null,
      updated_at: now,
    })
    .eq("id", project.id)
    .select("*")
    .single();

  if (isSchemaMismatch(projectResult.error)) {
    throw new Error("Project archive columns are missing. Run the Phase 5 schema migration in database/schema.sql, then press Reload.");
  }

  throwIfError(archived ? "Archive project" : "Restore project", projectResult.error);
  const updatedProject = normalizeProject(
    projectResult.data as Project & { updated_at?: string | null; description?: string | null; status?: Project["status"] | null; archived_at?: string | null },
  );

  const log =
    (await insertActionLog(supabase, {
      project_id: project.id,
      actor: "User",
      action: archived ? "project.archived" : "project.restored",
      details: `${archived ? "Archived" : "Restored"} project ${project.name}.`,
    })) ??
    localLog({
      project_id: project.id,
      actor: "User",
      action: archived ? "project.archived" : "project.restored",
      details: `${archived ? "Archived" : "Restored"} project ${project.name}.`,
    });

  return { project: updatedProject, log };
}

export async function deleteProjectInDb(project: Project) {
  assertSupabaseReady();
  const supabase = getSupabaseClient();

  const tasksResult = await supabase.from("tasks").select("id").eq("project_id", project.id);
  throwIfError("Load linked project tasks", tasksResult.error);

  const taskIds = ((tasksResult.data ?? []) as Array<{ id: string }>).map((task) => task.id);
  const contentItemsResult = await supabase.from("content_items").select("id").eq("project_id", project.id);
  throwUnlessMissingTable("Load linked content items", contentItemsResult.error);
  const contentItemIds = isMissingTable(contentItemsResult.error)
    ? []
    : ((contentItemsResult.data ?? []) as Array<{ id: string }>).map((item) => item.id);

  await deleteIn(supabase, "approvals", "task_id", taskIds, "Delete linked approvals");
  await deleteIn(supabase, "ai_runs", "task_id", taskIds, "Delete linked AI runs");
  await deleteIn(supabase, "handoff_summaries", "task_id", taskIds, "Delete linked handoff summaries");
  await deleteIn(supabase, "task_states", "task_id", taskIds, "Delete linked task states");
  await deleteIn(supabase, "action_logs", "task_id", taskIds, "Delete linked task history");
  await deleteIn(supabase, "content_posts", "task_id", taskIds, "Delete linked content posts");
  await deleteIn(supabase, "content_items", "task_id", taskIds, "Delete linked content items");

  await deleteIn(supabase, "publish_logs", "content_item_id", contentItemIds, "Delete linked publish logs");
  await deleteIn(supabase, "content_schedule", "content_item_id", contentItemIds, "Delete linked content schedules");
  await deleteIn(supabase, "content_routes", "content_item_id", contentItemIds, "Delete linked content routes");
  await deleteEq(supabase, "media_assets", "project_id", project.id, "Delete linked media assets");
  await deleteEq(supabase, "content_items", "project_id", project.id, "Delete project content items");
  await deleteEq(supabase, "messages", "project_id", project.id, "Delete linked messages");
  await deleteEq(supabase, "content_posts", "project_id", project.id, "Delete project content posts");
  await deleteEq(supabase, "connectors", "project_id", project.id, "Delete linked connectors");
  await deleteEq(supabase, "website_control_map", "project_id", project.id, "Delete linked website control map");
  await deleteEq(supabase, "automation_rules", "project_id", project.id, "Delete linked automation rules");
  await deleteEq(supabase, "project_memory", "project_id", project.id, "Delete project memory");
  await deleteEq(supabase, "action_logs", "project_id", project.id, "Delete project history");

  if (taskIds.length > 0) {
    const tasksDeleteResult = await supabase.from("tasks").delete().in("id", taskIds).select("id");
    throwIfError("Delete linked tasks", tasksDeleteResult.error);

    const deletedTaskIds = new Set(((tasksDeleteResult.data ?? []) as Array<{ id: string }>).map((task) => task.id));
    const missingDeletes = taskIds.filter((taskId) => !deletedTaskIds.has(taskId));

    if (missingDeletes.length > 0) {
      throw new Error("Linked tasks were not deleted. Run database/schema.sql in Supabase SQL editor to add delete policies, then press Reload.");
    }
  }

  const deleteResult = await supabase.from("projects").delete().eq("id", project.id).select("id");
  throwIfError("Delete project", deleteResult.error);

  if ((deleteResult.data ?? []).length === 0) {
    throw new Error("Project was not deleted. Run the Phase 5 schema migration in database/schema.sql to add the project delete policy, then press Reload.");
  }

  return { projectId: project.id };
}

