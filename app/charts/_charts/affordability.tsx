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
  truncateNote,
} from "@/app/charts/_lib/chart-kit";
import {
  costModeEmptyReason,
  type ChartContext,
} from "@/app/charts/_lib/chart-context";
import { personalMonthlyCostEur } from "@/lib/city-reference-costs";
import { formatEuro } from "@/lib/salary-analytics";

/**
 * "Can I afford to live there" — the same salary buys different lives in
 * different cities. Every figure is monthly, after tax, so it is directly
 * comparable to what someone actually budgets with.
 *
 * A shortfall is shown as a real negative number. Clamping it to zero would
 * make "cannot cover this city" indistinguishable from "exactly breaks even".
 */

export function CostShareOfPay({ ctx }: { ctx: ChartContext }) {
  const data = ctx.rows
    .flatMap((row) => {
      if (row.costSharePercent === null || row.netMonthly === null) return [];
      return [{
        company: row.company.canonicalName,
        share: Math.round(row.costSharePercent * 10) / 10,
        netMonthly: Math.round(row.netMonthly),
        // Nivo bar data allows only string|number, and a missing figure must
        // never become 0 — carry it as an already-formatted label instead.
        leftOverLabel: row.afterCostsMonthly === null
          ? "—"
          : `${formatEuro(row.afterCostsMonthly)} / mo`,
      }];
    })
    .sort((a, b) => a.share - b.share);
  const shown = data.slice(0, MAX_CHART_ITEMS);

  return (
    <ChartSection
      title="How much of your pay the city eats"
      description="Rent and essentials as a share of monthly net pay. Under ~35% is comfortable; above 50% the salary is doing most of its work just keeping you housed."
      meta={truncateNote(data.length, shown.length, "companies") ?? (shown.length > 0 ? `${shown.length} companies` : undefined)}
      heightPx={rowsHeight(shown.length, { rowPx: 30, minPx: 300 })}
    >
      {shown.length === 0 ? (
        <ChartEmpty>{costModeEmptyReason(ctx)}</ChartEmpty>
      ) : (
        <ResponsiveBar
          data={shown.slice().reverse()}
          keys={["share"]}
          indexBy="company"
          layout="horizontal"
          margin={{ top: 8, right: 40, bottom: 52, left: 100 }}
          padding={0.34}
          valueScale={{ type: "linear", min: 0, max: "auto" }}
          // Green under 35%, amber to 50%, red beyond: the colour carries the
          // judgement so the reader doesn't have to do the arithmetic.
          colors={({ data }) =>
            Number(data.share) < 35
              ? COLORS.green
              : Number(data.share) < 50
                ? COLORS.amber
                : COLORS.red
          }
          borderRadius={3}
          enableGridX
          enableGridY={false}
          enableLabel
          label={({ value }) => `${value}%`}
          labelSkipWidth={32}
          labelTextColor={COLORS.surface}
          axisBottom={{
            tickSize: 4,
            tickPadding: 6,
            format: (value) => `${value}%`,
            legend: `Share of net pay spent on living in ${ctx.location}`,
            legendPosition: "middle",
            legendOffset: 40,
          }}
          axisLeft={{ tickSize: 0, tickPadding: 8 }}
          theme={nivoTheme}
          animate
          motionConfig="gentle"
          role="img"
          ariaLabel="Living costs as a share of net pay by company"
          tooltip={({ data }) => (
            <ChartTooltip
              title={String(data.company)}
              rows={[
                { label: "Costs take", value: `${data.share}% of net` },
                { label: "Net pay", value: `${formatEuro(Number(data.netMonthly))} / mo` },
                { label: "Left over", value: String(data.leftOverLabel) },
              ]}
            />
          )}
        />
      )}
    </ChartSection>
  );
}

export function CostAdjustedRanking({ ctx }: { ctx: ChartContext }) {
  const data = ctx.rows
    .flatMap((row) => {
      if (row.afterCostsMonthly === null || row.netMonthly === null) return [];
      return [{
        company: row.company.canonicalName,
        leftOver: Math.round(row.afterCostsMonthly),
        netMonthly: Math.round(row.netMonthly),
        grossLabel: row.payroll === null
          ? "—"
          : `${formatEuro(Math.round(row.payroll.annualGrossCashEur / 12))} / mo`,
      }];
    })
    .sort((a, b) => b.leftOver - a.leftOver);
  const shown = data.slice(0, MAX_CHART_ITEMS);
  const anyNegative = shown.some((row) => row.leftOver < 0);

  return (
    <ChartSection
      title="What is actually left at the end of the month"
      description={`Monthly cash after tax and after ${ctx.costMode === "personal" ? "your own stated costs" : `${ctx.location} rent and essentials`}. This is the ranking that matters — a bigger salary in an expensive city can lose to a smaller one somewhere cheaper.${anyNegative ? " Negative bars mean the salary does not cover the city." : ""}`}
      meta={truncateNote(data.length, shown.length, "companies") ?? (shown.length > 0 ? `${shown.length} companies` : undefined)}
      heightPx={rowsHeight(shown.length, { rowPx: 30, minPx: 300 })}
    >
      {shown.length === 0 ? (
        <ChartEmpty>{costModeEmptyReason(ctx)}</ChartEmpty>
      ) : (
        <ResponsiveBar
          data={shown.slice().reverse()}
          keys={["leftOver"]}
          indexBy="company"
          layout="horizontal"
          margin={{ top: 8, right: 44, bottom: 52, left: 100 }}
          padding={0.34}
          valueScale={{ type: "linear", min: "auto", max: "auto" }}
          colors={({ data }) => (Number(data.leftOver) < 0 ? COLORS.red : COLORS.green)}
          borderRadius={3}
          enableGridX
          enableGridY={false}
          enableLabel
          label={({ value }) => formatEuro(Number(value), true)}
          labelSkipWidth={46}
          labelTextColor={COLORS.surface}
          axisBottom={{
            tickSize: 4,
            tickPadding: 6,
            format: (value) => formatEuro(Number(value), true),
            legend: "Cash left per month",
            legendPosition: "middle",
            legendOffset: 40,
          }}
          axisLeft={{ tickSize: 0, tickPadding: 8 }}
          theme={nivoTheme}
          animate
          motionConfig="gentle"
          role="img"
          ariaLabel="Monthly cash remaining after tax and living costs"
          tooltip={({ data }) => (
            <ChartTooltip
              title={String(data.company)}
              rows={[
                { label: "Gross", value: String(data.grossLabel) },
                { label: "After tax", value: `${formatEuro(Number(data.netMonthly))} / mo` },
                {
                  label: "After costs",
                  value: `${formatEuro(Number(data.leftOver))} / mo`,
                },
              ]}
            />
          )}
        />
      )}
    </ChartSection>
  );
}

export function CityCostBreakdown({ ctx }: { ctx: ChartContext }) {
  const bundle = ctx.cityCosts;
  const items = bundle === null || !bundle.current
    ? []
    : bundle.items
        .map((item) => ({
          label: item.label,
          amount: Math.round(item.monthlyAmount),
          category: item.category,
          referenceYear: item.referenceYear,
        }))
        .sort((a, b) => b.amount - a.amount);

  return (
    <ChartSection
      title={`What living in ${ctx.location} actually costs`}
      description="The official cost basket, broken into what you'd actually pay for each month. Rent normally dominates — the rest is what changes between a tight month and a comfortable one."
      meta={
        bundle !== null && bundle.current
          ? `Rent ${bundle.housingReferenceYear} · basket ${bundle.householdBudgetReferenceYear} · transport ${bundle.transportReferenceYear}`
          : undefined
      }
      heightPx={rowsHeight(Math.max(items.length, 3), { rowPx: 32, minPx: 280 })}
    >
      {items.length === 0 ? (
        <ChartEmpty>
          {bundle === null
            ? `No validated cost bundle covers ${ctx.location}. Only Madrid and Valencia have one so far — other cities show no cost figure rather than borrowing one.`
            : bundle.readinessNote ||
              `The ${ctx.location} cost bundle is missing required evidence, so no breakdown is published.`}
        </ChartEmpty>
      ) : (
        <ResponsiveBar
          data={items.slice().reverse()}
          keys={["amount"]}
          indexBy="label"
          layout="horizontal"
          margin={{ top: 8, right: 44, bottom: 52, left: 130 }}
          padding={0.32}
          colors={({ data }) => (data.category === "rent" ? COLORS.red : COLORS.blue)}
          borderRadius={3}
          enableGridX
          enableGridY={false}
          enableLabel
          label={({ value }) => formatEuro(Number(value))}
          labelSkipWidth={54}
          labelTextColor={COLORS.surface}
          axisBottom={{
            tickSize: 4,
            tickPadding: 6,
            format: (value) => formatEuro(Number(value)),
            legend: "€ per month",
            legendPosition: "middle",
            legendOffset: 40,
          }}
          axisLeft={{ tickSize: 0, tickPadding: 8 }}
          theme={nivoTheme}
          animate
          motionConfig="gentle"
          role="img"
          ariaLabel={`Monthly living cost breakdown for ${ctx.location}`}
          tooltip={({ data }) => (
            <ChartTooltip
              title={String(data.label)}
              rows={[
                { label: "Per month", value: formatEuro(Number(data.amount)) },
                { label: "Reference year", value: String(data.referenceYear) },
              ]}
            />
          )}
        />
      )}
    </ChartSection>
  );
}

export function PersonalVsReferenceBasket({ ctx }: { ctx: ChartContext }) {
  const personal = ctx.personalCost;
  const bundle = ctx.cityCosts;
  const hasBoth = personal !== null && bundle !== null && bundle.current;

  const rows = !hasBoth
    ? []
    : [
        {
          basket: "Your costs",
          Rent: Math.round(personal.rentEur),
          "Everything else": Math.round(
            personal.groceriesEur + personal.transportEur + personal.utilitiesEur + personal.otherEur,
          ),
          total: personalMonthlyCostEur(personal),
        },
        {
          basket: `${ctx.location} reference`,
          Rent: Math.round(bundle.monthlyRentEur),
          "Everything else": Math.round(bundle.monthlyEssentialsEur),
          total: Math.round(bundle.monthlyReferenceCostEur),
        },
      ];

  const updatedLabel = personal?.updatedAt
    ? new Date(personal.updatedAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : null;

  return (
    <ChartSection
      title="Your costs versus the city reference"
      description="Whether you live cheaper or dearer than the official basket. If your bar is well below the reference, every after-cost figure elsewhere is understating what you actually keep — and vice versa."
      meta={updatedLabel !== null ? `Your figures last updated ${updatedLabel}` : undefined}
      {...(rows.length === 0 ? { heightPx: 150 } : { height: "h-[320px]" })}
    >
      {rows.length === 0 ? (
        <ChartEmpty>
          {personal === null
            ? `Add your own monthly costs for ${ctx.location} in Settings to compare them against the official basket.`
            : `No validated cost bundle covers ${ctx.location}, so there is nothing to compare your figures against yet.`}
        </ChartEmpty>
      ) : (
        <ResponsiveBar
          data={rows}
          keys={["Rent", "Everything else"]}
          indexBy="basket"
          layout="horizontal"
          margin={{ top: 10, right: 28, bottom: 64, left: 130 }}
          padding={0.42}
          colors={[COLORS.red, COLORS.blue]}
          borderRadius={3}
          enableLabel={false}
          enableGridX
          enableGridY={false}
          axisBottom={{
            tickSize: 4,
            tickPadding: 6,
            format: (value) => formatEuro(Number(value)),
            legend: "€ per month",
            legendPosition: "middle",
            legendOffset: 40,
          }}
          axisLeft={{ tickSize: 0, tickPadding: 8 }}
          theme={nivoTheme}
          animate
          motionConfig="gentle"
          role="img"
          ariaLabel="Your monthly costs compared with the city reference basket"
          legends={[{
            dataFrom: "keys", anchor: "bottom", direction: "row", translateY: 54,
            itemWidth: 120, itemHeight: 18, symbolSize: 9, symbolShape: "circle",
          }]}
          tooltip={({ data }) => (
            <ChartTooltip
              title={String(data.basket)}
              rows={[
                { label: "Rent", value: formatEuro(Number(data.Rent)) },
                { label: "Everything else", value: formatEuro(Number(data["Everything else"])) },
                { label: "Total", value: `${formatEuro(Number(data.total))} / mo` },
              ]}
            />
          )}
        />
      )}
    </ChartSection>
  );
}
