"use client";

import Link from "next/link";

import { startTransition } from "react";
import { useQuery } from "convex/react";
import {
  CheckCircle,
  Clock,
  Plus,
  MapPin,
  ShieldCheck,
  Star,
  Wallet,
  XCircle,
} from "@/components/eq/icon";

import {
  InfoDialog,
  MetricStrip,
  PageHeader,
  PageLoading,
  PageShell,
} from "@/components/eq/page-shell";
import { SegmentedControl } from "@/components/eq/segmented-control";
import { useCompanyCatalog } from "@/components/eq/use-company-catalog";
import { useSalaryDecisionContext } from "@/components/eq/use-salary-decision-context";
import { useShortlist } from "@/components/eq/use-shortlist";
import { useViewPreferences } from "@/components/eq/use-view-preferences";
import { DecisionLocationSelect } from "@/components/eq/decision-location-select";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  decisionGradeProgressionPercent,
  decisionProgressionFor,
  decisionProgressionLockReason,
  formatEuro,
  payAmountFor,
  pointForLevel,
  type SalaryProgression,
  type TargetLevel,
} from "@/lib/salary-analytics";
import {
  isSpainCityLocation,
  salaryCompanies,
  type Confidence,
  type SalaryCompany,
  type SalaryPoint,
} from "@/lib/salary-data";
import {
  cityCostKeyForLocation,
  type CostMode,
  type PayBasis,
} from "@/lib/salary-decision-context";
import { MAX_COMPARED_COMPANIES } from "@/lib/view-preferences";
import {
  euroOrDash,
  formatDayFromTimestamp,
  formatIsoDay,
  plural,
  signedEuro,
  signedPercent,
} from "@/lib/format";
import { pointResearchQuality, type ResearchQuality } from "@/lib/research-quality";
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
import {
  analyzeSalaryNegotiation,
  type SalaryNegotiationAnalysis,
} from "@/lib/salary-negotiation";
import {
  buildCompanyDecisionBrief,
  type DecisionMetricKey,
  type DecisionMetricResult,
} from "@/lib/company-decision-brief";
import {
  annualizedPostedAmountEur,
  companyResearchPresentation,
  postedSalaryLocation,
  selectPostedRange,
  type CompanyPostedRange,
  type TrackedCompanySummary,
} from "@/lib/company-research-catalog";
import { api } from "@/convex/_generated/api";

interface ComparisonRow {
  company: SalaryCompany;
  point: SalaryPoint | null;
  progression: SalaryProgression | null;
  quality: ResearchQuality;
  annualCashEur: number | null;
  payrollEstimate: SpainPayrollEstimate2026 | null;
  cityCashAfterReferenceCostsEur: number | null;
  negotiation: SalaryNegotiationAnalysis;
  postedRange: CompanyPostedRange | null;
  tracked: TrackedCompanySummary | null;
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
  { value: "off", label: "Off" },
  { value: "reference", label: "Reference" },
  { value: "personal", label: "Personal" },
];

const MAX_COMPANIES_SHOWN = MAX_COMPARED_COMPANIES;

function displayConfidence(confidence: Confidence): string {
  return confidence === "Unknown" ? "—" : confidence;
}

/** Shows the employer's published band rather than a derived midpoint. */
function payCellLabel(point: SalaryPoint | null, basis: PayBasis): string {
  if (point === null) return "—";
  if (
    basis === "base" &&
    point.baseMinEur != null &&
    point.baseMaxEur != null &&
    point.baseMinEur !== point.baseMaxEur
  ) {
    return `${formatEuro(point.baseMinEur, true)}–${formatEuro(point.baseMaxEur, true)}`;
  }
  return formatEuro(payAmountFor(point, basis), true);
}

function maxNullable(values: (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length > 0 ? Math.max(...present) : null;
}

function knownAnnualCash(point: SalaryPoint | null): number | null {
  if (point?.baseEur === null || point?.baseEur === undefined) return null;
  return point.baseEur + (point.bonusEur ?? 0) + (point.extrasEur ?? 0);
}

/**
 * A metric the brief did not produce degrades to a locked one. This used to
 * throw, which meant one unexpected key shape took the whole page down instead
 * of locking a single tile — exactly the outcome the rest of this page is
 * built to avoid.
 */
function decisionMetric(
  metrics: DecisionMetricResult[],
  key: DecisionMetricKey,
): DecisionMetricResult {
  return (
    metrics.find((candidate) => candidate.key === key) ?? {
      key,
      label: key,
      status: "locked",
      countsTowardDecision: false,
      availableCandidateCount: 0,
      leaderSlug: null,
      leaderName: null,
      runnerUpSlug: null,
      topValue: null,
      delta: null,
      minimumMeaningfulDelta: 0,
      unit: "points",
    }
  );
}

function DecisionSignal({
  label,
  metric,
  unavailable,
  valueSuffix,
  deltaSuffix,
}: {
  label: string;
  metric: DecisionMetricResult;
  unavailable?: string;
  valueSuffix?: string;
  deltaSuffix?: string;
}) {
  const title = unavailable
    ? "Locked"
    : metric.status === "decisive"
      ? metric.leaderName
      : metric.status === "tie"
        ? "Near tie"
        : "Locked";
  const detail = unavailable
    ? unavailable
    : metric.status === "decisive" && metric.delta !== null
      ? `${metric.key === "totalComp" || metric.key === "monthlyNetCash" || metric.key === "cityAfterCosts"
          ? `${signedEuro(metric.delta)} / ${metric.key === "totalComp" ? "year" : "month"}`
          : `${signedPercent(metric.delta)}${deltaSuffix ?? ""}`} vs next`
      : metric.status === "tie"
        ? "Difference is below the decision threshold"
        : "Needs two supported values";

  return (
    <div className="min-w-0 py-4 sm:px-4">
      <p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
        {metric.status === "decisive" && metric.topValue !== null && valueSuffix
          ? `${metric.topValue}${valueSuffix} · ${detail}`
          : detail}
      </p>
    </div>
  );
}

function formatPostedRange(range: CompanyPostedRange): string {
  const minimum = formatEuro(range.minimumAmount, true);
  const maximum = formatEuro(range.maximumAmount, true);
  if (range.rangeKind === "minimum") return `From ${minimum}`;
  if (range.rangeKind === "maximum") return `Up to ${maximum}`;
  if (range.rangeKind === "fixed" || range.minimumAmount === range.maximumAmount) {
    return minimum;
  }
  return `${minimum}–${maximum}`;
}

function MetricCell({
  value,
  detail,
  best = false,
}: {
  value: string;
  detail?: string;
  best?: boolean;
}) {
  return (
    <div className={best ? "min-w-0 bg-primary/[0.055] px-4 py-4" : "min-w-0 px-4 py-4"}>
      <p className={`break-words leading-5 ${best ? "font-semibold text-foreground" : "font-semibold text-foreground"}`}>
        {value}
        {best && <CheckCircle className="ml-1.5 inline size-3.5 text-primary" weight="regular" />}
      </p>
      {detail && <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{detail}</p>}
    </div>
  );
}

export default function CompanyComparePage() {
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
  const shortlist = useShortlist();
  const { compareSlugs, setCompareSlugs } = useViewPreferences();
  const settings = useQuery(api.settings.get);
  const personalCost = costMode === "personal"
    ? personalCostForLocation(settings?.personalCityCosts, location)
    : null;
  const costCityKey = costMode === "reference" ? cityCostKeyForLocation(location) : null;
  const cityLivingCosts = useQuery(
    api.madridCostResearch.latestCityLivingCosts,
    costCityKey === null ? "skip" : { cityKey: costCityKey },
  );
  const payrollModel = useQuery(api.payrollResearch.activeSpainPayrollModel);
  const {
    companies: companyCatalog,
    postedRanges,
    trackedCompanies,
    catalogReady,
  } = useCompanyCatalog();
  const trackedBySlug = new Map(trackedCompanies.map((company) => [company.slug, company]));
  const shortlistedCompanies = [...shortlist.companies].flatMap((slug) => {
    const company = companyCatalog.find((candidate) => candidate.slug === slug);
    return company ? [company] : [];
  });
  const baseCompanySlugs = new Set(salaryCompanies.map((company) => company.slug));
  const trackedOnlyAlternatives = companyCatalog
    .filter((company) => !baseCompanySlugs.has(company.slug))
    .filter((company) => !shortlist.companies.has(company.slug))
    .sort(
      (left, right) =>
        (trackedBySlug.get(right.slug)?.researchRequestedAt ?? 0) -
          (trackedBySlug.get(left.slug)?.researchRequestedAt ?? 0) ||
        left.canonicalName.localeCompare(right.canonicalName),
    );
  // Ranked by what the employer actually posted, so the preview leads with the
  // strongest evidence rather than with whichever company happens to sort first.
  const directRangeAlternatives = companyCatalog
    .filter((company) => !shortlist.companies.has(company.slug))
    .flatMap((company) => {
      const range = selectPostedRange({
        ranges: postedRanges,
        companySlug: company.slug,
        targetLevel,
        location,
      });
      return range === null
        ? []
        : [{ company, amount: annualizedPostedAmountEur(range) ?? 0 }];
    })
    .sort((left, right) => right.amount - left.amount)
    .map((entry) => entry.company);
  const rankedSalaryAlternatives = companyCatalog
    .filter((company) => !shortlist.companies.has(company.slug))
    .filter((company) => pointForLevel(company, targetLevel, location, payBasis) !== null)
    .sort(
      (a, b) =>
        (payAmountFor(pointForLevel(b, targetLevel, location, payBasis), payBasis) ?? 0) -
        (payAmountFor(pointForLevel(a, targetLevel, location, payBasis), payBasis) ?? 0),
    );
  const previewSlugs = new Set<string>();
  // Evidence first. This used to lead with `trackedOnlyAlternatives`, which is
  // defined by having *no* salary evidence at all — so a company EQ had merely
  // started watching outranked one with a live employer-posted band, and the
  // preview of "the strongest companies" filled up with empty columns.
  const rankedAlternatives = [
    ...directRangeAlternatives,
    ...rankedSalaryAlternatives,
    ...trackedOnlyAlternatives,
  ].filter((company) => {
    if (previewSlugs.has(company.slug)) return false;
    previewSlugs.add(company.slug);
    return true;
  });
  // An explicit choice always wins. Only when nothing is chosen does EQ fall
  // back to the shortlist, and then to the strongest ranked companies.
  const chosenCompanies = compareSlugs.flatMap((slug) => {
    const company = companyCatalog.find((candidate) => candidate.slug === slug);
    return company ? [company] : [];
  });
  const usingPreview = chosenCompanies.length === 0 && shortlistedCompanies.length < 2;
  const companies =
    chosenCompanies.length > 0
      ? chosenCompanies.slice(0, MAX_COMPANIES_SHOWN)
      : usingPreview
        ? [...shortlistedCompanies, ...rankedAlternatives].slice(0, MAX_COMPANIES_SHOWN)
        : shortlistedCompanies.slice(0, MAX_COMPANIES_SHOWN);
  const rows: ComparisonRow[] = companies.map((company) => {
    const point = pointForLevel(company, targetLevel, location, payBasis);
    const postedRange = selectPostedRange({
      ranges: postedRanges,
      companySlug: company.slug,
      targetLevel,
      location,
    });
    const progression = decisionProgressionFor(company, targetLevel, location);
    const annualCashEur = targetLevel === "intern" ? null : knownAnnualCash(point);
    const payrollEstimate =
      payrollModel?.current === true && annualCashEur !== null
        ? estimateSpainPayroll2026(annualCashEur)
        : null;
    const cityCashAfterReferenceCostsEur =
      payrollEstimate === null
        ? null
        : personalCost !== null
          ? estimateCashAfterPersonalCosts(payrollEstimate.monthlyNetCashEur, personalCost)
          : costCityKey !== null && cityLivingCosts?.current === true
            ? estimateCashAfterCityReferenceCosts(
                payrollEstimate.monthlyNetCashEur,
                cityLivingCosts.monthlyRentEur,
                cityLivingCosts.monthlyEssentialsEur,
              )?.monthlyCashAfterReferenceCostsEur ?? null
            : null;
    return {
      company,
      point,
      progression,
      quality: pointResearchQuality(company, point),
      annualCashEur,
      payrollEstimate,
      cityCashAfterReferenceCostsEur,
      negotiation: analyzeSalaryNegotiation({
        company,
        point,
        companies: companyCatalog,
        postedRange,
      }),
      postedRange,
      tracked: trackedBySlug.get(company.slug) ?? null,
    };
  });
  const representedLocationScopes = new Set(
    rows.flatMap((row) =>
      row.point
        ? [row.point.location]
        : row.postedRange
          ? [postedSalaryLocation(row.postedRange)]
          : [],
    ),
  );
  // Every figure here already passed `decisionLocationMatches` for the selected
  // location, so all of them apply to it. That admits exactly two scopes — the
  // selected city itself, or a Spain-wide band that covers it — so a comparison
  // can never hold two different cities. The old "mixed scopes" lock that
  // guarded every figure below was therefore unreachable, and has been removed
  // rather than left as dead branches nothing can enter.
  const mixesNationalAndCityScopes =
    representedLocationScopes.has("Spain-wide") &&
    [...representedLocationScopes].some((scope) => isSpainCityLocation(scope));

  const bestTotal = maxNullable(rows.map((row) => payAmountFor(row.point, payBasis)));
  const bestBase = maxNullable(rows.map((row) => row.point?.baseEur ?? null));
  const bestEquity = maxNullable(rows.map((row) => row.point?.equityEur ?? null));
  const bestProgression = maxNullable(
    rows.map((row) => decisionGradeProgressionPercent(row.progression)),
  );
  const bestNet = maxNullable(
    rows.map((row) => row.payrollEstimate?.monthlyNetCashEur ?? null),
  );
  const bestCityAfterCosts = maxNullable(
    rows.map((row) => row.cityCashAfterReferenceCostsEur),
  );
  const bestMarketPercentile = maxNullable(
    rows.map((row) => row.negotiation.marketPercentile),
  );
  const bestEvidence = maxNullable(rows.map((row) => (row.point ? row.quality.score : null)));
  const decisionBrief = buildCompanyDecisionBrief({
    candidates: rows.map((row) => ({
      slug: row.company.slug,
      name: row.company.canonicalName,
      totalCompEur: payAmountFor(row.point, payBasis),
      monthlyNetCashEur: row.payrollEstimate?.monthlyNetCashEur ?? null,
      progressionPercent: decisionGradeProgressionPercent(row.progression),
      marketPercentile: row.negotiation.marketPercentile,
      cityAfterCostsEur: row.cityCashAfterReferenceCostsEur,
      evidenceScore: row.point ? row.quality.score : null,
    })),
    usingPreview,
    usingStaleEvidence: rows.some(
      (row) => row.point !== null && row.quality.state === "stale",
    ),
  });
  const totalCompSignal = decisionMetric(decisionBrief.metrics, "totalComp");
  const netCashSignal = decisionMetric(decisionBrief.metrics, "monthlyNetCash");
  const citySignal = decisionMetric(decisionBrief.metrics, "cityAfterCosts");
  const progressionSignal = decisionMetric(decisionBrief.metrics, "progression");
  const marketSignal = decisionMetric(decisionBrief.metrics, "marketPercentile");
  // What is actually on screen, said accurately. This used to report the
  // shortlist size whatever the source, so an explicit four-company comparison
  // was captioned "Your shortlist · 0 companies compared".
  const comparisonSourceNote =
    chosenCompanies.length > 0
      ? `Your picks · ${plural(companies.length, "company", "companies")} compared${
          chosenCompanies.length > MAX_COMPANIES_SHOWN
            ? `, the first ${MAX_COMPANIES_SHOWN} of ${chosenCompanies.length} chosen`
            : ""
        }. Reset to let EQ choose again.`
      : usingPreview
        ? shortlistedCompanies.length === 1
          ? "Preview · your one starred company beside the strongest evidenced alternatives. Star another to make this your own decision set."
          : "Preview · the strongest evidenced companies. Star at least two to replace this with your own decision set."
        : shortlistedCompanies.length > MAX_COMPANIES_SHOWN
          ? `Your shortlist · showing the first ${MAX_COMPANIES_SHOWN} of ${shortlistedCompanies.length}; remove one to bring the next into view.`
          : `Your shortlist · ${plural(shortlistedCompanies.length, "company", "companies")} compared, with missing evidence preserved.`;
  // The after-costs row used to be gated on `costCityKey`, which is only set in
  // reference mode — so Personal mode computed the figure, showed it in the
  // decision tile, and then hid the matrix row that explains it.
  const costAfterDetail = (row: ComparisonRow): string => {
    if (costMode === "personal") {
      if (personalCost === null) return `No personal costs saved for ${location}`;
      if (row.payrollEstimate === null) return "Needs a validated net-cash estimate";
      const monthly = personalMonthlyCostEur(personalCost);
      return `${euroOrDash(monthly)} of your own monthly costs${
        row.cityCashAfterReferenceCostsEur !== null && row.cityCashAfterReferenceCostsEur < 0
          ? " · short of them"
          : ""
      }`;
    }
    if (costCityKey === null) return `No validated cost bundle for ${location}`;
    if (cityLivingCosts === undefined) return "Validating city evidence";
    if (cityLivingCosts === null || cityLivingCosts.current !== true) {
      return "Current official cost evidence unavailable";
    }
    if (row.payrollEstimate === null) return "Needs a validated net-cash estimate";
    return `${euroOrDash(cityLivingCosts.monthlyReferenceCostEur)} monthly reference · ${cityLivingCosts.housingReferenceYear}/${cityLivingCosts.householdBudgetReferenceYear}`;
  };
  const showResearchStatusRow = rows.some(
    (row) =>
      row.tracked !== null &&
      (row.tracked.researchStatus !== "unsupported" || row.point === null),
  );
  const gridStyle = {
    gridTemplateColumns: `180px repeat(${Math.max(rows.length, 1)}, minmax(0, 1fr))`,
    minWidth: 180 + Math.max(rows.length, 1) * 190,
  };

  // Before the catalog lands, `companyCatalog` is the static seed set, so the
  // page would render a full comparison of whichever companies happened to be
  // compiled in and then swap them out — a decision surface stating a winner it
  // is about to change its mind about.
  if (!catalogReady) {
    return (
      <PageLoading
        title="Compare"
        description="Jobs-page pay ranks first. Sourced salary pages fill a cell only when that posting has no qualifying range."
        rows={5}
      />
    );
  }

  return (
    <PageShell width="wide">
      <PageHeader
        title="Compare"
        description="Jobs-page pay ranks first. Sourced salary pages fill a cell only when that posting has no qualifying range. Choose one geography for a like-for-like decision."
        action={
          <InfoDialog title="Comparison rules">
            <div className="space-y-4">
              <p>
                Compensation is compared from employer-posted career-page salaries
                first. If that posting has no qualifying range, a sourced public
                salary-page figure can fill the cell and stays labeled. A city filter
                requires a matching city figure; national data is not silently
                substituted. Reddit is never used for pay.
              </p>
              <p>
                One location is always selected, and a figure qualifies only if it was
                posted for that city or as a Spain-wide band that covers it. Two different
                cities never appear side by side, so a comparison is like-for-like by
                construction.
              </p>
              <p>
                Evidence strength reflects source directness, freshness, and geography.
                It is a reliability signal, not another compensation score.
              </p>
              <p>
                Pasted companies are added to the shortlist automatically and remain visible
                while research is queued, discovering, monitoring, unsupported, or retrying.
              </p>
              <p>
                Current employer-posted base ranges are shown separately from total
                compensation. They only unlock a suggested ask when the company, level,
                location, period, and stored salary evidence all agree.
              </p>
              <p>
                Net cash appears only while the official 2026 Spain payroll model is
                release-validated. It uses known recurring cash and excludes equity.
              </p>
              <p>
                Madrid cash after reference costs appears only for the Madrid filter and
                only while the official rent and essentials datasets are current. It is
                context, not a second vote for the same take-home figure.
              </p>
            </div>
          </InfoDialog>
        }
      />

      <MetricStrip
        metrics={[
          {
            label: "Current total comp",
            value:
              totalCompSignal.leaderName === null
                ? "—"
                : formatEuro(totalCompSignal.topValue, true),
            detail: totalCompSignal.leaderName ?? "Locked",
          },
          {
            label: "Jump to next level",
            value:
              progressionSignal.topValue === null
                ? "—"
                : `+${progressionSignal.topValue}%`,
            detail: progressionSignal.leaderName ?? "Locked",
          },
          {
            label: "Estimated net cash",
            value:
              netCashSignal.topValue === null
                ? "—"
                : `≈${formatEuro(netCashSignal.topValue, true)}/mo`,
            detail: netCashSignal.leaderName ?? "Locked",
          },
        ]}
      />

      <details className="mb-6 rounded-[20px] border border-border bg-card">
        <summary className="cursor-pointer px-5 py-4 text-sm font-medium text-foreground">
          Decision rationale
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {decisionBrief.confidence} · {decisionBrief.decisiveMetricCount} decisive signals
          </span>
        </summary>
        <div className="space-y-3 border-t border-border px-5 py-4 text-sm leading-relaxed text-muted-foreground">
          <p>{decisionBrief.summary}</p>
          {decisionBrief.tradeoffs.length > 0 && (
            <ul className="space-y-1.5 text-foreground">
              {decisionBrief.tradeoffs.map((tradeoff) => (
                <li key={tradeoff.key}>{tradeoff.explanation}</li>
              ))}
            </ul>
          )}
          {decisionBrief.tieNote !== null && <p>{decisionBrief.tieNote}</p>}
          {decisionBrief.alternatives.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">Why not the other company?</p>
              <ul className="mt-2 space-y-1">
                {decisionBrief.alternatives.map((alternative) => (
                  <li key={alternative.slug}>{alternative.explanation}</li>
                ))}
              </ul>
            </div>
          )}
          {decisionBrief.evidenceCaveat !== null && (
            <p className="text-warning">{decisionBrief.evidenceCaveat}</p>
          )}
        </div>
      </details>

      <section className="border-b border-border pb-5">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">
            Companies in this comparison
          </p>
          <p className="text-[10px] text-muted-foreground">
            {companies.length} of {MAX_COMPARED_COMPANIES}
            {chosenCompanies.length === 0 && " · chosen automatically"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {companies.map((company) => (
            <span
              key={company.slug}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 py-1 pl-3 pr-1 text-xs font-medium"
            >
              {company.canonicalName}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${company.canonicalName} from the comparison`}
                onClick={() =>
                  setCompareSlugs(
                    (chosenCompanies.length > 0 ? compareSlugs : companies.map((item) => item.slug))
                      .filter((slug) => slug !== company.slug),
                  )
                }
              >
                <XCircle className="size-3" />
              </Button>
            </span>
          ))}

          {companies.length < MAX_COMPARED_COMPANIES && (
            <Select
              value=""
              onValueChange={(next) => {
                if (typeof next !== "string" || next === "") return;
                setCompareSlugs([
                  ...(chosenCompanies.length > 0 ? compareSlugs : companies.map((item) => item.slug)),
                  next,
                ]);
              }}
            >
              <SelectTrigger className="h-8 w-44" aria-label="Add a company to compare">
                <span className="flex items-center gap-1.5 text-xs">
                  <Plus className="size-3.5" /> Add company
                </span>
              </SelectTrigger>
              <SelectContent align="start" sideOffset={6}>
                {companyCatalog
                  .filter((company) => !companies.some((item) => item.slug === company.slug))
                  .map((company) => (
                    <SelectItem key={company.slug} value={company.slug}>
                      {company.canonicalName}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}

          {chosenCompanies.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => setCompareSlugs([])}
              title="Go back to letting EQ choose"
            >
              Reset
            </Button>
          )}
        </div>
      </section>

      <section className="mt-5 flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end">
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">
            Target level
          </p>
          <SegmentedControl
            label="Comparison target level"
            layoutId="compare-target-level"
            value={targetLevel}
            options={LEVEL_OPTIONS}
            onChange={(next) => startTransition(() => setTargetLevel(next))}
          />
        </div>
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">
            Rank by
          </p>
          <SegmentedControl
            label="Pay basis"
            layoutId="compare-pay-basis"
            value={payBasis}
            options={PAY_BASIS_OPTIONS}
            onChange={(next) => startTransition(() => setPayBasis(next))}
          />
        </div>
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">
            Living costs
          </p>
          <SegmentedControl
            label="Living cost basis"
            layoutId="compare-cost-mode"
            value={costMode}
            options={COST_MODE_OPTIONS}
            onChange={(next) => startTransition(() => setCostMode(next))}
          />
        </div>
        <div className="lg:ml-auto">
          <p className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">
            Location scope
          </p>
          <DecisionLocationSelect
            value={location}
            onValueChange={(next) => setLocation(next)}
            className="h-9 w-full sm:w-56"
          />
        </div>
      </section>

      <p className="mb-4 text-xs text-muted-foreground">{comparisonSourceNote}</p>

      {rows.length > 0 && (
        <section className="border-b border-foreground/10 py-5">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Wallet className="size-3.5 text-primary" weight="regular" />
              <h2 className="text-xs font-semibold">Decision evidence</h2>
            </div>
            <p className="text-[10px] text-muted-foreground">
              {mixesNationalAndCityScopes
                ? `Mixes Spain-wide bands with ${location}-specific figures`
                : "Shared, validated evidence only"}
            </p>
          </div>
          <div className="grid divide-y divide-foreground/[0.07] border-y border-foreground/10 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
            <DecisionSignal
              label="Current total comp"
              metric={totalCompSignal}
            />
            <DecisionSignal
              label="Estimated net cash"
              metric={netCashSignal}
              unavailable={
                targetLevel === "intern"
                  ? "Not estimated for internships"
                  : payrollModel === undefined
                    ? "Validating payroll model"
                    : payrollModel?.current !== true
                      ? "Payroll model is not current"
                      : undefined
              }
            />
            <DecisionSignal
              label={personalCost !== null ? "After your costs" : costCityKey === null ? "City after costs" : `${location} after costs`}
              metric={citySignal}
              unavailable={
                personalCost !== null
                  ? undefined
                  : costMode === "off"
                    ? "Living costs are switched off"
                    : costMode === "personal"
                      ? `No personal costs saved for ${location}`
                      : costCityKey === null
                        ? `No validated cost bundle for ${location}`
                        : cityLivingCosts === undefined
                          ? "Validating city evidence"
                          : cityLivingCosts?.current !== true
                            ? `${location} cost evidence is not current`
                            : undefined
              }
            />
            <DecisionSignal
              label="Next-level jump"
              metric={progressionSignal}
              valueSuffix="%"
              deltaSuffix=" pp"
            />
          </div>
          <div className="mt-3 flex flex-col gap-1 text-[10px] leading-4 text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>
              Market position: {marketSignal.status === "decisive"
                ? `${marketSignal.leaderName} · P${marketSignal.topValue}`
                : marketSignal.status === "tie"
                  ? "near tie"
                  : "locked until two shown companies have exact-scope percentiles"}
            </p>
            <p>City costs and evidence quality affect context and confidence, not the winner count.</p>
          </div>
        </section>
      )}

      <section className="py-6">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold">Comparison matrix</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Best-in-row is highlighted only when at least one supported value exists.
            </p>
          </div>
          <p className="shrink-0 text-[10px] text-muted-foreground">
            {representedLocationScopes.size === 0 ? "No supported salary scope" : location}
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="border-y border-foreground/10 py-12 text-center">
            <p className="text-sm font-semibold">No comparable companies here yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Choose a different level or location, or add companies from Salary decision.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto border-y border-foreground/10">
            <div className="grid w-full divide-x divide-foreground/[0.07]" style={gridStyle}>
              <div className="bg-foreground/[0.018] px-4 py-5">
                <p className="text-[10px] font-bold uppercase text-muted-foreground">Metric</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {representedLocationScopes.size === 0
                    ? "Research state only"
                    : "Same level and scope"}
                </p>
              </div>
              {rows.map((row) => {
                const saved = shortlist.companies.has(row.company.slug);
                return (
                  <div key={row.company.slug} className="bg-foreground/[0.018] px-4 py-5">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/companies/${row.company.slug}`}
                          className="truncate text-sm font-semibold hover:text-primary hover:underline"
                        >
                          {row.company.canonicalName}
                        </Link>
                        <p className="mt-1 truncate text-[10px] text-muted-foreground">
                          {row.point?.companyLevel ??
                            (row.postedRange
                              ? `${formatPostedRange(row.postedRange)} posted base`
                              : companyResearchPresentation(row.tracked).label)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={saved ? `Remove ${row.company.canonicalName} from shortlist` : `Add ${row.company.canonicalName} to shortlist`}
                        title={saved ? "Remove from shortlist" : "Add to shortlist"}
                        onClick={() => shortlist.toggle(row.company.slug)}
                        className={saved ? "text-primary" : "text-muted-foreground"}
                      >
                        <Star className="size-4" weight={saved ? "fill" : "regular"} />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid w-full divide-x divide-foreground/[0.07] border-t border-foreground/[0.07]" style={gridStyle}>
              <div className="px-4 py-4">
                <p className="text-xs font-semibold">
                  {payBasis === "base" ? "Base pay" : "Total compensation"}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {payBasis === "base" ? "Employer band where posted" : "Gross annual"}
                </p>
              </div>
              {rows.map((row) => (
                <MetricCell
                  key={row.company.slug}
                  value={payCellLabel(row.point, payBasis)}
                  detail={row.point?.levelLabel ?? "No matching observation"}
                  best={bestTotal !== null && payAmountFor(row.point, payBasis) === bestTotal}
                />
              ))}
            </div>

            {rows.some((row) => row.postedRange !== null) && (
              <>
                <div className="grid w-full divide-x divide-foreground/[0.07] border-t border-primary/20 bg-primary/[0.018]" style={gridStyle}>
                  <div className="px-4 py-4">
                    <p className="text-xs font-semibold">Company-posted base</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">Current role posting · separate from TC</p>
                  </div>
                  {rows.map((row) => (
                    <MetricCell
                      key={row.company.slug}
                      value={row.postedRange ? formatPostedRange(row.postedRange) : "—"}
                      detail={
                        row.postedRange
                          ? `${row.postedRange.locationLabel} · ${row.postedRange.period} · checked ${formatDayFromTimestamp(row.postedRange.checkedAt)}`
                          : "No validated matching employer range"
                      }
                    />
                  ))}
                </div>
                <div className="grid w-full divide-x divide-foreground/[0.07] border-t border-primary/20 bg-primary/[0.018]" style={gridStyle}>
                  <div className="px-4 py-4">
                    <p className="text-xs font-semibold">Negotiation position</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">Exact company + level + location</p>
                  </div>
                  {rows.map((row) => (
                    <MetricCell
                      key={row.company.slug}
                      value={
                        row.negotiation.negotiationStatus === "ready"
                          ? `${formatEuro(row.negotiation.suggestedBaseMinimumEur, true)}–${formatEuro(row.negotiation.suggestedBaseMaximumEur, true)}`
                          : row.postedRange
                            ? "Locked"
                            : "—"
                      }
                      detail={
                        row.negotiation.negotiationStatus === "ready"
                          ? "Suggested annual base ask · planning anchor"
                          : row.postedRange
                            ? row.negotiation.negotiationLockedReason ?? "Evidence needs review"
                            : "No current matching employer range"
                      }
                    />
                  ))}
                </div>
              </>
            )}

            <div className="grid w-full divide-x divide-foreground/[0.07] border-t border-foreground/[0.07]" style={gridStyle}>
              <div className="px-4 py-4">
                <p className="text-xs font-semibold">Estimated net cash</p>
                <p className="mt-1 text-[10px] text-muted-foreground">Monthly · known cash only</p>
              </div>
              {rows.map((row) => (
                <MetricCell
                  key={row.company.slug}
                  value={row.payrollEstimate ? `≈${formatEuro(row.payrollEstimate.monthlyNetCashEur, true)} / mo` : "—"}
                  detail={
                    targetLevel === "intern"
                      ? "Not estimated for internships"
                      : payrollModel?.current !== true
                        ? "Validated payroll model unavailable"
                        : row.annualCashEur === null
                          ? "No supported recurring-cash value"
                          : "Equity excluded · withholding estimate"
                  }
                  best={bestNet !== null && row.payrollEstimate?.monthlyNetCashEur === bestNet}
                />
              ))}
            </div>

            {costMode !== "off" && (
              <div className="grid w-full divide-x divide-foreground/[0.07] border-t border-foreground/[0.07]" style={gridStyle}>
                <div className="px-4 py-4">
                  <p className="flex items-center gap-1.5 text-xs font-semibold">
                    <MapPin className="size-3.5" />{" "}
                    {costMode === "personal" ? "After your costs" : `After ${location} costs`}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {costMode === "personal"
                      ? `Net cash / month · your saved ${location} costs`
                      : "Net cash / month · reference renter"}
                  </p>
                </div>
                {rows.map((row) => (
                  <MetricCell
                    key={row.company.slug}
                    value={
                      row.cityCashAfterReferenceCostsEur === null
                        ? "—"
                        : `≈${euroOrDash(row.cityCashAfterReferenceCostsEur)} / mo`
                    }
                    detail={costAfterDetail(row)}
                    best={bestCityAfterCosts !== null && row.cityCashAfterReferenceCostsEur === bestCityAfterCosts}
                  />
                ))}
              </div>
            )}

            <div className="grid w-full divide-x divide-foreground/[0.07] border-t border-foreground/[0.07]" style={gridStyle}>
              <div className="px-4 py-4">
                <p className="text-xs font-semibold">Base salary</p>
                <p className="mt-1 text-[10px] text-muted-foreground">Recurring cash</p>
              </div>
              {rows.map((row) => (
                <MetricCell
                  key={row.company.slug}
                  value={formatEuro(row.point?.baseEur ?? null, true)}
                  best={bestBase !== null && row.point?.baseEur === bestBase}
                />
              ))}
            </div>

            <div className="grid w-full divide-x divide-foreground/[0.07] border-t border-foreground/[0.07]" style={gridStyle}>
              <div className="px-4 py-4">
                <p className="text-xs font-semibold">Annualized equity</p>
                <p className="mt-1 text-[10px] text-muted-foreground">Vesting-normalized</p>
              </div>
              {rows.map((row) => (
                <MetricCell
                  key={row.company.slug}
                  value={formatEuro(row.point?.equityEur ?? null, true)}
                  best={bestEquity !== null && row.point?.equityEur === bestEquity}
                />
              ))}
            </div>

            <div className="grid w-full divide-x divide-foreground/[0.07] border-t border-foreground/[0.07]" style={gridStyle}>
              <div className="px-4 py-4">
                <p className="text-xs font-semibold">Next-level upside</p>
                <p className="mt-1 text-[10px] text-muted-foreground">Same location only</p>
              </div>
              {rows.map((row) => (
                <MetricCell
                  key={row.company.slug}
                  value={row.progression === null || !row.progression.decisionGrade
                    ? "—"
                    : `${signedPercent(row.progression.percent)} · ${signedEuro(row.progression.deltaEur)}`}
                  detail={row.progression === null
                    ? decisionProgressionLockReason(row.company, targetLevel, location)
                    : row.progression.decisionGrade
                      ? `Jump to ${row.progression.to.companyLevel}`
                      : decisionProgressionLockReason(row.company, targetLevel, location)}
                  best={bestProgression !== null &&
                    decisionGradeProgressionPercent(row.progression) === bestProgression}
                />
              ))}
            </div>

            <div className="grid w-full divide-x divide-foreground/[0.07] border-t border-foreground/[0.07]" style={gridStyle}>
              <div className="px-4 py-4">
                <p className="text-xs font-semibold">Market position</p>
                <p className="mt-1 text-[10px] text-muted-foreground">Exact level + location peers</p>
              </div>
              {rows.map((row) => (
                <MetricCell
                  key={row.company.slug}
                  value={row.negotiation.marketPercentile === null ? "Locked" : `P${row.negotiation.marketPercentile}`}
                  detail={
                    row.negotiation.marketPercentile === null
                      ? row.negotiation.percentileLockedReason ?? "Insufficient exact-scope evidence"
                      : `${row.negotiation.comparableCompanyCount} sourced exact-scope companies`
                  }
                  best={bestMarketPercentile !== null && row.negotiation.marketPercentile === bestMarketPercentile}
                />
              ))}
            </div>

            <div className="grid w-full divide-x divide-foreground/[0.07] border-t border-foreground/[0.07]" style={gridStyle}>
              <div className="px-4 py-4">
                <p className="flex items-center gap-1.5 text-xs font-semibold">
                  <MapPin className="size-3.5" /> Salary location
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">Never inferred</p>
              </div>
              {rows.map((row) => (
                <MetricCell
                  key={row.company.slug}
                  value={row.point?.locationLabel ?? row.postedRange?.locationLabel ?? "—"}
                />
              ))}
            </div>

            {showResearchStatusRow && (
              <div className="grid w-full divide-x divide-foreground/[0.07] border-t border-foreground/[0.07]" style={gridStyle}>
                <div className="px-4 py-4">
                  <p className="flex items-center gap-1.5 text-xs font-semibold">
                    <Clock className="size-3.5" weight="regular" /> Career monitoring
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">Automatic · free public feeds</p>
                </div>
                {rows.map((row) => {
                  const research = companyResearchPresentation(row.tracked);
                  return (
                    <MetricCell
                      key={row.company.slug}
                      value={research.label}
                      detail={research.detail}
                    />
                  );
                })}
              </div>
            )}

            <div className="grid w-full divide-x divide-foreground/[0.07] border-t border-foreground/[0.07]" style={gridStyle}>
              <div className="px-4 py-4">
                <p className="flex items-center gap-1.5 text-xs font-semibold">
                  <ShieldCheck className="size-3.5" /> Evidence quality
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">Confidence + freshness</p>
              </div>
              {rows.map((row) => (
                <MetricCell
                  key={row.company.slug}
                  value={
                    row.point
                      ? displayConfidence(row.point.confidence)
                      : row.postedRange
                        ? "Direct range"
                        : "Pending"
                  }
                  detail={
                    row.point
                      ? `${row.quality.score}/100 · ${formatIsoDay(row.company.lastResearchedAt)}`
                      : row.postedRange
                        ? `Employer posting · checked ${formatDayFromTimestamp(row.postedRange.checkedAt)}`
                        : companyResearchPresentation(row.tracked).detail
                  }
                  best={
                    bestEvidence !== null &&
                    row.point !== null &&
                    row.quality.score === bestEvidence
                  }
                />
              ))}
            </div>
          </div>
        )}
      </section>
    </PageShell>
  );
}
