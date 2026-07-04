"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Archive, Box, FileText, Image as ImageIcon, Music2, Plus, RotateCcw, Video } from "lucide-react";
import type { ContentItem, MediaAsset, MediaAssetStatus, MediaAssetType, Project } from "@/lib/types";

type CreateMediaAssetInput = {
  projectId: string;
  content_item_id?: string;
  title: string;
  asset_type: MediaAssetType;
  source_url: string;
  storage_path: string;
  alt_text: string;
  tags: string[];
  status: MediaAssetStatus;
  notes: string;
};

type MediaLibraryPanelProps = {
  project?: Project;
  assets: MediaAsset[];
  contentItems: ContentItem[];
  isSaving: boolean;
  onCreateAsset: (input: CreateMediaAssetInput) => Promise<void> | void;
  onUpdateStatus: (assetId: string, status: MediaAssetStatus) => Promise<void> | void;
};

const assetTypes: MediaAssetType[] = ["image", "video", "document", "audio", "other"];
const statuses: MediaAssetStatus[] = ["available", "attached", "archived"];

function label(value: string) {
  return value
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function statusClass(status: MediaAssetStatus) {
  if (status === "attached") {
    return "border-sky-300/40 bg-sky-300/10 text-sky-100";
  }

  if (status === "archived") {
    return "border-zinc-700 bg-zinc-900 text-zinc-400";
  }

  return "border-emerald-300/40 bg-emerald-300/10 text-emerald-100";
}

function typeIcon(type: MediaAssetType) {
  if (type === "video") {
    return <Video className="h-5 w-5" aria-hidden="true" />;
  }

  if (type === "document") {
    return <FileText className="h-5 w-5" aria-hidden="true" />;
  }

  if (type === "audio") {
    return <Music2 className="h-5 w-5" aria-hidden="true" />;
  }

  if (type === "other") {
    return <Box className="h-5 w-5" aria-hidden="true" />;
  }

  return <ImageIcon className="h-5 w-5" aria-hidden="true" />;
}

function getNotes(asset: MediaAsset) {
  const notes = asset.metadata.notes;
  return typeof notes === "string" ? notes : "";
}

export function MediaLibraryPanel({
  project,
  assets,
  contentItems,
  isSaving,
  onCreateAsset,
  onUpdateStatus,
}: MediaLibraryPanelProps) {
  const [title, setTitle] = useState("");
  const [assetType, setAssetType] = useState<MediaAssetType>("image");
  const [sourceUrl, setSourceUrl] = useState("");
  const [storagePath, setStoragePath] = useState("");
  const [altText, setAltText] = useState("");
  const [tagText, setTagText] = useState("");
  const [status, setStatus] = useState<MediaAssetStatus>("available");
  const [linkedContentId, setLinkedContentId] = useState("");
  const [notes, setNotes] = useState("");
  const visibleAssets = useMemo(() => assets.filter((asset) => asset.status !== "archived"), [assets]);
  const archivedCount = assets.length - visibleAssets.length;
  const contentById = useMemo(
    () =>
      contentItems.reduce<Record<string, ContentItem>>((accumulator, item) => {
        accumulator[item.id] = item;
        return accumulator;
      }, {}),
    [contentItems],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!project || !title.trim()) {
      return;
    }

    await onCreateAsset({
      projectId: project.id,
      content_item_id: linkedContentId || undefined,
      title: title.trim(),
      asset_type: assetType,
      source_url: sourceUrl.trim(),
      storage_path: storagePath.trim(),
      alt_text: altText.trim(),
      tags: tagText
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      status,
      notes: notes.trim(),
    });
    setTitle("");
    setSourceUrl("");
    setStoragePath("");
    setAltText("");
    setTagText("");
    setStatus("available");
    setLinkedContentId("");
    setNotes("");
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
      <form onSubmit={handleSubmit} className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-emerald-300" aria-hidden="true" />
              <h2 className="text-base font-semibold text-zinc-50">Add Media</h2>
            </div>
            <p className="mt-1 truncate text-sm text-zinc-400">{project?.name ?? "No project selected"}</p>
          </div>
          <Plus className="h-4 w-4 text-emerald-300" aria-hidden="true" />
        </div>

        <label className="block text-sm text-zinc-400" htmlFor="media-title">
          Title
          <input
            id="media-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
            placeholder="Macro insect closeup"
          />
        </label>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <label className="block text-sm text-zinc-400" htmlFor="media-type">
            Type
            <select
              id="media-type"
              value={assetType}
              onChange={(event) => setAssetType(event.target.value as MediaAssetType)}
              className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-300"
            >
              {assetTypes.map((type) => (
                <option key={type} value={type}>{label(type)}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-zinc-400" htmlFor="media-status">
            Status
            <select
              id="media-status"
              value={status}
              onChange={(event) => setStatus(event.target.value as MediaAssetStatus)}
              className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-300"
            >
              {statuses.map((option) => (
                <option key={option} value={option}>{label(option)}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-3 block text-sm text-zinc-400" htmlFor="media-source">
          Source URL
          <input
            id="media-source"
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
            placeholder="https://..."
          />
        </label>

        <label className="mt-3 block text-sm text-zinc-400" htmlFor="media-path">
          Storage Path
          <input
            id="media-path"
            value={storagePath}
            onChange={(event) => setStoragePath(event.target.value)}
            className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
            placeholder="wildsaura/macro/file.jpg"
          />
        </label>

        <label className="mt-3 block text-sm text-zinc-400" htmlFor="media-alt">
          Alt Text
          <input
            id="media-alt"
            value={altText}
            onChange={(event) => setAltText(event.target.value)}
            className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
            placeholder="Short accessible description"
          />
        </label>

        <label className="mt-3 block text-sm text-zinc-400" htmlFor="media-content">
          Link To Content
          <select
            id="media-content"
            value={linkedContentId}
            onChange={(event) => setLinkedContentId(event.target.value)}
            className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-300"
          >
            <option value="">No content link</option>
            {contentItems.map((item) => (
              <option key={item.id} value={item.id}>{item.title}</option>
            ))}
          </select>
        </label>

        <label className="mt-3 block text-sm text-zinc-400" htmlFor="media-tags">
          Tags
          <input
            id="media-tags"
            value={tagText}
            onChange={(event) => setTagText(event.target.value)}
            className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
            placeholder="macro, insect, reel"
          />
        </label>

        <label className="mt-3 block text-sm text-zinc-400" htmlFor="media-notes">
          Notes
          <textarea
            id="media-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="mt-2 min-h-20 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
            placeholder="Usage notes"
          />
        </label>

        <button
          type="submit"
          disabled={!project || !title.trim() || isSaving}
          className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 px-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add Asset
        </button>
      </form>

      <div className="min-w-0">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-400">{project?.name ?? "Supabase Workspace"}</p>
            <h2 className="text-2xl font-semibold text-zinc-50">Media Library</h2>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-medium">
            <span className="rounded-lg border border-zinc-700 px-2 py-1 text-zinc-300">{visibleAssets.length} active</span>
            <span className="rounded-lg border border-zinc-700 px-2 py-1 text-zinc-300">{archivedCount} archived</span>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {assets.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-950/60 p-6 text-sm text-zinc-500 md:col-span-2 2xl:col-span-3">
              Add media assets for this project.
            </div>
          ) : null}
          {assets.map((asset) => {
            const linkedContent = asset.content_item_id ? contentById[asset.content_item_id] : undefined;
            const notesText = getNotes(asset);

            return (
              <article key={asset.id} className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
                <div className="mb-4 flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-emerald-300">
                    {typeIcon(asset.asset_type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="break-words text-base font-semibold text-zinc-50">{asset.title}</h3>
                    <p className="mt-1 text-sm text-zinc-500">{label(asset.asset_type)}</p>
                  </div>
                  <span className={`shrink-0 rounded-lg border px-2 py-1 text-xs font-medium ${statusClass(asset.status)}`}>
                    {label(asset.status)}
                  </span>
                </div>

                <div className="space-y-2 text-sm text-zinc-400">
                  {asset.source_url ? (
                    <a className="block truncate text-sky-300 hover:text-sky-200" href={asset.source_url} target="_blank" rel="noreferrer">
                      {asset.source_url}
                    </a>
                  ) : null}
                  {asset.storage_path ? <p className="break-words font-mono text-xs text-zinc-500">{asset.storage_path}</p> : null}
                  {asset.alt_text ? <p className="break-words">{asset.alt_text}</p> : null}
                  {linkedContent ? <p className="break-words text-zinc-300">Linked: {linkedContent.title}</p> : null}
                  {notesText ? <p className="break-words">{notesText}</p> : null}
                </div>

                {asset.tags.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {asset.tags.map((tag) => (
                      <span key={tag} className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300">
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => void onUpdateStatus(asset.id, asset.status === "archived" ? "available" : "archived")}
                    disabled={isSaving}
                    className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm font-medium text-zinc-100 transition hover:border-emerald-300 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {asset.status === "archived" ? <RotateCcw className="h-4 w-4" aria-hidden="true" /> : <Archive className="h-4 w-4" aria-hidden="true" />}
                    {asset.status === "archived" ? "Restore" : "Archive"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
