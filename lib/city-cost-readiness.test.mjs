import assert from "node:assert/strict";
import test from "node:test";

import {
  PENDING_CITY_COST_BUNDLES,
  evaluateCityCostReadiness,
  pendingCityCostBundle,
} from "./city-cost-readiness.ts";

const NOW = Date.UTC(2026, 7, 29, 12);
const DAY_MS = 24 * 60 * 60_000;

const healthySource = (key) => ({
  key,
  health: "healthy",
  lastSuccessfulAt: NOW - 60_000,
  maxStalenessMs: 2 * DAY_MS,
});

const input = (overrides = {}) => ({
  now: NOW,
  requiredCategories: ["groceries", "utilities", "communications", "transport"],
  presentCategories: ["groceries", "utilities", "communications", "transport"],
  rent: {
    monthlyAmountEur: 1012,
    perSquareMeterEur: 13.4,
    sampleSize: 48_000,
    monthlyReferenceYear: 2024,
    perSquareMeterReferenceYear: 2024,
    sharesSource: true,
    ...(overrides.rent ?? {}),
  },
  sources: overrides.sources ?? [healthySource("aeat"), healthySource("ine"), healthySource("crtm")],
  ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== "rent" && key !== "sources")),
});

test("a complete, fresh bundle is current", () => {
  const readiness = evaluateCityCostReadiness(input());
  assert.equal(readiness.status, "current");
  assert.deepEqual(readiness.unmet, []);
  assert.deepEqual(readiness.staleSourceKeys, []);
});

test("a missing household category locks the city and names the gap", () => {
  const readiness = evaluateCityCostReadiness(
    input({ presentCategories: ["groceries", "transport"] }),
  );
  assert.equal(readiness.status, "incomplete");
  assert.ok(readiness.unmet.includes("household_categories"));
  assert.match(readiness.explanation, /non-housing household costs/);
});

test("a missing transport fare locks the city", () => {
  const readiness = evaluateCityCostReadiness(
    input({ presentCategories: ["groceries", "utilities", "communications"] }),
  );
  assert.equal(readiness.status, "incomplete");
  assert.ok(readiness.unmet.includes("transport"));
  assert.match(readiness.explanation, /transport fare/);
});

test("rent must be complete, sampled, and internally consistent", () => {
  assert.ok(
    evaluateCityCostReadiness(input({ rent: { monthlyAmountEur: null } })).unmet.includes("rent_monthly"),
  );
  assert.ok(
    evaluateCityCostReadiness(input({ rent: { perSquareMeterEur: 0 } })).unmet.includes(
      "rent_per_square_meter",
    ),
  );
  assert.ok(
    evaluateCityCostReadiness(input({ rent: { sampleSize: null } })).unmet.includes("rent_sample_size"),
  );
});

test("rent figures from different years or different sources fail the effective-date gate", () => {
  assert.ok(
    evaluateCityCostReadiness(
      input({ rent: { perSquareMeterReferenceYear: 2023 } }),
    ).unmet.includes("rent_effective_date"),
  );
  assert.ok(
    evaluateCityCostReadiness(input({ rent: { sharesSource: false } })).unmet.includes(
      "rent_effective_date",
    ),
  );
});

test("a stale source locks an otherwise complete bundle and names the source", () => {
  const readiness = evaluateCityCostReadiness(
    input({
      sources: [
        healthySource("ine"),
        { key: "crtm", health: "healthy", lastSuccessfulAt: NOW - 5 * DAY_MS, maxStalenessMs: 2 * DAY_MS },
      ],
    }),
  );
  assert.equal(readiness.status, "stale");
  assert.deepEqual(readiness.unmet, ["source_health"]);
  assert.deepEqual(readiness.staleSourceKeys, ["crtm"]);
  assert.match(readiness.explanation, /crtm/);
});

test("a failing source and a never-successful source both fail health", () => {
  const failing = evaluateCityCostReadiness(
    input({ sources: [{ key: "aeat", health: "failing", lastSuccessfulAt: NOW, maxStalenessMs: DAY_MS }] }),
  );
  assert.deepEqual(failing.staleSourceKeys, ["aeat"]);

  const neverRan = evaluateCityCostReadiness(
    input({ sources: [{ key: "aeat", health: "healthy", lastSuccessfulAt: null, maxStalenessMs: DAY_MS }] }),
  );
  assert.deepEqual(neverRan.staleSourceKeys, ["aeat"]);
});

test("a bundle with no sources at all cannot be current", () => {
  const readiness = evaluateCityCostReadiness(input({ sources: [] }));
  assert.notEqual(readiness.status, "current");
  assert.ok(readiness.unmet.includes("source_health"));
});

test("structural gaps outrank staleness so the message explains the real blocker", () => {
  const readiness = evaluateCityCostReadiness(
    input({
      presentCategories: ["groceries"],
      sources: [{ key: "ine", health: "failing", lastSuccessfulAt: null, maxStalenessMs: DAY_MS }],
    }),
  );
  assert.equal(readiness.status, "incomplete");
  assert.match(readiness.explanation, /missing/);
});

test("Barcelona is recorded as pending with the exact evidence it still needs", () => {
  const barcelona = pendingCityCostBundle("barcelona-city");
  assert.ok(barcelona);
  assert.equal(barcelona.cityLabel, "Barcelona");
  assert.equal(barcelona.missingEvidence.length, 3);
  assert.match(barcelona.note, /Substituting a national or provincial figure/);
  assert.equal(pendingCityCostBundle("madrid-city"), null);
  assert.equal(pendingCityCostBundle("valencia-city"), null);
  for (const bundle of PENDING_CITY_COST_BUNDLES) {
    assert.ok(bundle.missingEvidence.length > 0, bundle.cityKey);
  }
});
