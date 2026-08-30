import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { summarizeSourceHealth } from "../lib/source-operations";
import { researchSourceRegistry } from "../lib/source-registry";
import { sourceRegistryFields } from "./schema";

const sourceRegistryDocValidator = v.object({
  _id: v.id("sourceRegistry"),
  _creationTime: v.number(),
  ...sourceRegistryFields,
});

/** Read-only source health for the product evidence UI and operations view. */
export const listHealth = query({
  args: {},
  returns: v.array(sourceRegistryDocValidator),
  handler: async (ctx) => {
    return await ctx.db.query("sourceRegistry").take(100);
  },
});

/**
 * One operator-facing verdict on whether the research fleet is fit to release.
 * Individual source rows already exist, but a release decision needs the fleet
 * answered in one place, including which sources are blocking it.
 */
export const operatorHealthSummary = query({
  args: {},
  returns: v.object({
    checkedAt: v.number(),
    total: v.number(),
    current: v.number(),
    aging: v.number(),
    stale: v.number(),
    neverSucceeded: v.number(),
    disabled: v.number(),
    blockingKeys: v.array(v.string()),
    releaseReady: v.boolean(),
    headline: v.string(),
    rows: v.array(
      v.object({
        key: v.string(),
        name: v.string(),
        category: v.string(),
        state: v.union(
          v.literal("current"),
          v.literal("aging"),
          v.literal("stale"),
          v.literal("never_succeeded"),
          v.literal("disabled"),
        ),
        ageMs: v.union(v.number(), v.null()),
        consecutiveFailures: v.number(),
        blocksRelease: v.boolean(),
        note: v.string(),
      }),
    ),
  }),
  handler: async (ctx) => {
    const sources = await ctx.db.query("sourceRegistry").take(100);
    // `dataset` is a data category ("jobs", "housing"), so several sources share
    // one value. An operator needs the specific source that is blocking, so the
    // catalogue title wins and the key is the fallback.
    const catalogueNames = new Map(
      researchSourceRegistry.map((entry) => [entry.key, entry.name] as const),
    );
    return summarizeSourceHealth(
      sources.map((source) => ({
        key: source.key,
        name: catalogueNames.get(source.key) ?? source.key,
        category: source.dataset,
        enabled: source.enabled,
        health: source.health,
        consecutiveFailures: source.consecutiveFailures,
        lastAttemptedAt: source.lastAttemptedAt ?? null,
        lastSuccessfulAt: source.lastSuccessfulAt ?? null,
        maxStalenessMs: source.maxStalenessMinutes * 60_000,
      })),
      Date.now(),
    );
  },
});

/** Compact run diagnostics for reviewed sources; raw snapshots stay private. */
export const recentRuns = internalQuery({
  args: { sourceKeys: v.array(v.string()) },
  returns: v.array(
    v.object({
      sourceKey: v.string(),
      status: v.string(),
      startedAt: v.number(),
      finishedAt: v.optional(v.number()),
      recordsSeen: v.number(),
      recordsAccepted: v.number(),
      recordsRejected: v.number(),
      errorCode: v.optional(v.string()),
      errorMessage: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const results = [];
    for (const sourceKey of args.sourceKeys.slice(0, 20)) {
      const source = await ctx.db
        .query("sourceRegistry")
        .withIndex("by_key", (q) => q.eq("key", sourceKey))
        .unique();
      if (source === null) continue;
      const runs = await ctx.db
        .query("sourceRuns")
        .withIndex("by_sourceId_and_startedAt", (q) => q.eq("sourceId", source._id))
        .order("desc")
        .take(3);
      results.push(
        ...runs.map((run) => ({
          sourceKey,
          status: run.status,
          startedAt: run.startedAt,
          finishedAt: run.finishedAt,
          recordsSeen: run.recordsSeen,
          recordsAccepted: run.recordsAccepted,
          recordsRejected: run.recordsRejected,
          errorCode: run.errorCode,
          errorMessage: run.errorMessage,
        })),
      );
    }
    return results;
  },
});

export const getByKey = internalQuery({
  args: { key: v.string() },
  returns: v.union(sourceRegistryDocValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sourceRegistry")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
  },
});

/** Begin one company-scoped provider run after the catalog has been synchronized. */
export const beginProviderRun = internalMutation({
  args: {
    sourceKey: v.string(),
    runKey: v.string(),
    requestHash: v.string(),
  },
  returns: v.object({ runId: v.id("sourceRuns"), sourceId: v.id("sourceRegistry") }),
  handler: async (ctx, args) => {
    const source = await ctx.db
      .query("sourceRegistry")
      .withIndex("by_key", (q) => q.eq("key", args.sourceKey))
      .unique();
    if (source === null || !source.enabled || source.kind !== "company_api") {
      throw new Error(`Career source ${args.sourceKey} is not enabled.`);
    }
    const now = Date.now();
    const runId = await ctx.db.insert("sourceRuns", {
      sourceId: source._id,
      runKey: args.runKey,
      status: "running",
      startedAt: now,
      requestHash: args.requestHash,
      recordsSeen: 0,
      recordsAccepted: 0,
      recordsRejected: 0,
      parserVersion: "career-feeds-v7",
    });
    await ctx.db.patch(source._id, { lastAttemptedAt: now });
    return { runId, sourceId: source._id };
  },
});

/** Begin a deduplicated run for a reviewed official source. */
export const beginOfficialRun = internalMutation({
  args: {
    sourceKey: v.string(),
    runKey: v.string(),
    requestHash: v.string(),
    parserVersion: v.string(),
  },
  returns: v.union(
    v.object({ runId: v.id("sourceRuns"), sourceId: v.id("sourceRegistry") }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const source = await ctx.db
      .query("sourceRegistry")
      .withIndex("by_key", (q) => q.eq("key", args.sourceKey))
      .unique();
    if (source === null || !source.enabled || source.kind !== "official") {
      throw new Error(`Official source ${args.sourceKey} is not enabled.`);
    }
    const priorRuns = await ctx.db
      .query("sourceRuns")
      .withIndex("by_runKey", (q) => q.eq("runKey", args.runKey))
      .collect();
    if (
      priorRuns.some(
        (run) =>
          run.sourceId === source._id &&
          (run.status === "running" ||
            run.status === "succeeded" ||
            run.status === "partial"),
      )
    ) {
      return null;
    }

    const now = Date.now();
    const runId = await ctx.db.insert("sourceRuns", {
      sourceId: source._id,
      runKey: args.runKey,
      status: "running",
      startedAt: now,
      requestHash: args.requestHash,
      recordsSeen: 0,
      recordsAccepted: 0,
      recordsRejected: 0,
      parserVersion: args.parserVersion,
    });
    await ctx.db.patch(source._id, { lastAttemptedAt: now });
    return { runId, sourceId: source._id };
  },
});

/**
 * Idempotently synchronize the reviewed allow-list into Convex. Existing run
 * state is preserved, while policy fields follow source control.
 */
export const syncCatalog = internalMutation({
  args: {},
  returns: v.object({ inserted: v.number(), updated: v.number(), disabled: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    let inserted = 0;
    let updated = 0;
    let disabled = 0;
    const catalogKeys = new Set(researchSourceRegistry.map((source) => source.key));

    for (const definition of researchSourceRegistry) {
      const existing = await ctx.db
        .query("sourceRegistry")
        .withIndex("by_key", (q) => q.eq("key", definition.key))
        .unique();
      const kind =
        definition.authority === "official"
          ? ("official" as const)
          : ("company_api" as const);
      const license = definition.license ??
        (definition.authority === "official"
          ? "Official reuse terms; attribution retained"
          : "Provider public-data terms; public GET access only");
      const allowedUses = ["research", "normalization", "display_with_attribution"];
      const geography =
        definition.category === "jobs" ? ["configured_company"] : ["ES", "EU"];

      const policyFields = {
        key: definition.key,
        provider: definition.name,
        dataset: definition.category,
        kind,
        baseUrl: definition.url,
        ...(definition.termsUrl === undefined ? {} : { termsUrl: definition.termsUrl }),
        license,
        allowedUses,
        geography,
        refreshCadenceMinutes: definition.refreshCadenceHours * 60,
        maxStalenessMinutes: definition.maxAgeDays * 24 * 60,
        enabled: true,
        notes: definition.limitation,
      };

      if (existing === null) {
        await ctx.db.insert("sourceRegistry", {
          ...policyFields,
          health: "healthy",
          consecutiveFailures: 0,
          nextRunAt: now,
        });
        inserted += 1;
      } else {
        await ctx.db.patch(existing._id, policyFields);
        updated += 1;
      }
    }

    const existingSources = await ctx.db.query("sourceRegistry").take(100);
    for (const source of existingSources) {
      if (!catalogKeys.has(source.key) && source.enabled) {
        await ctx.db.patch(source._id, {
          enabled: false,
          health: "paused",
          notes: "Disabled because this source is no longer in the free, credential-free catalog.",
        });
        disabled += 1;
      }
    }

    return { inserted, updated, disabled };
  },
});

/**
 * Hourly dispatcher. It only creates durable, deduplicated work; API calls and
 * parsing stay in provider-specific actions so one broken feed cannot block
 * the rest of the registry.
 */
export const enqueueDueRefreshes = internalMutation({
  args: {},
  returns: v.object({ queued: v.number(), alreadyRunning: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const dueSources = await ctx.db
      .query("sourceRegistry")
      .withIndex("by_enabled_and_nextRunAt", (q) =>
        q.eq("enabled", true).lte("nextRunAt", now),
      )
      .take(25);
    let queued = 0;
    let alreadyRunning = 0;

    for (const source of dueSources) {
      const latestRun = await ctx.db
        .query("sourceRuns")
        .withIndex("by_sourceId_and_startedAt", (q) => q.eq("sourceId", source._id))
        .order("desc")
        .first();
      if (latestRun?.status === "queued" || latestRun?.status === "running") {
        alreadyRunning += 1;
        continue;
      }

      const cadenceMs = source.refreshCadenceMinutes * 60_000;
      const runKey = `${source.key}:${Math.floor(now / cadenceMs)}`;
      const sourceRunId = await ctx.db.insert("sourceRuns", {
        sourceId: source._id,
        runKey,
        status: "queued",
        startedAt: now,
        recordsSeen: 0,
        recordsAccepted: 0,
        recordsRejected: 0,
        parserVersion: "registry-v1",
      });
      await ctx.db.insert("requests", {
        kind: "source_refresh",
        payload: { sourceId: source._id, sourceRunId, sourceKey: source.key },
        status: "pending",
        retryCount: 0,
      });
      await ctx.db.patch(source._id, {
        nextRunAt: now + cadenceMs,
      });
      queued += 1;
    }

    return { queued, alreadyRunning };
  },
});

/** Atomically claim queued work so two workers cannot fetch the same run. */
export const claimQueuedRun = internalMutation({
  args: { runId: v.id("sourceRuns") },
  returns: v.union(
    v.object({
      sourceId: v.id("sourceRegistry"),
      sourceKey: v.string(),
      baseUrl: v.string(),
      kind: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run === null || run.status !== "queued") return null;
    const source = await ctx.db.get(run.sourceId);
    if (source === null || !source.enabled) return null;

    const now = Date.now();
    await ctx.db.patch(run._id, { status: "running", startedAt: now });
    await ctx.db.patch(source._id, { lastAttemptedAt: now });
    return {
      sourceId: source._id,
      sourceKey: source.key,
      baseUrl: source.baseUrl,
      kind: source.kind,
    };
  },
});

/**
 * Store an immutable raw response once. Replays reuse the same snapshot instead
 * of duplicating payloads when an endpoint returns unchanged content.
 */
export const recordSnapshot = internalMutation({
  args: {
    runId: v.id("sourceRuns"),
    sourceUrl: v.string(),
    externalId: v.optional(v.string()),
    contentHash: v.string(),
    mimeType: v.string(),
    observedAt: v.number(),
    effectiveAt: v.optional(v.number()),
    payload: v.any(),
  },
  returns: v.object({ snapshotId: v.id("rawSnapshots"), inserted: v.boolean() }),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run === null) throw new Error("Source run not found");
    if (run.status !== "running") throw new Error("Source run is not active");

    const existing = await ctx.db
      .query("rawSnapshots")
      .withIndex("by_sourceId_and_contentHash", (q) =>
        q.eq("sourceId", run.sourceId).eq("contentHash", args.contentHash),
      )
      .first();
    if (existing !== null) {
      return { snapshotId: existing._id, inserted: false };
    }

    const snapshotId = await ctx.db.insert("rawSnapshots", {
      sourceId: run.sourceId,
      runId: run._id,
      externalId: args.externalId,
      sourceUrl: args.sourceUrl,
      contentHash: args.contentHash,
      mimeType: args.mimeType,
      observedAt: args.observedAt,
      effectiveAt: args.effectiveAt,
      payload: args.payload,
    });
    return { snapshotId, inserted: true };
  },
});

const completedRunStatusValidator = v.union(
  v.literal("succeeded"),
  v.literal("partial"),
  v.literal("failed"),
  v.literal("skipped"),
);

/** Close a run and update source health without hiding partial or failed work. */
export const completeRun = internalMutation({
  args: {
    runId: v.id("sourceRuns"),
    status: completedRunStatusValidator,
    responseHash: v.optional(v.string()),
    recordsSeen: v.number(),
    recordsAccepted: v.number(),
    recordsRejected: v.number(),
    httpStatus: v.optional(v.number()),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run === null) throw new Error("Source run not found");
    if (run.status !== "running") throw new Error("Source run is not active");
    const source = await ctx.db.get(run.sourceId);
    if (source === null) throw new Error("Source not found");
    const now = Date.now();

    await ctx.db.patch(run._id, {
      status: args.status,
      finishedAt: now,
      responseHash: args.responseHash,
      recordsSeen: args.recordsSeen,
      recordsAccepted: args.recordsAccepted,
      recordsRejected: args.recordsRejected,
      httpStatus: args.httpStatus,
      errorCode: args.errorCode,
      errorMessage: args.errorMessage,
    });

    if (args.status === "succeeded" || args.status === "partial") {
      await ctx.db.patch(source._id, {
        health: args.status === "succeeded" ? "healthy" : "degraded",
        consecutiveFailures: 0,
        lastSuccessfulAt: now,
      });
      const alerts = await ctx.db
        .query("researchAlerts")
        .withIndex("by_entityType_and_entityKey", (q) =>
          q.eq("entityType", "source").eq("entityKey", source.key),
        )
        .collect();
      for (const alert of alerts) {
        if (alert.resolvedAt === undefined) {
          await ctx.db.patch(alert._id, { resolvedAt: now });
        }
      }
      return null;
    }

    if (args.status === "failed") {
      const consecutiveFailures = source.consecutiveFailures + 1;
      await ctx.db.patch(source._id, {
        consecutiveFailures,
        health: consecutiveFailures >= 3 ? "failing" : "degraded",
      });
      const fingerprint = `source_failed:${source.key}:${args.errorCode ?? "unknown"}`;
      const matchingAlerts = await ctx.db
        .query("researchAlerts")
        .withIndex("by_fingerprint", (q) => q.eq("fingerprint", fingerprint))
        .collect();
      const existingAlert =
        matchingAlerts.find((alert) => alert.resolvedAt === undefined) ?? null;
      if (existingAlert === null) {
        await ctx.db.insert("researchAlerts", {
          entityType: "source",
          entityKey: source.key,
          kind: "source_failed",
          severity: consecutiveFailures >= 3 ? "critical" : "warning",
          message: args.errorMessage ?? "Source refresh failed without an error message.",
          detectedAt: now,
          fingerprint,
        });
      }
    }

    return null;
  },
});
