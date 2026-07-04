"use client";

import { useState, type FormEvent } from "react";
import { Camera, Globe2, Mail, Plug, Save, ThumbsUp, type LucideIcon } from "lucide-react";
import { WebsiteControlMapPanel } from "@/components/WebsiteControlMapPanel";
import type { Connector, ConnectorStatus, ConnectorType, ContentItem, Message, Project, Rule, WebsiteControlMapEntry } from "@/lib/types";

type SaveConnectorInput = {
  projectId: string;
  type: ConnectorType;
  status: ConnectorStatus;
  config: Record<string, unknown>;
};

type ConnectorManagerPanelProps = {
  project?: Project;
  connectors: Connector[];
  messages: Message[];
  contentItems: ContentItem[];
  websiteControlMap: WebsiteControlMapEntry[];
  rules: Rule[];
  isSaving: boolean;
  onSaveConnector: (input: SaveConnectorInput) => Promise<void> | void;
};

type ConnectorDefinition = {
  type: ConnectorType;
  label: string;
  description: string;
  accountPlaceholder: string;
  endpointPlaceholder: string;
  icon: LucideIcon;
};

const connectorDefinitions: ConnectorDefinition[] = [
  {
    type: "website",
    label: "Website Connector",
    description: "Capture website leads, route form messages, and prepare page update tasks.",
    accountPlaceholder: "wildsaura.com",
    endpointPlaceholder: "/api/contact",
    icon: Globe2,
  },
  {
    type: "gmail",
    label: "Gmail Connector",
    description: "Prepare the inbox bridge for future Gmail read and reply approval flows.",
    accountPlaceholder: "name@gmail.com",
    endpointPlaceholder: "OAuth pending",
    icon: Mail,
  },
  {
    type: "instagram",
    label: "Instagram Connector",
    description: "Hold account context for future comments, messages, drafts, and approvals.",
    accountPlaceholder: "@wildsaura",
    endpointPlaceholder: "Meta Graph API pending",
    icon: Camera,
  },
  {
    type: "facebook",
    label: "Facebook Connector",
    description: "Prepare page routing for future posts, comments, and message summaries.",
    accountPlaceholder: "Wildsaura page",
    endpointPlaceholder: "Meta page ID pending",
    icon: ThumbsUp,
  },
];

const connectorStatuses: ConnectorStatus[] = ["not_connected", "connected", "paused"];

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

function statusClass(status: ConnectorStatus) {
  if (status === "connected") {
    return "border-emerald-300/40 bg-emerald-300/10 text-emerald-100";
  }

  if (status === "paused") {
    return "border-amber-300/40 bg-amber-300/10 text-amber-100";
  }

  return "border-zinc-700 bg-zinc-900 text-zinc-300";
}

function ConnectorCard({
  project,
  definition,
  connector,
  messageCount,
  contentCount,
  isSaving,
  onSaveConnector,
}: {
  project?: Project;
  definition: ConnectorDefinition;
  connector?: Connector;
  messageCount: number;
  contentCount: number;
  isSaving: boolean;
  onSaveConnector: (input: SaveConnectorInput) => Promise<void> | void;
}) {
  const Icon = definition.icon;
  const [status, setStatus] = useState<ConnectorStatus>(connector?.status ?? "not_connected");
  const [account, setAccount] = useState(configString(connector?.config, "account"));
  const [endpoint, setEndpoint] = useState(configString(connector?.config, "endpoint"));
  const [notes, setNotes] = useState(configString(connector?.config, "notes"));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!project) {
      return;
    }

    await onSaveConnector({
      projectId: project.id,
      type: definition.type,
      status,
      config: {
        account: account.trim(),
        endpoint: endpoint.trim(),
        notes: notes.trim(),
      },
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-emerald-200">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="break-words text-base font-semibold text-zinc-50">{definition.label}</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-400">{definition.description}</p>
          </div>
        </div>
        <span className={`shrink-0 rounded-lg border px-2 py-1 text-xs font-medium ${statusClass(status)}`}>{label(status)}</span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
          <p className="text-xs text-zinc-500">Inbox items</p>
          <p className="mt-1 text-xl font-semibold text-zinc-50">{messageCount}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
          <p className="text-xs text-zinc-500">Content routes</p>
          <p className="mt-1 text-xl font-semibold text-zinc-50">{contentCount}</p>
        </div>
      </div>

      <label className="mt-4 block text-sm text-zinc-400" htmlFor={`${definition.type}-status`}>
        Status
        <select
          id={`${definition.type}-status`}
          value={status}
          onChange={(event) => setStatus(event.target.value as ConnectorStatus)}
          className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-300"
        >
          {connectorStatuses.map((option) => (
            <option key={option} value={option}>{label(option)}</option>
          ))}
        </select>
      </label>

      <label className="mt-3 block text-sm text-zinc-400" htmlFor={`${definition.type}-account`}>
        Account / Site
        <input
          id={`${definition.type}-account`}
          value={account}
          onChange={(event) => setAccount(event.target.value)}
          className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
          placeholder={definition.accountPlaceholder}
        />
      </label>

      <label className="mt-3 block text-sm text-zinc-400" htmlFor={`${definition.type}-endpoint`}>
        Endpoint / Route
        <input
          id={`${definition.type}-endpoint`}
          value={endpoint}
          onChange={(event) => setEndpoint(event.target.value)}
          className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
          placeholder={definition.endpointPlaceholder}
        />
      </label>

      <label className="mt-3 block text-sm text-zinc-400" htmlFor={`${definition.type}-notes`}>
        Notes
        <textarea
          id={`${definition.type}-notes`}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="mt-2 min-h-20 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
          placeholder="Auth, routing, or approval notes"
        />
      </label>

      <button
        type="submit"
        disabled={!project || isSaving}
        className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 px-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Save className="h-4 w-4" aria-hidden="true" />
        Save Connector
      </button>
    </form>
  );
}

export function ConnectorManagerPanel({
  project,
  connectors,
  messages,
  contentItems,
  websiteControlMap,
  rules,
  isSaving,
  onSaveConnector,
}: ConnectorManagerPanelProps) {
  const connectedCount = connectors.filter((connector) => connector.status === "connected").length;
  const pausedCount = connectors.filter((connector) => connector.status === "paused").length;

  return (
    <section className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-zinc-400">Connected</span>
            <Plug className="h-4 w-4 text-emerald-300" aria-hidden="true" />
          </div>
          <p className="mt-3 text-3xl font-semibold text-zinc-50">{connectedCount}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
          <p className="text-sm text-zinc-400">Paused</p>
          <p className="mt-3 text-3xl font-semibold text-zinc-50">{pausedCount}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
          <p className="text-sm text-zinc-400">Project</p>
          <p className="mt-3 truncate text-2xl font-semibold text-zinc-50">{project?.name ?? "No project"}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {connectorDefinitions.map((definition) => {
          const connector = connectors.find((item) => item.type === definition.type);
          const messageCount = messages.filter((message) => message.source === definition.type).length;
          const contentCount =
            definition.type === "website" || definition.type === "instagram" || definition.type === "facebook"
              ? contentItems.length
              : 0;

          return (
            <ConnectorCard
              key={`${project?.id ?? "no-project"}-${definition.type}-${connector?.updated_at ?? connector?.created_at ?? "draft"}`}
              project={project}
              definition={definition}
              connector={connector}
              messageCount={messageCount}
              contentCount={contentCount}
              isSaving={isSaving}
              onSaveConnector={onSaveConnector}
            />
          );
        })}
      </div>

      <WebsiteControlMapPanel project={project} entries={websiteControlMap} rules={rules} />
    </section>
  );
}
