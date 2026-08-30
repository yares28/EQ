import assert from "node:assert/strict";
import test from "node:test";

import { buildCompanyDecisionBrief } from "./company-decision-brief.ts";

function candidate(slug, overrides = {}) {
  return {
    slug,
    name: slug.toUpperCase(),
    totalCompEur: 100_000,
    monthlyNetCashEur: 4_000,
    progressionPercent: 30,
    marketPercentile: 50,
    cityAfterCostsEur: 2_700,
    evidenceScore: 80,
    ...overrides,
  };
}

test("names a lead only when one company wins at least two decision dimensions", () => {
  const result = buildCompanyDecisionBrief({
    candidates: [
      candidate("alpha", {
        totalCompEur: 120_000,
        monthlyNetCashEur: 4_700,
        progressionPercent: 45,
        marketPercentile: 75,
      }),
      candidate("beta", {
        totalCompEur: 100_000,
        monthlyNetCashEur: 4_000,
        progressionPercent: 30,
        marketPercentile: 50,
      }),
    ],
  });

  assert.equal(result.status, "lead");
  assert.equal(result.leadSlug, "alpha");
  assert.equal(result.confidence, "strong");
  assert.equal(result.winCounts.alpha, 4);
});

test("preserves a pay-versus-progression trade-off instead of inventing a score", () => {
  const result = buildCompanyDecisionBrief({
    candidates: [
      candidate("alpha", { totalCompEur: 120_000, monthlyNetCashEur: null, progressionPercent: 20, marketPercentile: null }),
      candidate("beta", { totalCompEur: 100_000, monthlyNetCashEur: null, progressionPercent: 45, marketPercentile: null }),
    ],
  });

  assert.equal(result.status, "tradeoff");
  assert.match(result.headline, /leads current pay/i);
  assert.match(result.summary, /does not collapse/i);
});

test("excludes missing values instead of turning them into zero", () => {
  const result = buildCompanyDecisionBrief({
    candidates: [
      candidate("alpha", { monthlyNetCashEur: 4_500, progressionPercent: null, marketPercentile: null }),
      candidate("beta", { monthlyNetCashEur: null, progressionPercent: null, marketPercentile: null }),
    ],
  });

  assert.equal(result.metrics.find((metric) => metric.key === "monthlyNetCash").status, "locked");
  assert.equal(result.status, "locked");
});

test("treats immaterial differences as ties", () => {
  const result = buildCompanyDecisionBrief({
    candidates: [
      candidate("alpha", { totalCompEur: 100_400, monthlyNetCashEur: 4_020, progressionPercent: 30.5, marketPercentile: 50 }),
      candidate("beta", { totalCompEur: 100_000, monthlyNetCashEur: 4_000, progressionPercent: 30, marketPercentile: 50 }),
    ],
  });

  assert.equal(result.metrics.find((metric) => metric.key === "totalComp").status, "tie");
  assert.equal(result.metrics.find((metric) => metric.key === "monthlyNetCash").status, "tie");
  assert.equal(result.metrics.find((metric) => metric.key === "progression").status, "tie");
  assert.equal(result.status, "tradeoff");
});

test("shows city-cost remainder and evidence as context without double-counting them", () => {
  const result = buildCompanyDecisionBrief({
    candidates: [
      candidate("alpha", { cityAfterCostsEur: 3_000, evidenceScore: 90, progressionPercent: 20, marketPercentile: null }),
      candidate("beta", { cityAfterCostsEur: 2_000, evidenceScore: 60, progressionPercent: 50, marketPercentile: null }),
    ],
  });

  assert.equal(result.metrics.find((metric) => metric.key === "cityAfterCosts").status, "decisive");
  assert.equal(result.metrics.find((metric) => metric.key === "cityAfterCosts").countsTowardDecision, false);
  assert.equal(result.metrics.find((metric) => metric.key === "evidence").countsTowardDecision, false);
  assert.equal(result.decisiveMetricCount, 1);
});

test("keeps preview recommendations explicitly limited", () => {
  const result = buildCompanyDecisionBrief({
    candidates: [
      candidate("alpha", { totalCompEur: 120_000, monthlyNetCashEur: 4_700, progressionPercent: 45, marketPercentile: 75 }),
      candidate("beta"),
    ],
    usingPreview: true,
  });

  assert.equal(result.status, "lead");
  assert.equal(result.confidence, "limited");
});

test("each decisive dimension is explained with the size of the gap", () => {
  const result = buildCompanyDecisionBrief({
    candidates: [
      candidate("alpha", { totalCompEur: 120_000, monthlyNetCashEur: 4_700, progressionPercent: 45 }),
      candidate("beta", { totalCompEur: 100_000, monthlyNetCashEur: 4_000, progressionPercent: 30 }),
    ],
  });

  const totalComp = result.tradeoffs.find((tradeoff) => tradeoff.key === "totalComp");
  assert.ok(totalComp);
  assert.equal(totalComp.leaderSlug, "alpha");
  assert.equal(totalComp.delta, 20_000);
  assert.equal(totalComp.explanation, "ALPHA leads total compensation by €20,000.");

  const netCash = result.tradeoffs.find((tradeoff) => tradeoff.key === "monthlyNetCash");
  assert.match(netCash.explanation, /€700\/month/);

  const progression = result.tradeoffs.find((tradeoff) => tradeoff.key === "progression");
  assert.match(progression.explanation, /15 pp/);
});

test("a near-tie counts for neither company and says so", () => {
  const result = buildCompanyDecisionBrief({
    candidates: [
      candidate("alpha", { totalCompEur: 100_200, progressionPercent: 45 }),
      candidate("beta", { totalCompEur: 100_000, progressionPercent: 30 }),
    ],
  });

  assert.ok(result.tiedMetricKeys.includes("totalComp"));
  assert.equal(result.winCounts.alpha < 4, true);
  assert.ok(!result.tradeoffs.some((tradeoff) => tradeoff.key === "totalComp"));
  assert.match(result.tieNote, /too close to separate/);
});

test("no tie note appears when every dimension separates the companies", () => {
  const result = buildCompanyDecisionBrief({
    candidates: [
      candidate("alpha", {
        totalCompEur: 130_000,
        monthlyNetCashEur: 5_000,
        progressionPercent: 50,
        marketPercentile: 80,
        cityAfterCostsEur: 3_200,
        evidenceScore: 90,
      }),
      candidate("beta"),
    ],
  });
  assert.deepEqual(result.tiedMetricKeys, []);
  assert.equal(result.tieNote, null);
});

test("answers what choosing the runner-up would gain and cost", () => {
  const result = buildCompanyDecisionBrief({
    candidates: [
      candidate("alpha", { totalCompEur: 120_000, monthlyNetCashEur: 4_700, progressionPercent: 20 }),
      candidate("beta", { totalCompEur: 100_000, monthlyNetCashEur: 4_000, progressionPercent: 45 }),
    ],
  });

  assert.equal(result.alternatives.length, 1);
  const beta = result.alternatives[0];
  assert.equal(beta.slug, "beta");
  assert.ok(beta.strengths.includes("progression"));
  assert.ok(beta.concessions.includes("totalComp"));
  assert.match(beta.explanation, /^Choosing BETA over ALPHA gains 25 pp of next-level jump/);
  assert.match(beta.explanation, /gives up .*€20,000 of total compensation/);
});

test("an alternative that loses everywhere is described without inventing an upside", () => {
  const result = buildCompanyDecisionBrief({
    candidates: [
      candidate("alpha", {
        totalCompEur: 130_000,
        monthlyNetCashEur: 5_000,
        progressionPercent: 50,
        marketPercentile: 80,
      }),
      candidate("beta"),
    ],
  });
  const beta = result.alternatives.find((alternative) => alternative.slug === "beta");
  assert.deepEqual(beta.strengths, []);
  assert.match(beta.explanation, /gains nothing measurable/);
});

test("every non-leading candidate is explained, not just the runner-up", () => {
  const result = buildCompanyDecisionBrief({
    candidates: [
      candidate("alpha", { totalCompEur: 130_000, progressionPercent: 50, marketPercentile: 80 }),
      candidate("beta", { totalCompEur: 110_000 }),
      candidate("gamma", { totalCompEur: 90_000 }),
    ],
  });
  assert.equal(result.alternatives.length, 2);
  assert.deepEqual(
    result.alternatives.map((alternative) => alternative.slug).sort(),
    ["beta", "gamma"],
  );
});

test("indistinguishable candidates are reported as such rather than ranked", () => {
  const result = buildCompanyDecisionBrief({
    candidates: [candidate("alpha"), candidate("beta")],
  });
  assert.equal(result.status, "tradeoff");
  const beta = result.alternatives[0];
  assert.match(beta.explanation, /within the meaningful-difference threshold/);
});

test("stale evidence degrades confidence and says why", () => {
  const staleInput = {
    candidates: [
      candidate("alpha", { totalCompEur: 130_000, monthlyNetCashEur: 5_000, progressionPercent: 50, marketPercentile: 80 }),
      candidate("beta"),
    ],
  };
  const fresh = buildCompanyDecisionBrief(staleInput);
  assert.equal(fresh.confidence, "strong");
  assert.equal(fresh.evidenceCaveat, null);

  const stale = buildCompanyDecisionBrief({ ...staleInput, usingStaleEvidence: true });
  assert.equal(stale.confidence, "limited");
  assert.match(stale.evidenceCaveat, /past its refresh window/);
  assert.equal(stale.leadName, fresh.leadName, "stale evidence must not change who leads");
});

test("preview evidence is caveated separately from stale evidence", () => {
  const result = buildCompanyDecisionBrief({
    candidates: [candidate("alpha", { totalCompEur: 130_000 }), candidate("beta")],
    usingPreview: true,
  });
  assert.equal(result.confidence, "limited");
  assert.match(result.evidenceCaveat, /preview evidence/);
});

test("a locked brief offers no trade-offs or alternatives to act on", () => {
  const result = buildCompanyDecisionBrief({
    candidates: [
      candidate("alpha", {
        totalCompEur: null,
        monthlyNetCashEur: null,
        progressionPercent: null,
        marketPercentile: null,
      }),
    ],
  });
  assert.equal(result.status, "locked");
  assert.deepEqual(result.tradeoffs, []);
  assert.deepEqual(result.alternatives, []);
});
