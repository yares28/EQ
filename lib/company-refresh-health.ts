/**
 * Whether a monitored company's data is still current.
 *
 * The scheduled sweep refreshes each monitored company several times a day. If
 * it stalls — a feed breaks, the fleet outgrows the sweep — the pages would
 * keep showing older roles and pay with no outward sign. This rule is the
 * backstop that turns that silence into a visible state, and it is shared by
 * the Convex cron and the UI so both agree on what "overdue" means.
 */

export const COMPANY_REFRESH_STALE_AFTER_MS = 24 * 60 * 60_000;

export type CompanyRefreshState = "current" | "overdue" | "never";

export interface CompanyRefreshHealth {
  state: CompanyRefreshState;
  /** Whole hours since the last successful sync; null when there has never been one. */
  hoursSinceSync: number | null;
  label: string;
}

export function companyRefreshHealth({
  lastCareerSyncAt,
  now,
}: {
  lastCareerSyncAt: number | undefined;
  now: number;
}): CompanyRefreshHealth {
  if (lastCareerSyncAt === undefined) {
    return {
      state: "never",
      hoursSinceSync: null,
      label: "No completed sync yet",
    };
  }

  const elapsed = Math.max(0, now - lastCareerSyncAt);
  const hoursSinceSync = Math.floor(elapsed / 36e5);
  if (elapsed > COMPANY_REFRESH_STALE_AFTER_MS) {
    return {
      state: "overdue",
      hoursSinceSync,
      label: `Refresh overdue · ${hoursSinceSync}h since last sync`,
    };
  }

  return {
    state: "current",
    hoursSinceSync,
    label:
      hoursSinceSync < 1
        ? "Refreshed under an hour ago"
        : `Refreshed ${hoursSinceSync}h ago`,
  };
}

/**
 * Refreshes a company is expected to receive per day, given the sweep cadence
 * and how many companies share it. Falling below 1 means the daily guarantee
 * cannot be met by throughput alone.
 */
export function dailyRefreshCapacityPerCompany({
  monitoredCompanies,
  sweepIntervalMinutes,
  companiesPerSweep,
}: {
  monitoredCompanies: number;
  sweepIntervalMinutes: number;
  companiesPerSweep: number;
}): number {
  if (monitoredCompanies <= 0) return Number.POSITIVE_INFINITY;
  const sweepsPerDay = (24 * 60) / sweepIntervalMinutes;
  return (sweepsPerDay * companiesPerSweep) / monitoredCompanies;
}
