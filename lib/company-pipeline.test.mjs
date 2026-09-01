import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCompanyPipeline,
  SALARY_RECHECK_AFTER_MS,
} from "./company-pipeline.ts";

const NOW = 1_800_000_000_000;

function company(slug, overrides = {}) {
  return {
    canonicalName: slug.toUpperCase(),
    slug,
    researchStatus: "monitoring",
    openRoleCount: 0,
    ...overrides,
  };
}

function point(slug, level, overrides = {}) {
  return {
    companySlug: slug,
    level,
    location: "Spain-wide",
    locationLabel: "Spain-wide",
    companyLevel: "L1",
    totalCompEur: 50_000,
    baseEur: 45_000,
    bonusEur: null,
    equityEur: null,
    extrasEur: null,
    confidence: "Medium",
    confidenceNote: "note",
    notes: "notes",
    sources: [{ label: "l", url: "https://example.com", publisher: "p", checkedAt: "2026-09-01" }],
    researchedAt: NOW,
    ...overrides,
  };
}

test("the pay queue lists only companies missing a decidable level", () => {
  const { payQueue } = buildCompanyPipeline({
    trackedCompanies: [company("full"), company("partial"), company("empty")],
    catalogPoints: [
      point("full", "intern"),
      point("full", "junior"),
      point("full", "mid"),
      point("partial", "mid"),
    ],
    now: NOW,
  });
  assert.deepEqual(payQueue.map((entry) => entry.slug), ["empty", "partial"]);
  assert.deepEqual(payQueue.find((e) => e.slug === "partial").missingLevels, [
    "intern",
    "junior",
  ]);
});

test("a senior-only figure does not satisfy the pay queue", () => {
  // The levels that matter are intern/junior/mid; a senior figure is real
  // evidence but not evidence for a decision at those levels.
  const { payQueue } = buildCompanyPipeline({
    trackedCompanies: [company("meta")],
    catalogPoints: [point("meta", "senior"), point("meta", "staff")],
    now: NOW,
  });
  assert.deepEqual(payQueue.map((e) => e.slug), ["meta"]);
  assert.deepEqual(payQueue[0].missingLevels, ["intern", "junior", "mid"]);
});

test("the pay queue does not change when the viewed level changes", () => {
  // The old list was filtered by the salary table's level, so identical data
  // produced 31 companies at Intern and 24 at SDE1. There is no level input.
  const args = {
    trackedCompanies: [company("a"), company("b")],
    catalogPoints: [point("a", "junior"), point("a", "mid"), point("a", "intern")],
    now: NOW,
  };
  assert.deepEqual(buildCompanyPipeline(args).payQueue.map((e) => e.slug), ["b"]);
});

test("the review list is companies with no careers feed, not companies without pay", () => {
  const { reviewList, payQueue } = buildCompanyPipeline({
    trackedCompanies: [
      company("monitored", { researchStatus: "monitoring" }),
      company("queued", { researchStatus: "queued" }),
      company("dead", { researchStatus: "unsupported", discoveryAttempts: 3 }),
      company("trying", { researchStatus: "unsupported", discoveryAttempts: 1 }),
    ],
    catalogPoints: [],
    now: NOW,
  });
  // Every company lacks pay, so all four are in the pay queue...
  assert.equal(payQueue.length, 4);
  // ...but only the three without a feed are in the review list.
  assert.deepEqual(reviewList.map((e) => e.slug), ["dead", "queued", "trying"]);
});

test("a company that has spent its discovery attempts is flagged untrackable", () => {
  const { reviewList } = buildCompanyPipeline({
    trackedCompanies: [
      company("dead", { researchStatus: "unsupported", discoveryAttempts: 3 }),
      company("trying", { researchStatus: "unsupported", discoveryAttempts: 1 }),
    ],
    catalogPoints: [],
    now: NOW,
  });
  assert.equal(reviewList.find((e) => e.slug === "dead").untrackable, true);
  assert.equal(reviewList.find((e) => e.slug === "trying").untrackable, false);
});

test("re-check selects only figures past the window, oldest first", () => {
  const stale = NOW - SALARY_RECHECK_AFTER_MS - 86_400_000;
  const { recheck } = buildCompanyPipeline({
    trackedCompanies: [company("a"), company("b")],
    catalogPoints: [
      point("a", "junior", { researchedAt: NOW }),
      point("a", "mid", { researchedAt: stale }),
      point("b", "junior", { researchedAt: stale - 86_400_000 }),
    ],
    now: NOW,
  });
  assert.deepEqual(recheck.map((e) => `${e.companySlug}:${e.level}`), [
    "b:junior",
    "a:mid",
  ]);
  assert.equal(recheck[0].ageDays, 32);
});

test("a figure exactly at the window boundary is due", () => {
  const { recheck } = buildCompanyPipeline({
    trackedCompanies: [company("a")],
    catalogPoints: [point("a", "mid", { researchedAt: NOW - SALARY_RECHECK_AFTER_MS })],
    now: NOW,
  });
  assert.equal(recheck.length, 1);
});
