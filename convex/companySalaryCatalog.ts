import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";

import { salaryLevelValidator } from "./schema";
import { requiredSalaryLevels, salaryCompanies } from "../lib/salary-data";

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

type CatalogSource = { label: string; url: string; publisher: string; checkedAt: string };

/**
 * Field-by-field equality, ignoring `researchedAt` — see `upsertPoint`.
 *
 * Sources are compared field by field rather than by serializing them. Convex
 * returns object keys in alphabetical order while a freshly built row carries
 * them in the order they were written, so comparing `JSON.stringify` output
 * reported every identical row as changed — and rewrote all of them on every
 * pass, which is the wasteful write this function exists to prevent.
 */
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

  const leftSources = (left.sources ?? []) as CatalogSource[];
  const rightSources = (right.sources ?? []) as CatalogSource[];
  if (leftSources.length !== rightSources.length) return false;
  return leftSources.every((source, index) => {
    const other = rightSources[index];
    return (
      source.label === other.label &&
      source.url === other.url &&
      source.publisher === other.publisher &&
      source.checkedAt === other.checkedAt
    );
  });
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

/**
 * Copies the compiled-in catalog's figures into the table, once.
 *
 * The builder still reads `lib/salary-data.ts` as its last tier, so display
 * does not depend on this having run. What it fixes is `needingResearch`:
 * without it the four companies that do have compiled-in figures would be
 * reported as missing every level, and the research pass would spend its
 * effort re-deriving numbers already on file.
 *
 * Idempotent through `upsertPoint`, so re-running it writes nothing.
 */
export const seedFromCompiledCatalog = internalMutation({
  args: {},
  returns: v.object({
    inserted: v.number(),
    updated: v.number(),
    unchanged: v.number(),
    skipped: v.number(),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    let skipped = 0;

    for (const company of salaryCompanies) {
      const sourceById = new Map(company.sources.map((source) => [source.id, source]));
      for (const point of company.salaryPoints) {
        const sources = point.sourceIds.flatMap((id) => {
          const source = sourceById.get(id);
          return source === undefined
            ? []
            : [{
                label: source.label,
                url: source.url,
                publisher: source.publisher,
                checkedAt: source.checkedAt,
              }];
        });
        // An uncited figure is not publishable evidence; leave it to the
        // compiled-in tier rather than promoting it into researched data.
        if (sources.length === 0) {
          skipped += 1;
          continue;
        }

        const existing = await ctx.db
          .query("companySalaryCatalog")
          .withIndex("by_companySlug_level_location", (q) =>
            q
              .eq("companySlug", company.slug)
              .eq("level", point.level)
              .eq("location", point.location),
          )
          .unique();

        const row = {
          companySlug: company.slug,
          level: point.level,
          location: point.location,
          locationLabel: point.locationLabel,
          companyLevel: point.companyLevel,
          totalCompEur: point.totalCompEur,
          baseEur: point.baseEur,
          bonusEur: point.bonusEur,
          equityEur: point.equityEur,
          extrasEur: point.extrasEur,
          confidence: point.confidence,
          confidenceNote: point.confidenceNote,
          sampleSize: point.sampleSize ?? null,
          sampleNote: point.sampleNote,
          notes: point.notes,
          sources,
          // The compiled figures carry their own checked date; the seed run's
          // clock is not evidence of when anything was researched.
          researchedAt: Date.parse(`${company.lastResearchedAt}T00:00:00Z`) || now,
        };

        if (existing === null) {
          await ctx.db.insert("companySalaryCatalog", row);
          inserted += 1;
        } else if (sameFigure(existing, row)) {
          unchanged += 1;
        } else {
          await ctx.db.patch(existing._id, row);
          updated += 1;
        }
      }
    }

    return { inserted, updated, unchanged, skipped };
  },
});
