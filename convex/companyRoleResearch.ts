import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

import { isSpainLocation } from "../lib/company-posted-salary";
import { isRelevantToSpainSoftware } from "../lib/job-relevance";

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
        requirements: [],
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
