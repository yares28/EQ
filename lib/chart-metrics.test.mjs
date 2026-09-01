import assert from "node:assert/strict";
import test from "node:test";

import {
  CHART_DIMENSIONS,
  CHART_METRICS,
  dimensionById,
  formatMetric,
  formatMetricTick,
  metricById,
} from "./chart-metrics.ts";

const company = {
  canonicalName: "Testco",
  slug: "testco",
  companyType: "Other",
  locationAvailability: ["Madrid"],
  lastResearchedAt: "2026-08-01",
  sources: [],
  salaryPoints: [],
  researchNotes: "",
};

const env = {
  companies: [company],
  postedRanges: [],
  level: "junior",
  location: "Madrid",
  payBasis: "base",
};

/** A row with no evidence at all — every metric must yield null, never 0. */
const emptyRow = {
  company,
  point: null,
  netMonthly: null,
  afterCostsMonthly: null,
  costSharePercent: null,
  effectiveDeductionRatePercent: null,
};

test("every metric returns null rather than zero when evidence is missing", () => {
  for (const metric of CHART_METRICS) {
    const value = metric.accessor(emptyRow, env);
    // Counts may legitimately be 0; magnitudes may not, because a missing
    // figure shown as zero reads as a real measurement.
    if (metric.zeroIsRealValue !== true) {
      assert.notEqual(value, 0, `${metric.id} returned 0 for a row with no evidence`);
    }
    assert.ok(
      value === null || Number.isFinite(value),
      `${metric.id} returned a non-finite value: ${value}`,
    );
  }
});

test("no metric leaks Infinity or NaN from a zero denominator", () => {
  // totalCompEur of 0 is the shape that made equityShare return Infinity.
  const zeroDenominatorRow = {
    ...emptyRow,
    point: {
      id: "p",
      level: "junior",
      levelLabel: "SDE1",
      companyLevel: "L3",
      location: "Madrid",
      locationLabel: "Madrid",
      totalCompEur: 0,
      baseEur: 0,
      bonusEur: null,
      equityEur: 1_000,
      extrasEur: null,
      confidence: "Low",
      confidenceNote: "",
      sourceIds: [],
      notes: "",
    },
  };

  for (const metric of CHART_METRICS) {
    const value = metric.accessor(zeroDenominatorRow, env);
    assert.ok(
      value === null || Number.isFinite(value),
      `${metric.id} returned ${value} for a zero-denominator row`,
    );
  }
});

test("metric ids are unique and resolvable", () => {
  const ids = CHART_METRICS.map((metric) => metric.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate metric id");
  for (const id of ids) assert.ok(metricById(id) !== null);
  assert.equal(metricById("does-not-exist"), null);
});

test("dimension ids are unique and resolvable", () => {
  const ids = CHART_DIMENSIONS.map((dimension) => dimension.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate dimension id");
  for (const id of ids) assert.ok(dimensionById(id) !== null);
  assert.equal(dimensionById("nope"), null);
});

test("dimensions always yield a label, never undefined", () => {
  for (const dimension of CHART_DIMENSIONS) {
    const value = dimension.valueOf(emptyRow);
    assert.equal(typeof value, "string");
    assert.ok(value.length > 0, `${dimension.id} produced an empty label`);
  }
});

test("formatters render null as an em dash rather than a number", () => {
  for (const unit of ["eur", "eurPerMonth", "percent", "score", "days", "count"]) {
    assert.equal(formatMetric(null, unit), "—");
  }
});

test("formatters keep negative values signed", () => {
  // A negative after-costs figure is a real shortfall and must not be hidden.
  assert.ok(formatMetric(-340, "eurPerMonth").includes("-"));
  assert.ok(formatMetricTick(-340, "eurPerMonth").includes("-"));
});
