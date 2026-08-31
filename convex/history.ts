import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { retentionRule } from "../lib/source-operations";

/**
 * Time-series reads.
 *
 * Three seams already accrue history that nothing could read: cross-company
 * hiring scans, the superseded chain that records what a salary figure used to
 * be, and city cost observations over time. Each is exposed here through its
 * own index, paginated, so a long history cannot become an unbounded read.
 *
 * Every query reports the window it actually covers. History is only days deep
 * today, and a chart that draws a confident line through two points is worse
 * than one that says it needs more history — so callers get `dayCount` and
 * `oldestAt` to gate on rather than having to infer depth from the rows.
 */

const DAY_MS = 24 * 60 * 60 * 1_000;

/** Distinct UTC days covered by a set of timestamps. */
function distinctDays(timestamps: number[]): number {
  const days = new Set(timestamps.map((at) => Math.floor(at / DAY_MS)));
  return days.size;
}

/**
 * Clamps a requested window to what retention actually keeps, so a chart can
 * never claim a longer history than the data is allowed to have.
 */
function clampToRetention(table: string, requestedDays: number): number {
  const rule = retentionRule(table);
  if (rule === null || rule === undefined) return requestedDays;
  return Math.min(requestedDays, rule.keepDays);
}

const scanPointValidator = v.object({
  scanId: v.id("companyScans"),
  companySlug: v.string(),
  company: v.string(),
  scannedAt: v.number(),
  status: v.string(),
  rolesSeen: v.number(),
  rolesAdded: v.number(),
  rolesRemoved: v.number(),
  rolesChanged: v.number(),
  spainRoles: v.number(),
});

/**
 * Hiring activity across every monitored company over time — the series behind
 * "is this company growing or shrinking?". Previously reachable only one
 * company at a time, capped at 20 scans.
 */
export const hiringActivity = query({
  args: {
    windowDays: v.optional(v.number()),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(scanPointValidator),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
    windowDays: v.number(),
    dayCount: v.number(),
    oldestAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    const windowDays = clampToRetention(
      "companyScans",
      Math.min(Math.max(args.windowDays ?? 90, 1), 365),
    );
    const since = Date.now() - windowDays * DAY_MS;

    const result = await ctx.db
      .query("companyScans")
      .withIndex("by_scannedAt", (q) => q.gte("scannedAt", since))
      .order("desc")
      .paginate(args.paginationOpts);

    // A scan feed is dominated by a handful of companies, so the same company
    // rows would otherwise be re-read for most entries.
    const companies = new Map<Id<"companies">, Doc<"companies"> | null>();
    async function companyFor(id: Id<"companies">) {
      const cached = companies.get(id);
      if (cached !== undefined) return cached;
      const doc = await ctx.db.get(id);
      companies.set(id, doc);
      return doc;
    }

    const page = [];
    for (const scan of result.page) {
      const company = await companyFor(scan.companyId);
      if (company === null) continue;
      page.push({
        scanId: scan._id,
        companySlug: company.slug,
        company: company.canonicalName,
        scannedAt: scan.scannedAt,
        status: scan.status,
        rolesSeen: scan.rolesSeen,
        rolesAdded: scan.rolesAdded,
        rolesRemoved: scan.rolesRemoved,
        rolesChanged: scan.rolesChanged,
        spainRoles: scan.spainRoles,
      });
    }

    const times = page.map((entry) => entry.scannedAt);
    return {
      page,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      windowDays,
      dayCount: distinctDays(times),
      oldestAt: times.length > 0 ? Math.min(...times) : null,
    };
  },
});

const salaryHistoryPointValidator = v.object({
  observationId: v.id("salaryObservations"),
  companySlug: v.string(),
  company: v.string(),
  level: v.string(),
  cityKey: v.optional(v.string()),
  minimumAmount: v.optional(v.number()),
  maximumAmount: v.optional(v.number()),
  currency: v.string(),
  period: v.string(),
  observedAt: v.number(),
  status: v.string(),
});

/**
 * What a company's published salary used to say. The superseded chain records
 * every figure an employer replaced, which is the only record of a salary
 * actually moving — and nothing could read it.
 */
export const salaryHistory = query({
  args: {
    companySlug: v.string(),
    includeCurrent: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(salaryHistoryPointValidator),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
    dayCount: v.number(),
    oldestAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    const company = await ctx.db
      .query("companies")
      .withIndex("by_slug", (q) => q.eq("slug", args.companySlug))
      .first();

    if (company === null) {
      return {
        page: [],
        isDone: true,
        continueCursor: null,
        dayCount: 0,
        oldestAt: null,
      };
    }

    const status = args.includeCurrent === true ? "accepted" : "superseded";
    const result = await ctx.db
      .query("salaryObservations")
      .withIndex("by_company_status_observedAt", (q) =>
        q.eq("companyId", company._id).eq("status", status),
      )
      .order("desc")
      .paginate(args.paginationOpts);

    const page = result.page.map((observation) => ({
      observationId: observation._id,
      companySlug: company.slug,
      company: company.canonicalName,
      level: observation.canonicalLevel,
      cityKey: observation.cityKey,
      minimumAmount: observation.baseMinAmount,
      maximumAmount: observation.baseMaxAmount,
      currency: observation.currency,
      period: observation.period,
      observedAt: observation.observedAt,
      status: observation.status,
    }));

    const times = page.map((entry) => entry.observedAt);
    return {
      page,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      dayCount: distinctDays(times),
      oldestAt: times.length > 0 ? Math.min(...times) : null,
    };
  },
});

const cityCostPointValidator = v.object({
  observationId: v.id("cityCostObservations"),
  cityKey: v.string(),
  category: v.string(),
  metric: v.string(),
  statistic: v.string(),
  amount: v.number(),
  currency: v.string(),
  unit: v.string(),
  referenceYear: v.number(),
  observedAt: v.number(),
});

/**
 * Cost of living for one city over time. `latestCityLivingCosts` only ever
 * returns the newest row per series, so the trend behind it was unreadable
 * despite a purpose-built index existing for exactly this.
 */
export const cityCostTrend = query({
  args: {
    cityKey: v.string(),
    category: v.optional(v.string()),
    windowDays: v.optional(v.number()),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(cityCostPointValidator),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
    windowDays: v.number(),
    dayCount: v.number(),
    oldestAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    const windowDays = clampToRetention(
      "cityCostObservations",
      Math.min(Math.max(args.windowDays ?? 365, 1), 1_095),
    );
    const since = Date.now() - windowDays * DAY_MS;

    // The category-scoped range is the narrower read, so it is used whenever a
    // category is given rather than reading the city and filtering after.
    const result =
      args.category === undefined
        ? await ctx.db
            .query("cityCostObservations")
            .withIndex("by_city_and_status", (q) =>
              q.eq("cityKey", args.cityKey).eq("status", "accepted"),
            )
            .order("desc")
            .paginate(args.paginationOpts)
        : await ctx.db
            .query("cityCostObservations")
            .withIndex("by_city_category_observedAt", (q) =>
              q
                .eq("cityKey", args.cityKey)
                .eq("category", args.category as Doc<"cityCostObservations">["category"])
                .gte("observedAt", since),
            )
            .order("desc")
            .paginate(args.paginationOpts);

    const page = result.page
      .filter((observation) => observation.observedAt >= since)
      .map((observation) => ({
        observationId: observation._id,
        cityKey: observation.cityKey,
        category: observation.category,
        metric: observation.metric,
        statistic: observation.statistic,
        amount: observation.amount,
        currency: observation.currency,
        unit: observation.unit,
        referenceYear: observation.referenceYear,
        observedAt: observation.observedAt,
      }));

    const times = page.map((entry) => entry.observedAt);
    return {
      page,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      windowDays,
      dayCount: distinctDays(times),
      oldestAt: times.length > 0 ? Math.min(...times) : null,
    };
  },
});
