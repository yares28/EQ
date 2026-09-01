"use client";

import NumberFlow from "@number-flow/react";
import { TierBadge } from "./badges";

export function Verdict({
  value,
  band,
  approx,
  size = "card",
}: {
  value: number;
  band: number;
  approx: boolean;
  size?: "card" | "hero";
}) {
  const numberCls =
    size === "hero"
      ? "text-5xl font-bold tracking-tighter"
      : "text-[26px] font-semibold tracking-tight";
  return (
    <div className="flex flex-col items-end gap-1">
      <div className={`flex items-baseline leading-none tabular ${numberCls}`}>
        {approx && (
          <span className="mr-0.5 text-[0.5em] font-medium text-muted-foreground">
            ≈
          </span>
        )}
        <NumberFlow
          value={value}
          format={{ maximumFractionDigits: 0 }}
          transformTiming={{ duration: 550, easing: "ease-out" }}
        />
      </div>
      <TierBadge value={value} band={band} />
    </div>
  );
}
