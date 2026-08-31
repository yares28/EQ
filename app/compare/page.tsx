"use client";

import Link from "next/link";

import { startTransition } from "react";
import { useQuery } from "convex/react";
import {
  CheckCircle,
  Clock,
  MapPin,
  ShieldCheck,
  Star,
  XCircle,
} from "@/components/eq/icon";

import {
  InfoDialog,
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
import { CompanyPicker } from "@/components/eq/company-picker";
import { PodiumBand, type BandStat } from "@/components/eq/podium-band";
import {
  decisionGradeProgressionPercent,
  decisionProgressionFor,
  decisionProgressionLockReason,
  formatEuro,
  payAmountFor,
  pointForLevel,
  targetLevelLabels,
  type SalaryProgression,
  type TargetLevel,
} from "@/lib/salary-analytics";
import {
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
  ordinal,
  placeAmong,
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
  /** The same company on the base basis, used only to explain a blank cell:
   * an employer posting states base and never total comp, so switching to
   * Total pay empties a column that Base pay fills. */
  basePoint: SalaryPoint | null;
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
  { value: "off", label: "No costs" },
  { value: "reference", label: "Reference" },
  { value: "personal", label: "My costs" },
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

/** The short form, for a column head where the row already gives context. */
function payBasisLabel(basis: PayBasis): string {
  return basis === "base" ? "Base" : "Total";
}

/** The full name, for prose that has to stand on its own. */
function payBasisPhrase(basis: PayBasis): string {
  return basis === "base" ? "base pay" : "total pay";
}

function maxNullable(values: (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length > 0 ? Math.max(...present) : null;
}

function knownAnnualCash(point: SalaryPoint | null): number | null {
  if (point?.baseEur === null || point?.baseEur === undefined) return null;
  return point.baseEur + (point.bonusEur ?? 0) + (point.extrasEur ?? 0);
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

/**
 * The frozen metric column. On a phone the matrix is ~940px wide inside a
 * 375px viewport, and this column used to scroll away with everything else —
 * leaving four columns of numbers with nothing saying what they measure.
 */
const MATRIX_LABEL_CELL =
  "sticky left-0 z-10 w-[200px] min-w-[200px] border-r border-foreground/[0.07] bg-card px-[22px] align-top";

function MatrixRow({
  label,
  sublabel,
  icon,
  tone = "default",
  children,
}: {
  label: string;
  sublabel: string;
  icon?: React.ReactNode;
  tone?: "default" | "posted";
  children: React.ReactNode;
}) {
  return (
    <tr
      className={
        tone === "posted"
          ? "border-t border-primary/20 bg-primary/[0.018]"
          : "border-t border-foreground/[0.07]"
      }
    >
      <th scope="row" className={`${MATRIX_LABEL_CELL} py-4 font-normal`}>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          {icon}
          {label}
        </span>
        <span className="mt-1 block text-[10px] leading-4 text-muted-foreground">
          {sublabel}
        </span>
      </th>
      {children}
    </tr>
  );
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
    <td
      className={`min-w-0 border-l border-foreground/[0.07] px-4 py-4 align-top ${
        best ? "bg-primary/[0.055]" : ""
      }`}
    >
      <p className="break-words font-semibold leading-5 text-foreground">
        {value}
        {best && (
          <>
            <CheckCircle
              aria-hidden
              className="ml-1.5 inline size-3.5 text-primary"
              weight="regular"
            />
            {/* The tick was the only marker of the best value in a row, and it
                carried no text, so it was invisible to a screen reader. */}
            <span className="sr-only"> — best in this row</span>
          </>
        )}
      </p>
      {detail && <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{detail}</p>}
    </td>
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

  /**
   * How much a company can actually contribute to a four-column comparison, at
   * the level and location in force. Only four columns fit, so whenever more
   * than four candidates exist — a long shortlist, or the preview drawing from
   * the whole catalog — this decides which four they are.
   *
   * It used to be decided by insertion order on both paths, and the preview
   * additionally led with the pool defined by having *no* salary evidence. A
   * twenty-company shortlist therefore opened on whichever four were starred
   * first, which in practice meant three columns of "—".
   */
  const comparisonStrength = (company: SalaryCompany): { tier: number; amount: number } => {
    const point = pointForLevel(company, targetLevel, location, payBasis);
    if (point !== null) return { tier: 2, amount: payAmountFor(point, payBasis) ?? 0 };
    const range = selectPostedRange({
      ranges: postedRanges,
      companySlug: company.slug,
      targetLevel,
      location,
    });
    if (range !== null) return { tier: 1, amount: annualizedPostedAmountEur(range) ?? 0 };
    return { tier: 0, amount: trackedBySlug.get(company.slug)?.researchRequestedAt ?? 0 };
  };
  const byComparisonStrength = (left: SalaryCompany, right: SalaryCompany): number => {
    const a = comparisonStrength(left);
    const b = comparisonStrength(right);
    return b.tier - a.tier || b.amount - a.amount ||
      left.canonicalName.localeCompare(right.canonicalName);
  };

  const shortlistedCompanies = [...shortlist.companies]
    .flatMap((slug) => {
      const company = companyCatalog.find((candidate) => candidate.slug === slug);
      return company ? [company] : [];
    })
    .sort(byComparisonStrength);
  const rankedAlternatives = companyCatalog
    .filter((company) => !shortlist.companies.has(company.slug))
    .sort(byComparisonStrength);
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
      basePoint:
        payBasis === "base" ? point : pointForLevel(company, targetLevel, location, "base"),
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
  /**
   * The podium, ordered by the basis the page is ranked on. Companies with no
   * figure sit out of it rather than being ranked last — being unmeasured is
   * not a position.
   */
  const podiumRows = rows
    .filter((row) => payAmountFor(row.point, payBasis) !== null)
    .slice()
    .sort((a, b) => (payAmountFor(b.point, payBasis) ?? 0) - (payAmountFor(a.point, payBasis) ?? 0));
  const podiumLead = podiumRows[0] ?? null;
  const podiumLeadValue = payAmountFor(podiumLead?.point ?? null, payBasis);
  const podium = podiumRows.map((row, index) => {
    const value = payAmountFor(row.point, payBasis);
    return {
      slug: row.company.slug,
      name: row.company.canonicalName,
      value: formatEuro(value, true),
      detail:
        index === 0
          ? `${payBasisPhrase(payBasis)} a year${
              row.point ? ` · ${row.point.companyLevel} · ${row.point.locationLabel}` : ""
            }`
          : value !== null && podiumLeadValue !== null
            ? `−${formatEuro(podiumLeadValue - value, true)}`
            : undefined,
    };
  });

  /**
   * Where the podium leader places on each measure, counted only among the
   * compared companies that have that measure. This is what compare's band
   * carries and salary's does not: the leader is rarely the leader on all of
   * them, and that is the comparison.
   */
  const placeOf = (
    pick: (row: ComparisonRow) => number | null,
  ): { ordinal?: string; note?: string } => {
    if (podiumLead === null) return { note: "—" };
    const place = placeAmong(pick(podiumLead), rows.map(pick));
    if (place !== null) return { ordinal: ordinal(place.position) };
    return { note: pick(podiumLead) === null ? "not measured" : "only figure" };
  };

  const podiumPlace = new Map(podium.map((entry, index) => [entry.slug, index + 1]));

  const compareStats: BandStat[] = podiumLead === null
    ? []
    : [
        {
          label: payBasis === "total" ? "Base" : "Total pay",
          value: formatEuro(
            payBasis === "total"
              ? podiumLead.point?.baseEur ?? null
              : podiumLead.point?.totalCompEur ?? null,
            true,
          ),
          ...placeOf((row) =>
            payBasis === "total" ? row.point?.baseEur ?? null : row.point?.totalCompEur ?? null,
          ),
        },
        {
          label: "Take-home",
          value: podiumLead.payrollEstimate
            ? `≈${formatEuro(podiumLead.payrollEstimate.monthlyNetCashEur, true)}`
            : "—",
          suffix: podiumLead.payrollEstimate ? "/mo" : undefined,
          ...placeOf((row) => row.payrollEstimate?.monthlyNetCashEur ?? null),
        },
        ...(costMode === "off"
          ? []
          : [
              {
                label: costMode === "personal" ? "After your costs" : `After ${location} costs`,
                value:
                  podiumLead.cityCashAfterReferenceCostsEur == null
                    ? "—"
                    : `≈${euroOrDash(podiumLead.cityCashAfterReferenceCostsEur)}`,
                suffix:
                  podiumLead.cityCashAfterReferenceCostsEur == null ? undefined : "/mo",
                ...placeOf((row) => row.cityCashAfterReferenceCostsEur),
              },
            ]),
        {
          label: "Next step",
          value: podiumLead.progression?.decisionGrade
            ? signedPercent(podiumLead.progression.percent)
            : "—",
          ...(podiumLead.progression?.decisionGrade
            ? placeOf((row) => decisionGradeProgressionPercent(row.progression))
            : { note: "no audited step" }),
        },
        {
          label: "Evidence",
          value: podiumLead.point
            ? displayConfidence(podiumLead.point.confidence)
            : podiumLead.postedRange
              ? "Direct range"
              : "Pending",
          ...placeOf((row) => (row.point ? row.quality.score : null)),
        },
        {
          // No note: it left too little room for the date, which truncated to
          // "31 Aug 2…", and "as researched" was not telling anyone anything.
          label: "Checked",
          value: formatIsoDay(podiumLead.company.lastResearchedAt),
        },
      ];

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
          ? `Your shortlist · the ${MAX_COMPANIES_SHOWN} best-evidenced of ${shortlistedCompanies.length} starred; pick companies explicitly to compare a different four.`
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
  // Employer-posted figures are base-only by construction, so the Total pay
  // basis blanks every column whose only evidence is a posting. That is the
  // correct answer — a total-comp figure was never stated — but the page used
  // to give it as an unexplained dash under a header promising jobs-page pay.
  const baseOnlyRows = rows.filter(
    (row) => row.point === null && (row.basePoint !== null || row.postedRange !== null),
  );
  const basisNote =
    payBasis === "total" && baseOnlyRows.length > 0
      ? `Total pay leaves ${plural(baseOnlyRows.length, "company", "companies")} blank: ${baseOnlyRows
          .map((row) => row.company.canonicalName)
          .join(", ")} ${baseOnlyRows.length === 1 ? "states" : "state"} base only. Switch to Base pay to rank them.`
      : null;
  // Offered strongest-first, and each option says what evidence backs it, so
  // adding a column is a decision rather than a scroll through a flat list.
  const pickerCompanies = [...companyCatalog].sort(byComparisonStrength);
  const describeCandidate = (company: SalaryCompany): string => {
    const strength = comparisonStrength(company);
    if (strength.tier === 2) {
      return `${payBasisLabel(payBasis)} ${euroOrDash(strength.amount)} at ${targetLevelLabels[targetLevel]}`;
    }
    if (strength.tier === 1) return "Employer-posted band only";
    return companyResearchPresentation(trackedBySlug.get(company.slug) ?? null).label;
  };
  const showResearchStatusRow = rows.some(
    (row) =>
      row.tracked !== null &&
      (row.tracked.researchStatus !== "unsupported" || row.point === null),
  );
  const matrixMinWidth = 180 + Math.max(rows.length, 1) * 190;

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
        description={
          payBasis === "base"
            ? "Jobs-page pay ranks first. Sourced salary pages fill a cell only when that posting has no qualifying range."
            : "Ranked on total compensation, which only a sourced salary point states — employer postings publish base pay and are shown separately below."
        }
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

      {/* The band replaces the metric strip — three tiles that read "Locked"
          whenever the compared set is thin — and the decision rationale, which
          was the only human summary on the page and was collapsed behind a
          disclosure. The rationale's tradeoffs and caveats move under it,
          open. */}
      <PodiumBand
        eyebrow={`${targetLevelLabels[targetLevel]} · ${location} · ${plural(rows.length, "company", "companies")} compared`}
        rankedOn={`Ranked on ${payBasisPhrase(payBasis)}`}
        podium={podium}
        emptyMessage={`None of the compared companies has a published ${payBasisPhrase(payBasis)} figure at ${targetLevelLabels[targetLevel]} in ${location}, so there is nothing to rank yet.`}
        statsLabel={podiumLead ? `Where ${podiumLead.company.canonicalName} places` : ""}
        stats={compareStats}
        footer={
          // Only what nothing else on the page says. The tradeoff list went:
          // "Google leads total compensation by €17,931" is the podium's
          // "−€17.9k behind" read backwards, and "Amazon leads next-level jump"
          // is the ordinal beside Next step.
          decisionBrief.tieNote !== null || decisionBrief.evidenceCaveat !== null ? (
            <div className="mt-6 space-y-1.5 border-t border-eq-accent-foreground/[0.16] pt-4 text-[13px] leading-relaxed opacity-75">
              {decisionBrief.tieNote !== null && <p>{decisionBrief.tieNote}</p>}
              {decisionBrief.evidenceCaveat !== null && <p>{decisionBrief.evidenceCaveat}</p>}
            </div>
          ) : undefined
        }
      />

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
              className="inline-flex max-w-56 items-center gap-1 rounded-full border border-border bg-muted/60 py-1 pl-3 pr-1 text-xs font-medium"
            >
              <span className="truncate" title={company.canonicalName}>
                {company.canonicalName}
              </span>
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
            <CompanyPicker
              companies={pickerCompanies}
              excludeSlugs={new Set(companies.map((item) => item.slug))}
              describe={describeCandidate}
              onSelect={(slug) =>
                setCompareSlugs([
                  ...(chosenCompanies.length > 0 ? compareSlugs : companies.map((item) => item.slug)),
                  slug,
                ])
              }
            />
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

      {/* One bar, as on the salary page: four stacked label-and-pill blocks
          pushed the matrix below the fold before anything was chosen. */}
      <section className="mt-5 mb-7 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-card p-3 shadow-[0_0_0_1px_rgb(26_25_23_/_5.5%)]">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <SegmentedControl
            label="Comparison target level"
            layoutId="compare-target-level"
            value={targetLevel}
            options={LEVEL_OPTIONS}
            onChange={(next) => startTransition(() => setTargetLevel(next))}
          />
          <span aria-hidden className="hidden h-5 w-px bg-border sm:block" />
          <SegmentedControl
            label="Pay basis"
            layoutId="compare-pay-basis"
            value={payBasis}
            options={PAY_BASIS_OPTIONS}
            onChange={(next) => startTransition(() => setPayBasis(next))}
          />
          <span aria-hidden className="hidden h-5 w-px bg-border sm:block" />
          <SegmentedControl
            label="Living cost basis"
            layoutId="compare-cost-mode"
            value={costMode}
            options={COST_MODE_OPTIONS}
            onChange={(next) => startTransition(() => setCostMode(next))}
          />
        </div>
        <DecisionLocationSelect
          value={location}
          onValueChange={(next) => setLocation(next)}
          className="h-8 min-w-0 rounded-full border-0 bg-secondary shadow-none hover:bg-muted sm:min-w-[9rem]"
        />
      </section>

      <p className="mb-4 text-xs text-muted-foreground">{comparisonSourceNote}</p>

      {basisNote !== null && (
        <p className="mb-4 rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 text-xs leading-5 text-muted-foreground">
          {basisNote}
        </p>
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
          <div
            // A real scroll container needs to be reachable without a mouse:
            // the matrix is ~940px wide on a 375px screen and had no tab stop,
            // so keyboard and switch users could not scroll to columns 3 and 4.
            role="region"
            aria-label={`Comparison matrix · ${plural(rows.length, "company", "companies")} at ${targetLevelLabels[targetLevel]} in ${location}`}
            tabIndex={0}
            className="overflow-x-auto rounded-2xl bg-card shadow-[0_0_0_1px_rgb(26_25_23_/_5.5%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <table
              className="w-full border-collapse text-left"
              style={{ minWidth: matrixMinWidth }}
            >
              <caption className="sr-only">
                {`Compensation and evidence for ${plural(rows.length, "company", "companies")} at ${targetLevelLabels[targetLevel]} in ${location}. One row per metric, one column per company. A cell marked best is the highest supported value in its row.`}
              </caption>
              <thead>
                <tr className="bg-foreground/[0.014]">
                  <th scope="col" className={`${MATRIX_LABEL_CELL} py-5`}>
                    <span className="block text-[10px] font-bold uppercase text-muted-foreground">
                      Metric
                    </span>
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      {representedLocationScopes.size === 0
                        ? "Research state only"
                        : "Same level and scope"}
                    </span>
                  </th>
                  {rows.map((row) => {
                    const saved = shortlist.companies.has(row.company.slug);
                    return (
                      <th
                        scope="col"
                        key={row.company.slug}
                        className="min-w-[190px] border-l border-foreground/[0.07] px-4 py-5 align-top font-normal"
                      >
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              {/* The band's order, carried into the matrix so the
                                  two cannot be read against each other. */}
                              {podiumPlace.get(row.company.slug) !== undefined && (
                                <span
                                  aria-hidden
                                  className={`grid size-[19px] shrink-0 place-items-center rounded-full text-[10.5px] font-bold ${
                                    podiumPlace.get(row.company.slug) === 1
                                      ? "bg-eq-accent text-eq-accent-foreground"
                                      : "bg-foreground/10 text-foreground"
                                  }`}
                                >
                                  {podiumPlace.get(row.company.slug)}
                                </span>
                              )}
                              <Link
                                href={`/companies/${row.company.slug}`}
                                className="block truncate text-sm font-semibold hover:text-primary hover:underline"
                              >
                                {row.company.canonicalName}
                              </Link>
                            </span>
                            <p className="mt-1 truncate text-[10px] font-normal text-muted-foreground">
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
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                <MatrixRow
                  label={payBasis === "base" ? "Base pay" : "Total compensation"}
                  sublabel={
                    payBasis === "base"
                      ? "Employer band where posted"
                      : "Gross annual · sourced figures only"
                  }
                >
                  {rows.map((row) => (
                    <MetricCell
                      key={row.company.slug}
                      value={payCellLabel(row.point, payBasis)}
                      detail={
                        row.point?.levelLabel ??
                        (payBasis === "total" && (row.basePoint !== null || row.postedRange !== null)
                          ? "Base stated, total comp never was"
                          : "No matching observation")
                      }
                      best={bestTotal !== null && payAmountFor(row.point, payBasis) === bestTotal}
                    />
                  ))}
                </MatrixRow>

                {rows.some((row) => row.postedRange !== null) && (
                  <>
                    <MatrixRow
                      label="Company-posted base"
                      sublabel="Current role posting · separate from TC"
                      tone="posted"
                    >
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
                    </MatrixRow>
                    <MatrixRow
                      label="Negotiation position"
                      sublabel="Exact company + level + location"
                      tone="posted"
                    >
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
                    </MatrixRow>
                  </>
                )}

                <MatrixRow label="Estimated net cash" sublabel="Monthly · known cash only">
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
                </MatrixRow>

                {costMode !== "off" && (
                  <MatrixRow
                    icon={<MapPin className="size-3.5" />}
                    label={costMode === "personal" ? "After your costs" : `After ${location} costs`}
                    sublabel={
                      costMode === "personal"
                        ? `Net cash / month · your saved ${location} costs`
                        : "Net cash / month · reference renter"
                    }
                  >
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
                  </MatrixRow>
                )}

                <MatrixRow label="Base salary" sublabel="Recurring cash">
                  {rows.map((row) => (
                    <MetricCell
                      key={row.company.slug}
                      value={formatEuro(row.point?.baseEur ?? null, true)}
                      best={bestBase !== null && row.point?.baseEur === bestBase}
                    />
                  ))}
                </MatrixRow>

                <MatrixRow label="Annualized equity" sublabel="Vesting-normalized">
                  {rows.map((row) => (
                    <MetricCell
                      key={row.company.slug}
                      value={formatEuro(row.point?.equityEur ?? null, true)}
                      best={bestEquity !== null && row.point?.equityEur === bestEquity}
                    />
                  ))}
                </MatrixRow>

                <MatrixRow label="Next-level upside" sublabel="Same location only">
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
                </MatrixRow>

                <MatrixRow label="Market position" sublabel="Exact level + location peers">
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
                </MatrixRow>

                <MatrixRow
                  icon={<MapPin className="size-3.5" />}
                  label="Salary location"
                  sublabel="Never inferred"
                >
                  {rows.map((row) => (
                    <MetricCell
                      key={row.company.slug}
                      value={row.point?.locationLabel ?? row.postedRange?.locationLabel ?? "—"}
                    />
                  ))}
                </MatrixRow>

                {showResearchStatusRow && (
                  <MatrixRow
                    icon={<Clock className="size-3.5" weight="regular" />}
                    label="Career monitoring"
                    sublabel="Automatic · free public feeds"
                  >
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
                  </MatrixRow>
                )}

                <MatrixRow
                  icon={<ShieldCheck className="size-3.5" />}
                  label="Evidence quality"
                  sublabel="Confidence + freshness"
                >
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
                </MatrixRow>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PageShell>
  );
}
