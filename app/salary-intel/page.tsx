"use client";

import Link from "next/link";
import { startTransition } from "react";
import { useQuery } from "convex/react";
import {
  ArrowSquareOut,
  Bank,
  ChatCircle,
  Eye,
  EyeClosed,
  Info,
  ShieldCheck,
  Star,
} from "@/components/eq/icon";

import { InfoDialog, MetricStrip, PageHeader, PageShell } from "@/components/eq/page-shell";
import { CompanyIntakeDialog } from "@/components/eq/company-intake";
import { SegmentedControl } from "@/components/eq/segmented-control";
import { useCompanyCatalog } from "@/components/eq/use-company-catalog";
import { useSalaryDecisionContext } from "@/components/eq/use-salary-decision-context";
import { useShortlist } from "@/components/eq/use-shortlist";
import { useViewPreferences } from "@/components/eq/use-view-preferences";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DecisionLocationSelect } from "@/components/eq/decision-location-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  opinionForCompany,
  opinionMethodology,
  type CompanyOpinion,
  type OpinionSignal,
} from "@/lib/company-opinions";
import {
  decisionProgressionFor,
  decisionProgressionLockReason,
  equityShare,
  formatEuro,
  isPostedSalaryPoint,
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
import { freshnessTone, pointResearchQuality } from "@/lib/research-quality";
import {
  estimateCashAfterCityReferenceCosts,
  estimateCashAfterPersonalCosts,
  personalCostForLocation,
} from "@/lib/city-reference-costs";
import {
  estimateSpainPayroll2026,
  type SpainPayrollEstimate2026,
} from "@/lib/spain-payroll-2026";
import {
  analyzeSalaryNegotiation,
  type EvidenceSampleQuality,
  type SalaryNegotiationAnalysis,
} from "@/lib/salary-negotiation";
import {
  careerProviderLabel,
  selectAnyPostedRange,
  selectPostedRange,
  type CompanyPostedRange,
  type TrackedCompanySummary,
} from "@/lib/company-research-catalog";
import type { SortKey } from "@/lib/view-preferences";
import { api } from "@/convex/_generated/api";


interface CompanyRow {
  company: SalaryCompany;
  point: SalaryPoint | null;
  /** Always the base-basis point, so a total-basis lock can explain itself. */
  basePoint: SalaryPoint | null;
  postedRange: CompanyPostedRange | null;
  nearbyPosted: CompanyPostedRange | null;
  negotiation: SalaryNegotiationAnalysis;
  progression: SalaryProgression | null;
  equity: number | null;
  opinion: CompanyOpinion;
  annualCashEur: number | null;
  payrollEstimate: SpainPayrollEstimate2026 | null;
  cityCashAfterReferenceCostsEur: number | null;
}

const LEVEL_OPTIONS: { value: TargetLevel; label: string }[] = [
  { value: "intern", label: "Intern" },
  { value: "junior", label: "SDE1" },
  { value: "mid", label: "SDE2" },
];

const POSTED_LEVEL_LABELS: Record<CompanyPostedRange["level"], string> = {
  intern: "Intern",
  junior: "SDE1",
  mid: "SDE2",
  senior: "Senior",
  staff: "Staff",
  principal: "Principal",
};

const PAY_BASIS_OPTIONS: { value: PayBasis; label: string }[] = [
  { value: "base", label: "Base pay" },
  { value: "total", label: "Total pay" },
];

const COST_MODE_OPTIONS: { value: CostMode; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "reference", label: "Reference" },
  { value: "personal", label: "Personal" },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "pay", label: "Base pay" },
  { value: "net", label: "Estimated net cash" },
  { value: "growth", label: "Pay progression" },
  { value: "equity", label: "Equity share" },
  { value: "opinion", label: "Employee opinion" },
];

function readable(text: string): string {
  return text.replace(/\bEUR\s*/g, "€").replace(/\bUnknown\b/g, "—");
}

function confidenceLabel(confidence: Confidence | null): string {
  return !confidence || confidence === "Unknown" ? "—" : confidence;
}

function confidenceDot(confidence: Confidence | null): string {
  if (confidence === "High") return "bg-success";
  if (confidence === "Medium") return "bg-primary";
  if (confidence === "Low") return "bg-warning";
  return "bg-foreground/20";
}

function signalTone(signal: OpinionSignal): string {
  if (signal === "Strong") return "text-success";
  if (signal === "Mixed") return "text-warning";
  if (signal === "Weak") return "text-destructive";
  return "text-muted-foreground";
}

function opinionScore(score: number | null): string {
  return score === null ? "—" : `${score.toFixed(1)} / 5`;
}

function opinionConfidenceLabel(confidence: Confidence): string {
  return confidence === "Unknown" ? "Insufficient evidence" : `${confidence} confidence`;
}

function sampleQualityTone(quality: EvidenceSampleQuality): string {
  if (quality === "strong") return "text-success";
  if (quality === "directional") return "text-primary";
  if (quality === "limited") return "text-warning";
  return "text-muted-foreground";
}

function formatResearchDate(date: string): string {
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(timestamp));
}

function formatTimestampDate(timestamp: number): string {
  return formatResearchDate(new Date(timestamp).toISOString().slice(0, 10));
}

const QUARANTINE_REASON_LABELS: Record<string, string> = {
  outside_spain_scope: "outside Spain",
  currency_not_eur: "non-EUR",
  currency_conflict: "mixed currency",
  not_software_engineering_ic: "not an IC software role",
  level_ambiguous: "level not explicit",
  period_missing: "pay period missing",
  amount_missing_or_out_of_bounds: "amount invalid",
  multiple_compensation_amounts: "multiple pay components",
  range_spread_implausible: "range implausible",
};

function quarantineReasonSummary(reasons: Array<{ reason: string; count: number }>): string {
  return reasons.slice(0, 2).map(({ reason, count }) =>
    `${count} ${QUARANTINE_REASON_LABELS[reason] ?? reason.replaceAll("_", " ")}`,
  ).join(" · ");
}

function formatPostedRange(range: CompanyPostedRange, compact = true): string {
  const minimum = formatEuro(range.minimumAmount, compact);
  const maximum = formatEuro(range.maximumAmount, compact);
  if (range.rangeKind === "minimum") return `From ${minimum}`;
  if (range.rangeKind === "maximum") return `Up to ${maximum}`;
  if (range.rangeKind === "fixed" || range.minimumAmount === range.maximumAmount) return minimum;
  return `${minimum}–${maximum}`;
}

function postedPeriodLabel(period: CompanyPostedRange["period"]): string {
  if (period === "hour") return "hour";
  if (period === "month") return "month";
  return "year";
}

function compareNullable(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

function breakdown(point: SalaryPoint | null) {
  return [
    { label: "Base", value: formatEuro(point?.baseEur ?? null, true) },
    { label: "Bonus", value: formatEuro(point?.bonusEur ?? null, true) },
    { label: "Equity", value: formatEuro(point?.equityEur ?? null, true) },
    { label: "Extras", value: formatEuro(point?.extrasEur ?? null, true) },
  ];
}

function knownAnnualCash(point: SalaryPoint | null): number | null {
  if (point?.baseEur === null || point?.baseEur === undefined) return null;
  return point.baseEur + (point.bonusEur ?? 0) + (point.extrasEur ?? 0);
}

/**
 * Pay evidence means a figure published for *this* level. `nearbyPosted` is a
 * range this company posted at some other level; it is context for the reader
 * and never a value for this row, so it is deliberately absent from every
 * function below.
 */
function rowHasPayEvidence(row: CompanyRow): boolean {
  return row.point !== null;
}

function rowPaySortValue(row: CompanyRow, basis: PayBasis): number | null {
  return row.point === null ? null : payAmountFor(row.point, basis);
}

/**
 * Names what the company posts instead, so an empty pay cell reads as a
 * measured absence rather than missing research.
 */
function otherLevelNote(range: CompanyPostedRange, targetLabel: string): string {
  return `No ${targetLabel} range posted · jobs page posts ${formatPostedRange(range)} at ${POSTED_LEVEL_LABELS[range.level]}`;
}

function rowPayDisplay(row: CompanyRow, basis: PayBasis): {
  primary: string;
  secondary: string | null;
  posted: boolean;
} {
  const point = row.point;
  if (point === null) return { primary: "—", secondary: null, posted: false };
  const amount = payAmountFor(point, basis);
  if (amount === null) return { primary: "—", secondary: null, posted: false };
  const posted = isPostedSalaryPoint(point);

  // A posted base band is shown as the band the employer published rather than
  // as a single midpoint, which is what they can actually be held to.
  if (
    basis === "base" &&
    point.baseMinEur != null &&
    point.baseMaxEur != null &&
    point.baseMinEur !== point.baseMaxEur
  ) {
    return {
      primary: `${formatEuro(point.baseMinEur, true)}–${formatEuro(point.baseMaxEur, true)}`,
      secondary: `Posted band · ${point.locationLabel}`,
      posted,
    };
  }

  return {
    primary: formatEuro(amount, true),
    secondary:
      basis === "total" && point.baseEur !== null && point.baseEur !== undefined
        ? `Base ${formatEuro(point.baseEur, true)}`
        : basis === "base" && point.totalCompEur !== null
          ? `Total ${formatEuro(point.totalCompEur, true)}`
          : null,
    posted,
  };
}

/**
 * Why a row shows no figure on the selected basis. An employer posting states
 * base only, so asking for total must say that rather than look like a research
 * gap.
 */
function payLockReason(
  row: CompanyRow,
  basis: PayBasis,
  targetLabel: string,
  tracked: TrackedCompanySummary | undefined,
): string {
  if (basis === "total" && row.basePoint !== null) {
    return isPostedSalaryPoint(row.basePoint)
      ? "Employer posted base only — bonus and equity not stated"
      : "Base published, total not";
  }
  if (row.nearbyPosted) return otherLevelNote(row.nearbyPosted, targetLabel);
  if (tracked?.researchStatus === "monitoring") {
    return tracked.lastCareerSyncAt
      ? `${tracked.openRoleCount} relevant open ${tracked.openRoleCount === 1 ? "role" : "roles"} · ${careerProviderLabel(tracked.provider)}`
      : "Career feed linked · sync pending";
  }
  if (tracked?.researchStatus === "discovering") return "Discovering free career feed";
  if (tracked?.researchStatus === "queued") return "Company research queued";
  if (tracked?.researchStatus === "unsupported") return "No supported free career feed";
  if (tracked?.researchStatus === "failed") return "Research retry needed";
  return "—";
}

/** The location this row's pay figure applies to — never a different level's. */
function rowLocationLabel(row: CompanyRow): string {
  return row.point?.locationLabel ?? "—";
}

function OpinionDialog({
  companyName,
  opinion,
}: {
  companyName: string;
  opinion: CompanyOpinion;
}) {
  const signals = [
    { label: "Work-life", value: opinion.signals.workLife },
    { label: "Growth", value: opinion.signals.growth },
    { label: "Culture", value: opinion.signals.culture },
  ];

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto min-w-20 justify-start px-2 py-1.5 text-left"
            aria-label={`Open ${companyName} employee opinion evidence`}
          />
        }
      >
        <span className="flex items-center gap-2">
          <ChatCircle className="size-3.5 text-muted-foreground" weight="regular" />
          <span>
            <span className="block font-semibold tabular text-foreground">
              {opinionScore(opinion.score)}
            </span>
            <span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">
              {opinionConfidenceLabel(opinion.confidence)}
            </span>
          </span>
        </span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{companyName} employee sentiment</DialogTitle>
          <DialogDescription>
            {opinionScore(opinion.score)} · {opinionConfidenceLabel(opinion.confidence)} · {opinion.evidenceScope}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-6 overflow-y-auto pr-1 text-sm leading-6 text-muted-foreground">
          <section>
            <div className="grid grid-cols-3 border-y border-foreground/10 py-4">
              {signals.map((signal, index) => (
                <div
                  key={signal.label}
                  className={index === 0 ? "" : "border-l border-foreground/10 pl-4"}
                >
                  <p className="text-[10px] text-muted-foreground">{signal.label}</p>
                  <p className={`mt-1 font-semibold ${signalTone(signal.value)}`}>
                    {signal.value === "Unknown" ? "—" : signal.value}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-foreground">{opinion.summary}</p>
          </section>

          {opinion.positives.length > 0 && (
            <section>
              <p className="text-xs font-semibold text-foreground">Recurring positives</p>
              <ul className="mt-2 space-y-2">
                {opinion.positives.map((item) => (
                  <li key={item} className="border-l border-success/40 pl-3">
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <p className="text-xs font-semibold text-foreground">Recurring concerns</p>
            <ul className="mt-2 space-y-2">
              {opinion.concerns.map((item) => (
                <li key={item} className="border-l border-warning/50 pl-3">
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <p className="text-xs font-semibold text-foreground">Reddit evidence</p>
            <div className="mt-2 divide-y divide-foreground/[0.07] border-y border-foreground/10">
              {opinion.sources.map((source) => (
                <div key={source.id} className="py-3">
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
                  >
                    {source.label}
                    <ArrowSquareOut className="size-3" />
                  </a>
                  <p className="mt-1 text-xs">
                    {source.geography} · {source.kind} · {source.publishedAt}
                  </p>
                  <p className="mt-1 text-xs">{source.note}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="border-t border-foreground/10 pt-4 text-xs">
            <p>{opinionMethodology.description}</p>
            <p className="mt-2">{opinionMethodology.confidence}</p>
            <p className="mt-2">Last researched {opinion.lastResearchedAt}.</p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CompanyDeepDive({
  company,
  point,
  postedRange,
  negotiation,
  progression,
  opinion,
}: {
  company: SalaryCompany;
  point: SalaryPoint | null;
  postedRange: CompanyPostedRange | null;
  negotiation: SalaryNegotiationAnalysis;
  progression: SalaryProgression | null;
  opinion: CompanyOpinion;
}) {
  const sourceIds = new Set([
    ...(point?.sourceIds ?? []),
    ...(progression?.to.sourceIds ?? []),
  ]);
  const sources = sourceIds.size === 0
    ? []
    : company.sources.filter((source) => sourceIds.has(source.id));
  const evidenceNote = readable(point?.confidenceNote ?? company.researchNotes);
  const hasEvidenceConflict = /conflict|disagree|inconsistent/i.test(evidenceNote);

  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs font-semibold text-foreground">Role and pay</p>
        {point ? (
          <div className="mt-3 grid grid-cols-2 gap-y-4 border-y border-foreground/10 py-4 sm:grid-cols-4">
            {breakdown(point).map((item) => (
              <div key={item.label}>
                <p className="text-[10px] text-muted-foreground">{item.label}</p>
                <p className="mt-1 font-semibold tabular text-foreground">{item.value}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2">—</p>
        )}
        {point && (
          <p className="mt-3 text-xs">
            {point.levelLabel} · {point.companyLevel} · {point.locationLabel}
          </p>
        )}
      </section>

      <section>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-foreground">Negotiation position</p>
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
              Exact company, level, and location evidence only.
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase ${
              negotiation.negotiationStatus === "ready"
                ? "bg-success/10 text-success"
                : "bg-foreground/[0.06] text-muted-foreground"
            }`}
          >
            {negotiation.negotiationStatus === "ready" ? "Ready" : "Locked"}
          </span>
        </div>

        {negotiation.negotiationStatus === "ready" ? (
          <div className="mt-3 border-y border-success/25 bg-success/[0.035] px-3 py-4">
            <p className="text-[10px] font-bold uppercase text-success">
              Suggested base ask zone
            </p>
            <p className="mt-1 text-xl font-semibold tabular text-foreground">
              {formatEuro(negotiation.suggestedBaseMinimumEur)}–{formatEuro(negotiation.suggestedBaseMaximumEur)}
              <span className="text-xs font-semibold text-muted-foreground"> / year</span>
            </p>
            <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
              Planning anchor, not an offer prediction. Bonus and equity remain outside this base-pay range.
            </p>
          </div>
        ) : (
          <div className="mt-3 border-y border-foreground/10 bg-foreground/[0.02] px-3 py-4">
            <p className="text-[10px] font-bold uppercase text-muted-foreground">
              Suggested ask locked
            </p>
            <p className="mt-1 text-xs leading-5 text-foreground">
              {negotiation.negotiationLockedReason}
            </p>
          </div>
        )}

        <div className="mt-3 grid grid-cols-3 border-y border-foreground/10 py-3">
          <div>
            <p className="text-[10px] text-muted-foreground">Market position</p>
            <p className="mt-1 text-sm font-semibold tabular text-foreground">
              {negotiation.marketPercentile === null ? "Locked" : `P${negotiation.marketPercentile}`}
            </p>
          </div>
          <div className="border-l border-foreground/10 pl-3">
            <p className="text-[10px] text-muted-foreground">Exact-scope peers</p>
            <p className="mt-1 text-sm font-semibold tabular text-foreground">
              {negotiation.comparableCompanyCount}
            </p>
          </div>
          <div className="border-l border-foreground/10 pl-3">
            <p className="text-[10px] text-muted-foreground">Publisher sample</p>
            <p className="mt-1 text-sm font-semibold tabular text-foreground">
              {negotiation.publisherSampleSize ?? "N/A"}
            </p>
          </div>
        </div>

        <div className="mt-3 space-y-1 text-[10px] leading-4 text-muted-foreground">
          <p className={sampleQualityTone(negotiation.sampleQuality)}>
            {negotiation.sampleQualityLabel} · {negotiation.linkedSourceCount} linked {negotiation.linkedSourceCount === 1 ? "source" : "sources"}
          </p>
          <p>
            {negotiation.marketPercentile === null
              ? negotiation.percentileLockedReason
              : `Percentile compares ${negotiation.comparableCompanyCount} sourced companies in ${negotiation.comparisonScope}; it is not a population percentile.`}
          </p>
          <p>{negotiation.negotiationBasis}</p>
        </div>
      </section>

      {postedRange && (
        <section className="border-y border-primary/20 bg-primary/[0.035] py-4">
          <div className="flex flex-col gap-2 px-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase text-primary">
                Current company-posted base pay
              </p>
              <p className="mt-1 text-lg font-semibold tabular text-foreground">
                {formatPostedRange(postedRange)}
                <span className="text-xs font-semibold text-muted-foreground">
                  {` / ${postedPeriodLabel(postedRange.period)}`}
                </span>
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {postedRange.title} · {postedRange.locationLabel}
              </p>
            </div>
            <a
              href={postedRange.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              Open posting <ArrowSquareOut className="size-3" />
            </a>
          </div>
          <p className="mt-3 border-t border-primary/15 px-3 pt-3 text-[10px] leading-4 text-muted-foreground">
            Direct employer evidence, checked {formatTimestampDate(postedRange.checkedAt)}.
            It is base pay for this role, so it is kept separate from the total-compensation ranking.
          </p>
        </section>
      )}

      <section>
        <p className="text-xs font-semibold text-foreground">Monetary progression</p>
        {progression ? (
          <p className="mt-2">
            {targetLevelLabels[progression.from.level]} → {targetLevelLabels[progression.to.level]}: +{formatEuro(
              progression.deltaEur,
              true
            )} ({progression.percent > 0 ? "+" : ""}{progression.percent}%) in the same location scope.
          </p>
        ) : (
          <p className="mt-2">—</p>
        )}
      </section>

      <section>
        <p className="text-xs font-semibold text-foreground">Career and life signal</p>
        <dl className="mt-2 grid grid-cols-[100px_1fr] gap-y-2 text-xs">
          <dt>Company type</dt>
          <dd className="text-foreground">{company.companyType}</dd>
          <dt>Salary location</dt>
          <dd className="text-foreground">
            {point?.locationLabel ?? postedRange?.locationLabel ?? "—"}
          </dd>
          <dt>Level runway</dt>
          <dd className="text-foreground">
            {progression && progression.decisionGrade
              ? `${progression.from.companyLevel} → ${progression.to.companyLevel}`
              : progression
                ? `${progression.from.companyLevel} → not attributable`
                : "—"}
          </dd>
          <dt>Work-life</dt>
          <dd className={signalTone(opinion.signals.workLife)}>
            {opinion.signals.workLife === "Unknown" ? "—" : opinion.signals.workLife}
          </dd>
          <dt>Opinion</dt>
          <dd className="text-foreground">
            {opinionScore(opinion.score)} · {opinionConfidenceLabel(opinion.confidence)}
          </dd>
        </dl>
        <p className="mt-3 text-xs">{opinion.summary}</p>
      </section>

      <section>
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs font-semibold text-foreground">Salary evidence</p>
          <p className="text-[10px] text-muted-foreground">
            Checked {formatResearchDate(company.lastResearchedAt)}
          </p>
        </div>
        {hasEvidenceConflict ? (
          <div className="mt-3 border-l-2 border-warning bg-warning/[0.06] px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase text-warning">
              Conflicting observations
            </p>
            <p className="mt-1 text-xs leading-5">{evidenceNote}</p>
          </div>
        ) : (
          <p className="mt-2 text-xs">{evidenceNote}</p>
        )}
        {point && <p className="mt-2 text-xs">{readable(point.notes)}</p>}
        <div className="mt-3 flex flex-col items-start gap-2">
          {sources.map((source) => (
            <a
              key={source.id}
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              {source.publisher}: {source.label}
              <ArrowSquareOut className="size-3" />
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function SalaryIntelPage() {
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
  const { scope, sortBy, hideUnknown, setScope, setSortBy, setHideUnknown } =
    useViewPreferences();
  const shortlist = useShortlist();
  const { companies: companyCatalog, postedRanges, trackedCompanies, companyPostedSalary, catalogReady } =
    useCompanyCatalog();
  const marketBenchmarks = useQuery(api.salaryMarketResearch.latestBenchmarks);
  const madridContext = useQuery(api.cityContextResearch.latestMadridContext);
  const cityCostKey = cityCostKeyForLocation(location);
  // Reference costs need a validated bundle for this exact city; personal costs
  // need an entry the user saved for it. Neither is ever substituted.
  const costCityKey = costMode === "reference" ? cityCostKey : null;
  const settings = useQuery(api.settings.get);
  const personalCost = costMode === "personal"
    ? personalCostForLocation(settings?.personalCityCosts, location)
    : null;
  const madridLivingCosts = useQuery(
    api.madridCostResearch.latestCityLivingCosts,
    { cityKey: "madrid-city" },
  );
  const valenciaLivingCosts = useQuery(
    api.madridCostResearch.latestCityLivingCosts,
    { cityKey: "valencia-city" },
  );
  const cityLivingCosts = costCityKey === "madrid-city"
    ? madridLivingCosts
    : costCityKey === "valencia-city"
      ? valenciaLivingCosts
      : undefined;
  const payrollModel = useQuery(api.payrollResearch.activeSpainPayrollModel);
  const marketCheckedAt = marketBenchmarks && marketBenchmarks.length > 0
    ? Math.max(...marketBenchmarks.map((benchmark) => benchmark.checkedAt))
    : null;
  const madridHighSkillSalary = madridContext?.salary.find((item) =>
    item.key.includes(":high_skill_cno_1_3:"),
  );
  const madridAllSalary = madridContext?.salary.find((item) =>
    item.key.includes(":all_occupations:"),
  );
  const madridCheckedAt = madridContext && madridContext.salary.length > 0
    ? Math.max(...madridContext.salary.map((item) => item.checkedAt))
    : null;
  const cityReferenceCostEur = cityLivingCosts?.current === true
    ? cityLivingCosts.monthlyReferenceCostEur
    : null;
  const cityReferenceGapEur =
    madridLivingCosts?.current === true && valenciaLivingCosts?.current === true
      ? Math.round(
          (madridLivingCosts.monthlyReferenceCostEur -
            valenciaLivingCosts.monthlyReferenceCostEur) * 100,
        ) / 100
      : null;
  const trackedBySlug = new Map(trackedCompanies.map((company) => [company.slug, company]));
  const rankedRows: CompanyRow[] = companyCatalog
    .filter((company) => scope === "all" || shortlist.companies.has(company.slug))
    .map((company) => {
      const point = pointForLevel(company, targetLevel, location, payBasis);
      const basePoint = pointForLevel(company, targetLevel, location, "base");
      const postedRange = selectPostedRange({
        ranges: postedRanges,
        companySlug: company.slug,
        targetLevel,
        location,
      });
      const nearbyPosted = postedRange === null
        ? selectAnyPostedRange({
            ranges: postedRanges,
            companySlug: company.slug,
            location,
          })
        : null;
      // Net cash and city-cost figures may only be derived from a salary
      // published for this exact level.
      // Net cash always follows known cash regardless of the display basis, and
      // only from a salary published for this exact level.
      const annualCashEur = targetLevel === "intern"
        ? null
        : knownAnnualCash(basePoint);
      const payrollEstimate = payrollModel?.current === true && annualCashEur !== null
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
        basePoint,
        postedRange,
        nearbyPosted,
        negotiation: analyzeSalaryNegotiation({
          company,
          point,
          companies: companyCatalog,
          postedRange,
        }),
        progression: decisionProgressionFor(company, targetLevel, location),
        equity: equityShare(point),
        opinion: opinionForCompany(company.slug),
        annualCashEur,
        payrollEstimate,
        cityCashAfterReferenceCostsEur,
      };
    })
    .sort((a, b) => {
      if (sortBy === "growth") {
        return compareNullable(a.progression?.percent ?? null, b.progression?.percent ?? null);
      }
      if (sortBy === "net") {
        return compareNullable(
          a.payrollEstimate?.monthlyNetCashEur ?? null,
          b.payrollEstimate?.monthlyNetCashEur ?? null,
        );
      }
      if (sortBy === "equity") return compareNullable(a.equity, b.equity);
      if (sortBy === "opinion") return compareNullable(a.opinion.score, b.opinion.score);
      return compareNullable(rowPaySortValue(a, payBasis), rowPaySortValue(b, payBasis));
    });

  const rows = hideUnknown
    ? rankedRows.filter((row) => rowHasPayEvidence(row))
    : rankedRows;
  const supportedRows = rankedRows.filter((row) => rowHasPayEvidence(row));
  const unknownCount = rankedRows.length - supportedRows.length;
  const topPay = supportedRows
    .slice()
    .sort((a, b) => (rowPaySortValue(b, payBasis) ?? 0) - (rowPaySortValue(a, payBasis) ?? 0))[0] ?? null;
  const topGrowth = rows
    .filter((row) => row.progression !== null && row.progression.decisionGrade)
    .slice()
    .sort((a, b) => (b.progression?.percent ?? 0) - (a.progression?.percent ?? 0))[0] ?? null;
  const decisionHeadline = topPay
    ? topGrowth && topGrowth.company.slug !== topPay.company.slug
      ? `${topPay.company.canonicalName} leads current pay. ${topGrowth.company.canonicalName} leads the next step.`
      : `${topPay.company.canonicalName} leads this view on pay and progression.`
    : "No matching pay at this level yet.";

  return (
    <PageShell width="wide">
      <PageHeader
        title="Salary"
        description="Same level, same location. Employer jobs-page ranges rank first. When a posting has no qualifying range, sourced public salary pages fill that cell and stay labeled."
        action={
          <div className="flex items-center gap-1.5">
            <CompanyIntakeDialog />
            <InfoDialog
            title="Ranking methodology"
            description="What is measured and what is deliberately left unscored."
          >
            <div className="space-y-4">
              <p>
                Companies are ranked on employer-posted base pay from the public
                career page when that posting qualifies. If the jobs page has no
                matching Spain range at this level, a sourced public salary-page
                figure can fill the cell and is labeled as such. Reddit is never used for pay.
              </p>
              <p>
                Pay progression uses two career-page postings at adjacent levels
                in the same location when those exist. Otherwise it uses an audited
                company ladder. Madrid and national figures are never mixed.
              </p>
              <p>
                Employee opinion is an editorial synthesis of linked Reddit accounts,
                separate from salary confidence. Companies stay unscored when the
                available evidence is too sparse or indirect.
              </p>
              <p>
                Market position is an empirical percentile across at least three sourced
                companies at the exact same level and location scope. It is not a population
                percentile. Publisher sample size remains N/A unless the linked source states it.
              </p>
              <p>
                A suggested base ask unlocks only from a current employer-posted annual range
                that matches the exact company, level, and location. The upper half is used as
                a planning zone; incomplete or conflicting ranges remain locked.
              </p>
              <p>
                Estimated net cash uses known base, bonus, and extras; equity is excluded.
                It applies the official 2026 AEAT withholding algorithm and employee Social
                Security rates for a full-year general indefinite employee, personal
                situation 3, no dependants, no disability, and 12 equivalent monthly
                periods. Withholding is not the final annual IRPF result.
              </p>
              <p>
                City cash after reference costs subtracts the full declared mean city rent,
                definitive regional per-person averages for groceries, utilities, and
                connectivity, plus a clearly scoped 2026 public-transport reference. It is
                a solo-renter comparison, not a personal budget, and excludes deposits,
                furniture, health, insurance, and discretionary spending.
              </p>
            </div>
            </InfoDialog>
          </div>
        }
      />

      <MetricStrip
        metrics={[
          {
            label: "Highest pay",
            value: topPay ? rowPayDisplay(topPay, payBasis).primary : "—",
            detail: topPay?.company.canonicalName ?? "—",
          },
          {
            label: "Best jump",
            value: topGrowth?.progression ? `+${topGrowth.progression.percent}%` : "—",
            detail: topGrowth?.progression
              ? `${topGrowth.company.canonicalName} · to ${topGrowth.progression.to.companyLevel}`
              : "—",
          },
          {
            label: "Evidence coverage",
            value: `${supportedRows.length}/${rankedRows.length}`,
            detail: `companies at ${targetLevelLabels[targetLevel]}`,
          },
        ]}
      />

      <p className="mb-6 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        {decisionHeadline}
      </p>

      <section className="border-b border-border pb-5">
        <p className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">
          Target level
        </p>
        <SegmentedControl
          label="Target role level"
          layoutId="salary-target-level"
          value={targetLevel}
          options={LEVEL_OPTIONS}
          onChange={(next) => startTransition(() => setTargetLevel(next))}
        />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">
              Rank by
            </p>
            <SegmentedControl
              label="Pay basis"
              layoutId="salary-pay-basis"
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
              layoutId="salary-cost-mode"
              value={costMode}
              options={COST_MODE_OPTIONS}
              onChange={(next) => startTransition(() => setCostMode(next))}
            />
          </div>
        </div>

        {costMode === "personal" && personalCost === null && (
          <p className="mt-3 text-[10px] leading-4 text-warning">
            No personal costs saved for {location} yet. Add them in Settings → Living
            costs to see cash after your own spending here.
          </p>
        )}
        {costMode === "reference" && cityCostKey === null && (
          <p className="mt-3 text-[10px] leading-4 text-muted-foreground">
            No validated cost bundle for {location} yet. Switch to Personal to use your
            own figures.
          </p>
        )}

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <SegmentedControl
            label="Company scope"
            layoutId="salary-company-scope"
            value={scope}
            options={[
              { value: "all", label: "All companies", count: companyCatalog.length },
              { value: "shortlist", label: "Shortlist", count: shortlist.companies.size },
            ]}
            onChange={(next) => startTransition(() => setScope(next))}
          />
          <div className="inline-flex min-w-0 flex-wrap items-center gap-1.5 rounded-full border border-border bg-muted/60 p-1 sm:ml-auto">
            <DecisionLocationSelect
              value={location}
              onValueChange={(next) => setLocation(next)}
              className="h-8 min-w-0 flex-1 border-0 bg-transparent shadow-none hover:bg-card hover:shadow-sm aria-expanded:bg-card aria-expanded:shadow-sm sm:min-w-[9.5rem] sm:flex-none"
              contentAlign="start"
            />
            <Select value={sortBy} onValueChange={(next) => setSortBy(next as SortKey)}>
              <SelectTrigger className="h-8 min-w-0 flex-1 border-0 bg-transparent shadow-none hover:bg-card hover:shadow-sm aria-expanded:bg-card aria-expanded:shadow-sm sm:min-w-[8.5rem] sm:flex-none" aria-label="Sort companies">
                <span className="truncate text-left">
                  {SORT_OPTIONS.find((option) => option.value === sortBy)?.label}
                </span>
              </SelectTrigger>
              <SelectContent align="end" sideOffset={6}>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant={hideUnknown ? "default" : "outline"}
              size="icon"
              aria-pressed={hideUnknown}
              aria-label={`${hideUnknown ? "Show" : "Hide"} ${unknownCount} companies without sourced ${targetLevelLabels[targetLevel]} salaries`}
              title={`${hideUnknown ? "Show" : "Hide"} unknown companies`}
              onClick={() => setHideUnknown(!hideUnknown)}
              className={`size-8 shrink-0 border-0 shadow-none ${
                hideUnknown
                  ? ""
                  : "bg-transparent hover:bg-card hover:shadow-sm aria-expanded:bg-card"
              }`}
              disabled={unknownCount === 0}
            >
              {hideUnknown ? <Eye className="size-3.5" /> : <EyeClosed className="size-3.5" />}
            </Button>
          </div>
        </div>
      </section>

      <section id="company-ranking" className="scroll-mt-6 py-6">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Company ranking</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {hideUnknown
                ? `Showing companies with pay evidence, sorted by ${SORT_OPTIONS.find((option) => option.value === sortBy)?.label.toLowerCase()}.`
                : `Sorted by ${SORT_OPTIONS.find((option) => option.value === sortBy)?.label.toLowerCase()}; unsupported companies remain visible.`}
              {location === "Remote"
                ? " Remote includes only jobs explicitly posted as remote; Spain-wide ranges appear under Madrid or Valencia."
                : ""}
            </p>
          </div>
          <p className="shrink-0 text-xs tabular text-muted-foreground">{rows.length} companies</p>
        </div>

        {!catalogReady ? (
          <div className="border-y border-foreground/10 py-12 text-center">
            <p className="text-sm font-medium">Loading employer-posted salaries…</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Career-page ranges and monitored companies sync from Convex.
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="border-y border-foreground/10 py-12 text-center">
            <p className="text-sm font-medium">
              {scope === "shortlist" && rankedRows.length === 0
                ? "Your shortlist is empty"
                : hideUnknown
                  ? `No sourced ${targetLevelLabels[targetLevel]} salaries match these filters`
                  : "No companies match these filters"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {scope === "shortlist" && rankedRows.length === 0
                ? "Star companies from the full ranking to keep them here."
                : "Adjust the level, location, or company scope."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto border-y border-foreground/10">
            <table className="w-full min-w-[800px] text-left text-xs">
              <thead className="text-[10px] text-muted-foreground">
                <tr>
                  <th className="sticky left-0 z-10 w-[195px] min-w-[195px] max-w-[195px] bg-background px-3 py-3 font-medium sm:w-auto sm:min-w-[240px] sm:max-w-none">Company</th>
                  <th className="w-[96px] min-w-[96px] px-2 py-3 text-right font-medium sm:w-auto sm:px-3">Base pay</th>
                  <th className="w-[95px] min-w-[95px] px-2 py-3 font-medium sm:w-auto sm:min-w-[122px] sm:px-3">Jump</th>
                  <th className="px-3 py-3 font-medium">Location</th>
                  <th className="min-w-[165px] px-3 py-3 font-medium">Market evidence</th>
                  <th className="px-3 py-3 font-medium">Opinions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/[0.07]">
                {rows.map((row, index) => {
                  const saved = shortlist.companies.has(row.company.slug);
                  const quality = pointResearchQuality(row.company, row.point);
                  const tracked = trackedBySlug.get(row.company.slug);
                  const payDisplay = rowPayDisplay(row, payBasis);
                  return (
                    <tr key={row.company.slug} className="transition-colors hover:bg-foreground/[0.018]">
                      <td className="sticky left-0 z-[1] w-[195px] min-w-[195px] max-w-[195px] bg-background px-3 py-4 sm:w-auto sm:min-w-[240px] sm:max-w-none">
                        <div className="flex items-center gap-3">
                          <span className="w-5 text-[10px] tabular text-muted-foreground">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <div className="min-w-0">
                            <Link
                              href={`/companies/${row.company.slug}`}
                              className="font-semibold text-foreground hover:text-primary hover:underline"
                            >
                              {row.company.canonicalName}
                            </Link>
                            <p className="mt-0.5 text-[10px] text-muted-foreground">
                              {row.point
                                ? `${row.point.levelLabel} · ${row.point.companyLevel}`
                                : payLockReason(
                                    row,
                                    payBasis,
                                    targetLevelLabels[targetLevel],
                                    tracked,
                                  )}
                            </p>
                          </div>
                          <div className="ml-auto flex shrink-0 gap-0.5">
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
                            <InfoDialog
                              title={row.company.canonicalName}
              description={`${targetLevelLabels[targetLevel]} · ${formatEuro(row.point?.totalCompEur ?? null, true)} base`}
                              label={`Open ${row.company.canonicalName} salary details`}
                            >
                              <CompanyDeepDive
                                company={row.company}
                                point={row.point}
                                postedRange={row.postedRange}
                                negotiation={row.negotiation}
                                progression={row.progression}
                                opinion={row.opinion}
                              />
                            </InfoDialog>
                          </div>
                        </div>
                      </td>
                      <td className="w-[96px] min-w-[96px] px-2 py-4 text-right sm:w-auto sm:px-3">
                        <p className="text-sm font-semibold tabular text-foreground">
                          {payDisplay.primary}
                        </p>
                        {payDisplay.secondary && (
                          <p className="mt-0.5 text-[10px] tabular text-muted-foreground">
                            {payDisplay.secondary}
                          </p>
                        )}
                        {row.point && !isPostedSalaryPoint(row.point) && (
                          <p className="mt-1 text-[10px] font-medium text-muted-foreground">
                            Sourced salary page
                          </p>
                        )}
                        {payDisplay.posted && (
                          <p className="mt-1 text-[10px] font-medium text-primary">
                            Posted on jobs page
                          </p>
                        )}
                        {/* A row with no figure on this basis is unranked, so
                            derived cash would invite a comparison the evidence
                            does not support. */}
                        {row.point !== null && row.payrollEstimate && (
                          <p className="mt-1 whitespace-nowrap text-[10px] font-semibold tabular text-primary">
                            ≈{formatEuro(row.payrollEstimate.monthlyNetCashEur, true)} net/mo
                          </p>
                        )}
                        {row.point !== null && row.cityCashAfterReferenceCostsEur !== null && (
                          <p className="mt-0.5 whitespace-nowrap text-[10px] font-medium tabular text-foreground">
                            ≈{formatEuro(row.cityCashAfterReferenceCostsEur, true)} after{" "}
                            {personalCost === null ? location : "your"} costs
                          </p>
                        )}
                      </td>
                      <td className="w-[95px] min-w-[95px] px-2 py-4 sm:w-auto sm:min-w-[122px] sm:px-3">
                        {row.progression && row.progression.decisionGrade ? (
                          <>
                            <p className="font-semibold tabular leading-4 text-foreground">
                              <span className="block sm:inline">+{row.progression.percent}%</span>
                              <span className="hidden sm:inline"> · </span>
                              <span className="block sm:inline">+{formatEuro(row.progression.deltaEur, true)}</span>
                            </p>
                            <p className="mt-0.5 text-[10px] text-muted-foreground">
                              to {row.progression.to.companyLevel}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="font-semibold tabular leading-4 text-muted-foreground">—</p>
                            <p className="mt-0.5 text-[10px] text-muted-foreground">
                              {decisionProgressionLockReason(row.company, targetLevel, location)}
                            </p>
                          </>
                        )}
                      </td>
                      <td className="px-3 py-4 text-muted-foreground">
                        <p>{rowLocationLabel(row)}</p>
                      </td>
                      <td className="px-3 py-4">
                        <span className="inline-flex items-center gap-2 text-foreground">
                          <span className={`size-1.5 rounded-full ${row.point ? confidenceDot(row.point.confidence) : row.postedRange ? "bg-success" : confidenceDot(null)}`} />
                          {row.point
                            ? confidenceLabel(row.point.confidence)
                            : row.postedRange
                              ? "Direct range"
                              : "—"}
                        </span>
                        {row.point && (
                          <p className={`mt-1 text-[10px] ${row.negotiation.marketPercentile === null ? "text-muted-foreground" : "font-semibold text-primary"}`}>
                            {row.negotiation.marketPercentile === null
                              ? `${row.negotiation.comparableCompanyCount} exact-scope ${row.negotiation.comparableCompanyCount === 1 ? "company" : "companies"} · percentile locked`
                              : `P${row.negotiation.marketPercentile} · ${row.negotiation.comparableCompanyCount} ${row.point.locationLabel} companies`}
                          </p>
                        )}
                        <p className={`mt-1 text-[10px] ${freshnessTone(quality.state)}`}>
                          {row.point
                            ? `${quality.state === "fresh" ? "Fresh" : quality.state} · ${formatResearchDate(row.company.lastResearchedAt)} · ${quality.sourceCount} ${quality.sourceCount === 1 ? "source" : "sources"} · sample ${row.negotiation.publisherSampleSize ?? "N/A"}`
                            : row.postedRange
                              ? `Company posting · ${formatTimestampDate(row.postedRange.checkedAt)}`
                            : tracked?.researchStatus === "monitoring"
                              ? "Career monitoring active · salary pending"
                              : "No jobs-page salary"}
                        </p>
                      </td>
                      <td className="px-3 py-4">
                        <OpinionDialog
                          companyName={row.company.canonicalName}
                          opinion={row.opinion}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Info className="size-3" /> Gross annual total compensation; net estimates use known cash only and standard 2026 assumptions. Madrid and Valencia after-cost rows use full city rent plus validated essentials. Missing values are never scored as zero.
        </p>
      </section>

      <details className="border-b border-border py-2">
        <summary className="cursor-pointer py-4 text-sm font-semibold">Supporting evidence</summary>
        <div className="pb-6 space-y-8">
        <section className="py-2" aria-labelledby="posted-salary-title">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-success/10 text-success">
              <ShieldCheck className="size-3.5" />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase text-success">
                Automatic company evidence
              </p>
              <h2 id="posted-salary-title" className="mt-1 text-sm font-semibold">
                Company-stated base pay, kept separate from total compensation
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                Public Greenhouse, Lever, Ashby, SmartRecruiters, Google Careers, Workday, Amazon Jobs, Microsoft Careers, Apple Jobs, and Netflix Jobs feeds are the first pay source.
                Only ranges with a Spain or remote-EU scope, EUR currency, annual-magnitude salary wording,
                IC role, and level are released. When no such posting exists, sourced public salary pages can fill the ranking cell and stay labeled. Reddit is not used for pay.
              </p>
            </div>
          </div>

          <div className="grid min-w-[250px] grid-cols-2 border-y border-foreground/10 text-right">
            <div className="py-3 pr-4">
              <p className="text-[10px] text-muted-foreground">Relevant roles checked</p>
              <p className="mt-1 text-lg font-semibold tabular">
                {companyPostedSalary?.checkedRoles ?? "—"}
              </p>
            </div>
            <div className="border-l border-foreground/10 py-3 pl-4">
              <p className="text-[10px] text-muted-foreground">Safe Spain ranges</p>
              <p className="mt-1 text-lg font-semibold tabular text-success">
                {companyPostedSalary?.acceptedRanges ?? "—"}
              </p>
            </div>
          </div>
        </div>

        {companyPostedSalary === undefined ? (
          <p className="mt-4 border-t border-foreground/10 pt-4 text-xs text-muted-foreground">
            Checking current company-posted salary evidence…
          </p>
        ) : companyPostedSalary.ranges.length === 0 ? (
          <div className="mt-4 flex flex-col gap-1 border-t border-foreground/10 pt-4 text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <p className="font-semibold text-foreground">
              No current posting safely discloses a Spain salary range.
            </p>
            <p className="text-[10px] leading-4 text-muted-foreground sm:max-w-xl sm:text-right">
              {companyPostedSalary.quarantinedCandidates} salary-like {companyPostedSalary.quarantinedCandidates === 1 ? "statement" : "statements"} quarantined
              {(companyPostedSalary.quarantineReasons?.length ?? 0) > 0
                ? ` · ${quarantineReasonSummary(companyPostedSalary.quarantineReasons ?? [])}`
                : ""}
              {companyPostedSalary.lastCheckedAt
                ? ` · checked ${formatTimestampDate(companyPostedSalary.lastCheckedAt)}`
                : ""}.
            </p>
          </div>
        ) : (
          <div className="mt-4 divide-y divide-foreground/[0.07] border-y border-foreground/10">
            {postedRanges.slice(0, 6).map((range) => (
              <div
                key={`${range.companySlug}:${range.title}:${range.locationLabel}`}
                className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-5"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-foreground">
                    {range.company} · {range.title}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {POSTED_LEVEL_LABELS[range.level]} · {range.locationLabel} · checked {formatTimestampDate(range.checkedAt)}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-4 sm:justify-end">
                  <p className="text-sm font-semibold tabular text-foreground">
                    {formatPostedRange(range)}
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {` / ${postedPeriodLabel(range.period)}`}
                    </span>
                  </p>
                  <a
                    href={range.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open ${range.company} posting`}
                    className="text-primary hover:text-primary/75"
                  >
                    <ArrowSquareOut className="size-3.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="mt-3 text-[10px] text-muted-foreground">
            {postedRanges.length > 0
              ? `Current posted base pay is the ranking figure for the ${postedRanges.length === 1 ? "role" : "roles"} shown above. It does not imply bonus, equity, or a personal offer.`
              : "No current public posting qualifies at this view. Ranking cells can still show sourced public salary-page figures, labeled separately from jobs-page ranges."}
        </p>
      </section>

      <section className="border-b border-foreground/10 py-5" aria-labelledby="market-anchor-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              <Bank className="size-3.5" />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase text-primary">Official decision context</p>
              <h2 id="market-anchor-title" className="mt-1 text-sm font-semibold">
                Salary anchors and selected-city costs, kept separate from company pay
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                Official statistics and current public fares help frame the choice. They are
                not software levels, offers, personal spending, or live asking rents.
              </p>
            </div>
          </div>
          <div className="shrink-0 text-right text-[10px] leading-4 text-muted-foreground">
            <p>
              {marketCheckedAt
                ? `Salary checked ${formatTimestampDate(marketCheckedAt)} · every 12 hours`
                : "Salary check every 12 hours"}
            </p>
            {location === "Madrid" && (
              <p>
                {madridCheckedAt
                  ? `Madrid salary checked ${formatTimestampDate(madridCheckedAt)} · every 24 hours`
                  : "Madrid salary check every 24 hours"}
              </p>
            )}
            <p>
              {costCityKey === null
                ? "Choose Madrid or Valencia for city-cost validation"
                : cityLivingCosts?.current
                  ? `${location} costs checked ${formatTimestampDate(cityLivingCosts.checkedAt)} · every 24 hours`
                  : cityLivingCosts === undefined
                    ? `Loading ${location} cost validation`
                    : `${location} cost reference locked`}
            </p>
            <p>
              {payrollModel?.current
                ? `Payroll validated ${formatTimestampDate(payrollModel.validatedAt)} · every 24 hours`
                : "Payroll estimates locked pending validation"}
            </p>
          </div>
        </div>

        {marketBenchmarks === undefined ? (
          <p className="mt-4 border-y border-foreground/10 py-4 text-xs text-muted-foreground">
            Loading the official market benchmark…
          </p>
        ) : marketBenchmarks.length === 0 ? (
          <p className="mt-4 border-y border-foreground/10 py-4 text-xs text-muted-foreground">
            The first automatic Eurostat benchmark sync is pending.
          </p>
        ) : (
          <div className="mt-4 grid border-y border-foreground/10 sm:grid-cols-2">
            {marketBenchmarks.map((benchmark, index) => (
              <div
                key={benchmark.key}
                className={
                  index === 0
                    ? "py-4 sm:pr-6"
                    : "border-t border-foreground/10 py-4 sm:border-l sm:border-t-0 sm:pl-6"
                }
              >
                <p className="text-[10px] text-muted-foreground">{benchmark.label}</p>
                <p className="mt-1 text-xl font-semibold tabular">
                  {formatEuro(benchmark.amount, true)}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Mean gross / year · {benchmark.referenceYear} reference · dataset revised{" "}
                  {formatTimestampDate(benchmark.sourceUpdatedAt)}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-col gap-1 text-[10px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>Professional earnings benchmark · mean gross / year · broad occupation group.</p>
          {marketBenchmarks && marketBenchmarks.length > 0 && (
            <a
              href={marketBenchmarks[0].datasetUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1 font-semibold text-primary hover:underline"
            >
              Eurostat dataset <ArrowSquareOut className="size-3" />
            </a>
          )}
        </div>

        {location === "Madrid" && (
          <div className="mt-5 border-t border-foreground/10 pt-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase text-muted-foreground">
                  Madrid salary reference
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Final official earnings context, separate from company compensation.
                </p>
              </div>
              {madridAllSalary && (
                <p className="text-[10px] text-muted-foreground">
                  Region all occupations: {formatEuro(madridAllSalary.amount, true)} / year
                </p>
              )}
            </div>
            {madridContext === undefined ? (
              <p className="mt-4 border-y border-foreground/10 py-4 text-xs text-muted-foreground">
                Loading Madrid salary context…
              </p>
            ) : !madridHighSkillSalary || !madridAllSalary ? (
              <p className="mt-4 border-y border-foreground/10 py-4 text-xs text-muted-foreground">
                The first automatic Madrid salary sync is pending.
              </p>
            ) : (
              <div className="mt-4 grid border-y border-foreground/10 sm:grid-cols-2">
                {[madridHighSkillSalary, madridAllSalary].map((salary, index) => (
                  <div
                    key={salary.key}
                    className={index === 0 ? "py-4 sm:pr-5" : "border-t border-foreground/10 py-4 sm:border-l sm:border-t-0 sm:pl-5"}
                  >
                    <p className="text-[10px] text-muted-foreground">
                      {index === 0 ? "High-skilled gross salary" : "All-occupation gross salary"}
                    </p>
                    <p className="mt-1 text-xl font-semibold tabular">
                      {formatEuro(salary.amount, true)}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Mean / year · final {salary.referenceYear}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-5 border-t border-foreground/10 pt-5">
          {costCityKey === null ? (
            <div className="border-y border-foreground/10 py-4">
              <p className="text-xs font-semibold">City cost comparison is ready when needed</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Select Madrid or Valencia to add declared rent and recurring essentials without entering another field.
              </p>
            </div>
          ) : cityLivingCosts === undefined ? (
            <p className="border-y border-foreground/10 py-4 text-xs text-muted-foreground">
              Loading the {location} living-cost reference…
            </p>
          ) : cityLivingCosts === null || !cityLivingCosts.current || cityReferenceCostEur === null ? (
            <div className="border-y border-warning/30 bg-warning/[0.035] py-4">
              <p className="text-[10px] font-bold uppercase text-warning">
                {location} cost reference locked
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {cityLivingCosts?.readinessNote ??
                  "A required official source is missing, stale, or failed validation. No after-cost estimate is shown until rent, household costs, and transport pass again."}
              </p>
            </div>
          ) : (
            <div className="border-y border-foreground/10">
              <div className="flex flex-col gap-2 py-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase text-primary">
                    {cityLivingCosts.cityLabel} solo-renter reference
                  </p>
                  <p className="mt-1 text-xl font-semibold tabular">
                    {formatEuro(cityReferenceCostEur)}
                    <span className="text-xs font-semibold"> / month</span>
                  </p>
                </div>
                <p className="max-w-xl text-[10px] leading-4 text-muted-foreground sm:text-right">
                  Full-city mean declared rent plus regional per-person essentials. Comparison
                  reference only; not a personal budget or a live asking-price basket.
                </p>
              </div>
              <div className="grid border-t border-foreground/10 sm:grid-cols-3">
                <div className="py-3 sm:pr-4">
                  <p className="text-[10px] text-muted-foreground">Declared city rent</p>
                  <p className="mt-1 text-sm font-semibold tabular">
                    {formatEuro(cityLivingCosts.monthlyRentEur)} / mo
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    Mean · {cityLivingCosts.rentSampleSize.toLocaleString("en-GB")} homes · {cityLivingCosts.housingReferenceYear}
                  </p>
                </div>
                <div className="border-t border-foreground/10 py-3 sm:border-l sm:border-t-0 sm:px-4">
                  <p className="text-[10px] text-muted-foreground">Rent / area</p>
                  <p className="mt-1 text-sm font-semibold tabular">
                    {cityLivingCosts.rentPerSquareMeterEur.toLocaleString("en-GB", { maximumFractionDigits: 1 })} € / m² / mo
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">Same AEAT declared-rent sample</p>
                </div>
                <div className="border-t border-foreground/10 py-3 sm:border-l sm:border-t-0 sm:pl-4">
                  <p className="text-[10px] text-muted-foreground">Recurring essentials</p>
                  <p className="mt-1 text-sm font-semibold tabular">
                    {formatEuro(cityLivingCosts.monthlyEssentialsEur)} / mo
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    Household survey {cityLivingCosts.householdBudgetReferenceYear} + transit {cityLivingCosts.transportReferenceYear}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 border-t border-foreground/10 sm:grid-cols-4">
                {cityLivingCosts.items.map((item, index) => (
                  <div
                    key={item.key}
                    className={`py-3 ${index >= 2 ? "border-t" : ""} ${index % 2 === 1 ? "border-l pl-4" : ""} border-foreground/10 sm:border-l sm:border-t-0 sm:px-4 sm:first:border-l-0 sm:first:pl-0 sm:last:pr-0`}
                  >
                    <p className="text-[10px] text-muted-foreground">{item.label}</p>
                    <p className="mt-1 text-sm font-semibold tabular">
                      {formatEuro(item.monthlyAmount)}
                      <span className="text-[10px] font-medium text-muted-foreground"> / mo</span>
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {item.category === "transport" ? "Official scoped fare" : "Mean / person"} · {item.referenceYear}
                    </p>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-1 border-t border-foreground/10 py-3 text-[10px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <p>
                  {cityReferenceGapEur !== null && cityReferenceGapEur > 0
                    ? `Same method: Valencia is ${formatEuro(cityReferenceGapEur)}/mo lower than Madrid. `
                    : ""}
                  AEAT rent is annual declared rent, not current listing inventory.
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  <a href={cityLivingCosts.sourceUrls.rent} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                    AEAT rent <ArrowSquareOut className="size-3" />
                  </a>
                  <a href={cityLivingCosts.sourceUrls.ine} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                    INE household budget <ArrowSquareOut className="size-3" />
                  </a>
                  <a href={cityLivingCosts.sourceUrls.transport} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                    {location === "Madrid" ? "CRTM fare" : "EMT fare"} <ArrowSquareOut className="size-3" />
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
        </div>
      </details>

    </PageShell>
  );
}
