import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "discover queued company career boards",
  { minutes: 15 },
  internal.careerResearch.dispatchQueued,
);

crons.interval(
  "refresh monitored company career boards",
  { hours: 4 },
  internal.careerResearch.refreshMonitored,
);

crons.interval(
  "flag monitored companies that missed their daily refresh",
  { hours: 6 },
  internal.companyResearch.flagStaleCompanies,
);

crons.interval(
  "reconcile employer-posted salaries from job snapshots",
  { hours: 6 },
  internal.companySalaryResearch.backfillCurrent,
  { limit: 500 },
);

crons.interval(
  "refresh official Spain salary market anchors",
  { hours: 12 },
  internal.salaryMarketResearch.refreshEurostat,
);

crons.interval(
  "refresh official Madrid salary and housing context",
  { hours: 24 },
  internal.cityContextResearch.refreshOfficialMadridContext,
);

crons.interval(
  "refresh official Madrid and Valencia living-cost references",
  { hours: 24 },
  internal.madridCostResearch.refreshSpainCityLivingCosts,
);

crons.interval(
  "validate official Spain payroll model",
  { hours: 24 },
  internal.payrollResearch.refreshSpainPayrollModel,
);

crons.daily(
  "ensure salary companies are queued for monitoring",
  { hourUTC: 1, minuteUTC: 7 },
  internal.companyResearch.ensureKnownSalaryCompanies,
);

// One job per table, staggered. Sharing a transaction meant the snapshot pass
// exceeding the 16 MB read limit rolled back the other two, so the whole
// retention system was down rather than one third of it. Snapshots carry raw
// payloads and get a much smaller batch than the row-shaped tables.
crons.daily(
  "prune expired job posting versions",
  { hourUTC: 3, minuteUTC: 20 },
  internal.retention.pruneVersions,
  { limit: 500 },
);

crons.daily(
  "prune expired raw snapshots",
  { hourUTC: 3, minuteUTC: 35 },
  internal.retention.pruneSnapshots,
  {},
);

crons.daily(
  "prune expired source runs",
  { hourUTC: 3, minuteUTC: 50 },
  internal.retention.pruneRuns,
  { limit: 500 },
);

export default crons;
