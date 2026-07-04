"use client";

import { useState, type FormEvent } from "react";
import { Bell, CalendarClock, FileText, Pause, Play, Plus, RefreshCw, Workflow } from "lucide-react";
import type { AutomationAction, AutomationRule, AutomationStatus, AutomationTrigger, Project } from "@/lib/types";

type CreateAutomationRuleInput = {
  projectId: string;
  name: string;
  trigger: AutomationTrigger;
  action: AutomationAction;
  schedule: string;
  status: AutomationStatus;
  config: Record<string, unknown>;
};

type AutomationPanelProps = {
  project?: Project;
  rules: AutomationRule[];
  isSaving: boolean;
  onCreateRule: (input: CreateAutomationRuleInput) => Promise<void> | void;
  onUpdateStatus: (ruleId: string, status: AutomationStatus) => Promise<void> | void;
  onRunNow: (ruleId: string) => Promise<void> | void;
};

const triggers: AutomationTrigger[] = ["daily_report", "new_message", "content_scheduled", "handoff_completed", "approval_pending"];
const actions: AutomationAction[] = ["generate_report", "create_task", "draft_reply", "notify_user", "draft_content"];
const statuses: AutomationStatus[] = ["paused", "active"];

function label(value: string) {
  return value
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function formatDateTime(iso?: string) {
  if (!iso) {
    return "Never";
  }

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function statusClass(status: AutomationStatus) {
  if (status === "active") {
    return "border-emerald-300/40 bg-emerald-300/10 text-emerald-100";
  }

  return "border-zinc-700 bg-zinc-900 text-zinc-300";
}

function configNotes(rule: AutomationRule) {
  const notes = rule.config.notes;
  return typeof notes === "string" ? notes : "";
}

export function AutomationPanel({ project, rules, isSaving, onCreateRule, onUpdateStatus, onRunNow }: AutomationPanelProps) {
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<AutomationTrigger>("daily_report");
  const [action, setAction] = useState<AutomationAction>("generate_report");
  const [schedule, setSchedule] = useState("manual");
  const [status, setStatus] = useState<AutomationStatus>("paused");
  const [notes, setNotes] = useState("");
  const activeCount = rules.filter((rule) => rule.status === "active").length;
  const pausedCount = rules.length - activeCount;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!project || !name.trim()) {
      return;
    }

    await onCreateRule({
      projectId: project.id,
      name: name.trim(),
      trigger,
      action,
      schedule: schedule.trim() || "manual",
      status,
      config: {
        notes: notes.trim(),
        mode: "mock",
      },
    });

    setName("");
    setTrigger("daily_report");
    setAction("generate_report");
    setSchedule("manual");
    setStatus("paused");
    setNotes("");
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
      <form onSubmit={handleSubmit} className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Workflow className="h-4 w-4 text-emerald-300" aria-hidden="true" />
              <h2 className="text-base font-semibold text-zinc-50">New Automation</h2>
            </div>
            <p className="mt-1 truncate text-sm text-zinc-400">{project?.name ?? "No project selected"}</p>
          </div>
          <Plus className="h-4 w-4 text-emerald-300" aria-hidden="true" />
        </div>

        <label className="block text-sm text-zinc-400" htmlFor="automation-name">
          Name
          <input
            id="automation-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
            placeholder="Daily command report"
          />
        </label>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <label className="block text-sm text-zinc-400" htmlFor="automation-trigger">
            Trigger
            <select
              id="automation-trigger"
              value={trigger}
              onChange={(event) => setTrigger(event.target.value as AutomationTrigger)}
              className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-300"
            >
              {triggers.map((option) => (
                <option key={option} value={option}>{label(option)}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm text-zinc-400" htmlFor="automation-action">
            Action
            <select
              id="automation-action"
              value={action}
              onChange={(event) => setAction(event.target.value as AutomationAction)}
              className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-300"
            >
              {actions.map((option) => (
                <option key={option} value={option}>{label(option)}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <label className="block text-sm text-zinc-400" htmlFor="automation-schedule">
            Schedule
            <input
              id="automation-schedule"
              value={schedule}
              onChange={(event) => setSchedule(event.target.value)}
              className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
              placeholder="daily 09:00"
            />
          </label>

          <label className="block text-sm text-zinc-400" htmlFor="automation-status">
            Status
            <select
              id="automation-status"
              value={status}
              onChange={(event) => setStatus(event.target.value as AutomationStatus)}
              className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-300"
            >
              {statuses.map((option) => (
                <option key={option} value={option}>{label(option)}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-3 block text-sm text-zinc-400" htmlFor="automation-notes">
          Notes
          <textarea
            id="automation-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="mt-2 min-h-24 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
            placeholder="What should this automation watch or prepare?"
          />
        </label>

        <button
          type="submit"
          disabled={!project || !name.trim() || isSaving}
          className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 px-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Create Automation
        </button>
      </form>

      <div className="min-w-0">
        <section className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
            <p className="text-sm text-zinc-400">Automations</p>
            <p className="mt-3 text-3xl font-semibold text-zinc-50">{rules.length}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
            <p className="text-sm text-zinc-400">Active</p>
            <p className="mt-3 text-3xl font-semibold text-zinc-50">{activeCount}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
            <p className="text-sm text-zinc-400">Paused</p>
            <p className="mt-3 text-3xl font-semibold text-zinc-50">{pausedCount}</p>
          </div>
        </section>

        <div className="grid gap-3">
          {rules.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-950/60 p-6 text-sm text-zinc-500">
              Create a mock automation rule to prepare reports, draft replies, or task routing.
            </div>
          ) : null}
          {rules.map((rule) => (
            <article key={rule.id} className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-lg border px-2 py-1 text-xs font-medium ${statusClass(rule.status)}`}>{label(rule.status)}</span>
                    <span className="rounded-lg border border-zinc-700 px-2 py-1 text-xs font-medium text-zinc-300">{label(rule.trigger)}</span>
                  </div>
                  <h2 className="mt-3 break-words text-lg font-semibold text-zinc-50">{rule.name}</h2>
                  <p className="mt-1 text-sm leading-6 text-zinc-400">{label(rule.action)} on {rule.schedule}</p>
                  {configNotes(rule) ? <p className="mt-2 break-words text-sm leading-6 text-zinc-500">{configNotes(rule)}</p> : null}
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="flex items-center gap-2 text-sm text-zinc-400">
                      <CalendarClock className="h-4 w-4 text-sky-300" aria-hidden="true" />
                      <span>{formatDateTime(rule.last_run_at)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-zinc-400">
                      <Bell className="h-4 w-4 text-amber-300" aria-hidden="true" />
                      <span>{label(rule.trigger)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-zinc-400">
                      <FileText className="h-4 w-4 text-violet-300" aria-hidden="true" />
                      <span>{label(rule.action)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onRunNow(rule.id)}
                    disabled={isSaving}
                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm font-medium text-zinc-100 transition hover:border-emerald-300 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    Run Now
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateStatus(rule.id, rule.status === "active" ? "paused" : "active")}
                    disabled={isSaving}
                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm font-medium text-zinc-100 transition hover:border-amber-300 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {rule.status === "active" ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
                    {rule.status === "active" ? "Pause" : "Activate"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
