import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ingestFields } from "./schema";

const ingestDocValidator = v.object({
  _id: v.id("ingests"),
  _creationTime: v.number(),
  ...ingestFields,
});

/**
 * Deterministic content hash (two independent 32-bit rolling hashes, hex
 * concatenated) for same-paste dedupe (F1: double-click / impatience).
 */
function contentHash(text: string): string {
  let h1 = 5381;
  let h2 = 52711;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = ((h1 * 33) ^ c) | 0;
    h2 = ((h2 * 31) ^ c) | 0;
  }
  return (h1 >>> 0).toString(16) + "-" + (h2 >>> 0).toString(16);
}

/**
 * Save a raw paste as a pending ingest. Nothing is parsed client-side —
 * messy LinkedIn text is Claude's job (F1). If the exact same text was
 * already submitted, the second submit attaches to the first's status.
 */
export const addIngest = mutation({
  args: { rawText: v.string() },
  returns: v.id("ingests"),
  handler: async (ctx, args) => {
    const hash = contentHash(args.rawText);
    const existing = await ctx.db
      .query("ingests")
      .withIndex("by_contentHash", (q) => q.eq("contentHash", hash))
      .first();
    if (existing !== null) {
      return existing._id;
    }
    return await ctx.db.insert("ingests", {
      rawText: args.rawText,
      contentHash: hash,
      status: "pending" as const,
      retryCount: 0,
    });
  },
});

/** Pending ingests, oldest first (the queue banner and /process read this). */
export const listPending = query({
  args: {},
  returns: v.array(ingestDocValidator),
  handler: async (ctx) => {
    return await ctx.db
      .query("ingests")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("asc")
      .take(50);
  },
});
