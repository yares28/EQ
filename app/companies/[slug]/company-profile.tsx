"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { useState } from "react";
import { useQuery } from "convex/react";
import { ArrowLeft, ArrowSquareOut, ShieldCheck, Star } from "@/components/eq/icon";

import { PageHeader, PageShell } from "@/components/eq/page-shell";
import { useCompanyCatalog } from "@/components/eq/use-company-catalog";
import { useSalaryDecisionContext } from "@/components/eq/use-salary-decision-context";
import { useShortlist } from "@/components/eq/use-shortlist";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { careerSourceAuditDetail, careerSourceAuditForSlug } from "@/lib/career-source-audits";
import { companyLadder } from "@/lib/company-level-ladders";
import { opinionForCompany } from "@/lib/company-opinions";
import {
  careerProviderLabel,
  companyResearchPresentation,
  type CompanyPostedRange,
} from "@/lib/company-research-catalog";
import {
  decisionProgressionFor,
  formatEuro,
  isPostedSalaryPoint,
  type SalaryProgression,
} from "@/lib/salary-analytics";
import { euroOrDash, formatIsoDay, signedPercent } from "@/lib/format";
import { cityCostKeyForLocation } from "@/lib/salary-decision-context";
import {
  estimateCashAfterCityReferenceCosts,
  estimateCashAfterPersonalCosts,
  personalCostForLocation,
} from "@/lib/city-reference-costs";
import { estimateSpainPayroll2026 } from "@/lib/spain-payroll-2026";
import { cn } from "@/lib/utils";
import {
  levelLabels,
  type SalaryCompany,
  type SalaryLevel,
  type SalaryPoint,
  type SalarySource,
} from "@/lib/salary-data";

/** Ladder order, so a location block always reads junior → principal. */
const LEVEL_ORDER: SalaryLevel[] = [
  "intern",
  "junior",
  "mid",
  "senior",
  "staff",
  "principal",
];

/** The levels the decision context can rank; a profile may hold more. */
function isRankableLevel(level: SalaryLevel): level is "intern" | "junior" | "mid" {
  return level === "intern" || level === "junior" || level === "mid";
}

function levelRank(level: SalaryLevel): number {
  const index = LEVEL_ORDER.indexOf(level);
  return index < 0 ? LEVEL_ORDER.length : index;
}

function formatDate(value: string | number | undefined): string {
  if (value === undefined) return "—";
  const timestamp =
    typeof value === "number" ? value : Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(timestamp));
}

/** Date and time, since several scans can land on the same day. */
function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

/** The base cell keeps the employer's published band rather than a midpoint. */
function baseCell(point: SalaryPoint): string {
  if (
    point.baseMinEur != null &&
    point.baseMaxEur != null &&
    point.baseMinEur !== point.baseMaxEur
  ) {
    return `${formatEuro(point.baseMinEur, true)}–${formatEuro(point.baseMaxEur, true)}`;
  }
  return formatEuro(point.baseEur, true);
}

function publisherFor(point: SalaryPoint, sources: SalarySource[]): string {
  if (isPostedSalaryPoint(point)) return "Employer posting";
  const source = sources.find((candidate) => point.sourceIds.includes(candidate.id));
  return source?.publisher ?? "Sourced page";
}

function sourceUrlFor(point: SalaryPoint, sources: SalarySource[]): string | null {
  const source = sources.find((candidate) => point.sourceIds.includes(candidate.id));
  return source?.url ?? null;
}

/**
 * Everything below the pay card is a card.
 *
 * The profile used to run the hero straight into a stack of bare `border-y`
 * sections at 10px — a different design language from the rest of the app,
 * and the reason the page read as unfinished below the fold. Salary, compare
 * and charts all state their content on paper with a hairline ring; this is
 * that same object, so the profile stops being the odd page out.
 */
function ProfileCard({
  title,
  description,
  meta,
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  /** Set on the right of the title — a count, a state pill. */
  meta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "mb-4 rounded-2xl bg-card p-5 shadow-[0_0_0_1px_rgb(26_25_23_/_5.5%)] sm:p-6",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-[14.5px] font-semibold tracking-[-0.012em]">{title}</h2>
          {description && (
            <p className="mt-1.5 max-w-2xl text-[12.5px] leading-[1.5] text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {meta && <div className="shrink-0 text-[11px] text-muted-foreground">{meta}</div>}
      </div>
      {children}
    </section>
  );
}

/** The framed box a table or a list sits in, one step in from the card. */
function InsetFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mt-4 overflow-hidden rounded-xl shadow-[0_0_0_1px_rgb(26_25_23_/_6%)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** One label-over-figure cell, the strip used on the hero and in the cards. */
function StatCell({
  label,
  value,
  detail,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1.5 truncate text-[24px] font-semibold leading-tight tracking-[-0.02em] tabular">
        {value}
      </p>
      {detail && <p className="mt-1 text-[11.5px] text-muted-foreground">{detail}</p>}
    </div>
  );
}

const TH =
  "px-4 py-3 text-[10.5px] font-medium uppercase tracking-[0.09em] text-muted-foreground";

/**
 * The pay card: one level, one location scope, answered properly.
 *
 * It replaces a metric strip whose first tile read "Highest base · across all
 * levels and scopes" — a maximum over intern through senior AND over two
 * different location scopes, printed two sections above copy promising figures
 * are never blended across locations. A figure only means something once you
 * say which level and which scope produced it.
 *
 * Base leads because it is what an employer commits to; total sits under it,
 * and the components that make up the difference sit beside it, because
 * "€58.3k" and "€46.7k plus bonus and stock" are different promises.
 */
function CompanyPayCard({
  company,
  point,
  progression,
  sourceName,
  netMonthlyEur,
  afterCostsEur,
  costsLabel,
  note,
}: {
  company: SalaryCompany;
  point: SalaryPoint;
  progression: SalaryProgression | null;
  sourceName: string;
  netMonthlyEur: number | null;
  afterCostsEur: number | null;
  costsLabel: string;
  note: string | null;
}) {
  const posted = isPostedSalaryPoint(point);
  const band =
    point.baseMinEur != null &&
    point.baseMaxEur != null &&
    point.baseMinEur !== point.baseMaxEur
      ? `${formatEuro(point.baseMinEur, true)}–${formatEuro(point.baseMaxEur, true)}`
      : formatEuro(point.baseEur, true);

  const extras: { label: string; value: string }[] = [
    { label: "Bonus", value: formatEuro(point.bonusEur, true) },
    { label: "Stock, vesting-normalised", value: formatEuro(point.equityEur, true) },
    { label: "Extras", value: formatEuro(point.extrasEur, true) },
  ];

  const stats: { label: string; value: string; suffix?: string }[] = [
    ...(netMonthlyEur === null
      ? []
      : [{ label: "Take-home", value: `≈${formatEuro(netMonthlyEur, true)}`, suffix: "/mo" }]),
    ...(afterCostsEur === null
      ? []
      : [{ label: costsLabel, value: `≈${euroOrDash(afterCostsEur)}`, suffix: "/mo" }]),
    {
      label: "Next step",
      value: progression?.decisionGrade ? signedPercent(progression.percent) : "—",
      suffix: progression?.decisionGrade ? ` to ${progression.to.companyLevel}` : undefined,
    },
    { label: "Source", value: sourceName },
    { label: "Checked", value: formatIsoDay(company.lastResearchedAt) },
  ];

  return (
    <section className="mb-4 rounded-[20px] bg-eq-accent px-6 py-7 text-eq-accent-foreground shadow-[0_10px_34px_rgb(36_56_46_/_18%)] sm:px-9 sm:py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] opacity-60">
          {levelLabels[point.level]} · {point.companyLevel} · {point.locationLabel}
        </p>
        <span className="inline-flex items-center gap-2 rounded-full bg-eq-accent-foreground/[0.12] px-3 py-1.5 text-[11px] font-medium">
          <span className="size-1.5 rounded-full bg-eq-accent-foreground" />
          {posted ? "Employer-posted" : "Sourced"} · {point.confidence} confidence
        </span>
      </div>

      <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
        <div className="min-w-0">
          <p className="text-xs opacity-60">{posted ? "Posted base" : "Base pay"}</p>
          <p className="mt-2 text-[clamp(2.75rem,6vw,3.875rem)] font-semibold leading-[0.92] tracking-[-0.038em] tabular">
            {band}
            <span className="text-[clamp(1rem,1.8vw,1.375rem)] font-normal opacity-55"> / year</span>
          </p>
          {point.totalCompEur !== null && (
            <p className="mt-3.5 text-xl font-semibold tracking-[-0.018em] tabular">
              {formatEuro(point.totalCompEur, true)}
              <span className="text-[13px] font-normal opacity-60"> / year total compensation</span>
            </p>
          )}
        </div>

        <dl className="shrink-0 rounded-2xl bg-eq-accent-foreground/[0.09] px-5 py-4 lg:min-w-[300px]">
          <p className="mb-3.5 text-[11px] font-medium uppercase tracking-[0.09em] opacity-55">
            On top of base
          </p>
          <div className="flex flex-col gap-2.5">
            {extras.map((extra) => (
              <div key={extra.label} className="flex items-baseline justify-between gap-5">
                <dt className="text-[13px] opacity-70">{extra.label}</dt>
                <dd
                  className={`text-[17px] font-semibold tracking-[-0.016em] tabular ${
                    extra.value === "—" ? "opacity-45" : ""
                  }`}
                >
                  {extra.value === "—" ? "not published" : extra.value}
                </dd>
              </div>
            ))}
          </div>
        </dl>
      </div>

      <dl className="mt-7 grid grid-cols-2 gap-x-0 gap-y-5 border-t border-eq-accent-foreground/[0.16] pt-5 sm:grid-cols-3 lg:flex lg:gap-y-0">
        {stats.map((stat, index) => (
          <div
            key={stat.label}
            className={
              index === 0
                ? "min-w-0 lg:flex-1 lg:pr-4"
                : "min-w-0 pl-4 [&:nth-child(odd)]:pl-0 sm:[&:nth-child(odd)]:pl-4 sm:[&:nth-child(3n+1)]:pl-0 lg:flex-1 lg:border-l lg:border-eq-accent-foreground/[0.14] lg:pl-4 lg:[&:nth-child(odd)]:pl-4"
            }
          >
            <dt className="text-[10px] font-medium uppercase tracking-[0.09em] opacity-55">
              {stat.label}
            </dt>
            <dd className="mt-2 truncate text-xl font-semibold tracking-[-0.018em] tabular">
              {stat.value}
              {stat.suffix && (
                <span className="text-xs font-normal opacity-60">{stat.suffix}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {note && <p className="mt-5 text-[12.5px] leading-relaxed opacity-62">{note}</p>}
    </section>
  );
}

/**
 * Scope labels are not all place names — "Spain-wide" and "EU benchmark" are
 * scopes, and "reports in Spain-wide" does not read. Those take a comma.
 */
function scopeTitle(companyName: string, location: string): string {
  return /wide|benchmark|remote/i.test(location)
    ? `Every level ${companyName} reports, ${location}`
    : `Every level ${companyName} reports in ${location}`;
}

/** How tall the top bar of the ladder ramp stands. */
const BAR_PEAK_PX = 96;

/** A component that was never published renders as a dash, never as zero. */
function Component({ amount }: { amount: number | null }) {
  return amount === null ? (
    <span className="text-foreground/30">—</span>
  ) : (
    <>{formatEuro(amount, true)}</>
  );
}

/**
 * The ladder, drawn.
 *
 * The table says what each level pays; the ramp says what the shape is, which
 * is the question a profile actually answers — the hero answers one level,
 * this answers where it goes. Bars are total compensation where the publisher
 * stated one and base where it did not, labelled per bar so the two are never
 * silently mixed into one comparison.
 */
function LadderRamp({
  points,
  shownLevel,
}: {
  points: SalaryPoint[];
  shownLevel: SalaryLevel | null;
}) {
  const bars = points
    .map((point) => ({
      point,
      amount: point.totalCompEur ?? point.baseEur,
      basis: point.totalCompEur === null ? ("base" as const) : ("total" as const),
    }))
    .filter((bar): bar is typeof bar & { amount: number } => bar.amount !== null);

  if (bars.length < 2) return null;

  const peak = Math.max(...bars.map((bar) => bar.amount));
  const floor = Math.min(...bars.map((bar) => bar.amount));
  const mixed = bars.some((bar) => bar.basis === "base");

  return (
    <>
      <div className="mt-6 border-t border-foreground/[0.06] pt-6">
        <div className="flex max-w-[520px] items-end gap-2.5">
        {bars.map(({ point, amount, basis }) => {
          const active = point.level === shownLevel;
          return (
            <div
              key={point.id}
              className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
            >
              <span className="text-[10.5px] tabular text-muted-foreground">
                {formatEuro(amount, true)}
                {basis === "base" && <span> base</span>}
              </span>
              <div
                className={`w-full rounded-t-[4px] ${
                  active
                    ? "bg-eq-accent"
                    : basis === "base"
                      ? "bg-eq-accent-soft"
                      : "bg-eq-accent-mid"
                }`}
                // Sized in pixels rather than a percentage: the column has no
                // definite height of its own, so a percentage would resolve
                // against nothing and the bar would vanish.
                style={{ height: `${Math.max(Math.round((amount / peak) * BAR_PEAK_PX), 6)}px` }}
              />
              <span
                className={`w-full truncate text-center text-[10.5px] ${
                  active ? "font-semibold text-foreground" : "text-muted-foreground"
                }`}
                title={point.companyLevel}
              >
                {levelLabels[point.level]}
              </span>
            </div>
          );
        })}
        </div>
      </div>
      <p className="mt-3 text-[11.5px] leading-[1.5] text-muted-foreground">
        {formatEuro(floor, true)} to {formatEuro(peak, true)} across the levels this
        publisher reports here.
        {mixed &&
          " Bars labelled “base” are drawn at base pay, because no total was published for them."}
      </p>
    </>
  );
}

function LocationSalaryTable({
  companyName,
  location,
  points,
  sources,
  shownPointId,
  shownLevel,
}: {
  companyName: string;
  location: string;
  points: SalaryPoint[];
  sources: SalarySource[];
  /** The row the pay card above is showing, highlighted rather than repeated. */
  shownPointId: string | null;
  shownLevel: SalaryLevel | null;
}) {
  const ordered = points
    .slice()
    .sort((a, b) => levelRank(a.level) - levelRank(b.level));

  return (
    <ProfileCard
      title={scopeTitle(companyName, location)}
      description="Never blended across locations or across employer-official and crowdsourced publishers. A dash means the component was not published, not that it is zero."
      meta={`${ordered.length} ${ordered.length === 1 ? "level" : "levels"}`}
    >
      <InsetFrame className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead>
            <tr className="border-b border-foreground/[0.07] bg-foreground/[0.014]">
              <th className={TH}>Level</th>
              <th className={`${TH} text-right`}>Base</th>
              <th className={`${TH} text-right`}>Bonus</th>
              <th className={`${TH} text-right`}>Stock</th>
              <th className={`${TH} text-right`}>Extras</th>
              <th className={`${TH} text-right`}>Total</th>
              <th className={TH}>Evidence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-foreground/[0.06]">
            {ordered.map((point) => {
              const official = isPostedSalaryPoint(point);
              const url = sourceUrlFor(point, sources);
              const shown = point.id === shownPointId;
              return (
                <tr key={point.id} className={shown ? "bg-eq-accent/[0.05]" : undefined}>
                  <td className="px-4 py-4 align-top">
                    <p className="text-[13.5px] font-semibold text-foreground">
                      {levelLabels[point.level]}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                      {point.companyLevel}
                    </p>
                  </td>
                  <td className="px-4 py-4 text-right align-top text-[14.5px] font-semibold tabular tracking-[-0.012em] text-foreground">
                    {baseCell(point)}
                  </td>
                  <td className="px-4 py-4 text-right align-top text-[13.5px] tabular text-muted-foreground">
                    <Component amount={point.bonusEur} />
                  </td>
                  <td className="px-4 py-4 text-right align-top text-[13.5px] tabular text-muted-foreground">
                    <Component amount={point.equityEur} />
                  </td>
                  <td className="px-4 py-4 text-right align-top text-[13.5px] tabular text-muted-foreground">
                    <Component amount={point.extrasEur} />
                  </td>
                  <td className="px-4 py-4 text-right align-top text-[14.5px] font-semibold tabular tracking-[-0.012em] text-foreground">
                    {point.totalCompEur === null ? (
                      <span
                        className="text-foreground/30"
                        title="The publisher stated base pay only, so no total is available."
                      >
                        —
                      </span>
                    ) : (
                      formatEuro(point.totalCompEur, true)
                    )}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <p className="flex items-center gap-2 text-[12.5px] text-foreground">
                      <span
                        className={`size-[7px] shrink-0 rounded-full ${
                          point.confidence === "High"
                            ? "bg-eq-accent"
                            : point.confidence === "Medium"
                              ? "bg-eq-accent/55"
                              : "bg-border"
                        }`}
                      />
                      {point.confidence} · {publisherFor(point, sources)}
                    </p>
                    <p className="mt-1 inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                      {official && <ShieldCheck className="size-3 text-eq-accent" />}
                      {official ? "Employer-official" : "Crowdsourced"}
                      {url && (
                        <>
                          {" · "}
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline"
                          >
                            source
                          </a>
                        </>
                      )}
                    </p>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </InsetFrame>

      <LadderRamp points={ordered} shownLevel={shownLevel} />
    </ProfileCard>
  );
}

function bandLabel(range: CompanyPostedRange): string {
  return range.minimumAmount === range.maximumAmount
    ? formatEuro(range.minimumAmount, true)
    : `${formatEuro(range.minimumAmount, true)}–${formatEuro(range.maximumAmount, true)}`;
}

/**
 * Employers publish one band per level and attach it to every role at that
 * level, so listing each posting separately repeats the same figure many times.
 * Grouping by band shows the pay once and keeps every posting reachable.
 */
function PostedRoles({ ranges }: { ranges: CompanyPostedRange[] }) {
  if (ranges.length === 0) return null;

  const bands = new Map<string, { key: string; range: CompanyPostedRange; roles: CompanyPostedRange[] }>();
  for (const range of ranges) {
    // Two bands can share a minimum (Elastic posts €62.8k–84.3k and
    // €62.8k–82.4k at the same level), so the key must carry both bounds.
    const key = `${range.level}|${range.locationLabel}|${range.period}|${range.minimumAmount}-${range.maximumAmount}`;
    const existing = bands.get(key);
    if (existing) existing.roles.push(range);
    else bands.set(key, { key, range, roles: [range] });
  }
  const grouped = [...bands.values()].sort(
    (a, b) =>
      levelRank(a.range.level) - levelRank(b.range.level) ||
      b.roles.length - a.roles.length,
  );

  return (
    <ProfileCard
      title="Open roles that state pay"
      description={`${ranges.length} current ${ranges.length === 1 ? "posting" : "postings"} passed the Spain, EUR, period, IC-role, and level checks, publishing ${grouped.length} distinct ${grouped.length === 1 ? "band" : "bands"}. These are the employer's own words.`}
      meta={`${grouped.length} ${grouped.length === 1 ? "band" : "bands"}`}
    >
      <InsetFrame className="divide-y divide-foreground/[0.06]">
        {grouped.map(({ key, range, roles }) => (
          <div key={key} className="p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1">
              <p className="text-[13.5px] font-semibold text-foreground">
                {levelLabels[range.level]} · {range.locationLabel}
              </p>
              <p className="text-[16px] font-semibold tabular tracking-[-0.014em] text-foreground">
                {bandLabel(range)}
                <span className="text-[11.5px] font-normal text-muted-foreground">
                  {` / ${range.period}`}
                </span>
              </p>
            </div>
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              {roles.length} {roles.length === 1 ? "role" : "roles"} at this band · checked{" "}
              {formatDate(range.checkedAt)}
            </p>
            <ul className="mt-2.5 flex flex-wrap gap-1.5">
              {roles.map((role) => (
                <li key={role.observationId ?? role.url}>
                  <a
                    href={role.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-[11.5px] text-muted-foreground transition-colors hover:bg-eq-accent/10 hover:text-foreground"
                  >
                    <span className="truncate">{role.title}</span>
                    <ArrowSquareOut className="size-2.5 shrink-0" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </InsetFrame>
    </ProfileCard>
  );
}

function LevelLadder({ slug }: { slug: string }) {
  const ladder = companyLadder(slug);
  if (ladder === null) return null;
  return (
    <ProfileCard
      title={ladder.ladderName}
      description={`Audited ${formatDate(ladder.auditedOn)}. A promotion figure is only shown when the employer's own evidence names the next level.`}
      meta={`${ladder.steps.length} ${ladder.steps.length === 1 ? "step" : "steps"}`}
    >
      <InsetFrame className="divide-y divide-foreground/[0.06]">
        {ladder.steps.map((step) => (
          <div
            key={step.companyLevel}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3.5"
          >
            <p className="text-[13.5px] font-semibold text-foreground">
              {step.companyLevel}
            </p>
            <p className="text-[11.5px] text-muted-foreground">
              {levelLabels[step.normalizedLevel]}
            </p>
            <p className="ml-auto text-[11.5px] text-muted-foreground">
              {step.nextCompanyLevel === null
                ? "Top of audited ladder"
                : `→ ${step.nextCompanyLevel}`}
            </p>
            {step.status === "ambiguous" && (
              <span className="rounded-full bg-warning/[0.12] px-2 py-0.5 text-[10.5px] font-medium text-warning">
                Not attributable
              </span>
            )}
          </div>
        ))}
      </InsetFrame>
    </ProfileCard>
  );
}

const REFRESH_TONE: Record<string, string> = {
  current: "bg-success/15 text-success",
  overdue: "bg-warning/15 text-warning",
  never: "bg-warning/15 text-warning",
};

const REFRESH_LABEL: Record<string, string> = {
  current: "Up to date",
  overdue: "Refresh overdue",
  never: "Never synced",
};

function relativeTime(timestamp: number | undefined): string {
  if (timestamp === undefined) return "never";
  const hours = Math.floor((Date.now() - timestamp) / 36e5);
  if (hours < 1) return "under an hour ago";
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

/** What moved at the last scan, naming only the movements that happened. */
function lastScanPhrase(scan: {
  rolesAdded: number;
  rolesRemoved: number;
  rolesChanged: number;
}): string {
  const moves = [
    scan.rolesAdded > 0 && `${scan.rolesAdded} added`,
    scan.rolesRemoved > 0 && `${scan.rolesRemoved} removed`,
    scan.rolesChanged > 0 && `${scan.rolesChanged} changed`,
  ].filter((part): part is string => part !== false);
  return moves.length === 0
    ? "nothing moved at the last scan"
    : `${moves.join(", ")} at the last scan`;
}

/**
 * How monitoring is going for this company, and what people say about it.
 *
 * The two sit on one row because they are the same kind of answer — the live
 * state of a company rather than a pay figure — and because the opinion card
 * alone on a full-width row was the emptiest object on the page.
 */
function MonitoringSection({
  slug,
  opinion,
}: {
  slug: string;
  /** The employee-opinion card, rendered beside the hiring stats. */
  opinion: React.ReactNode;
}) {
  const monitoring = useQuery(api.companyResearch.companyMonitoring, { slug });
  const [showAllRoles, setShowAllRoles] = useState(false);

  if (monitoring === undefined) {
    return (
      <div className="mb-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl bg-card p-5 shadow-[0_0_0_1px_rgb(26_25_23_/_5.5%)] sm:p-6">
          <h2 className="text-[14.5px] font-semibold tracking-[-0.012em]">Hiring right now</h2>
          <p className="mt-4 text-[12.5px] text-muted-foreground">Loading monitoring status…</p>
        </div>
        {opinion}
      </div>
    );
  }

  // Untracked companies have no feed to report on, so the opinion card takes
  // the row rather than sitting next to an empty panel.
  if (monitoring === null) return <div className="mb-4">{opinion}</div>;

  const roles = showAllRoles ? monitoring.spainRoles : monitoring.spainRoles.slice(0, 8);
  const boardName = careerProviderLabel(monitoring.provider);
  const lastScan = monitoring.scans[0];

  return (
    <>
      <div className="mb-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl bg-card p-5 shadow-[0_0_0_1px_rgb(26_25_23_/_5.5%)] sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-2">
            <h2 className="text-[14.5px] font-semibold tracking-[-0.012em]">Hiring right now</h2>
            {monitoring.researchStatus === "monitoring" && (
              <span
                className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1 text-[11px] font-medium ${REFRESH_TONE[monitoring.refreshState]}`}
              >
                <span className="size-1.5 rounded-full bg-current" />
                {REFRESH_LABEL[monitoring.refreshState]}
              </span>
            )}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-3">
            <StatCell label="Open in Spain" value={monitoring.spainRoleCount} />
            <StatCell label="Software IC" value={monitoring.softwareRoleCount} />
            <StatCell
              label="Last sync"
              value={relativeTime(monitoring.lastCareerSyncAt)}
              detail={
                monitoring.careerSyncError
                  ? "Last attempt failed; the previous data is preserved."
                  : undefined
              }
            />
          </div>

          <p className="mt-5 text-[12.5px] leading-[1.5] text-muted-foreground">
            {monitoring.boardUrl ? (
              <>
                Read from{" "}
                <a
                  href={monitoring.boardUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-primary hover:underline"
                >
                  {boardName}
                </a>
              </>
            ) : (
              `Read from ${boardName}`
            )}
            {lastScan && ` · ${lastScanPhrase(lastScan)}`}
          </p>
        </section>

        {opinion}
      </div>

      {monitoring.spainRoles.length > 0 && (
        <ProfileCard
          title="All open roles in Spain"
          description="Every role this career page lists in Spain, not only engineering."
          meta={`${monitoring.spainRoles.length} ${monitoring.spainRoles.length === 1 ? "role" : "roles"}`}
        >
          <InsetFrame className="divide-y divide-foreground/[0.06]">
            {roles.map((role) => (
              <div
                key={role.postingId}
                className="flex items-baseline justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <a
                    href={role.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[13.5px] text-foreground hover:text-primary hover:underline"
                  >
                    {role.title}
                  </a>
                  <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                    {role.locations.join(" · ")}
                  </p>
                </div>
                {role.softwareIc && (
                  <span className="shrink-0 rounded-full bg-eq-accent/10 px-2.5 py-1 text-[10.5px] font-medium text-eq-accent">
                    Software IC
                  </span>
                )}
              </div>
            ))}
          </InsetFrame>
          {monitoring.spainRoles.length > 8 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-3 rounded-full"
              onClick={() => setShowAllRoles((current) => !current)}
            >
              {showAllRoles
                ? "Show fewer"
                : `Show all ${monitoring.spainRoles.length} roles`}
            </Button>
          )}
        </ProfileCard>
      )}

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl bg-card p-5 shadow-[0_0_0_1px_rgb(26_25_23_/_5.5%)] sm:p-6">
          <h2 className="text-[14.5px] font-semibold tracking-[-0.012em]">Scan history</h2>
          <p className="mt-1.5 text-[12.5px] leading-[1.5] text-muted-foreground">
            Every time EQ re-read this career page, and what moved.
          </p>
          {monitoring.scans.length === 0 ? (
            <p className="mt-4 rounded-xl bg-secondary/60 px-4 py-4 text-[12.5px] leading-[1.5] text-muted-foreground">
              No rescan recorded yet. The log starts from the next scheduled refresh.
            </p>
          ) : (
            <InsetFrame className="divide-y divide-foreground/[0.06]">
              {monitoring.scans.map((scan) => {
                const still =
                  scan.rolesAdded + scan.rolesRemoved + scan.rolesChanged === 0;
                return (
                  <div
                    key={scan.scanId}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3"
                  >
                    <p className="text-[12.5px] font-medium text-foreground">
                      {formatDateTime(scan.scannedAt)}
                    </p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${
                        scan.status === "complete"
                          ? "bg-eq-accent/10 text-eq-accent"
                          : "bg-warning/[0.12] text-warning"
                      }`}
                    >
                      {scan.status === "complete"
                        ? "Complete"
                        : scan.status === "partial"
                          ? "Partial"
                          : "Failed"}
                    </span>
                    <p className="ml-auto text-[11.5px] tabular text-muted-foreground">
                      {still ? (
                        `No change · ${scan.spainRoles} Spain ${scan.spainRoles === 1 ? "role" : "roles"}`
                      ) : (
                        <>
                          {scan.rolesAdded > 0 && (
                            <span className="text-eq-accent">+{scan.rolesAdded} added </span>
                          )}
                          {scan.rolesRemoved > 0 && (
                            <span className="text-destructive">−{scan.rolesRemoved} removed </span>
                          )}
                          {scan.rolesChanged > 0 && <span>{scan.rolesChanged} changed </span>}
                          · {scan.spainRoles} Spain {scan.spainRoles === 1 ? "role" : "roles"}
                        </>
                      )}
                    </p>
                    {scan.errorMessage && (
                      <p className="w-full text-[11.5px] leading-4 text-warning">
                        {scan.errorMessage}
                      </p>
                    )}
                  </div>
                );
              })}
            </InsetFrame>
          )}
        </section>

        <section className="rounded-2xl bg-card p-5 shadow-[0_0_0_1px_rgb(26_25_23_/_5.5%)] sm:p-6">
          <h2 className="text-[14.5px] font-semibold tracking-[-0.012em]">Role changes</h2>
          <p className="mt-1.5 text-[12.5px] leading-[1.5] text-muted-foreground">
            Individual postings whose title, location, salary, or requirements moved.
          </p>
          {monitoring.changelog.length === 0 ? (
            <p className="mt-4 rounded-xl bg-secondary/60 px-4 py-4 text-[12.5px] leading-[1.5] text-muted-foreground">
              No role has changed yet. A change is only logged when a posting differs
              between two complete syncs — its first capture is not a change.
            </p>
          ) : (
            <InsetFrame className="divide-y divide-foreground/[0.06]">
              {monitoring.changelog.map((entry) => (
                <div
                  key={entry.versionId}
                  className="flex items-baseline justify-between gap-3 px-4 py-3"
                >
                  <a
                    href={entry.url}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 truncate text-[13.5px] text-foreground hover:text-primary hover:underline"
                  >
                    {entry.title}
                  </a>
                  <p className="shrink-0 text-[11.5px] text-muted-foreground">
                    {entry.kinds.join(", ")} · {formatDateTime(entry.capturedAt)}
                  </p>
                </div>
              ))}
            </InsetFrame>
          )}
        </section>
      </div>
    </>
  );
}

export function CompanyProfile({ slug }: { slug: string }) {
  const { companies, postedRanges, trackedCompanies, catalogReady } = useCompanyCatalog();
  const shortlist = useShortlist();
  const company: SalaryCompany | undefined = companies.find(
    (candidate) => candidate.slug === slug,
  );
  const tracked = trackedCompanies.find((candidate) => candidate.slug === slug) ?? null;
  const { targetLevel, location, costMode, setTargetLevel } = useSalaryDecisionContext();
  const [scopeLabel, setScopeLabel] = useState<string | null>(null);
  /**
   * The level this page is showing. It cannot just read the decision context:
   * that only ranks intern, SDE1 and SDE2, so a profile holding a senior or
   * staff figure could never be asked for it. Null means "follow the context".
   */
  const [levelChoice, setLevelChoice] = useState<SalaryLevel | null>(null);
  const settings = useQuery(api.settings.get);
  const personalCost = costMode === "personal"
    ? personalCostForLocation(settings?.personalCityCosts, location)
    : null;
  const cityCostKey = costMode === "reference" ? cityCostKeyForLocation(location) : null;
  const cityLivingCosts = useQuery(
    api.madridCostResearch.latestCityLivingCosts,
    cityCostKey === null ? "skip" : { cityKey: cityCostKey },
  );
  const payrollModel = useQuery(api.payrollResearch.activeSpainPayrollModel);

  if (!catalogReady) {
    return (
      <PageShell width="wide">
        <div className="border-y border-foreground/10 py-16 text-center">
          <p className="text-sm font-medium">Loading company research…</p>
        </div>
      </PageShell>
    );
  }

  // The route already rejected slugs with no company row, so reaching here
  // means the catalog and the backend disagree. Hand it to the app's own
  // not-found page rather than inventing a second one.
  if (company === undefined) notFound();

  const presentation = companyResearchPresentation(tracked);
  const audit = tracked?.researchStatus === "unsupported"
    ? careerSourceAuditForSlug(slug)
    : null;
  const opinion = opinionForCompany(slug);
  const companyRanges = postedRanges.filter((range) => range.companySlug === slug);
  const saved = shortlist.companies.has(slug);

  // Group by the location the figure actually applies to; a company with pay in
  // three scopes gets three blocks rather than one blended table.
  const byLocation = new Map<string, SalaryPoint[]>();
  for (const point of company.salaryPoints) {
    const existing = byLocation.get(point.locationLabel);
    if (existing) existing.push(point);
    else byLocation.set(point.locationLabel, [point]);
  }
  const locationBlocks = [...byLocation.entries()].sort(
    (left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]),
  );

  /**
   * Which figure the card answers. The page used to ignore the app's decision
   * context entirely, so arriving from Compare scoped to SDE1 in Valencia
   * landed on an unscoped page with no way to re-scope. It now opens on that
   * scope when the company reports it, and falls back to its best-evidenced
   * point when it does not.
   */
  const scopedPoints = company.salaryPoints
    .slice()
    .sort((a, b) => levelRank(a.level) - levelRank(b.level));
  const shownLevel = levelChoice ?? targetLevel;
  const contextPoint =
    scopedPoints.find(
      (point) => point.level === shownLevel && point.locationLabel === scopeLabel,
    ) ?? null;
  const shownPoint =
    contextPoint ??
    scopedPoints.find((point) => point.level === shownLevel) ??
    scopedPoints.find((point) => point.locationLabel === scopeLabel) ??
    scopedPoints[0] ??
    null;

  // Progression is only defined for the levels the decision context ranks, so
  // a senior or staff row shows no next step rather than a fabricated one.
  const availableLevels = [...new Set(scopedPoints.map((point) => point.level))];
  const availableScopes = [...new Set(scopedPoints.map((point) => point.locationLabel))];

  const shownProgression =
    shownPoint !== null && isRankableLevel(shownPoint.level)
      ? decisionProgressionFor(company, shownPoint.level, location)
      : null;

  const payrollEstimate =
    payrollModel?.current === true && shownPoint?.baseEur != null
      ? estimateSpainPayroll2026(
          shownPoint.baseEur + (shownPoint.bonusEur ?? 0) + (shownPoint.extrasEur ?? 0),
        )
      : null;
  const afterCostsEur =
    payrollEstimate === null
      ? null
      : personalCost !== null
        ? estimateCashAfterPersonalCosts(payrollEstimate.monthlyNetCashEur, personalCost)
        : cityCostKey !== null && cityLivingCosts?.current === true
          ? estimateCashAfterCityReferenceCosts(
              payrollEstimate.monthlyNetCashEur,
              cityLivingCosts.monthlyRentEur,
              cityLivingCosts.monthlyEssentialsEur,
            )?.monthlyCashAfterReferenceCostsEur ?? null
          : null;

  return (
    <PageShell width="wide">
      <Link
        href="/salary"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Ranking
      </Link>

      <PageHeader
        title={company.canonicalName}
        description={company.researchNotes}
        action={
          <Button
            type="button"
            variant={saved ? "default" : "outline"}
            size="sm"
            onClick={() => shortlist.toggle(slug)}
            className="gap-1.5 rounded-full"
          >
            <Star className="size-3.5" weight={saved ? "fill" : "regular"} />
            {saved ? "Shortlisted" : "Shortlist"}
          </Button>
        }
        meta={
          <p className="text-xs text-muted-foreground">
            {company.companyType} · {presentation.label}
            {tracked?.provider ? ` · ${careerProviderLabel(tracked.provider)}` : ""}
            {` · checked ${formatDate(company.lastResearchedAt)}`}
          </p>
        }
      />

      {/* One level, one scope, said out loud — see CompanyPayCard. */}
      {shownPoint === null ? (
        <section className="mb-4 rounded-[20px] bg-eq-accent px-6 py-7 text-eq-accent-foreground shadow-[0_10px_34px_rgb(36_56_46_/_18%)] sm:px-9 sm:py-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] opacity-60">
            {company.canonicalName}
          </p>
          <p className="mt-4 max-w-2xl text-lg leading-normal opacity-80">
            No salary has been sourced for this company yet. {companyResearchPresentation(tracked).detail}
          </p>
        </section>
      ) : (
        <CompanyPayCard
          company={company}
          point={shownPoint}
          progression={shownProgression}
          sourceName={publisherFor(shownPoint, company.sources)}
          netMonthlyEur={payrollEstimate?.monthlyNetCashEur ?? null}
          afterCostsEur={afterCostsEur}
          costsLabel={personalCost !== null ? "After your costs" : `After ${location} costs`}
          note={
            contextPoint === null && scopeLabel !== null
              ? `${company.canonicalName} reports nothing at ${levelLabels[shownLevel]} in ${scopeLabel}, so this is its closest sourced figure.`
              : isPostedSalaryPoint(shownPoint)
                ? null
                : `${company.canonicalName} publishes no qualifying Spain salary on its current postings, so this figure comes from a sourced public salary page rather than the employer.`
          }
        />
      )}

      {/* Scope. The levels are the company's own, not the ranking's three:
          a profile that holds a senior figure should let you ask for it.
          A company with nothing sourced has nothing to scope, and the bar
          rendered as an empty white sliver rather than not at all. */}
      {availableLevels.length > 0 && (
      <section className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-card p-3 shadow-[0_0_0_1px_rgb(26_25_23_/_5.5%)]">
        <div className="flex min-w-0 flex-wrap items-center gap-1 rounded-full bg-secondary p-1">
          {availableLevels.map((level) => (
            <button
              key={level}
              type="button"
              aria-pressed={shownPoint?.level === level}
              onClick={() => {
                setLevelChoice(level);
                // Keep the rest of the app in step where it can follow.
                if (isRankableLevel(level)) setTargetLevel(level);
                setScopeLabel(
                  scopedPoints.find((point) => point.level === level)?.locationLabel ?? scopeLabel,
                );
              }}
              className={`h-8 rounded-full px-3.5 text-xs font-medium transition-colors ${
                shownPoint?.level === level
                  ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {levelLabels[level]}
            </button>
          ))}
        </div>
        {availableScopes.length > 1 && (
          <div className="flex min-w-0 flex-wrap items-center gap-1 rounded-full bg-secondary p-1">
            {availableScopes.map((label) => (
              <button
                key={label}
                type="button"
                aria-pressed={shownPoint?.locationLabel === label}
                onClick={() => setScopeLabel(label)}
                className={`h-8 rounded-full px-3.5 text-xs font-medium transition-colors ${
                  shownPoint?.locationLabel === label
                    ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </section>
      )}

      {audit && (
        <p className="mb-4 rounded-2xl border-l-2 border-warning bg-warning/[0.06] px-4 py-3 text-[12.5px] leading-[1.5]">
          {careerSourceAuditDetail(audit)}
        </p>
      )}

      {locationBlocks.length === 0 ? (
        <ProfileCard
          title="Pay by location"
          description="Figures are never blended across locations or across employer-official and crowdsourced publishers."
        >
          <div className="mt-4 rounded-xl bg-secondary/60 px-5 py-10 text-center">
            <p className="text-[13.5px] font-semibold">No salary evidence yet</p>
            <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-[1.5] text-muted-foreground">
              {presentation.detail}
            </p>
          </div>
        </ProfileCard>
      ) : (
        locationBlocks.map(([blockLocation, points]) => (
          <LocationSalaryTable
            key={blockLocation}
            companyName={company.canonicalName}
            location={blockLocation}
            points={points}
            sources={company.sources}
            shownPointId={shownPoint?.id ?? null}
            shownLevel={shownPoint?.level ?? null}
          />
        ))
      )}

      <PostedRoles ranges={companyRanges} />

      <LevelLadder slug={slug} />

      {/* Operational detail, below the pay rather than above it: last sync,
          fourteen role titles and four scan entries used to sit between the
          header and any salary figure. */}
      <MonitoringSection
        slug={slug}
        opinion={
          <section className="rounded-2xl bg-card p-5 shadow-[0_0_0_1px_rgb(26_25_23_/_5.5%)] sm:p-6">
            <h2 className="text-[14.5px] font-semibold tracking-[-0.012em]">
              What people say
            </h2>
            <p className="mt-3.5 text-[28px] font-semibold leading-none tracking-[-0.024em] tabular">
              {opinion.score === null ? (
                <span className="text-[19px] text-muted-foreground">
                  Insufficient evidence
                </span>
              ) : (
                <>
                  {opinion.score.toFixed(1)}
                  <span className="text-[15px] font-normal text-muted-foreground"> / 5</span>
                </>
              )}
            </p>
            <p className="mt-2.5 text-[12.5px] leading-[1.5] text-muted-foreground">
              {opinion.summary}
            </p>
            <p className="mt-3 text-[11.5px] text-muted-foreground">
              {opinion.evidenceScope} · never used for pay.
            </p>
          </section>
        }
      />

      {company.sources.length > 0 && (
        <ProfileCard
          title="Sources"
          description="Every page a figure on this profile was read from."
          meta={`${company.sources.length} ${company.sources.length === 1 ? "source" : "sources"}`}
        >
          <div className="mt-4 flex flex-wrap gap-2">
            {company.sources.map((source) => (
              <a
                key={source.id}
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-secondary px-3.5 py-2 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-eq-accent/10 hover:text-foreground"
              >
                <span className="truncate">
                  {source.publisher}: {source.label}
                </span>
                <ArrowSquareOut className="size-3 shrink-0" />
              </a>
            ))}
          </div>
        </ProfileCard>
      )}
    </PageShell>
  );
}
