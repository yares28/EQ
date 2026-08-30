"use client";

import { useQuery } from "convex/react";
import { CheckCircle, Clock, Warning } from "@/components/eq/icon";

import { api } from "@/convex/_generated/api";

function ageLabel(ageMs: number | null): string {
  if (ageMs === null) return "never";
  const hours = Math.floor(ageMs / (60 * 60_000));
  if (hours < 1) return "under an hour ago";
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const STATE_LABELS = {
  current: "Current",
  aging: "Aging",
  stale: "Stale",
  never_succeeded: "Never succeeded",
  disabled: "Disabled",
} as const;

export function SourceHealthSummary() {
  const summary = useQuery(api.sourceMaintenance.operatorHealthSummary);

  if (summary === undefined) {
    return (
      <section className="border-b border-foreground/10 py-5">
        <p className="text-xs text-muted-foreground">Checking source refresh health…</p>
      </section>
    );
  }

  const attention = summary.rows.filter(
    (row) => row.state === "stale" || row.state === "never_succeeded" || row.state === "aging",
  );

  return (
    <section className="border-b border-foreground/10 py-5">
      <div className="flex items-start gap-3">
        <span
          className={`grid size-8 shrink-0 place-items-center rounded-full ${
            summary.releaseReady ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
          }`}
        >
          {summary.releaseReady ? (
            <CheckCircle className="size-4" weight="regular" />
          ) : (
            <Warning className="size-4" weight="regular" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">
            {summary.releaseReady ? "Sources are release ready" : "Sources are blocking a release"}
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            {summary.headline}
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            <span className="tabular">{summary.current} current</span>
            <span className="tabular">{summary.aging} aging</span>
            <span className="tabular">{summary.stale} stale</span>
            <span className="tabular">{summary.neverSucceeded} never succeeded</span>
            <span className="tabular">{summary.disabled} disabled</span>
          </p>

          {attention.length > 0 && (
            <ul className="mt-3 space-y-1.5 border-t border-foreground/10 pt-3">
              {attention.map((row) => (
                <li key={row.key} className="flex items-start gap-2 text-[11px] leading-4">
                  <Clock
                    className={`mt-0.5 size-3 shrink-0 ${
                      row.blocksRelease ? "text-destructive" : "text-warning"
                    }`}
                  />
                  <span className="min-w-0">
                    <span className="font-semibold text-foreground">{row.name}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {STATE_LABELS[row.state]} · last success {ageLabel(row.ageMs)} · {row.note}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
