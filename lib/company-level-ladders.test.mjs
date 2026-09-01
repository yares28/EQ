import assert from "node:assert/strict";
import test from "node:test";

import {
  COMPANY_LEVEL_LADDERS,
  companyLadder,
  isProgressionDecisionGrade,
  ladderJumpLockReason,
  resolveLadderStep,
} from "./company-level-ladders.ts";
import { salaryCompanies } from "./salary-data.ts";

const NORMALIZED_LEVELS = ["intern", "junior", "mid", "senior"];

test("every audited step carries attributable, dated evidence", () => {
  assert.ok(COMPANY_LEVEL_LADDERS.length > 0);
  for (const ladder of COMPANY_LEVEL_LADDERS) {
    assert.match(ladder.auditedOn, /^\d{4}-\d{2}-\d{2}$/, ladder.companySlug);
    assert.ok(ladder.steps.length > 0, ladder.companySlug);
    for (const step of ladder.steps) {
      const where = `${ladder.companySlug}:${step.companyLevel}`;
      assert.ok(NORMALIZED_LEVELS.includes(step.normalizedLevel), where);
      assert.ok(["sourced", "ambiguous"].includes(step.status), where);
      assert.ok(["high", "medium"].includes(step.confidence), where);
      assert.match(step.effectiveDate, /^\d{4}-\d{2}-\d{2}$/, where);
      assert.ok(step.basis.length > 0, `${where} must record why the mapping holds`);
      assert.ok(step.sourceId.length > 0, where);
    }
  }
});

test("ladder levels and source ids resolve against the real salary dataset", () => {
  for (const ladder of COMPANY_LEVEL_LADDERS) {
    const company = salaryCompanies.find((entry) => entry.slug === ladder.companySlug);
    assert.ok(company, `${ladder.companySlug} must exist in the salary dataset`);
    const sourceIds = new Set(company.sources.map((source) => source.id));
    const companyLevels = new Set(company.salaryPoints.map((point) => point.companyLevel));
    for (const step of ladder.steps) {
      const where = `${ladder.companySlug}:${step.companyLevel}`;
      assert.ok(sourceIds.has(step.sourceId), `${where} cites an unknown source ${step.sourceId}`);
      assert.ok(companyLevels.has(step.companyLevel), `${where} is not a level in the dataset`);
      if (step.nextCompanyLevel !== null) {
        assert.ok(
          companyLevels.has(step.nextCompanyLevel),
          `${where} points at an unknown successor ${step.nextCompanyLevel}`,
        );
      }
    }
  }
});

test("a normalized band maps to at most one level per company", () => {
  for (const ladder of COMPANY_LEVEL_LADDERS) {
    const bands = ladder.steps.map((step) => step.normalizedLevel);
    assert.equal(new Set(bands).size, bands.length, `${ladder.companySlug} maps a band twice`);
  }
});

test("a named successor always moves up exactly one normalized band", () => {
  for (const ladder of COMPANY_LEVEL_LADDERS) {
    for (const step of ladder.steps) {
      if (step.nextNormalizedLevel === null) continue;
      const from = NORMALIZED_LEVELS.indexOf(step.normalizedLevel);
      const to = NORMALIZED_LEVELS.indexOf(step.nextNormalizedLevel);
      assert.equal(
        to - from,
        1,
        `${ladder.companySlug}:${step.companyLevel} must not skip or reverse a band`,
      );
    }
  }
});

test("a successor level is never named without sourced status", () => {
  for (const ladder of COMPANY_LEVEL_LADDERS) {
    for (const step of ladder.steps) {
      if (step.status !== "sourced") {
        assert.equal(
          step.nextCompanyLevel,
          null,
          `${ladder.companySlug}:${step.companyLevel} must not name a target it cannot attribute`,
        );
      }
    }
  }
});

test("Amazon resolves an explicitly named senior successor", () => {
  const resolved = resolveLadderStep("amazon", "mid");
  assert.equal(resolved.status, "sourced");
  assert.equal(resolved.companyLevel, "L5 / SDE II");
  assert.equal(resolved.nextCompanyLevel, "L6 / SDE III");
  assert.equal(resolved.nextNormalizedLevel, "senior");
  assert.equal(isProgressionDecisionGrade(resolved), true);
});

test("Microsoft's next reported pay row is not treated as a promotion", () => {
  const resolved = resolveLadderStep("microsoft", "mid");
  assert.equal(resolved.status, "ambiguous");
  assert.equal(resolved.companyLevel, "61");
  assert.equal(resolved.nextCompanyLevel, null);
  assert.equal(resolved.nextNormalizedLevel, null);
  assert.equal(isProgressionDecisionGrade(resolved), false);
  assert.match(resolved.basis, /Senior SDE at level 63/);
  assert.equal(ladderJumpLockReason(resolved), "Next level not attributable");
});

test("companies with no audited ladder resolve as unmapped rather than guessing", () => {
  for (const slug of ["netflix", "openai", "stripe", "uber", "meta", "airbnb"]) {
    const resolved = resolveLadderStep(slug, "mid");
    assert.equal(resolved.status, "unmapped", slug);
    assert.equal(resolved.nextNormalizedLevel, null, slug);
    assert.equal(isProgressionDecisionGrade(resolved), false, slug);
    assert.equal(ladderJumpLockReason(resolved), "No comparable next level", slug);
  }
  assert.equal(companyLadder("netflix"), null);
});

test("a top-of-ladder level offers no successor", () => {
  for (const slug of ["amazon", "google", "apple"]) {
    const resolved = resolveLadderStep(slug, "senior");
    assert.equal(resolved.nextCompanyLevel, null, slug);
    assert.equal(isProgressionDecisionGrade(resolved), false, slug);
  }
});

test("a band the company does not staff resolves as unmapped", () => {
  const resolved = resolveLadderStep("google", "intern");
  assert.equal(resolved.status, "unmapped");
  assert.match(resolved.basis, /no audited level at this band/i);
});

test("two ladders are never equated by a shared 'senior' word alone", () => {
  const microsoft = resolveLadderStep("microsoft", "senior");
  const amazon = resolveLadderStep("amazon", "senior");
  assert.equal(amazon.status, "sourced");
  assert.equal(microsoft.status, "ambiguous");
  assert.notEqual(microsoft.status, amazon.status);
});
