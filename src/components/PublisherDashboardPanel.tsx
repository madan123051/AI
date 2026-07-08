"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import {
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  Clock3,
  FileText,
  Filter,
  Globe2,
  Hash,
  Image as ImageIcon,
  ListChecks,
  Megaphone,
  Play,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Tags,
  Trash2,
  UploadCloud,
  Video,
  X,
} from "lucide-react";
import type { PublisherMediaAiAction } from "@/lib/db/controlCenterRepository";
import type {
  Approval,
  ContentItem,
  ContentPlatform,
  ContentRoute,
  ContentSchedule,
  ContentStatus,
  ContentType,
  MediaAsset,
  MediaAssetStatus,
  MediaAssetType,
  Project,
  ProjectMemory,
  PublishLog,
} from "@/lib/types";

export type PublisherBulkAssetInput = {
  projectId: string;
  content_item_id?: string;
  linked_collection?: "photo" | "story" | "video" | "content";
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

export type PublisherPlanRequest = {
  assetId: string;
  title: string;
  caption_body: string;
  content_type: ContentType;
  routes: Array<{
    platform: ContentPlatform;
    target_route: string;
    route_label: string;
    target_kind: string;
  }>;
  scheduled_for?: string;
  timezone: string;
  status: ContentStatus;
  requiresApproval: boolean;
};

type PublisherDashboardPanelProps = {
  project?: Project;
  memory?: ProjectMemory;
  assets: MediaAsset[];
  items: ContentItem[];
  routes: ContentRoute[];
  schedules: ContentSchedule[];
  publishLogs: PublishLog[];
  approvals: Approval[];
  isSaving: boolean;
  onBulkCreateAssets: (inputs: PublisherBulkAssetInput[]) => Promise<void> | void;
  onMediaAiAction: (assetIds: string[], action: PublisherMediaAiAction) => Promise<void> | void;
  onCreatePlans: (plans: PublisherPlanRequest[]) => Promise<void> | void;
  onRetryPublish: (itemId: string) => Promise<void> | void;
  onDeleteAsset: (assetId: string) => Promise<void> | void;
};

type DraftAsset = {
  id: string;
  file: File;
  file_name: string;
  mime_type: string;
  size: number;
  asset_type: MediaAssetType;
  preview_url: string;
  thumbnail_data_url: string;
  title: string;
  description: string;
  tags: string;
  license: string;
  credit: string;
  notes: string;
};

type MediaUploadResponse = {
  ok?: boolean;
  error?: string;
  source_url?: string;
  storage_path?: string;
  bucket?: string;
  original_filename?: string;
  mime_type?: string;
  file_size?: number;
  storage_mode?: string;
};

type PublisherRouteTarget =
  | "website_photo"
  | "website_story"
  | "website_video"
  | "instagram_post"
  | "instagram_story"
  | "facebook_post"
  | "tiktok_video";

type ScheduleMode = "publish_now" | "schedule_once" | "daily" | "weekly" | "spread_10";
type PublisherViewMode = "calendar" | "list" | "queue";

const routeTargets: Array<{
  id: PublisherRouteTarget;
  label: string;
  platform: ContentPlatform;
  target_route: string;
  route_label: string;
  target_kind: string;
}> = [
  {
    id: "website_photo",
    label: "Website Photo",
    platform: "website",
    target_route: "/gallery/photos",
    route_label: "Wildsaura website photo",
    target_kind: "website_photo",
  },
  {
    id: "website_story",
    label: "Website Story",
    platform: "website",
    target_route: "/stories",
    route_label: "Wildsaura website story",
    target_kind: "website_story",
  },
  {
    id: "website_video",
    label: "Website Video",
    platform: "website",
    target_route: "/videos",
    route_label: "Wildsaura website video",
    target_kind: "website_video",
  },
  {
    id: "instagram_post",
    label: "Instagram Post",
    platform: "instagram",
    target_route: "instagram post",
    route_label: "Instagram post",
    target_kind: "instagram_post",
  },
  {
    id: "instagram_story",
    label: "Instagram Story",
    platform: "instagram",
    target_route: "instagram story",
    route_label: "Instagram story",
    target_kind: "instagram_story",
  },
  {
    id: "facebook_post",
    label: "Facebook Post",
    platform: "facebook",
    target_route: "facebook post",
    route_label: "Facebook post",
    target_kind: "facebook_post",
  },
  {
    id: "tiktok_video",
    label: "TikTok Video",
    platform: "tiktok",
    target_route: "tiktok video",
    route_label: "TikTok video",
    target_kind: "tiktok_video",
  },
];

const aiActions: Array<{ action: PublisherMediaAiAction; label: string }> = [
  { action: "generate_caption", label: "Caption" },
  { action: "generate_hashtags", label: "Hashtags" },
  { action: "generate_website_title", label: "Web Title" },
  { action: "generate_story_text", label: "Story Text" },
  { action: "generate_short_post", label: "Short Post" },
  { action: "generate_alt_text", label: "Alt Text" },
];

function createLocalId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function safeFileName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "media-file";
}

function titleFromFileName(name: string) {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function formatBytes(size: number) {
  if (!Number.isFinite(size) || size <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const value = size / 1024 ** unitIndex;

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDateTime(iso?: string) {
  if (!iso) {
    return "Unscheduled";
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

function dateKey(iso?: string) {
  if (!iso) {
    return "Unscheduled";
  }

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "Unscheduled";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function label(value: string) {
  return value
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function contentStatusClass(status: ContentStatus | "blocked") {
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

function mediaStatusClass(status: MediaAssetStatus) {
  if (status === "published") {
    return "border-emerald-300/40 bg-emerald-300/10 text-emerald-100";
  }

  if (status === "archived") {
    return "border-zinc-700 bg-zinc-900 text-zinc-400";
  }

  return "border-amber-300/40 bg-amber-300/10 text-amber-100";
}

function executionStatusClass(status: string) {
  if (status === "executed" || status === "published") {
    return "border-emerald-300/40 bg-emerald-300/10 text-emerald-100";
  }

  if (status === "failed" || status === "blocked") {
    return "border-rose-300/40 bg-rose-300/10 text-rose-100";
  }

  if (status === "execution_pending" || status === "approval_required" || status === "pending_review") {
    return "border-amber-300/40 bg-amber-300/10 text-amber-100";
  }

  return "border-zinc-700 bg-zinc-900 text-zinc-300";
}

function metadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" ? value.trim() : "";
}

function metadataArray(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];

  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function metadataRecord(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];

  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function nestedMetadataString(metadata: Record<string, unknown>, parentKey: string, key: string) {
  return metadataString(metadataRecord(metadata, parentKey), key);
}

function renderableImageUrl(value: string) {
  return /^https?:\/\//i.test(value) || /^data:image\//i.test(value);
}

function renderableVideoUrl(value: string) {
  return /^https?:\/\//i.test(value) || /^data:video\//i.test(value);
}

function assetThumbnailUrl(asset: MediaAsset) {
  const candidates = [
    metadataString(asset.metadata, "thumbnail_data_url"),
    nestedMetadataString(asset.metadata, "upload_metadata", "thumbnail_data_url"),
    metadataString(asset.metadata, "thumbnail_url"),
    metadataString(asset.metadata, "thumbnailUrl"),
    metadataString(asset.metadata, "image_url"),
    metadataString(asset.metadata, "imageUrl"),
    asset.source_url,
  ];

  return candidates.find((candidate) => renderableImageUrl(candidate)) ?? "";
}

function assetVideoUrl(asset: MediaAsset) {
  const candidates = [
    metadataString(asset.metadata, "video_url"),
    metadataString(asset.metadata, "videoUrl"),
    asset.source_url,
  ];

  return candidates.find((candidate) => renderableVideoUrl(candidate)) ?? "";
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

async function uploadOriginalMediaFile(projectId: string, draft: DraftAsset) {
  const formData = new FormData();

  formData.set("projectId", projectId);
  formData.set("file", draft.file, draft.file_name);

  const response = await fetch("/api/media/upload", {
    method: "POST",
    body: formData,
  });
  const payload = (await response.json().catch(() => ({}))) as MediaUploadResponse;

  if (!response.ok || !payload.ok || !payload.source_url || !payload.storage_path) {
    throw new Error(payload.error || `Could not upload ${draft.file_name} to Firebase Storage.`);
  }

  return payload;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not generate image thumbnail."));
    image.src = src;
  });
}

async function createImageThumbnailDataUrl(file: File) {
  if (!file.type.startsWith("image/")) {
    return "";
  }

  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);
  const maxSide = 420;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
  const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    return "";
  }

  canvas.width = width;
  canvas.height = height;
  context.drawImage(image, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", 0.72);
}

function scheduleForMode(mode: ScheduleMode, startAt: string, index: number) {
  if (mode === "publish_now") {
    return undefined;
  }

  const base = startAt ? new Date(startAt) : new Date();

  if (Number.isNaN(base.getTime())) {
    return undefined;
  }

  if (mode === "daily" || mode === "spread_10") {
    base.setDate(base.getDate() + index);
  }

  if (mode === "weekly") {
    base.setDate(base.getDate() + index * 7);
  }

  return base.toISOString();
}

function contentTypeForRoutes(routeIds: PublisherRouteTarget[], asset: MediaAsset): ContentType {
  if (routeIds.some((routeId) => routeId.includes("story"))) {
    return "story";
  }

  if (asset.asset_type === "video" || routeIds.some((routeId) => routeId.includes("video") || routeId.includes("tiktok"))) {
    return "reel";
  }

  return "post";
}

function latestByDate<T extends { created_at: string }>(items: T[]) {
  return [...items].sort((left, right) => right.created_at.localeCompare(left.created_at))[0];
}

function approvalForItem(approvals: Approval[], itemId: string) {
  return approvals.find((approval) => approval.target_id === itemId || metadataString(approval.metadata, "content_item_id") === itemId);
}

function platformIcon(platform: ContentPlatform) {
  if (platform === "website") {
    return <Globe2 className="h-3.5 w-3.5" aria-hidden="true" />;
  }

  return <Megaphone className="h-3.5 w-3.5" aria-hidden="true" />;
}

function aiActionIcon(action: PublisherMediaAiAction) {
  if (action === "generate_hashtags") {
    return <Hash className="h-4 w-4" aria-hidden="true" />;
  }

  if (action === "generate_website_title") {
    return <FileText className="h-4 w-4" aria-hidden="true" />;
  }

  if (action === "generate_alt_text") {
    return <ImageIcon className="h-4 w-4" aria-hidden="true" />;
  }

  return <Sparkles className="h-4 w-4" aria-hidden="true" />;
}

export function PublisherDashboardPanel({
  project,
  memory,
  assets,
  items,
  routes,
  schedules,
  publishLogs,
  approvals,
  isSaving,
  onBulkCreateAssets,
  onMediaAiAction,
  onCreatePlans,
  onRetryPublish,
  onDeleteAsset,
}: PublisherDashboardPanelProps) {
  const [drafts, setDrafts] = useState<DraftAsset[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [searchText, setSearchText] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | MediaAssetType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | MediaAssetStatus>("all");
  const [platformFilter, setPlatformFilter] = useState<"all" | ContentPlatform>("all");
  const [contentStatusFilter, setContentStatusFilter] = useState<"all" | ContentStatus>("all");
  const [selectedRoutes, setSelectedRoutes] = useState<PublisherRouteTarget[]>([
    "website_photo",
    "instagram_post",
    "facebook_post",
  ]);
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("publish_now");
  const [startAt, setStartAt] = useState("");
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "local");
  const [viewMode, setViewMode] = useState<PublisherViewMode>("queue");
  const previewUrls = useRef<string[]>([]);

  useEffect(() => {
    return () => {
      previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrls.current = [];
    };
  }, []);

  const routesByItem = useMemo(
    () =>
      routes.reduce<Record<string, ContentRoute[]>>((accumulator, route) => {
        accumulator[route.content_item_id] = [...(accumulator[route.content_item_id] ?? []), route];
        return accumulator;
      }, {}),
    [routes],
  );
  const scheduleByItem = useMemo(
    () =>
      schedules.reduce<Record<string, ContentSchedule>>((accumulator, schedule) => {
        accumulator[schedule.content_item_id] = schedule;
        return accumulator;
      }, {}),
    [schedules],
  );
  const logsByItem = useMemo(
    () =>
      publishLogs.reduce<Record<string, PublishLog[]>>((accumulator, log) => {
        accumulator[log.content_item_id] = [...(accumulator[log.content_item_id] ?? []), log];
        return accumulator;
      }, {}),
    [publishLogs],
  );
  const routesByAssetId = useMemo(() => {
    const map = new Map<string, ContentRoute[]>();

    items.forEach((item) => {
      const assetId = metadataString(item.metadata, "media_asset_id");

      if (assetId) {
        map.set(assetId, routesByItem[item.id] ?? []);
      }
    });

    return map;
  }, [items, routesByItem]);
  const selectedAssets = useMemo(
    () => selectedAssetIds.map((assetId) => assets.find((asset) => asset.id === assetId)).filter((asset): asset is MediaAsset => Boolean(asset)),
    [assets, selectedAssetIds],
  );
  const counts = useMemo(
    () => ({
      assets: assets.length,
      draft: assets.filter((asset) => asset.status === "draft").length,
      scheduled: items.filter((item) => item.status === "scheduled" || item.status === "approval_required").length,
      approvals: approvals.filter((approval) => approval.status === "pending").length,
      published: items.filter((item) => item.status === "published").length,
      failed: items.filter((item) => item.status === "failed").length,
    }),
    [approvals, assets, items],
  );
  const filteredAssets = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return assets.filter((asset) => {
      const assetRoutes = routesByAssetId.get(asset.id) ?? [];
      const searchable = [
        asset.title,
        asset.asset_type,
        asset.status,
        asset.alt_text,
        asset.storage_path,
        asset.source_url,
        metadataString(asset.metadata, "notes"),
        metadataString(asset.metadata, "ai_caption"),
        metadataString(asset.metadata, "ai_short_post"),
        ...asset.tags,
        ...metadataArray(asset.metadata, "ai_hashtags"),
      ]
        .join(" ")
        .toLowerCase();

      return (
        (!query || searchable.includes(query)) &&
        (typeFilter === "all" || asset.asset_type === typeFilter) &&
        (statusFilter === "all" || asset.status === statusFilter) &&
        (platformFilter === "all" || assetRoutes.some((route) => route.platform === platformFilter))
      );
    });
  }, [assets, platformFilter, routesByAssetId, searchText, statusFilter, typeFilter]);
  const filteredItems = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return items.filter((item) => {
      const itemRoutes = routesByItem[item.id] ?? [];
      const searchable = [
        item.title,
        item.caption_body,
        item.content_type,
        item.status,
        ...itemRoutes.map((route) => `${route.platform} ${route.route_label} ${route.target_route}`),
      ]
        .join(" ")
        .toLowerCase();

      return (
        (!query || searchable.includes(query)) &&
        (contentStatusFilter === "all" || item.status === contentStatusFilter) &&
        (platformFilter === "all" || itemRoutes.some((route) => route.platform === platformFilter))
      );
    });
  }, [contentStatusFilter, items, platformFilter, routesByItem, searchText]);
  const sortedQueueItems = useMemo(
    () =>
      [...filteredItems].sort((left, right) => {
        const leftSchedule = scheduleByItem[left.id]?.scheduled_for ?? left.updated_at;
        const rightSchedule = scheduleByItem[right.id]?.scheduled_for ?? right.updated_at;
        return String(leftSchedule).localeCompare(String(rightSchedule));
      }),
    [filteredItems, scheduleByItem],
  );
  const calendarBuckets = useMemo(
    () =>
      filteredItems.reduce<Record<string, ContentItem[]>>((accumulator, item) => {
        const key = dateKey(scheduleByItem[item.id]?.scheduled_for);
        accumulator[key] = [...(accumulator[key] ?? []), item];
        return accumulator;
      }, {}),
    [filteredItems, scheduleByItem],
  );
  const selectedRouteDefinitions = selectedRoutes
    .map((routeId) => routeTargets.find((route) => route.id === routeId))
    .filter((route): route is (typeof routeTargets)[number] => Boolean(route));

  async function addFiles(files: FileList | File[]) {
    const nextDrafts = await Promise.all(Array.from(files).map(async (file) => {
      const assetType: MediaAssetType = file.type.startsWith("video/")
        ? "video"
        : file.type.startsWith("image/")
          ? "image"
          : "other";
      const previewUrl = assetType === "image" || assetType === "video" ? URL.createObjectURL(file) : "";

      if (previewUrl) {
        previewUrls.current.push(previewUrl);
      }

      return {
        id: createLocalId(),
        file,
        file_name: file.name,
        mime_type: file.type || "application/octet-stream",
        size: file.size,
        asset_type: assetType,
        preview_url: previewUrl,
        thumbnail_data_url: await createImageThumbnailDataUrl(file).catch(() => ""),
        title: titleFromFileName(file.name),
        description: "",
        tags: "",
        license: "Wildsaura",
        credit: "Wildsaura",
        notes: "",
      };
    }));

    setDrafts((current) => [...current, ...nextDrafts]);
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) {
      void addFiles(event.target.files);
      event.target.value = "";
    }
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);

    if (event.dataTransfer.files.length > 0) {
      void addFiles(event.dataTransfer.files);
    }
  }

  function updateDraft(id: string, patch: Partial<DraftAsset>) {
    setDrafts((current) => current.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)));
  }

  function removeDraft(id: string) {
    setDrafts((current) => {
      const draft = current.find((item) => item.id === id);

      if (draft?.preview_url) {
        URL.revokeObjectURL(draft.preview_url);
        previewUrls.current = previewUrls.current.filter((url) => url !== draft.preview_url);
      }

      return current.filter((item) => item.id !== id);
    });
  }

  async function handleUploadDrafts() {
    if (!project || drafts.length === 0) {
      return;
    }

    const uploadedDrafts = await Promise.all(
      drafts.map(async (draft) => ({
        draft,
        upload: await uploadOriginalMediaFile(project.id, draft),
      })),
    );

    await onBulkCreateAssets(
      uploadedDrafts.map(({ draft, upload }) => ({
        projectId: project.id,
        title: draft.title.trim() || titleFromFileName(draft.file_name),
        asset_type: draft.asset_type,
        source_url: upload.source_url ?? "",
        storage_path: upload.storage_path ?? `firebase-storage/${Date.now()}-${safeFileName(draft.file_name)}`,
        alt_text: draft.description.trim() || draft.title.trim() || draft.file_name,
        tags: splitTags(draft.tags),
        status: "draft",
        upload_metadata: {
          original_filename: upload.original_filename ?? draft.file_name,
          mime_type: upload.mime_type ?? draft.mime_type,
          file_size: String(upload.file_size ?? draft.size),
          license: draft.license.trim(),
          credit: draft.credit.trim(),
          storage_mode: upload.storage_mode ?? "firebase_storage",
          firebase_storage_bucket: upload.bucket ?? "",
          firebase_storage_path: upload.storage_path ?? "",
          public_url: upload.source_url ?? "",
          thumbnail_data_url: draft.thumbnail_data_url,
          thumbnail_kind: draft.thumbnail_data_url ? "client_generated" : "",
        },
        notes: draft.notes.trim(),
      })),
    );
    drafts.forEach((draft) => {
      if (draft.preview_url) {
        URL.revokeObjectURL(draft.preview_url);
      }
    });
    previewUrls.current = previewUrls.current.filter((url) => drafts.every((draft) => draft.preview_url !== url));
    setDrafts([]);
  }

  function toggleAsset(assetId: string) {
    setSelectedAssetIds((current) =>
      current.includes(assetId) ? current.filter((id) => id !== assetId) : [...current, assetId],
    );
  }

  function toggleRoute(routeId: PublisherRouteTarget) {
    setSelectedRoutes((current) => {
      if (current.includes(routeId)) {
        const next = current.filter((id) => id !== routeId);
        return next.length > 0 ? next : current;
      }

      return [...current, routeId];
    });
  }

  async function handleCreatePlans() {
    if (selectedAssets.length === 0 || selectedRouteDefinitions.length === 0) {
      return;
    }

    await onCreatePlans(
      selectedAssets.map((asset, index) => {
        const caption =
          metadataString(asset.metadata, "ai_caption") ||
          metadataString(asset.metadata, "ai_short_post") ||
          metadataString(asset.metadata, "ai_story_text") ||
          asset.alt_text ||
          metadataString(asset.metadata, "notes") ||
          asset.title;
        const title = metadataString(asset.metadata, "ai_website_title") || asset.title;

        return {
          assetId: asset.id,
          title,
          caption_body: caption,
          content_type: contentTypeForRoutes(selectedRoutes, asset),
          routes: selectedRouteDefinitions.map((route) => ({
            platform: route.platform,
            target_route: route.target_route,
            route_label: route.route_label,
            target_kind: route.target_kind,
          })),
          scheduled_for: scheduleForMode(scheduleMode, startAt, index),
          timezone,
          status: scheduleMode === "publish_now" ? "approval_required" : "scheduled",
          requiresApproval: true,
        };
      }),
    );
  }

  function selectFilteredAssets() {
    setSelectedAssetIds(filteredAssets.map((asset) => asset.id));
  }

  function clearSelection() {
    setSelectedAssetIds([]);
  }

  async function handleDeleteAsset(asset: MediaAsset) {
    const linkedRoutes = routesByAssetId.get(asset.id) ?? [];
    const confirmed = window.confirm(
      linkedRoutes.length > 0
        ? `Remove "${asset.title}"? Linked unpublished publisher drafts/routes for this media will also be removed.`
        : `Remove "${asset.title}" from the media dashboard?`,
    );

    if (!confirmed) {
      return;
    }

    await onDeleteAsset(asset.id);
    setSelectedAssetIds((current) => current.filter((assetId) => assetId !== asset.id));
  }

  return (
    <section className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
          <p className="text-sm text-zinc-400">Media Assets</p>
          <p className="mt-3 text-3xl font-semibold text-zinc-50">{counts.assets}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
          <p className="text-sm text-zinc-400">Draft Assets</p>
          <p className="mt-3 text-3xl font-semibold text-zinc-50">{counts.draft}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
          <p className="text-sm text-zinc-400">Queued Posts</p>
          <p className="mt-3 text-3xl font-semibold text-zinc-50">{counts.scheduled}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
          <p className="text-sm text-zinc-400">Review Needed</p>
          <p className="mt-3 text-3xl font-semibold text-zinc-50">{counts.approvals}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
          <p className="text-sm text-zinc-400">Published</p>
          <p className="mt-3 text-3xl font-semibold text-zinc-50">{counts.published}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
          <p className="text-sm text-zinc-400">Failed</p>
          <p className="mt-3 text-3xl font-semibold text-zinc-50">{counts.failed}</p>
        </div>
      </div>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_420px]">
        <div className="grid gap-5">
          <article className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <UploadCloud className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                  <h2 className="text-base font-semibold text-zinc-50">Upload Dashboard</h2>
                </div>
                <p className="mt-1 text-sm text-zinc-400">{project?.name ?? "Select a project"} media pipeline</p>
              </div>
              <span className="inline-flex min-h-8 items-center justify-center rounded-lg border border-zinc-700 px-3 text-xs font-medium text-zinc-300">
                Firebase Storage originals
              </span>
            </div>

            <label
              htmlFor="publisher-upload"
              onDragEnter={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`mt-4 flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center transition ${
                isDragging ? "border-emerald-300 bg-emerald-300/10" : "border-zinc-700 bg-zinc-900/40 hover:border-emerald-300/70"
              }`}
            >
              <UploadCloud className="h-8 w-8 text-emerald-300" aria-hidden="true" />
              <span className="mt-3 text-sm font-semibold text-zinc-100">Drop photos or videos here</span>
              <span className="mt-1 text-sm text-zinc-500">Multi-file upload, 10+ files supported</span>
              <input
                id="publisher-upload"
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={handleFileInput}
                className="sr-only"
                disabled={!project || isSaving}
              />
            </label>

            {drafts.length > 0 ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {drafts.map((draft) => (
                  <article key={draft.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                    <div className="flex gap-3">
                      <div
                        className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 bg-cover bg-center text-zinc-400"
                        style={draft.asset_type === "image" && draft.preview_url ? { backgroundImage: `url(${draft.preview_url})` } : undefined}
                      >
                        {draft.asset_type === "video" && draft.preview_url ? (
                          <video src={draft.preview_url} className="h-full w-full object-cover" muted playsInline />
                        ) : null}
                        {draft.asset_type !== "image" && draft.asset_type !== "video" ? <FileText className="h-6 w-6" aria-hidden="true" /> : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-zinc-100">{draft.file_name}</p>
                            <p className="mt-1 text-xs text-zinc-500">{formatBytes(draft.size)}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeDraft(draft.id)}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-700 text-zinc-400 transition hover:border-rose-300 hover:text-rose-100"
                            aria-label={`Remove ${draft.file_name}`}
                          >
                            <X className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                        <span className="mt-2 inline-flex rounded-lg border border-zinc-700 px-2 py-1 text-xs font-medium text-zinc-300">
                          {draft.asset_type === "image" ? "Photo" : label(draft.asset_type)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2">
                      <input
                        value={draft.title}
                        onChange={(event) => updateDraft(draft.id, { title: event.target.value })}
                        className="min-h-10 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
                        placeholder="Title"
                      />
                      <textarea
                        value={draft.description}
                        onChange={(event) => updateDraft(draft.id, { description: event.target.value })}
                        className="min-h-20 resize-y rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
                        placeholder="Description or alt text"
                      />
                      <input
                        value={draft.tags}
                        onChange={(event) => updateDraft(draft.id, { tags: event.target.value })}
                        className="min-h-10 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
                        placeholder="Tags, comma separated"
                      />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input
                          value={draft.license}
                          onChange={(event) => updateDraft(draft.id, { license: event.target.value })}
                          className="min-h-10 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
                          placeholder="License"
                        />
                        <input
                          value={draft.credit}
                          onChange={(event) => updateDraft(draft.id, { credit: event.target.value })}
                          className="min-h-10 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
                          placeholder="Credit"
                        />
                      </div>
                      <textarea
                        value={draft.notes}
                        onChange={(event) => updateDraft(draft.id, { notes: event.target.value })}
                        className="min-h-16 resize-y rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
                        placeholder="Internal notes"
                      />
                    </div>
                  </article>
                ))}
              </div>
            ) : null}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-zinc-500">{drafts.length} file(s) staged</p>
              <button
                type="button"
                onClick={() => void handleUploadDrafts()}
                disabled={!project || isSaving || drafts.length === 0}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-400 px-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Upload & Save Media
              </button>
            </div>
          </article>

          <article className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-sky-300" aria-hidden="true" />
                  <h2 className="text-base font-semibold text-zinc-50">Media Workspace</h2>
                </div>
                <p className="mt-1 text-sm text-zinc-400">{selectedAssetIds.length} selected</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={selectFilteredAssets}
                  disabled={filteredAssets.length === 0}
                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm font-medium text-zinc-100 transition hover:border-sky-300 hover:text-sky-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CheckSquare className="h-4 w-4" aria-hidden="true" />
                  Select Filtered
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  disabled={selectedAssetIds.length === 0}
                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm font-medium text-zinc-100 transition hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                  Clear
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px_180px_180px]">
              <label className="relative block" htmlFor="publisher-search">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
                <input
                  id="publisher-search"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  className="min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 pl-10 pr-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-sky-300"
                  placeholder="Search publisher assets"
                />
              </label>
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as "all" | MediaAssetType)}
                className="min-h-10 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition focus:border-sky-300"
                aria-label="Filter by media type"
              >
                <option value="all">All Types</option>
                <option value="image">Photos</option>
                <option value="video">Videos</option>
                <option value="other">Other</option>
              </select>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as "all" | MediaAssetStatus)}
                className="min-h-10 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition focus:border-sky-300"
                aria-label="Filter by media status"
              >
                <option value="all">All Asset Status</option>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
              <select
                value={platformFilter}
                onChange={(event) => setPlatformFilter(event.target.value as "all" | ContentPlatform)}
                className="min-h-10 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition focus:border-sky-300"
                aria-label="Filter by platform"
              >
                <option value="all">All Platforms</option>
                <option value="website">Website</option>
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
                <option value="tiktok">TikTok</option>
              </select>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {aiActions.map((item) => (
                <button
                  key={item.action}
                  type="button"
                  onClick={() => void onMediaAiAction(selectedAssetIds, item.action)}
                  disabled={isSaving || selectedAssetIds.length === 0}
                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm font-medium text-zinc-100 transition hover:border-emerald-300 hover:text-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
                  title={`Generate ${item.label}`}
                >
                  {aiActionIcon(item.action)}
                  {item.label}
                </button>
              ))}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {filteredAssets.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-700 p-5 text-sm text-zinc-500 md:col-span-2 2xl:col-span-3">
                  No media assets match the current filters.
                </div>
              ) : null}
              {filteredAssets.map((asset) => {
                const checked = selectedAssetIds.includes(asset.id);
                const assetRoutes = routesByAssetId.get(asset.id) ?? [];
                const caption = metadataString(asset.metadata, "ai_caption");
                const shortPost = metadataString(asset.metadata, "ai_short_post");
                const hashtags = metadataArray(asset.metadata, "ai_hashtags");
                const thumbnailUrl = assetThumbnailUrl(asset);
                const videoUrl = asset.asset_type === "video" ? assetVideoUrl(asset) : "";

                return (
                  <article
                    key={asset.id}
                    className={`rounded-lg border p-4 transition ${checked ? "border-emerald-300/70 bg-emerald-300/10" : "border-zinc-800 bg-zinc-950"}`}
                  >
                    <div className="flex items-start gap-3">
                      <label className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center" aria-label={`Select ${asset.title}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAsset(asset.id)}
                          className="h-4 w-4 accent-emerald-300"
                        />
                      </label>
                      <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-400">
                        {thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumbnailUrl} alt={asset.alt_text || asset.title} className="h-full w-full object-cover" loading="lazy" />
                        ) : videoUrl ? (
                          <video src={videoUrl} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                        ) : asset.asset_type === "video" ? (
                          <Video className="h-6 w-6" aria-hidden="true" />
                        ) : (
                          <ImageIcon className="h-6 w-6" aria-hidden="true" />
                        )}
                        {asset.asset_type === "video" ? (
                          <span className="absolute bottom-1 right-1 rounded-md bg-zinc-950/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-zinc-100">
                            Video
                          </span>
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-lg border px-2 py-1 text-xs font-medium ${mediaStatusClass(asset.status)}`}>
                            {label(asset.status)}
                          </span>
                          <span className="rounded-lg border border-zinc-700 px-2 py-1 text-xs font-medium text-zinc-300">
                            {asset.asset_type === "image" ? "Photo" : label(asset.asset_type)}
                          </span>
                        </div>
                        <h3 className="mt-2 break-words text-sm font-semibold text-zinc-50">{asset.title}</h3>
                        <p className="mt-1 line-clamp-2 text-sm leading-6 text-zinc-400">{asset.alt_text || metadataString(asset.metadata, "notes") || "No description"}</p>
                      </div>
                    </div>
                    {asset.tags.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {asset.tags.slice(0, 5).map((tag) => (
                          <span key={tag} className="inline-flex items-center gap-1 rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-400">
                            <Tags className="h-3 w-3" aria-hidden="true" />
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {assetRoutes.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {assetRoutes.map((route) => (
                          <span key={route.id} className="inline-flex min-h-7 items-center gap-2 rounded-lg border border-zinc-700 px-2 text-xs font-medium text-zinc-300">
                            {platformIcon(route.platform)}
                            {route.route_label}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {caption || shortPost || hashtags.length > 0 ? (
                      <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-xs leading-5 text-zinc-300">
                        {caption ? <p className="break-words">{caption}</p> : null}
                        {!caption && shortPost ? <p className="break-words">{shortPost}</p> : null}
                        {hashtags.length > 0 ? <p className="mt-2 break-words text-sky-200">{hashtags.map((tag) => `#${tag.replace(/^#/, "")}`).join(" ")}</p> : null}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void handleDeleteAsset(asset)}
                      disabled={isSaving}
                      className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-rose-400/40 px-3 text-sm font-medium text-rose-100 transition hover:border-rose-300 hover:bg-rose-300/10 disabled:cursor-not-allowed disabled:opacity-50"
                      title="Remove saved media asset"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Remove Asset
                    </button>
                  </article>
                );
              })}
            </div>
          </article>
        </div>

        <aside className="grid gap-5 content-start">
          <article className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4 text-emerald-300" aria-hidden="true" />
              <h2 className="text-base font-semibold text-zinc-50">Routing and Schedule</h2>
            </div>
            <p className="mt-1 text-sm text-zinc-400">{memory?.brand_tone || "Wildsaura"} content review flow</p>

            <fieldset className="mt-4 rounded-lg border border-zinc-800 p-3">
              <legend className="px-1 text-sm text-zinc-400">Routes</legend>
              <div className="mt-2 grid gap-2">
                {routeTargets.map((route) => (
                  <label key={route.id} className="flex min-h-10 items-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm text-zinc-200">
                    <input
                      type="checkbox"
                      checked={selectedRoutes.includes(route.id)}
                      onChange={() => toggleRoute(route.id)}
                      className="h-4 w-4 accent-emerald-300"
                    />
                    {platformIcon(route.platform)}
                    <span>{route.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="mt-4 block text-sm text-zinc-400" htmlFor="publisher-schedule-mode">
              Schedule Mode
              <select
                id="publisher-schedule-mode"
                value={scheduleMode}
                onChange={(event) => setScheduleMode(event.target.value as ScheduleMode)}
                className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-300"
              >
                <option value="publish_now">Publish now after approval</option>
                <option value="schedule_once">Schedule date/time</option>
                <option value="daily">Daily schedule</option>
                <option value="weekly">Weekly schedule</option>
                <option value="spread_10">Auto spread over days</option>
              </select>
            </label>
            <label className="mt-3 block text-sm text-zinc-400" htmlFor="publisher-start-at">
              Start Date/Time
              <input
                id="publisher-start-at"
                type="datetime-local"
                value={startAt}
                onChange={(event) => setStartAt(event.target.value)}
                className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-300"
              />
            </label>
            <label className="mt-3 block text-sm text-zinc-400" htmlFor="publisher-timezone">
              Timezone
              <input
                id="publisher-timezone"
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                className="mt-2 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
                placeholder="Asia/Tokyo"
              />
            </label>

            <div className="mt-4 rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-sm leading-6 text-amber-100">
              AI content and publish actions are routed to approvals before any external connector runs.
            </div>

            <button
              type="button"
              onClick={() => void handleCreatePlans()}
              disabled={isSaving || selectedAssets.length === 0 || selectedRouteDefinitions.length === 0}
              className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 px-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              Create Publisher Plans
            </button>
          </article>

          <article className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-sky-300" aria-hidden="true" />
              <h2 className="text-base font-semibold text-zinc-50">Publish Queue</h2>
            </div>
            <div className="mt-4 grid gap-3">
              {sortedQueueItems.slice(0, 6).length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-700 p-4 text-sm text-zinc-500">
                  No queued posts yet.
                </div>
              ) : null}
              {sortedQueueItems.slice(0, 6).map((item) => {
                const schedule = scheduleByItem[item.id];
                const itemRoutes = routesByItem[item.id] ?? [];
                const latestLog = latestByDate(logsByItem[item.id] ?? []);
                const approval = approvalForItem(approvals, item.id);
                const executionStatus = approval?.execution_status ?? latestLog?.status ?? item.status;
                const canRetry = latestLog?.status === "failed" || latestLog?.status === "blocked" || item.status === "failed";

                return (
                  <article key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="break-words text-sm font-semibold text-zinc-50">{item.title}</h3>
                        <p className="mt-1 text-xs text-zinc-500">{formatDateTime(schedule?.scheduled_for)}</p>
                      </div>
                      <span className={`shrink-0 rounded-lg border px-2 py-1 text-xs font-medium ${executionStatusClass(executionStatus)}`}>
                        {label(executionStatus)}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {itemRoutes.map((route) => (
                        <span key={route.id} className="inline-flex min-h-7 items-center gap-2 rounded-lg border border-zinc-700 px-2 text-xs font-medium text-zinc-300">
                          {platformIcon(route.platform)}
                          {route.route_label}
                        </span>
                      ))}
                    </div>
                    {latestLog ? <p className="mt-3 text-xs leading-5 text-zinc-400">{latestLog.details}</p> : null}
                    {canRetry ? (
                      <button
                        type="button"
                        onClick={() => void onRetryPublish(item.id)}
                        disabled={isSaving}
                        className="mt-3 inline-flex min-h-8 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 text-xs font-medium text-zinc-100 transition hover:border-amber-300 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                        Retry Publish
                      </button>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </article>
        </aside>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-violet-300" aria-hidden="true" />
              <h2 className="text-base font-semibold text-zinc-50">Content Calendar</h2>
            </div>
            <p className="mt-1 text-sm text-zinc-400">{filteredItems.length} publisher item(s)</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["calendar", "list", "queue"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition ${
                  viewMode === mode
                    ? "border-violet-300 bg-violet-300/10 text-violet-100"
                    : "border-zinc-700 text-zinc-300 hover:border-violet-300 hover:text-violet-100"
                }`}
              >
                {mode === "calendar" ? <CalendarDays className="h-4 w-4" aria-hidden="true" /> : mode === "queue" ? <Clock3 className="h-4 w-4" aria-hidden="true" /> : <Filter className="h-4 w-4" aria-hidden="true" />}
                {label(mode)}
              </button>
            ))}
            <select
              value={contentStatusFilter}
              onChange={(event) => setContentStatusFilter(event.target.value as "all" | ContentStatus)}
              className="min-h-9 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition focus:border-violet-300"
              aria-label="Filter publisher content status"
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="scheduled">Scheduled</option>
              <option value="approval_required">Approval Required</option>
              <option value="approved">Approved</option>
              <option value="published">Published</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>

        {viewMode === "calendar" ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {Object.entries(calendarBuckets).length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-700 p-5 text-sm text-zinc-500 md:col-span-2 xl:col-span-4">
                No scheduled content yet.
              </div>
            ) : null}
            {Object.entries(calendarBuckets).map(([bucket, bucketItems]) => (
              <article key={bucket} className="min-h-48 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <h3 className="text-sm font-semibold text-zinc-100">{bucket}</h3>
                <div className="mt-3 grid gap-2">
                  {bucketItems.map((item) => (
                    <div key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                      <p className="break-words text-sm font-medium text-zinc-100">{item.title}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className={`rounded-lg border px-2 py-1 text-xs font-medium ${contentStatusClass(item.status)}`}>
                          {label(item.status)}
                        </span>
                        {(routesByItem[item.id] ?? []).slice(0, 2).map((route) => (
                          <span key={route.id} className="inline-flex min-h-7 items-center gap-2 rounded-lg border border-zinc-700 px-2 text-xs font-medium text-zinc-300">
                            {platformIcon(route.platform)}
                            {route.platform}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {viewMode !== "calendar" ? (
          <div className="mt-4 grid gap-3">
            {sortedQueueItems.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-700 p-5 text-sm text-zinc-500">
                No publisher items match the current filters.
              </div>
            ) : null}
            {sortedQueueItems.map((item) => {
              const itemRoutes = routesByItem[item.id] ?? [];
              const schedule = scheduleByItem[item.id];
              const latestLog = latestByDate(logsByItem[item.id] ?? []);
              const approval = approvalForItem(approvals, item.id);
              const executionStatus = approval?.execution_status ?? latestLog?.status ?? item.status;
              const sourceAsset = metadataString(item.metadata, "media_asset_id");

              return (
                <article key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-lg border border-zinc-700 px-2 py-1 text-xs font-medium text-zinc-300">
                          {label(item.content_type)}
                        </span>
                        <span className={`rounded-lg border px-2 py-1 text-xs font-medium ${contentStatusClass(item.status)}`}>
                          {label(item.status)}
                        </span>
                        <span className={`rounded-lg border px-2 py-1 text-xs font-medium ${executionStatusClass(executionStatus)}`}>
                          {label(executionStatus)}
                        </span>
                        <span className="rounded-lg border border-zinc-700 px-2 py-1 text-xs font-medium text-zinc-300">
                          {formatDateTime(schedule?.scheduled_for)}
                        </span>
                      </div>
                      <h3 className="mt-3 break-words text-lg font-semibold text-zinc-50">{item.title}</h3>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-300">{item.caption_body}</p>
                      <p className="mt-3 text-xs text-zinc-500">
                        Source asset: {sourceAsset ? assets.find((asset) => asset.id === sourceAsset)?.title ?? sourceAsset : "Manual content"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void onRetryPublish(item.id)}
                        disabled={isSaving}
                        className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm font-medium text-zinc-100 transition hover:border-amber-300 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                        title="Request publish approval or retry mock publish"
                      >
                        <Play className="h-4 w-4" aria-hidden="true" />
                        Request Review
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {itemRoutes.map((route) => (
                      <span key={route.id} className="inline-flex min-h-8 items-center gap-2 rounded-lg border border-zinc-700 px-3 text-xs font-medium text-zinc-300">
                        {platformIcon(route.platform)}
                        {route.route_label || route.target_route}
                      </span>
                    ))}
                  </div>
                  {latestLog ? (
                    <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/70 p-3 text-sm leading-6 text-zinc-300">
                      <span className={`mr-2 rounded-md border px-2 py-1 text-xs font-medium ${contentStatusClass(latestLog.status)}`}>
                        {label(latestLog.status)}
                      </span>
                      {latestLog.details}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : null}
      </section>
    </section>
  );
}
