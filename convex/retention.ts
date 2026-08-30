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

async function citedSnapshotIds(ctx: MutationCtx): Promise<Set<string>> {
  const cited = new Set<string>();
  for (const status of ["accepted", "quarantined"] as const) {
    const observations = await ctx.db
      .query("salaryObservations")
      .withIndex("by_status", (q) => q.eq("status", status))
      .take(4_000);
    for (const observation of observations) cited.add(observation.snapshotId);
  }
  const costObservations = await ctx.db.query("cityCostObservations").take(2_000);
  for (const observation of costObservations) {
    if (observation.status === "accepted") cited.add(observation.snapshotId);
  }
  return cited;
}

/**
 * Deletes expired history under the published retention rules.
 *
 * `limit` bounds the work per invocation so a large backlog drains across
 * scheduled runs instead of exceeding a single transaction.
 */
export const prune = internalMutation({
  args: { limit: v.number() },
  returns: v.array(pruneResultValidator),
  handler: async (ctx, args) => {
    const now = Date.now();
    const budget = Math.min(Math.max(args.limit, 1), 1_000);
    const results: { table: string; examined: number; deleted: number; keptForReference: number; keptForMinimum: number }[] = [];

    const snapshotRule = retentionRule("rawSnapshots");
    const runRule = retentionRule("sourceRuns");
    const versionRule = retentionRule("jobPostingVersions");

    if (versionRule !== null) {
      const cutoff = now - versionRule.keepDays * DAY_MS;
      const expired = await ctx.db
        .query("jobPostingVersions")
        .withIndex("by_capturedAt", (q) => q.lt("capturedAt", cutoff))
        .take(budget);
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
            .take(versionRule.minimumKeptPerParent);
          newestByPosting.set(key, recent.map((entry) => entry.capturedAt));
        }
        if (newestByPosting.get(key)?.includes(version.capturedAt) === true) {
          keptForMinimum += 1;
          continue;
        }
        await ctx.db.delete(version._id);
        deleted += 1;
      }
      results.push({
        table: "jobPostingVersions",
        examined: expired.length,
        deleted,
        keptForReference: 0,
        keptForMinimum,
      });
    }

    if (snapshotRule !== null) {
      const cited = await citedSnapshotIds(ctx);
      const cutoff = now - snapshotRule.keepDays * DAY_MS;
      const candidates = await ctx.db.query("rawSnapshots").take(budget);
      let deleted = 0;
      let keptForReference = 0;
      const expired = candidates.filter((snapshot) => snapshot._creationTime < cutoff);
      for (const snapshot of expired) {
        if (cited.has(snapshot._id as string)) {
          keptForReference += 1;
          continue;
        }
        await ctx.db.delete(snapshot._id);
        deleted += 1;
      }
      results.push({
        table: "rawSnapshots",
        examined: expired.length,
        deleted,
        keptForReference,
        keptForMinimum: 0,
      });
    }

    if (runRule !== null) {
      const cutoff = now - runRule.keepDays * DAY_MS;
      const candidates = await ctx.db.query("sourceRuns").take(budget);
      const expired = candidates.filter((run) => run.startedAt < cutoff);
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
            .take(runRule.minimumKeptPerParent);
          keptBySource.set(key, new Set(recent.map((entry) => entry._id)));
        }
        if (keptBySource.get(key)?.has(run._id) === true) {
          keptForMinimum += 1;
          continue;
        }
        await ctx.db.delete(run._id);
        deleted += 1;
      }
      results.push({
        table: "sourceRuns",
        examined: expired.length,
        deleted,
        keptForReference: 0,
        keptForMinimum,
      });
    }

    return results;
  },
});
