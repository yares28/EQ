"use client";

import { startTransition, useDeferredValue, useMemo, useState } from "react";
import { ResponsiveBar } from "@nivo/bar";
import { ResponsiveLine } from "@nivo/line";
import { ResponsiveScatterPlot, type ScatterPlotDatum } from "@nivo/scatterplot";

import { InfoDialog, MetricStrip, PageHeader, PageShell } from "@/components/eq/page-shell";
import { SegmentedControl } from "@/components/eq/segmented-control";
import { useCompanyCatalog } from "@/components/eq/use-company-catalog";
import { useSalaryDecisionContext } from "@/components/eq/use-salary-decision-context";
import { useShortlist } from "@/components/eq/use-shortlist";
import { DecisionLocationSelect } from "@/components/eq/decision-location-select";
import { SettingsDialog } from "@/components/eq/settings-dialog";
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
} from "@/lib/city-reference-costs";
import { estimateSpainPayroll2026 } from "@/lib/spain-payroll-2026";
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
  type SalaryLevel,
  type SalaryPoint,
} from "@/lib/salary-data";
import {
  cityCostKeyForLocation,
  type CostMode,
  type DecisionLocation,
  type PayBasis,
} from "@/lib/salary-decision-context";

type LocationFilter = DecisionLocation;

/** Most companies a chart can show as individually-labelled marks before
 * labels collide and the chart stops being readable. Past this, a chart
 * truncates to the top N (by whatever it's already sorted on) and says so. */
const MAX_CHART_ITEMS = 24;

/**
 * A pixel height for a horizontal, one-row-per-company chart, derived from
 * how many rows it actually has instead of a number picked for 10 companies.
 * Past `maxRows` the chart stops growing and its container scrolls instead —
 * this is what keeps 60 or 300 companies from squashing into unreadable
 * slivers or stretching the page to an unusable height.
 */
function rowsHeight(rowCount: number, opts?: { rowPx?: number; minPx?: number; maxRows?: number }): number {
  const rowPx = opts?.rowPx ?? 32;
  const minPx = opts?.minPx ?? 280;
  const maxRows = opts?.maxRows ?? 14;
  const margin = 110; // axis + legend chrome outside the plotted rows
  return Math.max(minPx, Math.min(rowCount, maxRows) * rowPx + margin);
}

function truncateNote(totalCount: number, shownCount: number, noun: string): string | undefined {
  if (totalCount <= shownCount) return undefined;
  return `Showing the top ${shownCount} of ${totalCount} ${noun} — narrow with search or shortlist scope to see the rest.`;
}

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

interface CoverageDatum {
  level: string;
  "Employer-posted": number;
  "Sourced page": number;
  "No evidence": number;
  [key: string]: string | number;
}

/** Every level the catalog can hold, for coverage reporting. */
const LEVEL_ORDER: SalaryLevel[] = [
  "intern",
  "junior",
  "mid",
  "senior",
  "staff",
  "principal",
];

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
  { value: "off", label: "Off" },
  { value: "reference", label: "Reference" },
  { value: "personal", label: "Personal" },
];

type ChartScope = "all" | "shortlist";

const SCOPE_OPTIONS: { value: ChartScope; label: string }[] = [
  { value: "all", label: "All companies" },
  { value: "shortlist", label: "Shortlist" },
];

type ScatterXMetric = "sentiment" | "net" | "afterCosts" | "progression";

const SCATTER_X_OPTIONS: { value: ScatterXMetric; label: string }[] = [
  { value: "sentiment", label: "Employee sentiment" },
  { value: "net", label: "Net take-home" },
  { value: "afterCosts", label: "After living costs" },
  { value: "progression", label: "Next-level jump" },
];

const COLORS = {
  green: "#337d69",
  greenSoft: "#78a997",
  amber: "#bd7b3f",
  blue: "#5f7f9e",
  red: "#ad6258",
  ink: "#59676d",
  pale: "#c9d3d0",
  surface: "#fbfdfc",
};

const SERIES_COLORS = [
  COLORS.green,
  COLORS.amber,
  COLORS.blue,
  COLORS.red,
  COLORS.ink,
  COLORS.greenSoft,
];

const CONFIDENCE_COLORS: Record<Confidence, string> = {
  High: COLORS.green,
  Medium: COLORS.blue,
  Low: COLORS.amber,
  Unknown: COLORS.pale,
};

const nivoTheme = {
  background: "transparent",
  text: {
    fontSize: 11,
    fill: COLORS.ink,
    fontFamily: "var(--font-geist-sans)",
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
  tooltip: {
    container: {
      background: COLORS.surface,
      color: "#263238",
      fontSize: 12,
      borderRadius: 6,
      border: "1px solid rgba(34, 48, 54, 0.12)",
      boxShadow: "0 16px 34px -24px rgba(34, 48, 54, 0.55)",
    },
  },
};

function thousands(value: number): number {
  return Math.round((value / 1_000) * 10) / 10;
}

function confidenceText(confidence: Confidence): string {
  return confidence === "Unknown" ? "—" : confidence;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

function ChartTooltip({
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

function ChartSection({
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
   * over `height` — Tailwind's arbitrary-value classes only exist in the
   * generated CSS for values it saw at build time, so a runtime-computed
   * height must be inline style, not a dynamically-built `h-[Npx]` string. */
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
        {meta && <p className="shrink-0 max-w-xs text-right text-[10px] leading-4 tabular text-muted-foreground">{meta}</p>}
      </div>
      <div className={heightPx === undefined ? height : undefined} style={heightPx === undefined ? undefined : { height: heightPx }}>
        {children}
      </div>
    </section>
  );
}

function ChartEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-full place-items-center border-y border-dashed border-foreground/10 text-center text-xs text-muted-foreground">
      <p className="max-w-xs leading-5">{children}</p>
    </div>
  );
}

function SeriesLegend({ items }: { items: string[] }) {
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

    const series = requiredSalaryLevels.map((level) => {
      const point = byLevel.get(level);
      return {
        x: targetLevelLabels[level],
        y: point?.baseEur ? thousands(point.baseEur) : null,
      };
    });

    // A company whose pay sits outside the plotted levels — Elastic publishes
    // senior and principal only — yields a series with nothing to join, and the
    // line renderer emits an invalid path for it.
    if (series.filter((entry) => entry.y !== null).length < 2) return [];

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

  /** Monthly net cash and what survives cost mode for one salary point, or
   * null components when the payroll model or cost data isn't available.
   * Interns are excluded by policy (the model isn't calibrated for stipends). */
  function monthlyEconomics(point: SalaryPoint | null): { netMonthly: number | null; afterCostsMonthly: number | null } {
    if (point === null || point.baseEur == null) return { netMonthly: null, afterCostsMonthly: null };
    const annualCash = point.baseEur + (point.bonusEur ?? 0) + (point.extrasEur ?? 0);
    const payroll = payrollModel?.current === true && deferredLevel !== "intern"
      ? estimateSpainPayroll2026(annualCash)
      : null;
    if (payroll === null) return { netMonthly: null, afterCostsMonthly: null };
    const afterCostsMonthly = personalCost !== null
      ? estimateCashAfterPersonalCosts(payroll.monthlyNetCashEur, personalCost)
      : cityCostKey !== null && cityLivingCosts?.current === true
        ? estimateCashAfterCityReferenceCosts(
            payroll.monthlyNetCashEur,
            cityLivingCosts.monthlyRentEur,
            cityLivingCosts.monthlyEssentialsEur,
          )?.monthlyCashAfterReferenceCostsEur ?? null
        : null;
    return { netMonthly: payroll.monthlyNetCashEur, afterCostsMonthly };
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

  // 5. Where the evidence is thin, by level — the question the old confidence
  //    pie could not answer.
  const coverageData: CoverageDatum[] = LEVEL_ORDER.map((level) => {
    let official = 0;
    let sourced = 0;
    let none = 0;
    for (const company of companies) {
      const point = pointForLevel(company, level, deferredLocation, "base");
      if (point === null) none += 1;
      else if (isPostedSalaryPoint(point)) official += 1;
      else sourced += 1;
    }
    return {
      level: levelLabels[level],
      "Employer-posted": official,
      "Sourced page": sourced,
      "No evidence": none,
    };
  });
  // The chart above answers "how thin, across every level" — this answers
  // the actionable question for the level you're actually looking at right
  // now: which specific companies have nothing here.
  const missingAtCurrentLevelAll = companies.filter(
    (company) => pointForLevel(company, deferredLevel, deferredLocation, "base") === null,
  );
  const missingAtCurrentLevel = missingAtCurrentLevelAll.slice(0, 12);

  // The median must reflect the whole population, not just the chart's
  // top-N cap — capping first would skew the median upward.
  const totals = salaryRowsWithEvidence.flatMap((row) => {
    const amount = payAmountFor(row.point, payBasis);
    return amount === null ? [] : [amount];
  });
  const medianComp = median(totals);
  const topPay = salaryRowsWithEvidence[0] ?? null;
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

  return (
    <PageShell width="wide">
      <PageHeader
        title="Charts"
        description="Visual comparisons from employer-posted salaries first, with sourced salary-page figures only where a jobs page has no qualifying range."
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

      <section className="border-b border-foreground/10 pb-5">
        <p className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">
          Salary view
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SegmentedControl
            label="Chart salary level"
            layoutId="chart-target-level"
            value={targetLevel}
            options={LEVEL_OPTIONS}
            onChange={(next) => startTransition(() => setTargetLevel(next))}
          />
          <DecisionLocationSelect
            value={location}
            onValueChange={(next) => setLocation(next)}
            className="h-9 w-full sm:w-52"
          />
        </div>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl
              label="Rank by"
              layoutId="chart-pay-basis"
              value={payBasis}
              options={PAY_BASIS_OPTIONS}
              onChange={(next) => startTransition(() => setPayBasis(next))}
            />
            <SegmentedControl
              label="Living costs"
              layoutId="chart-cost-mode"
              value={costMode}
              options={COST_MODE_OPTIONS}
              onChange={(next) => startTransition(() => setCostMode(next))}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl
              label="Scope"
              layoutId="chart-scope"
              value={scope}
              options={SCOPE_OPTIONS}
              onChange={setScope}
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search companies…"
              className="h-9 w-full sm:w-48"
              aria-label="Search companies shown in charts"
            />
          </div>
        </div>
        {costMode === "personal" && personalCost === null && (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            You have not saved personal costs for {location} yet — charts using &ldquo;after
            your costs&rdquo; will stay empty until you do.
            <SettingsDialog />
          </p>
        )}
      </section>

      <MetricStrip
        metrics={[
          {
            label: "Median sourced pay",
            value: formatEuro(medianComp, true),
            detail: `${salaryRowsTotalCount}/${companies.length} companies`,
          },
          {
            label: "Highest at level",
            value: formatEuro(payAmountFor(topPay?.point ?? null, payBasis), true),
            detail: topPay?.company.canonicalName ?? "—",
          },
          {
            label: `Best ${targetLevelLabels[deferredLevel]} progression`,
            value: topGrowth?.progression ? `+${topGrowth.progression.percent}%` : "—",
            detail: topGrowth?.company.canonicalName ?? "—",
          },
        ]}
      />

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
                xScale={{ type: "point" }}
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
                axisBottom={{ tickSize: 4, tickPadding: 8 }}
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
                ariaLabel="Same-location compensation progression from Intern to SDE2"
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

        <ChartSection
          title="Where the evidence is thin"
          description={`How many of the ${companies.length} tracked companies have a base figure at each level in ${deferredLocation}, and whether it came from the employer or a public salary page. ${targetLevelLabels[deferredLevel]} is outlined below — see exactly which companies are missing it beneath the chart.`}
          meta={`${companies.length} companies`}
          height="h-[390px] lg:h-[440px]"
        >
          <div className="flex h-full flex-col gap-3">
            <div className="min-h-0 flex-1">
              <ResponsiveBar<CoverageDatum>
                data={coverageData}
                keys={["Employer-posted", "Sourced page", "No evidence"]}
                indexBy="level"
                margin={{ top: 10, right: 20, bottom: 60, left: 48 }}
                padding={0.34}
                colors={[COLORS.green, COLORS.blue, COLORS.pale]}
                borderColor={(bar) =>
                  bar.data.indexValue === levelLabels[deferredLevel] ? "#1a1917" : "transparent"
                }
                borderWidth={2}
                borderRadius={3}
                axisBottom={{ tickSize: 0, tickPadding: 10 }}
                axisLeft={{ tickSize: 0, tickPadding: 8, legend: "Companies", legendOffset: -38, legendPosition: "middle" }}
                enableLabel={false}
                theme={nivoTheme}
                animate
                motionConfig="gentle"
                role="img"
                ariaLabel="Evidence coverage by level"
                legends={[{
                  dataFrom: "keys", anchor: "bottom", direction: "row", translateY: 46,
                  itemWidth: 96, itemHeight: 18, symbolSize: 9, symbolShape: "circle",
                }]}
                tooltip={({ data }) => (
                  <ChartTooltip
                    title={String(data.level)}
                    rows={[
                      { label: "Employer-posted", value: String(data["Employer-posted"]) },
                      { label: "Sourced page", value: String(data["Sourced page"]) },
                      { label: "No evidence", value: String(data["No evidence"]) },
                    ]}
                  />
                )}
              />
            </div>
            {missingAtCurrentLevelAll.length > 0 && (
              <div className="shrink-0 border-t border-foreground/10 pt-2">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                  Missing {targetLevelLabels[deferredLevel]} at {deferredLocation}
                </p>
                <p className="mt-1 text-xs leading-5 text-foreground">
                  {missingAtCurrentLevel.map((company) => company.canonicalName).join(", ")}
                  {missingAtCurrentLevelAll.length > missingAtCurrentLevel.length &&
                    ` +${missingAtCurrentLevelAll.length - missingAtCurrentLevel.length} more`}
                </p>
              </div>
            )}
          </div>
      </ChartSection>
    </PageShell>
  );
}
