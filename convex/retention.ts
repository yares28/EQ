import { v } from "convex/values";

import { RETENTION_RULES, retentionRule } from "../lib/source-operations";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation, query } from "./_generated/server";

/**
 * Bounded history for the append-only research tables.
 *
 * Snapshots and runs exist so a published figure can be reproduced and a failed
 * refresh can be explained; neither needs unbounded history. Pruning is only
 * safe when it cannot orphan a live figure, so a snapshot that a current
 * observation still cites is never deleted regardless of age, and the newest
 * records per parent are always kept.
 */

const DAY_MS = 24 * 60 * 60_000;

const pruneResultValidator = v.object({
  table: v.string(),
  examined: v.number(),
  deleted: v.number(),
  keptForReference: v.number(),
  keptForMinimum: v.number(),
});

export const policy = query({
  args: {},
  returns: v.array(
    v.object({
      table: v.string(),
      keepDays: v.number(),
      minimumKeptPerParent: v.number(),
      rationale: v.string(),
    }),
  ),
  handler: async () => RETENTION_RULES,
});

/**
 * Snapshots hold the raw payload a figure was parsed from, so they are large —
 * roughly 86 KB each in this deployment. Reading a few hundred exceeds the
 * 16 MB per-transaction limit on its own, which is exactly how the nightly
 * prune came to fail every night while reading ~17 MB per attempt.
 */
const SNAPSHOT_BATCH = 20;

/**
 * Whether anything still cites this snapshot.
 *
 * Four tables carry a `snapshotId`, and the previous implementation checked
 * two of them — so a snapshot a market observation or a posting version still
 * pointed at could be deleted, contrary to the rule this module states. It
 * also answered by reading up to 6,000 observation documents per run; an
 * indexed lookup per candidate reads at most four.
 */
async function snapshotIsCited(
  ctx: MutationCtx,
  snapshotId: Id<"rawSnapshots">,
): Promise<boolean> {
  const citingTables = [
    "salaryObservations",
    "salaryMarketObservations",
    "cityCostObservations",
    "jobPostingVersions",
  ] as const;
  for (const table of citingTables) {
    const citation = await ctx.db
      .query(table)
      .withIndex("by_snapshotId", (q) => q.eq("snapshotId", snapshotId))
      .first();
    if (citation !== null) return true;
  }
  return false;
}

function budgetFor(limit: number): number {
  return Math.min(Math.max(limit, 1), 1_000);
}

/**
 * Each table is pruned by its own mutation, and the cron schedules each
 * separately.
 *
 * They used to share one transaction, so the snapshot pass exceeding the read
 * limit rolled back the version and run passes with it — the whole retention
 * system was down, not one third of it.
 */
export const pruneVersions = internalMutation({
  args: { limit: v.number() },
  returns: pruneResultValidator,
  handler: async (ctx, args) => {
    const rule = retentionRule("jobPostingVersions");
    if (rule === null) {
      return { table: "jobPostingVersions", examined: 0, deleted: 0, keptForReference: 0, keptForMinimum: 0 };
    }
    const cutoff = Date.now() - rule.keepDays * DAY_MS;
    const expired = await ctx.db
      .query("jobPostingVersions")
      .withIndex("by_capturedAt", (q) => q.lt("capturedAt", cutoff))
      .take(budgetFor(args.limit));
    let deleted = 0;
    let keptForMinimum = 0;
    const newestByPosting = new Map<string, number[]>();
    for (const version of expired) {
      const key = version.postingId as string;
      if (!newestByPosting.has(key)) {
        const recent = await ctx.db
          .query("jobPostingVersions")
          .withIndex("by_postingId_and_capturedAt", (q) => q.eq("postingId", version.postingId))
          .order("desc")
          .take(rule.minimumKeptPerParent);
        newestByPosting.set(key, recent.map((entry) => entry.capturedAt));
      }
      if (newestByPosting.get(key)?.includes(version.capturedAt) === true) {
        keptForMinimum += 1;
        continue;
      }
      await ctx.db.delete(version._id);
      deleted += 1;
    }
    return {
      table: "jobPostingVersions",
      examined: expired.length,
      deleted,
      keptForReference: 0,
      keptForMinimum,
    };
  },
});

export const pruneSnapshots = internalMutation({
  args: { limit: v.optional(v.number()) },
  returns: pruneResultValidator,
  handler: async (ctx, args) => {
    const rule = retentionRule("rawSnapshots");
    if (rule === null) {
      return { table: "rawSnapshots", examined: 0, deleted: 0, keptForReference: 0, keptForMinimum: 0 };
    }
    const cutoff = Date.now() - rule.keepDays * DAY_MS;
    // Only expired snapshots are read. The previous version took the first N
    // rows of the whole table and filtered afterwards, so a table with nothing
    // to prune still paid to read it.
    const expired = await ctx.db
      .query("rawSnapshots")
      .withIndex("by_creation_time", (q) => q.lt("_creationTime", cutoff))
      .take(Math.min(args.limit ?? SNAPSHOT_BATCH, SNAPSHOT_BATCH));
    let deleted = 0;
    let keptForReference = 0;
    for (const snapshot of expired) {
      if (await snapshotIsCited(ctx, snapshot._id)) {
        keptForReference += 1;
        continue;
      }
      await ctx.db.delete(snapshot._id);
      deleted += 1;
    }
    return {
      table: "rawSnapshots",
      examined: expired.length,
      deleted,
      keptForReference,
      keptForMinimum: 0,
    };
  },
});

export const pruneRuns = internalMutation({
  args: { limit: v.number() },
  returns: pruneResultValidator,
  handler: async (ctx, args) => {
    const rule = retentionRule("sourceRuns");
    if (rule === null) {
      return { table: "sourceRuns", examined: 0, deleted: 0, keptForReference: 0, keptForMinimum: 0 };
    }
    const cutoff = Date.now() - rule.keepDays * DAY_MS;
    const expired = await ctx.db
      .query("sourceRuns")
      .withIndex("by_creation_time", (q) => q.lt("_creationTime", cutoff))
      .take(budgetFor(args.limit));
    let deleted = 0;
    let keptForMinimum = 0;
    const keptBySource = new Map<string, Set<Id<"sourceRuns">>>();
    for (const run of expired) {
      const key = run.sourceId as string;
      if (!keptBySource.has(key)) {
        const recent = await ctx.db
          .query("sourceRuns")
          .withIndex("by_sourceId_and_startedAt", (q) => q.eq("sourceId", run.sourceId))
          .order("desc")
          .take(rule.minimumKeptPerParent);
        keptBySource.set(key, new Set(recent.map((entry) => entry._id)));
      }
      if (keptBySource.get(key)?.has(run._id) === true) {
        keptForMinimum += 1;
        continue;
      }
      await ctx.db.delete(run._id);
      deleted += 1;
    }
    return {
      table: "sourceRuns",
      examined: expired.length,
      deleted,
      keptForReference: 0,
      keptForMinimum,
    };
  },
});
