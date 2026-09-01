"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ResponsiveBar } from "@nivo/bar";
import { ResponsiveScatterPlot, type ScatterPlotDatum } from "@nivo/scatterplot";

import {
  COLORS,
  CONFIDENCE_COLORS,
  ChartEmpty,
  ChartSection,
  ChartTooltip,
  MAX_CHART_ITEMS,
  SERIES_COLORS,
  nivoTheme,
  rowsHeight,
  truncateNote,
} from "@/app/charts/_lib/chart-kit";
import type { ChartContext } from "@/app/charts/_lib/chart-context";
import {
  CHART_DIMENSIONS,
  CHART_METRICS,
  formatMetric,
  formatMetricTick,
  metricById,
  type MetricEnv,
  type MetricRequirement,
  type MetricRow,
} from "@/lib/chart-metrics";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/eq/segmented-control";

/**
 * Build-your-own chart.
 *
 * The preset charts above each answer one fixed question. This answers
 * whichever question the reader has: put any measure on either axis, colour by
 * any category, and compare. It is the general case the axis switcher on the
 * pay-versus chart was a special case of.
 */

type ExplorerType = "scatter" | "bar";

const TYPE_OPTIONS: { value: ExplorerType; label: string }[] = [
  { value: "scatter", label: "Compare two" },
  { value: "bar", label: "Rank one" },
];

const PRESET = { x: "sentiment", y: "pay", type: "scatter" as ExplorerType, colorBy: "confidence" };

interface ExplorerDatum extends ScatterPlotDatum {
  x: number;
  y: number;
  company: string;
  group: string;
}

/** Why a metric cannot produce anything in the current view. */
function unmetRequirement(
  requirement: MetricRequirement,
  ctx: ChartContext,
): string | null {
  switch (requirement) {
    case "payroll-model":
      return ctx.payrollReady ? null : "needs a validated payroll model";
    case "city-costs":
      if (ctx.costMode === "off") return "needs living costs switched on";
      if (ctx.costMode === "personal" && ctx.personalCost === null) {
        return `needs your saved costs for ${ctx.location}`;
      }
      if (ctx.costMode === "reference" && (ctx.cityCosts === null || !ctx.cityCosts.current)) {
        return `needs a validated cost bundle for ${ctx.location}`;
      }
      return null;
    case "sentiment":
    case "audited-ladder":
    case "peer-set":
      // These depend on per-company evidence rather than a global switch, so
      // they are reported through the empty state's coverage count instead.
      return null;
  }
}

function blockedReason(metricId: string, ctx: ChartContext): string | null {
  const metric = metricById(metricId);
  if (metric === null) return null;
  for (const requirement of metric.requires) {
    const reason = unmetRequirement(requirement, ctx);
    if (reason !== null) return `${metric.label} ${reason}.`;
  }
  return null;
}

export function ChartExplorer({ ctx }: { ctx: ChartContext }) {
  // A configured chart should be a link. State is seeded from the URL once,
  // then every change writes back, so a comparison can be shared or reopened
  // exactly as it was left rather than reset to the preset.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [xId, setXId] = useState(() => searchParams.get("x") ?? PRESET.x);
  const [yId, setYId] = useState(() => searchParams.get("y") ?? PRESET.y);
  const [type, setType] = useState<ExplorerType>(() =>
    searchParams.get("chart") === "bar" ? "bar" : PRESET.type,
  );
  const [colorBy, setColorBy] = useState(() => searchParams.get("by") ?? PRESET.colorBy);

  const syncUrl = useCallback(
    (next: { x?: string; y?: string; chart?: ExplorerType; by?: string }) => {
      const params = new URLSearchParams(searchParams.toString());
      const merged = {
        x: next.x ?? xId,
        y: next.y ?? yId,
        chart: next.chart ?? type,
        by: next.by ?? colorBy,
      };
      // Only non-default values are written, so a preset chart keeps a clean
      // URL rather than carrying four redundant parameters.
      const defaults: Record<string, string> = {
        x: PRESET.x, y: PRESET.y, chart: PRESET.type, by: PRESET.colorBy,
      };
      for (const [key, value] of Object.entries(merged)) {
        if (value === defaults[key]) params.delete(key);
        else params.set(key, value);
      }
      const query = params.toString();
      // replace, not push: tweaking an axis should not fill the back button
      // with intermediate states. scroll:false keeps the chart in view.
      router.replace(query === "" ? pathname : `${pathname}?${query}`, { scroll: false });
    },
    [router, pathname, searchParams, xId, yId, type, colorBy],
  );

  const xMetric = metricById(xId) ?? metricById(PRESET.x)!;
  const yMetric = metricById(yId) ?? metricById(PRESET.y)!;
  const dimension = CHART_DIMENSIONS.find((entry) => entry.id === colorBy) ?? CHART_DIMENSIONS[0];

  const env: MetricEnv = useMemo(
    () => ({
      companies: ctx.companies,
      postedRanges: ctx.postedRanges,
      level: ctx.level,
      location: ctx.location,
      payBasis: ctx.payBasis,
    }),
    [ctx.companies, ctx.postedRanges, ctx.level, ctx.location, ctx.payBasis],
  );

  const metricRows: MetricRow[] = useMemo(
    () =>
      ctx.rows.map((row) => ({
        company: row.company,
        point: row.point,
        netMonthly: row.netMonthly,
        afterCostsMonthly: row.afterCostsMonthly,
        costSharePercent: row.costSharePercent,
        effectiveDeductionRatePercent: row.payroll?.effectiveDeductionRatePercent ?? null,
      })),
    [ctx.rows],
  );

  const isBar = type === "bar";

  // A row only plots when every axis it needs has a real value. The count of
  // rows dropped is reported rather than silently shrinking the chart.
  const plotted = useMemo(
    () =>
      metricRows.flatMap((row) => {
        const yValue = yMetric.accessor(row, env);
        if (yValue === null) return [];
        const xValue = isBar ? 0 : xMetric.accessor(row, env);
        if (!isBar && xValue === null) return [];
        return [{
          company: row.company.canonicalName,
          x: xValue ?? 0,
          y: yValue,
          group: dimension.valueOf(row),
          confidence: row.point?.confidence ?? "Unknown",
        }];
      }),
    [metricRows, env, xMetric, yMetric, dimension, isBar],
  );

  const sorted = isBar ? plotted.slice().sort((a, b) => b.y - a.y) : plotted;
  const shown = sorted.slice(0, MAX_CHART_ITEMS);
  const missing = ctx.rows.length - plotted.length;

  const blocked = blockedReason(yId, ctx) ?? (isBar ? null : blockedReason(xId, ctx));

  // One series per category so the colour legend is meaningful.
  const series = useMemo(() => {
    const groups = new Map<string, ExplorerDatum[]>();
    for (const row of shown) {
      const entry: ExplorerDatum = {
        x: row.x,
        y: row.y,
        company: row.company,
        group: row.group,
      };
      groups.set(row.group, [...(groups.get(row.group) ?? []), entry]);
    }
    return [...groups.entries()].map(([id, data]) => ({ id, data }));
  }, [shown]);

  // This Select emits null when a value is cleared. An axis always needs a
  // metric, so a cleared select keeps the current one rather than leaving the
  // chart with no measure to plot.
  const keep = (key: "x" | "y" | "by", set: (id: string) => void) =>
    (value: string | null) => {
      if (value === null) return;
      set(value);
      syncUrl({ [key]: value });
    };

  const isPreset =
    xId === PRESET.x && yId === PRESET.y && type === PRESET.type && colorBy === PRESET.colorBy;

  return (
    <ChartSection
      title="Build your own comparison"
      description={
        isBar
          ? `Ranks every company by ${yMetric.label.toLowerCase()}. ${yMetric.description}`
          : `${yMetric.label} against ${xMetric.label.toLowerCase()}. ${xMetric.description}`
      }
      meta={
        truncateNote(sorted.length, shown.length, "companies") ??
        (missing > 0
          ? `${shown.length} plotted · ${missing} without the evidence this needs`
          : shown.length > 0
            ? `${shown.length} companies`
            : undefined)
      }
      {...(shown.length === 0
        ? { heightPx: 170 }
        : isBar
          ? { heightPx: rowsHeight(shown.length, { rowPx: 30, minPx: 300 }) }
          : { height: "h-[420px] sm:h-[460px]" })}
    >
      <div className="mb-4 flex flex-wrap items-end gap-3 border-b border-foreground/10 pb-4">
        <SegmentedControl
          label="Chart"
          layoutId="explorer-type"
          value={type}
          options={TYPE_OPTIONS}
          onChange={(next) => {
            setType(next);
            syncUrl({ chart: next });
          }}
        />

        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase text-muted-foreground">
            {isBar ? "Rank by" : "Vertical axis"}
          </span>
          <Select value={yId} onValueChange={keep("y", setYId)}>
            <SelectTrigger className="h-9 w-52" aria-label="Vertical axis metric">
              <span className="truncate text-left">{yMetric.label}</span>
            </SelectTrigger>
            <SelectContent>
              {CHART_METRICS.map((metric) => (
                <SelectItem key={metric.id} value={metric.id}>{metric.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        {!isBar && (
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase text-muted-foreground">
              Horizontal axis
            </span>
            <Select value={xId} onValueChange={keep("x", setXId)}>
              <SelectTrigger className="h-9 w-52" aria-label="Horizontal axis metric">
                <span className="truncate text-left">{xMetric.label}</span>
              </SelectTrigger>
              <SelectContent>
                {CHART_METRICS.map((metric) => (
                  <SelectItem key={metric.id} value={metric.id}>{metric.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase text-muted-foreground">
            Colour by
          </span>
          <Select value={colorBy} onValueChange={keep("by", setColorBy)}>
            <SelectTrigger className="h-9 w-44" aria-label="Colour marks by category">
              <span className="truncate text-left">{dimension.label}</span>
            </SelectTrigger>
            <SelectContent>
              {CHART_DIMENSIONS.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>{entry.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        {!isPreset && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setXId(PRESET.x);
              setYId(PRESET.y);
              setType(PRESET.type);
              setColorBy(PRESET.colorBy);
              syncUrl({ x: PRESET.x, y: PRESET.y, chart: PRESET.type, by: PRESET.colorBy });
            }}
          >
            Reset
          </Button>
        )}
      </div>

      {shown.length === 0 ? (
        <ChartEmpty>
          {blocked ??
            `No company has both ${yMetric.label.toLowerCase()}${isBar ? "" : ` and ${xMetric.label.toLowerCase()}`} at ${ctx.level} in ${ctx.location}. Pick a different measure, or widen the level and location above.`}
        </ChartEmpty>
      ) : isBar ? (
        <ResponsiveBar
          data={shown.slice().reverse()}
          keys={["y"]}
          indexBy="company"
          layout="horizontal"
          margin={{ top: 8, right: 48, bottom: 52, left: 104 }}
          padding={0.34}
          valueScale={{ type: "linear", min: "auto", max: "auto" }}
          colors={({ data }) => CONFIDENCE_COLORS[data.confidence as keyof typeof CONFIDENCE_COLORS] ?? COLORS.blue}
          borderRadius={3}
          enableGridX
          enableGridY={false}
          enableLabel
          label={({ value }) => formatMetricTick(Number(value), yMetric.unit)}
          labelSkipWidth={52}
          labelTextColor={COLORS.surface}
          axisBottom={{
            tickSize: 4,
            tickPadding: 6,
            format: (value) => formatMetricTick(Number(value), yMetric.unit),
            legend: yMetric.label,
            legendPosition: "middle",
            legendOffset: 40,
          }}
          axisLeft={{ tickSize: 0, tickPadding: 8 }}
          theme={nivoTheme}
          animate
          motionConfig="gentle"
          role="img"
          ariaLabel={`Companies ranked by ${yMetric.label}`}
          tooltip={({ data }) => (
            <ChartTooltip
              title={String(data.company)}
              rows={[
                { label: yMetric.label, value: formatMetric(Number(data.y), yMetric.unit) },
                { label: dimension.label, value: String(data.group) },
              ]}
            />
          )}
        />
      ) : (
        <ResponsiveScatterPlot<ExplorerDatum>
          data={series}
          margin={{ top: 18, right: 28, bottom: 64, left: 74 }}
          xScale={{ type: "linear", min: "auto", max: "auto" }}
          yScale={{ type: "linear", min: "auto", max: "auto" }}
          colors={SERIES_COLORS}
          nodeSize={13}
          blendMode="normal"
          enableGridX
          enableGridY
          useMesh
          axisBottom={{
            tickSize: 4,
            tickPadding: 6,
            format: (value) => formatMetricTick(Number(value), xMetric.unit),
            legend: xMetric.label,
            legendPosition: "middle",
            legendOffset: 44,
          }}
          axisLeft={{
            tickSize: 4,
            tickPadding: 6,
            format: (value) => formatMetricTick(Number(value), yMetric.unit),
            legend: yMetric.label,
            legendPosition: "middle",
            legendOffset: -62,
          }}
          theme={nivoTheme}
          animate
          motionConfig="gentle"
          role="img"
          ariaLabel={`${yMetric.label} against ${xMetric.label}`}
          legends={[{
            anchor: "bottom",
            direction: "row",
            translateY: 56,
            itemWidth: 110,
            itemHeight: 16,
            symbolSize: 9,
            symbolShape: "circle",
          }]}
          tooltip={({ node }) => (
            <ChartTooltip
              title={node.data.company}
              accent={node.color}
              rows={[
                { label: yMetric.label, value: formatMetric(node.data.y, yMetric.unit) },
                { label: xMetric.label, value: formatMetric(node.data.x, xMetric.unit) },
                { label: dimension.label, value: node.data.group },
              ]}
            />
          )}
        />
      )}
    </ChartSection>
  );
}
