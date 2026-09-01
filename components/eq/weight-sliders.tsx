"use client";

import NumberFlow from "@number-flow/react";
import type { Weights, ScoreKey } from "@/lib/types";
import { DEFAULT_WEIGHTS, normalizeWeights, SCORE_KEYS, SCORE_LABELS } from "@/lib/score";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { ArrowCounterClockwise, SlidersHorizontal } from "@/components/eq/icon";

export function WeightSliders({
  weights,
  onChange,
  variant = "panel",
}: {
  weights: Weights;
  onChange: (w: Weights) => void;
  variant?: "panel" | "popover";
}) {
  const normalized = normalizeWeights(weights);

  function setWeight(key: ScoreKey, val: number | readonly number[]) {
    const v = Array.isArray(val) ? val[0] : (val as number);
    onChange({ ...weights, [key]: v });
  }

  const header = (
    <div className="flex items-center gap-2">
      <SlidersHorizontal className="size-4 text-primary" />
      <h2 className="text-[13px] font-semibold tracking-tight">Rank weights</h2>
      {variant === "panel" && (
        <p className="text-xs text-muted-foreground max-sm:hidden">
          — drag to re-rank the whole list live
        </p>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto h-7 rounded-lg px-2 text-[11px] text-muted-foreground hover:text-foreground"
        onClick={() => onChange({ ...DEFAULT_WEIGHTS })}
      >
        <ArrowCounterClockwise className="size-3" weight="regular" /> Reset
      </Button>
    </div>
  );

  if (variant === "popover") {
    return (
      <div className="flex flex-col gap-3">
        {header}
        <div className="flex flex-col gap-3">
          {SCORE_KEYS.map((key: ScoreKey) => (
            <div key={key} className="flex items-center gap-3">
              <span className="w-11 shrink-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                {SCORE_LABELS[key]}
              </span>
              <Slider
                value={[weights[key]]}
                min={0}
                max={50}
                step={1}
                className="flex-1"
                onValueChange={(v) => setWeight(key, v)}
                aria-label={`${SCORE_LABELS[key]} weight`}
              />
              <span className="w-9 shrink-0 text-right text-xs font-semibold tabular">
                <NumberFlow value={normalized[key]} format={{ maximumFractionDigits: 0 }} />%
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-muted/40 p-4">
      <div className="mb-3.5">{header}</div>
      <div className="grid grid-cols-5 gap-x-5 gap-y-4 max-md:grid-cols-3 max-sm:grid-cols-2">
        {SCORE_KEYS.map((key: ScoreKey) => (
          <div key={key}>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {SCORE_LABELS[key]}
              </span>
              <span className="text-xs font-semibold tabular">
                <NumberFlow value={normalized[key]} format={{ maximumFractionDigits: 0 }} />%
              </span>
            </div>
            <Slider
              value={[weights[key]]}
              min={0}
              max={50}
              step={1}
              onValueChange={(v) => setWeight(key, v)}
              aria-label={`${SCORE_LABELS[key]} weight`}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
