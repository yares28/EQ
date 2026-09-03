import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// ---------------------------------------------------------------------------
// Shared validators (Rule 2: provenance hierarchy — user > verified > deduced > unknown)
// ---------------------------------------------------------------------------

export const provenanceValidator = v.union(
  v.literal("user"),
  v.literal("verified"),
  v.literal("deduced"),
  v.literal("unknown"),
);

/**
 * One scored dimension. `band` is the ± confidence band around `value`
 * (Rule 3: verdicts render as e.g. "84 ±3" vs "≈71 ±12").
 * `verified` provenance requires a real URL in `sources` (Rule 2).
 */
export const scoreValidator = v.object({
  value: v.number(),
  band: v.number(),
  provenance: provenanceValidator,
  rationale: v.string(),
  sources: v.array(v.string()),
  fetchedAt: v.number(),
});

/**
 * The six dimensions. Each is optional so a dimension with no data is
 * genuinely absent and the verdict renormalizes over the rest (Rule 3) —
 * never scored as 0.
 */
export const scoresValidator = v.object({
  fit: v.optional(scoreValidator),
  salary: v.optional(scoreValidator),
  aura: v.optional(scoreValidator),
  future: v.optional(scoreValidator),
  flex: v.optional(scoreValidator),
  network: v.optional(scoreValidator),
});

export const workModeValidator = v.union(
  v.literal("on-site"),
  v.literal("hybrid"),
  v.literal("remote"),
  v.literal("unknown"),
);

/** Rule 1: the confidence ladder. A card only moves up, never down. */
export const rungValidator = v.union(
  v.literal("stub"),
  v.literal("researched"),
  v.literal("deepdived"),
);

/** Processing pipeline state shared by ingests / requests / research. */
export const pipelineStatusValidator = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("done"),
  v.literal("failed"),
);

export const userStatusValidator = v.union(
  v.literal("saved"),
  v.literal("applied"),
  v.literal("interviewing"),
  v.literal("offer"),
  v.literal("rejected"),
  v.literal("expired"),
  v.literal("snoozed"),
  v.literal("skipped"),
);

export const eligibilityValidator = v.object({
  state: v.union(
    v.literal("eligible"),
    v.literal("check"),
    v.literal("ineligible"),
    v.literal("unknown"),
  ),
  reason: v.optional(v.string()),
  // "user" here means the user overrode the deduction ("I am eligible") —
  // re-research never overwrites it (Rule 2).
  provenance: provenanceValidator,
});

export const requirementValidator = v.object({
  skill: v.string(),
  level: v.union(v.literal("have"), v.literal("partial"), v.literal("missing")),
  mustHave: v.boolean(),
  provenance: provenanceValidator,
});

export const moneyValidator = v.object({
  amount: v.number(),
  currency: v.string(),
  period: v.union(v.literal("month"), v.literal("year")),
});

/** F6 — internship reality check facts. All optional; filled as researched. */
export const programFactsValidator = v.object({
  stipend: v.optional(moneyValidator),
  durationMonths: v.optional(v.number()),
  hoursPerWeek: v.optional(v.number()),
  startDate: v.optional(v.string()),
  selectionWindow: v.optional(v.string()),
  openings: v.optional(v.number()),
  bundledDegree: v.optional(v.string()),
  tuitionCoverage: v.optional(v.string()),
  conversionEstimate: v.optional(v.string()),
  netCostNote: v.optional(v.string()),
});

// ---------------------------------------------------------------------------
// Table field sets (exported so public functions can build exact `returns`
// validators including _id / _creationTime)
// ---------------------------------------------------------------------------

export const jobFields = {
  // identity
  company: v.string(),
  title: v.string(),
  canonicalTitle: v.optional(v.string()),
  locations: v.array(v.string()),
  workMode: workModeValidator,
  // lifecycle
  rung: rungValidator,
  researchStatus: pipelineStatusValidator,
  researchFailReason: v.optional(v.string()),
  researchRetryCount: v.number(),
  userStatus: userStatusValidator,
  eligibility: eligibilityValidator,
  archived: v.boolean(),
  // timestamps (all absolute — relative ages converted at ingest)
  postedAt: v.optional(v.number()),
  pastedAt: v.number(),
  lastSeenAt: v.number(),
  repostCount: v.number(),
  // content
  rawStub: v.optional(v.string()),
  rawJD: v.optional(v.string()),
  requirements: v.array(requirementValidator),
  scores: scoresValidator,
  redFlags: v.array(v.string()),
  finePrint: v.array(v.string()),
  programFacts: v.optional(programFactsValidator),
  // flags
  promoted: v.boolean(),
  viewed: v.boolean(),
};

export const ingestFields = {
  rawText: v.string(),
  contentHash: v.string(),
  status: pipelineStatusValidator,
  failReason: v.optional(v.string()),
  retryCount: v.number(),
  summary: v.optional(
    v.object({
      found: v.number(),
      duplicates: v.number(),
      failed: v.number(),
    }),
  ),
};

export const profileFields = {
  cv: v.optional(
    v.object({
      storageId: v.id("_storage"),
      parsedAt: v.number(),
      confirmed: v.boolean(),
    }),
  ),
  skills: v.array(
    v.object({
      name: v.string(), // canonical taxonomy name (F4/F9 share it)
      level: v.union(v.literal("have"), v.literal("partial")),
      provenance: provenanceValidator,
    }),
  ),
  education: v.array(v.string()),
  projects: v.array(v.string()),
  languages: v.array(
    v.object({
      language: v.string(),
      level: v.string(),
    }),
  ),
  availabilityDate: v.optional(v.number()),
  baseLocation: v.optional(v.string()),
  /**
   * The CV's extracted text and its parsed structure.
   *
   * Structure rather than the file, because the rewrite regenerates LaTeX from
   * a template — the source of the original PDF is gone, and patching a PDF's
   * layout is not possible. Text as well, because the scorer checks phrasing
   * that structure alone would lose.
   *
   * `cvVersion` changes on every import and is what a rewrite is keyed to, so a
   * rewrite is never shown against a CV it was not written for.
   */
  cvText: v.optional(v.string()),
  cvStructured: v.optional(v.any()),
  cvFileName: v.optional(v.string()),
  cvUpdatedAt: v.optional(v.number()),
  cvVersion: v.optional(v.string()),
  /** The level the user is applying at, which the seniority signal scores against. */
  targetLevel: v.optional(
    v.union(
      v.literal("intern"),
      v.literal("junior"),
      v.literal("mid"),
      v.literal("senior"),
      v.literal("staff"),
      v.literal("principal"),
    ),
  ),
};

export const salaryCacheFields = {
  titleFamily: v.string(),
  location: v.string(),
  level: v.string(),
  figures: v.array(
    v.object({
      amount: v.number(),
      currency: v.string(),
      period: v.union(v.literal("month"), v.literal("year")),
      source: v.string(),
    }),
  ),
  fetchedAt: v.number(),
};

export const tailoringFields = {
  jobId: v.id("jobs"),
  version: v.number(),
  suggestions: v.array(
    v.object({
      // Truthfulness guard (F8): "reframe" is allowed on the CV,
      // "gap" routes to the learning plan and never into the CV.
      type: v.union(v.literal("reframe"), v.literal("gap")),
      before: v.string(),
      after: v.string(),
      targetRequirement: v.string(),
      state: v.union(
        v.literal("proposed"),
        v.literal("accepted"),
        v.literal("rejected"),
        v.literal("edited"),
      ),
    }),
  ),
  coverLetter: v.optional(v.string()),
  language: v.union(v.literal("en"), v.literal("es")),
  stale: v.boolean(),
};

/**
 * One month of the user's own costs for a location. Kept separate from
 * `cityCostObservations`, which holds official reference data: a personal
 * figure is ground truth for this user but must never be published as a
 * researched city cost.
 */
export const personalCityCostValidator = v.object({
  /** A `DecisionLocation` value, e.g. "Madrid". */
  location: v.string(),
  rentEur: v.number(),
  groceriesEur: v.number(),
  transportEur: v.number(),
  utilitiesEur: v.number(),
  otherEur: v.number(),
  updatedAt: v.number(),
});

export const settingsFields = {
  personalCityCosts: v.optional(v.array(personalCityCostValidator)),
  // Weights over the five sliders. Network is a rank modifier (max ±5),
  // not a slider (F3), so it has no weight here.
  weights: v.object({
    fit: v.number(),
    salary: v.number(),
    aura: v.number(),
    future: v.number(),
    flex: v.number(),
  }),
  dealbreakers: v.array(v.string()),
  displayCurrency: v.string(),
  dailyApplyCap: v.number(),
};

export const requestFields = {
  kind: v.string(), // "ingest" | "research" | "deepdive" | "tailor" | ...
  payload: v.any(),
  status: pipelineStatusValidator,
  retryCount: v.number(),
  failReason: v.optional(v.string()),
};

// ---------------------------------------------------------------------------
// Research data platform
// ---------------------------------------------------------------------------

export const sourceKindValidator = v.union(
  v.literal("official"),
  v.literal("company_api"),
  v.literal("licensed_market"),
  v.literal("community"),
  v.literal("editorial"),
);

export const sourceHealthValidator = v.union(
  v.literal("healthy"),
  v.literal("degraded"),
  v.literal("failing"),
  v.literal("paused"),
);

/**
 * Every fetched fact begins here. Cadence and staleness are stored per source
 * because an ATS feed, an annual INE release, and a tax model do not age at
 * the same rate. Licensing notes are explicit so a technically reachable
 * source cannot silently become a production dependency.
 */
export const sourceRegistryFields = {
  key: v.string(),
  provider: v.string(),
  dataset: v.string(),
  kind: sourceKindValidator,
  baseUrl: v.string(),
  termsUrl: v.optional(v.string()),
  license: v.string(),
  allowedUses: v.array(v.string()),
  geography: v.array(v.string()),
  refreshCadenceMinutes: v.number(),
  maxStalenessMinutes: v.number(),
  enabled: v.boolean(),
  health: sourceHealthValidator,
  consecutiveFailures: v.number(),
  lastAttemptedAt: v.optional(v.number()),
  lastSuccessfulAt: v.optional(v.number()),
  nextRunAt: v.number(),
  notes: v.optional(v.string()),
};

export const sourceRunStatusValidator = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("succeeded"),
  v.literal("partial"),
  v.literal("failed"),
  v.literal("skipped"),
);

/** One immutable audit record per source attempt. */
export const sourceRunFields = {
  sourceId: v.id("sourceRegistry"),
  runKey: v.string(),
  status: sourceRunStatusValidator,
  startedAt: v.number(),
  finishedAt: v.optional(v.number()),
  requestHash: v.optional(v.string()),
  responseHash: v.optional(v.string()),
  recordsSeen: v.number(),
  recordsAccepted: v.number(),
  recordsRejected: v.number(),
  httpStatus: v.optional(v.number()),
  errorCode: v.optional(v.string()),
  errorMessage: v.optional(v.string()),
  parserVersion: v.string(),
};

/** Immutable raw response retained for replay when parsers or mappings change. */
export const rawSnapshotFields = {
  sourceId: v.id("sourceRegistry"),
  runId: v.id("sourceRuns"),
  externalId: v.optional(v.string()),
  sourceUrl: v.string(),
  contentHash: v.string(),
  mimeType: v.string(),
  observedAt: v.number(),
  effectiveAt: v.optional(v.number()),
  payload: v.any(),
};

export const companyFields = {
  canonicalName: v.string(),
  slug: v.string(),
  aliases: v.array(v.string()),
  website: v.optional(v.string()),
  countryCode: v.optional(v.string()),
  lei: v.optional(v.string()),
  registryIds: v.array(
    v.object({ jurisdiction: v.string(), value: v.string() }),
  ),
  active: v.boolean(),
  mergedInto: v.optional(v.id("companies")),
  lastResearchedAt: v.optional(v.number()),
  researchStatus: v.optional(
    v.union(
      v.literal("queued"),
      v.literal("discovering"),
      v.literal("monitoring"),
      v.literal("unsupported"),
      v.literal("failed"),
    ),
  ),
  researchRequestedAt: v.optional(v.number()),
  careerBoard: v.optional(
    v.object({
      provider: v.union(
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
      ),
      boardKey: v.string(),
      region: v.optional(v.union(v.literal("global"), v.literal("eu"))),
      publicUrl: v.string(),
      discoveryMethod: v.union(v.literal("verified_board_name"), v.literal("exact_slug_probe")),
      confidence: v.union(v.literal("high"), v.literal("medium")),
      discoveredAt: v.number(),
    }),
  ),
  lastCareerSyncAt: v.optional(v.number()),
  lastCareerAttemptAt: v.optional(v.number()),
  careerSyncError: v.optional(v.string()),
  /**
   * How many times discovery has looked for this company's jobs feed and found
   * nothing. Past `COMPANY_DISCOVERY_ATTEMPT_LIMIT` the company is reported as
   * untrackable rather than pending, and its retry backs off to monthly.
   *
   * Optional because it is absent for companies marked unsupported before it
   * existed; those simply keep the weekly cadence until their next attempt.
   */
  discoveryAttempts: v.optional(v.number()),
  /**
   * The careers portal a research pass found by hand, for a company whose feed
   * discovery cannot read. Kept separate from `careerBoard` because that field
   * means "a machine-readable feed the cron owns"; this one means "a page a
   * person can open", and the profile links whichever exists.
   */
  researchedPortalUrl: v.optional(v.string()),
  researchedPortalAt: v.optional(v.number()),
  /**
   * Active Spain-relevant software postings, denormalized at scan time.
   *
   * `listCompanies` is a reactive subscription mounted on nearly every page,
   * and counting this per company meant one indexed read per company on every
   * tick — fine at 15 companies, a per-render fan-out at 200. The scan already
   * holds the postings needed to compute it, so it costs nothing there.
   *
   * Optional because it is absent until a company's next scan; readers fall
   * back to counting so the number is never silently wrong.
   */
  openRoleCount: v.optional(v.number()),
  /** When `openRoleCount` was last written, so a stale counter is detectable. */
  openRoleCountAt: v.optional(v.number()),
};

export const canonicalLevelValidator = v.union(
  v.literal("intern"),
  v.literal("junior"),
  v.literal("mid"),
  v.literal("senior"),
  v.literal("staff"),
  v.literal("principal"),
  v.literal("unknown"),
);

/**
 * The levels a researched catalog figure may be filed under. Deliberately
 * excludes `unknown`: a figure whose level is not known cannot be shown as any
 * company's pay for a level, so there is nowhere to file it.
 */
export const salaryLevelValidator = v.union(
  v.literal("intern"),
  v.literal("junior"),
  v.literal("mid"),
  v.literal("senior"),
  v.literal("staff"),
  v.literal("principal"),
);

/**
 * Company pay researched off the employer's own postings — levels.fyi,
 * Glassdoor, Payscale, InfoJobs and the like — written by the /process research
 * pass.
 *
 * This exists because employer-posted ranges are the only live salary source
 * and Spain does not mandate pay transparency, so almost no posting discloses
 * one. Without this table a company outside the compiled-in catalog could never
 * carry a figure at all, whatever research had been done on it.
 *
 * One row per company x level x location. The level is the level the figure was
 * *published for*; nothing here may be re-filed under a different level.
 */
/**
 * A CV rewritten for one specific posting.
 *
 * Keyed by CV version as well as posting, so a rewrite is never shown against a
 * CV it was not written for — the wording only makes sense relative to the
 * bullets it started from, and a re-import changes those.
 *
 * `replacements` are positional and wording-only. The rewrite may not add,
 * remove or reorder a bullet: that shape constraint is what makes an invented
 * job impossible rather than merely discouraged.
 */
export const cvRewriteFields = {
  postingId: v.id("jobPostings"),
  cvVersion: v.string(),
  replacements: v.array(
    v.object({
      sectionIndex: v.number(),
      entryIndex: v.number(),
      bulletIndex: v.number(),
      text: v.string(),
    }),
  ),
  /** Why each change was made, so the diff can be read rather than trusted. */
  rationale: v.optional(v.string()),
  createdAt: v.number(),
};

/**
 * A research pass that looked for a figure and correctly found none.
 *
 * Without this, an honest miss is indistinguishable from work never started:
 * the catalog stores figures, so a company whose sources publish nothing for
 * Spain looks exactly like one nobody has opened, and every pass re-researches
 * the same dead ends. Most of the pay queue is this — levels.fyi locks a
 * company's country page until it has enough submissions, and no amount of
 * looking will change that this month.
 *
 * Deliberately per company x level, the same grain as the catalog itself, so
 * "Google publishes no intern figure for Spain" does not also claim anything
 * about Google's other levels.
 */
export const companySalaryCheckFields = {
  companySlug: v.string(),
  level: salaryLevelValidator,
  checkedAt: v.number(),
  /** The sources actually opened, so a later pass can tell what was not tried. */
  sourcesChecked: v.array(v.string()),
  /** Why nothing was filed, in the researcher's own words. */
  note: v.string(),
};

export const companySalaryCatalogFields = {
  companySlug: v.string(),
  level: salaryLevelValidator,
  /** A `SalaryLocation` from lib/salary-data.ts. */
  location: v.string(),
  locationLabel: v.string(),
  /** The employer's own name for the level, e.g. "L3", "SDE1", "Beca". */
  companyLevel: v.string(),
  totalCompEur: v.union(v.number(), v.null()),
  baseEur: v.union(v.number(), v.null()),
  bonusEur: v.union(v.number(), v.null()),
  equityEur: v.union(v.number(), v.null()),
  extrasEur: v.union(v.number(), v.null()),
  confidence: v.union(
    v.literal("High"),
    v.literal("Medium"),
    v.literal("Low"),
    v.literal("Unknown"),
  ),
  confidenceNote: v.string(),
  sampleSize: v.optional(v.union(v.number(), v.null())),
  sampleNote: v.optional(v.string()),
  notes: v.string(),
  /** Never empty: a figure without a citation is not publishable evidence. */
  sources: v.array(
    v.object({
      label: v.string(),
      url: v.string(),
      publisher: v.string(),
      checkedAt: v.string(),
    }),
  ),
  researchedAt: v.number(),
};

export const observationStatusValidator = v.union(
  v.literal("accepted"),
  v.literal("quarantined"),
  v.literal("superseded"),
  v.literal("withdrawn"),
);

/**
 * Normalized, temporal compensation fact. Components remain nullable instead
 * of being forced to zero, and the original level/geography are retained so
 * canonical mappings can be audited or replayed.
 */
export const salaryObservationFields = {
  companyId: v.id("companies"),
  sourceId: v.id("sourceRegistry"),
  snapshotId: v.id("rawSnapshots"),
  postingId: v.optional(v.id("jobPostings")),
  externalId: v.optional(v.string()),
  canonicalUrl: v.optional(v.string()),
  rawSalaryText: v.optional(v.string()),
  parserVersion: v.optional(v.string()),
  occupationKey: v.string(),
  canonicalLevel: canonicalLevelValidator,
  rawLevel: v.optional(v.string()),
  countryCode: v.string(),
  cityKey: v.optional(v.string()),
  rawLocation: v.string(),
  currency: v.string(),
  period: v.union(
    v.literal("hour"),
    v.literal("month"),
    v.literal("year"),
    v.literal("unknown"),
  ),
  rangeKind: v.optional(
    v.union(
      v.literal("range"),
      v.literal("fixed"),
      v.literal("minimum"),
      v.literal("maximum"),
    ),
  ),
  baseMinAmount: v.optional(v.number()),
  baseMaxAmount: v.optional(v.number()),
  baseAmount: v.optional(v.number()),
  bonusAmount: v.optional(v.number()),
  equityAmount: v.optional(v.number()),
  otherAmount: v.optional(v.number()),
  totalAmount: v.optional(v.number()),
  percentile: v.optional(v.number()),
  sampleSize: v.optional(v.number()),
  employmentType: v.optional(v.string()),
  observedAt: v.number(),
  effectiveFrom: v.optional(v.number()),
  effectiveTo: v.optional(v.number()),
  confidenceScore: v.number(),
  confidenceBand: v.number(),
  qualityFlags: v.array(v.string()),
  status: observationStatusValidator,
};

/**
 * Official labour-market context is deliberately stored separately from
 * company compensation. These observations describe a population and must
 * never be mistaken for a company, level, or offer-specific salary point.
 */
export const salaryMarketObservationFields = {
  sourceId: v.id("sourceRegistry"),
  snapshotId: v.id("rawSnapshots"),
  observationKey: v.string(),
  datasetCode: v.string(),
  indicatorKey: v.string(),
  rawIndicator: v.string(),
  occupationKey: v.string(),
  rawOccupation: v.string(),
  industryKey: v.string(),
  rawIndustry: v.string(),
  countryCode: v.string(),
  regionKey: v.optional(v.string()),
  rawRegion: v.optional(v.string()),
  currency: v.string(),
  period: v.union(v.literal("hour"), v.literal("month"), v.literal("year")),
  statistic: v.union(
    v.literal("mean"),
    v.literal("median"),
    v.literal("p25"),
    v.literal("p75"),
    v.literal("p90"),
  ),
  amount: v.number(),
  referenceYear: v.number(),
  sourceUpdatedAt: v.number(),
  observedAt: v.number(),
  effectiveFrom: v.optional(v.number()),
  effectiveTo: v.optional(v.number()),
  confidenceScore: v.number(),
  confidenceBand: v.number(),
  qualityFlags: v.array(v.string()),
  status: observationStatusValidator,
};

export const cityCostObservationFields = {
  cityKey: v.string(),
  sourceId: v.id("sourceRegistry"),
  snapshotId: v.id("rawSnapshots"),
  observationKey: v.string(),
  geographyLevel: v.union(v.literal("city"), v.literal("region")),
  rawGeography: v.string(),
  category: v.union(
    v.literal("rent"),
    v.literal("transport"),
    v.literal("utilities"),
    v.literal("groceries"),
    v.literal("communications"),
    v.literal("other"),
  ),
  metric: v.union(v.literal("monthly_amount"), v.literal("per_square_meter")),
  statistic: v.union(
    v.literal("mean"),
    v.literal("median"),
    v.literal("p25"),
    v.literal("p75"),
    v.literal("fixed"),
  ),
  amount: v.number(),
  currency: v.string(),
  unit: v.string(),
  housingType: v.optional(v.string()),
  sampleSize: v.optional(v.number()),
  referenceYear: v.number(),
  sourceUpdatedAt: v.number(),
  observedAt: v.number(),
  effectiveFrom: v.optional(v.number()),
  effectiveTo: v.optional(v.number()),
  confidenceScore: v.number(),
  confidenceBand: v.number(),
  qualityFlags: v.array(v.string()),
  status: observationStatusValidator,
};

export const jobPostingFields = {
  companyId: v.id("companies"),
  sourceId: v.id("sourceRegistry"),
  externalId: v.string(),
  canonicalUrl: v.string(),
  title: v.string(),
  canonicalTitle: v.optional(v.string()),
  locations: v.array(v.string()),
  contentHash: v.string(),
  state: v.union(
    v.literal("active"),
    v.literal("closed"),
    v.literal("removed"),
    v.literal("unknown"),
  ),
  firstSeenAt: v.number(),
  lastSeenAt: v.number(),
  closedAt: v.optional(v.number()),
  successfulMissCount: v.optional(v.number()),
  relevantToSpainSoftware: v.optional(v.boolean()),
  /**
   * The posting's own text, decoded from HTML to plain text with paragraph
   * breaks kept, exactly as the source published it — nothing summarized or
   * reworded. Present only for Spain-tech postings, since that is the only
   * scope this archive ever displays; capped in `upsertPostingSnapshot` at a
   * size a real job description does not reach, so one pathological page
   * cannot blow out a row.
   *
   * Written only when the description actually changed, not on every routine
   * `lastSeenAt` touch — a `lastSeenAt`-only patch already runs on every sync
   * regardless of content, and carrying several KB of text on that write would
   * multiply its cost for no reason.
   */
  descriptionText: v.optional(v.string()),
  /**
   * Whatever pay text the source's own posting stated for this specific role
   * — never a market figure, never blended across postings. Already computed
   * per-adapter (each provider has its own extraction; Google's own
   * "Spain: €X — €Y" line reads nothing like a Greenhouse "Salary range:"
   * block), so this stores that result rather than re-deriving it generically
   * at read time, which would miss whatever a provider-specific extractor
   * catches that a generic one does not.
   */
  salaryText: v.optional(v.string()),
  /**
   * Canonical skill ids this posting mentions, and the subset of them that sit
   * inside its requirements block.
   *
   * Stored rather than derived at read time because the CV match runs in the
   * browser: a score has to recompute the instant the CV changes, and shipping
   * every posting's full description to do that would be far too much for a
   * list query. ~20 short ids is small enough to travel with the row.
   *
   * `mustHaveTokens` is what an ATS actually gates on — a skill named under
   * "Minimum qualifications" is a different thing from one mentioned in the
   * blurb, and scoring them the same is what makes naive matching useless.
   *
   * Spain-tech postings only, on the same write rules as `descriptionText`.
   */
  matchTokens: v.optional(v.array(v.string())),
  mustHaveTokens: v.optional(v.array(v.string())),
};

export const jobPostingStateValidator = v.union(
  v.literal("active"),
  v.literal("closed"),
  v.literal("removed"),
  v.literal("unknown"),
);

export const jobPostingChangeValueValidator = v.union(
  v.string(),
  v.array(v.string()),
  v.null(),
);

export const jobPostingFieldChangeValidator = v.object({
  kind: v.string(),
  before: jobPostingChangeValueValidator,
  after: jobPostingChangeValueValidator,
});

export const jobPostingVersionFields = {
  postingId: v.id("jobPostings"),
  snapshotId: v.id("rawSnapshots"),
  contentHash: v.string(),
  capturedAt: v.number(),
  title: v.optional(v.string()),
  state: v.optional(jobPostingStateValidator),
  salaryText: v.optional(v.string()),
  requirementsText: v.optional(v.string()),
  requirements: v.optional(v.array(v.string())),
  descriptionHash: v.optional(v.string()),
  locations: v.array(v.string()),
  changeKinds: v.array(v.string()),
  changes: v.optional(v.array(jobPostingFieldChangeValidator)),
  relevantToSpainSoftware: v.optional(v.boolean()),
  /**
   * True when this version records an actual change, i.e. `changeKinds` and
   * `changes` are both non-empty. Denormalized so "how many postings changed
   * recently" can be answered by an index range over changed rows only,
   * instead of reading every version in the window and filtering in JS —
   * 55 rows rather than ~2,900 at current volume.
   *
   * Optional because rows written before it existed have no value; the
   * backfill sets it, and readers that need exactness fall back accordingly.
   */
  hasMaterialChange: v.optional(v.boolean()),
};

/**
 * One record per attempt to re-read a company's career feed. `jobPostingVersions`
 * records what changed inside a posting; this records that a scan happened at
 * all, and what it moved — including a scan that found nothing, which is a
 * meaningful result rather than an absence of news.
 */
export const companyScanFields = {
  companyId: v.id("companies"),
  scannedAt: v.number(),
  status: v.union(
    v.literal("complete"),
    v.literal("partial"),
    v.literal("failed"),
  ),
  provider: v.optional(v.string()),
  rolesSeen: v.number(),
  rolesAdded: v.number(),
  rolesRemoved: v.number(),
  rolesChanged: v.number(),
  spainRoles: v.number(),
  errorMessage: v.optional(v.string()),
};

export const researchAlertFields = {
  entityType: v.union(
    v.literal("source"),
    v.literal("company"),
    v.literal("salary"),
    v.literal("city_cost"),
    v.literal("job_posting"),
    v.literal("calculation"),
  ),
  entityKey: v.string(),
  kind: v.union(
    v.literal("stale"),
    v.literal("conflict"),
    v.literal("source_failed"),
    v.literal("schema_changed"),
    v.literal("job_changed"),
    v.literal("job_removed"),
    v.literal("release_required"),
  ),
  severity: v.union(v.literal("info"), v.literal("warning"), v.literal("critical")),
  message: v.string(),
  detectedAt: v.number(),
  resolvedAt: v.optional(v.number()),
  fingerprint: v.string(),
};

/** Version pin for tax, social-security, FX, and other derived calculations. */
export const calculationVersionFields = {
  key: v.string(),
  countryCode: v.string(),
  jurisdiction: v.optional(v.string()),
  taxYear: v.optional(v.number()),
  algorithmVersion: v.string(),
  parameterHash: v.string(),
  parameters: v.any(),
  sourceKeys: v.array(v.string()),
  validatedAt: v.number(),
  effectiveFrom: v.number(),
  effectiveTo: v.optional(v.number()),
  active: v.boolean(),
};

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export default defineSchema({
  jobs: defineTable(jobFields)
    .index("by_archived", ["archived"])
    .index("by_company_and_title", ["company", "title"])
    .index("by_researchStatus", ["researchStatus"])
    .index("by_userStatus", ["userStatus"])
    .index("by_rung", ["rung"]),

  ingests: defineTable(ingestFields)
    .index("by_status", ["status"])
    .index("by_contentHash", ["contentHash"]),

  profile: defineTable(profileFields),

  salaryCache: defineTable(salaryCacheFields).index(
    "by_titleFamily_and_location_and_level",
    ["titleFamily", "location", "level"],
  ),

  tailorings: defineTable(tailoringFields).index("by_jobId", ["jobId"]),

  settings: defineTable(settingsFields),

  requests: defineTable(requestFields)
    .index("by_status", ["status"])
    .index("by_kind_and_status", ["kind", "status"]),

  sourceRegistry: defineTable(sourceRegistryFields)
    .index("by_key", ["key"])
    .index("by_enabled_and_nextRunAt", ["enabled", "nextRunAt"])
    .index("by_health", ["health"]),

  sourceRuns: defineTable(sourceRunFields)
    .index("by_sourceId_and_startedAt", ["sourceId", "startedAt"])
    .index("by_runKey", ["runKey"])
    .index("by_status", ["status"]),

  rawSnapshots: defineTable(rawSnapshotFields)
    .index("by_sourceId_and_contentHash", ["sourceId", "contentHash"])
    .index("by_runId", ["runId"]),

  companies: defineTable(companyFields)
    .index("by_slug", ["slug"])
    .index("by_lei", ["lei"])
    .index("by_researchStatus", ["researchStatus"]),

  salaryObservations: defineTable(salaryObservationFields)
    .index("by_company_level_city", ["companyId", "canonicalLevel", "cityKey"])
    .index("by_posting_status", ["postingId", "status"])
    .index("by_sourceId_and_observedAt", ["sourceId", "observedAt"])
    .index("by_status", ["status"])
    // Salary history for one company, newest-first, without scanning by status
    // and filtering. `status` is in the key so a history view can ask for just
    // the superseded chain that records what a figure used to be.
    .index("by_company_status_observedAt", ["companyId", "status", "observedAt"])
    // Retention asks "does anything still cite this snapshot?" once per
    // candidate. Without this it answered by reading every observation in the
    // table on every run.
    .index("by_snapshotId", ["snapshotId"]),

  salaryMarketObservations: defineTable(salaryMarketObservationFields)
    .index("by_sourceId_and_observationKey", ["sourceId", "observationKey"])
    .index("by_country_and_status", ["countryCode", "status"])
    .index("by_sourceId_and_observedAt", ["sourceId", "observedAt"])
    .index("by_snapshotId", ["snapshotId"]),

  cityCostObservations: defineTable(cityCostObservationFields)
    .index("by_sourceId_and_observationKey", ["sourceId", "observationKey"])
    .index("by_city_category_observedAt", ["cityKey", "category", "observedAt"])
    .index("by_city_and_status", ["cityKey", "status"])
    .index("by_sourceId_and_observedAt", ["sourceId", "observedAt"])
    .index("by_snapshotId", ["snapshotId"]),

  jobPostings: defineTable(jobPostingFields)
    .index("by_source_externalId", ["sourceId", "externalId"])
    .index("by_company_source_externalId", ["companyId", "sourceId", "externalId"])
    .index("by_company_state", ["companyId", "state"])
    .index("by_company_relevance_state", ["companyId", "relevantToSpainSoftware", "state"])
    // Dedupe across sources: a role the cron already captured must not be
    // stored a second time when a research pass reads the same portal.
    .index("by_company_canonicalUrl", ["companyId", "canonicalUrl"])
    .index("by_relevance_and_state", ["relevantToSpainSoftware", "state"])
    .index("by_lastSeenAt", ["lastSeenAt"]),

  jobPostingVersions: defineTable(jobPostingVersionFields)
    .index("by_postingId_and_capturedAt", ["postingId", "capturedAt"])
    .index("by_capturedAt", ["capturedAt"])
    .index("by_relevance_and_capturedAt", ["relevantToSpainSoftware", "capturedAt"])
    .index("by_relevance_change_capturedAt", [
      "relevantToSpainSoftware",
      "hasMaterialChange",
      "capturedAt",
    ])
    .index("by_snapshotId", ["snapshotId"]),

  cvRewrites: defineTable(cvRewriteFields)
    .index("by_posting_and_version", ["postingId", "cvVersion"]),

  companySalaryCatalog: defineTable(companySalaryCatalogFields)
    .index("by_companySlug", ["companySlug"])
    .index("by_companySlug_level_location", ["companySlug", "level", "location"])
    // The re-check queue asks for figures older than a cutoff; without this it
    // would read the whole catalog and drop most of it in JS.
    .index("by_researchedAt", ["researchedAt"]),

  companySalaryChecks: defineTable(companySalaryCheckFields).index("by_companySlug", [
    "companySlug",
  ]),

  companyScans: defineTable(companyScanFields)
    .index("by_company_and_scannedAt", ["companyId", "scannedAt"])
    .index("by_scannedAt", ["scannedAt"]),

  researchAlerts: defineTable(researchAlertFields)
    .index("by_fingerprint", ["fingerprint"])
    .index("by_entityType_and_entityKey", ["entityType", "entityKey"])
    .index("by_resolvedAt", ["resolvedAt"]),

  // One row. Records the fingerprint of the compiled source catalog that was
  // last written to sourceRegistry, so the sync that runs before nearly every
  // research action can skip its work when the catalog has not changed.
  catalogSyncState: defineTable({
    key: v.string(),
    fingerprint: v.string(),
    syncedAt: v.number(),
  }).index("by_key", ["key"]),

  calculationVersions: defineTable(calculationVersionFields)
    .index("by_key_and_active", ["key", "active"])
    .index("by_countryCode_and_effectiveFrom", ["countryCode", "effectiveFrom"]),
});
