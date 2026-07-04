"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  Archive,
  Box,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Link2,
  Music2,
  Plus,
  RotateCcw,
  Search,
  Tags,
  UploadCloud,
  Video,
} from "lucide-react";
import type { ContentItem, MediaAsset, MediaAssetStatus, MediaAssetType, MediaLinkTarget, Project } from "@/lib/types";

type CreateMediaAssetInput = {
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
const statuses: MediaAssetStatus[] = ["draft", "published", "archived"];
const linkTargets: Array<{ value: "" | MediaLinkTarget; label: string }> = [
  { value: "", label: "No link" },
  { value: "photo", label: "Photo" },
  { value: "story", label: "Story" },
  { value: "video", label: "Video" },
  { value: "content", label: "Content calendar" },
];

function label(value: string) {
  return value
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function statusClass(status: MediaAssetStatus) {
  if (status === "published") {
    return "border-emerald-300/40 bg-emerald-300/10 text-emerald-100";
  }

  if (status === "archived") {
    return "border-zinc-700 bg-zinc-900 text-zinc-400";
  }

  return "border-amber-300/40 bg-amber-300/10 text-amber-100";
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

function metadataString(asset: MediaAsset, key: string) {
  const value = asset.metadata[key];
  return typeof value === "string" ? value : "";
}

function uploadMetadata(asset: MediaAsset) {
  const value = asset.metadata.upload_metadata;
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function uploadMetadataString(asset: MediaAsset, key: string) {
  const value = uploadMetadata(asset)[key];
  return typeof value === "string" ? value : "";
}

function linkTargetLabel(target?: MediaLinkTarget) {
  if (target === "photo") {
    return "Photo";
  }

  if (target === "story") {
    return "Story";
  }

  if (target === "video") {
    return "Video";
  }

  if (target === "content") {
    return "Content";
  }

  return "Unlinked";
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
  const [status, setStatus] = useState<MediaAssetStatus>("draft");
  const [linkTarget, setLinkTarget] = useState<"" | MediaLinkTarget>("");
  const [linkedContentId, setLinkedContentId] = useState("");
  const [linkedItemId, setLinkedItemId] = useState("");
  const [linkedItemLabel, setLinkedItemLabel] = useState("");
  const [originalFilename, setOriginalFilename] = useState("");
  const [mimeType, setMimeType] = useState("");
  const [fileSize, setFileSize] = useState("");
  const [credit, setCredit] = useState("");
  const [license, setLicense] = useState("");
  const [notes, setNotes] = useState("");
  const [searchText, setSearchText] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | MediaAssetType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | MediaAssetStatus>("all");
  const [linkFilter, setLinkFilter] = useState<"all" | "unlinked" | MediaLinkTarget>("all");

  const contentById = useMemo(
    () =>
      contentItems.reduce<Record<string, ContentItem>>((accumulator, item) => {
        accumulator[item.id] = item;
        return accumulator;
      }, {}),
    [contentItems],
  );
  const counts = useMemo(
    () => ({
      total: assets.length,
      draft: assets.filter((asset) => asset.status === "draft").length,
      published: assets.filter((asset) => asset.status === "published").length,
      archived: assets.filter((asset) => asset.status === "archived").length,
    }),
    [assets],
  );
  const filteredAssets = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return assets.filter((asset) => {
      const linkedLabel = asset.linked_item_label ?? metadataString(asset, "linked_item_label");
      const searchable = [
        asset.title,
        asset.asset_type,
        asset.status,
        asset.source_url,
        asset.storage_path,
        asset.alt_text,
        asset.linked_collection ?? "",
        asset.linked_item_id ?? "",
        linkedLabel,
        ...asset.tags,
        metadataString(asset, "notes"),
        uploadMetadataString(asset, "original_filename"),
        uploadMetadataString(asset, "credit"),
      ]
        .join(" ")
        .toLowerCase();
      const assetLinkTarget = asset.linked_collection;

      return (
        (!query || searchable.includes(query)) &&
        (typeFilter === "all" || asset.asset_type === typeFilter) &&
        (statusFilter === "all" || asset.status === statusFilter) &&
        (linkFilter === "all" ||
          (linkFilter === "unlinked" ? !assetLinkTarget : assetLinkTarget === linkFilter))
      );
    });
  }, [assets, linkFilter, searchText, statusFilter, typeFilter]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!project || !title.trim()) {
      return;
    }

    const selectedContent = linkTarget === "content" && linkedContentId ? contentById[linkedContentId] : undefined;
    const finalLinkedItemId = linkTarget === "content" ? linkedContentId : linkedItemId.trim();
    const finalLinkedItemLabel = linkTarget === "content" ? selectedContent?.title ?? "" : linkedItemLabel.trim();

    await onCreateAsset({
      projectId: project.id,
      content_item_id: linkTarget === "content" ? linkedContentId || undefined : undefined,
      linked_collection: linkTarget || undefined,
      linked_item_id: finalLinkedItemId || undefined,
      linked_item_label: finalLinkedItemLabel || undefined,
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
      upload_metadata: {
        original_filename: originalFilename.trim(),
        mime_type: mimeType.trim(),
        file_size: fileSize.trim(),
        credit: credit.trim(),
        license: license.trim(),
      },
      notes: notes.trim(),
    });
    setTitle("");
    setSourceUrl("");
    setStoragePath("");
    setAltText("");
    setTagText("");
    setStatus("draft");
    setLinkTarget("");
    setLinkedContentId("");
    setLinkedItemId("");
    setLinkedItemLabel("");
    setOriginalFilename("");
    setMimeType("");
    setFileSize("");
    setCredit("");
    setLicense("");
    setNotes("");
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[400px_minmax(0,1fr)]">
      <form onSubmit={handleSubmit} className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <UploadCloud className="h-4 w-4 text-emerald-300" aria-hidden="true" />
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
            placeholder="wildsaura/media/file.jpg"
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

        <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-300">
            <Link2 className="h-4 w-4 text-sky-300" aria-hidden="true" />
            Link Target
          </div>
          <label className="block text-sm text-zinc-400" htmlFor="media-link-target">
            Target
            <select
              id="media-link-target"
              value={linkTarget}
              onChange={(event) => {
                setLinkTarget(event.target.value as "" | MediaLinkTarget);
                setLinkedContentId("");
                setLinkedItemId("");
                setLinkedItemLabel("");
              }}
              className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-300"
            >
              {linkTargets.map((target) => (
                <option key={target.value || "none"} value={target.value}>{target.label}</option>
              ))}
            </select>
          </label>

          {linkTarget === "content" ? (
            <label className="mt-3 block text-sm text-zinc-400" htmlFor="media-content">
              Content Item
              <select
                id="media-content"
                value={linkedContentId}
                onChange={(event) => setLinkedContentId(event.target.value)}
                className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-300"
              >
                <option value="">No content item</option>
                {contentItems.map((item) => (
                  <option key={item.id} value={item.id}>{item.title}</option>
                ))}
              </select>
            </label>
          ) : null}

          {linkTarget && linkTarget !== "content" ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <label className="block text-sm text-zinc-400" htmlFor="media-linked-id">
                Item ID / Slug
                <input
                  id="media-linked-id"
                  value={linkedItemId}
                  onChange={(event) => setLinkedItemId(event.target.value)}
                  className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
                  placeholder={`${linkTarget}-id-or-slug`}
                />
              </label>
              <label className="block text-sm text-zinc-400" htmlFor="media-linked-label">
                Item Label
                <input
                  id="media-linked-label"
                  value={linkedItemLabel}
                  onChange={(event) => setLinkedItemLabel(event.target.value)}
                  className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
                  placeholder={`${label(linkTarget)} title`}
                />
              </label>
            </div>
          ) : null}
        </div>

        <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-300">
            <FileText className="h-4 w-4 text-violet-300" aria-hidden="true" />
            Upload Metadata
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <label className="block text-sm text-zinc-400" htmlFor="media-original-file">
              File Name
              <input
                id="media-original-file"
                value={originalFilename}
                onChange={(event) => setOriginalFilename(event.target.value)}
                className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
                placeholder="dragonfly-closeup.jpg"
              />
            </label>
            <label className="block text-sm text-zinc-400" htmlFor="media-mime">
              MIME Type
              <input
                id="media-mime"
                value={mimeType}
                onChange={(event) => setMimeType(event.target.value)}
                className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
                placeholder="image/jpeg"
              />
            </label>
            <label className="block text-sm text-zinc-400" htmlFor="media-size">
              Size
              <input
                id="media-size"
                value={fileSize}
                onChange={(event) => setFileSize(event.target.value)}
                className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
                placeholder="2.4 MB"
              />
            </label>
            <label className="block text-sm text-zinc-400" htmlFor="media-credit">
              Credit
              <input
                id="media-credit"
                value={credit}
                onChange={(event) => setCredit(event.target.value)}
                className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
                placeholder="Wildsaura"
              />
            </label>
            <label className="block text-sm text-zinc-400 sm:col-span-2 xl:col-span-1" htmlFor="media-license">
              License
              <input
                id="media-license"
                value={license}
                onChange={(event) => setLicense(event.target.value)}
                className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
                placeholder="Internal use"
              />
            </label>
          </div>
        </div>

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
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-400">{project?.name ?? "Supabase Workspace"}</p>
            <h2 className="text-2xl font-semibold text-zinc-50">Media Library</h2>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-medium">
            <span className="rounded-lg border border-zinc-700 px-2 py-1 text-zinc-300">{counts.total} total</span>
            <span className="rounded-lg border border-amber-300/30 px-2 py-1 text-amber-100">{counts.draft} draft</span>
            <span className="rounded-lg border border-emerald-300/30 px-2 py-1 text-emerald-100">{counts.published} published</span>
            <span className="rounded-lg border border-zinc-700 px-2 py-1 text-zinc-400">{counts.archived} archived</span>
          </div>
        </div>

        <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px_160px_180px]">
          <label className="relative block text-sm text-zinc-400" htmlFor="media-search">
            <Search className="pointer-events-none absolute left-3 top-9 h-4 w-4 text-zinc-500" aria-hidden="true" />
            Search
            <input
              id="media-search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-9 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
              placeholder="Title, tag, source, linked item"
            />
          </label>
          <label className="block text-sm text-zinc-400" htmlFor="media-type-filter">
            Type
            <select
              id="media-type-filter"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as "all" | MediaAssetType)}
              className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-300"
            >
              <option value="all">All</option>
              {assetTypes.map((type) => (
                <option key={type} value={type}>{label(type)}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-zinc-400" htmlFor="media-status-filter">
            Status
            <select
              id="media-status-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "all" | MediaAssetStatus)}
              className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-300"
            >
              <option value="all">All</option>
              {statuses.map((option) => (
                <option key={option} value={option}>{label(option)}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-zinc-400" htmlFor="media-link-filter">
            Link
            <select
              id="media-link-filter"
              value={linkFilter}
              onChange={(event) => setLinkFilter(event.target.value as "all" | "unlinked" | MediaLinkTarget)}
              className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-300"
            >
              <option value="all">All</option>
              <option value="unlinked">Unlinked</option>
              <option value="photo">Photos</option>
              <option value="story">Stories</option>
              <option value="video">Videos</option>
              <option value="content">Content</option>
            </select>
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {filteredAssets.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-950/60 p-6 text-sm text-zinc-500 md:col-span-2 2xl:col-span-3">
              No media assets match this view.
            </div>
          ) : null}
          {filteredAssets.map((asset) => {
            const linkedContent = asset.content_item_id ? contentById[asset.content_item_id] : undefined;
            const notesText = metadataString(asset, "notes");
            const originalFile = uploadMetadataString(asset, "original_filename");
            const creditText = uploadMetadataString(asset, "credit");
            const licenseText = uploadMetadataString(asset, "license");
            const linkedCollection = asset.linked_collection;
            const linkedLabel = (asset.linked_item_label ?? metadataString(asset, "linked_item_label")) || linkedContent?.title;

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
                  <p className="inline-flex items-center gap-2 break-words text-zinc-300">
                    <Link2 className="h-3.5 w-3.5 text-sky-300" aria-hidden="true" />
                    {linkTargetLabel(linkedCollection)}{linkedLabel ? `: ${linkedLabel}` : ""}
                  </p>
                  {originalFile ? <p className="break-words text-xs text-zinc-500">File: {originalFile}</p> : null}
                  {creditText || licenseText ? <p className="break-words text-xs text-zinc-500">{[creditText, licenseText].filter(Boolean).join(" - ")}</p> : null}
                  {notesText ? <p className="break-words">{notesText}</p> : null}
                </div>

                {asset.tags.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {asset.tags.map((tag) => (
                      <span key={tag} className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300">
                        <Tags className="h-3 w-3" aria-hidden="true" />
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => void onUpdateStatus(asset.id, asset.status === "published" ? "draft" : "published")}
                    disabled={isSaving || asset.status === "archived"}
                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm font-medium text-zinc-100 transition hover:border-emerald-300 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    {asset.status === "published" ? "Move To Draft" : "Publish"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void onUpdateStatus(asset.id, asset.status === "archived" ? "draft" : "archived")}
                    disabled={isSaving}
                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm font-medium text-zinc-100 transition hover:border-emerald-300 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
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
