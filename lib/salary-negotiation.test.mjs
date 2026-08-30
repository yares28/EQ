import assert from "node:assert/strict";
import test from "node:test";

import { analyzeSalaryNegotiation } from "./salary-negotiation.ts";

function company(slug, amount, location = "Spain-wide", confidence = "Medium") {
  return {
    canonicalName: slug,
    slug,
    companyType: "Other",
    locationAvailability: [location],
    lastResearchedAt: "2026-08-27",
    sources: [],
    researchNotes: "",
    salaryPoints: amount === null ? [] : [{
      id: `${slug}-mid`,
      level: "mid",
      levelLabel: "SDE2",
      companyLevel: "L2",
      location,
      locationLabel: location,
      totalCompEur: amount,
      baseEur: Math.round(amount * 0.75),
      bonusEur: null,
      equityEur: null,
      extrasEur: null,
      confidence,
      confidenceNote: "",
      sourceIds: [`${slug}-source`],
      notes: "",
    }],
  };
}

test("computes a scoped empirical percentile only with at least three companies", () => {
  const companies = [company("a", 80_000), company("b", 90_000), company("c", 100_000)];
  const result = analyzeSalaryNegotiation({
    company: companies[1],
    point: companies[1].salaryPoints[0],
    companies,
    postedRange: null,
  });

  assert.equal(result.marketPercentile, 50);
  assert.equal(result.comparableCompanyCount, 3);
  assert.equal(result.sampleQuality, "directional");
});

test("never mixes Madrid and Spain-wide peers", () => {
  const target = company("target", 90_000, "Madrid");
  const companies = [target, company("madrid-peer", 80_000, "Madrid"), company("spain-a", 70_000), company("spain-b", 95_000)];
  const result = analyzeSalaryNegotiation({
    company: target,
    point: target.salaryPoints[0],
    companies,
    postedRange: null,
  });

  assert.equal(result.marketPercentile, null);
  assert.equal(result.comparableCompanyCount, 2);
  assert.match(result.percentileLockedReason, /at least 3 exact-scope companies/i);
});

test("unlocks a suggested ask only from a complete employer annual range", () => {
  const companies = [company("a", 80_000), company("b", 90_000), company("c", 100_000)];
  const result = analyzeSalaryNegotiation({
    company: companies[1],
    point: companies[1].salaryPoints[0],
    companies,
    postedRange: {
      companySlug: "b",
      level: "mid",
      locationLabel: "Spain-wide",
      period: "year",
      rangeKind: "range",
      minimumAmount: 60_000,
      maximumAmount: 80_000,
      checkedAt: Date.UTC(2026, 7, 27),
    },
  });

  assert.equal(result.negotiationStatus, "ready");
  assert.equal(result.suggestedBaseMinimumEur, 70_000);
  assert.equal(result.suggestedBaseMaximumEur, 80_000);
});

test("uses matching reported base evidence when it raises the lower ask", () => {
  const companies = [company("a", 80_000), company("b", 100_000), company("c", 110_000)];
  companies[1].salaryPoints[0].baseEur = 82_000;
  const result = analyzeSalaryNegotiation({
    company: companies[1],
    point: companies[1].salaryPoints[0],
    companies,
    postedRange: {
      companySlug: "b",
      level: "mid",
      locationLabel: "Spain-wide",
      period: "year",
      rangeKind: "range",
      minimumAmount: 70_000,
      maximumAmount: 90_000,
      checkedAt: Date.UTC(2026, 7, 27),
    },
  });

  assert.equal(result.suggestedBaseMinimumEur, 82_000);
  assert.equal(result.suggestedBaseMaximumEur, 90_000);
});

test("locks missing, partial, and conflicting employer evidence", () => {
  const companies = [company("a", 80_000), company("b", 90_000), company("c", 100_000)];
  const point = companies[1].salaryPoints[0];
  const missing = analyzeSalaryNegotiation({ company: companies[1], point, companies, postedRange: null });
  const partial = analyzeSalaryNegotiation({
    company: companies[1],
    point,
    companies,
    postedRange: {
      companySlug: "b",
      level: "mid",
      locationLabel: "Spain-wide",
      period: "year",
      rangeKind: "minimum",
      minimumAmount: 60_000,
      maximumAmount: 60_000,
      checkedAt: Date.UTC(2026, 7, 27),
    },
  });
  point.baseEur = 120_000;
  const conflict = analyzeSalaryNegotiation({
    company: companies[1],
    point,
    companies,
    postedRange: {
      companySlug: "b",
      level: "mid",
      locationLabel: "Spain-wide",
      period: "year",
      rangeKind: "range",
      minimumAmount: 60_000,
      maximumAmount: 80_000,
      checkedAt: Date.UTC(2026, 7, 27),
    },
  });

  assert.equal(missing.negotiationStatus, "locked");
  assert.equal(partial.negotiationStatus, "locked");
  assert.match(conflict.negotiationLockedReason, /conflicts materially/i);
});

test("locks an employer range from a different company or location scope", () => {
  const companies = [company("a", 80_000), company("b", 90_000), company("c", 100_000)];
  const result = analyzeSalaryNegotiation({
    company: companies[1],
    point: companies[1].salaryPoints[0],
    companies,
    postedRange: {
      companySlug: "a",
      level: "mid",
      locationLabel: "Madrid",
      period: "year",
      rangeKind: "range",
      minimumAmount: 60_000,
      maximumAmount: 80_000,
      checkedAt: Date.UTC(2026, 7, 27),
    },
  });

  assert.equal(result.negotiationStatus, "locked");
  assert.match(result.negotiationLockedReason, /does not match this exact company/i);
});

test("keeps sample size unknown unless the publisher explicitly disclosed it", () => {
  const companies = [company("a", 80_000), company("b", 90_000), company("c", 100_000)];
  const result = analyzeSalaryNegotiation({
    company: companies[0],
    point: companies[0].salaryPoints[0],
    companies,
    postedRange: null,
  });

  assert.equal(result.publisherSampleSize, null);
  assert.match(result.sampleQualityLabel, /not disclosed/i);
});
