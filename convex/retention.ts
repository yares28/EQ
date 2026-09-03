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
 * Snapshot batches are bounded by bytes read, not by a row count.
 *
 * These rows hold the raw payload a figure was parsed from, and they run from
 * 5 KB to 418 KB here — an 80-fold spread. A row count is therefore a bet on
 * the average: the 194 rows that hit the 16 MB per-transaction limit averaged
 * 86 KB, and 40 rows drawn from the top of that range would exceed it just as
 * surely while looking four times more conservative. Only a byte budget bounds
 * the transaction by the quantity the limit actually measures.
 *
 * Half the ceiling, because a row's size is only known once it has been read:
 * the budget can overshoot by one row, and the citation lookups and deletes
 * are charged on top of the payload reads.
 */
const SNAPSHOT_READ_BUDGET_BYTES = 8 * 1024 * 1024;

/**
 * A ceiling on candidates per run, so that a stretch of small rows stops on
 * something before Convex's 16,384-document limit. The byte budget is the
 * bound that matters; this one only binds when rows are far below average.
 */
const SNAPSHOT_MAX_CANDIDATES = 200;

const TEXT_ENCODER = new TextEncoder();

/**
 * Serialized size of a document, for spending the read budget against.
 *
 * `payload` is `v.any()`, so a snapshot may hold a value `JSON.stringify` will
 * not measure on its own: a BigInt throws, and binary would serialize to `{}`
 * and be charged nothing. Both are handled rather than assumed away — an
 * estimate that threw would turn a prune that deletes nothing into one that
 * fails. Anything still unmeasurable is charged the largest snapshot this
 * deployment has recorded, so the budget errs toward ending a batch a row
 * early, deferring work to tomorrow instead of failing the transaction.
 */
const LARGEST_OBSERVED_SNAPSHOT_BYTES = 418 * 1024;

function documentBytes(doc: unknown): number {
  try {
    return TEXT_ENCODER.encode(
      JSON.stringify(doc, (_key, value) => {
        if (typeof value === "bigint") return value.toString();
        if (value instanceof ArrayBuffer) return "\0".repeat(value.byteLength);
        return value;
      }),
    ).length;
  } catch {
    return LARGEST_OBSERVED_SNAPSHOT_BYTES;
  }
}

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
    const maxCandidates = Math.min(
      args.limit ?? SNAPSHOT_MAX_CANDIDATES,
      SNAPSHOT_MAX_CANDIDATES,
    );
    let examined = 0;
    let deleted = 0;
    let keptForReference = 0;
    let bytesRead = 0;
    // Only expired snapshots are read: the index range ends at the cutoff, so a
    // table with nothing to prune reads nothing. Iterating rather than taking a
    // fixed count is what makes the byte budget real — Convex yields one
    // document per step, measured, so breaking stops the reads instead of
    // discarding rows already paid for.
    for await (const snapshot of ctx.db
      .query("rawSnapshots")
      .withIndex("by_creation_time", (q) => q.lt("_creationTime", cutoff))) {
      examined += 1;
      bytesRead += documentBytes(snapshot);
      if (await snapshotIsCited(ctx, snapshot._id)) {
        keptForReference += 1;
      } else {
        await ctx.db.delete(snapshot._id);
        deleted += 1;
      }
      if (bytesRead >= SNAPSHOT_READ_BUDGET_BYTES || examined >= maxCandidates) {
        break;
      }
    }
    return {
      table: "rawSnapshots",
      examined,
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
