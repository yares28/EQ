"use client";

import type { Confidence } from "@/lib/salary-data";

/**
 * Shared chart primitives. Every chart on /charts reads its colours, theme,
 * tooltip and section chrome from here so a change lands everywhere at once.
 */

export const COLORS = {
  green: "#337d69",
  greenSoft: "#78a997",
  amber: "#bd7b3f",
  blue: "#5f7f9e",
  red: "#ad6258",
  ink: "#59676d",
  pale: "#c9d3d0",
  surface: "#fbfdfc",
};

export const SERIES_COLORS = [
  COLORS.green,
  COLORS.amber,
  COLORS.blue,
  COLORS.red,
  COLORS.ink,
  COLORS.greenSoft,
];

export const CONFIDENCE_COLORS: Record<Confidence, string> = {
  High: COLORS.green,
  Medium: COLORS.blue,
  Low: COLORS.amber,
  Unknown: COLORS.pale,
};

export const nivoTheme = {
  background: "transparent",
  text: {
    fontSize: 11,
    fill: COLORS.ink,
    // The app loads Plus Jakarta Sans as --font-jakarta (app/layout.tsx).
    // This used to reference --font-geist-sans, which does not exist here, so
    // every axis label silently fell back to the browser default.
    fontFamily: "var(--font-jakarta)",
  },
  axis: {
    domain: { line: { stroke: "rgba(34, 48, 54, 0.12)", strokeWidth: 1 } },
    ticks: {
      line: { stroke: "rgba(34, 48, 54, 0.12)", strokeWidth: 1 },
      text: { fill: COLORS.ink, fontSize: 10 },
    },
    legend: { text: { fill: COLORS.ink, fontSize: 10 } },
  },
  grid: { line: { stroke: "rgba(34, 48, 54, 0.07)", strokeWidth: 1 } },
  legends: { text: { fill: COLORS.ink, fontSize: 10 } },
  // No background/border/shadow here: every chart passes a custom `tooltip`
  // rendering ChartTooltip, and Nivo nests the custom node inside this
  // container — styling both gave every tooltip two borders and two shadows.
  tooltip: { container: { background: "transparent", padding: 0, boxShadow: "none" } },
};

/** Most items a chart can show as individually-labelled marks before labels
 * collide. Past this a chart truncates to the top N and says so. */
export const MAX_CHART_ITEMS = 24;

export function thousands(value: number): number {
  return Math.round((value / 1_000) * 10) / 10;
}

export function confidenceText(confidence: Confidence): string {
  return confidence === "Unknown" ? "—" : confidence;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

/**
 * A pixel height for a horizontal, one-row-per-item chart, derived from how
 * many rows it actually has instead of a number picked for one dataset size.
 * Past `maxRows` the chart stops growing — this is what keeps 60 or 300 rows
 * from squashing into unreadable slivers or stretching the page.
 */
export function rowsHeight(
  rowCount: number,
  opts?: { rowPx?: number; minPx?: number; maxRows?: number },
): number {
  // Nothing to plot: reserve only enough room for the explanation, not a
  // chart-sized hole in the page.
  if (rowCount === 0) return 150;
  const rowPx = opts?.rowPx ?? 32;
  const minPx = opts?.minPx ?? 280;
  const maxRows = opts?.maxRows ?? 14;
  const margin = 110; // axis + legend chrome outside the plotted rows
  return Math.max(minPx, Math.min(rowCount, maxRows) * rowPx + margin);
}

export function truncateNote(
  totalCount: number,
  shownCount: number,
  noun: string,
): string | undefined {
  if (totalCount <= shownCount) return undefined;
  return `Showing the top ${shownCount} of ${totalCount} ${noun} — narrow with search or shortlist scope to see the rest.`;
}

export function ChartTooltip({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string }[];
}) {
  return (
    <div className="min-w-40 rounded-md border border-foreground/10 bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg">
      <p className="font-semibold">{title}</p>
      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[11px]">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="text-right tabular">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function ChartSection({
  title,
  description,
  meta,
  height = "h-[390px]",
  heightPx,
  children,
}: {
  title: string;
  description: string;
  meta?: string;
  height?: string;
  /** A row-count-derived pixel height (see `rowsHeight`). Takes precedence
   * over `height` — Tailwind only ships arbitrary-value classes it saw at
   * build time, so a runtime height must be inline style. */
  heightPx?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-foreground/10 py-7 first:border-t-0">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
        {meta && (
          <p className="max-w-xs shrink-0 text-right text-[10px] leading-4 tabular text-muted-foreground">
            {meta}
          </p>
        )}
      </div>
      <div
        className={heightPx === undefined ? height : undefined}
        style={heightPx === undefined ? undefined : { height: heightPx }}
      >
        {children}
      </div>
    </section>
  );
}

export function ChartEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-full place-items-center border-y border-dashed border-foreground/10 text-center text-xs text-muted-foreground">
      <p className="max-w-sm leading-5">{children}</p>
    </div>
  );
}

export function SeriesLegend({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 px-2 text-[10px] text-muted-foreground">
      {items.map((item, index) => (
        <span key={item} className="inline-flex items-center gap-1.5">
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: SERIES_COLORS[index % SERIES_COLORS.length] }}
          />
          {item}
        </span>
      ))}
    </div>
  );
}

/** A section heading that groups several charts under one decision question. */
export function ChartGroupHeader({ title, question }: { title: string; question: string }) {
  return (
    <div className="mt-10 border-t-2 border-foreground/15 pt-6 first:mt-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <h2 className="mt-1 text-lg font-semibold tracking-tight">{question}</h2>
    </div>
  );
}
