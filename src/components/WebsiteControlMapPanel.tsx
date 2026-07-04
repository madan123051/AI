"use client";

import { Code2, Database, FileCode2, ShieldCheck, ShieldQuestion, ShieldX } from "lucide-react";
import type { Project, Rule, WebsiteControlAction, WebsiteControlMapEntry, WebsiteControlStatus } from "@/lib/types";

type WebsiteControlMapPanelProps = {
  project?: Project;
  entries: WebsiteControlMapEntry[];
  rules: Rule[];
};

const actionLabels: Record<WebsiteControlAction, string> = {
  create: "Create",
  update: "Update",
  delete: "Delete",
  publish: "Publish",
  reply: "Reply",
};

const controlRuleDefaults: Array<Pick<Rule, "name" | "action" | "effect" | "enabled">> = [
  { name: "Create Draft", action: "draft_content", effect: "allow", enabled: true },
  { name: "Publish Content", action: "publish_content", effect: "review", enabled: true },
  { name: "Update Live Content", action: "update_live_content", effect: "review", enabled: true },
  { name: "Delete Resource", action: "delete_resource", effect: "block", enabled: true },
  { name: "Reply Comment", action: "reply_comment", effect: "review", enabled: true },
];

function statusConfig(status: WebsiteControlStatus) {
  if (status === "available") {
    return {
      label: "Available",
      className: "border-emerald-300/40 bg-emerald-300/10 text-emerald-100",
      icon: ShieldCheck,
    };
  }

  if (status === "blocked") {
    return {
      label: "Blocked",
      className: "border-rose-300/40 bg-rose-300/10 text-rose-100",
      icon: ShieldX,
    };
  }

  return {
    label: "Review Required",
    className: "border-amber-300/40 bg-amber-300/10 text-amber-100",
    icon: ShieldQuestion,
  };
}

function StatusBadge({ status }: { status: WebsiteControlStatus }) {
  const config = statusConfig(status);
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium ${config.className}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {config.label}
    </span>
  );
}

function ruleEffectLabel(effect: Rule["effect"]) {
  if (effect === "allow") {
    return "Safe";
  }

  if (effect === "block") {
    return "Blocked";
  }

  return "Review Required";
}

function ruleStatus(effect: Rule["effect"]): WebsiteControlStatus {
  if (effect === "allow") {
    return "available";
  }

  if (effect === "block") {
    return "blocked";
  }

  return "review_required";
}

export function WebsiteControlMapPanel({ project, entries, rules }: WebsiteControlMapPanelProps) {
  const sortedEntries = entries.slice().sort((first, second) => first.collection_name.localeCompare(second.collection_name));
  const reviewGateCount = sortedEntries.reduce(
    (count, entry) => count + Object.values(entry.action_statuses).filter((status) => status === "review_required").length,
    0,
  );
  const blockedGateCount = sortedEntries.reduce(
    (count, entry) => count + Object.values(entry.action_statuses).filter((status) => status === "blocked").length,
    0,
  );
  const controlRules = controlRuleDefaults.map((defaultRule) => {
    const persistedRule = rules.find((rule) => rule.action === defaultRule.action);

    return {
      ...defaultRule,
      id: persistedRule?.id ?? `default-${defaultRule.action}`,
      effect: persistedRule?.effect ?? defaultRule.effect,
      enabled: persistedRule?.enabled ?? defaultRule.enabled,
    };
  });
  const persistedCount = sortedEntries.filter((entry) => entry.metadata.persisted !== false).length;

  return (
    <section className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-zinc-400">Mapped collections</span>
            <Database className="h-4 w-4 text-emerald-300" aria-hidden="true" />
          </div>
          <p className="mt-3 text-3xl font-semibold text-zinc-50">{sortedEntries.length}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
          <p className="text-sm text-zinc-400">Review gates</p>
          <p className="mt-3 text-3xl font-semibold text-amber-100">{reviewGateCount}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
          <p className="text-sm text-zinc-400">Blocked gates</p>
          <p className="mt-3 text-3xl font-semibold text-rose-100">{blockedGateCount}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
          <p className="text-sm text-zinc-400">Persisted rows</p>
          <p className="mt-3 text-3xl font-semibold text-zinc-50">{persistedCount}</p>
        </div>
      </div>

      <div>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-50">Website Control Map</h2>
            <p className="mt-1 text-sm text-zinc-400">{project?.name ?? "No project selected"}</p>
          </div>
          <StatusBadge status={persistedCount === sortedEntries.length && sortedEntries.length > 0 ? "available" : "review_required"} />
        </div>

        {sortedEntries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-700 p-5 text-sm text-zinc-500">No website control map rows loaded.</div>
        ) : (
          <div className="grid gap-3">
            {sortedEntries.map((entry) => {
              const actions: WebsiteControlAction[] = ["create", "update", "delete", "publish"];
              if (entry.action_statuses.reply) {
                actions.push("reply");
              }

              return (
                <article key={entry.id} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="break-words text-lg font-semibold text-zinc-50">{entry.display_name}</h3>
                        <span className="rounded-full border border-zinc-700 px-2 py-1 font-mono text-xs text-zinc-400">{entry.collection_name}</span>
                      </div>
                      <p className="mt-2 break-words text-sm leading-6 text-zinc-400">{entry.publish_behavior}</p>
                    </div>
                    <StatusBadge status={entry.status} />
                  </div>

                  <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
                    {actions.map((action) => (
                      <div key={action} className="rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
                        <p className="text-xs font-medium uppercase tracking-normal text-zinc-500">{actionLabels[action]}</p>
                        <div className="mt-2">
                          <StatusBadge status={entry.action_statuses[action] ?? "review_required"} />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 grid gap-3 xl:grid-cols-2">
                    <div className="rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
                      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-normal text-zinc-500">
                        <FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Source File
                      </div>
                      <p className="mt-2 break-words font-mono text-xs leading-5 text-zinc-300">{entry.source_file}</p>
                    </div>
                    <div className="rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
                      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-normal text-zinc-500">
                        <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Source Function
                      </div>
                      <p className="mt-2 break-words font-mono text-xs leading-5 text-zinc-300">{entry.source_function}</p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-base font-semibold text-zinc-50">Default Website Rules</h2>
        <div className="mt-4 grid gap-3 lg:grid-cols-5">
          {controlRules.map((rule) => (
            <article key={rule.id} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
              <p className="break-words text-sm font-semibold text-zinc-100">{rule.name}</p>
              <p className="mt-1 font-mono text-xs text-zinc-500">{rule.action}</p>
              <div className="mt-3">
                <StatusBadge status={ruleStatus(rule.effect)} />
              </div>
              <p className="mt-2 text-xs text-zinc-500">{ruleEffectLabel(rule.effect)}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
