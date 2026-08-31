"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { ResponsiveBar } from "@nivo/bar";
import { ResponsiveLine } from "@nivo/line";

import { api } from "@/convex/_generated/api";
import {
  COLORS,
  ChartEmpty,
  ChartSection,
  ChartTooltip,
  MAX_CHART_ITEMS,
  SERIES_COLORS,
  SeriesLegend,
  nivoTheme,
  rowsHeight,
} from "@/app/charts/_lib/chart-kit";

/**
 * "Is this company growing or shrinking?"
 *
 * Backed by the companyScans feed, which records what each career page held
 * every time it was re-read. Two honest constraints shape these charts:
 *
 *   - History is only days deep. A line through two points looks like a trend
 *     and is not one, so both charts gate on distinct days of history and say
 *     what they are waiting for rather than drawing something misleading.
 *   - The scan feed covers every monitored company, not just those with a
 *     salary figure, so these are the one place a company with no pay
 *     evidence still appears. That is deliberate — hiring volume is knowable
 *     when pay is not.
 */

/** Below this, a chart shows the gate rather than a shape that reads as a trend. */
const MIN_DAYS_FOR_TREND = 3;

function dayKey(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

function shortDay(key: string): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function useHiringActivity(windowDays: number) {
  return useQuery(api.history.hiringActivity, {
    windowDays,
    paginationOpts: { numItems: 400, cursor: null },
  });
}

function HistoryGate({ dayCount, needed }: { dayCount: number; needed: number }) {
  return (
    <ChartEmpty>
      {dayCount === 0
        ? "No career-page scans have been recorded yet, so there is no hiring history to plot."
        : `Only ${dayCount} ${dayCount === 1 ? "day" : "days"} of scan history so far. This needs ${needed} to show a shape that means anything — scans run continuously, so it fills in on its own.`}
    </ChartEmpty>
  );
}

/** Open roles per company over time — the growing-or-shrinking question. */
export function HiringVolumeOverTime() {
  const activity = useHiringActivity(60);

  const { series, dayCount, days } = useMemo(() => {
    if (activity === undefined) return { series: [], dayCount: 0, days: [] as string[] };

    // One point per company per day, taking that day's last scan: several scans
    // can land in a day and only the newest describes the page as it stands.
    const byCompany = new Map<string, Map<string, { at: number; roles: number }>>();
    for (const scan of activity.page) {
      const day = dayKey(scan.scannedAt);
      const days = byCompany.get(scan.company) ?? new Map();
      const existing = days.get(day);
      if (existing === undefined || scan.scannedAt > existing.at) {
        days.set(day, { at: scan.scannedAt, roles: scan.spainRoles });
      }
      byCompany.set(scan.company, days);
    }

    const allDays = [...new Set(activity.page.map((scan) => dayKey(scan.scannedAt)))].sort();

    const built = [...byCompany.entries()]
      // Companies that never post a Spain role would draw a flat line at zero
      // and crowd out the ones that actually move.
      .filter(([, days]) => [...days.values()].some((entry) => entry.roles > 0))
      .map(([company, days]) => ({
        id: company,
        // x is the day's index, not its label. A point scale takes its
        // category order from whichever series first contributes a value, so
        // series with gaps scrambled the axis into "30 Aug, 31 Aug, 29 Aug".
        // A numeric x with mapped ticks pins chronological order, and avoids
        // the null placeholders Nivo renders as NaN-radius points.
        data: allDays.flatMap((day, index) => {
          const entry = days.get(day);
          return entry === undefined ? [] : [{ x: index, y: entry.roles }];
        }),
      }))
      .filter((entry) => entry.data.length >= 2)
      .sort((a, b) => (b.data.at(-1)?.y ?? 0) - (a.data.at(-1)?.y ?? 0))
      .slice(0, 6);

    return { series: built, dayCount: allDays.length, days: allDays };
  }, [activity]);

  return (
    <ChartSection
      title="Whether a company is hiring more or less"
      description="Spain-relevant open roles each time the career page was re-read. A rising line is a team expanding; a falling one is a hiring freeze taking hold before it is announced."
      meta={
        activity === undefined
          ? undefined
          : series.length > 0
            ? `${series.length} companies · ${dayCount} ${dayCount === 1 ? "day" : "days"} of history`
            : undefined
      }
      {...(series.length === 0 || dayCount < MIN_DAYS_FOR_TREND
        ? { heightPx: 170 }
        : { height: "h-[400px] sm:h-[440px]" })}
    >
      {activity === undefined ? (
        <ChartEmpty>Loading scan history…</ChartEmpty>
      ) : dayCount < MIN_DAYS_FOR_TREND || series.length === 0 ? (
        <HistoryGate dayCount={dayCount} needed={MIN_DAYS_FOR_TREND} />
      ) : (
        <div className="flex h-full flex-col gap-2">
          <div className="min-h-0 flex-1">
            <ResponsiveLine
              data={series}
              margin={{ top: 18, right: 28, bottom: 56, left: 58 }}
              xScale={{ type: "linear", min: 0, max: Math.max(days.length - 1, 1) }}
              yScale={{ type: "linear", min: 0, max: "auto" }}
              curve="monotoneX"
              colors={SERIES_COLORS}
              lineWidth={3}
              pointSize={7}
              pointColor={{ from: "color" }}
              pointBorderWidth={2}
              pointBorderColor={COLORS.surface}
              enableGridX={false}
              enableGridY
              useMesh
              enableSlices="x"
              axisBottom={{
                tickSize: 4,
                tickPadding: 8,
                tickRotation: -30,
                tickValues: days.map((_, index) => index),
                format: (value) => shortDay(days[Number(value)] ?? ""),
              }}
              axisLeft={{
                tickSize: 4,
                tickPadding: 6,
                legend: "Open Spain roles",
                legendPosition: "middle",
                legendOffset: -46,
              }}
              theme={nivoTheme}
              animate
              motionConfig="gentle"
              role="img"
              ariaLabel="Open Spain roles per company over time"
            />
          </div>
          <SeriesLegend items={series.map((entry) => String(entry.id))} />
        </div>
      )}
    </ChartSection>
  );
}

/** Net roles added minus removed — churn, which a running total hides. */
export function HiringChurn() {
  const activity = useHiringActivity(60);

  const { data, dayCount } = useMemo(() => {
    if (activity === undefined) return { data: [], dayCount: 0 };

    const totals = new Map<string, { added: number; removed: number; scans: number }>();
    for (const scan of activity.page) {
      const entry = totals.get(scan.company) ?? { added: 0, removed: 0, scans: 0 };
      entry.added += scan.rolesAdded;
      entry.removed += scan.rolesRemoved;
      entry.scans += 1;
      totals.set(scan.company, entry);
    }

    const built = [...totals.entries()]
      // A company with no movement at all says nothing either way.
      .filter(([, entry]) => entry.added > 0 || entry.removed > 0)
      .map(([company, entry]) => ({
        company,
        Added: entry.added,
        // Plotted negative so growth and shrinkage read as opposite directions
        // from a shared zero line rather than as two positive bars.
        Removed: -entry.removed,
        net: entry.added - entry.removed,
        scans: entry.scans,
      }))
      .sort((a, b) => b.net - a.net)
      .slice(0, MAX_CHART_ITEMS);

    const days = new Set(activity.page.map((scan) => dayKey(scan.scannedAt)));
    return { data: built, dayCount: days.size };
  }, [activity]);

  return (
    <ChartSection
      title="Roles opened against roles pulled"
      description="Every posting added and removed across the window. A company adding and removing in equal measure is churning rather than growing, which a headline count of open roles hides."
      meta={
        data.length > 0
          ? `${data.length} companies with movement · ${dayCount} ${dayCount === 1 ? "day" : "days"}`
          : undefined
      }
      {...(data.length === 0
        ? { heightPx: 170 }
        : { heightPx: rowsHeight(data.length, { rowPx: 30, minPx: 300 }) })}
    >
      {activity === undefined ? (
        <ChartEmpty>Loading scan history…</ChartEmpty>
      ) : data.length === 0 ? (
        <ChartEmpty>
          {dayCount === 0
            ? "No career-page scans have been recorded yet."
            : "No monitored company has opened or pulled a role in this window."}
        </ChartEmpty>
      ) : (
        <ResponsiveBar
          data={data.slice().reverse()}
          keys={["Added", "Removed"]}
          indexBy="company"
          layout="horizontal"
          margin={{ top: 8, right: 32, bottom: 64, left: 104 }}
          padding={0.34}
          valueScale={{ type: "linear" }}
          colors={[COLORS.green, COLORS.red]}
          borderRadius={3}
          enableGridX
          enableGridY={false}
          enableLabel={false}
          axisBottom={{
            tickSize: 4,
            tickPadding: 6,
            format: (value) => String(Math.abs(Number(value))),
            legend: "Roles pulled  ←     → roles opened",
            legendPosition: "middle",
            legendOffset: 42,
          }}
          axisLeft={{ tickSize: 0, tickPadding: 8 }}
          theme={nivoTheme}
          animate
          motionConfig="gentle"
          role="img"
          ariaLabel="Roles added versus removed by company"
          legends={[{
            dataFrom: "keys", anchor: "bottom", direction: "row", translateY: 56,
            itemWidth: 92, itemHeight: 16, symbolSize: 9, symbolShape: "circle",
          }]}
          tooltip={({ data }) => (
            <ChartTooltip
              title={String(data.company)}
              rows={[
                { label: "Opened", value: String(data.Added) },
                { label: "Pulled", value: String(Math.abs(Number(data.Removed))) },
                {
                  label: "Net",
                  value: `${Number(data.net) > 0 ? "+" : ""}${data.net}`,
                },
                { label: "Scans", value: String(data.scans) },
              ]}
            />
          )}
        />
      )}
    </ChartSection>
  );
}
