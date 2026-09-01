import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";

import { salaryLevelValidator } from "./schema";
import { requiredSalaryLevels } from "../lib/salary-data";

/**
 * Researched company pay, filed per company x level x location.
 *
 * Employer-posted ranges parsed out of career pages are the only *live* salary
 * source, and Spain does not mandate pay transparency — so across the whole
 * deployment they produced figures for two companies and none at intern or
 * junior. This table is where the /process research pass puts what it finds on
 * levels.fyi, Glassdoor, Payscale and InfoJobs, so a company can carry a figure
 * whether or not its own job ads disclose one.
 *
 * The evidence rule is the whole point of the level being part of the key: a
 * figure lives at the level it was published for and is never re-filed under
 * another one.
 */

const catalogPointValidator = v.object({
  companySlug: v.string(),
  level: salaryLevelValidator,
  location: v.string(),
  locationLabel: v.string(),
  companyLevel: v.string(),
  totalCompEur: v.union(v.number(), v.null()),
  baseEur: v.union(v.number(), v.null()),
  bonusEur: v.union(v.number(), v.null()),
  equityEur: v.union(v.number(), v.null()),
  extrasEur: v.union(v.number(), v.null()),
  confidence: v.union(
    v.literal("High"),
    v.literal("Medium"),
    v.literal("Low"),
    v.literal("Unknown"),
  ),
  confidenceNote: v.string(),
  sampleSize: v.optional(v.union(v.number(), v.null())),
  sampleNote: v.optional(v.string()),
  notes: v.string(),
  sources: v.array(
    v.object({
      label: v.string(),
      url: v.string(),
      publisher: v.string(),
      checkedAt: v.string(),
    }),
  ),
  researchedAt: v.number(),
});

/** Field-by-field equality, ignoring `researchedAt` — see `upsertPoint`. */
function sameFigure(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  const keys = [
    "locationLabel",
    "companyLevel",
    "totalCompEur",
    "baseEur",
    "bonusEur",
    "equityEur",
    "extrasEur",
    "confidence",
    "confidenceNote",
    "sampleSize",
    "sampleNote",
    "notes",
  ];
  if (keys.some((key) => (left[key] ?? null) !== (right[key] ?? null))) return false;
  const leftSources = JSON.stringify(left.sources ?? []);
  const rightSources = JSON.stringify(right.sources ?? []);
  return leftSources === rightSources;
}

/**
 * The write path for the /process research pass.
 *
 * Idempotent on company x level x location, and it compares before patching:
 * re-running research that found the same numbers must not cost write
 * bandwidth or wake every open subscriber of this table. `researchedAt` alone
 * is not a reason to write — otherwise every pass would rewrite every row.
 */
export const upsertPoint = internalMutation({
  args: catalogPointValidator,
  returns: v.union(
    v.literal("inserted"),
    v.literal("updated"),
    v.literal("unchanged"),
    v.literal("rejected"),
  ),
  handler: async (ctx, args) => {
    // A figure with no citation cannot be shown as a company's pay, so there is
    // no point storing one. The research pass is told this; enforce it here too
    // rather than trusting the caller.
    if (args.sources.length === 0) return "rejected";
    if (args.totalCompEur === null && args.baseEur === null) return "rejected";

    const existing = await ctx.db
      .query("companySalaryCatalog")
      .withIndex("by_companySlug_level_location", (q) =>
        q
          .eq("companySlug", args.companySlug)
          .eq("level", args.level)
          .eq("location", args.location),
      )
      .unique();

    if (existing === null) {
      await ctx.db.insert("companySalaryCatalog", args);
      return "inserted";
    }
    if (sameFigure(existing, args)) return "unchanged";
    await ctx.db.patch(existing._id, args);
    return "updated";
  },
});

/**
 * Every researched figure, for the client catalog builder.
 *
 * A reactive subscription, so it reads only what it returns. The table is one
 * row per company x level x location — tens of rows, not thousands — and it is
 * written only during a manual /process pass, so it re-runs rarely.
 */
export const catalogPoints = query({
  args: {},
  returns: v.array(catalogPointValidator),
  handler: async (ctx) => {
    const rows = await ctx.db.query("companySalaryCatalog").take(1_000);
    return rows.map((row) => ({
      companySlug: row.companySlug,
      level: row.level,
      location: row.location,
      locationLabel: row.locationLabel,
      companyLevel: row.companyLevel,
      totalCompEur: row.totalCompEur,
      baseEur: row.baseEur,
      bonusEur: row.bonusEur,
      equityEur: row.equityEur,
      extrasEur: row.extrasEur,
      confidence: row.confidence,
      confidenceNote: row.confidenceNote,
      sampleSize: row.sampleSize,
      sampleNote: row.sampleNote,
      notes: row.notes,
      sources: row.sources,
      researchedAt: row.researchedAt,
    }));
  },
});

/**
 * The queue /process works through: tracked companies still missing a figure at
 * one of the levels the user actually decides on.
 *
 * Reads the catalog through `by_companySlug` per company rather than pulling
 * the whole table and filtering in JS, so the cost scales with what is missing
 * rather than with the catalog's size.
 */
export const needingResearch = internalQuery({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      canonicalName: v.string(),
      slug: v.string(),
      researchStatus: v.optional(v.string()),
      missingLevels: v.array(salaryLevelValidator),
    }),
  ),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 25, 1), 100);
    const companies = (await ctx.db.query("companies").take(200)).filter(
      (company) => company.active && company.mergedInto === undefined,
    );

    const results = [];
    for (const company of companies) {
      const points = await ctx.db
        .query("companySalaryCatalog")
        .withIndex("by_companySlug", (q) => q.eq("companySlug", company.slug))
        .take(50);
      const covered = new Set(points.map((point) => point.level));
      const missingLevels = requiredSalaryLevels.filter((level) => !covered.has(level));
      if (missingLevels.length === 0) continue;
      results.push({
        canonicalName: company.canonicalName,
        slug: company.slug,
        researchStatus: company.researchStatus,
        missingLevels: [...missingLevels],
      });
      if (results.length >= limit) break;
    }
    return results;
  },
});
