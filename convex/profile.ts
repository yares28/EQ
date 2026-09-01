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
