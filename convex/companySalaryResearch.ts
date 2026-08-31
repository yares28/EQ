import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

import {
  COMPANY_POSTED_SALARY_PARSER_VERSION,
  reconcileCompanyPostedSalary,
  sameObservation,
  withdrawCompanyPostedSalary,
} from "./companySalaryObservationCore";
import {
  parseCompanyPostedSalary,
  postedSalaryLocationLabel,
} from "../lib/company-posted-salary";

const publicRangeValidator = v.object({
  observationId: v.id("salaryObservations"),
  company: v.string(),
  companySlug: v.string(),
  title: v.string(),
  url: v.string(),
  level: v.union(
    v.literal("intern"),
    v.literal("junior"),
    v.literal("mid"),
    v.literal("senior"),
    v.literal("staff"),
    v.literal("principal"),
  ),
  location: v.string(),
  locationLabel: v.string(),
  currency: v.literal("EUR"),
  period: v.union(v.literal("hour"), v.literal("month"), v.literal("year")),
  rangeKind: v.union(
    v.literal("range"),
    v.literal("fixed"),
    v.literal("minimum"),
    v.literal("maximum"),
  ),
  minimumAmount: v.number(),
  maximumAmount: v.number(),
  confidenceScore: v.number(),
  checkedAt: v.number(),
  source: v.string(),
});

export const latestDirectRanges = query({
  args: {},
  returns: v.object({
    lastCheckedAt: v.union(v.number(), v.null()),
    /** True when the accepted-observation read hit its bound, so `ranges` may
     * be missing rows rather than genuinely being complete. */
    truncated: v.boolean(),
    ranges: v.array(publicRangeValidator),
  }),
  handler: async (ctx) => {
    // This is a reactive subscription mounted on nearly every page, so it reads
    // only what it returns. It used to prefetch every active Spain-relevant
    // posting (hundreds of documents) purely to build a Set of ids for
    // filtering, and separately read up to 1,000 quarantined observations to
    // compute funnel counters that described EQ's ingest rather than any
    // salary. Both are gone: the loop below already validates each posting is
    // active when it resolves it, and nothing renders the counters.
    const ACCEPTED_LIMIT = 1_000;
    const accepted = await ctx.db
      .query("salaryObservations")
      .withIndex("by_status", (q) => q.eq("status", "accepted"))
      .take(ACCEPTED_LIMIT);

    // A handful of companies and sources back hundreds of observations, so the
    // same rows were being re-fetched constantly. Memoized per call.
    const companyCache = new Map<Id<"companies">, Doc<"companies"> | null>();
    const sourceCache = new Map<Id<"sourceRegistry">, Doc<"sourceRegistry"> | null>();

    async function company(id: Id<"companies">) {
      const cached = companyCache.get(id);
      if (cached !== undefined) return cached;
      const doc = await ctx.db.get(id);
      companyCache.set(id, doc);
      return doc;
    }

    async function source(id: Id<"sourceRegistry">) {
      const cached = sourceCache.get(id);
      if (cached !== undefined) return cached;
      const doc = await ctx.db.get(id);
      sourceCache.set(id, doc);
      return doc;
    }

    const ranges = [];
    let lastCheckedAt: number | null = null;

    for (const observation of accepted.sort((left, right) => right.observedAt - left.observedAt)) {
      if (
        observation.postingId === undefined ||
        observation.currency !== "EUR" ||
        observation.period === "unknown" ||
        observation.canonicalLevel === "unknown" ||
        observation.baseMinAmount === undefined ||
        observation.baseMaxAmount === undefined ||
        observation.rangeKind === undefined
      ) continue;

      const posting = await ctx.db.get(observation.postingId);
      if (posting === null || posting.state !== "active") continue;
      const [companyDoc, sourceDoc] = await Promise.all([
        company(observation.companyId),
        source(observation.sourceId),
      ]);
      if (companyDoc === null || sourceDoc === null) continue;

      // Accepted observations are already sorted newest-first, so the first one
      // through carries the most recent check.
      if (lastCheckedAt === null) lastCheckedAt = observation.observedAt;

      const locationLabel = postedSalaryLocationLabel(observation.cityKey, observation.rawLocation);
      ranges.push({
        observationId: observation._id,
        company: companyDoc.canonicalName,
        companySlug: companyDoc.slug,
        title: posting.title,
        url: observation.canonicalUrl ?? posting.canonicalUrl,
        level: observation.canonicalLevel,
        location: observation.rawLocation,
        locationLabel,
        currency: "EUR" as const,
        period: observation.period,
        rangeKind: observation.rangeKind,
        minimumAmount: observation.baseMinAmount,
        maximumAmount: observation.baseMaxAmount,
        confidenceScore: observation.confidenceScore,
        checkedAt: observation.observedAt,
        source: sourceDoc.provider,
      });
    }

    return {
      lastCheckedAt,
      truncated: accepted.length >= ACCEPTED_LIMIT,
      ranges: ranges.slice(0, 200),
    };
  },
});

/**
 * Reports what a replay would change, without writing.
 *
 * A parser release is only safe to roll out once its effect on stored evidence
 * is known, so this runs the same parse and the same equality rule as the
 * writer and summarises the outcome, including why records would be
 * quarantined. Run this before `backfillCurrent`.
 */
export const previewBackfill = internalQuery({
  args: { limit: v.number() },
  returns: v.object({
    parserVersion: v.string(),
    reviewed: v.number(),
    unchanged: v.number(),
    wouldAccept: v.number(),
    wouldQuarantine: v.number(),
    wouldWithdraw: v.number(),
    noSalaryText: v.number(),
    staleParserVersions: v.array(v.string()),
    quarantineReasons: v.array(v.object({ reason: v.string(), count: v.number() })),
  }),
  handler: async (ctx, args) => {
    const postings = (await ctx.db.query("jobPostings").take(5_000))
      .filter((posting) => posting.relevantToSpainSoftware === true)
      .sort((left, right) => right.lastSeenAt - left.lastSeenAt)
      .slice(0, Math.min(Math.max(args.limit, 1), 500));

    const totals = {
      reviewed: 0,
      unchanged: 0,
      wouldAccept: 0,
      wouldQuarantine: 0,
      wouldWithdraw: 0,
      noSalaryText: 0,
    };
    const reasonCounts = new Map<string, number>();
    const staleParserVersions = new Set<string>();

    for (const posting of postings) {
      const version = await ctx.db
        .query("jobPostingVersions")
        .withIndex("by_postingId_and_capturedAt", (q) => q.eq("postingId", posting._id))
        .order("desc")
        .first();
      if (version === null) continue;
      totals.reviewed += 1;

      const existing = (
        await ctx.db
          .query("salaryObservations")
          .withIndex("by_posting_status", (q) => q.eq("postingId", posting._id))
          .collect()
      ).filter(
        (observation) =>
          observation.status === "accepted" || observation.status === "quarantined",
      );
      for (const observation of existing) {
        if (
          observation.parserVersion !== undefined &&
          observation.parserVersion !== COMPANY_POSTED_SALARY_PARSER_VERSION
        ) {
          staleParserVersions.add(observation.parserVersion);
        }
      }

      const salaryText = version.salaryText?.trim();
      if (posting.state !== "active" || !salaryText) {
        if (existing.length > 0) totals.wouldWithdraw += 1;
        else totals.noSalaryText += 1;
        continue;
      }

      const company = await ctx.db.get(posting.companyId);
      const parsed = parseCompanyPostedSalary({
        title: version.title ?? posting.title,
        locations: version.locations,
        salaryText,
        companySlug: company?.slug,
      });
      if (parsed.accepted) totals.wouldAccept += 1;
      else {
        totals.wouldQuarantine += 1;
        for (const reason of parsed.rejectionReasons) {
          reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
        }
      }
      if (existing.some((observation) => sameObservation(observation, parsed, salaryText))) {
        totals.unchanged += 1;
      }
    }

    return {
      parserVersion: COMPANY_POSTED_SALARY_PARSER_VERSION,
      ...totals,
      staleParserVersions: [...staleParserVersions].sort(),
      quarantineReasons: [...reasonCounts.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason)),
    };
  },
});

/** Replays current versions after a parser release; immutable job snapshots remain the source. */
export const backfillCurrent = internalMutation({
  args: { limit: v.number() },
  returns: v.object({
    reviewed: v.number(),
    accepted: v.number(),
    quarantined: v.number(),
    withdrawn: v.number(),
    noSalaryText: v.number(),
  }),
  handler: async (ctx, args) => {
    const postings = (await ctx.db.query("jobPostings").take(5_000))
      .filter((posting) => posting.relevantToSpainSoftware === true)
      .sort((left, right) => right.lastSeenAt - left.lastSeenAt)
      .slice(0, Math.min(Math.max(args.limit, 1), 500));
    const totals = { reviewed: 0, accepted: 0, quarantined: 0, withdrawn: 0, noSalaryText: 0 };

    for (const posting of postings) {
      const version = await ctx.db
        .query("jobPostingVersions")
        .withIndex("by_postingId_and_capturedAt", (q) => q.eq("postingId", posting._id))
        .order("desc")
        .first();
      if (version === null) continue;
      totals.reviewed += 1;
      const result = await reconcileCompanyPostedSalary(ctx, {
        companyId: posting.companyId,
        sourceId: posting.sourceId,
        snapshotId: version.snapshotId,
        postingId: posting._id,
        externalId: posting.externalId,
        canonicalUrl: posting.canonicalUrl,
        title: version.title ?? posting.title,
        locations: version.locations,
        salaryText: version.salaryText,
        state: posting.state,
        observedAt: posting.lastSeenAt,
      });
      if (result.state === "accepted") totals.accepted += 1;
      else if (result.state === "quarantined") totals.quarantined += 1;
      else if (result.state === "withdrawn") totals.withdrawn += 1;
      else totals.noSalaryText += 1;
    }
    return totals;
  },
});

export const withdrawClosed = internalMutation({
  args: { limit: v.number() },
  returns: v.object({ reviewed: v.number(), withdrawn: v.number() }),
  handler: async (ctx, args) => {
    const current = [
      ...await ctx.db.query("salaryObservations").withIndex("by_status", (q) => q.eq("status", "accepted")).take(1_000),
      ...await ctx.db.query("salaryObservations").withIndex("by_status", (q) => q.eq("status", "quarantined")).take(1_000),
    ].slice(0, Math.min(Math.max(args.limit, 1), 1_000));
    let withdrawn = 0;
    for (const observation of current) {
      if (observation.postingId === undefined) continue;
      const posting = await ctx.db.get(observation.postingId);
      if (posting === null || posting.state === "active") continue;
      withdrawn += await withdrawCompanyPostedSalary(ctx, observation.postingId, Date.now());
    }
    return { reviewed: current.length, withdrawn };
  },
});
