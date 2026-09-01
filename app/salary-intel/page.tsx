"use client";

import Link from "next/link";
import { startTransition } from "react";
import { useQuery } from "convex/react";
import {
  ArrowSquareOut,
  Bank,
  ChatCircle,
  Info,
  ShieldCheck,
  Star,
} from "@/components/eq/icon";

import { InfoDialog, PageHeader, PageShell } from "@/components/eq/page-shell";
import { CompanyIntakeDialog } from "@/components/eq/company-intake";
import { SegmentedControl } from "@/components/eq/segmented-control";
import { useCompanyCatalog } from "@/components/eq/use-company-catalog";
import { useSalaryDecisionContext } from "@/components/eq/use-salary-decision-context";
import { useShortlist } from "@/components/eq/use-shortlist";
import { useViewPreferences } from "@/components/eq/use-view-preferences";
import { PodiumBand, type BandStat } from "@/components/eq/podium-band";
import { euroOrDash, formatIsoDay, plural, signedEuro, signedPercent } from "@/lib/format";
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
  postedLocationMatches,
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

/** Names shown before the block asks to be expanded. */
const PENDING_PREVIEW = 12;

const COST_MODE_OPTIONS: { value: CostMode; label: string }[] = [
  { value: "off", label: "No costs" },
  { value: "reference", label: "Reference" },
  { value: "personal", label: "My costs" },
];

/**
 * What the ranking figure is called, given the active basis. The header,
 * subtitle, sort label and footnote all read this: they were four separate
 * hardcoded strings saying "Base pay" and "total compensation", so half of
 * them lied whenever the Rank by control was switched.
 */
function payBasisLabel(basis: PayBasis): string {
  return basis === "base" ? "Base pay" : "Total pay";
}

function sortOptions(basis: PayBasis): { value: SortKey; label: string }[] {
  return SORT_OPTIONS.map((option) =>
    option.value === "pay" ? { ...option, label: payBasisLabel(basis) } : option,
  );
}

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
 * The number the ranking is currently ordered by. The podium reads this, so
 * changing what the page is ranked on reorders it — the whole point of showing
 * a podium instead of asserting a winner.
 */
function rowSortValue(row: CompanyRow, sortBy: SortKey, basis: PayBasis): number | null {
  if (sortBy === "growth") {
    return row.progression !== null && row.progression.decisionGrade
      ? row.progression.percent
      : null;
  }
  if (sortBy === "net") return row.payrollEstimate?.monthlyNetCashEur ?? null;
  if (sortBy === "equity") return row.equity;
  if (sortBy === "opinion") return row.opinion.score;
  return rowPaySortValue(row, basis);
}

/** That same number, as the podium shows it. */
function formatSortValue(value: number | null, sortBy: SortKey): string {
  if (value === null) return "—";
  if (sortBy === "growth") return signedPercent(value);
  if (sortBy === "net") return `≈${formatEuro(value, true)}`;
  if (sortBy === "opinion") return `${value} / 5`;
  return formatEuro(value, true);
}

/**
 * How far behind the leader, in that measure's own units. Kept terse: it sits
 * at the right edge of a slim row, not in a sentence.
 */
function formatSortGap(gap: number, sortBy: SortKey): string {
  if (sortBy === "growth") return `−${gap} pp`;
  if (sortBy === "opinion") return `−${Math.round(gap * 10) / 10}`;
  return `−${formatEuro(gap, true)}`;
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
  // The evidence list below is scoped to the view the user is actually
  // looking at. It used to show six arbitrary ranges from any level and any
  // city while claiming they were "the ranking figure for the roles shown".
  const scopedPostedRanges = postedRanges.filter(
    (range) => range.level === targetLevel && postedLocationMatches(range, location),
  );
  const visiblePostedRanges = scopedPostedRanges.slice(0, 8);
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
  const madridHighSkillSalary = madridContext?.salary.find((item) =>
    item.key.includes(":high_skill_cno_1_3:"),
  );
  const madridAllSalary = madridContext?.salary.find((item) =>
    item.key.includes(":all_occupations:"),
  );
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

  // The table ranks; it no longer carries the companies there is nothing to
  // rank. At this level and location nineteen of twenty rows were six columns
  // of "—", which is a fact about coverage, not a ranking, and it now gets
  // stated once below instead of repeated nineteen times.
  const rows = rankedRows.filter((row) => rowHasPayEvidence(row));
  const supportedRows = rankedRows.filter((row) => rowHasPayEvidence(row));
  const pendingRows = rankedRows.filter((row) => !rowHasPayEvidence(row));
  /**
   * Companies with a figure at this level and location that the scope filter
   * is holding back. The table looking near-empty is usually the shortlist
   * doing its job, and the page never said so — "why is there only Amazon?"
   * has a real answer and it should be on screen.
   */
  const hiddenByScopeCount =
    scope === "shortlist"
      ? companyCatalog.filter(
          (company) =>
            !shortlist.companies.has(company.slug) &&
            pointForLevel(company, targetLevel, location, payBasis) !== null,
        ).length
      : 0;
  const pendingMonitoredCount = pendingRows.filter(
    (row) => trackedBySlug.get(row.company.slug)?.researchStatus === "monitoring",
  ).length;

  /**
   * The podium: the top of the ranking as the controls currently define it.
   * `rows` is already sorted by the active sort, so this follows it — change
   * the level, the location or what it is ranked on and the podium reorders,
   * which is what makes the choice of company visible rather than asserted.
   */
  const podiumRows = rows
    .filter((row) => rowSortValue(row, sortBy, payBasis) !== null)
    .slice(0, 3);
  const podiumLeadValue =
    podiumRows.length > 0 ? rowSortValue(podiumRows[0], sortBy, payBasis) : null;
  const podium = podiumRows.map((row, index) => {
    const value = rowSortValue(row, sortBy, payBasis);
    return {
      slug: row.company.slug,
      name: row.company.canonicalName,
      value: formatSortValue(value, sortBy),
      detail:
        index === 0
          ? `${sortOptions(payBasis).find((option) => option.value === sortBy)?.label.toLowerCase()}${
              row.point ? ` · ${row.point.companyLevel} · ${rowLocationLabel(row)}` : ""
            }`
          : value !== null && podiumLeadValue !== null
            ? formatSortGap(podiumLeadValue - value, sortBy)
            : undefined,
    };
  });
  const leaderRow = podiumRows[0] ?? null;

  // Whichever of base/total is not already the headline figure.
  const counterpartPay =
    payBasis === "total"
      ? { label: "Base", value: formatEuro(leaderRow?.point?.baseEur ?? null, true) }
      : { label: "Total pay", value: formatEuro(leaderRow?.point?.totalCompEur ?? null, true) };

  const afterCostsLabel =
    costMode === "personal" ? "After your costs" : `After ${location} costs`;

  const briefStats: BandStat[] = [
    counterpartPay,
    {
      label: "Take-home",
      value:
        leaderRow?.payrollEstimate === null || leaderRow?.payrollEstimate === undefined
          ? "—"
          : `≈${formatEuro(leaderRow.payrollEstimate.monthlyNetCashEur, true)}`,
      suffix: leaderRow?.payrollEstimate ? "/mo" : undefined,
    },
    // Only when living costs are actually on: a permanently blank column is
    // not a stat, it is furniture.
    ...(costMode === "off"
      ? []
      : [
          {
            label: afterCostsLabel,
            value:
              leaderRow?.cityCashAfterReferenceCostsEur == null
                ? "—"
                : `≈${euroOrDash(leaderRow.cityCashAfterReferenceCostsEur)}`,
            suffix: leaderRow?.cityCashAfterReferenceCostsEur == null ? undefined : "/mo",
          },
        ]),
    {
      label: "Next step",
      value: leaderRow?.progression ? signedPercent(leaderRow.progression.percent) : "—",
      suffix: leaderRow?.progression ? ` · ${signedEuro(leaderRow.progression.deltaEur)}` : undefined,
    },
    {
      label: "Coverage",
      value: String(supportedRows.length),
      suffix: ` of ${rankedRows.length}`,
    },
    {
      label: "Checked",
      value: leaderRow ? formatIsoDay(leaderRow.company.lastResearchedAt) : "—",
    },
  ];

  return (
    <PageShell width="wide">
      <PageHeader
        title="Salary"
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

      <PodiumBand
        eyebrow={`${targetLevelLabels[targetLevel]} · ${location} · ${
          scope === "shortlist" ? `your ${rankedRows.length} favourites` : plural(rankedRows.length, "company", "companies")
        }`}
        rankedOn={`Ranked on ${sortOptions(payBasis).find((option) => option.value === sortBy)?.label.toLowerCase()}`}
        podium={podium}
        emptyMessage={
          scope === "shortlist" && rankedRows.length === 0
            ? "You have no favourites yet. Star companies from the full ranking to build the list."
            : `No company here has published a salary at ${targetLevelLabels[targetLevel]} in ${location}.`
        }
        statsLabel={leaderRow ? `${leaderRow.company.canonicalName}, in full` : ""}
        stats={leaderRow ? briefStats : []}
      />

      {/* One bar. This was four label-and-pill blocks stacked down the page,
          which pushed the ranking below the fold before anything was chosen.
          The pill labels now stand alone, so the headings are gone with it. */}
      {/* Two groups, space-between rather than a margin-auto on the right one.
          Below ~1080px there is genuinely not room for five controls on one
          line, and `ml-auto` pushed the wrapped group to the right of its own
          line, stranding it mid-air; justify-between leaves a single-item line
          at flex-start, so a wrap reads as a second row rather than a mistake. */}
      <section className="mb-7 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-card p-3 shadow-[0_0_0_1px_rgb(26_25_23_/_5.5%)]">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
        <SegmentedControl
          label="Target role level"
          layoutId="salary-target-level"
          value={targetLevel}
          options={LEVEL_OPTIONS}
          onChange={(next) => startTransition(() => setTargetLevel(next))}
        />
        <span aria-hidden className="hidden h-5 w-px bg-border sm:block" />
        <SegmentedControl
          label="Pay basis"
          layoutId="salary-pay-basis"
          value={payBasis}
          options={PAY_BASIS_OPTIONS}
          onChange={(next) => startTransition(() => setPayBasis(next))}
        />
        <span aria-hidden className="hidden h-5 w-px bg-border sm:block" />
        <SegmentedControl
          label="Living cost basis"
          layoutId="salary-cost-mode"
          value={costMode}
          options={COST_MODE_OPTIONS}
          onChange={(next) => startTransition(() => setCostMode(next))}
        />
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <SegmentedControl
            label="Company scope"
            layoutId="salary-company-scope"
            value={scope}
            options={[
              { value: "all", label: "All", count: companyCatalog.length },
              { value: "shortlist", label: "Favourites", count: shortlist.companies.size },
            ]}
            onChange={(next) => startTransition(() => setScope(next))}
          />
          {/* Pills, not bordered boxes: three heavy select frames beside the
              segmented groups made the right half of the bar read as a
              different control family. */}
          <DecisionLocationSelect
            value={location}
            onValueChange={(next) => setLocation(next)}
            className="h-8 min-w-0 rounded-full border-0 bg-secondary shadow-none hover:bg-muted sm:min-w-[9rem]"
            contentAlign="end"
          />
        </div>

        {costMode === "personal" && personalCost === null && (
          <p className="w-full text-[11px] leading-4 text-warning">
            No personal costs saved for {location} yet. Add them in Settings → Living costs
            to see cash after your own spending here.
          </p>
        )}
        {costMode === "reference" && cityCostKey === null && (
          <p className="w-full text-[11px] leading-4 text-muted-foreground">
            No validated cost bundle for {location} yet. Switch to My costs to use your own
            figures.
          </p>
        )}
      </section>

      <section id="company-ranking" className="scroll-mt-6 py-6">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="text-sm font-semibold">Ranked on</h2>
            <Select value={sortBy} onValueChange={(next) => setSortBy(next as SortKey)}>
              <SelectTrigger
                className="h-7 min-w-0 rounded-full border-0 bg-secondary px-3 text-xs font-semibold shadow-none hover:bg-muted"
                aria-label="Sort companies"
              >
                <span className="truncate text-left">
                  {sortOptions(payBasis).find((option) => option.value === sortBy)?.label.toLowerCase()}
                </span>
              </SelectTrigger>
              <SelectContent align="start" sideOffset={6}>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {location === "Remote" && (
              <p className="mt-1 text-xs text-muted-foreground">
                Remote includes only jobs explicitly posted as remote; Spain-wide ranges
                appear under Madrid or Valencia.
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {hiddenByScopeCount > 0 && (
              <button
                type="button"
                onClick={() => startTransition(() => setScope("all"))}
                className="text-xs font-medium text-eq-accent hover:underline"
              >
                {plural(hiddenByScopeCount, "more company", "more companies")} outside your
                shortlist
              </button>
            )}
            <p className="text-xs tabular text-muted-foreground">
              {plural(rows.length, "company", "companies")} with a figure
            </p>
          </div>
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
                ? "No favourites yet"
                : `Nothing published at ${targetLevelLabels[targetLevel]} in ${location}`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {scope === "shortlist" && rankedRows.length === 0
                ? "Star companies from the full ranking to keep them here."
                : "Try another level or location — the companies you are watching are listed below."}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-card shadow-[0_0_0_1px_rgb(26_25_23_/_5.5%)]">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-xs">
              <thead>
                <tr className="border-b border-foreground/[0.07] bg-foreground/[0.014]">
                  <th className="sticky left-0 z-10 w-[290px] min-w-[290px] bg-card py-3 pl-4 pr-3 text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted-foreground">Company</th>
                  <th className="min-w-[124px] px-4 py-3 text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted-foreground">{payBasisLabel(payBasis)}</th>
                  <th className="min-w-[136px] px-4 py-3 text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted-foreground">You keep</th>
                  <th className="min-w-[132px] px-4 py-3 text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted-foreground">Next step</th>
                  <th className="min-w-[190px] px-4 py-3 text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted-foreground">Evidence</th>
                  <th className="px-4 py-3 text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted-foreground">Opinions</th>
                  <th className="py-3 pl-2 pr-[22px]"><span className="sr-only">Details</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/[0.06]">
                {rows.map((row, index) => {
                  const saved = shortlist.companies.has(row.company.slug);
                  const quality = pointResearchQuality(row.company, row.point);
                  const tracked = trackedBySlug.get(row.company.slug);
                  const payDisplay = rowPayDisplay(row, payBasis);
                  return (
                    <tr key={row.company.slug} className="transition-colors hover:bg-foreground/[0.014]">
                      <td className="sticky left-0 z-[1] w-[290px] min-w-[290px] bg-card py-5 pl-4 pr-3 align-top">
                        <div className="flex items-start gap-2.5">
                          {/* The star opens the row: it is the one control that
                              says something about YOU rather than the company,
                              so it reads before the name rather than trailing
                              it beside an unrelated details button. */}
                          <button
                            type="button"
                            aria-pressed={saved}
                            aria-label={saved ? `Remove ${row.company.canonicalName} from favourites` : `Add ${row.company.canonicalName} to favourites`}
                            title={saved ? "Remove from favourites" : "Add to favourites"}
                            onClick={() => shortlist.toggle(row.company.slug)}
                            className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                              saved
                                ? "text-eq-accent"
                                : "text-foreground/25 hover:bg-foreground/[0.05] hover:text-foreground/60"
                            }`}
                          >
                            <Star className="size-[15px]" weight={saved ? "fill" : "regular"} />
                          </button>
                          <span className="mt-1 w-5 shrink-0 text-[11px] tabular text-muted-foreground">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <div className="min-w-0">
                            <Link
                              href={`/companies/${row.company.slug}`}
                              className="block truncate text-[14.5px] font-semibold tracking-[-0.012em] text-foreground hover:text-primary hover:underline"
                            >
                              {row.company.canonicalName}
                            </Link>
                            {/* Location folds in here: it was a column of its
                                own repeating one value per row. */}
                            <p className="mt-1 line-clamp-2 text-[11.5px] leading-4 text-muted-foreground">
                              {row.point
                                ? `${row.point.companyLevel} · ${rowLocationLabel(row)}`
                                : payLockReason(
                                    row,
                                    payBasis,
                                    targetLevelLabels[targetLevel],
                                    tracked,
                                  )}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-5 align-top">
                        <p className="text-[19px] font-semibold leading-none tracking-[-0.02em] tabular text-foreground">
                          {payDisplay.primary}
                        </p>
                        {payDisplay.secondary && (
                          <p className="mt-1.5 text-[11.5px] tabular text-muted-foreground">
                            {payDisplay.secondary}
                          </p>
                        )}
                        {payDisplay.posted ? (
                          <p className="mt-1 text-[11px] font-medium text-primary">Posted on jobs page</p>
                        ) : row.point ? (
                          <p className="mt-1 text-[11px] text-muted-foreground">Sourced salary page</p>
                        ) : null}
                      </td>

                      {/* Take-home used to be two more lines crammed into the
                          pay cell, under the band, the source tag and the base
                          figure. It is a different question, so it is a column. */}
                      <td className="px-4 py-5 align-top">
                        {row.point !== null && row.payrollEstimate ? (
                          <>
                            <p className="text-sm font-semibold tabular text-foreground">
                              ≈{formatEuro(row.payrollEstimate.monthlyNetCashEur, true)}
                              <span className="text-[11px] font-normal text-muted-foreground"> / mo</span>
                            </p>
                            {row.cityCashAfterReferenceCostsEur !== null ? (
                              <p
                                className={`mt-1 text-[11.5px] leading-4 tabular ${
                                  row.cityCashAfterReferenceCostsEur < 0
                                    ? "text-destructive"
                                    : "text-muted-foreground"
                                }`}
                              >
                                {row.cityCashAfterReferenceCostsEur < 0
                                  ? `${euroOrDash(row.cityCashAfterReferenceCostsEur)} short of ${personalCost === null ? location : "your"} costs`
                                  : `≈${euroOrDash(row.cityCashAfterReferenceCostsEur)} after ${personalCost === null ? location : "your"} costs`}
                              </p>
                            ) : (
                              <p className="mt-1 text-[11.5px] leading-4 text-muted-foreground">
                                before living costs
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="text-sm font-semibold tabular text-muted-foreground">—</p>
                        )}
                      </td>

                      <td className="px-4 py-5 align-top">
                        {row.progression && row.progression.decisionGrade ? (
                          <>
                            <p className="text-sm font-semibold tabular text-foreground">
                              {signedPercent(row.progression.percent)}
                              <span className="text-[11.5px] font-normal text-muted-foreground">
                                {" · "}
                                {signedEuro(row.progression.deltaEur)}
                              </span>
                            </p>
                            <p className="mt-1 text-[11.5px] leading-4 text-muted-foreground">
                              to {row.progression.to.companyLevel}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-sm font-semibold tabular text-muted-foreground">—</p>
                            <p className="mt-1 text-[11.5px] leading-4 text-muted-foreground">
                              {decisionProgressionLockReason(row.company, targetLevel, location)}
                            </p>
                          </>
                        )}
                      </td>

                      <td className="px-4 py-5 align-top">
                        <span className="inline-flex items-center gap-2 text-[13px] font-medium text-foreground">
                          <span className={`size-[7px] rounded-full ${row.point ? confidenceDot(row.point.confidence) : confidenceDot(null)}`} />
                          {row.point
                            ? confidenceLabel(row.point.confidence)
                            : row.postedRange
                              ? "Not on this basis"
                              : "—"}
                        </span>
                        {row.point && (
                          <p className={`mt-1.5 text-[11.5px] leading-4 ${row.negotiation.marketPercentile === null ? "text-muted-foreground" : "font-medium text-primary"}`}>
                            {row.negotiation.marketPercentile === null
                              ? `${row.negotiation.comparableCompanyCount} exact-scope ${row.negotiation.comparableCompanyCount === 1 ? "company" : "companies"} · percentile locked`
                              : `P${row.negotiation.marketPercentile} · ${row.negotiation.comparableCompanyCount} ${row.point.locationLabel} companies`}
                          </p>
                        )}
                        <p className={`mt-1 text-[11.5px] leading-4 ${freshnessTone(quality.state)}`}>
                          {row.point
                            ? `${quality.state === "fresh" ? "Fresh" : quality.state} · ${formatResearchDate(row.company.lastResearchedAt)} · ${quality.sourceCount} ${quality.sourceCount === 1 ? "source" : "sources"}`
                            : row.postedRange
                              ? `Company posting · ${formatTimestampDate(row.postedRange.checkedAt)}`
                            : tracked?.researchStatus === "monitoring"
                              ? "Career monitoring active · salary pending"
                              : "No jobs-page salary"}
                        </p>
                      </td>

                      <td className="px-4 py-5 align-top">
                        <OpinionDialog
                          companyName={row.company.canonicalName}
                          opinion={row.opinion}
                        />
                      </td>

                      {/* Details closes the row, where a "read more" belongs —
                          it used to sit beside the star, two unrelated actions
                          sharing one corner. */}
                      <td className="py-5 pl-2 pr-[22px] align-top text-right">
                        <InfoDialog
                          title={row.company.canonicalName}
                          description={`${targetLevelLabels[targetLevel]} · ${formatEuro(payAmountFor(row.point, payBasis), true)} ${payBasisLabel(payBasis).toLowerCase()}`}
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}

        <p className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Info className="size-3" /> Gross annual {payBasis === "base" ? "base pay" : "total compensation"}; net estimates use known cash only and standard 2026 assumptions. Madrid and Valencia after-cost rows use full city rent plus validated essentials. Missing values are never scored as zero.
        </p>
      </section>

      {/* The review list: everything tracked that has no published figure yet,
          which is where a company you submit lands. It is derived rather than
          stored, so a company leaves it the moment research publishes
          something — nothing to keep in sync, and nothing to prune.

          They used to be rows in the table above, six columns of "—" each;
          here they are one block that says how many, why, and who — in a
          fraction of the height, and still reachable. */}
      {catalogReady && pendingRows.length > 0 && (
        <section className="pb-8">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">Review list</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Tracked, still being researched. Nothing here is a favourite
                until you star it.
              </p>
            </div>
            <p className="text-xs tabular text-muted-foreground">
              {plural(pendingRows.length, "company", "companies")} ·{" "}
              {pendingMonitoredCount} with a live feed · {pendingRows.length - pendingMonitoredCount}{" "}
              with none
            </p>
          </div>

          <div className="rounded-2xl bg-secondary px-5 py-5">
            <ul className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {(hideUnknown ? pendingRows.slice(0, PENDING_PREVIEW) : pendingRows).map((row) => {
                const monitored =
                  trackedBySlug.get(row.company.slug)?.researchStatus === "monitoring";
                return (
                  <li key={row.company.slug} className="flex min-w-0 items-center gap-2.5">
                    <span
                      aria-hidden
                      className={`size-[5px] shrink-0 rounded-full ${
                        monitored ? "bg-eq-accent" : "bg-foreground/20"
                      }`}
                    />
                    <Link
                      href={`/companies/${row.company.slug}`}
                      className={`truncate text-[13px] hover:underline ${
                        monitored ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {row.company.canonicalName}
                    </Link>
                  </li>
                );
              })}
            </ul>

            {pendingRows.length > PENDING_PREVIEW && (
              <button
                type="button"
                onClick={() => setHideUnknown(!hideUnknown)}
                className="mt-4 text-xs font-medium text-eq-accent hover:underline"
              >
                {hideUnknown
                  ? `Show all ${pendingRows.length}`
                  : `Show fewer`}
              </button>
            )}
          </div>
        </section>
      )}

      <details className="border-b border-border py-2">
        <summary className="cursor-pointer py-4 text-sm font-semibold">Supporting evidence</summary>
        <div className="pb-6 space-y-8">
        <section className="py-2" aria-labelledby="posted-salary-title">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-success/10 text-success">
            <ShieldCheck className="size-3.5" />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase text-success">
              Employer-published salary
            </p>
            <h2 id="posted-salary-title" className="mt-1 text-sm font-semibold">
              Salary ranges these employers printed themselves
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
              Base pay taken straight from each company&rsquo;s own job posting — the strongest
              evidence available, because the employer committed to it publicly. It states base
              only, so it never implies bonus, equity, or a personal offer.
            </p>
          </div>
        </div>

        {companyPostedSalary === undefined ? (
          <p className="mt-4 border-t border-foreground/10 pt-4 text-xs text-muted-foreground">
            Checking current company-posted salary evidence…
          </p>
        ) : visiblePostedRanges.length === 0 ? (
          <div className="mt-4 border-t border-foreground/10 pt-4 text-xs">
            <p className="font-semibold text-foreground">
              No employer publishes a salary range for {targetLevelLabels[targetLevel]} in {location}.
            </p>
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
              Ranking figures fall back to sourced public salary pages, which stay labelled
              separately.
              {companyPostedSalary.lastCheckedAt
                ? ` Last checked ${formatTimestampDate(companyPostedSalary.lastCheckedAt)}.`
                : ""}
            </p>
          </div>
        ) : (
          <div className="mt-4 divide-y divide-foreground/[0.07] border-y border-foreground/10">
            {visiblePostedRanges.map((range) => (
              <div
                key={`${range.companySlug}:${range.level}:${range.locationLabel}:${range.minimumAmount}:${range.maximumAmount}`}
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

        {scopedPostedRanges.length > 0 && (
          <p className="mt-3 text-[10px] text-muted-foreground">
            {scopedPostedRanges.length > visiblePostedRanges.length
              ? `Showing ${visiblePostedRanges.length} of ${scopedPostedRanges.length} published ranges for ${targetLevelLabels[targetLevel]} in ${location}. Base pay only — it does not imply bonus, equity, or a personal offer.`
              : `Every published range for ${targetLevelLabels[targetLevel]} in ${location}. Base pay only — it does not imply bonus, equity, or a personal offer.`}
          </p>
        )}
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
            {cityCostKey === null ? (
              <p>No validated cost reference exists for {location} yet</p>
            ) : cityLivingCosts !== undefined && cityLivingCosts?.current !== true ? (
              <p>{location} cost reference is not validated, so after-cost rows are hidden</p>
            ) : null}
            {payrollModel !== undefined && payrollModel?.current !== true && (
              <p>Net-pay estimates are unavailable until the payroll model is validated</p>
            )}
          </div>
        </div>

        {marketBenchmarks === undefined ? (
          <p className="mt-4 border-y border-foreground/10 py-4 text-xs text-muted-foreground">
            Loading the official market benchmark…
          </p>
        ) : marketBenchmarks.length === 0 ? (
          <p className="mt-4 border-y border-foreground/10 py-4 text-xs text-muted-foreground">
            No official market benchmark is available yet, so these salaries are not
            placed against a national average here.
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
                No official Madrid salary reference is available yet, so there is no
                regional average to read these figures against.
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
