import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { personalCityCostValidator, settingsFields } from "./schema";

const settingsDocValidator = v.object({
  _id: v.id("settings"),
  _creationTime: v.number(),
  ...settingsFields,
});

const DEFAULTS = {
  weights: { fit: 30, salary: 20, aura: 15, future: 20, flex: 15 },
  dealbreakers: [] as string[],
  displayCurrency: "EUR",
  dailyApplyCap: 3,
};

/** The singleton settings row, or null before first write/seed. */
export const get = query({
  args: {},
  returns: v.union(settingsDocValidator, v.null()),
  handler: async (ctx) => {
    return await ctx.db.query("settings").first();
  },
});

/**
 * Partial update of the singleton settings row. Creates it with defaults
 * merged if it doesn't exist yet.
 */
export const update = mutation({
  args: {
    weights: v.optional(settingsFields.weights),
    dealbreakers: v.optional(v.array(v.string())),
    displayCurrency: v.optional(v.string()),
    dailyApplyCap: v.optional(v.number()),
    personalCityCosts: v.optional(v.array(personalCityCostValidator)),
  },
  returns: v.id("settings"),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("settings").first();
    if (existing !== null) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return await ctx.db.insert("settings", {
      weights: args.weights ?? DEFAULTS.weights,
      dealbreakers: args.dealbreakers ?? DEFAULTS.dealbreakers,
      displayCurrency: args.displayCurrency ?? DEFAULTS.displayCurrency,
      dailyApplyCap: args.dailyApplyCap ?? DEFAULTS.dailyApplyCap,
      personalCityCosts: args.personalCityCosts ?? [],
    });
  },
});

/**
 * Replaces the whole personal-cost list. One entry per location: saving a
 * location that already exists overwrites it rather than adding a second row,
 * so the salary pages never have to choose between two figures for one city.
 */
export const savePersonalCityCost = mutation({
  args: {
    location: v.string(),
    rentEur: v.number(),
    groceriesEur: v.number(),
    transportEur: v.number(),
    utilitiesEur: v.number(),
    otherEur: v.number(),
  },
  returns: v.id("settings"),
  handler: async (ctx, args) => {
    const entry = { ...args, updatedAt: Date.now() };
    const existing = await ctx.db.query("settings").first();
    if (existing === null) {
      return await ctx.db.insert("settings", { ...DEFAULTS, personalCityCosts: [entry] });
    }
    const current = existing.personalCityCosts ?? [];
    const next = [
      ...current.filter((item) => item.location !== args.location),
      entry,
    ].sort((left, right) => left.location.localeCompare(right.location));
    await ctx.db.patch(existing._id, { personalCityCosts: next });
    return existing._id;
  },
});

export const removePersonalCityCost = mutation({
  args: { location: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("settings").first();
    if (existing === null) return null;
    await ctx.db.patch(existing._id, {
      personalCityCosts: (existing.personalCityCosts ?? []).filter(
        (item) => item.location !== args.location,
      ),
    });
    return null;
  },
});
