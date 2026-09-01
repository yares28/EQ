import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

import {
  parseCompanyPostedSalary,
  type PostedSalaryParseResult,
} from "../lib/company-posted-salary";

export const COMPANY_POSTED_SALARY_PARSER_VERSION = "company-posted-salary-v5";

export interface ReconcileCompanyPostedSalaryArgs {
  companyId: Id<"companies">;
  sourceId: Id<"sourceRegistry">;
  snapshotId: Id<"rawSnapshots">;
  postingId: Id<"jobPostings">;
  externalId: string;
  canonicalUrl: string;
  title: string;
  locations: string[];
  salaryText?: string;
  state: "active" | "closed" | "removed" | "unknown";
  observedAt: number;
}

type ReconcileState = "accepted" | "quarantined" | "withdrawn" | "none";

/**
 * Exported so a replay preview can predict a rewrite with the writer's own
 * equality rule; a preview that drifts from the writer would be misleading.
 */
export function sameObservation(
  observation: {
    status: string;
    rawSalaryText?: string;
    occupationKey: string;
    canonicalLevel: string;
    countryCode: string;
    cityKey?: string;
    currency: string;
    period: string;
    rangeKind?: string;
    baseMinAmount?: number;
    baseMaxAmount?: number;
  },
  result: PostedSalaryParseResult,
  salaryText: string,
): boolean {
  return observation.status === (result.accepted ? "accepted" : "quarantined") &&
    observation.rawSalaryText === salaryText &&
    observation.occupationKey === result.occupationKey &&
    observation.canonicalLevel === result.canonicalLevel &&
    observation.countryCode === result.countryCode &&
    observation.cityKey === result.cityKey &&
    observation.currency === result.currency &&
    observation.period === result.period &&
    observation.rangeKind === result.rangeKind &&
    observation.baseMinAmount === result.minimumAmount &&
    observation.baseMaxAmount === result.maximumAmount;
}

export async function withdrawCompanyPostedSalary(
  ctx: MutationCtx,
  postingId: Id<"jobPostings">,
  observedAt: number,
): Promise<number> {
  const current = await ctx.db
    .query("salaryObservations")
    .withIndex("by_posting_status", (q) => q.eq("postingId", postingId))
    .collect();
  let withdrawn = 0;
  for (const observation of current) {
    if (observation.status !== "accepted" && observation.status !== "quarantined") continue;
    await ctx.db.patch(observation._id, {
      status: "withdrawn",
      effectiveTo: observedAt,
    });
    withdrawn += 1;
  }
  return withdrawn;
}

export async function reconcileCompanyPostedSalary(
  ctx: MutationCtx,
  args: ReconcileCompanyPostedSalaryArgs,
): Promise<{ state: ReconcileState; changed: boolean; rejectionReasons: string[] }> {
  const salaryText = args.salaryText?.trim();
  if (args.state !== "active" || !salaryText) {
    const withdrawn = await withdrawCompanyPostedSalary(ctx, args.postingId, args.observedAt);
    return {
      state: withdrawn > 0 ? "withdrawn" : "none",
      changed: withdrawn > 0,
      rejectionReasons: [],
    };
  }

  const company = await ctx.db.get(args.companyId);
  const parsed = parseCompanyPostedSalary({
    title: args.title,
    locations: args.locations,
    salaryText,
    companySlug: company?.slug,
  });
  const current = await ctx.db
    .query("salaryObservations")
    .withIndex("by_posting_status", (q) => q.eq("postingId", args.postingId))
    .collect();
  const active = current.filter(
    (observation) => observation.status === "accepted" || observation.status === "quarantined",
  );
  const matching = active.find((observation) => sameObservation(observation, parsed, salaryText));

  if (matching) {
    await ctx.db.patch(matching._id, {
      snapshotId: args.snapshotId,
      canonicalUrl: args.canonicalUrl,
      rawLocation: parsed.rawLocation,
      parserVersion: COMPANY_POSTED_SALARY_PARSER_VERSION,
      observedAt: args.observedAt,
      confidenceScore: parsed.confidenceScore,
      confidenceBand: parsed.confidenceBand,
      qualityFlags: [
        ...parsed.qualityFlags,
        ...parsed.rejectionReasons.map((reason) => `quarantine:${reason}`),
      ],
    });
    return {
      state: parsed.accepted ? "accepted" : "quarantined",
      changed: false,
      rejectionReasons: parsed.rejectionReasons,
    };
  }

  for (const observation of active) {
    await ctx.db.patch(observation._id, {
      status: "superseded",
      effectiveTo: args.observedAt,
    });
  }

  const minimum = parsed.minimumAmount;
  const maximum = parsed.maximumAmount;
  const baseAmount = minimum === undefined
    ? undefined
    : maximum === undefined
      ? minimum
      : Math.round((minimum + maximum) / 2);
  await ctx.db.insert("salaryObservations", {
    companyId: args.companyId,
    sourceId: args.sourceId,
    snapshotId: args.snapshotId,
    postingId: args.postingId,
    externalId: args.externalId,
    canonicalUrl: args.canonicalUrl,
    rawSalaryText: salaryText.slice(0, 500),
    parserVersion: COMPANY_POSTED_SALARY_PARSER_VERSION,
    occupationKey: parsed.occupationKey,
    canonicalLevel: parsed.canonicalLevel,
    rawLevel: parsed.rawLevel,
    countryCode: parsed.countryCode,
    cityKey: parsed.cityKey,
    rawLocation: parsed.rawLocation,
    currency: parsed.currency,
    period: parsed.period,
    rangeKind: parsed.rangeKind,
    baseMinAmount: minimum,
    baseMaxAmount: maximum,
    baseAmount,
    observedAt: args.observedAt,
    effectiveFrom: args.observedAt,
    confidenceScore: parsed.confidenceScore,
    confidenceBand: parsed.confidenceBand,
    qualityFlags: [
      ...parsed.qualityFlags,
      ...parsed.rejectionReasons.map((reason) => `quarantine:${reason}`),
    ],
    status: parsed.accepted ? "accepted" : "quarantined",
  });

  return {
    state: parsed.accepted ? "accepted" : "quarantined",
    changed: true,
    rejectionReasons: parsed.rejectionReasons,
  };
}
