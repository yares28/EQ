import { careerSourceAuditDetail, careerSourceAuditForSlug } from "./career-source-audits.ts";
import type { DecisionLocation } from "./salary-decision-context.ts";
import { isSpainCityLocation, salaryLocationForLabel } from "./salary-data.ts";
import type {
  Confidence,
  SalaryCompany,
  SalaryLevel,
  SalaryLocation,
  SalaryPoint,
  SalarySource,
} from "./salary-data";

const POSTED_LEVEL_LABELS: Record<SalaryLevel, string> = {
  intern: "Intern",
  junior: "SDE1",
  mid: "SDE2",
  senior: "Senior",
  staff: "Staff",
  principal: "Principal",
};

type PostedTargetLevel = Extract<SalaryLevel, "intern" | "junior" | "mid">;

export type CompanyResearchStatus =
  | "queued"
  | "discovering"
  | "monitoring"
  | "unsupported"
  | "failed";

export type CareerProvider = "greenhouse" | "lever" | "ashby" | "smartrecruiters" | "google_careers" | "workday" | "amazon_jobs" | "microsoft_careers" | "apple_careers" | "netflix_careers";

export function careerProviderLabel(provider: CareerProvider | undefined): string {
  if (provider === "google_careers") return "Google Careers";
  if (provider === "workday") return "Workday Careers";
  if (provider === "amazon_jobs") return "Amazon Jobs";
  if (provider === "microsoft_careers") return "Microsoft Careers";
  if (provider === "apple_careers") return "Apple Jobs";
  if (provider === "netflix_careers") return "Netflix Jobs";
  if (provider === "smartrecruiters") return "SmartRecruiters";
  if (provider === "greenhouse") return "Greenhouse";
  if (provider === "lever") return "Lever";
  if (provider === "ashby") return "Ashby";
  return "Public feed";
}

export interface TrackedCompanySummary {
  canonicalName: string;
  slug: string;
  researchStatus: CompanyResearchStatus;
  provider?: CareerProvider;
  lastCareerSyncAt?: number;
  researchRequestedAt?: number;
  careerSyncError?: string;
  discoveryAttempts?: number;
  openRoleCount: number;
}

export interface CompanyPostedRange {
  observationId?: string;
  company: string;
  companySlug: string;
  title: string;
  url: string;
  level: "intern" | "junior" | "mid" | "senior" | "staff" | "principal";
  location: string;
  locationLabel: string;
  currency: "EUR";
  period: "hour" | "month" | "year";
  rangeKind: "range" | "fixed" | "minimum" | "maximum";
  minimumAmount: number;
  maximumAmount: number;
  confidenceScore: number;
  checkedAt: number;
  source: string;
}

export interface CompanyResearchPresentation {
  label: string;
  detail: string;
  tone: "positive" | "active" | "muted" | "warning";
}

export const COMPANY_RESEARCH_RETRY_DELAY_MS = 6 * 60 * 60_000;
export const COMPANY_DISCOVERY_LEASE_MS = 30 * 60_000;
export const COMPANY_UNSUPPORTED_RETRY_DELAY_MS = 7 * 24 * 60 * 60_000;
/**
 * After this many discovery attempts a company is treated as having no readable
 * jobs feed at all, rather than one that has not been found yet. The companies
 * this catches run SuccessFactors, Taleo, iCIMS or a tenant-scoped Workday —
 * systems discovery cannot probe — so a weekly retry was work that could only
 * ever fail, presented to the reader as though it were still pending.
 */
export const COMPANY_DISCOVERY_ATTEMPT_LIMIT = 3;
export const COMPANY_UNTRACKABLE_RETRY_DELAY_MS = 30 * 24 * 60 * 60_000;

export function discoveryAttemptsExhausted(attempts: number | undefined): boolean {
  return (attempts ?? 0) >= COMPANY_DISCOVERY_ATTEMPT_LIMIT;
}

export function shouldAutomaticallyRetryCompanyResearch({
  status,
  lastAttemptAt,
  now,
  attempts,
}: {
  status: CompanyResearchStatus;
  lastAttemptAt?: number;
  now: number;
  /** Discovery attempts already spent; absent for companies queued before it was recorded. */
  attempts?: number;
}): boolean {
  if (status === "failed") {
    return (lastAttemptAt ?? 0) <= now - COMPANY_RESEARCH_RETRY_DELAY_MS;
  }
  if (status === "discovering") {
    return (lastAttemptAt ?? 0) <= now - COMPANY_DISCOVERY_LEASE_MS;
  }
  if (status === "unsupported") {
    const delay = discoveryAttemptsExhausted(attempts)
      ? COMPANY_UNTRACKABLE_RETRY_DELAY_MS
      : COMPANY_UNSUPPORTED_RETRY_DELAY_MS;
    return (lastAttemptAt ?? 0) <= now - delay;
  }
  return status === "queued";
}

export function postedSalaryLocation(range: CompanyPostedRange): SalaryLocation {
  return salaryLocationForLabel(range.locationLabel);
}

/**
 * A Spain-wide employer posting applies to any Spanish city, since the employer
 * stated no city restriction. A city-scoped figure never satisfies a different
 * city, and Remote matches only postings explicitly published as remote.
 */
export function decisionLocationMatches(
  pointLocation: SalaryLocation,
  filter: DecisionLocation,
): boolean {
  if (pointLocation === "EU benchmark" || pointLocation === "Unknown") return false;
  if (filter === pointLocation) return true;
  if (filter === "Remote") {
    return pointLocation === "Remote Spain/EU";
  }
  return pointLocation === "Spain-wide" && isSpainCityLocation(filter);
}

export function postedLocationMatches(
  range: CompanyPostedRange,
  location: DecisionLocation,
): boolean {
  if (location === "Remote") {
    return (
      range.locationLabel === "Remote Spain" ||
      range.locationLabel === "Remote Spain / EU"
    );
  }
  if (range.locationLabel === "Spain-wide") return true;
  return range.locationLabel === location;
}

function rangeUsefulness(range: CompanyPostedRange): number {
  return (
    (range.period === "year" ? 4 : 0) +
    (range.rangeKind === "range" ? 2 : 0) +
    (range.rangeKind === "fixed" ? 1 : 0)
  );
}

export function selectAnyPostedRange({
  ranges,
  companySlug,
  location,
}: {
  ranges: CompanyPostedRange[];
  companySlug: string;
  location: DecisionLocation;
}): CompanyPostedRange | null {
  return (
    ranges
      .filter(
        (range) =>
          range.companySlug === companySlug &&
          postedLocationMatches(range, location),
      )
      .slice()
      .sort(
        (left, right) =>
          rangeUsefulness(right) - rangeUsefulness(left) ||
          right.confidenceScore - left.confidenceScore ||
          right.checkedAt - left.checkedAt,
      )[0] ?? null
  );
}

export function selectPostedRange({
  ranges,
  companySlug,
  targetLevel,
  location,
}: {
  ranges: CompanyPostedRange[];
  companySlug: string;
  targetLevel: PostedTargetLevel;
  location: DecisionLocation;
}): CompanyPostedRange | null {
  return (
    ranges
      .filter(
        (range) =>
          range.companySlug === companySlug &&
          range.level === targetLevel &&
          postedLocationMatches(range, location),
      )
      .slice()
      .sort(
        (left, right) =>
          rangeUsefulness(right) - rangeUsefulness(left) ||
          right.confidenceScore - left.confidenceScore ||
          right.checkedAt - left.checkedAt,
      )[0] ?? null
  );
}

function postedConfidence(score: number): Confidence {
  const normalized = score > 1 ? score / 100 : score;
  if (normalized >= 0.9) return "High";
  if (normalized >= 0.7) return "Medium";
  return "Low";
}

/** Hourly postings stay visible as ranges but cannot be ranked as annual pay. */
export function annualizedPostedAmountEur(range: CompanyPostedRange): number | null {
  if (range.period === "hour") return null;
  const representative =
    range.rangeKind === "range"
      ? (range.minimumAmount + range.maximumAmount) / 2
      : range.rangeKind === "maximum"
        ? range.maximumAmount
        : range.minimumAmount;
  const annual = range.period === "month" ? representative * 12 : representative;
  return Number.isFinite(annual) ? Math.round(annual) : null;
}

export function salaryPointFromPostedRange(range: CompanyPostedRange): SalaryPoint | null {
  const baseEur = annualizedPostedAmountEur(range);
  if (baseEur === null) return null;
  const level = range.level;
  const location = postedSalaryLocation(range);
  const factor = range.period === "month" ? 12 : 1;
  const sourceId = `posted:${range.observationId ?? range.url}`;
  return {
    id: sourceId,
    level,
    levelLabel: POSTED_LEVEL_LABELS[level],
    companyLevel: range.title,
    location,
    locationLabel: range.locationLabel,
    // An employer posting states base pay. Bonus and equity stay unknown, so
    // there is no defensible total to compare against sourced total figures.
    totalCompEur: null,
    baseEur,
    baseMinEur: Math.round(range.minimumAmount * factor),
    baseMaxEur: Math.round(range.maximumAmount * factor),
    bonusEur: null,
    equityEur: null,
    extrasEur: null,
    confidence: postedConfidence(range.confidenceScore),
    confidenceNote:
      "Employer-posted base on a public career page. Bonus and equity stay unknown unless the posting stated them.",
    sourceIds: [sourceId],
    notes: `${range.rangeKind} · ${range.period} · ${range.source}`,
  };
}

function postedSource(range: CompanyPostedRange): SalarySource {
  return {
    id: `posted-source:${range.url}`,
    label: range.title,
    url: range.url,
    publisher: range.source,
    checkedAt: new Date(range.checkedAt).toISOString().slice(0, 10),
  };
}

function selectPostedRangesForCompany(
  ranges: CompanyPostedRange[],
  companySlug: string,
): CompanyPostedRange[] {
  const best = new Map<string, CompanyPostedRange>();
  for (const range of ranges) {
    if (range.companySlug !== companySlug) continue;
    const key = `${range.level}:${range.locationLabel}`;
    const current = best.get(key);
    if (
      current === undefined ||
      rangeUsefulness(range) > rangeUsefulness(current) ||
      (rangeUsefulness(range) === rangeUsefulness(current) &&
        (range.confidenceScore > current.confidenceScore ||
          (range.confidenceScore === current.confidenceScore &&
            range.checkedAt > current.checkedAt)))
    ) {
      best.set(key, range);
    }
  }
  return [...best.values()];
}

function postedEvidenceForCompany(
  ranges: CompanyPostedRange[],
  companySlug: string,
): { points: SalaryPoint[]; sources: SalarySource[] } {
  const selected = selectPostedRangesForCompany(ranges, companySlug);
  const points = selected.flatMap((range) => {
    const point = salaryPointFromPostedRange(range);
    return point ? [point] : [];
  });
  const sources = selected.map(postedSource);
  return { points, sources };
}

function isoDate(timestamp: number | undefined): string {
  return timestamp === undefined ? "—" : new Date(timestamp).toISOString().slice(0, 10);
}

function pointKey(point: SalaryPoint): string {
  return `${point.level}:${point.location}`;
}

function companyFromCareerPages({
  canonicalName,
  slug,
  companyType,
  tracked,
  postedRanges,
  fallbackSalaryPoints = [],
  fallbackSources = [],
}: {
  canonicalName: string;
  slug: string;
  companyType: SalaryCompany["companyType"];
  tracked: TrackedCompanySummary | null;
  postedRanges: CompanyPostedRange[];
  fallbackSalaryPoints?: SalaryPoint[];
  fallbackSources?: SalarySource[];
}): SalaryCompany {
  const posted = postedEvidenceForCompany(postedRanges, slug);
  const postedKeys = new Set(posted.points.map(pointKey));
  const fallbackPoints = fallbackSalaryPoints.filter(
    (point) => point.totalCompEur !== null && !postedKeys.has(pointKey(point)),
  );
  const fallbackSourceIds = new Set(fallbackPoints.flatMap((point) => point.sourceIds));
  const leftoverSources = fallbackSources.filter((source) => fallbackSourceIds.has(source.id));
  const points = [...posted.points, ...fallbackPoints];
  const sources = [...posted.sources, ...leftoverSources];
  const locations = [...new Set(points.map((point) => point.location))];
  const companyRanges = postedRanges.filter((range) => range.companySlug === slug);
  const latestPosted = companyRanges.reduce(
    (latest, range) => Math.max(latest, range.checkedAt),
    0,
  );
  const presentation = companyResearchPresentation(tracked);
  const researchedAt =
    latestPosted > 0
      ? isoDate(latestPosted)
      : isoDate(tracked?.lastCareerSyncAt ?? tracked?.researchRequestedAt);
  const noPayNote = tracked
    ? `${presentation.label}. ${presentation.detail}. No qualifying Spain salary on the current public postings.`
    : "No qualifying Spain salary on a public career page.";
  const researchNotes = posted.points.length > 0 && fallbackPoints.length > 0
    ? "Employer-posted career-page ranges come first. Public salary-page figures fill only levels the jobs page does not disclose."
    : posted.points.length > 0
      ? "Pay figures are employer-posted base ranges from the public career page."
      : fallbackPoints.length > 0
        ? tracked
          ? `${presentation.label}. ${presentation.detail}. No qualifying Spain salary on the current public postings; figures below are from sourced public salary pages.`
          : "No qualifying Spain salary on a public career page; figures below are from sourced public salary pages."
        : noPayNote;
  return {
    canonicalName,
    slug,
    companyType,
    locationAvailability: locations.length > 0 ? locations : ["Unknown"],
    lastResearchedAt: researchedAt,
    sources,
    salaryPoints: points,
    researchNotes,
  };
}

export function companyResearchPresentation(
  company: TrackedCompanySummary | null,
): CompanyResearchPresentation {
  if (company === null) {
    return {
      label: "Salary catalog",
      detail: "Not in automatic career monitoring",
      tone: "muted",
    };
  }
  if (company.researchStatus === "queued") {
    return {
      label: "Research queued",
      detail: "Waiting for automatic free-feed discovery",
      tone: "active",
    };
  }
  if (company.researchStatus === "discovering") {
    return {
      label: "Discovering",
      detail: "Checking exact company matches on free career feeds",
      tone: "active",
    };
  }
  if (company.researchStatus === "monitoring" && company.careerSyncError) {
    return {
      label: "Refresh delayed",
      detail: company.lastCareerSyncAt
        ? "Last verified data is preserved while the free feed retries"
        : "First complete career-feed sync is still pending",
      tone: "warning",
    };
  }
  if (company.researchStatus === "monitoring") {
    return {
      label: "Monitoring",
      detail: company.lastCareerSyncAt
        ? `${company.openRoleCount} relevant open ${company.openRoleCount === 1 ? "role" : "roles"} · ${careerProviderLabel(company.provider)}`
        : `${careerProviderLabel(company.provider)} linked · first sync pending`,
      tone: "positive",
    };
  }
  if (company.researchStatus === "unsupported") {
    const audit = careerSourceAuditForSlug(company.slug);
    // A company that has spent its attempts is not waiting for anything. Saying
    // "retries weekly" invited the reader to keep waiting; the pay figures for
    // these companies come from research, not from their jobs feed, so the
    // label has to separate "not found yet" from "will not be found".
    if (discoveryAttemptsExhausted(company.discoveryAttempts)) {
      return {
        label: "Not automatically trackable",
        detail: audit === null
          ? "No readable jobs feed · open roles are not tracked, salary is still researched"
          : careerSourceAuditDetail(audit, "open roles are not tracked, salary is still researched"),
        tone: "muted",
      };
    }
    return {
      label: "No supported free feed",
      detail: audit === null
        ? "No exact free-feed match was found · discovery retries weekly"
        : careerSourceAuditDetail(audit),
      tone: "muted",
    };
  }
  return {
    label: "Needs retry",
    detail: "Automatic research will retry without another paste",
    tone: "warning",
  };
}

export function buildCompanyResearchCatalog({
  baseCompanies,
  trackedCompanies,
  postedRanges,
}: {
  baseCompanies: SalaryCompany[];
  trackedCompanies: TrackedCompanySummary[];
  postedRanges: CompanyPostedRange[];
}): SalaryCompany[] {
  const trackedBySlug = new Map(trackedCompanies.map((company) => [company.slug, company]));
  const baseSlugs = new Set(baseCompanies.map((company) => company.slug));
  const fromBase = baseCompanies.map((company) =>
    companyFromCareerPages({
      canonicalName: company.canonicalName,
      slug: company.slug,
      companyType: company.companyType,
      tracked: trackedBySlug.get(company.slug) ?? null,
      postedRanges,
      fallbackSalaryPoints: company.salaryPoints,
      fallbackSources: company.sources,
    }),
  );
  const trackedOnly = trackedCompanies
    .filter((company) => !baseSlugs.has(company.slug))
    .map((company) =>
      companyFromCareerPages({
        canonicalName: company.canonicalName,
        slug: company.slug,
        companyType: "Other",
        tracked: company,
        postedRanges,
      }),
    );
  return [...fromBase, ...trackedOnly];
}
