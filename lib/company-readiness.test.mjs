import assert from "node:assert/strict";
import test from "node:test";

import { companyReadiness } from "./company-readiness.ts";

const input = (overrides = {}) => ({
  slug: "amazon",
  name: "Amazon",
  researchStatus: "monitoring",
  salaryLevels: ["intern", "junior", "mid", "senior"],
  locationAvailability: ["Madrid"],
  selectedLocation: "Madrid",
  targetLevel: "mid",
  ...overrides,
});

const dimension = (readiness, key) =>
  readiness.dimensions.find((entry) => entry.key === key);

test("a fully evidenced company is ready on every dimension", () => {
  const readiness = companyReadiness(input());
  assert.equal(readiness.state, "ready");
  assert.equal(readiness.comparable, true);
  assert.equal(readiness.dimensions.length, 4);
  assert.ok(readiness.dimensions.every((entry) => entry.state === "ready"));
  assert.match(readiness.headline, /Ready to compare/);
});

test("an unsupported employer is blocked and repeats the audit reason", () => {
  const readiness = companyReadiness(
    input({ slug: "meta", name: "Meta", researchStatus: "unsupported", salaryLevels: [] }),
  );
  assert.equal(readiness.state, "blocked");
  assert.equal(readiness.comparable, false);
  assert.match(dimension(readiness, "identity").detail, /automated-access terms/);
});

test("a queued company is partial rather than blocked", () => {
  const readiness = companyReadiness(input({ researchStatus: "queued" }));
  assert.equal(dimension(readiness, "identity").state, "partial");
  assert.match(dimension(readiness, "identity").detail, /Queued for automatic/);
});

test("salary evidence at the wrong level is reported as a gap, not as absence", () => {
  const readiness = companyReadiness(input({ salaryLevels: ["junior"], targetLevel: "mid" }));
  const salary = dimension(readiness, "salaryEvidence");
  assert.equal(salary.state, "partial");
  assert.match(salary.detail, /not at the mid level/);
  assert.equal(readiness.comparable, false);
});

test("a company with no salary figures at all is blocked on evidence", () => {
  const readiness = companyReadiness(input({ slug: "netflix", name: "Netflix", salaryLevels: [] }));
  assert.equal(dimension(readiness, "salaryEvidence").state, "blocked");
  assert.equal(readiness.state, "blocked");
});

test("an unattributable next level limits progression without blocking pay comparison", () => {
  const readiness = companyReadiness(
    input({
      slug: "microsoft",
      name: "Microsoft",
      salaryLevels: ["junior", "mid", "senior"],
      locationAvailability: ["Spain-wide"],
      selectedLocation: "Madrid",
    }),
  );
  const level = dimension(readiness, "levelMapping");
  assert.equal(level.state, "partial");
  assert.match(level.detail, /not attributable/);
  assert.equal(readiness.state, "partial");
  assert.equal(readiness.comparable, true, "pay is still comparable without a promotion figure");
});

test("an unaudited ladder blocks the level dimension but still allows pay comparison", () => {
  const readiness = companyReadiness(
    input({ slug: "stripe", name: "Stripe", locationAvailability: ["Madrid"] }),
  );
  const level = dimension(readiness, "levelMapping");
  assert.equal(level.state, "blocked");
  assert.match(level.detail, /has not been audited/);
  assert.equal(readiness.comparable, true);
});

test("a location the company does not report blocks the comparison", () => {
  const readiness = companyReadiness(
    input({ locationAvailability: ["Madrid"], selectedLocation: "Valencia" }),
  );
  const city = dimension(readiness, "cityApplicability");
  assert.equal(city.state, "blocked");
  assert.match(city.detail, /No evidence for Valencia/);
  assert.equal(readiness.comparable, false);
});

test("migrates a legacy all-locations scope to Madrid", () => {
  const readiness = companyReadiness(input({ selectedLocation: "Madrid" }));
  assert.equal(dimension(readiness, "cityApplicability").state, "ready");
  assert.equal(readiness.comparable, true);
});

test("the headline names the blocking dimensions rather than a generic failure", () => {
  const readiness = companyReadiness(
    input({ slug: "uber", name: "Uber", researchStatus: "unsupported", salaryLevels: [] }),
  );
  assert.match(readiness.headline, /Blocked on/);
  assert.match(readiness.headline, /employer identity/);
  assert.match(readiness.headline, /salary evidence/);
});

test("a company with only partial dimensions says it is usable with limits", () => {
  const readiness = companyReadiness(input({ researchStatus: "discovering" }));
  assert.equal(readiness.state, "partial");
  assert.match(readiness.headline, /Usable with limits/);
});
