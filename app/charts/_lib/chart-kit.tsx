"use client";

import type { Confidence } from "@/lib/salary-data";

/**
 * Shared chart primitives. Every chart on /charts reads its colours, theme,
 * tooltip and section chrome from here so a change lands everywhere at once.
 */

/**
 * Chart colour, on the app's own palette.
 *
 * This used to be its own set — #337d69 green, #5f7f9e blue, #bd7b3f amber —
 * none of which appears anywhere in globals.css, while `--chart-1` through
 * `--chart-5` were defined there and used by nothing. That is why the charts
 * never looked like the rest of the product. These are those tokens, plus two
 * steps of the accent that the ramp below needs.
 */
export const COLORS = {
  /** --chart-2, the bottle-green accent. */
  green: "#24382e",
  /** Two lighter steps of the same hue, for ordinal ramps. */
  greenMid: "#5c7a6a",
  greenSoft: "#9db3a6",
  /** --chart-4. */
  amber: "#8a6b3d",
  /** --chart-1, ink. */
  blue: "#1a1917",
  red: "#8b3a32",
  /** --chart-3. */
  ink: "#6a6a6a",
  /** --chart-5. */
  pale: "#ddd6cc",
  /** --card, for point borders that must read as cut out of the surface. */
  surface: "#ffffff",
};

/** Categorical series: distinguishable, and all from the palette above. */
export const SERIES_COLORS = [
  COLORS.green,
  COLORS.amber,
  COLORS.ink,
  COLORS.blue,
  COLORS.greenSoft,
  COLORS.pale,
];

/**
 * Confidence is ORDINAL — High is more than Medium is more than Low — so it
 * takes a sequential ramp of one hue. The previous mapping was green, blue and
 * amber, three unrelated hues, which says these are different KINDS rather
 * than different amounts.
 */
export const CONFIDENCE_COLORS: Record<Confidence, string> = {
  High: COLORS.green,
  Medium: COLORS.greenMid,
  Low: COLORS.greenSoft,
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
  accent,
}: {
  title: string;
  rows: {
    label: string;
    value: string;
    /** Series colour for this one row, e.g. one company among several lines
     *  crossing an x-slice. Distinct from `accent`, which marks the whole card. */
    dot?: string;
  }[];
  /** Series colour, drawn as a dot beside the title to tie the card to the
   * mark it describes. Optional — charts with one series don't need it. */
  accent?: string;
}) {
  return (
    // Sized to its content rather than to a minimum width. The previous card
    // forced 160px and then squeezed the label column, so labels like "Cost of
    // living share" wrapped onto two lines inside a box with spare room.
    <div
      className="
        pointer-events-none max-w-64 rounded-md border border-foreground/[0.07]
        bg-popover/92 px-2.5 py-1.5 backdrop-blur-md
        shadow-[0_1px_1px_rgba(26,25,23,0.04),0_10px_24px_-10px_rgba(26,25,23,0.28)]
      "
    >
      <p className="flex items-center gap-1.5 text-[11px] font-semibold leading-4 tracking-[-0.01em] text-popover-foreground">
        {accent !== undefined && (
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: accent }}
          />
        )}
        <span className="truncate">{title}</span>
      </p>
      <dl className="mt-1 flex flex-col gap-px">
        {rows.map((row) => (
          // Each row is its own flex line, so a long label pushes its value
          // rather than wrapping under itself.
          <div key={row.label} className="flex items-baseline justify-between gap-4">
            <dt className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[10px] leading-[15px] text-muted-foreground">
              {row.dot !== undefined && (
                <span
                  aria-hidden
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: row.dot }}
                />
              )}
              <span className="truncate">{row.label}</span>
            </dt>
            <dd className="whitespace-nowrap text-[11px] font-medium leading-[15px] tabular text-popover-foreground">
              {row.value}
            </dd>
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
    // A card rather than a full-bleed band between hairlines: with
    // twenty-five of these down the page, each one needs to read as a single
    // object you can scan past.
    <section className="mb-4 rounded-2xl bg-card p-5 shadow-[0_0_0_1px_rgb(26_25_23_/_5.5%)] sm:p-6">
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
    <div className="mb-4 mt-8 flex flex-wrap items-baseline gap-x-3 gap-y-1 first:mt-0">
      <h2 className="text-lg font-semibold tracking-tight">{question}</h2>
      <p className="text-[11px] font-medium uppercase tracking-[0.09em] text-muted-foreground">
        {title}
      </p>
    </div>
  );
}
