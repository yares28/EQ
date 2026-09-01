import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

import { isSpainLocation } from "../lib/company-posted-salary";
import { isRelevantToSpainSoftware } from "../lib/job-relevance";
import { boundedDescription, extractRequirements } from "../lib/job-description-format";
import { extractSkillTokens } from "../lib/skill-taxonomy";
import { withdrawCompanyPostedSalary } from "./companySalaryObservationCore";

/**
 * Roles harvested by hand from a company's careers portal.
 *
 * Fifteen of the tracked companies run an ATS discovery cannot probe —
 * SuccessFactors, Taleo, iCIMS, tenant-scoped Workday — so the cron will never
 * read their roles. A research pass can open those portals; this is where what
 * it finds goes.
 *
 * It deliberately reuses the automatic path rather than writing postings
 * directly: `upsertPostingSnapshot` already does versioning, change detection
 * and salary reconciliation, and `finalizeCompleteFeed` already decides when a
 * role that stopped appearing counts as closed. A researched role therefore
 * ages and closes by exactly the same rules as a fetched one.
 */

const RESEARCH_SOURCE_KEY = "agent_research_careers";
const PARSER_VERSION = "agent-research-v1";

function textHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

const researchedRoleValidator = v.object({
  /** The role's own page on the company's portal; also its identity. */
  url: v.string(),
  title: v.string(),
  locations: v.array(v.string()),
  /** Whatever pay text the posting stated, if any. Parsed downstream. */
  salaryText: v.optional(v.string()),
  descriptionText: v.optional(v.string()),
});

export const recordResearchedRoles = internalMutation({
  args: {
    companySlug: v.string(),
    portalUrl: v.string(),
    roles: v.array(researchedRoleValidator),
    /**
     * True when `roles` is everything the portal listed for Spain. Only then
     * can a role's absence mean it closed; a partial read must not retire the
     * roles it did not look at.
     */
    complete: v.boolean(),
  },
  returns: v.object({
    accepted: v.number(),
    rejectedOutOfScope: v.number(),
    duplicatesSkipped: v.number(),
    closed: v.number(),
    changed: v.number(),
  }),
  handler: async (ctx, args) => {
    const company = await ctx.db
      .query("companies")
      .withIndex("by_slug", (q) => q.eq("slug", args.companySlug))
      .unique();
    if (company === null) throw new Error(`Unknown company: ${args.companySlug}`);
    // The automatic fetch keeps ownership of a company until it stops working.
    // Writing researched roles alongside a live feed would double-count the
    // same postings and fight the cron's own closure decisions.
    if (company.researchStatus === "monitoring") {
      throw new Error(
        `${company.canonicalName} has a working career feed; the automatic sync owns its roles.`,
      );
    }
    if (!/^https:\/\//i.test(args.portalUrl)) {
      throw new Error("The careers portal must be an https URL.");
    }

    const now = Date.now();

    // One editorial source row stands for every researched portal. Its terms
    // are the company's own page, which is why nothing here is licensed feed
    // data and why it is not marked `company_api`.
    let source = await ctx.db
      .query("sourceRegistry")
      .withIndex("by_key", (q) => q.eq("key", RESEARCH_SOURCE_KEY))
      .unique();
    if (source === null) {
      const sourceId = await ctx.db.insert("sourceRegistry", {
        key: RESEARCH_SOURCE_KEY,
        provider: "Researched careers portal",
        dataset: "jobs",
        kind: "editorial",
        baseUrl: "https://",
        license: "Employer's own public careers page; read and attributed, not redistributed",
        allowedUses: ["research", "normalization", "display_with_attribution"],
        geography: ["ES"],
        refreshCadenceMinutes: 7 * 24 * 60,
        maxStalenessMinutes: 30 * 24 * 60,
        enabled: true,
        health: "healthy",
        consecutiveFailures: 0,
        nextRunAt: now,
        notes: "Written only by the /process research pass, for companies with no readable feed.",
      });
      source = await ctx.db.get(sourceId);
    }
    if (source === null) throw new Error("Research source could not be created.");

    const runId = await ctx.db.insert("sourceRuns", {
      sourceId: source._id,
      runKey: `${RESEARCH_SOURCE_KEY}:${company.slug}:${now}`,
      status: "running",
      startedAt: now,
      requestHash: textHash(args.portalUrl),
      recordsSeen: args.roles.length,
      recordsAccepted: 0,
      recordsRejected: 0,
      parserVersion: PARSER_VERSION,
    });

    // Scope is enforced here, not trusted from the caller: the archive is
    // Spain-and-tech by definition, and a pass that widened it would quietly
    // fill the table with roles that can never be shown.
    const inScope = args.roles.filter(
      (role) =>
        isSpainLocation(role.locations) &&
        isRelevantToSpainSoftware(role.title, role.locations),
    );
    const rejectedOutOfScope = args.roles.length - inScope.length;

    let accepted = 0;
    let duplicatesSkipped = 0;
    let changed = 0;
    const seenExternalIds: string[] = [];

    for (const role of inScope) {
      // The role's URL is its identity, and also how a role the automatic feed
      // already holds is recognised so it is not stored twice.
      const existing = await ctx.db
        .query("jobPostings")
        .withIndex("by_company_canonicalUrl", (q) =>
          q.eq("companyId", company._id).eq("canonicalUrl", role.url),
        )
        .first();
      if (existing !== null && existing.sourceId !== source._id) {
        duplicatesSkipped += 1;
        continue;
      }

      const externalId = textHash(role.url);
      seenExternalIds.push(externalId);
      const descriptionText = role.descriptionText ?? "";
      const snapshotPayload = {
        url: role.url,
        title: role.title,
        locations: role.locations,
        salaryText: role.salaryText,
        portalUrl: args.portalUrl,
      };
      const contentHash = textHash(JSON.stringify(snapshotPayload) + descriptionText);

      const snapshotId = await ctx.db.insert("rawSnapshots", {
        sourceId: source._id,
        runId,
        externalId,
        sourceUrl: role.url,
        contentHash,
        mimeType: "application/json",
        observedAt: now,
        payload: snapshotPayload,
      });

      const result = await ctx.runMutation(internal.jobMonitoring.upsertPostingSnapshot, {
        companyId: company._id,
        sourceId: source._id,
        snapshotId,
        externalId,
        canonicalUrl: role.url,
        title: role.title,
        locations: role.locations,
        salaryText: role.salaryText,
        // Parsed from the posting's own text, the same way the automatic
        // adapters do it. Passing an empty list here silently emptied
        // mustHaveTokens — the dominant signal in the CV match — for every
        // role this path wrote.
        requirements: extractRequirements(descriptionText),
        descriptionText,
        contentHash,
        state: "active" as const,
        relevantToSpainSoftware: true,
        observedAt: now,
      });
      accepted += 1;
      if (result.changed) changed += 1;
    }

    // Only a complete read may retire roles. A partial pass that called this
    // would mark everything it did not happen to see as closed.
    let closed = 0;
    if (args.complete) {
      const finalized = await ctx.runMutation(internal.jobMonitoring.finalizeCompleteFeed, {
        companyId: company._id,
        sourceId: source._id,
        seenExternalIds,
        observedAt: now,
      });
      closed = finalized.removed;
    }

    await ctx.runMutation(internal.sourceMaintenance.completeRun, {
      runId,
      status: args.complete ? ("succeeded" as const) : ("partial" as const),
      recordsSeen: args.roles.length,
      recordsAccepted: accepted,
      recordsRejected: rejectedOutOfScope + duplicatesSkipped,
    });

    await ctx.db.patch(company._id, {
      researchedPortalUrl: args.portalUrl,
      researchedPortalAt: now,
      lastCareerSyncAt: args.complete ? now : company.lastCareerSyncAt,
      lastCareerAttemptAt: now,
    });

    return { accepted, rejectedOutOfScope, duplicatesSkipped, closed, changed };
  },
});

/**
 * Spain-tech roles with no captured description, for companies /process is
 * allowed to touch — a monitored company's gap self-heals on its own cron
 * sync instead (`upsertPostingSnapshot`'s unchanged-branch backfill), and
 * writing to one here would fight the automatic fetch's ownership of it.
 *
 * Reads through `by_relevance_and_state`, which already narrows to the whole
 * archive this table exists to hold — a few hundred rows, not the millions of
 * postings tracked globally — so the `state !== "removed"` and
 * `descriptionText === undefined` checks are a JS filter over an
 * already-selective index read, not a scan.
 */
export const rolesMissingDescription = internalQuery({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      postingId: v.id("jobPostings"),
      companySlug: v.string(),
      canonicalName: v.string(),
      title: v.string(),
      url: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 25, 1), 100);
    const postings = await ctx.db
      .query("jobPostings")
      .withIndex("by_relevance_and_state", (q) => q.eq("relevantToSpainSoftware", true))
      .take(500);
    const missing = postings.filter(
      (posting) => posting.descriptionText === undefined && posting.state !== "removed",
    );

    const results = [];
    for (const posting of missing) {
      if (results.length >= limit) break;
      const company = await ctx.db.get(posting.companyId);
      if (company === null || company.researchStatus === "monitoring") continue;
      results.push({
        postingId: posting._id,
        companySlug: company.slug,
        canonicalName: company.canonicalName,
        title: posting.title,
        url: posting.canonicalUrl,
      });
    }
    return results;
  },
});

/**
 * Patches in a description a research pass read directly off one role's own
 * page — a narrow, single-purpose write, deliberately not routed through
 * `recordResearchedRoles`: that mutation's `complete` flag decides which
 * roles get marked closed for a whole company, and patching one posting's
 * text has nothing to do with that decision.
 */
export const fillMissingDescription = internalMutation({
  args: {
    postingId: v.id("jobPostings"),
    descriptionText: v.string(),
    /** The role's stated pay, verbatim, if the page you read has one. */
    salaryText: v.optional(v.string()),
  },
  returns: v.union(v.literal("filled"), v.literal("skipped_has_feed"), v.literal("skipped_no_text")),
  handler: async (ctx, args) => {
    const posting = await ctx.db.get(args.postingId);
    if (posting === null) return "skipped_no_text";
    const company = await ctx.db.get(posting.companyId);
    if (company !== null && company.researchStatus === "monitoring") return "skipped_has_feed";
    const bounded = boundedDescription(args.descriptionText);
    if (bounded === undefined) return "skipped_no_text";
    await ctx.db.patch(args.postingId, {
      descriptionText: bounded,
      ...(args.salaryText !== undefined ? { salaryText: args.salaryText } : {}),
    });
    return "filled";
  },
});

/**
 * Recomputes match tokens for researched roles from the text already stored.
 *
 * Needed once because the roles written before `recordResearchedRoles` parsed
 * requirements carry an empty `mustHaveTokens`, and nothing would refresh them:
 * their description has not changed, so the normal write rules correctly leave
 * them alone. Re-harvesting the portal would fix it too, at the cost of reading
 * every posting again for text already on file.
 */
export const rebuildResearchedTokens = internalMutation({
  args: {},
  returns: v.object({ examined: v.number(), updated: v.number() }),
  handler: async (ctx) => {
    const source = await ctx.db
      .query("sourceRegistry")
      .withIndex("by_key", (q) => q.eq("key", RESEARCH_SOURCE_KEY))
      .unique();
    if (source === null) return { examined: 0, updated: 0 };

    const postings = await ctx.db
      .query("jobPostings")
      .withIndex("by_relevance_and_state", (q) => q.eq("relevantToSpainSoftware", true))
      .take(1_000);

    let examined = 0;
    let updated = 0;
    for (const posting of postings) {
      if (posting.sourceId !== source._id) continue;
      if (posting.descriptionText === undefined) continue;
      examined += 1;
      const mustHaveTokens = extractSkillTokens(
        extractRequirements(posting.descriptionText).join("\n"),
      );
      if (mustHaveTokens.length === 0) continue;
      const matchTokens = [
        ...new Set([...(posting.matchTokens ?? []), ...mustHaveTokens]),
      ].sort();
      await ctx.db.patch(posting._id, { matchTokens, mustHaveTokens });
      updated += 1;
    }
    return { examined, updated };
  },
});

/**
 * Deletes researched roles outright, by the URL they were filed under.
 *
 * `finalizeCompleteFeed` retires a role that stopped appearing, which is right
 * when a posting closed — the archive is meant to remember it. It is wrong when
 * the role never existed: a harvest that filed a URL incorrectly (an href read
 * straight out of HTML still carrying `&amp;`, say) leaves a row that duplicates
 * a live posting and can only ever read as "closed". Nothing else can remove
 * one, so the archive would carry the mistake permanently.
 *
 * Deliberately narrow. It refuses any posting a career feed owns, so it can
 * only ever undo this module's own writes, and it takes explicit URLs rather
 * than a predicate, so it cannot clear a listing by accident.
 */
export const discardResearchedRoles = internalMutation({
  args: { companySlug: v.string(), urls: v.array(v.string()) },
  returns: v.object({
    deleted: v.number(),
    notFound: v.number(),
    refusedNotResearched: v.number(),
  }),
  handler: async (ctx, args) => {
    const company = await ctx.db
      .query("companies")
      .withIndex("by_slug", (q) => q.eq("slug", args.companySlug))
      .unique();
    if (company === null) throw new Error(`Unknown company: ${args.companySlug}`);

    const source = await ctx.db
      .query("sourceRegistry")
      .withIndex("by_key", (q) => q.eq("key", RESEARCH_SOURCE_KEY))
      .unique();
    if (source === null) return { deleted: 0, notFound: args.urls.length, refusedNotResearched: 0 };

    let deleted = 0;
    let notFound = 0;
    let refusedNotResearched = 0;

    for (const url of args.urls) {
      const posting = await ctx.db
        .query("jobPostings")
        .withIndex("by_company_canonicalUrl", (q) =>
          q.eq("companyId", company._id).eq("canonicalUrl", url),
        )
        .first();
      if (posting === null) {
        notFound += 1;
        continue;
      }
      if (posting.sourceId !== source._id) {
        refusedNotResearched += 1;
        continue;
      }

      // A posted-salary figure cited this posting; retire it before the row it
      // points at disappears, exactly as a closure would.
      await withdrawCompanyPostedSalary(ctx, posting._id, Date.now());

      const versions = await ctx.db
        .query("jobPostingVersions")
        .withIndex("by_postingId_and_capturedAt", (q) => q.eq("postingId", posting._id))
        .take(200);
      for (const version of versions) await ctx.db.delete(version._id);

      const rewrites = await ctx.db
        .query("cvRewrites")
        .withIndex("by_posting_and_version", (q) => q.eq("postingId", posting._id))
        .take(200);
      for (const rewrite of rewrites) await ctx.db.delete(rewrite._id);

      await ctx.db.delete(posting._id);
      deleted += 1;
    }

    return { deleted, notFound, refusedNotResearched };
  },
});
