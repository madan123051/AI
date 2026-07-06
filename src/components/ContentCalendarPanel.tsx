"use client";

import { useMemo, useState, type FormEvent } from "react";
import { CalendarDays, FileText, Globe2, Hash, Image as ImageIcon, Megaphone, PencilLine, Play, Plus, Sparkles, Trash2 } from "lucide-react";
import type {
  ContentAiAction,
  ContentItem,
  ContentPlatform,
  ContentRoute,
  ContentSchedule,
  ContentStatus,
  ContentType,
  Project,
  PublishLog,
} from "@/lib/types";

type CreateContentInput = {
  projectId: string;
  title: string;
  content_type: ContentType;
  caption_body: string;
  media_placeholder: string;
  target_platforms: ContentPlatform[];
  target_route: string;
  scheduled_for?: string;
  status: ContentStatus;
};

type ContentCalendarPanelProps = {
  project?: Project;
  items: ContentItem[];
  routes: ContentRoute[];
  schedules: ContentSchedule[];
  publishLogs: PublishLog[];
  isSaving: boolean;
  onCreateContent: (input: CreateContentInput) => Promise<void> | void;
  onAiAction: (itemId: string, action: ContentAiAction) => Promise<void> | void;
  onMockPublish: (itemId: string) => Promise<void> | void;
  onBlockedDelete: (itemId: string) => Promise<void> | void;
};

const contentTypes: ContentType[] = ["post", "story", "website_page", "blog", "reel"];
const platforms: ContentPlatform[] = ["website", "instagram", "facebook", "tiktok"];
const statuses: ContentStatus[] = ["draft", "scheduled", "approval_required", "approved", "published", "failed"];

function label(value: string) {
  return value
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function formatDateTime(iso?: string) {
  if (!iso) {
    return "Not scheduled";
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

function statusClass(status: ContentStatus | "blocked") {
  if (status === "published" || status === "approved") {
    return "border-emerald-300/40 bg-emerald-300/10 text-emerald-100";
  }

  if (status === "scheduled") {
    return "border-sky-300/40 bg-sky-300/10 text-sky-100";
  }

  if (status === "approval_required") {
    return "border-amber-300/40 bg-amber-300/10 text-amber-100";
  }

  if (status === "failed" || status === "blocked") {
    return "border-rose-300/40 bg-rose-300/10 text-rose-100";
  }

  return "border-zinc-700 bg-zinc-900 text-zinc-300";
}

function aiActionLabel(action: ContentAiAction) {
  if (action === "generate_caption") {
    return "Caption";
  }

  if (action === "generate_hashtags") {
    return "Hashtags";
  }

  if (action === "generate_website_title") {
    return "Web Title";
  }

  if (action === "generate_story_text") {
    return "Story Text";
  }

  if (action === "generate_short_post") {
    return "Short Post";
  }

  return "Alt Text";
}

export function ContentCalendarPanel({
  project,
  items,
  routes,
  schedules,
  publishLogs,
  isSaving,
  onCreateContent,
  onAiAction,
  onMockPublish,
  onBlockedDelete,
}: ContentCalendarPanelProps) {
  const [title, setTitle] = useState("");
  const [contentType, setContentType] = useState<ContentType>("post");
  const [captionBody, setCaptionBody] = useState("");
  const [mediaPlaceholder, setMediaPlaceholder] = useState("");
  const [targetPlatforms, setTargetPlatforms] = useState<ContentPlatform[]>(["website"]);
  const [targetRoute, setTargetRoute] = useState("/gallery/macro-insects");
  const [scheduledFor, setScheduledFor] = useState("");
  const [status, setStatus] = useState<ContentStatus>("draft");

  const scheduleByItem = useMemo(
    () =>
      schedules.reduce<Record<string, ContentSchedule>>((accumulator, schedule) => {
        accumulator[schedule.content_item_id] = schedule;
        return accumulator;
      }, {}),
    [schedules],
  );
  const routesByItem = useMemo(
    () =>
      routes.reduce<Record<string, ContentRoute[]>>((accumulator, route) => {
        accumulator[route.content_item_id] = [...(accumulator[route.content_item_id] ?? []), route];
        return accumulator;
      }, {}),
    [routes],
  );
  const publishLogsByItem = useMemo(
    () =>
      publishLogs.reduce<Record<string, PublishLog[]>>((accumulator, log) => {
        accumulator[log.content_item_id] = [...(accumulator[log.content_item_id] ?? []), log];
        return accumulator;
      }, {}),
    [publishLogs],
  );
  const sortedItems = useMemo(
    () =>
      [...items].sort((left, right) => {
        const leftDate = scheduleByItem[left.id]?.scheduled_for ?? left.updated_at;
        const rightDate = scheduleByItem[right.id]?.scheduled_for ?? right.updated_at;
        return rightDate.localeCompare(leftDate);
      }),
    [items, scheduleByItem],
  );

  function togglePlatform(platform: ContentPlatform) {
    setTargetPlatforms((current) => {
      if (current.includes(platform)) {
        const next = current.filter((item) => item !== platform);
        return next.length === 0 ? current : next;
      }

      return [...current, platform];
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!project || !title.trim()) {
      return;
    }

    await onCreateContent({
      projectId: project.id,
      title: title.trim(),
      content_type: contentType,
      caption_body: captionBody.trim(),
      media_placeholder: mediaPlaceholder.trim(),
      target_platforms: targetPlatforms,
      target_route: targetRoute.trim(),
      scheduled_for: scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
      status,
    });
    setTitle("");
    setCaptionBody("");
    setMediaPlaceholder("");
    setStatus("draft");
  }

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-sky-300" aria-hidden="true" />
            <h2 className="text-base font-semibold text-zinc-50">Content Calendar</h2>
          </div>
          <p className="mt-1 text-sm text-zinc-400">{items.length} planned</p>
        </div>
        <span className="inline-flex min-h-8 items-center justify-center rounded-lg border border-zinc-700 px-3 text-xs font-medium text-zinc-300">
          {project?.name ?? "No project"}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 lg:grid-cols-2">
        <label className="block text-sm text-zinc-400" htmlFor="content-title">
          Title
          <input
            id="content-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-sky-300"
            placeholder="Content title"
          />
        </label>
        <label className="block text-sm text-zinc-400" htmlFor="content-type">
          Type
          <select
            id="content-type"
            value={contentType}
            onChange={(event) => setContentType(event.target.value as ContentType)}
            className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition focus:border-sky-300"
          >
            {contentTypes.map((type) => (
              <option key={type} value={type}>{label(type)}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-zinc-400 lg:col-span-2" htmlFor="content-body">
          Caption / Body
          <textarea
            id="content-body"
            value={captionBody}
            onChange={(event) => setCaptionBody(event.target.value)}
            className="mt-2 min-h-24 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-sky-300"
            placeholder="Caption, body, notes, or draft text"
          />
        </label>
        <label className="block text-sm text-zinc-400" htmlFor="content-media">
          Media
          <input
            id="content-media"
            value={mediaPlaceholder}
            onChange={(event) => setMediaPlaceholder(event.target.value)}
            className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-sky-300"
            placeholder="Image/video placeholder"
          />
        </label>
        <label className="block text-sm text-zinc-400" htmlFor="content-route">
          Target Page / Route
          <input
            id="content-route"
            value={targetRoute}
            onChange={(event) => setTargetRoute(event.target.value)}
            className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-sky-300"
            placeholder="/gallery/macro-insects"
          />
        </label>
        <fieldset className="rounded-lg border border-zinc-800 p-3 lg:col-span-2">
          <legend className="px-1 text-sm text-zinc-400">Target Platforms</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {platforms.map((platform) => (
              <label key={platform} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm text-zinc-200">
                <input
                  type="checkbox"
                  checked={targetPlatforms.includes(platform)}
                  onChange={() => togglePlatform(platform)}
                  className="h-4 w-4 accent-sky-300"
                />
                {label(platform)}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block text-sm text-zinc-400" htmlFor="content-schedule">
          Schedule
          <input
            id="content-schedule"
            type="datetime-local"
            value={scheduledFor}
            onChange={(event) => setScheduledFor(event.target.value)}
            className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition focus:border-sky-300"
          />
        </label>
        <label className="block text-sm text-zinc-400" htmlFor="content-status">
          Status
          <select
            id="content-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as ContentStatus)}
            className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition focus:border-sky-300"
          >
            {statuses.map((item) => (
              <option key={item} value={item}>{label(item)}</option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={!project || isSaving || !title.trim()}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-sky-300 px-3 text-sm font-semibold text-zinc-950 transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-50 lg:col-span-2"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Create Content
        </button>
      </form>

      <div className="mt-4 grid gap-3">
        {sortedItems.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-700 p-4 text-sm text-zinc-500">
            No content planned for this project.
          </div>
        ) : null}
        {sortedItems.map((item) => {
          const itemRoutes = routesByItem[item.id] ?? [];
          const schedule = scheduleByItem[item.id];
          const logs = (publishLogsByItem[item.id] ?? []).slice(0, 2);
          const aiActions: ContentAiAction[] = [
            "generate_caption",
            "generate_hashtags",
            "generate_website_title",
            "generate_story_text",
            "generate_short_post",
            "generate_alt_text",
          ];

          return (
            <article key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg border border-zinc-700 px-2 py-1 text-xs font-medium text-zinc-300">
                      {label(item.content_type)}
                    </span>
                    <span className={`rounded-lg border px-2 py-1 text-xs font-medium ${statusClass(item.status)}`}>
                      {label(item.status)}
                    </span>
                    <span className="rounded-lg border border-zinc-700 px-2 py-1 text-xs font-medium text-zinc-300">
                      {formatDateTime(schedule?.scheduled_for)}
                    </span>
                  </div>
                  <h3 className="mt-3 break-words text-lg font-semibold text-zinc-50">{item.title}</h3>
                  {item.caption_body ? <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-300">{item.caption_body}</p> : null}
                  {item.media_placeholder ? (
                    <p className="mt-2 inline-flex items-center gap-2 text-sm text-zinc-500">
                      <ImageIcon className="h-4 w-4" aria-hidden="true" />
                      {item.media_placeholder}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void onMockPublish(item.id)}
                    disabled={isSaving}
                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm font-medium text-zinc-100 transition hover:border-amber-300 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                    title="Request publish approval with the review rule"
                  >
                    <Play className="h-4 w-4" aria-hidden="true" />
                    Request Publish
                  </button>
                  <button
                    type="button"
                    onClick={() => void onBlockedDelete(item.id)}
                    disabled={isSaving}
                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-rose-400/40 px-3 text-sm font-medium text-rose-100 transition hover:border-rose-300 disabled:cursor-not-allowed disabled:opacity-50"
                    title="Delete is blocked by rules"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Delete
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {itemRoutes.map((route) => (
                  <span key={route.id} className="inline-flex min-h-8 items-center gap-2 rounded-lg border border-zinc-700 px-3 text-xs font-medium text-zinc-300">
                    {route.platform === "website" ? <Globe2 className="h-3.5 w-3.5" aria-hidden="true" /> : <Megaphone className="h-3.5 w-3.5" aria-hidden="true" />}
                    {route.route_label || route.target_route}
                  </span>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {aiActions.map((action) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => void onAiAction(item.id, action)}
                    disabled={isSaving}
                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm font-medium text-zinc-100 transition hover:border-sky-300 hover:text-sky-200 disabled:cursor-not-allowed disabled:opacity-50"
                    title={aiActionLabel(action)}
                  >
                    {action === "generate_hashtags" ? (
                      <Hash className="h-4 w-4" aria-hidden="true" />
                    ) : action === "generate_website_title" ? (
                      <FileText className="h-4 w-4" aria-hidden="true" />
                    ) : action === "generate_story_text" ? (
                      <PencilLine className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Sparkles className="h-4 w-4" aria-hidden="true" />
                    )}
                    {aiActionLabel(action)}
                  </button>
                ))}
              </div>

              {logs.length > 0 ? (
                <div className="mt-4 grid gap-2">
                  {logs.map((log) => (
                    <div key={log.id} className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3 text-sm leading-6 text-zinc-300">
                      <span className={`mr-2 rounded-md border px-2 py-1 text-xs font-medium ${statusClass(log.status)}`}>
                        {label(log.status)}
                      </span>
                      {log.details}
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
