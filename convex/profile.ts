import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { profileFields } from "./schema";

const profileDocValidator = v.object({
  _id: v.id("profile"),
  _creationTime: v.number(),
  ...profileFields,
});

/** The single-user profile, or null before the first CV upload/confirm. */
export const get = query({
  args: {},
  returns: v.union(profileDocValidator, v.null()),
  handler: async (ctx) => {
    return await ctx.db.query("profile").first();
  },
});

/**
 * Create or update the singleton profile. Fields passed replace the stored
 * ones; omitted optional fields are left untouched.
 */
export const upsert = mutation({
  args: {
    cv: profileFields.cv,
    skills: profileFields.skills,
    education: profileFields.education,
    projects: profileFields.projects,
    languages: profileFields.languages,
    availabilityDate: v.optional(v.number()),
    baseLocation: v.optional(v.string()),
  },
  returns: v.id("profile"),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("profile").first();
    if (existing !== null) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return await ctx.db.insert("profile", args);
  },
});

/**
 * Step 1 of CV upload: mint a short-lived URL the client POSTs the file to
 * directly. The client then gets back a storage ID and calls `attachCv`.
 */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Step 2 of CV upload: record the freshly-uploaded file against the
 * singleton profile. `confirmed` starts false until the user reviews the
 * parsed CV (see `confirmCv`). Creates the profile row if this is the very
 * first upload (no skills/education/etc. yet — those are filled by the
 * parse step and `upsert`).
 */
export const attachCv = mutation({
  args: { storageId: v.id("_storage") },
  returns: v.id("profile"),
  handler: async (ctx, args) => {
    const cv = { storageId: args.storageId, parsedAt: Date.now(), confirmed: false };
    const existing = await ctx.db.query("profile").first();
    if (existing !== null) {
      await ctx.db.patch(existing._id, { cv });
      return existing._id;
    }
    return await ctx.db.insert("profile", {
      cv,
      skills: [],
      education: [],
      projects: [],
      languages: [],
    });
  },
});

/** Step 3 of CV upload: the user confirms the parsed CV is correct. */
export const confirmCv = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const existing = await ctx.db.query("profile").first();
    if (existing === null || existing.cv === undefined) {
      throw new Error("Cannot confirm CV: no profile or no CV attached yet");
    }
    await ctx.db.patch(existing._id, { cv: { ...existing.cv, confirmed: true } });
    return null;
  },
});

/**
 * Records an imported CV: its text, its parsed structure, and the skills the
 * parser found.
 *
 * The whole match feature derives from this row and nothing is precomputed, so
 * saving here is what makes every score on every page recheck — there is no
 * cached score to invalidate and no job to re-run. `cvVersion` moves with each
 * import so a rewrite written against an older CV can be told apart.
 *
 * Compares before patching: re-importing the identical file must not wake every
 * subscriber for a row that did not change.
 */
export const saveParsedCv = mutation({
  args: {
    cvText: v.string(),
    cvStructured: v.any(),
    cvFileName: v.string(),
    skills: profileFields.skills,
    languages: profileFields.languages,
    education: profileFields.education,
  },
  returns: v.object({
    profileId: v.id("profile"),
    cvVersion: v.string(),
    changed: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("profile").first();
    // The parser version is part of "unchanged": when parsing improves, the
    // same file must re-parse rather than keep structure the old parser got
    // wrong. Comparing only the text left stale bullets on file after the
    // continuation fix.
    const storedVersion =
      (existing?.cvStructured as { parserVersion?: string } | undefined)?.parserVersion;
    const incomingVersion = (args.cvStructured as { parserVersion?: string }).parserVersion;
    const unchanged =
      existing !== null &&
      existing.cvText === args.cvText &&
      existing.cvFileName === args.cvFileName &&
      storedVersion === incomingVersion;
    if (unchanged && existing.cvVersion !== undefined) {
      return { profileId: existing._id, cvVersion: existing.cvVersion, changed: false };
    }

    const now = Date.now();
    // Content-derived so the same file always yields the same version, and a
    // changed file always yields a different one.
    const cvVersion = `${now.toString(36)}-${args.cvText.length.toString(36)}`;
    const fields = {
      cvText: args.cvText,
      cvStructured: args.cvStructured,
      cvFileName: args.cvFileName,
      cvUpdatedAt: now,
      cvVersion,
      skills: args.skills,
      languages: args.languages,
      education: args.education,
    };

    if (existing !== null) {
      await ctx.db.patch(existing._id, fields);
      return { profileId: existing._id, cvVersion, changed: true };
    }
    const profileId = await ctx.db.insert("profile", {
      ...fields,
      projects: [],
    });
    return { profileId, cvVersion, changed: true };
  },
});

/** The level the seniority signal scores against; defaults to junior. */
export const setTargetLevel = mutation({
  args: { targetLevel: profileFields.targetLevel },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("profile").first();
    if (existing === null) {
      await ctx.db.insert("profile", {
        skills: [],
        education: [],
        projects: [],
        languages: [],
        targetLevel: args.targetLevel,
      });
      return null;
    }
    if (existing.targetLevel === args.targetLevel) return null;
    await ctx.db.patch(existing._id, { targetLevel: args.targetLevel });
    return null;
  },
});

/** Where the user is based, which the location signal scores against. */
export const setBaseLocation = mutation({
  args: { baseLocation: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("profile").first();
    if (existing === null) {
      await ctx.db.insert("profile", {
        skills: [],
        education: [],
        projects: [],
        languages: [],
        baseLocation: args.baseLocation,
      });
      return null;
    }
    if (existing.baseLocation === args.baseLocation) return null;
    await ctx.db.patch(existing._id, { baseLocation: args.baseLocation });
    return null;
  },
});
