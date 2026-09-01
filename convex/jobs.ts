import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { jobFields, userStatusValidator } from "./schema";

/** Full job document shape, for exact `returns` validators. */
const jobDocValidator = v.object({
  _id: v.id("jobs"),
  _creationTime: v.number(),
  ...jobFields,
});

/** All non-archived jobs, newest first, capped at 100. */
export const list = query({
  args: {},
  returns: v.array(jobDocValidator),
  handler: async (ctx) => {
    return await ctx.db
      .query("jobs")
      .withIndex("by_archived", (q) => q.eq("archived", false))
      .order("desc")
      .take(100);
  },
});

export const getById = query({
  args: { id: v.id("jobs") },
  returns: v.union(jobDocValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * User status is authoritative (F10) — a repost never touches it.
 */
export const setUserStatus = mutation({
  args: { id: v.id("jobs"), status: userStatusValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id);
    if (job === null) {
      throw new Error("Job not found");
    }
    await ctx.db.patch(args.id, { userStatus: args.status });
    return null;
  },
});

/**
 * "I am eligible" override (F4). Writes with `user` provenance, which
 * re-research can never overwrite (Rule 2).
 */
export const setEligibilityOverride = mutation({
  args: {
    id: v.id("jobs"),
    state: v.union(
      v.literal("eligible"),
      v.literal("check"),
      v.literal("ineligible"),
      v.literal("unknown"),
    ),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id);
    if (job === null) {
      throw new Error("Job not found");
    }
    await ctx.db.patch(args.id, {
      eligibility: {
        state: args.state,
        reason: args.reason,
        provenance: "user" as const,
      },
    });
    return null;
  },
});

/**
 * Soft delete only (cross-cutting rule 3). Archived cards are never
 * resurrected by re-pastes.
 */
export const archive = mutation({
  args: { id: v.id("jobs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id);
    if (job === null) {
      throw new Error("Job not found");
    }
    await ctx.db.patch(args.id, { archived: true });
    return null;
  },
});
