import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

import { isSpainLocation } from "../lib/company-posted-salary";

/**
 * Every Spain tech posting, with the tokens needed to score it.
 *
 * Deliberately returns tokens rather than descriptions: the match runs in the
 * browser so a CV change re-scores instantly, and shipping ~55 full job
 * descriptions to do that would be orders of magnitude more bandwidth for a
 * number the client can derive from twenty short ids.
 *
 * Mounted on the Scores page alone, not globally.
 */
export const spainTechPostings = query({
  args: {},
  returns: v.object({
    /** True when the bounded read filled up, so the list may be incomplete. */
    truncated: v.boolean(),
    postings: v.array(
      v.object({
        postingId: v.id("jobPostings"),
        companySlug: v.string(),
        companyName: v.string(),
        title: v.string(),
        url: v.string(),
        locations: v.array(v.string()),
        open: v.boolean(),
        firstSeenAt: v.number(),
        lastSeenAt: v.number(),
        closedAt: v.optional(v.number()),
        matchTokens: v.optional(v.array(v.string())),
        mustHaveTokens: v.optional(v.array(v.string())),
        salaryText: v.optional(v.string()),
      }),
    ),
  }),
  handler: async (ctx) => {
    // The relevance flag is the selective part of this index, and it is what
    // narrows a table of thousands to the couple of hundred tech rows. Spain is
    // then a JS filter over that already-small set because no index carries
    // location — reading 227 rows to keep 55 is a different thing from scanning
    // the table.
    const BOUND = 1_000;
    const tech = await ctx.db
      .query("jobPostings")
      .withIndex("by_relevance_and_state", (q) => q.eq("relevantToSpainSoftware", true))
      .take(BOUND);

    const companies = new Map<Id<"companies">, Doc<"companies"> | null>();
    async function company(id: Id<"companies">) {
      const cached = companies.get(id);
      if (cached !== undefined) return cached;
      const doc = await ctx.db.get(id);
      companies.set(id, doc);
      return doc;
    }

    // One row per role rather than per capture: the same posting re-listed under
    // a new id would otherwise be ranked twice.
    const byUrl = new Map<string, (typeof tech)[number]>();
    for (const posting of tech) {
      if (!isSpainLocation(posting.locations)) continue;
      const seen = byUrl.get(posting.canonicalUrl);
      if (seen === undefined || posting.lastSeenAt > seen.lastSeenAt) {
        byUrl.set(posting.canonicalUrl, posting);
      }
    }

    const postings = [];
    for (const posting of byUrl.values()) {
      const companyDoc = await company(posting.companyId);
      if (companyDoc === null) continue;
      postings.push({
        postingId: posting._id,
        companySlug: companyDoc.slug,
        companyName: companyDoc.canonicalName,
        title: posting.title,
        url: posting.canonicalUrl,
        locations: posting.locations,
        open: posting.state === "active",
        firstSeenAt: posting.firstSeenAt,
        lastSeenAt: posting.lastSeenAt,
        closedAt: posting.closedAt,
        matchTokens: posting.matchTokens,
        mustHaveTokens: posting.mustHaveTokens,
        salaryText: posting.salaryText,
      });
    }
    postings.sort((left, right) => right.lastSeenAt - left.lastSeenAt);

    return { truncated: tech.length >= BOUND, postings };
  },
});
