"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Camera, Check, ListChecks, Save, ShieldAlert, ThumbsUp } from "lucide-react";
import type { Connector, ConnectorStatus, ConnectorType, Project } from "@/lib/types";

type SaveConnectorInput = {
  projectId: string;
  type: ConnectorType;
  status: ConnectorStatus;
  config: Record<string, unknown>;
};

type MetaConnectorSetupPanelProps = {
  project?: Project;
  facebookConnector?: Connector;
  instagramConnector?: Connector;
  isSaving: boolean;
  onSaveConnector: (input: SaveConnectorInput) => Promise<void> | void;
};

const metaStatusOptions: ConnectorStatus[] = ["not_configured", "configured", "test_pending", "connected", "error"];

const requiredPermissions = [
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

const setupSteps = [
  "Create Meta Developer App",
  "Connect Facebook Page",
  "Link Instagram professional account",
  "Add webhook callback URL",
];

function label(value: string) {
  return value
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function configString(config: Record<string, unknown> | undefined, key: string) {
  const value = config?.[key];
  return typeof value === "string" ? value : "";
}

function configStringArray(config: Record<string, unknown> | undefined, key: string) {
  const value = config?.[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function configRecord(config: Record<string, unknown> | undefined, key: string) {
  const value = config?.[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function configStatus(config: Record<string, unknown> | undefined, key: string): ConnectorStatus | undefined {
  const value = configString(config, key);
  return metaStatusOptions.includes(value as ConnectorStatus) ? (value as ConnectorStatus) : undefined;
}

function connectorStatus(connector?: Connector): ConnectorStatus {
  return connector?.status && metaStatusOptions.includes(connector.status) ? connector.status : "not_configured";
}

function statusClass(status: ConnectorStatus) {
  if (status === "connected") {
    return "border-emerald-300/40 bg-emerald-300/10 text-emerald-100";
  }

  if (status === "configured" || status === "test_pending") {
    return "border-sky-300/40 bg-sky-300/10 text-sky-100";
  }

  if (status === "error") {
    return "border-rose-300/40 bg-rose-300/10 text-rose-100";
  }

  return "border-zinc-700 bg-zinc-900 text-zinc-300";
}

function formatEventTime(value: unknown) {
  if (typeof value !== "string" || !value) {
    return "No webhook received yet.";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function eventTypeSummary(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").join(", ") : "";
}

export function MetaConnectorSetupPanel({
  project,
  facebookConnector,
  instagramConnector,
  isSaving,
  onSaveConnector,
}: MetaConnectorSetupPanelProps) {
  const [facebookPageName, setFacebookPageName] = useState(
    configString(facebookConnector?.config, "facebook_page_name") || configString(facebookConnector?.config, "account"),
  );
  const [facebookPageId, setFacebookPageId] = useState(
    configString(facebookConnector?.config, "facebook_page_id") || configString(instagramConnector?.config, "linked_facebook_page_id"),
  );
  const [instagramBusinessAccountId, setInstagramBusinessAccountId] = useState(
    configString(facebookConnector?.config, "instagram_business_account_id") ||
      configString(instagramConnector?.config, "instagram_business_account_id") ||
      configString(instagramConnector?.config, "account"),
  );
  const [connectionStatus, setConnectionStatus] = useState<ConnectorStatus>(connectorStatus(facebookConnector));
  const [webhookStatus, setWebhookStatus] = useState<ConnectorStatus>(
    configStatus(facebookConnector?.config, "webhook_status") ?? "not_configured",
  );
  const [permissions, setPermissions] = useState<string[]>(
    configStringArray(facebookConnector?.config, "granted_permissions").filter((permission) => requiredPermissions.includes(permission)),
  );

  const missingPermissions = useMemo(
    () => requiredPermissions.filter((permission) => !permissions.includes(permission)),
    [permissions],
  );
  const lastWebhookEvent =
    configRecord(facebookConnector?.config, "last_webhook_event") ?? configRecord(instagramConnector?.config, "last_webhook_event");
  const lastWebhookEventTime = formatEventTime(lastWebhookEvent?.received_at);
  const lastWebhookDetails = lastWebhookEvent
    ? `${configString(lastWebhookEvent, "object") || "Meta"} · ${String(lastWebhookEvent.entry_count ?? 0)} entries${
        eventTypeSummary(lastWebhookEvent.event_types) ? ` · ${eventTypeSummary(lastWebhookEvent.event_types)}` : ""
      }`
    : "Waiting for Meta webhook POST.";
  const savedSummary = facebookConnector || instagramConnector
    ? "Meta connector metadata saved. OAuth, tokens, and Graph API calls are not enabled yet."
    : "No Meta connector metadata saved yet.";

  function togglePermission(permission: string) {
    setPermissions((current) =>
      current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission],
    );
  }

  function buildConfig(role: "facebook_page" | "instagram_business_account") {
    return {
      provider: "meta",
      connector_role: role,
      setup_mode: "metadata_only",
      facebook_page_name: facebookPageName.trim(),
      facebook_page_id: facebookPageId.trim(),
      instagram_business_account_id: instagramBusinessAccountId.trim(),
      connection_status: connectionStatus,
      webhook_status: webhookStatus,
      required_permissions: requiredPermissions,
      granted_permissions: permissions,
      missing_permissions: missingPermissions,
      setup_steps: setupSteps,
      webhook_callback_url: "/api/connectors/meta/webhook",
      access_tokens_saved: false,
      oauth_enabled: false,
      credential_storage: "server_env_variables_later",
      capabilities: ["metadata", "permission_checklist", "setup_instructions"],
      account: role === "facebook_page" ? facebookPageName.trim() || facebookPageId.trim() : instagramBusinessAccountId.trim(),
      endpoint: "Meta Graph API pending",
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!project) {
      return;
    }

    await onSaveConnector({
      projectId: project.id,
      type: "facebook",
      status: connectionStatus,
      config: buildConfig("facebook_page"),
    });

    await onSaveConnector({
      projectId: project.id,
      type: "instagram",
      status: connectionStatus,
      config: {
        ...buildConfig("instagram_business_account"),
        linked_facebook_page_id: facebookPageId.trim(),
      },
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="grid h-10 w-10 shrink-0 grid-cols-2 place-items-center rounded-lg border border-zinc-700 bg-zinc-900 text-sky-200">
            <ThumbsUp className="h-4 w-4" aria-hidden="true" />
            <Camera className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="break-words text-base font-semibold text-zinc-50">Meta Facebook / Instagram Connector</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-400">
              Prepare Facebook Page and Instagram Business metadata for future comments, messages, publishing, and approvals.
            </p>
          </div>
        </div>
        <span className={`w-fit shrink-0 rounded-lg border px-2 py-1 text-xs font-medium ${statusClass(connectionStatus)}`}>
          {label(connectionStatus)}
        </span>
      </div>

      <div className="mt-4 rounded-lg border border-amber-300/30 bg-amber-300/10 p-3">
        <div className="flex gap-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" aria-hidden="true" />
          <p className="text-sm leading-6 text-amber-100">
            Access tokens are not stored in Supabase. OAuth and server-side token storage will be added later.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-emerald-300/30 bg-emerald-300/10 p-3">
          <p className="text-xs uppercase tracking-normal text-emerald-100/80">OAuth route ready</p>
          <p className="mt-1 break-all font-mono text-xs text-emerald-50">/api/connectors/meta/auth/start</p>
          <p className="mt-1 text-xs text-emerald-100/80">Callback route is ready. Token exchange is disabled.</p>
        </div>
        <div className="rounded-lg border border-emerald-300/30 bg-emerald-300/10 p-3">
          <p className="text-xs uppercase tracking-normal text-emerald-100/80">Webhook route ready</p>
          <p className="mt-1 break-all font-mono text-xs text-emerald-50">/api/connectors/meta/webhook</p>
          <p className="mt-1 text-xs text-emerald-100/80">GET verifies challenge. POST stores event metadata.</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
          <p className="text-xs uppercase tracking-normal text-zinc-500">Last webhook event</p>
          <p className="mt-1 text-sm font-medium text-zinc-100">{lastWebhookEventTime}</p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">{lastWebhookDetails}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <label className="block text-sm text-zinc-400" htmlFor="meta-facebook-page-name">
          Facebook Page name
          <input
            id="meta-facebook-page-name"
            value={facebookPageName}
            onChange={(event) => setFacebookPageName(event.target.value)}
            className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-sky-300"
            placeholder="Wildsaura"
          />
        </label>

        <label className="block text-sm text-zinc-400" htmlFor="meta-facebook-page-id">
          Facebook Page ID
          <input
            id="meta-facebook-page-id"
            value={facebookPageId}
            onChange={(event) => setFacebookPageId(event.target.value)}
            className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-sky-300"
            placeholder="1234567890"
          />
        </label>

        <label className="block text-sm text-zinc-400" htmlFor="meta-instagram-business-id">
          Instagram Business Account ID
          <input
            id="meta-instagram-business-id"
            value={instagramBusinessAccountId}
            onChange={(event) => setInstagramBusinessAccountId(event.target.value)}
            className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-sky-300"
            placeholder="17841400000000000"
          />
        </label>

        <label className="block text-sm text-zinc-400" htmlFor="meta-connection-status">
          Connection status
          <select
            id="meta-connection-status"
            value={connectionStatus}
            onChange={(event) => setConnectionStatus(event.target.value as ConnectorStatus)}
            className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition focus:border-sky-300"
          >
            {metaStatusOptions.map((option) => (
              <option key={option} value={option}>{label(option)}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm text-zinc-400" htmlFor="meta-webhook-status">
          Webhook status
          <select
            id="meta-webhook-status"
            value={webhookStatus}
            onChange={(event) => setWebhookStatus(event.target.value as ConnectorStatus)}
            className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition focus:border-sky-300"
          >
            {metaStatusOptions.map((option) => (
              <option key={option} value={option}>{label(option)}</option>
            ))}
          </select>
        </label>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
          <p className="text-xs text-zinc-500">Saved state</p>
          <p className="mt-1 text-sm leading-6 text-zinc-300">{savedSummary}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-sky-200" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-zinc-100">Required Permissions</h3>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {requiredPermissions.map((permission) => {
              const checked = permissions.includes(permission);

              return (
                <label
                  key={permission}
                  className={`flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm transition ${
                    checked
                      ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-100"
                      : "border-zinc-800 bg-zinc-950/70 text-zinc-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePermission(permission)}
                    className="h-4 w-4 rounded border-zinc-700 bg-zinc-950"
                  />
                  <span className="break-all font-mono text-xs">{permission}</span>
                </label>
              );
            })}
          </div>
          <p className="mt-3 text-xs leading-5 text-zinc-500">
            {missingPermissions.length === 0 ? "All required permissions are marked." : `${missingPermissions.length} permissions still missing.`}
          </p>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
          <h3 className="text-sm font-semibold text-zinc-100">Setup Instructions</h3>
          <div className="mt-3 grid gap-2">
            {setupSteps.map((step, index) => (
              <div key={step} className="flex gap-2 rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 text-sm leading-6 text-zinc-300">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-sky-300/40 text-xs text-sky-100">
                  {index + 1}
                </span>
                <span>{step}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 text-sm leading-6 text-zinc-400">
            <p className="text-xs uppercase tracking-normal text-zinc-500">Future callback URL</p>
            <p className="mt-1 break-all font-mono text-xs text-zinc-300">/api/connectors/meta/webhook</p>
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={!project || isSaving}
        className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-sky-300 px-3 text-sm font-semibold text-zinc-950 transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {missingPermissions.length === 0 ? <Check className="h-4 w-4" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
        Save Meta Metadata
      </button>
    </form>
  );
}
