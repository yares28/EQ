import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

import { salaryCompanies } from "../lib/salary-data";
import {
  discoveryAttemptsExhausted,
  shouldAutomaticallyRetryCompanyResearch,
} from "../lib/company-research-catalog";
import { extractCompanyPostedSalaryText, isSpainLocation } from "../lib/company-posted-salary";
import {
  COMPANY_REFRESH_STALE_AFTER_MS,
  companyRefreshHealth,
} from "../lib/company-refresh-health";

const UNSUPPORTED_CAREER_FEED_MESSAGE =
  "No unambiguous supported free career feed was found. Discovery retries weekly.";
/**
 * Once attempts are spent the honest statement is that this will not resolve
 * itself. Pay for these companies still arrives through research, so the
 * message says what is lost rather than implying the company is unusable.
 */
const UNTRACKABLE_CAREER_FEED_MESSAGE =
  "No readable free career feed after repeated discovery attempts. Open roles are not tracked for this company; its salary figures still come from research.";

const providerValidator = v.union(
  v.literal("greenhouse"),
  v.literal("lever"),
  v.literal("ashby"),
  v.literal("smartrecruiters"),
  v.literal("google_careers"),
  v.literal("workday"),
  v.literal("amazon_jobs"),
  v.literal("microsoft_careers"),
  v.literal("apple_careers"),
  v.literal("netflix_careers"),
);

const researchStatusValidator = v.union(
  v.literal("queued"),
  v.literal("discovering"),
  v.literal("monitoring"),
  v.literal("unsupported"),
  v.literal("failed"),
);

const careerBoardValidator = v.object({
  provider: providerValidator,
  boardKey: v.string(),
  region: v.optional(v.union(v.literal("global"), v.literal("eu"))),
  publicUrl: v.string(),
  discoveryMethod: v.union(v.literal("verified_board_name"), v.literal("exact_slug_probe")),
  confidence: v.union(v.literal("high"), v.literal("medium")),
  discoveredAt: v.number(),
});

function cleanCompanyName(value: string): string | null {
  const cleaned = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (cleaned.length < 2 || cleaned.length > 80) return null;
  if (/https?:\/\/|www\.|[<>]/i.test(cleaned)) return null;
  if (!/[\p{L}\p{N}]/u.test(cleaned)) return null;
  return cleaned;
}

function companySlug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

const companySummaryValidator = v.object({
  companyId: v.id("companies"),
  canonicalName: v.string(),
  slug: v.string(),
  researchStatus: researchStatusValidator,
  provider: v.optional(providerValidator),
  boardKey: v.optional(v.string()),
  boardUrl: v.optional(v.string()),
  confidence: v.optional(v.union(v.literal("high"), v.literal("medium"))),
  researchRequestedAt: v.optional(v.number()),
  lastCareerSyncAt: v.optional(v.number()),
  careerSyncError: v.optional(v.string()),
  discoveryAttempts: v.optional(v.number()),
  /** Server-decided freshness; absent unless the company is monitored. */
  refreshState: v.optional(
    v.union(v.literal("current"), v.literal("overdue"), v.literal("never")),
  ),
  openRoleCount: v.number(),
});

/**
 * Constrained single-workspace intake: names only, maximum 25, no URLs or
 * arbitrary fetch targets. Repeated names are idempotent and active monitoring
 * is never restarted by another paste.
 */
export const submitCompanies = mutation({
  args: { names: v.array(v.string()) },
  returns: v.object({
    accepted: v.number(),
    existing: v.number(),
    queued: v.number(),
    companies: v.array(v.object({ canonicalName: v.string(), slug: v.string() })),
    /**
     * One entry per pasted name, in the order it was pasted. A name that
     * produced nothing is reported rather than dropped, so the count in the
     * confirmation always accounts for everything the user submitted.
     */
    outcomes: v.array(
      v.object({
        input: v.string(),
        outcome: v.union(
          v.literal("queued"),
          v.literal("requeued"),
          v.literal("already_monitored"),
          v.literal("duplicate"),
          v.literal("rejected"),
        ),
        canonicalName: v.optional(v.string()),
        slug: v.optional(v.string()),
        detail: v.string(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    if (args.names.length === 0 || args.names.length > 25) {
      throw new Error("Paste between 1 and 25 company names.");
    }
    const outcomes: {
      input: string;
      outcome: "queued" | "requeued" | "already_monitored" | "duplicate" | "rejected";
      canonicalName?: string;
      slug?: string;
      detail: string;
    }[] = [];
    const seenSlugs = new Set<string>();
    const uniqueNames: string[] = [];
    for (const rawName of args.names) {
      const cleaned = cleanCompanyName(rawName);
      const slug = cleaned === null ? "" : companySlug(cleaned);
      if (cleaned === null || slug.length < 2) {
        outcomes.push({
          input: rawName,
          outcome: "rejected",
          detail: "Not recognisable as a company name, so nothing was queued for it.",
        });
        continue;
      }
      if (seenSlugs.has(slug)) {
        outcomes.push({
          input: rawName,
          outcome: "duplicate",
          canonicalName: cleaned,
          slug,
          detail: "Already listed earlier in this paste; counted once.",
        });
        continue;
      }
      seenSlugs.add(slug);
      uniqueNames.push(cleaned);
    }
    if (uniqueNames.length === 0) throw new Error("No valid company names were found.");

    const now = Date.now();
    const recentRequests = (await ctx.db.query("companies").order("desc").take(100)).filter(
      (company) => (company.researchRequestedAt ?? 0) > now - 60_000,
    ).length;
    if (recentRequests + uniqueNames.length > 40) {
      throw new Error("Too many companies were queued recently. Try again in one minute.");
    }

    let accepted = 0;
    let existingCount = 0;
    let queued = 0;
    const acceptedCompanies = [];
    for (const canonicalName of uniqueNames) {
      const slug = companySlug(canonicalName);
      if (slug.length < 2) continue;
      const existing = await ctx.db
        .query("companies")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique();
      if (existing !== null) {
        existingCount += 1;
        const shouldQueue =
          existing.researchStatus !== "monitoring" &&
          (existing.researchRequestedAt ?? 0) < now - 24 * 60 * 60_000;
        await ctx.db.patch(existing._id, {
          aliases: [...new Set([...existing.aliases, canonicalName])],
          active: true,
          researchStatus: shouldQueue ? "queued" : existing.researchStatus ?? "queued",
          researchRequestedAt: shouldQueue ? now : existing.researchRequestedAt,
          careerSyncError: shouldQueue ? undefined : existing.careerSyncError,
        });
        if (shouldQueue) queued += 1;
        accepted += 1;
        acceptedCompanies.push({ canonicalName: existing.canonicalName, slug: existing.slug });
        outcomes.push({
          input: canonicalName,
          outcome: shouldQueue ? "requeued" : "already_monitored",
          canonicalName: existing.canonicalName,
          slug: existing.slug,
          detail: shouldQueue
            ? "Already known; queued for a fresh research pass."
            : existing.researchStatus === "monitoring"
              ? "Already monitored; added to your shortlist without a new research pass."
              : "Research was requested for this company within the last day; the existing pass continues.",
        });
        continue;
      }

      await ctx.db.insert("companies", {
        canonicalName,
        slug,
        aliases: [canonicalName],
        registryIds: [],
        active: true,
        researchStatus: "queued",
        researchRequestedAt: now,
      });
      accepted += 1;
      queued += 1;
      acceptedCompanies.push({ canonicalName, slug });
      outcomes.push({
        input: canonicalName,
        outcome: "queued",
        canonicalName,
        slug,
        detail: "Queued for automatic career-feed discovery.",
      });
    }
    return {
      accepted,
      existing: existingCount,
      queued,
      companies: acceptedCompanies,
      outcomes,
    };
  },
});

export const listCompanies = query({
  args: {},
  returns: v.array(companySummaryValidator),
  handler: async (ctx) => {
    // Freshness is decided here rather than in the browser: the server clock is
    // the one the scheduler runs on, and a render-time clock would differ
    // between server and client output.
    const now = Date.now();
    const companies = (await ctx.db.query("companies").take(200))
      .filter((company) => company.active && company.mergedInto === undefined)
      .sort((left, right) => left.canonicalName.localeCompare(right.canonicalName));
    const results = [];
    for (const company of companies) {
      // Prefer the counter denormalized at scan time. Counting here meant one
      // indexed read per company on every tick of a subscription mounted on
      // nearly every page. The indexed count remains as a fallback so a
      // company scanned before the counter existed still reports correctly
      // rather than showing zero.
      const openRoleCount = company.openRoleCount ?? (
        await ctx.db
          .query("jobPostings")
          .withIndex("by_company_relevance_state", (q) =>
            q.eq("companyId", company._id).eq("relevantToSpainSoftware", true).eq("state", "active"),
          )
          .take(1_000)
      ).length;
      results.push({
        companyId: company._id,
        canonicalName: company.canonicalName,
        slug: company.slug,
        researchStatus: company.researchStatus ?? "queued",
        provider: company.careerBoard?.provider,
        boardKey: company.careerBoard?.boardKey,
        boardUrl: company.careerBoard?.publicUrl,
        confidence: company.careerBoard?.confidence,
        researchRequestedAt: company.researchRequestedAt,
        lastCareerSyncAt: company.lastCareerSyncAt,
        careerSyncError: company.careerSyncError,
        discoveryAttempts: company.discoveryAttempts,
        refreshState:
          company.researchStatus === "monitoring"
            ? companyRefreshHealth({
                lastCareerSyncAt: company.lastCareerSyncAt,
                now,
              }).state
            : undefined,
        openRoleCount,
      });
    }
    return results;
  },
});

/** Claims new work, transient failures after backoff, and expired discovery leases. */
export const claimQueued = internalMutation({
  args: { limit: v.number() },
  returns: v.array(
    v.object({
      companyId: v.id("companies"),
      canonicalName: v.string(),
      slug: v.string(),
      careerBoard: v.optional(careerBoardValidator),
    }),
  ),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit, 1), 10);
    const now = Date.now();
    const [queued, failed, discovering, unsupported] = await Promise.all([
      // Matches the 25-name cap in `submitCompanies`, so one paste is always
      // visible to a single claim rather than partly invisible behind a bound.
      ctx.db
        .query("companies")
        .withIndex("by_researchStatus", (q) => q.eq("researchStatus", "queued"))
        .take(25),
      ctx.db
        .query("companies")
        .withIndex("by_researchStatus", (q) => q.eq("researchStatus", "failed"))
        .take(100),
      ctx.db
        .query("companies")
        .withIndex("by_researchStatus", (q) => q.eq("researchStatus", "discovering"))
        .take(100),
      ctx.db
        .query("companies")
        .withIndex("by_researchStatus", (q) => q.eq("researchStatus", "unsupported"))
        .take(100),
    ]);
    const eligible = (company: Doc<"companies">) =>
      shouldAutomaticallyRetryCompanyResearch({
        status: company.researchStatus ?? "queued",
        lastAttemptAt: company.lastCareerAttemptAt,
        now,
        attempts: company.discoveryAttempts,
      });
    const oldestAttemptFirst = (left: Doc<"companies">, right: Doc<"companies">) =>
      (left.lastCareerAttemptAt ?? 0) - (right.lastCareerAttemptAt ?? 0);

    // Freshly pasted companies fill the batch first, and retries are capped at
    // one per claim. All four pools used to compete for the same slots, so a
    // backlog of six-hourly `failed` rows could take the whole batch and leave
    // a paste the user just made waiting for the next sweep.
    const fresh = queued.filter(eligible).sort(oldestAttemptFirst).slice(0, limit);
    const retries = [...failed, ...discovering, ...unsupported]
      .filter(eligible)
      .sort(oldestAttemptFirst)
      .slice(0, Math.min(1, Math.max(limit - fresh.length, 0)));
    const candidates = [...fresh, ...retries];
    const claimed = [];
    for (const company of candidates) {
      await ctx.db.patch(company._id, {
        researchStatus: "discovering",
        lastCareerAttemptAt: now,
        careerSyncError: undefined,
      });
      claimed.push({
        companyId: company._id,
        canonicalName: company.canonicalName,
        slug: company.slug,
        careerBoard: company.careerBoard,
      });
    }
    return claimed;
  },
});

export const listMonitored = internalQuery({
  args: { limit: v.number() },
  returns: v.array(
    v.object({
      companyId: v.id("companies"),
      canonicalName: v.string(),
      slug: v.string(),
      careerBoard: careerBoardValidator,
    }),
  ),
  handler: async (ctx, args) => {
    const now = Date.now();
    const companies = await ctx.db
      .query("companies")
      .withIndex("by_researchStatus", (q) => q.eq("researchStatus", "monitoring"))
      .take(100);
    return companies
      .filter((company) => (company.lastCareerAttemptAt ?? 0) <= now - 6 * 60 * 60_000)
      .sort((left, right) =>
        (left.lastCareerAttemptAt ?? 0) - (right.lastCareerAttemptAt ?? 0),
      )
      .slice(0, Math.min(Math.max(args.limit, 1), 10))
      .flatMap((company) =>
      company.careerBoard === undefined
        ? []
        : [{
            companyId: company._id,
            canonicalName: company.canonicalName,
            slug: company.slug,
            careerBoard: company.careerBoard,
          }],
      );
  },
});

export const getMonitoredBySlug = internalQuery({
  args: { slug: v.string() },
  returns: v.union(
    v.object({
      companyId: v.id("companies"),
      canonicalName: v.string(),
      slug: v.string(),
      careerBoard: careerBoardValidator,
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const company = await ctx.db
      .query("companies")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (company === null || company.researchStatus !== "monitoring" || company.careerBoard === undefined) {
      return null;
    }
    return {
      companyId: company._id,
      canonicalName: company.canonicalName,
      slug: company.slug,
      careerBoard: company.careerBoard,
    };
  },
});

export const saveDiscoveredBoard = internalMutation({
  args: {
    companyId: v.id("companies"),
    board: careerBoardValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.companyId, {
      careerBoard: args.board,
      researchStatus: "monitoring",
      careerSyncError: undefined,
    });
    return null;
  },
});

export const markUnsupported = internalMutation({
  args: { companyId: v.id("companies") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId);
    if (company === null) return null;
    const attempts = (company.discoveryAttempts ?? 0) + 1;
    await ctx.db.patch(args.companyId, {
      researchStatus: "unsupported",
      lastCareerAttemptAt: Date.now(),
      discoveryAttempts: attempts,
      careerSyncError: discoveryAttemptsExhausted(attempts)
        ? UNTRACKABLE_CAREER_FEED_MESSAGE
        : UNSUPPORTED_CAREER_FEED_MESSAGE,
    });
    return null;
  },
});

/** Removes stale provider lists from unsupported records without changing retry timing. */
export const repairUnsupportedMessages = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const companies = await ctx.db.query("companies").take(200);
    let repaired = 0;
    for (const company of companies) {
      if (company.researchStatus !== "unsupported") continue;
      const message = discoveryAttemptsExhausted(company.discoveryAttempts)
        ? UNTRACKABLE_CAREER_FEED_MESSAGE
        : UNSUPPORTED_CAREER_FEED_MESSAGE;
      if (company.careerSyncError === message) continue;
      await ctx.db.patch(company._id, { careerSyncError: message });
      repaired += 1;
    }
    return repaired;
  },
});

export const markFailed = internalMutation({
  args: { companyId: v.id("companies"), message: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId);
    if (company === null) return null;
    await ctx.db.patch(args.companyId, {
      researchStatus: company.careerBoard ? "monitoring" : "failed",
      lastCareerAttemptAt: Date.now(),
      careerSyncError: args.message.slice(0, 500),
    });
    return null;
  },
});

export const markSynced = internalMutation({
  args: { companyId: v.id("companies"), syncedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.companyId, {
      researchStatus: "monitoring",
      lastCareerSyncAt: args.syncedAt,
      lastCareerAttemptAt: args.syncedAt,
      lastResearchedAt: args.syncedAt,
      careerSyncError: undefined,
    });
    return null;
  },
});

/** A partial fetch never advances the last fully verified company timestamp. */
export const markPartial = internalMutation({
  args: { companyId: v.id("companies"), attemptedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.companyId, {
      researchStatus: "monitoring",
      lastCareerAttemptAt: args.attemptedAt,
      careerSyncError: "The latest career-feed refresh was incomplete. Last verified data is preserved and will retry automatically.",
    });
    return null;
  },
});

/** Explicit operations retry after an adapter or discovery-rule improvement. */
export const retryResearchBySlug = internalMutation({
  args: { slug: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const company = await ctx.db
      .query("companies")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (company === null) return false;
    await ctx.db.patch(company._id, {
      researchStatus: "queued",
      researchRequestedAt: Date.now(),
      lastCareerAttemptAt: undefined,
      careerSyncError: undefined,
    });
    return true;
  },
});

/** Seed only the companies already visible in the salary product; no demo roles are added. */
export const ensureKnownSalaryCompanies = internalMutation({
  args: {},
  returns: v.object({ inserted: v.number(), existing: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    let inserted = 0;
    let existing = 0;
    for (const sourceCompany of salaryCompanies) {
      const found = await ctx.db
        .query("companies")
        .withIndex("by_slug", (q) => q.eq("slug", sourceCompany.slug))
        .unique();
      if (found !== null) {
        existing += 1;
        continue;
      }
      await ctx.db.insert("companies", {
        canonicalName: sourceCompany.canonicalName,
        slug: sourceCompany.slug,
        aliases: [sourceCompany.canonicalName],
        registryIds: [],
        active: true,
        researchStatus: "queued",
        researchRequestedAt: now,
      });
      inserted += 1;
    }
    return { inserted, existing };
  },
});

/**
 * Raises one alert per company that has missed its daily refresh, and resolves
 * it once the company syncs again. Alerts are fingerprinted per company so a
 * long stall does not accumulate duplicates.
 */
export const flagStaleCompanies = internalMutation({
  args: {},
  returns: v.object({
    monitored: v.number(),
    stale: v.number(),
    raised: v.number(),
    resolved: v.number(),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    const companies = await ctx.db
      .query("companies")
      .withIndex("by_researchStatus", (q) => q.eq("researchStatus", "monitoring"))
      .take(200);

    let stale = 0;
    let raised = 0;
    let resolved = 0;

    for (const company of companies) {
      const fingerprint = `company_refresh_stale:${company.slug}`;
      const existing = (
        await ctx.db
          .query("researchAlerts")
          .withIndex("by_fingerprint", (q) => q.eq("fingerprint", fingerprint))
          .collect()
      ).find((alert) => alert.resolvedAt === undefined) ?? null;

      // A company that has never synced is stale from the moment it started
      // monitoring, so an absent timestamp counts as overdue rather than new.
      const lastSuccess = company.lastCareerSyncAt ?? company.researchRequestedAt ?? 0;
      const isStale = lastSuccess <= now - COMPANY_REFRESH_STALE_AFTER_MS;

      if (isStale) {
        stale += 1;
        if (existing === null) {
          const hours = Math.floor((now - lastSuccess) / 36e5);
          await ctx.db.insert("researchAlerts", {
            entityType: "company",
            entityKey: company.slug,
            kind: "stale",
            severity: "warning",
            message:
              company.lastCareerSyncAt === undefined
                ? `${company.canonicalName} has never completed a career-feed sync. Its shown data is not current.`
                : `${company.canonicalName} has not refreshed for ${hours} hours. Its roles and posted pay may be out of date.`,
            detectedAt: now,
            fingerprint,
          });
          raised += 1;
        }
      } else if (existing !== null) {
        await ctx.db.patch(existing._id, { resolvedAt: now });
        resolved += 1;
      }
    }

    return { monitored: companies.length, stale, raised, resolved };
  },
});

/**
 * Everything the company profile needs to show how monitoring is going:
 * refresh state, the career board it reads, every open Spain role regardless of
 * role type, and the recorded changes for that company.
 *
 * Open roles here are deliberately broader than the salary pipeline's filter.
 * That filter keeps non-IC roles out of pay comparisons; it should not hide the
 * fact that a company is hiring in Spain at all.
 */
/**
 * Whether a slug names a real company, in one indexed lookup.
 *
 * Exists so the company route can answer with a genuine 404 instead of
 * rendering a "not found" panel under a 200. Deliberately tiny: the full
 * `companyMonitoring` query reads postings, versions and scans, which is far
 * too much work to decide whether a URL is valid.
 */
export const companyExists = query({
  args: { slug: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const company = await ctx.db
      .query("companies")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    return company !== null;
  },
});

/**
 * One posting's own text, fetched only when its detail dialog is actually
 * open — `companyMonitoring` deliberately keeps this off the role list itself.
 * That list is a reactive subscription mounted on every visit to a company
 * profile, and carrying several KB of text per role on it would multiply its
 * cost for every open tab whether or not anyone ever reads a description.
 */
export const postingDescription = query({
  args: { postingId: v.id("jobPostings") },
  returns: v.union(
    v.object({
      title: v.string(),
      canonicalUrl: v.string(),
      descriptionText: v.optional(v.string()),
      /**
       * The smallest verbatim window of the description that states pay for
       * this specific role — never a market figure, never blended across
       * postings. `undefined` when the posting simply does not state one;
       * that is a fact about the posting, not a gap to fill.
       */
      salaryHighlight: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const posting = await ctx.db.get(args.postingId);
    if (posting === null) return null;
    return {
      title: posting.title,
      canonicalUrl: posting.canonicalUrl,
      descriptionText: posting.descriptionText,
      // The per-provider adapter's own extraction first — Google's "Spain:
      // €X — €Y" line and a generic "Salary range: €X-€Y" block are different
      // enough that no single generic pattern reliably catches both. The
      // generic extractor only runs as a second attempt when that adapter
      // found nothing, on the chance the wording it missed still gives the
      // generic pattern something to find.
      salaryHighlight:
        posting.salaryText ??
        (posting.descriptionText
          ? extractCompanyPostedSalaryText(posting.descriptionText)
          : undefined),
    };
  },
});

export const companyMonitoring = query({
  args: { slug: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      canonicalName: v.string(),
      slug: v.string(),
      researchStatus: researchStatusValidator,
      refreshState: v.union(
        v.literal("current"),
        v.literal("overdue"),
        v.literal("never"),
      ),
      lastCareerSyncAt: v.optional(v.number()),
      lastCareerAttemptAt: v.optional(v.number()),
      careerSyncError: v.optional(v.string()),
      provider: v.optional(providerValidator),
      boardKey: v.optional(v.string()),
      boardUrl: v.optional(v.string()),
      spainRoleCount: v.number(),
      softwareRoleCount: v.number(),
      researchedPortalUrl: v.optional(v.string()),
      /** Every Spain tech role ever seen, open or not — not only today's. */
      postedRoles: v.array(
        v.object({
          postingId: v.id("jobPostings"),
          title: v.string(),
          url: v.string(),
          locations: v.array(v.string()),
          firstSeenAt: v.number(),
          lastSeenAt: v.number(),
          open: v.boolean(),
          closedAt: v.optional(v.number()),
        }),
      ),
      changelog: v.array(
        v.object({
          versionId: v.id("jobPostingVersions"),
          title: v.string(),
          url: v.string(),
          capturedAt: v.number(),
          kinds: v.array(v.string()),
        }),
      ),
      scans: v.array(
        v.object({
          scanId: v.id("companyScans"),
          scannedAt: v.number(),
          status: v.union(
            v.literal("complete"),
            v.literal("partial"),
            v.literal("failed"),
          ),
          rolesSeen: v.number(),
          rolesAdded: v.number(),
          rolesRemoved: v.number(),
          rolesChanged: v.number(),
          spainRoles: v.number(),
          errorMessage: v.optional(v.string()),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const company = await ctx.db
      .query("companies")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (company === null) return null;

    const active = await ctx.db
      .query("jobPostings")
      .withIndex("by_company_state", (q) =>
        q.eq("companyId", company._id).eq("state", "active"),
      )
      .take(2_000);

    // The archive: every tech posting for this company in any state. The index
    // prefix stops at the relevance flag, so this reads only tech roles rather
    // than pulling the company's whole feed to discard most of it — a
    // monitored company holds ~190 postings of which ~3 are Spain tech.
    const techAllStates = await ctx.db
      .query("jobPostings")
      .withIndex("by_company_relevance_state", (q) =>
        q.eq("companyId", company._id).eq("relevantToSpainSoftware", true),
      )
      .take(2_000);

    // One row per role, not per capture: the same posting re-listed under a new
    // id would otherwise appear twice in a history whose point is what was
    // posted, not how many times it was fetched.
    const byUrl = new Map<string, (typeof techAllStates)[number]>();
    for (const posting of techAllStates) {
      if (!isSpainLocation(posting.locations)) continue;
      const seen = byUrl.get(posting.canonicalUrl);
      if (seen === undefined || posting.lastSeenAt > seen.lastSeenAt) {
        byUrl.set(posting.canonicalUrl, posting);
      }
    }
    const postedRoles = [...byUrl.values()].sort(
      (left, right) => right.lastSeenAt - left.lastSeenAt,
    );

    const spainRoles = active
      .filter((posting) => isSpainLocation(posting.locations))
      .sort((left, right) => right.lastSeenAt - left.lastSeenAt);

    const changelog = [];
    for (const posting of spainRoles.slice(0, 60)) {
      const versions = await ctx.db
        .query("jobPostingVersions")
        .withIndex("by_postingId_and_capturedAt", (q) => q.eq("postingId", posting._id))
        .order("desc")
        .take(3);
      for (const version of versions) {
        // The first capture of a posting is not a change; skip it so the log
        // reads as "what moved", not "what exists".
        if (version.changeKinds.length === 0) continue;
        changelog.push({
          versionId: version._id,
          title: version.title ?? posting.title,
          url: posting.canonicalUrl,
          capturedAt: version.capturedAt,
          kinds: version.changeKinds,
        });
      }
    }
    changelog.sort((left, right) => right.capturedAt - left.capturedAt);

    return {
      canonicalName: company.canonicalName,
      slug: company.slug,
      researchStatus: company.researchStatus ?? "queued",
      refreshState:
        company.researchStatus === "monitoring"
          ? companyRefreshHealth({
              lastCareerSyncAt: company.lastCareerSyncAt,
              now: Date.now(),
            }).state
          : "never",
      lastCareerSyncAt: company.lastCareerSyncAt,
      lastCareerAttemptAt: company.lastCareerAttemptAt,
      careerSyncError: company.careerSyncError,
      provider: company.careerBoard?.provider,
      boardKey: company.careerBoard?.boardKey,
      boardUrl: company.careerBoard?.publicUrl,
      spainRoleCount: spainRoles.length,
      softwareRoleCount: spainRoles.filter(
        (posting) => posting.relevantToSpainSoftware === true,
      ).length,
      researchedPortalUrl: company.researchedPortalUrl,
      postedRoles: postedRoles.slice(0, 200).map((posting) => ({
        postingId: posting._id,
        title: posting.title,
        url: posting.canonicalUrl,
        locations: posting.locations,
        firstSeenAt: posting.firstSeenAt,
        lastSeenAt: posting.lastSeenAt,
        open: posting.state === "active",
        closedAt: posting.closedAt,
      })),
      changelog: changelog.slice(0, 25),
      scans: (
        await ctx.db
          .query("companyScans")
          .withIndex("by_company_and_scannedAt", (q) => q.eq("companyId", company._id))
          .order("desc")
          .take(20)
      ).map((scan) => ({
        scanId: scan._id,
        scannedAt: scan.scannedAt,
        status: scan.status,
        rolesSeen: scan.rolesSeen,
        rolesAdded: scan.rolesAdded,
        rolesRemoved: scan.rolesRemoved,
        rolesChanged: scan.rolesChanged,
        spainRoles: scan.spainRoles,
        errorMessage: scan.errorMessage,
      })),
    };
  },
});

/**
 * The refresh queue in the order the sweep will work through it: companies that
 * went longest without an attempt come first.
 */
export const refreshQueue = query({
  args: {},
  returns: v.array(
    v.object({
      canonicalName: v.string(),
      slug: v.string(),
      lastCareerAttemptAt: v.optional(v.number()),
      lastCareerSyncAt: v.optional(v.number()),
      refreshState: v.union(
        v.literal("current"),
        v.literal("overdue"),
        v.literal("never"),
      ),
      dueNow: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const now = Date.now();
    const companies = await ctx.db
      .query("companies")
      .withIndex("by_researchStatus", (q) => q.eq("researchStatus", "monitoring"))
      .take(200);
    return companies
      .sort(
        (left, right) =>
          (left.lastCareerAttemptAt ?? 0) - (right.lastCareerAttemptAt ?? 0),
      )
      .map((company) => ({
        canonicalName: company.canonicalName,
        slug: company.slug,
        lastCareerAttemptAt: company.lastCareerAttemptAt,
        lastCareerSyncAt: company.lastCareerSyncAt,
        refreshState: companyRefreshHealth({
          lastCareerSyncAt: company.lastCareerSyncAt,
          now,
        }).state,
        // Matches `listMonitored`'s eligibility window.
        dueNow: (company.lastCareerAttemptAt ?? 0) <= now - 6 * 60 * 60_000,
      }));
  },
});

/**
 * Records one completed or failed rescan of a company's career feed.
 *
 * Added and changed counts are derived here rather than passed in, because the
 * postings and their versions have already been written by the time a scan
 * finishes — reading them back is what makes the log agree with the data.
 */
export const recordScan = internalMutation({
  args: {
    companyId: v.id("companies"),
    scannedAt: v.number(),
    status: v.union(
      v.literal("complete"),
      v.literal("partial"),
      v.literal("failed"),
    ),
    rolesSeen: v.number(),
    rolesRemoved: v.number(),
    errorMessage: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const company = await ctx.db.get(args.companyId);
    if (company === null) return null;

    const postings = await ctx.db
      .query("jobPostings")
      .withIndex("by_company_state", (q) =>
        q.eq("companyId", args.companyId).eq("state", "active"),
      )
      .take(2_000);

    const rolesAdded = postings.filter(
      (posting) => posting.firstSeenAt === args.scannedAt,
    ).length;

    let rolesChanged = 0;
    for (const posting of postings) {
      const version = await ctx.db
        .query("jobPostingVersions")
        .withIndex("by_postingId_and_capturedAt", (q) =>
          q.eq("postingId", posting._id).eq("capturedAt", args.scannedAt),
        )
        .first();
      // The first capture of a posting is its creation, not a change.
      if (version && version.changeKinds.length > 0) rolesChanged += 1;
    }

    await ctx.db.insert("companyScans", {
      companyId: args.companyId,
      scannedAt: args.scannedAt,
      status: args.status,
      provider: company.careerBoard?.provider,
      rolesSeen: args.rolesSeen,
      rolesAdded,
      rolesRemoved: args.rolesRemoved,
      rolesChanged,
      spainRoles: postings.filter((posting) => isSpainLocation(posting.locations)).length,
      errorMessage: args.errorMessage,
    });

    // Denormalize the count `listCompanies` needs. The postings are already in
    // hand, so this is free here and saves that query an indexed read per
    // company on every subscription tick.
    await ctx.db.patch(args.companyId, {
      openRoleCount: postings.filter(
        (posting) => posting.relevantToSpainSoftware === true,
      ).length,
      openRoleCountAt: args.scannedAt,
    });
    return null;
  },
});

/**
 * Backfills `openRoleCount` for companies scanned before it existed, in
 * bounded batches so a large catalog cannot exceed a single transaction.
 * Returns the number of companies still without a counter.
 */
export const backfillOpenRoleCounts = internalMutation({
  args: { batchSize: v.optional(v.number()) },
  returns: v.object({ updated: v.number(), remaining: v.number() }),
  handler: async (ctx, args) => {
    const batchSize = Math.min(Math.max(args.batchSize ?? 25, 1), 100);
    const companies = await ctx.db.query("companies").take(500);
    const pending = companies.filter((company) => company.openRoleCount === undefined);
    let updated = 0;

    for (const company of pending.slice(0, batchSize)) {
      const postings = await ctx.db
        .query("jobPostings")
        .withIndex("by_company_relevance_state", (q) =>
          q.eq("companyId", company._id).eq("relevantToSpainSoftware", true).eq("state", "active"),
        )
        .take(5_000);
      await ctx.db.patch(company._id, {
        openRoleCount: postings.length,
        openRoleCountAt: Date.now(),
      });
      updated += 1;
    }

    return { updated, remaining: Math.max(pending.length - updated, 0) };
  },
});
