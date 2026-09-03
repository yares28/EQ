import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";

import { salaryLevelValidator } from "./schema";
import { requiredSalaryLevels, salaryCompanies } from "../lib/salary-data";
import { SALARY_RECHECK_AFTER_MS, splitSearchedLevels } from "../lib/company-pipeline";

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
 * It used to default to twenty-five results and stop there, so a pass told to
 * "work the list" saw a third of it and reported that third as the whole
 * backlog. The queue now returns everything by default; `limit` is for a caller
 * that genuinely wants a slice.
 *
 * Each entry also carries what has already been looked for and not found, so a
 * pass can spend its time on companies nobody has opened rather than
 * re-reading the same locked levels.fyi page every run.
 */
export const needingResearch = internalQuery({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      canonicalName: v.string(),
      slug: v.string(),
      researchStatus: v.optional(v.string()),
      missingLevels: v.array(salaryLevelValidator),
      /** Missing levels a pass already searched for and found nothing at. */
      checkedEmpty: v.array(
        v.object({
          level: salaryLevelValidator,
          checkedAt: v.number(),
          sourcesChecked: v.array(v.string()),
          note: v.string(),
        }),
      ),
      /** Missing levels nobody has looked for yet — the real remaining work. */
      unsearchedLevels: v.array(salaryLevelValidator),
    }),
  ),
  handler: async (ctx, args) => {
    const companies = (await ctx.db.query("companies").take(200)).filter(
      (company) => company.active && company.mergedInto === undefined,
    );

    // One read each for the catalog and the check log, grouped in memory,
    // rather than two indexed lookups per company. Both tables are bounded by
    // companies x levels x scopes — tens of rows against ~150 index reads.
    const points = await ctx.db.query("companySalaryCatalog").take(1_000);
    const checks = await ctx.db.query("companySalaryChecks").take(1_000);
    const coveredBySlug = new Map<string, Set<string>>();
    for (const point of points) {
      const covered = coveredBySlug.get(point.companySlug) ?? new Set<string>();
      covered.add(point.level);
      coveredBySlug.set(point.companySlug, covered);
    }
    const checksBySlug = new Map<string, typeof checks>();
    for (const check of checks) {
      checksBySlug.set(check.companySlug, [...(checksBySlug.get(check.companySlug) ?? []), check]);
    }

    const results = [];
    for (const company of companies) {
      const covered = coveredBySlug.get(company.slug) ?? new Set<string>();
      const missingLevels = requiredSalaryLevels.filter((level) => !covered.has(level));
      if (missingLevels.length === 0) continue;

      const companyChecks = (checksBySlug.get(company.slug) ?? []).filter((check) =>
        missingLevels.includes(check.level as (typeof requiredSalaryLevels)[number]),
      );
      const { unsearchedLevels } = splitSearchedLevels(missingLevels, companyChecks);

      results.push({
        canonicalName: company.canonicalName,
        slug: company.slug,
        researchStatus: company.researchStatus,
        missingLevels: [...missingLevels],
        checkedEmpty: companyChecks.map((check) => ({
          level: check.level,
          checkedAt: check.checkedAt,
          sourcesChecked: check.sourcesChecked,
          note: check.note,
        })),
        unsearchedLevels: [...unsearchedLevels],
      });
      if (args.limit !== undefined && results.length >= args.limit) break;
    }
    return results;
  },
});

/**
 * Records that a level was researched and no figure could honestly be filed.
 *
 * The counterpart to `upsertPoint`: that one is how a figure gets on file, this
 * is how the absence of one does. A pass that leaves a level empty because the
 * source publishes nothing, locks its country page, or states a figure at no
 * level at all should say so here — otherwise the next pass repeats the search
 * and reaches the same dead end.
 *
 * Refuses a level that already carries a figure, so this can never be used to
 * mark researched pay as missing.
 */
export const recordNoFigure = internalMutation({
  args: {
    companySlug: v.string(),
    level: salaryLevelValidator,
    sourcesChecked: v.array(v.string()),
    note: v.string(),
    checkedAt: v.number(),
  },
  returns: v.union(
    v.literal("recorded"),
    v.literal("updated"),
    v.literal("unchanged"),
    v.literal("rejected_has_figure"),
    v.literal("rejected_no_sources"),
  ),
  handler: async (ctx, args) => {
    // A miss with no sources named is not a finding, it is a shrug — and it
    // would suppress the level from the next pass on no evidence at all.
    if (args.sourcesChecked.length === 0) return "rejected_no_sources";

    const figure = await ctx.db
      .query("companySalaryCatalog")
      .withIndex("by_companySlug", (q) => q.eq("companySlug", args.companySlug))
      .take(50);
    if (figure.some((point) => point.level === args.level)) return "rejected_has_figure";

    const existing = (
      await ctx.db
        .query("companySalaryChecks")
        .withIndex("by_companySlug", (q) => q.eq("companySlug", args.companySlug))
        .take(50)
    ).find((check) => check.level === args.level);

    if (existing === undefined) {
      await ctx.db.insert("companySalaryChecks", args);
      return "recorded";
    }
    // Re-confirming a dead end must not cost a write; only a changed finding
    // does. `checkedAt` alone is not a changed finding.
    const sameSources =
      existing.sourcesChecked.length === args.sourcesChecked.length &&
      existing.sourcesChecked.every((source, index) => source === args.sourcesChecked[index]);
    if (sameSources && existing.note === args.note) return "unchanged";
    await ctx.db.patch(existing._id, args);
    return "updated";
  },
});

/**
 * Figures old enough to be worth re-reading, oldest first.
 *
 * Read through the `researchedAt` index rather than scanning the catalog and
 * filtering: the cutoff is exactly what an index range expresses, and the whole
 * point of the re-check pass is that it usually finds almost nothing.
 */
export const staleFigures = internalQuery({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      companySlug: v.string(),
      level: salaryLevelValidator,
      location: v.string(),
      companyLevel: v.string(),
      researchedAt: v.number(),
      ageDays: v.number(),
      sources: v.array(
        v.object({
          label: v.string(),
          url: v.string(),
          publisher: v.string(),
          checkedAt: v.string(),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const now = Date.now();
    const cutoff = now - SALARY_RECHECK_AFTER_MS;
    const rows = await ctx.db
      .query("companySalaryCatalog")
      .withIndex("by_researchedAt", (q) => q.lte("researchedAt", cutoff))
      .order("asc")
      .take(Math.min(Math.max(args.limit ?? 25, 1), 100));
    return rows.map((row) => ({
      companySlug: row.companySlug,
      level: row.level,
      location: row.location,
      companyLevel: row.companyLevel,
      researchedAt: row.researchedAt,
      ageDays: Math.floor((now - row.researchedAt) / 86_400_000),
      sources: row.sources,
    }));
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
