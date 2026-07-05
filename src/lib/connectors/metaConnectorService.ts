import { getSupabaseClient, hasSupabaseConfig } from "@/lib/supabase";
import type { Connector, ConnectorStatus } from "@/lib/types";

type ConnectorRow = Connector & {
  config?: Record<string, unknown> | null;
  updated_at?: string | null;
};

type MetaRouteSummary = {
  object: string;
  entry_count: number;
  entry_ids: string[];
  event_types: string[];
  received_at: string;
};

const metaPermissions = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_metadata",
  "pages_manage_posts",
  "pages_manage_engagement",
  "instagram_basic",
  "instagram_manage_comments",
  "instagram_manage_messages",
  "instagram_content_publish",
];

export function metaEnvStatus() {
  return {
    appId: Boolean(process.env.META_APP_ID?.trim()),
    appSecret: Boolean(process.env.META_APP_SECRET?.trim()),
    verifyToken: Boolean(process.env.META_VERIFY_TOKEN?.trim()),
    redirectUri: Boolean(process.env.META_REDIRECT_URI?.trim()),
  };
}

export function configuredMetaVerifyToken() {
  return process.env.META_VERIFY_TOKEN?.trim() ?? "";
}

function redirectUri(request: Request) {
  return process.env.META_REDIRECT_URI?.trim() || new URL("/api/connectors/meta/auth/callback", request.url).toString();
}

export function buildMetaOAuthUrl(request: Request, state: string) {
  const appId = process.env.META_APP_ID?.trim() ?? "";

  if (!appId) {
    throw new Error("META_APP_ID is not configured.");
  }

  const url = new URL("https://www.facebook.com/dialog/oauth");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri(request));
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", metaPermissions.join(","));

  return url;
}

function normalizeConnector(row: ConnectorRow): Connector {
  return {
    id: row.id,
    project_id: row.project_id,
    type: row.type,
    status: row.status,
    config: row.config ?? {},
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
  };
}

function isSchemaMismatch(error: { code?: string; message: string } | null) {
  return Boolean(
    error?.code === "PGRST204" ||
      error?.code === "42703" ||
      error?.message.includes("schema cache") ||
      error?.message.includes("column") ||
      error?.message.includes("does not exist"),
  );
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function objectArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(objectRecord(item))) : [];
}

function nestedEventTypes(payload: Record<string, unknown>) {
  const types = new Set<string>();
  const entries = objectArray(payload.entry);

  for (const entry of entries) {
    for (const field of ["changes", "messaging", "standby", "comments"]) {
      if (Array.isArray(entry[field])) {
        types.add(field);
      }
    }

    for (const change of objectArray(entry.changes)) {
      const field = textValue(change.field);

      if (field) {
        types.add(field);
      }
    }
  }

  return Array.from(types).sort();
}

export function summarizeMetaWebhookPayload(payload: Record<string, unknown>): MetaRouteSummary {
  const entries = objectArray(payload.entry);
  const entryIds = entries.map((entry) => textValue(entry.id)).filter(Boolean);

  return {
    object: textValue(payload.object) || "unknown",
    entry_count: entries.length,
    entry_ids: entryIds,
    event_types: nestedEventTypes(payload),
    received_at: new Date().toISOString(),
  };
}

function connectorMatchesEntry(connector: Connector, entryIds: string[]) {
  const facebookPageId = textValue(connector.config.facebook_page_id);
  const linkedFacebookPageId = textValue(connector.config.linked_facebook_page_id);
  const instagramBusinessAccountId = textValue(connector.config.instagram_business_account_id);

  return entryIds.some(
    (entryId) => entryId === facebookPageId || entryId === linkedFacebookPageId || entryId === instagramBusinessAccountId,
  );
}

function nextStatus(status: ConnectorStatus): ConnectorStatus {
  return status === "not_connected" || status === "not_configured" ? "configured" : status;
}

async function loadMetaConnectors() {
  const supabase = getSupabaseClient();
  const result = await supabase.from("connectors").select("*").in("type", ["facebook", "instagram"]).order("updated_at", { ascending: false });
  const finalResult = result.error && isSchemaMismatch(result.error)
    ? await supabase.from("connectors").select("*").in("type", ["facebook", "instagram"]).order("created_at", { ascending: false })
    : result;

  if (finalResult.error) {
    throw new Error(`Load Meta connectors: ${finalResult.error.message}`);
  }

  return ((finalResult.data ?? []) as ConnectorRow[]).map(normalizeConnector);
}

async function insertConnector(config: Record<string, unknown>) {
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  const result = await supabase
    .from("connectors")
    .insert({
      type: "facebook",
      status: "configured",
      config,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  const finalResult = result.error && isSchemaMismatch(result.error)
    ? await supabase
        .from("connectors")
        .insert({
          type: "facebook",
          status: "configured",
          config,
          created_at: now,
        })
        .select("*")
        .single()
    : result;

  if (finalResult.error) {
    throw new Error(`Save Meta connector event: ${finalResult.error.message}`);
  }

  return normalizeConnector(finalResult.data as ConnectorRow);
}

async function updateConnector(connector: Connector, config: Record<string, unknown>) {
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();
  const result = await supabase
    .from("connectors")
    .update({
      status: nextStatus(connector.status),
      config,
      updated_at: now,
    })
    .eq("id", connector.id)
    .select("*")
    .single();
  const finalResult = result.error && isSchemaMismatch(result.error)
    ? await supabase
        .from("connectors")
        .update({
          status: nextStatus(connector.status),
          config,
        })
        .eq("id", connector.id)
        .select("*")
        .single()
    : result;

  if (finalResult.error) {
    throw new Error(`Update Meta connector event: ${finalResult.error.message}`);
  }

  return normalizeConnector(finalResult.data as ConnectorRow);
}

async function logConnectorEvent(connector: Connector, summary: MetaRouteSummary) {
  if (!connector.project_id) {
    return undefined;
  }

  const supabase = getSupabaseClient();
  const result = await supabase
    .from("action_logs")
    .insert({
      project_id: connector.project_id,
      actor: "Meta Connector",
      action: "meta.webhook.received",
      details: `Received ${summary.object} webhook with ${summary.entry_count} entries and ${summary.event_types.length} event types.`,
      created_at: summary.received_at,
    })
    .select("*")
    .single();

  if (result.error) {
    return undefined;
  }

  return result.data;
}

export async function saveMetaWebhookEvent(payload: Record<string, unknown>) {
  if (!hasSupabaseConfig()) {
    throw new Error("Supabase env variables are missing.");
  }

  const summary = summarizeMetaWebhookPayload(payload);
  const connectors = await loadMetaConnectors();
  const matchedConnector =
    connectors.find((connector) => connectorMatchesEntry(connector, summary.entry_ids)) ??
    connectors.find((connector) => connector.type === "facebook") ??
    connectors[0];
  const config = {
    ...(matchedConnector?.config ?? {}),
    provider: "meta",
    webhook_route_ready: true,
    webhook_status: "connected",
    last_webhook_event: {
      ...summary,
      raw_event: payload,
    },
    access_tokens_saved: false,
    long_lived_access_token_saved: false,
  };
  const connector = matchedConnector ? await updateConnector(matchedConnector, config) : await insertConnector(config);
  const log = await logConnectorEvent(connector, summary);

  return { connector, summary, log };
}

export async function saveMetaOAuthCallback(input: {
  code?: string;
  state?: string;
  error?: string;
  errorReason?: string;
  errorDescription?: string;
}) {
  if (!hasSupabaseConfig()) {
    return { connector: undefined, saved: false };
  }

  const connectors = await loadMetaConnectors();
  const connector = connectors.find((item) => item.type === "facebook") ?? connectors[0];

  if (!connector) {
    return { connector: undefined, saved: false };
  }

  const config = {
    ...connector.config,
    provider: "meta",
    oauth_route_ready: true,
    last_oauth_callback: {
      received_at: new Date().toISOString(),
      has_code: Boolean(input.code),
      state: input.state ?? "",
      error: input.error ?? "",
      error_reason: input.errorReason ?? "",
      error_description: input.errorDescription ?? "",
      token_exchange_performed: false,
    },
    access_tokens_saved: false,
    long_lived_access_token_saved: false,
  };

  return { connector: await updateConnector(connector, config), saved: true };
}

export { metaPermissions };
