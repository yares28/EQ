import { researchSourceRegistry } from "./source-registry.ts";

/**
 * Operational contracts for the research sources.
 *
 * Two failure modes are invisible without them. A source can be registered and
 * never refreshed, because nothing links it to a scheduled job. And a source
 * can be refreshed less often than its own declared cadence, so it is stale by
 * construction. Both are checked here against the registry rather than left to
 * be noticed in production.
 */

export interface CronContract {
  /** Must match the cron name registered in `convex/crons.ts`. */
  cronName: string;
  intervalHours: number;
  sourceKeys: string[];
}

export const CRON_CONTRACTS: CronContract[] = [
  {
    cronName: "refresh monitored company career boards",
    intervalHours: 0.5,
    sourceKeys: [
      "greenhouse-job-board",
      "lever-postings",
      "ashby-job-postings",
      "smartrecruiters-posting-api",
      "google-careers-public-jobs",
      "workday-public-jobs",
      "amazon-jobs-public-search",
      "microsoft-careers-public-search",
      "apple-careers-public-search",
      "netflix-careers-public-search",
    ],
  },
  {
    cronName: "refresh official Spain salary market anchors",
    intervalHours: 12,
    sourceKeys: ["eurostat-earnings"],
  },
  {
    cronName: "refresh official Madrid salary and housing context",
    intervalHours: 24,
    sourceKeys: ["ine-open-data", "madrid-open-data-rent", "serpavi-rent"],
  },
  {
    cronName: "refresh official Madrid and Valencia living-cost references",
    intervalHours: 24,
    sourceKeys: [
      "ine-household-budget-madrid",
      "ine-household-budget-valencia",
      "crtm-fares-2026",
      "emt-valencia-fares-2026",
      "aeat-declared-rent-2024",
    ],
  },
  {
    cronName: "validate official Spain payroll model",
    intervalHours: 24,
    sourceKeys: ["aeat-withholding-2026", "tgss-contribution-tables-2026"],
  },
];

/**
 * Registered sources that are deliberately not on a schedule, with the reason.
 * Listing them keeps "unscheduled" a decision rather than an omission.
 */
export const UNSCHEDULED_SOURCES: { key: string; reason: string }[] = [
  {
    key: "esco-occupations",
    reason: "A stable occupation taxonomy read at classification time, not a changing feed.",
  },
  {
    key: "ecb-fx",
    reason: "Read on demand when a non-EUR figure must be converted; no stored series to refresh.",
  },
  {
    key: "gleif-entity-api",
    reason: "Read on demand during company identity resolution rather than on a schedule.",
  },
  {
    key: "cnmv-filings",
    reason: "Manual release check; filings are consulted per company, not swept.",
  },
];

export interface CronContractViolation {
  kind: "unscheduled_source" | "unknown_source" | "cadence_too_slow" | "duplicate_schedule";
  detail: string;
}

export function verifyCronContracts(): CronContractViolation[] {
  const violations: CronContractViolation[] = [];
  const registryKeys = new Set(researchSourceRegistry.map((source) => source.key));
  const scheduled = new Map<string, string>();

  for (const contract of CRON_CONTRACTS) {
    for (const key of contract.sourceKeys) {
      if (!registryKeys.has(key)) {
        violations.push({
          kind: "unknown_source",
          detail: `"${contract.cronName}" refreshes "${key}", which is not in the source registry.`,
        });
        continue;
      }
      const existing = scheduled.get(key);
      if (existing !== undefined) {
        violations.push({
          kind: "duplicate_schedule",
          detail: `"${key}" is scheduled by both "${existing}" and "${contract.cronName}".`,
        });
        continue;
      }
      scheduled.set(key, contract.cronName);
      const source = researchSourceRegistry.find((entry) => entry.key === key);
      if (source !== undefined && contract.intervalHours > source.refreshCadenceHours) {
        violations.push({
          kind: "cadence_too_slow",
          detail: `"${key}" declares a ${source.refreshCadenceHours}h cadence but "${contract.cronName}" runs every ${contract.intervalHours}h.`,
        });
      }
    }
  }

  const exempt = new Set(UNSCHEDULED_SOURCES.map((entry) => entry.key));
  for (const source of researchSourceRegistry) {
    if (scheduled.has(source.key) || exempt.has(source.key)) continue;
    violations.push({
      kind: "unscheduled_source",
      detail: `"${source.key}" is registered but no cron refreshes it and it is not recorded as deliberately unscheduled.`,
    });
  }

  return violations;
}

/**
 * Retention limits for the append-only research tables.
 *
 * Snapshots and run records exist to make a published figure reproducible and
 * to explain a refresh failure. Neither purpose needs unbounded history, but
 * pruning must never remove a snapshot a live observation still cites, so the
 * limits below are floors that a prune job checks references against.
 */
export interface RetentionRule {
  table: string;
  keepDays: number;
  minimumKeptPerParent: number;
  rationale: string;
}

export const RETENTION_RULES: RetentionRule[] = [
  {
    table: "rawSnapshots",
    keepDays: 180,
    minimumKeptPerParent: 1,
    rationale:
      "Six months covers the longest source refresh window in the registry, and the newest snapshot per source is always kept so every live observation stays reproducible.",
  },
  {
    table: "sourceRuns",
    keepDays: 90,
    minimumKeptPerParent: 20,
    rationale:
      "Run history explains recent refresh failures; a quarter is enough to see a recurring outage without retaining every attempt forever.",
  },
  {
    table: "jobPostingVersions",
    keepDays: 365,
    minimumKeptPerParent: 2,
    rationale:
      "A year of posting history supports change detection and salary replay, and the two newest versions per posting are always kept so a diff remains possible.",
  },
];

export function retentionRule(table: string): RetentionRule | null {
  return RETENTION_RULES.find((rule) => rule.table === table) ?? null;
}

export type SourceOperatorState =
  | "current"
  | "aging"
  | "stale"
  | "never_succeeded"
  | "disabled";

export interface SourceHealthInput {
  key: string;
  name: string;
  category: string;
  enabled: boolean;
  health: string;
  consecutiveFailures: number;
  lastAttemptedAt: number | null;
  lastSuccessfulAt: number | null;
  maxStalenessMs: number;
}

export interface SourceHealthRow {
  key: string;
  name: string;
  category: string;
  state: SourceOperatorState;
  ageMs: number | null;
  consecutiveFailures: number;
  blocksRelease: boolean;
  note: string;
}

export interface SourceHealthSummary {
  checkedAt: number;
  total: number;
  current: number;
  aging: number;
  stale: number;
  neverSucceeded: number;
  disabled: number;
  blockingKeys: string[];
  releaseReady: boolean;
  headline: string;
  rows: SourceHealthRow[];
}

/** A source is called aging once it passes this share of its staleness window. */
const AGING_THRESHOLD = 0.75;

function isDeliberatelyUnscheduled(key: string): boolean {
  return UNSCHEDULED_SOURCES.some((entry) => entry.key === key);
}

function classify(source: SourceHealthInput, now: number): SourceHealthRow {
  const base = {
    key: source.key,
    name: source.name,
    category: source.category,
    consecutiveFailures: source.consecutiveFailures,
  };
  if (!source.enabled) {
    return {
      ...base,
      state: "disabled",
      ageMs: null,
      blocksRelease: false,
      note: "Disabled in the registry; it publishes nothing and blocks nothing.",
    };
  }
  if (source.lastSuccessfulAt === null) {
    const onDemand = isDeliberatelyUnscheduled(source.key);
    const neverAttempted = source.lastAttemptedAt === null;
    return {
      ...base,
      state: "never_succeeded",
      ageMs: null,
      blocksRelease: !onDemand && !neverAttempted,
      note: onDemand && neverAttempted
        ? "Read on demand; no scheduled refresh is expected."
        : neverAttempted
          ? "Never attempted."
          : `Attempted but never succeeded, after ${source.consecutiveFailures} consecutive ${source.consecutiveFailures === 1 ? "failure" : "failures"}.`,
    };
  }
  const ageMs = Math.max(0, now - source.lastSuccessfulAt);
  if (ageMs > source.maxStalenessMs || source.health !== "healthy") {
    return {
      ...base,
      state: "stale",
      ageMs,
      blocksRelease: true,
      note: ageMs > source.maxStalenessMs
        ? "Past its staleness window; anything it feeds is locked until it refreshes."
        : `Reporting health "${source.health}" despite a recent success.`,
    };
  }
  if (ageMs > source.maxStalenessMs * AGING_THRESHOLD) {
    return {
      ...base,
      state: "aging",
      ageMs,
      blocksRelease: false,
      note: "Inside its window but approaching the staleness limit.",
    };
  }
  return {
    ...base,
    state: "current",
    ageMs,
    blocksRelease: false,
    note: "Refreshed within its window.",
  };
}

export function summarizeSourceHealth(
  sources: readonly SourceHealthInput[],
  now: number,
): SourceHealthSummary {
  const rows = sources
    .map((source) => classify(source, now))
    .sort(
      (left, right) =>
        Number(right.blocksRelease) - Number(left.blocksRelease) ||
        left.key.localeCompare(right.key),
    );
  const count = (state: SourceOperatorState) =>
    rows.filter((row) => row.state === state).length;
  const blockingKeys = rows.filter((row) => row.blocksRelease).map((row) => row.key);
  const aging = count("aging");

  return {
    checkedAt: now,
    rows,
    total: rows.length,
    current: count("current"),
    aging,
    stale: count("stale"),
    neverSucceeded: count("never_succeeded"),
    disabled: count("disabled"),
    blockingKeys,
    releaseReady: blockingKeys.length === 0,
    headline: blockingKeys.length === 0
      ? aging === 0
        ? `All ${rows.length} sources refreshed within their windows.`
        : `All ${rows.length} sources are inside their windows; ${aging} ${aging === 1 ? "is" : "are"} approaching the staleness limit.`
      : `${blockingKeys.length} of ${rows.length} ${blockingKeys.length === 1 ? "source is" : "sources are"} stale or failing: ${blockingKeys.join(", ")}.`,
  };
}
