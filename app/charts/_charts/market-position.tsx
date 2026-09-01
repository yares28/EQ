"use client";

import { ResponsiveBar } from "@nivo/bar";

import {
  COLORS,
  ChartEmpty,
  ChartSection,
  ChartTooltip,
  MAX_CHART_ITEMS,
  nivoTheme,
  rowsHeight,
  thousands,
  truncateNote,
} from "@/app/charts/_lib/chart-kit";
import type { ChartContext } from "@/app/charts/_lib/chart-context";
import { analyzeSalaryNegotiation } from "@/lib/salary-negotiation";
import { selectPostedRange } from "@/lib/company-research-catalog";
import { equityShare, formatEuro, payAmountFor } from "@/lib/salary-analytics";

/**
 * "Am I being lowballed" — where an offer sits against peers and against the
 * official market, and what a defensible counter-offer looks like.
 *
 * Two caveats are stated on the charts rather than hidden, because both
 * materially change how much weight a percentile deserves:
 *   1. The percentile includes the company in its own peer set.
 *   2. It is computed on total compensation, so employer-posted companies —
 *      which publish base only — are structurally excluded.
 */

function negotiationFor(ctx: ChartContext, row: ChartContext["rows"][number]) {
  return analyzeSalaryNegotiation({
    company: row.company,
    point: row.point,
    companies: ctx.companies,
    postedRange: selectPostedRange({
      ranges: ctx.postedRanges,
      companySlug: row.company.slug,
      targetLevel: ctx.level,
      location: ctx.location,
    }),
  });
}

export function MarketPercentile({ ctx }: { ctx: ChartContext }) {
  const data = ctx.rows
    .flatMap((row) => {
      const negotiation = negotiationFor(ctx, row);
      if (negotiation.marketPercentile === null) return [];
      return [{
        company: row.company.canonicalName,
        percentile: negotiation.marketPercentile,
        peers: negotiation.comparableCompanyCount,
        scope: negotiation.comparisonScope,
        quality: negotiation.sampleQualityLabel,
      }];
    })
    .sort((a, b) => b.percentile - a.percentile);
  const shown = data.slice(0, MAX_CHART_ITEMS);

  const lockedCount = ctx.rows.length - data.length;

  return (
    <ChartSection
      title="Where each offer sits against its peers"
      description="Percentile against companies with a figure at the same level and location scope. Below the 50th line, the offer is behind its own comparison set — that is the number to take into a negotiation."
      meta={
        shown.length > 0
          ? `${truncateNote(data.length, shown.length, "companies") ?? `${shown.length} ranked`}${lockedCount > 0 ? ` · ${lockedCount} locked` : ""}`
          : undefined
      }
      heightPx={rowsHeight(shown.length, { rowPx: 30, minPx: 300 })}
    >
      {shown.length === 0 ? (
        <ChartEmpty>
          No company here has a percentile. It needs at least three peers publishing total
          compensation at the same level and location — employer-posted salaries state base
          only, so they are excluded by design rather than by omission.
        </ChartEmpty>
      ) : (
        <>
          <ResponsiveBar
            data={shown.slice().reverse()}
            keys={["percentile"]}
            indexBy="company"
            layout="horizontal"
            margin={{ top: 8, right: 40, bottom: 52, left: 100 }}
            padding={0.34}
            valueScale={{ type: "linear", min: 0, max: 100 }}
            colors={({ data }) =>
              Number(data.percentile) >= 66
                ? COLORS.green
                : Number(data.percentile) >= 40
                  ? COLORS.amber
                  : COLORS.red
            }
            borderRadius={3}
            enableGridX
            enableGridY={false}
            gridXValues={[0, 25, 50, 75, 100]}
            enableLabel
            label={({ value }) => `P${value}`}
            labelSkipWidth={34}
            labelTextColor={COLORS.surface}
            axisBottom={{
              tickSize: 4,
              tickPadding: 6,
              tickValues: [0, 25, 50, 75, 100],
              format: (value) => `P${value}`,
              legend: "Percentile among exact-scope peers",
              legendPosition: "middle",
              legendOffset: 40,
            }}
            axisLeft={{ tickSize: 0, tickPadding: 8 }}
            theme={nivoTheme}
            animate
            motionConfig="gentle"
            role="img"
            ariaLabel="Market percentile by company"
            tooltip={({ data }) => (
              <ChartTooltip
                title={String(data.company)}
                rows={[
                  { label: "Percentile", value: `P${data.percentile}` },
                  { label: "Compared with", value: `${data.peers} companies` },
                  { label: "Scope", value: String(data.scope) },
                  { label: "Evidence", value: String(data.quality) },
                ]}
              />
            )}
          />
          <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
            Each company is counted inside its own peer set, so with only a handful of peers a
            percentile has few possible values — treat small peer counts as directional.
          </p>
        </>
      )}
    </ChartSection>
  );
}

export function PayVersusMarketBenchmark({ ctx }: { ctx: ChartContext }) {
  const benchmarks = ctx.benchmarks;
  // The single most relevant baseline: the highest-skill benchmark available,
  // which is the closest official proxy for a software engineering salary.
  const baseline = benchmarks.length === 0
    ? null
    : benchmarks.reduce((best, candidate) => (candidate.amount > best.amount ? candidate : best));

  const data = ctx.rows
    .flatMap((row) => {
      const amount = payAmountFor(row.point, ctx.payBasis);
      if (amount === null || baseline === null) return [];
      return [{
        company: row.company.canonicalName,
        gap: Math.round(((amount - baseline.amount) / baseline.amount) * 100),
        amount,
      }];
    })
    .sort((a, b) => b.gap - a.gap);
  const shown = data.slice(0, MAX_CHART_ITEMS);

  return (
    <ChartSection
      title="Above or below the national market"
      description={
        baseline === null
          ? "How each salary compares with the official Spanish earnings benchmark."
          : `How each salary compares with ${baseline.label.toLowerCase()} (${formatEuro(baseline.amount, true)}, ${baseline.referenceYear}). Anything to the left of zero is below the official market average for the comparison group.`
      }
      meta={
        baseline === null
          ? undefined
          : truncateNote(data.length, shown.length, "companies") ?? `Baseline: ${baseline.referenceYear} official data`
      }
      heightPx={rowsHeight(shown.length, { rowPx: 30, minPx: 300 })}
    >
      {shown.length === 0 ? (
        <ChartEmpty>
          {baseline === null
            ? "No official earnings benchmark has been retrieved yet, so there is nothing to compare these salaries against."
            : "No company has a pay figure at this level and location to compare against the benchmark."}
        </ChartEmpty>
      ) : (
        <ResponsiveBar
          data={shown.slice().reverse()}
          keys={["gap"]}
          indexBy="company"
          layout="horizontal"
          margin={{ top: 8, right: 44, bottom: 52, left: 100 }}
          padding={0.34}
          valueScale={{ type: "linear", min: "auto", max: "auto" }}
          colors={({ data }) => (Number(data.gap) < 0 ? COLORS.red : COLORS.green)}
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
            legend: "Difference from the official benchmark",
            legendPosition: "middle",
            legendOffset: 40,
          }}
          axisLeft={{ tickSize: 0, tickPadding: 8 }}
          theme={nivoTheme}
          animate
          motionConfig="gentle"
          role="img"
          ariaLabel="Company pay compared with the official market benchmark"
          tooltip={({ data }) => (
            <ChartTooltip
              title={String(data.company)}
              rows={[
                { label: "This salary", value: formatEuro(Number(data.amount), true) },
                { label: "Benchmark", value: baseline === null ? "—" : formatEuro(baseline.amount, true) },
                {
                  label: "Difference",
                  value: `${Number(data.gap) > 0 ? "+" : ""}${data.gap}%`,
                },
              ]}
            />
          )}
        />
      )}
    </ChartSection>
  );
}

export function NegotiationAskZone({ ctx }: { ctx: ChartContext }) {
  const rows = ctx.rows
    .flatMap((row) => {
      const negotiation = negotiationFor(ctx, row);
      if (
        negotiation.negotiationStatus !== "ready" ||
        negotiation.suggestedBaseMinimumEur === null ||
        negotiation.suggestedBaseMaximumEur === null
      ) return [];
      const current = payAmountFor(row.point, "base");
      return [{
        company: row.company.canonicalName,
        floor: thousands(negotiation.suggestedBaseMinimumEur),
        span: thousands(
          negotiation.suggestedBaseMaximumEur - negotiation.suggestedBaseMinimumEur,
        ),
        minimumEur: negotiation.suggestedBaseMinimumEur,
        maximumEur: negotiation.suggestedBaseMaximumEur,
        // Nivo bar data allows only string|number; a missing current figure
        // is carried as a formatted label rather than coerced to 0.
        currentLabel: current === null ? "—" : formatEuro(current, true),
        basis: negotiation.negotiationBasis,
      }];
    })
    .sort((a, b) => b.floor - a.floor);
  const shown = rows.slice(0, MAX_CHART_ITEMS);

  return (
    <ChartSection
      title="What you could defensibly ask for"
      description="The base-pay range the evidence supports asking for, per company. The bar is the ask zone — anchoring at its top is supportable; below its floor you are leaving money on the table."
      meta={truncateNote(rows.length, shown.length, "companies") ?? (shown.length > 0 ? `${shown.length} with a supportable range` : undefined)}
      heightPx={rowsHeight(shown.length, { rowPx: 30, minPx: 300 })}
    >
      {shown.length === 0 ? (
        <ChartEmpty>
          No company here has enough comparable evidence to support a specific ask. A range needs
          a figure at this exact level and location plus enough peers to place it.
        </ChartEmpty>
      ) : (
        <ResponsiveBar
          data={shown.slice().reverse()}
          keys={["floor", "span"]}
          indexBy="company"
          layout="horizontal"
          margin={{ top: 8, right: 44, bottom: 52, left: 100 }}
          padding={0.36}
          // The floor segment is invisible so the coloured segment reads as the
          // ask zone itself rather than as a total.
          colors={({ id }) => (id === "floor" ? "transparent" : COLORS.green)}
          borderRadius={3}
          enableLabel={false}
          enableGridX
          enableGridY={false}
          axisBottom={{
            tickSize: 4,
            tickPadding: 6,
            format: (value) => `€${value}k`,
            legend: "Supportable base-pay ask",
            legendPosition: "middle",
            legendOffset: 40,
          }}
          axisLeft={{ tickSize: 0, tickPadding: 8 }}
          theme={nivoTheme}
          animate
          motionConfig="gentle"
          role="img"
          ariaLabel="Supportable negotiation range by company"
          tooltip={({ data }) => (
            <ChartTooltip
              title={String(data.company)}
              rows={[
                {
                  label: "Ask zone",
                  value: `${formatEuro(Number(data.minimumEur), true)}–${formatEuro(Number(data.maximumEur), true)}`,
                },
                { label: "Currently listed", value: String(data.currentLabel) },
                { label: "Based on", value: String(data.basis) },
              ]}
            />
          )}
        />
      )}
    </ChartSection>
  );
}

export function EquityShareOfOffer({ ctx }: { ctx: ChartContext }) {
  const data = ctx.rows
    .flatMap((row) => {
      const share = equityShare(row.point);
      if (share === null) return [];
      return [{
        company: row.company.canonicalName,
        equity: share,
        cash: 100 - share,
        totalLabel: row.point?.totalCompEur == null
          ? "—"
          : formatEuro(row.point.totalCompEur, true),
        equityLabel: row.point?.equityEur == null
          ? "—"
          : `${formatEuro(row.point.equityEur, true)} / yr`,
      }];
    })
    .sort((a, b) => b.equity - a.equity);
  const shown = data.slice(0, MAX_CHART_ITEMS);

  return (
    <ChartSection
      title="How much of the offer is real money"
      description="Equity as a share of total compensation. A high equity share means more of the headline number depends on a share price and a vesting schedule — it is a genuine part of the offer, but it is not the same as cash in hand."
      meta={truncateNote(data.length, shown.length, "companies") ?? (shown.length > 0 ? `${shown.length} publish a split` : undefined)}
      heightPx={rowsHeight(shown.length, { rowPx: 30, minPx: 280 })}
    >
      {shown.length === 0 ? (
        <ChartEmpty>
          No company here publishes both a total and an equity figure at this level, so the
          cash-versus-equity split is unknown rather than assumed to be all cash.
        </ChartEmpty>
      ) : (
        <ResponsiveBar
          data={shown.slice().reverse()}
          keys={["cash", "equity"]}
          indexBy="company"
          layout="horizontal"
          margin={{ top: 8, right: 28, bottom: 86, left: 100 }}
          padding={0.34}
          valueScale={{ type: "linear", min: 0, max: 100 }}
          colors={[COLORS.green, COLORS.amber]}
          borderRadius={3}
          enableGridX
          enableGridY={false}
          enableLabel={false}
          axisBottom={{
            tickSize: 4,
            tickPadding: 6,
            tickValues: [0, 25, 50, 75, 100],
            format: (value) => `${value}%`,
            legend: "Share of total compensation",
            legendPosition: "middle",
            legendOffset: 40,
          }}
          axisLeft={{ tickSize: 0, tickPadding: 8 }}
          theme={nivoTheme}
          animate
          motionConfig="gentle"
          role="img"
          ariaLabel="Cash versus equity share of total compensation"
          legends={[{
            dataFrom: "keys", anchor: "bottom", direction: "row", translateY: 74,
            itemWidth: 92, itemHeight: 18, symbolSize: 9, symbolShape: "circle",
          }]}
          tooltip={({ data }) => (
            <ChartTooltip
              title={String(data.company)}
              rows={[
                { label: "Cash", value: `${data.cash}%` },
                { label: "Equity", value: `${data.equity}%` },
                { label: "Equity value", value: String(data.equityLabel) },
                { label: "Total", value: String(data.totalLabel) },
              ]}
            />
          )}
        />
      )}
    </ChartSection>
  );
}
