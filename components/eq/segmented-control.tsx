"use client";

import { motion } from "motion/react";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
  layoutId,
}: {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  label: string;
  layoutId: string;
}) {
  return (
    <div className="max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div
        role="tablist"
        aria-label={label}
        className="inline-flex min-w-max items-center gap-1 rounded-full border border-border bg-muted/60 p-1"
      >
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(option.value)}
              className={`relative flex h-8 items-center gap-2 rounded-full px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {active && (
                <motion.span
                  layoutId={layoutId}
                  className="absolute inset-0 rounded-full bg-card shadow-sm ring-1 ring-border"
                  transition={{ type: "spring", stiffness: 420, damping: 36 }}
                />
              )}
              <span className="relative z-10">{option.label}</span>
              {option.count !== undefined && (
                <span
                  className={`relative z-10 min-w-5 rounded px-1.5 py-0.5 text-[10px] tabular ${
                    active
                      ? "bg-primary/10 text-primary"
                      : "bg-foreground/[0.05] text-muted-foreground"
                  }`}
                >
                  {option.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
