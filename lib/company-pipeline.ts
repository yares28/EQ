import type { CompanyCatalogPoint, TrackedCompanySummary } from "./company-research-catalog.ts";
import { discoveryAttemptsExhausted } from "./company-research-catalog.ts";
import { requiredSalaryLevels } from "./salary-data.ts";

/**
 * The company pipeline, as three lists that each mean one thing.
 *
 * One list used to stand for all of this — "tracked, still being researched" —
 * filtered by whichever level the salary table happened to be showing. That
 * made it read 31 companies at Intern and 24 at SDE1 from identical data, and
 * it hid the fact that three different things were pending, each needing a
 * different fix: pay nobody has researched, a careers page nobody has found,
 * and pay that was researched once and never checked again.
 *
 * These are pure selectors over data the catalog already subscribes to, so
 * naming the three costs no extra queries.
 */

/** A figure is re-verified after this long. Salary pages move slowly; a shorter
 *  window would spend research effort confirming numbers that had not changed. */
export const SALARY_RECHECK_AFTER_MS = 30 * 24 * 60 * 60_000;

export interface PipelineCompany {
  canonicalName: string;
  slug: string;
  /** Levels with no figure on file. Only ever `intern` / `junior` / `mid`. */
  missingLevels: string[];
  researchStatus: TrackedCompanySummary["researchStatus"];
  /** True once discovery has spent its attempts — needs a person, not a retry. */
  untrackable: boolean;
}

export interface StaleFigure {
  companySlug: string;
  canonicalName: string;
  level: string;
  researchedAt: number;
  ageDays: number;
}

export interface CompanyPipeline {
  /** Companies with no pay figure at a level you decide on. */
  payQueue: PipelineCompany[];
  /** Companies whose careers page has not been found yet. */
  reviewList: PipelineCompany[];
  /** Figures old enough to be worth re-reading. */
  recheck: StaleFigure[];
}

function activeCompanies(tracked: TrackedCompanySummary[]): TrackedCompanySummary[] {
  return [...tracked].sort((left, right) =>
    left.canonicalName.localeCompare(right.canonicalName),
  );
}

function toPipelineCompany(
  company: TrackedCompanySummary,
  missingLevels: string[],
): PipelineCompany {
  return {
    canonicalName: company.canonicalName,
    slug: company.slug,
    missingLevels,
    researchStatus: company.researchStatus,
    untrackable:
      company.researchStatus === "unsupported" &&
      discoveryAttemptsExhausted(company.discoveryAttempts),
  };
}

/**
 * Splits the levels a company is missing into the ones a pass already searched
 * for and found nothing at, and the ones nobody has looked for yet.
 *
 * The distinction is the whole difference between a backlog and a blur. The
 * catalog stores figures, so a level correctly left empty — levels.fyi locks
 * that country page, the employer publishes no band, the only figure belongs
 * to no level — is indistinguishable from a level nobody has opened. Told
 * apart, a 74-company queue is a handful of dead ends and a list of real leads.
 */
export function splitSearchedLevels<Level extends string>(
  missingLevels: readonly Level[],
  checks: readonly { level: string }[],
): { checkedEmptyLevels: Level[]; unsearchedLevels: Level[] } {
  const searched = new Set(checks.map((check) => check.level));
  return {
    checkedEmptyLevels: missingLevels.filter((level) => searched.has(level)),
    unsearchedLevels: missingLevels.filter((level) => !searched.has(level)),
  };
}

export function buildCompanyPipeline({
  trackedCompanies,
  catalogPoints,
  now,
}: {
  trackedCompanies: TrackedCompanySummary[];
  catalogPoints: CompanyCatalogPoint[];
  now: number;
}): CompanyPipeline {
  const levelsBySlug = new Map<string, Set<string>>();
  for (const point of catalogPoints) {
    const levels = levelsBySlug.get(point.companySlug) ?? new Set<string>();
    levels.add(point.level);
    levelsBySlug.set(point.companySlug, levels);
  }

  const payQueue: PipelineCompany[] = [];
  const reviewList: PipelineCompany[] = [];

  for (const company of activeCompanies(trackedCompanies)) {
    const covered = levelsBySlug.get(company.slug) ?? new Set<string>();
    // Deliberately independent of whichever level the table is showing: a
    // company either has the evidence to decide on or it does not.
    const missingLevels = requiredSalaryLevels.filter((level) => !covered.has(level));
    if (missingLevels.length > 0) {
      payQueue.push(toPipelineCompany(company, [...missingLevels]));
    }
    // "Monitoring" means a careers feed was found and the cron owns it. Every
    // other state means nothing is reading this company's roles.
    if (company.researchStatus !== "monitoring") {
      reviewList.push(toPipelineCompany(company, [...missingLevels]));
    }
  }

  const nameBySlug = new Map(
    trackedCompanies.map((company) => [company.slug, company.canonicalName]),
  );
  const recheck = catalogPoints
    .filter((point) => point.researchedAt <= now - SALARY_RECHECK_AFTER_MS)
    .map((point) => ({
      companySlug: point.companySlug,
      canonicalName: nameBySlug.get(point.companySlug) ?? point.companySlug,
      level: point.level,
      researchedAt: point.researchedAt,
      ageDays: Math.floor((now - point.researchedAt) / 86_400_000),
    }))
    // Oldest first: that is the order they are worth re-reading in.
    .sort((left, right) => left.researchedAt - right.researchedAt);

  return { payQueue, reviewList, recheck };
}
