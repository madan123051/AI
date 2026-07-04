"use client";

import { useState, type FormEvent } from "react";
import { Archive, RotateCcw, Save, Trash2, UserRoundCog } from "lucide-react";
import type { Project, ProjectMemory } from "@/lib/types";

interface ProjectMemoryPanelProps {
  project?: Project;
  memory?: ProjectMemory;
  isSaving: boolean;
  onSave: (memory: ProjectMemory) => void;
  onArchive: (projectId: string, archived: boolean) => void;
  onDelete: (projectId: string) => void;
}

function fallbackMemory(projectId: string): ProjectMemory {
  return {
    id: `draft-memory-${projectId}`,
    project_id: projectId,
    brand_tone: "Nature documentary",
    target_channels: ["Instagram", "TikTok"],
    posting_style: "Macro wildlife",
    hashtag_style: "Medium competition",
    notes: "",
    updated_at: new Date().toISOString(),
  };
}

export function ProjectMemoryPanel({ project, memory, isSaving, onSave, onArchive, onDelete }: ProjectMemoryPanelProps) {
  const [draft, setDraft] = useState<ProjectMemory | undefined>(() =>
    project ? (memory ?? fallbackMemory(project.id)) : undefined,
  );


  function updateDraft(field: keyof Pick<ProjectMemory, "brand_tone" | "posting_style" | "hashtag_style" | "notes">, value: string) {
    setDraft((current) => (current ? { ...current, [field]: value } : current));
  }

  function updateChannels(value: string) {
    setDraft((current) =>
      current
        ? {
            ...current,
            target_channels: value
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
          }
        : current,
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (draft) {
      onSave(draft);
    }
  }

  if (!project || !draft) {
    return (
      <section className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
        <div className="flex items-center gap-2 text-zinc-300">
          <UserRoundCog className="h-4 w-4 text-emerald-300" aria-hidden="true" />
          <h2 className="text-sm font-semibold uppercase tracking-normal text-zinc-400">Project Memory</h2>
        </div>
        <p className="mt-3 text-sm text-zinc-500">Create or select a project to edit brand voice.</p>
      </section>
    );
  }

  const archived = project.status === "archived";

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold uppercase tracking-normal text-zinc-400">Project Memory</h2>
          <p className="mt-1 break-words text-lg font-semibold text-zinc-50">{project.name}</p>
        </div>
        <UserRoundCog className="h-5 w-5 shrink-0 text-emerald-300" aria-hidden="true" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block text-sm text-zinc-400" htmlFor="brand-tone">Brand voice</label>
        <input
          id="brand-tone"
          value={draft.brand_tone}
          onChange={(event) => updateDraft("brand_tone", event.target.value)}
          className="min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-300"
        />

        <label className="block text-sm text-zinc-400" htmlFor="target-channels">Targets</label>
        <input
          id="target-channels"
          value={draft.target_channels.join(", ")}
          onChange={(event) => updateChannels(event.target.value)}
          className="min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-300"
        />

        <label className="block text-sm text-zinc-400" htmlFor="posting-style">Posting style</label>
        <input
          id="posting-style"
          value={draft.posting_style}
          onChange={(event) => updateDraft("posting_style", event.target.value)}
          className="min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-300"
        />

        <label className="block text-sm text-zinc-400" htmlFor="hashtag-style">Hashtag style</label>
        <input
          id="hashtag-style"
          value={draft.hashtag_style}
          onChange={(event) => updateDraft("hashtag_style", event.target.value)}
          className="min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-300"
        />

        <label className="block text-sm text-zinc-400" htmlFor="memory-notes">Notes</label>
        <textarea
          id="memory-notes"
          value={draft.notes}
          onChange={(event) => updateDraft("notes", event.target.value)}
          className="min-h-20 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-emerald-300"
        />

        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 px-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
          title="Save project memory"
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          Save Memory
        </button>
      </form>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onArchive(project.id, !archived)}
          disabled={isSaving}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm font-medium text-zinc-100 transition hover:border-amber-300 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
          title={archived ? "Restore project" : "Archive project"}
        >
          {archived ? <RotateCcw className="h-4 w-4" aria-hidden="true" /> : <Archive className="h-4 w-4" aria-hidden="true" />}
          {archived ? "Restore" : "Archive"}
        </button>
        <button
          type="button"
          onClick={() => onDelete(project.id)}
          disabled={isSaving}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-rose-500/50 px-3 text-sm font-medium text-rose-200 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
          title="Delete project"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Delete
        </button>
      </div>
    </section>
  );
}

