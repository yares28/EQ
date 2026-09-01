import assert from "node:assert/strict";
import test from "node:test";

import {
  decisionGradeProgressionPercent,
  decisionProgressionFor,
  decisionProgressionLockReason,
  nextTargetLevel,
  payAmountFor,
  pointForLevel,
  postedProgressionFor,
  postedProgressionLockReason,
  progressionFor,
  progressionLockReason,
} from "./salary-analytics.ts";
import { salaryCompanies } from "./salary-data.ts";

const company = (slug) => {
  const found = salaryCompanies.find((entry) => entry.slug === slug);
  assert.ok(found, `${slug} must exist in the salary dataset`);
  return found;
};

test("a sourced ladder produces a jump labelled with the company's own next level", () => {
  const progression = progressionFor(company("amazon"), "mid", "Madrid");
  assert.ok(progression);
  assert.equal(progression.decisionGrade, true);
  assert.equal(progression.from.companyLevel, "L5 / SDE II");
  assert.equal(progression.to.companyLevel, "L6 / SDE III");
  assert.ok(progression.percent > 0);
  assert.equal(progression.deltaEur, progression.to.totalCompEur - progression.from.totalCompEur);
  assert.equal(decisionGradeProgressionPercent(progression), progression.percent);
});

test("an unattributable successor yields no jump and an explicit reason", () => {
  const microsoft = company("microsoft");
  assert.equal(progressionFor(microsoft, "mid", "Madrid"), null);
  assert.equal(progressionLockReason(microsoft, "mid"), "Next level not attributable");
});

test("Microsoft's junior step still progresses, because that mapping is sourced", () => {
  const progression = progressionFor(company("microsoft"), "junior", "Madrid");
  assert.ok(progression);
  assert.equal(progression.decisionGrade, true);
  assert.equal(progression.to.companyLevel, "61");
});

test("an unaudited company reports no comparable next level", () => {
  for (const slug of ["netflix", "stripe", "uber"]) {
    assert.equal(progressionFor(company(slug), "mid"), null, slug);
    assert.equal(progressionLockReason(company(slug), "mid"), "No comparable next level", slug);
  }
});

test("a missing next level at the top of a ladder produces no jump", () => {
  assert.equal(nextTargetLevel("mid", "microsoft"), null);
  assert.equal(nextTargetLevel("mid", "amazon"), "senior");
  assert.equal(nextTargetLevel("mid", "unaudited-company"), null);
});

test("the shared band order is still available when no company is named", () => {
  assert.equal(nextTargetLevel("intern"), "junior");
  assert.equal(nextTargetLevel("junior"), "mid");
  assert.equal(nextTargetLevel("mid"), "senior");
});

test("a jump never crosses location scopes", () => {
  const google = company("google");
  const madridToSpainWide = progressionFor(google, "junior", "Madrid");
  if (madridToSpainWide !== null) {
    assert.equal(madridToSpainWide.from.location, madridToSpainWide.to.location);
  }
  for (const entry of salaryCompanies) {
    for (const level of ["intern", "junior", "mid"]) {
      const progression = progressionFor(entry, level, "Madrid");
      if (progression === null) continue;
      assert.equal(
        progression.from.location,
        progression.to.location,
        `${entry.slug}:${level} compared across location scopes`,
      );
    }
  }
});

test("no jump in the dataset skips a normalized band", () => {
  const order = ["intern", "junior", "mid", "senior"];
  for (const entry of salaryCompanies) {
    for (const level of ["intern", "junior", "mid"]) {
      const progression = progressionFor(entry, level, "Madrid");
      if (progression === null) continue;
      assert.equal(
        order.indexOf(progression.to.level) - order.indexOf(progression.from.level),
        1,
        `${entry.slug}:${level} skipped a band`,
      );
    }
  }
});

test("an ambiguous progression contributes no value to a comparison", () => {
  assert.equal(decisionGradeProgressionPercent(null), null);
  assert.equal(decisionGradeProgressionPercent(undefined), null);
  assert.equal(
    decisionGradeProgressionPercent({ percent: 42, decisionGrade: false }),
    null,
  );
  assert.equal(decisionGradeProgressionPercent({ percent: 42, decisionGrade: true }), 42);
});

function postedCompany() {
  return {
    canonicalName: "NewCo",
    slug: "newco",
    companyType: "Other",
    locationAvailability: ["Madrid"],
    lastResearchedAt: "2026-08-29",
    sources: [],
    researchNotes: "",
    salaryPoints: [
      {
        id: "posted-junior",
        level: "junior",
        levelLabel: "SDE1",
        companyLevel: "Software Engineer I",
        location: "Madrid",
        locationLabel: "Madrid",
        totalCompEur: 60_000,
        baseEur: 60_000,
        bonusEur: null,
        equityEur: null,
        extrasEur: null,
        confidence: "High",
        confidenceNote: "",
        sourceIds: ["posted:a"],
        notes: "",
      },
      {
        id: "posted-mid",
        level: "mid",
        levelLabel: "SDE2",
        companyLevel: "Software Engineer II",
        location: "Madrid",
        locationLabel: "Madrid",
        totalCompEur: 78_000,
        baseEur: 78_000,
        bonusEur: null,
        equityEur: null,
        extrasEur: null,
        confidence: "High",
        confidenceNote: "",
        sourceIds: ["posted:b"],
        notes: "",
      },
    ],
  };
}

test("a jobs-page jump uses adjacent posted levels without a crowdsourced ladder", () => {
  const company = postedCompany();
  const progression = postedProgressionFor(company, "junior", "Madrid");
  assert.ok(progression);
  assert.equal(progression.decisionGrade, true);
  assert.equal(progression.from.companyLevel, "Software Engineer I");
  assert.equal(progression.to.companyLevel, "Software Engineer II");
  assert.equal(progression.percent, 30);
  assert.equal(pointForLevel(company, "junior", "Madrid")?.equityEur, null);
});

test("a jobs-page jump stays locked without a next-level posting", () => {
  const company = postedCompany();
  company.salaryPoints = company.salaryPoints.slice(0, 1);
  assert.equal(postedProgressionFor(company, "junior", "Madrid"), null);
  assert.match(
    postedProgressionLockReason(company, "junior", "Madrid"),
    /next level on a public career page/i,
  );
});

test("decision jump uses a sourced ladder when the jobs page has no adjacent posted ranges", () => {
  const progression = decisionProgressionFor(company("amazon"), "mid", "Madrid");
  assert.ok(progression);
  assert.equal(progression.from.companyLevel, "L5 / SDE II");
  assert.equal(progression.to.companyLevel, "L6 / SDE III");
});

test("decision jump does not mix a posted range with a crowdsourced next level", () => {
  const mixed = postedCompany();
  mixed.salaryPoints = [
    mixed.salaryPoints[0],
    {
      ...mixed.salaryPoints[1],
      id: "levels-mid",
      sourceIds: ["levels"],
    },
  ];
  assert.equal(decisionProgressionFor(mixed, "junior", "Madrid"), null);
  assert.match(
    decisionProgressionLockReason(mixed, "junior", "Madrid"),
    /next level on a public career page/i,
  );
});


test("a posted promotion is computed base to base", () => {
  // Posted points carry no total, so a base-blind implementation finds nothing.
  const company = {
    slug: "elastic",
    canonicalName: "Elastic",
    companyType: "Other",
    locationAvailability: ["Spain-wide"],
    lastResearchedAt: "2026-08-30",
    sources: [],
    researchNotes: "",
    salaryPoints: [
      {
        id: "posted:a", level: "junior", levelLabel: "SDE1", companyLevel: "SWE I",
        location: "Spain-wide", locationLabel: "Spain-wide",
        totalCompEur: null, baseEur: 50_000, baseMinEur: 45_000, baseMaxEur: 55_000,
        bonusEur: null, equityEur: null, extrasEur: null,
        confidence: "High", confidenceNote: "", sourceIds: ["posted:a"], notes: "",
      },
      {
        id: "posted:b", level: "mid", levelLabel: "SDE2", companyLevel: "SWE II",
        location: "Spain-wide", locationLabel: "Spain-wide",
        totalCompEur: null, baseEur: 60_000, baseMinEur: 55_000, baseMaxEur: 65_000,
        bonusEur: null, equityEur: null, extrasEur: null,
        confidence: "High", confidenceNote: "", sourceIds: ["posted:b"], notes: "",
      },
    ],
  };

  const progression = decisionProgressionFor(company, "junior", "Madrid");
  assert.notEqual(progression, null, "posted base evidence must still yield a jump");
  assert.equal(progression.deltaEur, 10_000);
  assert.equal(progression.percent, 20);
  assert.equal(progression.decisionGrade, true);
});

test("pointForLevel respects the requested basis", () => {
  const posted = {
    id: "posted:x", level: "mid", levelLabel: "SDE2", companyLevel: "SWE II",
    location: "Spain-wide", locationLabel: "Spain-wide",
    totalCompEur: null, baseEur: 60_000, bonusEur: null, equityEur: null, extrasEur: null,
    confidence: "High", confidenceNote: "", sourceIds: ["posted:x"], notes: "",
  };
  const company = {
    slug: "x", canonicalName: "X", companyType: "Other",
    locationAvailability: ["Spain-wide"], lastResearchedAt: "2026-08-30",
    sources: [], researchNotes: "", salaryPoints: [posted],
  };
  assert.equal(pointForLevel(company, "mid", "Madrid", "base")?.id, "posted:x");
  // Asking for total must not fall back to the base figure.
  assert.equal(pointForLevel(company, "mid", "Madrid", "total"), null);
  assert.equal(payAmountFor(posted, "base"), 60_000);
  assert.equal(payAmountFor(posted, "total"), null);
});
