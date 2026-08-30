import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import {
  eligibilityValidator,
  ingestFields,
  jobFields,
  pipelineStatusValidator,
  programFactsValidator,
  requirementValidator,
  rungValidator,
  salaryCacheFields,
  scoresValidator,
  workModeValidator,
} from "./schema";

/** Full job document shape, for exact `returns` validators (mirrors jobs.ts). */
const jobDocValidator = v.object({
  _id: v.id("jobs"),
  _creationTime: v.number(),
  ...jobFields,
});

/** Full ingest document shape (mirrors ingests.ts). */
const ingestDocValidator = v.object({
  _id: v.id("ingests"),
  _creationTime: v.number(),
  ...ingestFields,
});

/**
 * The researched fields Claude Code writes back after web research. All the
 * heavy shapes reuse the exported schema validators so the wire format is the
 * schema, not a parallel definition. `scores` carries the full scoresValidator
 * object verbatim — see the provenance note on `applyResearch`.
 */
const researchPatchValidator = v.object({
  company: v.string(),
  title: v.string(),
  canonicalTitle: v.optional(v.string()),
  locations: v.optional(v.array(v.string())),
  workMode: v.optional(workModeValidator),
  rung: rungValidator,
  requirements: v.optional(v.array(requirementValidator)),
  scores: v.optional(scoresValidator),
  redFlags: v.optional(v.array(v.string())),
  finePrint: v.optional(v.array(v.string())),
  programFacts: v.optional(programFactsValidator),
  eligibility: v.optional(eligibilityValidator),
  researchStatus: pipelineStatusValidator,
  researchFailReason: v.optional(v.string()),
});

/**
 * Persist a research result (F1/F2 pipeline). Called by Claude Code after it
 * has done external research (Glassdoor, levels.fyi, Payscale, company news) —
 * internal because it is a privileged write, never a client mutation.
 *
 * With `jobId` it patches an existing card; without it, inserts a fresh job and
 * defaults the required jobFields the patch does not carry. With `ingestId` it
 * closes out that ingest (status "done" + a default summary if none is set).
 *
 * PROVENANCE INTEGRITY (Rule 2): `scores` is written EXACTLY as passed. This
 * mutation never re-derives, clamps, or re-provenances a dimension. The caller
 * is solely responsible for only marking a dimension "verified" when it holds a
 * real source URL in that score's `sources` array — we faithfully persist it.
 */
export const applyResearch = internalMutation({
  args: {
    jobId: v.optional(v.id("jobs")),
    ingestId: v.optional(v.id("ingests")),
    patch: researchPatchValidator,
  },
  returns: v.id("jobs"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const p = args.patch;

    let jobId: Id<"jobs">;

    if (args.jobId !== undefined) {
      const existing = await ctx.db.get(args.jobId);
      if (existing === null) {
        throw new Error("Job not found");
      }
      // Patch ONLY the keys the research actually carries. ctx.db.patch treats
      // an explicit `undefined` value as "delete this field" — so spreading
      // absent optionals would wipe required fields like redFlags (and fail
      // schema validation). Build the patch with defined keys only.
      const fields: Partial<Doc<"jobs">> = {
        company: p.company,
        title: p.title,
        rung: p.rung,
        researchStatus: p.researchStatus,
        lastSeenAt: now,
      };
      if (p.canonicalTitle !== undefined) fields.canonicalTitle = p.canonicalTitle;
      if (p.locations !== undefined) fields.locations = p.locations;
      if (p.workMode !== undefined) fields.workMode = p.workMode;
      if (p.requirements !== undefined) fields.requirements = p.requirements;
      if (p.scores !== undefined) fields.scores = p.scores;
      if (p.redFlags !== undefined) fields.redFlags = p.redFlags;
      if (p.finePrint !== undefined) fields.finePrint = p.finePrint;
      if (p.programFacts !== undefined) fields.programFacts = p.programFacts;
      if (p.eligibility !== undefined) fields.eligibility = p.eligibility;
      if (p.researchFailReason !== undefined) {
        fields.researchFailReason = p.researchFailReason;
      }
      await ctx.db.patch(args.jobId, fields);
      jobId = args.jobId;
    } else {
      // Brand-new card: fill the required jobFields the patch does not provide.
      jobId = await ctx.db.insert("jobs", {
        company: p.company,
        title: p.title,
        canonicalTitle: p.canonicalTitle,
        locations: p.locations ?? [],
        workMode: p.workMode ?? ("unknown" as const),
        rung: p.rung,
        researchStatus: p.researchStatus,
        researchFailReason: p.researchFailReason,
        researchRetryCount: 0,
        userStatus: "saved" as const,
        eligibility:
          p.eligibility ??
          ({ state: "unknown" as const, provenance: "unknown" as const }),
        archived: false,
        pastedAt: now,
        lastSeenAt: now,
        repostCount: 0,
        requirements: p.requirements ?? [],
        scores: p.scores ?? {},
        redFlags: p.redFlags ?? [],
        finePrint: p.finePrint ?? [],
        programFacts: p.programFacts,
        promoted: false,
        viewed: false,
      });
    }

    if (args.ingestId !== undefined) {
      const ingest = await ctx.db.get(args.ingestId);
      if (ingest === null) {
        throw new Error("Ingest not found");
      }
      await ctx.db.patch(args.ingestId, {
        status: "done" as const,
        summary: ingest.summary ?? { found: 1, duplicates: 0, failed: 0 },
      });
    }

    return jobId;
  },
});

/**
 * The work queue for the /process skill: jobs still needing research
 * (researchStatus "pending" or "failed", non-archived, capped at 50) plus the
 * pending ingests still awaiting a first pass. One read of the whole to-do set.
 */
export const getForResearch = internalQuery({
  args: {},
  returns: v.object({
    jobs: v.array(jobDocValidator),
    ingests: v.array(ingestDocValidator),
  }),
  handler: async (ctx) => {
    const pending = await ctx.db
      .query("jobs")
      .withIndex("by_researchStatus", (q) => q.eq("researchStatus", "pending"))
      .take(50);
    const failed = await ctx.db
      .query("jobs")
      .withIndex("by_researchStatus", (q) => q.eq("researchStatus", "failed"))
      .take(50);

    const jobs = [...pending, ...failed]
      .filter((job) => !job.archived)
      .slice(0, 50);

    const ingests = await ctx.db
      .query("ingests")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("asc")
      .take(50);

    return { jobs, ingests };
  },
});

/**
 * Upsert a salary lookup keyed by titleFamily + location + level, so repeat
 * roles reuse figures instead of re-researching from scratch. Same key patches
 * figures + fetchedAt; new key inserts.
 */
export const cacheSalary = internalMutation({
  args: salaryCacheFields,
  returns: v.id("salaryCache"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("salaryCache")
      .withIndex("by_titleFamily_and_location_and_level", (q) =>
        q
          .eq("titleFamily", args.titleFamily)
          .eq("location", args.location)
          .eq("level", args.level),
      )
      .first();

    if (existing !== null) {
      await ctx.db.patch(existing._id, {
        figures: args.figures,
        fetchedAt: args.fetchedAt,
      });
      return existing._id;
    }

    return await ctx.db.insert("salaryCache", {
      titleFamily: args.titleFamily,
      location: args.location,
      level: args.level,
      figures: args.figures,
      fetchedAt: args.fetchedAt,
    });
  },
});

/** Read the cached salary for a role, or null if never researched. */
export const lookupSalary = internalQuery({
  args: {
    titleFamily: v.string(),
    location: v.string(),
    level: v.string(),
  },
  returns: v.union(
    v.object({
      _id: v.id("salaryCache"),
      _creationTime: v.number(),
      ...salaryCacheFields,
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("salaryCache")
      .withIndex("by_titleFamily_and_location_and_level", (q) =>
        q
          .eq("titleFamily", args.titleFamily)
          .eq("location", args.location)
          .eq("level", args.level),
      )
      .first();
  },
});
