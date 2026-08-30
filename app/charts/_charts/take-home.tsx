"use client";

import { ResponsiveBar } from "@nivo/bar";
import { ResponsiveLine } from "@nivo/line";

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
  payrollEmptyReason,
  type ChartContext,
} from "@/app/charts/_lib/chart-context";
import { estimateSpainPayroll2026, SPAIN_PAYROLL_2026_PARAMETERS } from "@/lib/spain-payroll-2026";
import { formatEuro } from "@/lib/salary-analytics";

/**
 * "What I actually keep" — the gap between an advertised salary and money in
 * the account. Every figure here comes from the version-pinned 2026 model in
 * lib/spain-payroll-2026.ts.
 *
 * The model assumes personal situation 3, no dependants, 12 pay periods and a
 * 1995 birth year. Those assumptions are stated on the charts rather than
 * buried in a methodology dialog, because they materially move the number.
 */

const MODEL_ASSUMPTIONS =
  "Assumes personal situation 3, no dependants, 12 pay periods. Equity is excluded — this is cash only.";

/** Gross salaries to sweep the payroll model across, in euros. Starts above
 * the minimum contribution base, below which the model yields a negative net. */
function sweepPoints(): number[] {
  const points: number[] = [];
  for (let gross = 24_000; gross <= 150_000; gross += 9_000) points.push(gross);
  return points;
}

export function NetPayCurve({ ctx }: { ctx: ChartContext }) {
  if (!ctx.payrollReady) {
    return (
      <ChartSection
        title="What an offer actually becomes"
        description="Annual gross against annual net, across the whole salary range."
        heightPx={150}
      >
        <ChartEmpty>{payrollEmptyReason(ctx)}</ChartEmpty>
      </ChartSection>
    );
  }

  const sweep = sweepPoints().flatMap((gross) => {
    const estimate = estimateSpainPayroll2026(gross);
    return estimate === null ? [] : [{ x: gross / 1_000, y: Math.round(estimate.annualNetCashEur / 1_000) }];
  });

  // Your companies, marked on the same curve, so the abstract line becomes
  // "here is where each actual offer sits". Sorted by x: ctx.rows is ordered
  // by pay, and monotoneX interpolation produces NaN coordinates when a
  // series' x values are not ascending.
  const marks = ctx.rows
    .flatMap((row) => {
      if (row.payroll === null) return [];
      return [{
        x: Math.round(row.payroll.annualGrossCashEur / 1_000),
        y: Math.round(row.payroll.annualNetCashEur / 1_000),
        company: row.company.canonicalName,
      }];
    })
    .sort((a, b) => a.x - b.x);

  return (
    <ChartSection
      title="What an offer actually becomes"
      description={`Gross salary against what reaches your account after social security and IRPF. ${MODEL_ASSUMPTIONS}`}
      meta={marks.length > 0 ? `${marks.length} of your companies marked` : undefined}
      height="h-[360px]"
    >
      <ResponsiveLine
        data={[
          { id: "Net after tax", data: sweep },
          ...(marks.length > 0
            ? [{ id: "Your companies", data: marks.map(({ x, y }) => ({ x, y })) }]
            : []),
        ]}
        margin={{ top: 18, right: 28, bottom: 52, left: 66 }}
        xScale={{ type: "linear", min: 24, max: 150 }}
        yScale={{ type: "linear", min: 0, max: "auto" }}
        curve="monotoneX"
        colors={[COLORS.green, COLORS.amber]}
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
          tickPadding: 6,
          // Explicit, widely-spaced ticks: the default density collides on a
          // narrow viewport and renders as one unreadable run of numbers.
          tickValues: [24, 50, 75, 100, 125, 150],
          format: (value) => `€${value}k`,
          legend: "Gross salary",
          legendPosition: "middle",
          legendOffset: 40,
        }}
        axisLeft={{
          tickSize: 4,
          tickPadding: 6,
          format: (value) => `€${value}k`,
          legend: "Net after tax",
          legendPosition: "middle",
          legendOffset: -54,
        }}
        theme={nivoTheme}
        animate
        motionConfig="gentle"
        role="img"
        ariaLabel="Gross salary against net pay after Spanish payroll"
      />
    </ChartSection>
  );
}

export function EffectiveRateCurve({ ctx }: { ctx: ChartContext }) {
  if (!ctx.payrollReady) {
    return (
      <ChartSection
        title="What each extra €1,000 really costs you"
        description="The share of gross salary lost to social security and IRPF, at every salary level."
        heightPx={150}
      >
        <ChartEmpty>{payrollEmptyReason(ctx)}</ChartEmpty>
      </ChartSection>
    );
  }

  const sweep = sweepPoints().flatMap((gross) => {
    const estimate = estimateSpainPayroll2026(gross);
    return estimate === null
      ? []
      : [{ x: gross / 1_000, y: Math.round(estimate.effectiveDeductionRatePercent * 10) / 10 }];
  });

  return (
    <ChartSection
      title="What each extra €1,000 really costs you"
      description="Total deductions as a share of gross. Where this curve steepens, a raise is worth noticeably less than its headline — useful when weighing a counter-offer."
      meta="Social security + IRPF combined"
      height="h-[360px]"
    >
      <ResponsiveLine
        data={[{ id: "Effective deduction rate", data: sweep }]}
        margin={{ top: 18, right: 28, bottom: 52, left: 60 }}
        xScale={{ type: "linear", min: 24, max: 150 }}
        yScale={{ type: "linear", min: 0, max: "auto" }}
        curve="monotoneX"
        colors={[COLORS.red]}
        lineWidth={3}
        enablePoints={false}
        enableArea
        areaOpacity={0.08}
        enableGridX={false}
        enableGridY
        useMesh
        enableSlices="x"
        axisBottom={{
          tickSize: 4,
          tickPadding: 6,
          // Explicit, widely-spaced ticks: the default density collides on a
          // narrow viewport and renders as one unreadable run of numbers.
          tickValues: [24, 50, 75, 100, 125, 150],
          format: (value) => `€${value}k`,
          legend: "Gross salary",
          legendPosition: "middle",
          legendOffset: 40,
        }}
        axisLeft={{
          tickSize: 4,
          tickPadding: 6,
          format: (value) => `${value}%`,
          legend: "Kept back",
          legendPosition: "middle",
          legendOffset: -48,
        }}
        theme={nivoTheme}
        animate
        motionConfig="gentle"
        role="img"
        ariaLabel="Effective deduction rate across gross salary"
      />
    </ChartSection>
  );
}

export function TaxBandSchedule() {
  // The statutory IRPF scale itself — where the brackets actually sit, so a
  // salary can be read against them rather than guessed at.
  const bands = SPAIN_PAYROLL_2026_PARAMETERS.aeatWithholding.scale.map((band) => ({
    band: band.upperEur === null
      ? `Over €${Math.round(band.lowerEur / 1_000)}k`
      : `€${Math.round(band.lowerEur / 1_000)}k–€${Math.round(band.upperEur / 1_000)}k`,
    rate: Math.round(band.rate * 100),
    appliesTo: band.upperEur === null
      ? `income above ${formatEuro(band.lowerEur, true)}`
      : `${formatEuro(band.lowerEur, true)}–${formatEuro(band.upperEur, true)}`,
  }));

  return (
    <ChartSection
      title="Where the tax brackets sit"
      description="The 2026 IRPF marginal rates. Income inside each band is taxed at that band's rate — crossing a boundary never re-taxes what you already earned, but it does change what the next euro is worth."
      meta="Official AEAT 2026 withholding scale"
      heightPx={rowsHeight(bands.length, { rowPx: 34, minPx: 300 })}
    >
      <ResponsiveBar
        data={bands.slice().reverse()}
        keys={["rate"]}
        indexBy="band"
        layout="horizontal"
        margin={{ top: 8, right: 40, bottom: 52, left: 110 }}
        padding={0.32}
        valueScale={{ type: "linear", min: 0, max: 50 }}
        colors={[COLORS.blue]}
        borderRadius={3}
        enableGridX
        enableGridY={false}
        enableLabel
        label={({ value }) => `${value}%`}
        labelSkipWidth={28}
        labelTextColor={COLORS.surface}
        axisBottom={{
          tickSize: 4,
          tickPadding: 6,
          format: (value) => `${value}%`,
          legend: "Marginal rate on income in this band",
          legendPosition: "middle",
          legendOffset: 40,
        }}
        axisLeft={{ tickSize: 0, tickPadding: 8 }}
        theme={nivoTheme}
        animate
        motionConfig="gentle"
        role="img"
        ariaLabel="2026 IRPF marginal tax bands"
        tooltip={({ data }) => (
          <ChartTooltip
            title={String(data.band)}
            rows={[
              { label: "Marginal rate", value: `${data.rate}%` },
              { label: "Applies to", value: String(data.appliesTo) },
            ]}
          />
        )}
      />
    </ChartSection>
  );
}

export function TakeHomeWaterfall({ ctx }: { ctx: ChartContext }) {
  const data = ctx.rows
    .flatMap((row) => {
      if (row.payroll === null) return [];
      return [{
        company: row.company.canonicalName,
        "Social security": Math.round(row.payroll.annualEmployeeSocialSecurityEur / 1_000),
        IRPF: Math.round(row.payroll.annualIrpfWithholdingEur / 1_000),
        "Take-home": Math.round(row.payroll.annualNetCashEur / 1_000),
        grossEur: row.payroll.annualGrossCashEur,
        netEur: row.payroll.annualNetCashEur,
        ratePercent: row.payroll.effectiveDeductionRatePercent,
      }];
    })
    .sort((a, b) => b["Take-home"] - a["Take-home"]);
  const shown = data.slice(0, MAX_CHART_ITEMS);

  return (
    <ChartSection
      title="Where your salary goes, company by company"
      description={`Each bar is one company's gross split into what the state takes and what you keep. ${MODEL_ASSUMPTIONS}`}
      meta={truncateNote(data.length, shown.length, "companies") ?? (shown.length > 0 ? `${shown.length} companies` : undefined)}
      {...(shown.length === 0 ? { heightPx: 150 } : { height: "h-[400px] lg:h-[440px]" })}
    >
      {shown.length === 0 ? (
        <ChartEmpty>{payrollEmptyReason(ctx)}</ChartEmpty>
      ) : (
        <ResponsiveBar
          data={shown}
          keys={["Take-home", "Social security", "IRPF"]}
          indexBy="company"
          margin={{ top: 10, right: 20, bottom: 82, left: 58 }}
          padding={0.32}
          colors={[COLORS.green, COLORS.pale, COLORS.red]}
          borderRadius={3}
          axisBottom={{ tickSize: 0, tickPadding: 10, tickRotation: -32 }}
          axisLeft={{
            tickSize: 0,
            tickPadding: 8,
            format: (value) => `€${value}k`,
            legend: "Annual, gross split",
            legendOffset: -48,
            legendPosition: "middle",
          }}
          enableLabel={false}
          theme={nivoTheme}
          animate
          motionConfig="gentle"
          role="img"
          ariaLabel="Annual gross split into take-home, social security and income tax"
          legends={[{
            dataFrom: "keys", anchor: "bottom", direction: "row", translateY: 70,
            itemWidth: 108, itemHeight: 18, symbolSize: 9, symbolShape: "circle",
          }]}
          tooltip={({ data }) => (
            <ChartTooltip
              title={String(data.company)}
              rows={[
                { label: "Gross", value: formatEuro(Number(data.grossEur), true) },
                { label: "Social security", value: `−€${data["Social security"]}k` },
                { label: "IRPF", value: `−€${data.IRPF}k` },
                { label: "You keep", value: formatEuro(Number(data.netEur), true) },
                { label: "Kept back", value: `${Math.round(Number(data.ratePercent) * 10) / 10}%` },
              ]}
            />
          )}
        />
      )}
    </ChartSection>
  );
}
