"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Search } from "lucide-react";

export type SearchEntry = {
  id: string;
  type: string;
  title: string;
  detail: string;
  href: string;
  onSelect?: () => void;
};

function normalize(value: string) {
  return value.toLowerCase().trim();
}

function scoreEntry(entry: SearchEntry, query: string) {
  const title = normalize(entry.title);
  const type = normalize(entry.type);
  const detail = normalize(entry.detail);
  const haystack = `${type} ${title} ${detail}`;

  if (!haystack.includes(query)) {
    return Number.POSITIVE_INFINITY;
  }

  if (title.startsWith(query)) {
    return 0;
  }

  if (title.includes(query)) {
    return 1;
  }

  if (type.includes(query)) {
    return 2;
  }

  return 3;
}

export function GlobalSearch({ entries, inputId = "global-search" }: { entries: SearchEntry[]; inputId?: string }) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const normalizedQuery = normalize(query);
  const resultsId = `${inputId}-results`;
  const results = useMemo(() => {
    if (!normalizedQuery) {
      return [];
    }

    return entries
      .map((entry) => ({ entry, score: scoreEntry(entry, normalizedQuery) }))
      .filter((result) => Number.isFinite(result.score))
      .sort((first, second) => first.score - second.score || first.entry.title.localeCompare(second.entry.title))
      .map((result) => result.entry)
      .slice(0, 8);
  }, [entries, normalizedQuery]);

  function closeSearch() {
    setIsOpen(false);
    setQuery("");
  }

  return (
    <div className="relative min-w-0 flex-1">
      <label className="sr-only" htmlFor={inputId}>
        Global Search
      </label>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
      <input
        id={inputId}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setIsOpen(false);
            event.currentTarget.blur();
          }
        }}
        role="combobox"
        aria-expanded={isOpen && Boolean(normalizedQuery)}
        aria-controls={resultsId}
        aria-autocomplete="list"
        className="min-h-10 w-full rounded-lg border border-zinc-800 bg-zinc-900/80 pl-9 pr-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
        placeholder="Search projects, tasks, inbox, content, media"
      />
      {isOpen && normalizedQuery ? (
        <div
          id={resultsId}
          role="listbox"
          aria-label="Global search results"
          className="absolute left-0 right-0 top-12 z-50 max-h-96 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-2 shadow-2xl shadow-black/40"
        >
          {results.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-800 p-3 text-sm text-zinc-500" role="status">
              No results found.
            </div>
          ) : null}
          {results.map((entry) => (
            <Link
              key={entry.id}
              href={entry.href}
              onClick={() => {
                entry.onSelect?.();
                closeSearch();
              }}
              role="option"
              aria-selected="false"
              className="group flex min-h-12 items-center gap-3 rounded-lg px-3 py-2 text-sm transition hover:bg-zinc-900"
            >
              <span className="inline-flex shrink-0 rounded-lg border border-zinc-700 px-2 py-1 text-[11px] font-medium uppercase text-zinc-400">
                {entry.type}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-zinc-100">{entry.title}</span>
                <span className="mt-0.5 block truncate text-xs text-zinc-500">{entry.detail}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-zinc-600 transition group-hover:text-emerald-300" aria-hidden="true" />
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
