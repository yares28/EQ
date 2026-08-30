"use client";

import { ResponsiveBar } from "@nivo/bar";
import { ResponsiveLine } from "@nivo/line";

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
  thousands,
  truncateNote,
} from "@/app/charts/_lib/chart-kit";
import type { ChartContext } from "@/app/charts/_lib/chart-context";
import { decisionLocationMatches } from "@/lib/company-research-catalog";
import {
  decisionProgressionFor,
  formatEuro,
  isPostedSalaryPoint,
} from "@/lib/salary-analytics";
import {
  isProgressionDecisionGrade,
  ladderJumpLockReason,
  resolveLadderStep,
} from "@/lib/company-level-ladders";
import { levelLabels, type SalaryLevel } from "@/lib/salary-data";

/**
 * "Where this takes me" — the money question that plays out over years rather
 * than at signing.
 *
 * Everything here is gated on audited ladder evidence. Where a company's own
 * sources do not name the successor level, the chart says so rather than
 * extrapolating a curve that would look authoritative and be invented.
 */

/** All six levels, not just the three the level control exposes — a company
 * that only publishes Senior and Staff is still part of the picture. */
const FULL_LADDER: SalaryLevel[] = ["intern", "junior", "mid", "senior", "staff", "principal"];

export function FullLevelPayCurve({ ctx }: { ctx: ChartContext }) {
  // One series per company, spanning every level it publishes in a single
  // unchanged location scope. Mixing scopes would join a Madrid figure to a
  // Spain-wide one and invent a jump that nobody ever gets.
  const series = ctx.companies.flatMap((company) => {
    const inScope = company.salaryPoints.filter(
      (point) =>
        point.baseEur !== null &&
        point.baseEur !== undefined &&
        decisionLocationMatches(point.location, ctx.location),
    );
    if (inScope.length < 2) return [];

    const byLevel = new Map<SalaryLevel, number>();
    for (const point of inScope) {
      if (point.baseEur == null) continue;
      const existing = byLevel.get(point.level);
      if (existing === undefined || point.baseEur > existing) {
        byLevel.set(point.level, point.baseEur);
      }
    }
    // x is the level's index on the ladder, not its label. A point scale takes
    // its category order from the order values first appear across series, so
    // companies starting at different levels produced a scrambled axis
    // (Intern landing after Senior). A numeric x with mapped tick labels pins
    // intern-to-principal order without needing null placeholders, which Nivo
    // renders as points with a NaN radius.
    const data = FULL_LADDER.flatMap((level, index) => {
      const base = byLevel.get(level);
      return base === undefined ? [] : [{ x: index, y: thousands(base) }];
    });
    if (data.length < 2) return [];
    return [{ id: company.canonicalName, data }];
  });
  const shown = series.slice(0, 8);

  return (
    <ChartSection
      title="The whole ladder, not just the next rung"
      description="Base pay across every level each company publishes, from intern to principal. This is the shape of a career at each employer — a steep late curve is worth more over ten years than a strong starting number."
      meta={truncateNote(series.length, shown.length, "companies") ?? (shown.length > 0 ? `${shown.length} companies` : undefined)}
      {...(shown.length === 0 ? { heightPx: 170 } : { height: "h-[400px] sm:h-[440px]" })}
    >
      {shown.length === 0 ? (
        <ChartEmpty>
          No company publishes pay at two or more levels inside {ctx.location}. Figures are never
          joined across location scopes, so a Madrid salary is not connected to a Spain-wide one.
        </ChartEmpty>
      ) : (
        <div className="flex h-full flex-col gap-2">
          <div className="min-h-0 flex-1">
            <ResponsiveLine
              data={shown}
              margin={{ top: 18, right: 28, bottom: 52, left: 66 }}
              xScale={{ type: "linear", min: 0, max: FULL_LADDER.length - 1 }}
              yScale={{ type: "linear", min: 0, max: "auto" }}
              curve="monotoneX"
              colors={SERIES_COLORS}
              lineWidth={3}
              pointSize={8}
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
                tickRotation: -20,
                tickValues: FULL_LADDER.map((_, index) => index),
                format: (value) => levelLabels[FULL_LADDER[Number(value)]] ?? "",
              }}
              axisLeft={{
                tickSize: 4,
                tickPadding: 6,
                format: (value) => `€${value}k`,
                legend: "Base pay",
                legendPosition: "middle",
                legendOffset: -54,
              }}
              theme={nivoTheme}
              animate
              motionConfig="gentle"
              role="img"
              ariaLabel="Base pay across all published levels by company"
            />
          </div>
          <SeriesLegend items={shown.map((entry) => String(entry.id))} />
        </div>
      )}
    </ChartSection>
  );
}

export function PromotionJumpSize({ ctx }: { ctx: ChartContext }) {
  const data = ctx.companies
    .flatMap((company) => {
      const progression = decisionProgressionFor(company, ctx.level, ctx.location);
      if (progression === null || !progression.decisionGrade) return [];
      if (!Number.isFinite(progression.percent)) return [];
      return [{
        company: company.canonicalName,
        percent: progression.percent,
        deltaEur: progression.deltaEur,
        // The two progression paths compare different figures, so each bar
        // states which one it is instead of silently mixing them in a column.
        basis: isPostedSalaryPoint(progression.from) ? "Base to base" : "Total to total",
        nextLevel: progression.mapping.nextCompanyLevel ?? "next level",
      }];
    })
    .sort((a, b) => b.percent - a.percent);
  const shown = data.slice(0, MAX_CHART_ITEMS);

  // Companies whose ladder cannot support a jump figure, and why.
  const locked = ctx.companies
    .flatMap((company) => {
      const resolution = resolveLadderStep(company.slug, ctx.level);
      if (isProgressionDecisionGrade(resolution)) return [];
      return [{ name: company.canonicalName, reason: ladderJumpLockReason(resolution) }];
    })
    .slice(0, 6);

  return (
    <ChartSection
      title="How big the next promotion actually is"
      description={`The pay increase from ${levelLabels[ctx.level]} to the next level each company's own sources name. Only promotions the employer's evidence actually maps are shown — an unmapped ladder is locked rather than guessed.`}
      meta={truncateNote(data.length, shown.length, "companies") ?? (shown.length > 0 ? `${shown.length} with audited steps` : undefined)}
      heightPx={rowsHeight(shown.length, { rowPx: 30, minPx: 280 })}
    >
      {shown.length === 0 ? (
        <ChartEmpty>
          No company&rsquo;s audited ladder names a successor level to {levelLabels[ctx.level]} with a
          pay figure at both ends in {ctx.location}.
          {locked.length > 0 && (
            <span className="mt-2 block">
              Locked: {locked.map((entry) => `${entry.name} (${entry.reason.toLowerCase()})`).join(", ")}
            </span>
          )}
        </ChartEmpty>
      ) : (
        <>
          <ResponsiveBar
            data={shown.slice().reverse()}
            keys={["percent"]}
            indexBy="company"
            layout="horizontal"
            margin={{ top: 8, right: 44, bottom: 52, left: 100 }}
            padding={0.34}
            valueScale={{ type: "linear", min: "auto", max: "auto" }}
            colors={({ data }) => (data.percent < 0 ? COLORS.red : COLORS.green)}
            borderRadius={3}
            enableGridX
            enableGridY={false}
            enableLabel
            label={({ value }) => `${Number(value) > 0 ? "+" : ""}${value}%`}
            labelSkipWidth={40}
            labelTextColor={COLORS.surface}
            axisBottom={{
              tickSize: 4,
              tickPadding: 6,
              format: (value) => `${Number(value) > 0 ? "+" : ""}${value}%`,
              legend: "Pay increase at the next promotion",
              legendPosition: "middle",
              legendOffset: 40,
            }}
            axisLeft={{ tickSize: 0, tickPadding: 8 }}
            theme={nivoTheme}
            animate
            motionConfig="gentle"
            role="img"
            ariaLabel="Size of the next promotion by company"
            tooltip={({ data }) => (
              <ChartTooltip
                title={String(data.company)}
                rows={[
                  { label: "Increase", value: `${Number(data.percent) > 0 ? "+" : ""}${data.percent}%` },
                  { label: "In money", value: `${Number(data.deltaEur) > 0 ? "+" : ""}${formatEuro(Number(data.deltaEur), true)}` },
                  { label: "Promotes to", value: String(data.nextLevel) },
                  { label: "Comparing", value: String(data.basis) },
                ]}
              />
            )}
          />
          {locked.length > 0 && (
            <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
              Not shown: {locked.map((entry) => `${entry.name} (${entry.reason.toLowerCase()})`).join(", ")}.
            </p>
          )}
        </>
      )}
    </ChartSection>
  );
}

export function ProjectedPath({ ctx }: { ctx: ChartContext }) {
  // Chains only steps the company's own sources name, starting from the level
  // in view. Never extrapolates past the evidence: the line stops where the
  // audited ladder stops.
  const series = ctx.companies.flatMap((company) => {
    const points: { x: string; y: number }[] = [];
    let level: SalaryLevel = ctx.level;

    for (let step = 0; step < FULL_LADDER.length; step += 1) {
      const point = company.salaryPoints.find(
        (candidate) =>
          candidate.level === level &&
          candidate.baseEur != null &&
          decisionLocationMatches(candidate.location, ctx.location),
      );
      if (point?.baseEur == null) break;
      points.push({ x: levelLabels[level], y: thousands(point.baseEur) });

      const resolution = resolveLadderStep(company.slug, level);
      if (!isProgressionDecisionGrade(resolution) || resolution.nextNormalizedLevel === null) break;
      level = resolution.nextNormalizedLevel;
    }

    if (points.length < 2) return [];
    return [{ id: company.canonicalName, data: points }];
  });
  const shown = series.slice(0, 8);

  const lockedCount = ctx.companies.length - series.length;

  return (
    <ChartSection
      title={`Starting at ${levelLabels[ctx.level]}, where the money goes`}
      description="The pay path each company's audited ladder actually supports, following named promotion steps only. Each line stops where that company's own evidence stops — a longer line means a better-documented career, not necessarily a better one."
      meta={
        shown.length > 0
          ? `${truncateNote(series.length, shown.length, "paths") ?? `${shown.length} audited paths`}${lockedCount > 0 ? ` · ${lockedCount} without a mapped ladder` : ""}`
          : undefined
      }
      {...(shown.length === 0 ? { heightPx: 170 } : { height: "h-[400px] sm:h-[440px]" })}
    >
      {shown.length === 0 ? (
        <ChartEmpty>
          No company has an audited promotion step out of {levelLabels[ctx.level]} with pay figures at
          both ends in {ctx.location}. Rather than projecting a curve from an unmapped ladder, no
          path is drawn.
        </ChartEmpty>
      ) : (
        <div className="flex h-full flex-col gap-2">
          <div className="min-h-0 flex-1">
            <ResponsiveLine
              data={shown}
              margin={{ top: 18, right: 28, bottom: 52, left: 66 }}
              xScale={{ type: "point" }}
              yScale={{ type: "linear", min: 0, max: "auto" }}
              curve="monotoneX"
              colors={SERIES_COLORS}
              lineWidth={3}
              pointSize={9}
              pointColor={{ from: "color" }}
              pointBorderWidth={2}
              pointBorderColor={COLORS.surface}
              enableGridX={false}
              enableGridY
              useMesh
              enableSlices="x"
              axisBottom={{ tickSize: 4, tickPadding: 8, tickRotation: -20 }}
              axisLeft={{
                tickSize: 4,
                tickPadding: 6,
                format: (value) => `€${value}k`,
                legend: "Base pay along the path",
                legendPosition: "middle",
                legendOffset: -54,
              }}
              theme={nivoTheme}
              animate
              motionConfig="gentle"
              role="img"
              ariaLabel="Projected pay path from the current level along audited promotion steps"
            />
          </div>
          <SeriesLegend items={shown.map((entry) => String(entry.id))} />
        </div>
      )}
    </ChartSection>
  );
}
