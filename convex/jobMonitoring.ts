import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

import {
  compareJobPostings,
  type FieldChange,
  type JobChangeKind,
  type PostingState,
} from "../lib/job-change-detection";
import {
  jobPostingFieldChangeValidator,
  jobPostingStateValidator,
} from "./schema";
import {
  reconcileCompanyPostedSalary,
  withdrawCompanyPostedSalary,
} from "./companySalaryObservationCore";
import { isRelevantToSpainSoftware } from "../lib/job-relevance";
import { boundedDescription } from "../lib/job-description-format";
import { extractSkillTokens } from "../lib/skill-taxonomy";

/**
 * The skills a posting names, and the subset it requires.
 *
 * Title and description give everything mentioned; the requirements block —
 * already isolated upstream by `extractRequirements` — gives what the employer
 * actually gates on. Both are stored so the browser can score without the text.
 */
function matchTokensFor(args: {
  title: string;
  descriptionText: string;
  requirements: string[];
}): { matchTokens: string[]; mustHaveTokens: string[] } {
  const mustHaveTokens = extractSkillTokens(args.requirements.join("\n"));
  const mentioned = extractSkillTokens(`${args.title}\n${args.descriptionText}`);
  // A required skill is always also a mentioned one, even when the requirements
  // block phrases it differently from the body.
  const matchTokens = [...new Set([...mentioned, ...mustHaveTokens])].sort();
  return { matchTokens, mustHaveTokens };
}

function textHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function compactChangeValue(value: FieldChange["before"]): FieldChange["before"] {
  if (typeof value === "string") return value.slice(0, 500);
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => item.slice(0, 180));
  return null;
}

function compactMaterialChanges(changes: FieldChange[]): FieldChange[] {
  return changes
    .filter((change) => change.kind !== "description_changed")
    .map((change) => ({
      kind: change.kind,
      before: compactChangeValue(change.before),
      after: compactChangeValue(change.after),
    }));
}

function alertMessage(title: string, kinds: JobChangeKind[]): string {
  const labels: Record<JobChangeKind, string> = {
    title_changed: "title",
    location_changed: "location",
    salary_changed: "salary",
    requirements_changed: "requirements",
    description_changed: "description",
    posting_closed: "availability",
    posting_reopened: "availability",
    posting_removed: "availability",
  };
  const fields = [...new Set(kinds.map((kind) => labels[kind]))].join(", ");
  return `${title} changed: ${fields}.`;
}

/**
 * Server-only career-feed upsert. The browser cannot write monitoring data;
 * provider adapters must first pass source-run and snapshot validation.
 */
export const upsertPostingSnapshot = internalMutation({
  args: {
    companyId: v.id("companies"),
    sourceId: v.id("sourceRegistry"),
    snapshotId: v.id("rawSnapshots"),
    externalId: v.string(),
    canonicalUrl: v.string(),
    title: v.string(),
    canonicalTitle: v.optional(v.string()),
    locations: v.array(v.string()),
    salaryText: v.optional(v.string()),
    requirements: v.array(v.string()),
    descriptionText: v.string(),
    contentHash: v.string(),
    state: jobPostingStateValidator,
    relevantToSpainSoftware: v.boolean(),
    observedAt: v.number(),
  },
  returns: v.object({
    postingId: v.id("jobPostings"),
    versionId: v.union(v.id("jobPostingVersions"), v.null()),
    changed: v.boolean(),
    material: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("jobPostings")
      .withIndex("by_company_source_externalId", (q) =>
        q
          .eq("companyId", args.companyId)
          .eq("sourceId", args.sourceId)
          .eq("externalId", args.externalId),
      )
      .unique();
    const descriptionHash = textHash(args.descriptionText);
    // Only Spain-tech postings are ever scored or shown, so only they carry
    // tokens — the same scope rule `descriptionText` follows.
    const tokens = args.relevantToSpainSoftware
      ? matchTokensFor({
          title: args.title,
          descriptionText: args.descriptionText,
          requirements: args.requirements,
        })
      : null;
    const reconcileSalary = async (postingId: Id<"jobPostings">, wasRelevant = false) => {
      if (!args.relevantToSpainSoftware && !wasRelevant) return;
      await reconcileCompanyPostedSalary(ctx, {
        companyId: args.companyId,
        sourceId: args.sourceId,
        snapshotId: args.snapshotId,
        postingId,
        externalId: args.externalId,
        canonicalUrl: args.canonicalUrl,
        title: args.title,
        locations: args.locations,
        salaryText: args.salaryText,
        state: args.state,
        observedAt: args.observedAt,
      });
    };

    if (existing === null) {
      const postingId = await ctx.db.insert("jobPostings", {
        companyId: args.companyId,
        sourceId: args.sourceId,
        externalId: args.externalId,
        canonicalUrl: args.canonicalUrl,
        title: args.title,
        canonicalTitle: args.canonicalTitle,
        locations: args.locations,
        contentHash: args.contentHash,
        state: args.state,
        firstSeenAt: args.observedAt,
        lastSeenAt: args.observedAt,
        closedAt: args.state === "closed" ? args.observedAt : undefined,
        successfulMissCount: 0,
        relevantToSpainSoftware: args.relevantToSpainSoftware,
        descriptionText: boundedDescription(args.descriptionText),
        salaryText: args.salaryText,
        matchTokens: tokens?.matchTokens,
        mustHaveTokens: tokens?.mustHaveTokens,
      });
      const versionId = await ctx.db.insert("jobPostingVersions", {
        postingId,
        snapshotId: args.snapshotId,
        contentHash: args.contentHash,
        capturedAt: args.observedAt,
        title: args.title,
        state: args.state,
        salaryText: args.salaryText,
        requirementsText: args.requirements.join("\n"),
        requirements: args.requirements,
        descriptionHash,
        locations: args.locations,
        changeKinds: [],
        changes: [],
        hasMaterialChange: false,
        relevantToSpainSoftware: args.relevantToSpainSoftware,
      });
      await reconcileSalary(postingId);
      return { postingId, versionId, changed: false, material: false };
    }

    const previousVersion = await ctx.db
      .query("jobPostingVersions")
      .withIndex("by_postingId_and_capturedAt", (q) => q.eq("postingId", existing._id))
      .order("desc")
      .first();
    const comparison = compareJobPostings(
      {
        title: previousVersion?.title ?? existing.title,
        locations: previousVersion?.locations ?? existing.locations,
        salaryText: previousVersion?.salaryText ?? null,
        requirements: previousVersion?.requirements ?? [],
        descriptionText: previousVersion?.descriptionHash ?? existing.contentHash,
        state: (previousVersion?.state ?? existing.state) as PostingState,
      },
      {
        title: args.title,
        locations: args.locations,
        salaryText: args.salaryText ?? null,
        requirements: args.requirements,
        descriptionText: descriptionHash,
        state: args.state as PostingState,
      },
    );

    await ctx.db.patch(existing._id, {
      companyId: args.companyId,
      canonicalUrl: args.canonicalUrl,
      title: args.title,
      canonicalTitle: args.canonicalTitle,
      locations: args.locations,
      contentHash: args.contentHash,
      state: args.state,
      lastSeenAt: args.observedAt,
      closedAt: args.state === "closed" ? existing.closedAt ?? args.observedAt : undefined,
      successfulMissCount: 0,
      relevantToSpainSoftware: args.relevantToSpainSoftware,
    });

    // A role entering the configured geography is a new monitoring baseline,
    // not evidence that the employer changed salary or requirements.
    if (args.relevantToSpainSoftware && existing.relevantToSpainSoftware !== true) {
      // Entering scope is the first moment this posting's text is worth
      // keeping — it was never captured while the posting was out of scope.
      await ctx.db.patch(existing._id, {
        descriptionText: boundedDescription(args.descriptionText),
        salaryText: args.salaryText,
        matchTokens: tokens?.matchTokens,
        mustHaveTokens: tokens?.mustHaveTokens,
      });
      const versionId = await ctx.db.insert("jobPostingVersions", {
        postingId: existing._id,
        snapshotId: args.snapshotId,
        contentHash: args.contentHash,
        capturedAt: args.observedAt,
        title: args.title,
        state: args.state,
        salaryText: args.salaryText,
        requirementsText: args.requirements.join("\n"),
        requirements: args.requirements,
        descriptionHash,
        locations: args.locations,
        changeKinds: [],
        changes: [],
        hasMaterialChange: false,
        relevantToSpainSoftware: true,
      });
      await reconcileSalary(existing._id);
      return { postingId: existing._id, versionId, changed: true, material: false };
    }

    if (!comparison.changed) {
      // The common case: nothing about the posting moved. This is also the
      // only place a posting synced before `descriptionText`/`salaryText`
      // existed gets backfilled, since "nothing changed" is exactly when the
      // changed-branch backfill below never runs.
      const backfill: {
        descriptionText?: string;
        salaryText?: string;
        matchTokens?: string[];
        mustHaveTokens?: string[];
      } = {};
      if (existing.descriptionText === undefined) {
        backfill.descriptionText = boundedDescription(args.descriptionText);
      }
      if (existing.salaryText === undefined && args.salaryText !== undefined) {
        backfill.salaryText = args.salaryText;
      }
      if (existing.matchTokens === undefined && tokens !== null) {
        backfill.matchTokens = tokens.matchTokens;
        backfill.mustHaveTokens = tokens.mustHaveTokens;
      }
      if (Object.keys(backfill).length > 0) {
        await ctx.db.patch(existing._id, backfill);
      }
      await reconcileSalary(existing._id, existing.relevantToSpainSoftware === true);
      return { postingId: existing._id, versionId: null, changed: false, material: false };
    }

    // The comparison already knows whether the description or salary itself
    // moved — an unrelated edit (a requirements tweak, say) must not rewrite
    // several KB of unchanged text just because something else on the posting
    // differed. The `undefined` checks are what backfill a posting synced
    // before these fields existed: its own content may never change again, so
    // "only on *_changed" would otherwise leave it uncaptured forever.
    const changedFields: {
      descriptionText?: string;
      salaryText?: string;
      matchTokens?: string[];
      mustHaveTokens?: string[];
    } = {};
    if (existing.descriptionText === undefined || comparison.kinds.includes("description_changed")) {
      changedFields.descriptionText = boundedDescription(args.descriptionText);
    }
    // Tokens derive from the title, description and requirements, so they move
    // exactly when one of those does.
    if (
      tokens !== null &&
      (existing.matchTokens === undefined ||
        comparison.kinds.includes("description_changed") ||
        comparison.kinds.includes("requirements_changed") ||
        comparison.kinds.includes("title_changed"))
    ) {
      changedFields.matchTokens = tokens.matchTokens;
      changedFields.mustHaveTokens = tokens.mustHaveTokens;
    }
    if (
      args.salaryText !== undefined &&
      (existing.salaryText === undefined || comparison.kinds.includes("salary_changed"))
    ) {
      changedFields.salaryText = args.salaryText;
    }
    if (Object.keys(changedFields).length > 0) {
      await ctx.db.patch(existing._id, changedFields);
    }

    const compactChanges = compactMaterialChanges(comparison.changes);
    const versionId = await ctx.db.insert("jobPostingVersions", {
      postingId: existing._id,
      snapshotId: args.snapshotId,
      contentHash: args.contentHash,
      capturedAt: args.observedAt,
      title: args.title,
      state: args.state,
      salaryText: args.salaryText,
      requirementsText: args.requirements.join("\n"),
      requirements: args.requirements,
      descriptionHash,
      locations: args.locations,
      changeKinds: comparison.kinds,
      changes: compactChanges,
      hasMaterialChange: comparison.kinds.length > 0 && compactChanges.length > 0,
      relevantToSpainSoftware:
        args.relevantToSpainSoftware || existing.relevantToSpainSoftware === true,
    });

    if (
      comparison.material &&
      (args.relevantToSpainSoftware || existing.relevantToSpainSoftware === true)
    ) {
      const fingerprint = `job:${existing._id}:${args.contentHash}:${comparison.kinds.join("|")}`;
      const duplicate = await ctx.db
        .query("researchAlerts")
        .withIndex("by_fingerprint", (q) => q.eq("fingerprint", fingerprint))
        .first();
      if (duplicate === null) {
        const removed = comparison.kinds.includes("posting_removed");
        await ctx.db.insert("researchAlerts", {
          entityType: "job_posting",
          entityKey: existing._id,
          kind: removed ? "job_removed" : "job_changed",
          severity: removed || comparison.kinds.includes("posting_closed") ? "warning" : "info",
          message: alertMessage(args.title, comparison.kinds),
          detectedAt: args.observedAt,
          fingerprint,
        });
      }
    }

    await reconcileSalary(existing._id, existing.relevantToSpainSoftware === true);
    return { postingId: existing._id, versionId, changed: true, material: comparison.material };
  },
});

/** Repair one proven false positive created when a role first entered scope. */
export const repairRelevanceBaselineVersion = internalMutation({
  args: { versionId: v.id("jobPostingVersions") },
  returns: v.object({ repaired: v.boolean(), alertsResolved: v.number() }),
  handler: async (ctx, args) => {
    const version = await ctx.db.get(args.versionId);
    if (version === null || version.relevantToSpainSoftware !== true || version.changeKinds.length === 0) {
      return { repaired: false, alertsResolved: 0 };
    }
    const previous = await ctx.db
      .query("jobPostingVersions")
      .withIndex("by_postingId_and_capturedAt", (q) =>
        q.eq("postingId", version.postingId).lt("capturedAt", version.capturedAt),
      )
      .order("desc")
      .first();
    if (previous?.relevantToSpainSoftware === true) {
      return { repaired: false, alertsResolved: 0 };
    }

    await ctx.db.patch(version._id, { changeKinds: [], changes: [] });
    let alertsResolved = 0;
    const now = Date.now();
    const alerts = await ctx.db
      .query("researchAlerts")
      .withIndex("by_entityType_and_entityKey", (q) =>
        q.eq("entityType", "job_posting").eq("entityKey", version.postingId),
      )
      .collect();
    for (const alert of alerts) {
      if (alert.resolvedAt === undefined && alert.detectedAt === version.capturedAt) {
        await ctx.db.patch(alert._id, { resolvedAt: now });
        alertsResolved += 1;
      }
    }
    return { repaired: true, alertsResolved };
  },
});

/** Replays the current deterministic scope classifier without inventing job changes. */
export const reclassifyStoredScope = internalMutation({
  args: { limit: v.number() },
  returns: v.object({
    postingsReviewed: v.number(),
    postingsUpdated: v.number(),
    versionsReviewed: v.number(),
    versionsUpdated: v.number(),
    alertsResolved: v.number(),
    salariesWithdrawn: v.number(),
  }),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(Math.floor(args.limit), 1), 5_000);
    const postings = await ctx.db.query("jobPostings").take(limit);
    const postingById = new Map(postings.map((posting) => [String(posting._id), posting]));
    const relevantPostingIds = new Set<string>();
    let postingsUpdated = 0;
    let salariesWithdrawn = 0;
    for (const posting of postings) {
      const relevant = isRelevantToSpainSoftware(posting.title, posting.locations);
      if (relevant) relevantPostingIds.add(String(posting._id));
      if (posting.relevantToSpainSoftware === relevant) continue;
      await ctx.db.patch(posting._id, { relevantToSpainSoftware: relevant });
      if (!relevant) {
        salariesWithdrawn += await withdrawCompanyPostedSalary(ctx, posting._id, Date.now());
      }
      postingsUpdated += 1;
    }

    const versions = await ctx.db.query("jobPostingVersions").take(limit);
    let versionsUpdated = 0;
    for (const version of versions) {
      const posting = postingById.get(String(version.postingId));
      if (posting === undefined) continue;
      const relevant = isRelevantToSpainSoftware(version.title ?? posting.title, version.locations);
      if (version.relevantToSpainSoftware === relevant) continue;
      await ctx.db.patch(version._id, { relevantToSpainSoftware: relevant });
      versionsUpdated += 1;
    }

    const alerts = await ctx.db.query("researchAlerts").take(limit);
    let alertsResolved = 0;
    const resolvedAt = Date.now();
    for (const alert of alerts) {
      if (
        alert.resolvedAt !== undefined ||
        alert.entityType !== "job_posting" ||
        relevantPostingIds.has(alert.entityKey)
      ) continue;
      await ctx.db.patch(alert._id, { resolvedAt });
      alertsResolved += 1;
    }
    return {
      postingsReviewed: postings.length,
      postingsUpdated,
      versionsReviewed: versions.length,
      versionsUpdated,
      alertsResolved,
      salariesWithdrawn,
    };
  },
});

/**
 * Server-only completion step. A role must be absent from two complete,
 * successful runs before removal; failed or partial runs never call this.
 */
export const finalizeCompleteFeed = internalMutation({
  args: {
    companyId: v.id("companies"),
    sourceId: v.id("sourceRegistry"),
    seenExternalIds: v.array(v.string()),
    observedAt: v.number(),
  },
  returns: v.object({
    reviewed: v.number(),
    missed: v.number(),
    removed: v.number(),
    /** True when the read hit its bound, so some postings were not reconciled
     * this run and could otherwise linger as active forever. */
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const seen = new Set(args.seenExternalIds);
    // Measured headroom: the largest company+source pair holds ~859 postings
    // at ~640 bytes each (~0.5 MB), and this bound is ~3 MB against Convex's
    // 16 MB per-transaction read limit. The bound is a correctness guard, not
    // a performance one — the risk it covers is a feed growing past it and
    // silently leaving the overflow unreconciled, so hitting it is reported
    // rather than passing as a clean run.
    const REVIEW_BOUND = 5_000;
    const postings = await ctx.db
      .query("jobPostings")
      .withIndex("by_company_source_externalId", (q) =>
        q.eq("companyId", args.companyId).eq("sourceId", args.sourceId),
      )
      .take(REVIEW_BOUND);
    const truncated = postings.length >= REVIEW_BOUND;
    let missed = 0;
    let removed = 0;

    for (const posting of postings) {
      if (seen.has(posting.externalId)) {
        if ((posting.successfulMissCount ?? 0) !== 0) {
          await ctx.db.patch(posting._id, { successfulMissCount: 0 });
        }
        continue;
      }
      if (posting.state === "removed" || posting.state === "closed") continue;

      missed += 1;
      const successfulMissCount = (posting.successfulMissCount ?? 0) + 1;
      if (successfulMissCount < 2) {
        await ctx.db.patch(posting._id, { successfulMissCount });
        continue;
      }

      const previousVersion = await ctx.db
        .query("jobPostingVersions")
        .withIndex("by_postingId_and_capturedAt", (q) => q.eq("postingId", posting._id))
        .order("desc")
        .first();
      await ctx.db.patch(posting._id, {
        state: "removed",
        closedAt: args.observedAt,
        successfulMissCount,
      });
      await withdrawCompanyPostedSalary(ctx, posting._id, args.observedAt);
      if (previousVersion !== null) {
        await ctx.db.insert("jobPostingVersions", {
          postingId: posting._id,
          snapshotId: previousVersion.snapshotId,
          contentHash: `${posting.contentHash}:removed`,
          capturedAt: args.observedAt,
          title: posting.title,
          state: "removed",
          salaryText: previousVersion.salaryText,
          requirementsText: previousVersion.requirementsText,
          requirements: previousVersion.requirements,
          descriptionHash: previousVersion.descriptionHash,
          locations: posting.locations,
          changeKinds: ["posting_removed"],
          changes: [{ kind: "posting_removed", before: posting.state, after: "removed" }],
          hasMaterialChange: true,
          relevantToSpainSoftware: posting.relevantToSpainSoftware,
        });
      }
      const fingerprint = `job:${posting._id}:removed`;
      const duplicate = await ctx.db
        .query("researchAlerts")
        .withIndex("by_fingerprint", (q) => q.eq("fingerprint", fingerprint))
        .first();
      if (duplicate === null) {
        await ctx.db.insert("researchAlerts", {
          entityType: "job_posting",
          entityKey: posting._id,
          kind: "job_removed",
          severity: "warning",
          message: `${posting.title} is no longer present in two complete career-feed checks.`,
          detectedAt: args.observedAt,
          fingerprint,
        });
      }
      removed += 1;
    }

    if (truncated) {
      // Raised once per company+source rather than per run, so a persistently
      // oversized feed does not flood the alert list.
      const fingerprint = `feed-truncated:${args.companyId}:${args.sourceId}`;
      const duplicate = await ctx.db
        .query("researchAlerts")
        .withIndex("by_fingerprint", (q) => q.eq("fingerprint", fingerprint))
        .first();
      if (duplicate === null) {
        await ctx.db.insert("researchAlerts", {
          entityType: "company",
          entityKey: args.companyId,
          kind: "schema_changed",
          severity: "critical",
          message:
            `A career feed returned at least ${REVIEW_BOUND} postings, so this run could not ` +
            "reconcile all of them. Postings beyond the bound stay marked active until this is " +
            "batched across runs.",
          detectedAt: args.observedAt,
          fingerprint,
        });
      }
    }

    return { reviewed: postings.length, missed, removed, truncated };
  },
});

/** Read-only change feed for the user-facing research updates page. */
export const listRecentChanges = query({
  args: { limit: v.number() },
  returns: v.array(
    v.object({
      versionId: v.id("jobPostingVersions"),
      company: v.string(),
      title: v.string(),
      url: v.string(),
      locations: v.array(v.string()),
      state: jobPostingStateValidator,
      capturedAt: v.number(),
      kinds: v.array(v.string()),
      changes: v.array(jobPostingFieldChangeValidator),
    }),
  ),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit, 1), 50);
    // Walk only versions that recorded a change, newest-first. The relevance
    // index alone still returned mostly unchanged rows — since only ~2% of
    // versions carry a change, filling a 50-row list meant over-fetching 20x
    // the limit and discarding almost all of it. Narrowing on the change flag
    // means the read is proportional to what is returned. The small headroom
    // covers rows dropped below for a missing posting or company.
    const versions = await ctx.db
      .query("jobPostingVersions")
      .withIndex("by_relevance_change_capturedAt", (q) =>
        q.eq("relevantToSpainSoftware", true).eq("hasMaterialChange", true),
      )
      .order("desc")
      .take(Math.min(limit * 2, 120));
    const results: Array<{
      versionId: Id<"jobPostingVersions">;
      company: string;
      title: string;
      url: string;
      locations: string[];
      state: PostingState;
      capturedAt: number;
      kinds: string[];
      changes: Array<{
        kind: string;
        before: string | string[] | null;
        after: string | string[] | null;
      }>;
    }> = [];

    // A change feed is usually dominated by a handful of employers, so the
    // same company rows were being re-read for most entries.
    const companyCache = new Map<Id<"companies">, Doc<"companies"> | null>();
    async function companyById(id: Id<"companies">) {
      const cached = companyCache.get(id);
      if (cached !== undefined) return cached;
      const doc = await ctx.db.get(id);
      companyCache.set(id, doc);
      return doc;
    }

    for (const version of versions) {
      if (version.changeKinds.length === 0 || (version.changes?.length ?? 0) === 0) continue;
      const posting = await ctx.db.get(version.postingId);
      if (posting === null) continue;
      if (
        version.relevantToSpainSoftware !== true &&
        posting.relevantToSpainSoftware !== true
      ) continue;
      const company = await companyById(posting.companyId);
      if (company === null) continue;
      results.push({
        versionId: version._id,
        company: company.canonicalName,
        title: version.title ?? posting.title,
        url: posting.canonicalUrl,
        locations: version.locations,
        state: (version.state ?? posting.state) as PostingState,
        capturedAt: version.capturedAt,
        kinds: version.changeKinds,
        changes: version.changes ?? [],
      });
      if (results.length >= limit) break;
    }
    return results;
  },
});

export const getOverview = query({
  args: {},
  returns: v.object({
    activeRoles: v.number(),
    changedLastSevenDays: v.number(),
    unresolvedAlerts: v.number(),
  }),
  handler: async (ctx) => {
    const now = Date.now();

    // Sum the per-company counter rather than reading every relevant posting.
    // AGENTS.md: "There is no count without reading rows. To show a count,
    // either read only the exact rows via a compound index, or maintain a
    // counter." This reads one row per company instead of up to 5,000
    // postings, on a subscription that re-runs on every monitoring write.
    const companies = (await ctx.db.query("companies").take(500)).filter(
      (company) => company.active && company.mergedInto === undefined,
    );
    let activeRoles = 0;
    for (const company of companies) {
      if (company.openRoleCount !== undefined) {
        activeRoles += company.openRoleCount;
        continue;
      }
      // Only companies not yet scanned since the counter was introduced fall
      // through, so this stays bounded rather than becoming an N+1 again.
      activeRoles += (
        await ctx.db
          .query("jobPostings")
          .withIndex("by_company_relevance_state", (q) =>
            q.eq("companyId", company._id).eq("relevantToSpainSoftware", true).eq("state", "active"),
          )
          .take(5_000)
      ).length;
    }

    // Reads only versions that actually recorded a change, via the compound
    // index, rather than every version in the window filtered in JS. At current
    // volume that is ~55 rows instead of ~2,900.
    const recentChangedVersions = await ctx.db
      .query("jobPostingVersions")
      .withIndex("by_relevance_change_capturedAt", (q) =>
        q
          .eq("relevantToSpainSoftware", true)
          .eq("hasMaterialChange", true)
          .gte("capturedAt", now - 7 * 24 * 60 * 60_000),
      )
      .take(5_000);

    const unresolved = await ctx.db
      .query("researchAlerts")
      .withIndex("by_resolvedAt", (q) => q.eq("resolvedAt", undefined))
      .take(5_000);

    // Relevance is resolved per alert rather than by pre-reading every posting
    // to build a Set. Bounded by the open-alert count, which is small and
    // self-limiting, instead of by the size of the postings table.
    const postingRelevance = new Map<string, boolean>();
    let unresolvedAlerts = 0;
    for (const alert of unresolved) {
      if (alert.entityType !== "job_posting") {
        unresolvedAlerts += 1;
        continue;
      }
      const cached = postingRelevance.get(alert.entityKey);
      if (cached !== undefined) {
        if (cached) unresolvedAlerts += 1;
        continue;
      }
      // A direct id lookup — a .filter() over an index range would read the
      // whole range to find one row, which is the pattern this rewrite exists
      // to remove. normalizeId returns null if the key is not a posting id.
      const postingId = ctx.db.normalizeId("jobPostings", alert.entityKey);
      const posting = postingId === null ? null : await ctx.db.get(postingId);
      const relevant = posting !== null && posting.relevantToSpainSoftware === true;
      postingRelevance.set(alert.entityKey, relevant);
      if (relevant) unresolvedAlerts += 1;
    }

    return {
      activeRoles,
      changedLastSevenDays: recentChangedVersions.length,
      unresolvedAlerts,
    };
  },
});


/**
 * Backfills `hasMaterialChange` on versions written before the field existed,
 * in bounded batches so a large history cannot exceed one transaction.
 * Returns how many rows still need it.
 */
export const backfillVersionChangeFlags = internalMutation({
  args: { batchSize: v.optional(v.number()) },
  returns: v.object({ updated: v.number(), remaining: v.number() }),
  handler: async (ctx, args) => {
    const batchSize = Math.min(Math.max(args.batchSize ?? 200, 1), 1_000);
    const candidates = await ctx.db
      .query("jobPostingVersions")
      .withIndex("by_capturedAt")
      .order("desc")
      .take(4_000);
    const pending = candidates.filter((version) => version.hasMaterialChange === undefined);

    let updated = 0;
    for (const version of pending.slice(0, batchSize)) {
      await ctx.db.patch(version._id, {
        hasMaterialChange:
          version.changeKinds.length > 0 && (version.changes?.length ?? 0) > 0,
      });
      updated += 1;
    }
    return { updated, remaining: Math.max(pending.length - updated, 0) };
  },
});
