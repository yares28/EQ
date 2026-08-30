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

crons.daily(
  "prune research history past its retention limit",
  { hourUTC: 3, minuteUTC: 20 },
  internal.retention.prune,
  { limit: 500 },
);

export default crons;
