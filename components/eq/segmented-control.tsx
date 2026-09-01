"use client";

import { useRef } from "react";
import { motion } from "motion/react";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/**
 * A single-choice control.
 *
 * It used to announce itself as `role="tablist"` with `role="tab"` children,
 * which promises a screen-reader user a set of tabs that switch panels: it had
 * no tabpanel to switch to, no `aria-controls`, and none of the keyboard
 * behaviour the tab pattern requires — every button was its own tab stop and
 * the arrow keys did nothing. What it actually is, is a radio group, so that is
 * what it now reports, with the roving tabindex and arrow-key movement that
 * pattern does require.
 */
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
  const groupRef = useRef<HTMLDivElement>(null);
  const selectedIndex = options.findIndex((option) => option.value === value);

  // Arrow keys move the selection and the focus together, which is how a radio
  // group is expected to behave; Home and End jump to the ends.
  const move = (from: number, delta: number) => {
    if (options.length === 0) return;
    const next = (from + delta + options.length) % options.length;
    onChange(options[next].value);
    groupRef.current
      ?.querySelectorAll<HTMLButtonElement>("[data-segment]")
      ?.[next]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const from = selectedIndex >= 0 ? selectedIndex : index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      move(from, 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      move(from, -1);
    } else if (event.key === "Home") {
      event.preventDefault();
      move(-1, 1);
    } else if (event.key === "End") {
      event.preventDefault();
      move(0, -1);
    }
  };

  return (
    <div className="max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div
        ref={groupRef}
        role="radiogroup"
        aria-label={label}
        className="inline-flex min-w-max items-center gap-1 rounded-full border border-border bg-muted/60 p-1"
      >
        {options.map((option, index) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              data-segment
              aria-checked={active}
              // Roving tabindex: the group is one tab stop, not one per option.
              // Nothing selected yet keeps the first option reachable.
              tabIndex={active || (selectedIndex === -1 && index === 0) ? 0 : -1}
              onKeyDown={(event) => onKeyDown(event, index)}
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
