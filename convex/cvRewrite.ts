import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";

import { cvRewriteFields } from "./schema";

/**
 * CV rewrites, one per posting per CV version.
 *
 * The rewrite itself is judgement work and belongs to /process; this only
 * stores and serves it. Everything here exists to make one rule enforceable:
 * a rewrite may change wording and nothing else.
 */

const replacementValidator = v.object({
  sectionIndex: v.number(),
  entryIndex: v.number(),
  bulletIndex: v.number(),
  text: v.string(),
});

/**
 * Postings worth rewriting for, and the CV to rewrite against.
 *
 * Returns the CV's structure so /process can address bullets by position
 * without a second call, and the posting's required skills so a rewrite can
 * surface genuinely-held experience the posting asks for.
 */
export const rewriteTargets = internalQuery({
  args: { postingId: v.optional(v.id("jobPostings")) },
  returns: v.union(
    v.null(),
    v.object({
      cvVersion: v.string(),
      cvStructured: v.any(),
      cvSkills: v.array(v.string()),
      postings: v.array(
        v.object({
          postingId: v.id("jobPostings"),
          title: v.string(),
          url: v.string(),
          companyName: v.string(),
          matchTokens: v.optional(v.array(v.string())),
          mustHaveTokens: v.optional(v.array(v.string())),
          descriptionText: v.optional(v.string()),
          alreadyRewritten: v.boolean(),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const profile = await ctx.db.query("profile").first();
    if (profile?.cvVersion === undefined || profile.cvStructured === undefined) return null;

    // The description is only returned when one posting was asked for. Listing
    // fifty of them returned 235 KB in a single payload, which is a lot of
    // bandwidth for text the caller only needs once it has picked a target.
    const single = args.postingId !== undefined;
    const candidates = single
      ? [await ctx.db.get(args.postingId as NonNullable<typeof args.postingId>)].filter(
          (row) => row !== null,
        )
      : await ctx.db
          .query("jobPostings")
          .withIndex("by_relevance_and_state", (q) =>
            q.eq("relevantToSpainSoftware", true).eq("state", "active"),
          )
          .take(50);

    const postings = [];
    for (const posting of candidates) {
      if (posting === null) continue;
      const company = await ctx.db.get(posting.companyId);
      const existing = await ctx.db
        .query("cvRewrites")
        .withIndex("by_posting_and_version", (q) =>
          q.eq("postingId", posting._id).eq("cvVersion", profile.cvVersion as string),
        )
        .first();
      postings.push({
        postingId: posting._id,
        title: posting.title,
        url: posting.canonicalUrl,
        companyName: company?.canonicalName ?? "Unknown",
        matchTokens: posting.matchTokens,
        mustHaveTokens: posting.mustHaveTokens,
        descriptionText: single ? posting.descriptionText : undefined,
        alreadyRewritten: existing !== null,
      });
    }

    return {
      cvVersion: profile.cvVersion,
      cvStructured: profile.cvStructured,
      cvSkills: profile.skills.map((skill) => skill.name),
      postings,
    };
  },
});

/**
 * Stores a rewrite for one posting.
 *
 * Validates the shape against the CV it claims to rewrite: every replacement
 * must address a bullet that exists. A rewrite that pointed past the end of the
 * document would be one that invented a job, and rejecting it here means the
 * rule holds regardless of what produced the rewrite.
 */
export const saveRewrite = internalMutation({
  args: {
    postingId: v.id("jobPostings"),
    cvVersion: v.string(),
    replacements: v.array(replacementValidator),
    rationale: v.optional(v.string()),
  },
  returns: v.union(v.literal("saved"), v.literal("replaced"), v.literal("rejected_stale_cv")),
  handler: async (ctx, args) => {
    const profile = await ctx.db.query("profile").first();
    // A rewrite written against a CV that has since been re-imported describes
    // bullets that may no longer exist, and its wording no longer relates to
    // what is on file. Refusing it is better than showing it beside the wrong CV.
    if (profile?.cvVersion !== args.cvVersion) return "rejected_stale_cv";

    const structured = profile.cvStructured as {
      sections?: { entries?: { bullets?: unknown[] }[] }[];
    };
    for (const replacement of args.replacements) {
      const bullets =
        structured.sections?.[replacement.sectionIndex]?.entries?.[replacement.entryIndex]?.bullets;
      if (bullets === undefined || bullets[replacement.bulletIndex] === undefined) {
        throw new Error(
          `Replacement ${replacement.sectionIndex}/${replacement.entryIndex}/${replacement.bulletIndex} targets a bullet that does not exist. A rewrite may reword bullets, never add them.`,
        );
      }
      if (replacement.text.trim().length === 0) {
        throw new Error("A rewritten bullet cannot be empty; a rewrite rewords, it does not delete.");
      }
    }

    const existing = await ctx.db
      .query("cvRewrites")
      .withIndex("by_posting_and_version", (q) =>
        q.eq("postingId", args.postingId).eq("cvVersion", args.cvVersion),
      )
      .first();

    const row = {
      postingId: args.postingId,
      cvVersion: args.cvVersion,
      replacements: args.replacements,
      rationale: args.rationale,
      createdAt: Date.now(),
    };
    if (existing !== null) {
      await ctx.db.patch(existing._id, row);
      return "replaced";
    }
    await ctx.db.insert("cvRewrites", row);
    return "saved";
  },
});

/** The rewrite for one posting against the CV currently on file, if any. */
export const rewriteForPosting = query({
  args: { postingId: v.id("jobPostings") },
  returns: v.union(
    v.null(),
    v.object({
      cvVersion: v.string(),
      replacements: v.array(replacementValidator),
      rationale: v.optional(v.string()),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const profile = await ctx.db.query("profile").first();
    if (profile?.cvVersion === undefined) return null;
    const rewrite = await ctx.db
      .query("cvRewrites")
      .withIndex("by_posting_and_version", (q) =>
        q.eq("postingId", args.postingId).eq("cvVersion", profile.cvVersion as string),
      )
      .first();
    if (rewrite === null) return null;
    return {
      cvVersion: rewrite.cvVersion,
      replacements: rewrite.replacements,
      rationale: rewrite.rationale,
      createdAt: rewrite.createdAt,
    };
  },
});

/** Every posting that has a rewrite against the current CV, for the Scores page. */
export const rewrittenPostingIds = query({
  args: {},
  returns: v.array(v.id("jobPostings")),
  handler: async (ctx) => {
    const profile = await ctx.db.query("profile").first();
    if (profile?.cvVersion === undefined) return [];
    // Small table: one row per posting the user has actually asked about.
    const rows = await ctx.db.query("cvRewrites").take(500);
    return rows
      .filter((row) => row.cvVersion === profile.cvVersion)
      .map((row) => row.postingId);
  },
});
