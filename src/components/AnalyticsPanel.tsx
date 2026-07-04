"use client";

import { BarChart3, CalendarDays, CheckCircle2, Coins, History, Inbox, Plug, Sigma, Workflow, Zap } from "lucide-react";
import type { ReactNode } from "react";
import type { ConnectorType, ControlCenterData } from "@/lib/types";

type AnalyticsPanelProps = {
  data: ControlCenterData;
};

const connectorTypes: ConnectorType[] = ["website", "gmail", "instagram", "facebook"];

function label(value: string) {
  return value
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function formatTime(iso: string) {
  return iso.slice(11, 16);
}

function metricCard(labelText: string, value: string | number, icon: ReactNode) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-zinc-400">{labelText}</span>
        {icon}
      </div>
      <p className="mt-3 text-3xl font-semibold text-zinc-50">{value}</p>
    </div>
  );
}

export function AnalyticsPanel({ data }: AnalyticsPanelProps) {
  const activeTasks = data.tasks.filter((task) => task.status !== "completed").length;
  const unreadInbox = data.messages.filter((message) => message.status === "unread").length;
  const scheduledContent = data.content_schedule.filter((schedule) => schedule.status === "scheduled").length;
  const connectedConnectors = data.connectors.filter((connector) => connector.status === "connected").length;
  const activeAutomations = data.automation_rules.filter((rule) => rule.status === "active").length;
  const totalCost = data.ai_runs.reduce((sum, run) => sum + (run.cost_usd ?? 0), 0);
  const totalTokens = data.ai_runs.reduce((sum, run) => sum + (run.total_tokens ?? 0), 0);
  const aiRunsByModel = data.ai_runs.reduce<Record<string, { runs: number; cost: number; tokens: number }>>((accumulator, run) => {
    const current = accumulator[run.ai_model] ?? { runs: 0, cost: 0, tokens: 0 };

    accumulator[run.ai_model] = {
      runs: current.runs + 1,
      cost: current.cost + (run.cost_usd ?? 0),
      tokens: current.tokens + (run.total_tokens ?? 0),
    };

    return accumulator;
  }, {});
  const recentLogs = data.action_logs.slice(0, 10);

  return (
    <section className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metricCard("Active tasks", activeTasks, <CheckCircle2 className="h-4 w-4 text-sky-300" aria-hidden="true" />)}
        {metricCard("Unread inbox", unreadInbox, <Inbox className="h-4 w-4 text-emerald-300" aria-hidden="true" />)}
        {metricCard("Scheduled content", scheduledContent, <CalendarDays className="h-4 w-4 text-violet-300" aria-hidden="true" />)}
        {metricCard("Connected connectors", connectedConnectors, <Plug className="h-4 w-4 text-emerald-300" aria-hidden="true" />)}
        {metricCard("Active automations", activeAutomations, <Workflow className="h-4 w-4 text-amber-300" aria-hidden="true" />)}
        {metricCard("AI runs", data.ai_runs.length, <Zap className="h-4 w-4 text-emerald-300" aria-hidden="true" />)}
        {metricCard("AI cost", `$${totalCost.toFixed(6)}`, <Coins className="h-4 w-4 text-amber-300" aria-hidden="true" />)}
        {metricCard("Tokens", totalTokens, <Sigma className="h-4 w-4 text-sky-300" aria-hidden="true" />)}
      </div>

      <section className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-zinc-50">Connector Health</h2>
            <Plug className="h-4 w-4 text-emerald-300" aria-hidden="true" />
          </div>
          <div className="space-y-3">
            {connectorTypes.map((type) => {
              const connector = data.connectors.find((item) => item.type === type);
              const messageCount = data.messages.filter((message) => message.source === type).length;

              return (
                <article key={type} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-zinc-100">{label(type)}</h3>
                    <p className="mt-1 text-xs text-zinc-500">{messageCount} inbox items</p>
                  </div>
                  <span className="rounded-lg border border-zinc-700 px-2 py-1 text-xs font-medium text-zinc-300">
                    {label(connector?.status ?? "not_connected")}
                  </span>
                </article>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-zinc-50">AI Cost By Model</h2>
            <BarChart3 className="h-4 w-4 text-sky-300" aria-hidden="true" />
          </div>
          <div className="space-y-3">
            {Object.keys(aiRunsByModel).length === 0 ? <p className="text-sm text-zinc-500">No AI cost data yet.</p> : null}
            {Object.entries(aiRunsByModel).map(([model, stats]) => (
              <article key={model} className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="break-words text-sm font-semibold text-zinc-100">{model}</h3>
                  <span className="text-sm font-medium text-zinc-300">${stats.cost.toFixed(6)}</span>
                </div>
                <p className="mt-2 text-xs text-zinc-500">{stats.runs} runs / {stats.tokens} tokens</p>
              </article>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-zinc-50">Automation Signals</h2>
            <Workflow className="h-4 w-4 text-amber-300" aria-hidden="true" />
          </div>
          <div className="space-y-3">
            {data.automation_rules.length === 0 ? <p className="text-sm text-zinc-500">No automation rules yet.</p> : null}
            {data.automation_rules.slice(0, 6).map((rule) => (
              <article key={rule.id} className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="break-words text-sm font-semibold text-zinc-100">{rule.name}</h3>
                  <span className="rounded-lg border border-zinc-700 px-2 py-1 text-xs font-medium text-zinc-300">{label(rule.status)}</span>
                </div>
                <p className="mt-2 text-xs text-zinc-500">{label(rule.trigger)} to {label(rule.action)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-zinc-50">Recent Logs</h2>
          <History className="h-4 w-4 text-violet-300" aria-hidden="true" />
        </div>
        <div className="space-y-3">
          {recentLogs.length === 0 ? <p className="text-sm text-zinc-500">No actions saved yet.</p> : null}
          {recentLogs.map((log) => (
            <article key={log.id} className="border-l-2 border-zinc-700 pl-3">
              <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
                <span>{log.actor}</span>
                <time dateTime={log.created_at}>{formatTime(log.created_at)}</time>
              </div>
              <p className="mt-1 break-words text-sm leading-6 text-zinc-300">{log.details}</p>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
