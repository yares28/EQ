"use client";

import { Suspense, startTransition, useDeferredValue, useMemo, useState } from "react";
import { ResponsiveBar } from "@nivo/bar";
import { ResponsiveLine } from "@nivo/line";
import { ResponsiveScatterPlot, type ScatterPlotDatum } from "@nivo/scatterplot";

import { InfoDialog, PageHeader, PageShell } from "@/components/eq/page-shell";
import { SegmentedControl } from "@/components/eq/segmented-control";
import { useCompanyCatalog } from "@/components/eq/use-company-catalog";
import { useSalaryDecisionContext } from "@/components/eq/use-salary-decision-context";
import { useShortlist } from "@/components/eq/use-shortlist";
import { DecisionLocationSelect } from "@/components/eq/decision-location-select";
import { SettingsDialog } from "@/components/eq/settings-dialog";
import { PodiumBand, type BandStat } from "@/components/eq/podium-band";
import { formatIsoDay, signedPercent } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  decisionLocationMatches,
  postedLocationMatches,
} from "@/lib/company-research-catalog";
import {
  estimateCashAfterCityReferenceCosts,
  estimateCashAfterPersonalCosts,
  personalCostForLocation,
  personalMonthlyCostEur,
} from "@/lib/city-reference-costs";
import {
  estimateSpainPayroll2026,
  type SpainPayrollEstimate2026,
} from "@/lib/spain-payroll-2026";
import type { ChartContext } from "@/app/charts/_lib/chart-context";
import {
  COLORS,
  CONFIDENCE_COLORS,
  ChartEmpty,
  ChartGroupHeader,
  ChartSection,
  ChartTooltip,
  MAX_CHART_ITEMS,
  SERIES_COLORS,
  SeriesLegend,
  confidenceText,
  median,
  nivoTheme,
  rowsHeight,
  thousands,
  truncateNote,
} from "@/app/charts/_lib/chart-kit";
import {
  EffectiveRateCurve,
  NetPayCurve,
  TakeHomeWaterfall,
  TaxBandSchedule,
} from "@/app/charts/_charts/take-home";
import {
  CityCostBreakdown,
  CostAdjustedRanking,
  CostShareOfPay,
  PersonalVsReferenceBasket,
} from "@/app/charts/_charts/affordability";
import {
  EquityShareOfOffer,
  MarketPercentile,
  NegotiationAskZone,
  PayVersusMarketBenchmark,
} from "@/app/charts/_charts/market-position";
import {
  FullLevelPayCurve,
  ProjectedPath,
  PromotionJumpSize,
} from "@/app/charts/_charts/progression";
import { ChartExplorer } from "@/app/charts/_charts/explorer";
import { HiringChurn, HiringVolumeOverTime } from "@/app/charts/_charts/hiring-momentum";
import { opinionForCompany } from "@/lib/company-opinions";
import {
  decisionProgressionFor,
  formatEuro,
  isPostedSalaryPoint,
  payAmountFor,
  pointForLevel,
  targetLevelLabels,
  type TargetLevel,
} from "@/lib/salary-analytics";
import {
  levelLabels,
  requiredSalaryLevels,
  type Confidence,
  type SalaryCompany,
  type SalaryPoint,
} from "@/lib/salary-data";
import {
  cityCostKeyForLocation,
  type CostMode,
  type DecisionLocation,
  type PayBasis,
} from "@/lib/salary-decision-context";

type LocationFilter = DecisionLocation;

interface SalaryBarDatum {
  company: string;
  totalComp: number;
  base: number;
  confidence: Confidence;
  location: string;
  [key: string]: string | number;
}

interface OpinionBarDatum {
  company: string;
  score: number;
  confidence: Confidence;
  scope: string;
  [key: string]: string | number;
}

interface PaySentimentDatum extends ScatterPlotDatum {
  x: number;
  y: number;
  company: string;
  location: string;
  salaryConfidence: Confidence;
  /** Present only when the X metric is sentiment; null otherwise. */
  opinionConfidence: Confidence | null;
  xLabel: string;
}

interface CompositionDatum {
  company: string;
  Base: number;
  Bonus: number;
  Stock: number;
  /** "posting" or "page" — kept as a string because a bar datum holds no booleans. */
  origin: string;
  [key: string]: string | number;
}

interface TakeHomeDatum {
  company: string;
  Gross: number;
  Net: number;
  /** 0 means "no cost data", which the tooltip states rather than plotting as a value. */
  "After costs": number;
  hasCostData: string;
  [key: string]: string | number;
}

const LEVEL_OPTIONS: { value: TargetLevel; label: string }[] = [
  { value: "intern", label: "Intern" },
  { value: "junior", label: "SDE1" },
  { value: "mid", label: "SDE2" },
];

const PAY_BASIS_OPTIONS: { value: PayBasis; label: string }[] = [
  { value: "base", label: "Base pay" },
  { value: "total", label: "Total pay" },
];

const COST_MODE_OPTIONS: { value: CostMode; label: string }[] = [
  { value: "off", label: "No costs" },
  { value: "reference", label: "Reference" },
  { value: "personal", label: "My costs" },
];

type ChartScope = "all" | "shortlist";

const SCOPE_OPTIONS: { value: ChartScope; label: string }[] = [
  { value: "all", label: "All companies" },
  { value: "shortlist", label: "Favourites" },
];

type ScatterXMetric = "sentiment" | "net" | "afterCosts" | "progression";

const SCATTER_X_OPTIONS: { value: ScatterXMetric; label: string }[] = [
  { value: "sentiment", label: "Employee sentiment" },
  { value: "net", label: "Net take-home" },
  { value: "afterCosts", label: "After living costs" },
  { value: "progression", label: "Next-level jump" },
];

function sameLocationSeries(companies: SalaryCompany[], location: LocationFilter) {
  return companies.flatMap((company) => {
    const groups = new Map<string, SalaryPoint[]>();

    company.salaryPoints
      .filter(
        (point) =>
          // Base keeps employer-posted companies in the chart; they publish no total.
          point.baseEur !== null &&
          point.baseEur !== undefined &&
          decisionLocationMatches(point.location, location),
      )
      .forEach((point) => {
        const scope = point.location === "Spain-wide" ? location : point.location;
        groups.set(scope, [...(groups.get(scope) ?? []), point]);
      });

    const bestGroup = [...groups.entries()]
      .filter(([, points]) => points.length >= 2)
      .sort((a, b) => b[1].length - a[1].length)[0];

    if (!bestGroup) return [];
    const [scope, points] = bestGroup;
    const byLevel = new Map(points.map((point) => [point.level, point]));

    // x is the level's index, not its label: a null y placeholder makes Nivo
    // render a point with a NaN radius, and a point scale would take its
    // category order from whichever company happened to be first.
    const series = requiredSalaryLevels.flatMap((level, index) => {
      const point = byLevel.get(level);
      return point?.baseEur ? [{ x: index, y: thousands(point.baseEur) }] : [];
    });

    // A company whose pay sits outside the plotted levels — Elastic publishes
    // senior and principal only — yields a series with nothing to join, and the
    // line renderer emits an invalid path for it.
    if (series.length < 2) return [];

    return [{ id: `${company.canonicalName} · ${scope}`, data: series }];
  });
}

export default function ChartsPage() {
  const {
    targetLevel,
    location,
    payBasis,
    costMode,
    setTargetLevel,
    setLocation,
    setPayBasis,
    setCostMode,
  } = useSalaryDecisionContext();
  const { companies: catalogCompanies, postedRanges } = useCompanyCatalog();
  const shortlist = useShortlist();
  const [scope, setScope] = useState<ChartScope>("all");
  const [search, setSearch] = useState("");
  const [scatterXMetric, setScatterXMetric] = useState<ScatterXMetric>("sentiment");
  const settings = useQuery(api.settings.get);
  const payrollModel = useQuery(api.payrollResearch.activeSpainPayrollModel);
  const marketBenchmarks = useQuery(api.salaryMarketResearch.latestBenchmarks);
  const deferredLevel = useDeferredValue(targetLevel);
  const deferredLocation = useDeferredValue(location);
  const cityCostKey = costMode === "reference" ? cityCostKeyForLocation(deferredLocation) : null;
  const cityLivingCosts = useQuery(
    api.madridCostResearch.latestCityLivingCosts,
    cityCostKey === null ? "skip" : { cityKey: cityCostKey },
  );
  const personalCost = costMode === "personal"
    ? personalCostForLocation(settings?.personalCityCosts, deferredLocation)
    : null;

  /** Payroll, net cash, and what survives the active cost mode for one salary
   * point. Every component is null when the evidence can't support it —
   * interns are excluded by policy (the model isn't calibrated for stipends),
   * and an unvalidated payroll model produces nothing at all. */
  function monthlyEconomics(point: SalaryPoint | null): {
    payroll: SpainPayrollEstimate2026 | null;
    netMonthly: number | null;
    afterCostsMonthly: number | null;
    costSharePercent: number | null;
  } {
    const empty = { payroll: null, netMonthly: null, afterCostsMonthly: null, costSharePercent: null };
    if (point === null || point.baseEur == null) return empty;
    const annualCash = point.baseEur + (point.bonusEur ?? 0) + (point.extrasEur ?? 0);
    const payroll = payrollModel?.current === true && deferredLevel !== "intern"
      ? estimateSpainPayroll2026(annualCash)
      : null;
    if (payroll === null) return empty;

    if (personalCost !== null) {
      const afterCostsMonthly = estimateCashAfterPersonalCosts(
        payroll.monthlyNetCashEur,
        personalCost,
      );
      const personalTotal = personalMonthlyCostEur(personalCost);
      return {
        payroll,
        netMonthly: payroll.monthlyNetCashEur,
        afterCostsMonthly,
        costSharePercent: payroll.monthlyNetCashEur > 0
          ? (personalTotal / payroll.monthlyNetCashEur) * 100
          : null,
      };
    }

    if (cityCostKey !== null && cityLivingCosts?.current === true) {
      const reference = estimateCashAfterCityReferenceCosts(
        payroll.monthlyNetCashEur,
        cityLivingCosts.monthlyRentEur,
        cityLivingCosts.monthlyEssentialsEur,
      );
      return {
        payroll,
        netMonthly: payroll.monthlyNetCashEur,
        afterCostsMonthly: reference?.monthlyCashAfterReferenceCostsEur ?? null,
        costSharePercent: reference?.referenceCostSharePercent ?? null,
      };
    }

    return {
      payroll,
      netMonthly: payroll.monthlyNetCashEur,
      afterCostsMonthly: null,
      costSharePercent: null,
    };
  }

  // "Why those 4 companies?" — selection is explicit and visible, never an
  // accident of which companies happen to have evidence. Scope narrows the
  // population every chart below draws from; the search box narrows further.
  const scopedCompanies = useMemo(() => {
    const bySlug = scope === "shortlist"
      ? catalogCompanies.filter((company) => shortlist.companies.has(company.slug))
      : catalogCompanies;
    const query = search.trim().toLowerCase();
    if (query === "") return bySlug;
    return bySlug.filter((company) => company.canonicalName.toLowerCase().includes(query));
  }, [catalogCompanies, scope, search, shortlist.companies]);

  const companies = scopedCompanies;

  const salaryRowsWithEvidence = companies
    .map((company) => ({
      company,
      point: pointForLevel(company, deferredLevel, deferredLocation, payBasis),
      opinion: opinionForCompany(company.slug),
    }))
    .filter((row) => row.point !== null && payAmountFor(row.point, payBasis) !== null)
    .sort(
      (a, b) =>
        (payAmountFor(b.point, payBasis) ?? 0) - (payAmountFor(a.point, payBasis) ?? 0),
    );
  // "What if I have 60 companies?" — every chart built from this population
  // caps at MAX_CHART_ITEMS (already sorted by pay, so this keeps the
  // highest-paying rows) and reports the true count separately so nothing
  // silently hides how big the real population is.
  const salaryRowsTotalCount = salaryRowsWithEvidence.length;
  const salaryRows = salaryRowsWithEvidence.slice(0, MAX_CHART_ITEMS);

  const salaryData: SalaryBarDatum[] = salaryRows.map(({ company, point }) => ({
    company: company.canonicalName,
    totalComp: thousands(payAmountFor(point, payBasis) ?? 0),
    base: thousands(point?.baseEur ?? 0),
    confidence: point?.confidence ?? "Unknown",
    location: point?.locationLabel ?? "—",
  }));

  const opinionDataAll: OpinionBarDatum[] = companies
    .map((company) => ({ company, opinion: opinionForCompany(company.slug) }))
    .filter(({ opinion }) => opinion.score !== null)
    .map(({ company, opinion }) => ({
      company: company.canonicalName,
      score: opinion.score ?? 0,
      confidence: opinion.confidence,
      scope: opinion.evidenceScope,
    }))
    .sort((a, b) => b.score - a.score);
  const opinionData = opinionDataAll.slice(0, MAX_CHART_ITEMS);

  // "Pay versus employee sentiment" used to only ever plot sentiment on X.
  // The X metric is now user-selectable — each option pulls from data the
  // app already computes elsewhere rather than inventing a fake per-company
  // "cost of living" (cost of living is a property of the city, not the
  // company; what genuinely varies by company is what's left after costs).
  function scatterXValue(
    row: (typeof salaryRows)[number],
  ): { value: number; confidence: Confidence | null; label: string } | null {
    switch (scatterXMetric) {
      case "sentiment": {
        if (row.opinion.score === null) return null;
        return { value: row.opinion.score, confidence: row.opinion.confidence, label: `${row.opinion.score} / 5` };
      }
      case "net": {
        const { netMonthly } = monthlyEconomics(row.point);
        if (netMonthly === null) return null;
        return { value: netMonthly, confidence: null, label: `${formatEuro(netMonthly, true)}/mo` };
      }
      case "afterCosts": {
        const { afterCostsMonthly } = monthlyEconomics(row.point);
        if (afterCostsMonthly === null) return null;
        return { value: afterCostsMonthly, confidence: null, label: `${formatEuro(afterCostsMonthly, true)}/mo` };
      }
      case "progression": {
        const progression = decisionProgressionFor(row.company, deferredLevel, deferredLocation);
        if (progression === null || !progression.decisionGrade) return null;
        return { value: progression.percent, confidence: null, label: `${progression.percent > 0 ? "+" : ""}${progression.percent}%` };
      }
    }
  }

  const scatterXLabel = SCATTER_X_OPTIONS.find((option) => option.value === scatterXMetric)?.label ?? "";

  const paySentimentDataAll = salaryRows.flatMap((row) => {
    if (payAmountFor(row.point, payBasis) === null) return [];
    const x = scatterXValue(row);
    if (x === null) return [];
    return [{
      id: row.company.canonicalName,
      data: [
        {
          x: x.value,
          y: thousands(payAmountFor(row.point, payBasis) ?? 0),
          company: row.company.canonicalName,
          location: row.point?.locationLabel ?? "—",
          salaryConfidence: row.point?.confidence ?? "Unknown",
          opinionConfidence: x.confidence,
          xLabel: x.label,
        } satisfies PaySentimentDatum,
      ],
    }];
  });
  const paySentimentData = paySentimentDataAll.slice(0, MAX_CHART_ITEMS);

  // The X domain comes from the actual data for whichever metric is active —
  // never a hardcoded range tuned for one metric (sentiment used to hardcode
  // 2.5–5 while real scores span 2.8–3.6, permanently emptying the right half).
  const scatterXValues = paySentimentData.map((series) => series.data[0].x);
  const scatterXDomain: [number, number] = scatterXValues.length === 0
    ? [0, 1]
    : (() => {
        const min = Math.min(...scatterXValues);
        const max = Math.max(...scatterXValues);
        const pad = Math.max((max - min) * 0.1, max === min ? Math.abs(max || 1) * 0.1 : 0);
        return [min - pad, max + pad];
      })();


  const progressionData = sameLocationSeries(companies, deferredLocation);

  // 1. What the pay is actually made of. Posted rows show base only, which is
  //    the honest shape: the employer never stated bonus or stock.
  const compositionData: CompositionDatum[] = salaryRows
    .flatMap(({ company, point }) => {
      if (point === null || point.baseEur == null) return [];
      return [{
        company: company.canonicalName,
        Base: thousands(point.baseEur),
        Bonus: thousands(point.bonusEur ?? 0),
        Stock: thousands(point.equityEur ?? 0),
        origin: isPostedSalaryPoint(point) ? "Employer posting" : "Sourced page",
      }];
    })
    .sort((a, b) => b.Base + b.Bonus + b.Stock - (a.Base + a.Bonus + a.Stock))
    .slice(0, MAX_CHART_ITEMS);

  // 2. The bands employers actually published, as spans rather than points.
  const bandRowsAll = postedRanges
    .filter((range) => postedLocationMatches(range, deferredLocation))
    .filter((range) => range.period === "year")
    .map((range) => ({
      key: `${range.companySlug}:${range.level}:${range.locationLabel}:${range.minimumAmount}`,
      label: `${range.company} · ${levelLabels[range.level]}`,
      floor: thousands(range.minimumAmount),
      span: thousands(range.maximumAmount - range.minimumAmount),
      minimumAmount: range.minimumAmount,
      maximumAmount: range.maximumAmount,
      locationLabel: range.locationLabel,
    }))
    .filter((row, index, all) => all.findIndex((item) => item.key === row.key) === index)
    .sort((a, b) => a.floor - b.floor);
  const bandRows = bandRowsAll.slice(0, MAX_CHART_ITEMS);

  // 3. Gross base, what reaches the account, and what survives city costs.
  const takeHomeData: TakeHomeDatum[] = salaryRows
    .flatMap(({ company, point }) => {
      if (point === null || point.baseEur == null) return [];
      const annualCash = point.baseEur + (point.bonusEur ?? 0) + (point.extrasEur ?? 0);
      const payroll = payrollModel?.current === true && deferredLevel !== "intern"
        ? estimateSpainPayroll2026(annualCash)
        : null;
      if (payroll === null) return [];
      const afterCosts = personalCost !== null
        ? estimateCashAfterPersonalCosts(payroll.monthlyNetCashEur, personalCost)
        : cityCostKey !== null && cityLivingCosts?.current === true
          ? estimateCashAfterCityReferenceCosts(
              payroll.monthlyNetCashEur,
              cityLivingCosts.monthlyRentEur,
              cityLivingCosts.monthlyEssentialsEur,
            )?.monthlyCashAfterReferenceCostsEur ?? null
          : null;
      return [{
        company: company.canonicalName,
        Gross: Math.round(annualCash / 12),
        Net: Math.round(payroll.monthlyNetCashEur),
        // A real shortfall can be negative — never clamp it to the "no data"
        // sentinel of 0. `hasCostData` is the only signal for "no data".
        "After costs": afterCosts === null ? 0 : Math.round(afterCosts),
        hasCostData: afterCosts === null ? "no" : "yes",
      }];
    })
    // Single-metric sort: rank on "After costs" only among rows that have it,
    // on Net only among rows that don't — never compare one row's after-cost
    // figure against another row's net figure.
    .sort((a, b) => {
      if (a.hasCostData === "yes" && b.hasCostData === "yes") {
        return b["After costs"] - a["After costs"];
      }
      if (a.hasCostData === "yes") return -1;
      if (b.hasCostData === "yes") return 1;
      return b.Net - a.Net;
    });

  // Only offer the after-cost series when something can actually fill it;
  // an empty legend entry promises a bar that will never appear.
  const takeHomeKeys = takeHomeData.some((row) => row.hasCostData === "yes")
    ? ["Gross", "Net", "After costs"]
    : ["Gross", "Net"];

  // Everything the decision-question chart modules need, resolved once here so
  // no chart re-derives payroll or cost figures during render.
  const chartContext: ChartContext = {
    companies,
    rows: salaryRows.map(({ company, point }) => {
      const economics = monthlyEconomics(point);
      return { company, point, ...economics };
    }),
    rowsTotalCount: salaryRowsTotalCount,
    postedRanges,
    level: deferredLevel,
    location: deferredLocation,
    payBasis,
    costMode,
    payrollReady: payrollModel?.current === true,
    cityCosts: cityLivingCosts ?? null,
    personalCost,
    benchmarks: marketBenchmarks ?? [],
  };

  // The median must reflect the whole population, not just the chart's
  // top-N cap — capping first would skew the median upward.
  const totals = salaryRowsWithEvidence.flatMap((row) => {
    const amount = payAmountFor(row.point, payBasis);
    return amount === null ? [] : [amount];
  });
  const medianComp = median(totals);
  const topPay = salaryRowsWithEvidence[0] ?? null;
  // The spread the median sits inside. Nothing on the page said it, and it is
  // the single most useful fact about a distribution.
  const paySpread =
    totals.length > 1 ? Math.max(...totals) - Math.min(...totals) : null;
  const topGrowth = companies
    .map((company) => ({
      company,
      progression: decisionProgressionFor(company, deferredLevel, deferredLocation),
    }))
    .filter((row) => row.progression !== null && row.progression.decisionGrade)
    .sort(
      (a, b) =>
        (b.progression?.percent ?? Number.NEGATIVE_INFINITY) -
        (a.progression?.percent ?? Number.NEGATIVE_INFINITY)
    )[0] ?? null;

  const chartStats: BandStat[] = [
    { label: "Median", value: formatEuro(medianComp, true) },
    { label: "Highest", value: formatEuro(payAmountFor(topPay?.point ?? null, payBasis), true) },
    { label: "Spread", value: formatEuro(paySpread, true) },
    {
      label: `Best ${targetLevelLabels[deferredLevel]} step`,
      value: topGrowth?.progression ? signedPercent(topGrowth.progression.percent) : "—",
    },
    {
      label: "Coverage",
      value: String(salaryRowsTotalCount),
      suffix: ` of ${companies.length}`,
    },
    {
      label: "Checked",
      value: topPay ? formatIsoDay(topPay.company.lastResearchedAt) : "—",
    },
  ];

  return (
    <PageShell width="wide">
      <PageHeader
        title="Charts"
        action={
          <InfoDialog
            title="Chart methodology"
            description="How missing data and location scope are handled."
          >
            <div className="space-y-4">
              <p>
                Salary charts use employer-posted annual base pay from the public
                career page when that posting qualifies. Companies without a matching
                posting can still appear from sourced public salary pages. The two
                sources are never mixed inside one bar.
              </p>
              <p>
                Progression lines connect levels only when the company reports at least
                two requested levels in exactly the same location scope. Madrid and
                National datapoints are never joined across cities.
              </p>
              <p>
                Employee sentiment is the separate Reddit-based editorial score. Its
                confidence does not change salary confidence.
              </p>
            </div>
          </InfoDialog>
        }
      />

      {/* The band, then one control bar — the same shape as salary and compare.
          No podium: this page is not a ranking, and the first chart below
          already ranks the companies, so a podium would say it twice. */}
      <PodiumBand
        eyebrow={`${targetLevelLabels[deferredLevel]} · ${location} · ${salaryRowsTotalCount} sourced of ${companies.length}`}
        rankedOn="This view, in numbers"
        statsLabel="This view, in numbers"
        stats={chartStats}
      />

      <section className="mb-7 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-card p-3 shadow-[0_0_0_1px_rgb(26_25_23_/_5.5%)]">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <SegmentedControl
            label="Chart salary level"
            layoutId="chart-target-level"
            value={targetLevel}
            options={LEVEL_OPTIONS}
            onChange={(next) => startTransition(() => setTargetLevel(next))}
          />
          <span aria-hidden className="hidden h-5 w-px bg-border sm:block" />
          <SegmentedControl
            label="Rank by"
            layoutId="chart-pay-basis"
            value={payBasis}
            options={PAY_BASIS_OPTIONS}
            onChange={(next) => startTransition(() => setPayBasis(next))}
          />
          <span aria-hidden className="hidden h-5 w-px bg-border sm:block" />
          <SegmentedControl
            label="Living costs"
            layoutId="chart-cost-mode"
            value={costMode}
            options={COST_MODE_OPTIONS}
            onChange={(next) => startTransition(() => setCostMode(next))}
          />
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <SegmentedControl
            label="Scope"
            layoutId="chart-scope"
            value={scope}
            options={SCOPE_OPTIONS}
            onChange={setScope}
          />
          <DecisionLocationSelect
            value={location}
            onValueChange={(next) => setLocation(next)}
            className="h-8 min-w-0 rounded-full border-0 bg-secondary shadow-none hover:bg-muted sm:min-w-[9rem]"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search companies…"
            className="h-8 w-full rounded-full border-0 bg-secondary shadow-none sm:w-44"
            aria-label="Search companies shown in charts"
          />
        </div>
        {costMode === "personal" && personalCost === null && (
          <p className="flex w-full flex-wrap items-center gap-2 text-[11px] leading-4 text-muted-foreground">
            You have not saved personal costs for {location} yet — charts using &ldquo;after
            your costs&rdquo; will stay empty until you do.
            <SettingsDialog />
          </p>
        )}
      </section>

      <ChartSection
        title={`${targetLevelLabels[deferredLevel]} compensation ranking`}
        description="Posted base in €k. Bar color reflects posting confidence, not company brand."
        meta={truncateNote(salaryRowsTotalCount, salaryData.length, "sourced companies") ?? `${salaryData.length} sourced companies`}
        heightPx={rowsHeight(salaryData.length, { rowPx: 30, minPx: 320 })}
      >
        {salaryData.length === 0 ? (
          <ChartEmpty>No sourced salaries match this level and location.</ChartEmpty>
        ) : (
          <ResponsiveBar<SalaryBarDatum>
            data={salaryData.slice().reverse()}
            keys={["totalComp"]}
            indexBy="company"
            layout="horizontal"
            margin={{ top: 8, right: 28, bottom: 48, left: 92 }}
            padding={0.42}
            valueScale={{ type: "linear", min: 0, max: "auto" }}
            colors={({ data }) => CONFIDENCE_COLORS[data.confidence]}
            borderRadius={3}
            enableGridX
            enableGridY={false}
            enableLabel
            label={({ value }) => `€${value}k`}
            labelSkipWidth={54}
            labelTextColor={COLORS.surface}
            axisTop={null}
            axisRight={null}
            axisBottom={{
              tickSize: 4,
              tickPadding: 6,
              format: (value) => `€${value}k`,
              legend: "Gross annual total compensation",
              legendPosition: "middle",
              legendOffset: 38,
            }}
            axisLeft={{ tickSize: 0, tickPadding: 8 }}
            theme={nivoTheme}
            animate
            animateOnMount
            motionConfig="gentle"
            role="img"
            ariaLabel={`${targetLevelLabels[deferredLevel]} total compensation ranking`}
            barAriaLabel={(datum) =>
              `${datum.indexValue}: ${datum.formattedValue} thousand euros total compensation`
            }
            tooltip={({ data }) => (
              <ChartTooltip
                title={data.company}
                rows={[
                  { label: payBasis === "base" ? "Base pay" : "Total comp", value: `€${data.totalComp}k` },
                  { label: "Base", value: data.base > 0 ? `€${data.base}k` : "—" },
                  { label: "Location", value: data.location },
                  { label: "Confidence", value: confidenceText(data.confidence) },
                ]}
              />
            )}
          />
        )}
      </ChartSection>

      <ChartSection
        title="Pay versus…"
        description="Swap the X axis to see whether the pay leaders also lead on employee sentiment, take-home cash, cost-adjusted cash, or next-level upside."
        meta={truncateNote(paySentimentDataAll.length, paySentimentData.length, "comparable companies") ?? `${paySentimentData.length} comparable companies`}
        height="h-[390px] sm:h-[430px]"
      >
        <div className="mb-3 flex justify-center">
          <SegmentedControl
            label="X axis"
            layoutId="chart-scatter-x"
            value={scatterXMetric}
            options={SCATTER_X_OPTIONS}
            onChange={setScatterXMetric}
          />
        </div>
        {paySentimentData.length < 2 ? (
          <ChartEmpty>At least two companies need both a pay figure and {scatterXLabel.toLowerCase()} evidence for a useful comparison.</ChartEmpty>
        ) : (
          <div className="flex h-full flex-col gap-2">
            <div className="min-h-0 flex-1">
              <ResponsiveScatterPlot<PaySentimentDatum>
                data={paySentimentData}
                margin={{ top: 18, right: 28, bottom: 56, left: 66 }}
                xScale={{ type: "linear", min: scatterXDomain[0], max: scatterXDomain[1] }}
                yScale={{ type: "linear", min: 0, max: "auto" }}
                colors={SERIES_COLORS}
                nodeSize={14}
                blendMode="normal"
                enableGridX
                enableGridY
                useMesh
                axisBottom={{
                  tickSize: 4,
                  tickPadding: 6,
                  legend: scatterXLabel,
                  legendPosition: "middle",
                  legendOffset: 40,
                }}
                axisLeft={{
                  tickSize: 4,
                  tickPadding: 6,
                  format: (value) => `€${value}k`,
                  legend: payBasis === "base" ? "Base pay" : "Total compensation",
                  legendPosition: "middle",
                  legendOffset: -54,
                }}
                theme={nivoTheme}
                animate
                motionConfig="gentle"
                role="img"
                ariaLabel={`Total compensation versus ${scatterXLabel.toLowerCase()}`}
                tooltip={({ node }) => (
                  <ChartTooltip
                    title={node.data.company}
                    accent={node.color}
                    rows={[
                      { label: payBasis === "base" ? "Base pay" : "Total comp", value: `€${node.data.y}k` },
                      { label: scatterXLabel, value: node.data.xLabel },
                      { label: "Location", value: node.data.location },
                      {
                        label: "Confidence",
                        value: node.data.opinionConfidence !== null
                          ? `${confidenceText(node.data.salaryConfidence)} salary · ${confidenceText(node.data.opinionConfidence)} opinion`
                          : confidenceText(node.data.salaryConfidence),
                      },
                    ]}
                  />
                )}
              />
            </div>
            <SeriesLegend items={paySentimentData.map((series) => String(series.id))} />
          </div>
        )}
      </ChartSection>

      <ChartSection
        title="Same-location level progression"
        description="Intern, SDE1 and SDE2 are connected only inside one unchanged location scope, preventing false Madrid-to-national comparisons."
        meta={`${progressionData.length} valid series`}
        height="h-[390px] sm:h-[430px]"
      >
        {progressionData.length === 0 ? (
          <ChartEmpty>No company has two sourced levels in the selected location scope.</ChartEmpty>
        ) : (
          <div className="flex h-full flex-col gap-2">
            <div className="min-h-0 flex-1">
              <ResponsiveLine
                data={progressionData}
                margin={{ top: 18, right: 28, bottom: 44, left: 66 }}
                xScale={{ type: "linear", min: 0, max: requiredSalaryLevels.length - 1 }}
                yScale={{ type: "linear", min: 0, max: "auto", stacked: false }}
                yFormat={(value) => `€${value}k`}
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
                axisTop={null}
                axisRight={null}
                axisBottom={{
                  tickSize: 4,
                  tickPadding: 8,
                  tickValues: requiredSalaryLevels.map((_, index) => index),
                  format: (value) => targetLevelLabels[requiredSalaryLevels[Number(value)]] ?? "",
                }}
                axisLeft={{
                  tickSize: 4,
                  tickPadding: 6,
                  format: (value) => `€${value}k`,
                  // Always base, regardless of the payBasis toggle elsewhere on
                  // this page — see the comment on `sameLocationSeries`: base is
                  // the one figure every company on this chart reliably
                  // publishes at more than one level, including employer
                  // postings that never state a total. The label used to follow
                  // the toggle and say "Total compensation" while the values
                  // stayed base pay the whole time.
                  legend: "Posted base pay",
                  legendPosition: "middle",
                  legendOffset: -54,
                }}
                theme={nivoTheme}
                animate
                motionConfig="gentle"
                role="img"
                ariaLabel="Same-location base-pay progression from Intern to SDE2"
                sliceTooltip={({ slice }) => (
                  <ChartTooltip
                    title={targetLevelLabels[requiredSalaryLevels[slice.points[0]?.data.x as number]] ?? ""}
                    rows={slice.points.map((point) => ({
                      label: String(point.seriesId),
                      value: point.data.yFormatted,
                      dot: point.seriesColor,
                    }))}
                  />
                )}
              />
            </div>
            <SeriesLegend items={progressionData.map((series) => String(series.id))} />
          </div>
        )}
      </ChartSection>

      <ChartSection
        title="Employee sentiment ranking"
        description="Editorial Reddit score out of five. Color reflects opinion confidence; unscored companies remain excluded."
        meta={truncateNote(opinionDataAll.length, opinionData.length, "scored companies") ?? `${opinionData.length}/${companies.length} scored`}
        heightPx={rowsHeight(opinionData.length, { rowPx: 28, minPx: 260 })}
      >
        {opinionData.length === 0 ? (
          <ChartEmpty>No company in the current scope has a Reddit-sourced sentiment score.</ChartEmpty>
        ) : (
          <ResponsiveBar<OpinionBarDatum>
            data={opinionData.slice().reverse()}
            keys={["score"]}
            indexBy="company"
            layout="horizontal"
            margin={{ top: 8, right: 28, bottom: 48, left: 92 }}
            padding={0.38}
            valueScale={{ type: "linear", min: 0, max: 5 }}
            colors={({ data }) => CONFIDENCE_COLORS[data.confidence]}
            borderRadius={3}
            enableGridX
            enableGridY={false}
            enableLabel
            label={({ value }) => `${value} / 5`}
            labelSkipWidth={42}
            labelTextColor={COLORS.surface}
            axisTop={null}
            axisRight={null}
            axisBottom={{
              tickSize: 4,
              tickPadding: 6,
              tickValues: [0, 1, 2, 3, 4, 5],
              legend: "Employee sentiment",
              legendPosition: "middle",
              legendOffset: 38,
            }}
            axisLeft={{ tickSize: 0, tickPadding: 8 }}
            theme={nivoTheme}
            animate
            animateOnMount
            motionConfig="gentle"
            role="img"
            ariaLabel="Employee sentiment ranking"
            tooltip={({ data }) => (
              <ChartTooltip
                title={data.company}
                rows={[
                  { label: "Opinion", value: `${data.score} / 5` },
                  { label: "Confidence", value: confidenceText(data.confidence) },
                  { label: "Scope", value: data.scope },
                ]}
              />
            )}
          />
        )}
      </ChartSection>

      <ChartSection
        title="What the pay is made of"
          description={`Base, bonus and stock for ${targetLevelLabels[deferredLevel]}. Employer postings state base only, so those bars are base-height by design rather than by omission.`}
          meta={`${compositionData.length} companies`}
          height="h-[390px] lg:h-[440px]"
        >
          {compositionData.length === 0 ? (
            <ChartEmpty>No company publishes a pay breakdown at this level and location.</ChartEmpty>
          ) : (
            <ResponsiveBar<CompositionDatum>
              data={compositionData}
              keys={["Base", "Bonus", "Stock"]}
              indexBy="company"
              margin={{ top: 10, right: 20, bottom: 78, left: 56 }}
              padding={0.32}
              colors={[COLORS.green, COLORS.amber, COLORS.blue]}
              borderRadius={3}
              axisBottom={{ tickSize: 0, tickPadding: 10, tickRotation: -32 }}
              axisLeft={{ tickSize: 0, tickPadding: 8, legend: "€k / year", legendOffset: -46, legendPosition: "middle" }}
              enableLabel={false}
              theme={nivoTheme}
              animate
              motionConfig="gentle"
              role="img"
              ariaLabel="Pay composition by company"
              legends={[{
                dataFrom: "keys", anchor: "bottom", direction: "row", translateY: 66,
                itemWidth: 78, itemHeight: 18, symbolSize: 9, symbolShape: "circle",
              }]}
              tooltip={({ data }) => (
                <ChartTooltip
                  title={data.company}
                  rows={[
                    { label: "Base", value: `€${data.Base}k` },
                    { label: "Bonus", value: data.Bonus > 0 ? `€${data.Bonus}k` : "not stated" },
                    { label: "Stock", value: data.Stock > 0 ? `€${data.Stock}k` : "not stated" },
                    { label: "Source", value: String(data.origin) },
                  ]}
                />
              )}
            />
          )}
        </ChartSection>

        <ChartSection
          title="Published salary bands"
          description="The floor-to-ceiling range each employer actually printed, so overlapping bands are visible instead of collapsed to one number."
          meta={truncateNote(bandRowsAll.length, bandRows.length, "bands") ?? `${bandRows.length} bands`}
          heightPx={rowsHeight(bandRows.length, { rowPx: 30, minPx: 320 })}
        >
          {bandRows.length === 0 ? (
            <ChartEmpty>
              No employer publishes an annual Spain band that applies to {deferredLocation}.
            </ChartEmpty>
          ) : (
            <ResponsiveBar
              data={bandRows}
              keys={["floor", "span"]}
              indexBy="label"
              layout="horizontal"
              margin={{ top: 10, right: 26, bottom: 52, left: 190 }}
              padding={0.34}
              // The floor segment is invisible so the coloured segment reads as
              // the band itself rather than as a total.
              colors={({ id }) => (id === "floor" ? "transparent" : COLORS.green)}
              borderRadius={3}
              axisBottom={{ tickSize: 0, tickPadding: 8, legend: "€k / year", legendOffset: 38, legendPosition: "middle" }}
              axisLeft={{ tickSize: 0, tickPadding: 8 }}
              enableLabel={false}
              enableGridY={false}
              theme={nivoTheme}
              animate
              motionConfig="gentle"
              role="img"
              ariaLabel="Published employer salary bands"
              tooltip={({ data }) => (
                <ChartTooltip
                  title={String(data.label)}
                  rows={[
                    { label: "Band", value: `${formatEuro(data.minimumAmount, true)}–${formatEuro(data.maximumAmount, true)}` },
                    { label: "Spread", value: formatEuro(data.maximumAmount - data.minimumAmount, true) },
                    { label: "Scope", value: String(data.locationLabel) },
                  ]}
                />
              )}
            />
          )}
        </ChartSection>

        <ChartSection
          title="What actually reaches you"
          description={
            takeHomeKeys.length === 3
              ? `Monthly gross cash, estimated net after 2026 Spain payroll, and what survives ${personalCost !== null ? "your own" : deferredLocation} living costs.`
              : `Monthly gross cash and estimated net after 2026 Spain payroll. No living-cost data applies to ${deferredLocation}, so no after-cost bar is shown.`
          }
          meta={takeHomeData.length > 0 ? `${takeHomeData.length} companies` : undefined}
          height="h-[390px] lg:h-[440px]"
        >
          {takeHomeData.length === 0 ? (
            <ChartEmpty>
              {deferredLevel === "intern"
                ? "Net cash is not estimated for internships."
                : "No company has enough cash evidence at this level to model take-home."}
            </ChartEmpty>
          ) : (
            <ResponsiveBar<TakeHomeDatum>
              data={takeHomeData}
              keys={takeHomeKeys}
              indexBy="company"
              groupMode="grouped"
              margin={{ top: 10, right: 20, bottom: 78, left: 62 }}
              padding={0.26}
              innerPadding={2}
              colors={[COLORS.pale, COLORS.blue, COLORS.green]}
              borderRadius={3}
              axisBottom={{ tickSize: 0, tickPadding: 10, tickRotation: -32 }}
              axisLeft={{ tickSize: 0, tickPadding: 8, legend: "€ / month", legendOffset: -52, legendPosition: "middle" }}
              enableLabel={false}
              theme={nivoTheme}
              animate
              motionConfig="gentle"
              role="img"
              ariaLabel="Gross, net and after-cost monthly cash by company"
              legends={[{
                dataFrom: "keys", anchor: "bottom", direction: "row", translateY: 66,
                itemWidth: 104, itemHeight: 18, symbolSize: 9, symbolShape: "circle",
              }]}
              tooltip={({ data }) => (
                <ChartTooltip
                  title={data.company}
                  rows={[
                    { label: "Gross", value: `${formatEuro(data.Gross)} / mo` },
                    { label: "Net", value: `${formatEuro(data.Net)} / mo` },
                    {
                      label: "After costs",
                      value: data.hasCostData === "no"
                        ? "no cost data"
                        : `${formatEuro(data["After costs"])} / mo`,
                    },
                  ]}
                />
              )}
            />
          )}
        </ChartSection>

        <ChartGroupHeader
          title="Ask your own question"
          question="Compare anything against anything"
        />
        {/* useSearchParams inside the explorer forces client rendering up to
            the nearest boundary; this keeps that scoped to the one chart that
            reads the URL rather than the whole page. */}
        <Suspense fallback={null}>
          <ChartExplorer ctx={chartContext} />
        </Suspense>

        <ChartGroupHeader
          title="What I actually keep"
          question="What does this salary become after tax?"
        />
        <NetPayCurve ctx={chartContext} />
        <EffectiveRateCurve ctx={chartContext} />
        <TaxBandSchedule />
        <TakeHomeWaterfall ctx={chartContext} />

        <ChartGroupHeader
          title="Can I afford to live there"
          question={`What is left after living in ${deferredLocation}?`}
        />
        <CostShareOfPay ctx={chartContext} />
        <CostAdjustedRanking ctx={chartContext} />
        <CityCostBreakdown ctx={chartContext} />
        <PersonalVsReferenceBasket ctx={chartContext} />

        <ChartGroupHeader
          title="Am I being lowballed"
          question="Is this offer competitive, and what can I ask for?"
        />
        <MarketPercentile ctx={chartContext} />
        <PayVersusMarketBenchmark ctx={chartContext} />
        <NegotiationAskZone ctx={chartContext} />
        <EquityShareOfOffer ctx={chartContext} />

        <ChartGroupHeader
          title="Is this company growing"
          question="Is the team expanding or quietly freezing?"
        />
        <HiringVolumeOverTime />
        <HiringChurn />

        <ChartGroupHeader
          title="Where this takes me"
          question="What does this look like in three to five years?"
        />
        <FullLevelPayCurve ctx={chartContext} />
        <PromotionJumpSize ctx={chartContext} />
        <ProjectedPath ctx={chartContext} />

    </PageShell>
  );
}
