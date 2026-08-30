"use client";

import type { Job, ScoreKey } from "@/lib/types";
import { SCORE_DEFINITIONS, SCORE_KEYS, SCORE_LABELS } from "@/lib/score";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function ScoreGauges({ job }: { job: Job }) {
  return (
    <TooltipProvider delay={100}>
      <div className="grid grid-cols-5 gap-2">
        {SCORE_KEYS.map((key: ScoreKey) => {
          const score = job.scores[key];
          const approx = score?.provenance === "deduced";
          const verified = score?.provenance === "verified";
          return (
            <Tooltip key={key}>
              <TooltipTrigger
                render={
                  <div className="min-w-0 cursor-default rounded-md px-1 py-1 transition-colors hover:bg-foreground/[0.035]" />
                }
              >
                <div className="flex items-end justify-between gap-1">
                  <span className="truncate text-[9px] font-semibold uppercase text-muted-foreground">
                    {SCORE_LABELS[key]}
                  </span>
                  <span className="text-[11px] font-bold tabular">
                    {score ? `${approx ? "≈" : ""}${score.value}` : "—"}
                  </span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded bg-foreground/[0.07]">
                  {score && (
                    <div
                      className={`h-full rounded ${
                        verified ? "bg-primary" : "bg-muted-foreground/45"
                      }`}
                      style={{ width: `${score.value}%` }}
                    />
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-64">
                <p className="text-xs font-medium">{SCORE_DEFINITIONS[key]}</p>
                {score && (
                  <>
                    <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-60">
                      {score.provenance === "verified"
                        ? "Verified"
                        : score.provenance === "deduced"
                          ? "≈ Deduced"
                          : score.provenance}
                      {" · confidence ±"}
                      {score.band}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed opacity-90">
                      {score.rationale}
                    </p>
                  </>
                )}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
