"use client";

import { ShieldCheck, ShieldQuestion, ShieldX } from "lucide-react";
import type { Rule } from "@/lib/types";

const effectStyles = {
  allow: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  review: "border-amber-400/50 bg-amber-400/10 text-amber-200",
  block: "border-rose-400/50 bg-rose-400/10 text-rose-200",
};

const effectLabels = {
  allow: "Safe",
  review: "Review",
  block: "Blocked",
};

const effectIcons = {
  allow: ShieldCheck,
  review: ShieldQuestion,
  block: ShieldX,
};

interface RulesPanelProps {
  rules: Rule[];
}

export function RulesPanel({ rules }: RulesPanelProps) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-normal text-zinc-400">AI Rules</h2>
          <p className="mt-1 text-lg font-semibold text-zinc-50">Safe / Review / Blocked</p>
        </div>
        <ShieldCheck className="h-5 w-5 text-emerald-300" aria-hidden="true" />
      </div>

      <div className="space-y-3">
        {rules.length === 0 ? (
          <p className="text-sm text-zinc-500">No rules loaded.</p>
        ) : (
          rules.map((rule) => {
            const Icon = effectIcons[rule.effect];

            return (
              <article key={rule.id} className="rounded-md border border-zinc-800 bg-zinc-900/80 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words text-sm font-semibold text-zinc-100">{rule.name}</h3>
                    <p className="mt-1 font-mono text-xs text-zinc-500">{rule.action}</p>
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium ${effectStyles[rule.effect]}`}>
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {effectLabels[rule.effect]}
                  </span>
                </div>
                {!rule.enabled ? <p className="mt-2 text-xs text-zinc-500">Disabled</p> : null}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
