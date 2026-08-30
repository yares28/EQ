"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import { ArrowLeft, ArrowSquareOut, ShieldCheck, Star } from "@/components/eq/icon";

import { MetricStrip, PageHeader, PageShell } from "@/components/eq/page-shell";
import { useCompanyCatalog } from "@/components/eq/use-company-catalog";
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
import { formatEuro, isPostedSalaryPoint } from "@/lib/salary-analytics";
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

function LocationSalaryTable({
  location,
  points,
  sources,
}: {
  location: string;
  points: SalaryPoint[];
  sources: SalarySource[];
}) {
  const ordered = points
    .slice()
    .sort((a, b) => levelRank(a.level) - levelRank(b.level));

  return (
    <section className="mb-8">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">{location}</h3>
        <p className="text-[10px] text-muted-foreground">
          {ordered.length} {ordered.length === 1 ? "level" : "levels"}
        </p>
      </div>
      <div className="overflow-x-auto border-y border-foreground/10">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="text-[10px] text-muted-foreground">
            <tr>
              <th className="px-3 py-3 font-medium">Level</th>
              <th className="px-3 py-3 text-right font-medium">Base</th>
              <th className="px-3 py-3 text-right font-medium">Bonus</th>
              <th className="px-3 py-3 text-right font-medium">Stock</th>
              <th className="px-3 py-3 text-right font-medium">Extras</th>
              <th className="px-3 py-3 text-right font-medium">Total</th>
              <th className="px-3 py-3 font-medium">Evidence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-foreground/[0.07]">
            {ordered.map((point) => {
              const official = isPostedSalaryPoint(point);
              const url = sourceUrlFor(point, sources);
              return (
                <tr key={point.id}>
                  <td className="px-3 py-3">
                    <p className="font-semibold text-foreground">
                      {levelLabels[point.level]}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {point.companyLevel}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-right font-semibold tabular text-foreground">
                    {baseCell(point)}
                  </td>
                  <td className="px-3 py-3 text-right tabular text-muted-foreground">
                    {formatEuro(point.bonusEur, true)}
                  </td>
                  <td className="px-3 py-3 text-right tabular text-muted-foreground">
                    {formatEuro(point.equityEur, true)}
                  </td>
                  <td className="px-3 py-3 text-right tabular text-muted-foreground">
                    {formatEuro(point.extrasEur, true)}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold tabular text-foreground">
                    {point.totalCompEur === null ? (
                      <span
                        className="text-muted-foreground"
                        title="The employer published base pay only, so no total is available."
                      >
                        —
                      </span>
                    ) : (
                      formatEuro(point.totalCompEur, true)
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 text-[10px] font-semibold ${
                        official ? "text-success" : "text-muted-foreground"
                      }`}
                    >
                      {official && <ShieldCheck className="size-3" />}
                      {publisherFor(point, sources)}
                    </span>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {official ? "Employer-official" : "Crowdsourced"} · {point.confidence}
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
      </div>
    </section>
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
    <section className="mb-8">
      <h2 className="mb-1 text-sm font-semibold">Open roles that state pay</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        {ranges.length} current {ranges.length === 1 ? "posting" : "postings"} passed the
        Spain, EUR, period, IC-role, and level checks, publishing{" "}
        {grouped.length} distinct {grouped.length === 1 ? "band" : "bands"}. These are the
        employer&apos;s own words.
      </p>
      <div className="divide-y divide-foreground/[0.07] border-y border-foreground/10">
        {grouped.map(({ key, range, roles }) => (
          <div key={key} className="py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="text-xs font-semibold text-foreground">
                {levelLabels[range.level]} · {range.locationLabel}
              </p>
              <p className="text-sm font-semibold tabular text-foreground">
                {bandLabel(range)}
                <span className="text-[10px] font-medium text-muted-foreground">
                  {` / ${range.period}`}
                </span>
              </p>
            </div>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {roles.length} {roles.length === 1 ? "role" : "roles"} at this band · checked{" "}
              {formatDate(range.checkedAt)}
            </p>
            <ul className="mt-2 space-y-1">
              {roles.map((role) => (
                <li key={role.observationId ?? role.url}>
                  <a
                    href={role.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-baseline gap-1.5 text-[11px] text-muted-foreground hover:text-primary hover:underline"
                  >
                    {role.title}
                    <ArrowSquareOut className="size-2.5 shrink-0" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function LevelLadder({ slug }: { slug: string }) {
  const ladder = companyLadder(slug);
  if (ladder === null) return null;
  return (
    <section className="mb-8">
      <h2 className="mb-1 text-sm font-semibold">{ladder.ladderName}</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Audited {formatDate(ladder.auditedOn)}. A promotion figure is only shown
        when the employer&apos;s own evidence names the next level.
      </p>
      <div className="divide-y divide-foreground/[0.07] border-y border-foreground/10">
        {ladder.steps.map((step) => (
          <div key={step.companyLevel} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
            <p className="text-xs font-semibold text-foreground">{step.companyLevel}</p>
            <p className="text-[10px] text-muted-foreground">
              {levelLabels[step.normalizedLevel]}
            </p>
            <p className="ml-auto text-[10px] text-muted-foreground">
              {step.nextCompanyLevel === null
                ? "Top of audited ladder"
                : `→ ${step.nextCompanyLevel}`}
              {step.status === "ambiguous" && " · not attributable"}
            </p>
          </div>
        ))}
      </div>
    </section>
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

/**
 * How monitoring is going for this company: whether the data is current, what
 * feed it comes from, every open Spain role it has, and what has changed.
 */
function MonitoringSection({ slug }: { slug: string }) {
  const monitoring = useQuery(api.companyResearch.companyMonitoring, { slug });
  const [showAllRoles, setShowAllRoles] = useState(false);

  if (monitoring === undefined) {
    return (
      <section className="mb-8 border-y border-foreground/10 py-6">
        <p className="text-xs text-muted-foreground">Loading monitoring status…</p>
      </section>
    );
  }
  if (monitoring === null) return null;

  const roles = showAllRoles ? monitoring.spainRoles : monitoring.spainRoles.slice(0, 8);

  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Monitoring</h2>
        {monitoring.researchStatus === "monitoring" && (
          <span
            className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${REFRESH_TONE[monitoring.refreshState]}`}
          >
            {REFRESH_LABEL[monitoring.refreshState]}
          </span>
        )}
      </div>

      <div className="grid gap-4 border-y border-foreground/10 py-4 sm:grid-cols-3">
        <div>
          <p className="text-[10px] text-muted-foreground">Last successful sync</p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {relativeTime(monitoring.lastCareerSyncAt)}
          </p>
          {monitoring.careerSyncError && (
            <p className="mt-1 text-[10px] leading-4 text-warning">
              Last attempt failed; the previous data is preserved.
            </p>
          )}
        </div>
        <div className="sm:border-l sm:border-foreground/10 sm:pl-4">
          <p className="text-[10px] text-muted-foreground">Open roles in Spain</p>
          <p className="mt-1 text-sm font-semibold tabular text-foreground">
            {monitoring.spainRoleCount}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {monitoring.softwareRoleCount} software IC
          </p>
        </div>
        <div className="sm:border-l sm:border-foreground/10 sm:pl-4">
          <p className="text-[10px] text-muted-foreground">Career board</p>
          {monitoring.boardUrl ? (
            <a
              href={monitoring.boardUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
            >
              {careerProviderLabel(monitoring.provider)}
              <ArrowSquareOut className="size-3" />
            </a>
          ) : (
            <p className="mt-1 text-sm font-semibold text-muted-foreground">—</p>
          )}
          {monitoring.boardKey && (
            <p className="mt-1 truncate text-[10px] text-muted-foreground">
              {monitoring.boardKey}
            </p>
          )}
        </div>
      </div>

      {monitoring.spainRoles.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h3 className="text-xs font-semibold text-foreground">
              All open roles in Spain
            </h3>
            <p className="text-[10px] text-muted-foreground">
              Every role, not only engineering
            </p>
          </div>
          <div className="divide-y divide-foreground/[0.07] border-y border-foreground/10">
            {roles.map((role) => (
              <div
                key={role.postingId}
                className="flex items-baseline justify-between gap-3 py-2"
              >
                <div className="min-w-0">
                  <a
                    href={role.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-foreground hover:text-primary hover:underline"
                  >
                    {role.title}
                  </a>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {role.locations.join(" · ")}
                  </p>
                </div>
                {role.softwareIc && (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-semibold text-primary">
                    Software IC
                  </span>
                )}
              </div>
            ))}
          </div>
          {monitoring.spainRoles.length > 8 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => setShowAllRoles((current) => !current)}
            >
              {showAllRoles
                ? "Show fewer"
                : `Show all ${monitoring.spainRoles.length} roles`}
            </Button>
          )}
        </div>
      )}

      <div className="mt-5">
        <h3 className="mb-1 text-xs font-semibold text-foreground">Scan history</h3>
        <p className="mb-2 text-[10px] text-muted-foreground">
          Every time EQ re-read this career page, and what moved.
        </p>
        {monitoring.scans.length === 0 ? (
          <p className="border-y border-foreground/10 py-4 text-[11px] leading-5 text-muted-foreground">
            No rescan recorded yet. The log starts from the next scheduled refresh.
          </p>
        ) : (
          <div className="divide-y divide-foreground/[0.07] border-y border-foreground/10">
            {monitoring.scans.map((scan) => {
              const moved =
                scan.rolesAdded + scan.rolesRemoved + scan.rolesChanged === 0;
              return (
                <div key={scan.scanId} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
                  <p className="text-xs font-medium text-foreground">
                    {formatDateTime(scan.scannedAt)}
                  </p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                      scan.status === "complete"
                        ? "bg-success/15 text-success"
                        : "bg-warning/15 text-warning"
                    }`}
                  >
                    {scan.status === "complete"
                      ? "Complete"
                      : scan.status === "partial"
                        ? "Partial"
                        : "Failed"}
                  </span>
                  <p className="ml-auto text-[10px] tabular text-muted-foreground">
                    {moved ? (
                      `No change · ${scan.spainRoles} Spain ${scan.spainRoles === 1 ? "role" : "roles"}`
                    ) : (
                      <>
                        {scan.rolesAdded > 0 && (
                          <span className="text-success">+{scan.rolesAdded} added </span>
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
                    <p className="w-full text-[10px] leading-4 text-warning">
                      {scan.errorMessage}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-5">
        <h3 className="mb-1 text-xs font-semibold text-foreground">Role changes</h3>
        <p className="mb-2 text-[10px] text-muted-foreground">
          Individual postings whose title, location, salary, or requirements moved.
        </p>
        {monitoring.changelog.length === 0 ? (
          <p className="border-y border-foreground/10 py-4 text-[11px] leading-5 text-muted-foreground">
            No role has changed yet. A change is only logged when a posting differs
            between two complete syncs — its first capture is not a change.
          </p>
        ) : (
          <div className="divide-y divide-foreground/[0.07] border-y border-foreground/10">
            {monitoring.changelog.map((entry) => (
              <div key={entry.versionId} className="flex items-baseline justify-between gap-3 py-2">
                <a
                  href={entry.url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 truncate text-xs text-foreground hover:text-primary hover:underline"
                >
                  {entry.title}
                </a>
                <p className="shrink-0 text-[10px] text-muted-foreground">
                  {entry.kinds.join(", ")} · {formatDateTime(entry.capturedAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function CompanyProfile({ slug }: { slug: string }) {
  const { companies, postedRanges, trackedCompanies, catalogReady } = useCompanyCatalog();
  const shortlist = useShortlist();
  const company: SalaryCompany | undefined = companies.find(
    (candidate) => candidate.slug === slug,
  );
  const tracked = trackedCompanies.find((candidate) => candidate.slug === slug) ?? null;

  if (!catalogReady) {
    return (
      <PageShell width="wide">
        <div className="border-y border-foreground/10 py-16 text-center">
          <p className="text-sm font-medium">Loading company research…</p>
        </div>
      </PageShell>
    );
  }

  if (company === undefined) {
    return (
      <PageShell width="wide">
        <PageHeader title="Company not found" description={`Nothing tracked for “${slug}”.`} />
        <Link href="/salary" className="text-xs font-medium text-primary hover:underline">
          Back to the ranking
        </Link>
      </PageShell>
    );
  }

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

  const bases = company.salaryPoints
    .map((point) => point.baseEur)
    .filter((value): value is number => value !== null && value !== undefined);
  const totals = company.salaryPoints
    .map((point) => point.totalCompEur)
    .filter((value): value is number => value !== null);

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

      <MetricStrip
        metrics={[
          {
            label: "Highest base",
            value: bases.length > 0 ? formatEuro(Math.max(...bases), true) : "—",
            detail: bases.length > 0 ? "across all levels and scopes" : "no base evidence",
          },
          {
            label: "Highest total",
            value: totals.length > 0 ? formatEuro(Math.max(...totals), true) : "—",
            detail:
              totals.length > 0
                ? "base + bonus + stock"
                : "no publisher states a total",
          },
          {
            label: "Postings stating pay",
            value: String(companyRanges.length),
            detail: tracked
              ? `${tracked.openRoleCount} relevant open ${tracked.openRoleCount === 1 ? "role" : "roles"}`
              : "not in career monitoring",
          },
        ]}
      />

      {audit && (
        <p className="mb-6 border-l-2 border-warning bg-warning/[0.06] px-3 py-2.5 text-xs leading-5">
          {careerSourceAuditDetail(audit)}
        </p>
      )}

      <MonitoringSection slug={slug} />

      <h2 className="mb-1 text-sm font-semibold">Pay by location</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Figures are never blended across locations or across employer-official and
        crowdsourced publishers. A dash means that component was not published,
        not that it is zero.
      </p>

      {locationBlocks.length === 0 ? (
        <div className="mb-8 border-y border-foreground/10 py-12 text-center">
          <p className="text-sm font-medium">No salary evidence yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {presentation.detail}
          </p>
        </div>
      ) : (
        locationBlocks.map(([location, points]) => (
          <LocationSalaryTable
            key={location}
            location={location}
            points={points}
            sources={company.sources}
          />
        ))
      )}

      <PostedRoles ranges={companyRanges} />

      <LevelLadder slug={slug} />

      <section className="mb-8">
        <h2 className="mb-1 text-sm font-semibold">Employee opinion</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Editorial synthesis of linked public accounts. Never used for pay.
        </p>
        <div className="border-y border-foreground/10 py-4">
          <p className="text-xs text-foreground">{opinion.summary}</p>
          <p className="mt-2 text-[10px] text-muted-foreground">
            {opinion.score === null ? "Insufficient evidence" : `${opinion.score.toFixed(1)} / 5`}
            {" · "}
            {opinion.evidenceScope}
          </p>
        </div>
      </section>

      {company.sources.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold">Sources</h2>
          <div className="flex flex-col items-start gap-2">
            {company.sources.map((source) => (
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
      )}
    </PageShell>
  );
}
