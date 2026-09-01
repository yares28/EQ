import assert from "node:assert/strict";
import test from "node:test";

import {
  estimateCashAfterCityReferenceCosts,
  estimateCashAfterPersonalCosts,
  personalMonthlyCostEur,
  personalCostForLocation,
} from "./city-reference-costs.ts";

test("estimateCashAfterCityReferenceCosts returns null (never throws) for invalid net cash", () => {
  assert.equal(estimateCashAfterCityReferenceCosts(0, 1_000, 500), null);
  assert.equal(estimateCashAfterCityReferenceCosts(-100, 1_000, 500), null);
  assert.equal(estimateCashAfterCityReferenceCosts(Number.NaN, 1_000, 500), null);
  assert.equal(estimateCashAfterCityReferenceCosts(2_000, -1, 500), null);
});

test("estimateCashAfterCityReferenceCosts shows the real shortfall, not zero", () => {
  const result = estimateCashAfterCityReferenceCosts(1_000, 900, 300);
  assert.ok(result !== null);
  assert.equal(result.monthlyReferenceCostEur, 1_200);
  assert.equal(result.monthlyCashAfterReferenceCostsEur, -200);
});

test("estimateCashAfterCityReferenceCosts computes a normal surplus", () => {
  const result = estimateCashAfterCityReferenceCosts(2_500, 900, 300);
  assert.ok(result !== null);
  assert.equal(result.monthlyCashAfterReferenceCostsEur, 1_300);
  assert.equal(result.referenceCostSharePercent, 48);
});

test("estimateCashAfterPersonalCosts shows the real shortfall, not zero", () => {
  const cost = {
    location: "Madrid",
    rentEur: 900,
    groceriesEur: 250,
    transportEur: 60,
    utilitiesEur: 80,
    otherEur: 50,
  };
  assert.equal(personalMonthlyCostEur(cost), 1_340);
  assert.equal(estimateCashAfterPersonalCosts(1_000, cost), -340);
});

test("estimateCashAfterPersonalCosts returns null for invalid net cash", () => {
  const cost = {
    location: "Madrid",
    rentEur: 900,
    groceriesEur: 250,
    transportEur: 60,
    utilitiesEur: 80,
    otherEur: 50,
  };
  assert.equal(estimateCashAfterPersonalCosts(0, cost), null);
  assert.equal(estimateCashAfterPersonalCosts(Number.NaN, cost), null);
});

test("personalCostForLocation is an exact-match lookup", () => {
  const costs = [
    { location: "Madrid", rentEur: 900, groceriesEur: 250, transportEur: 60, utilitiesEur: 80, otherEur: 50 },
  ];
  assert.ok(personalCostForLocation(costs, "Madrid") !== null);
  assert.equal(personalCostForLocation(costs, "Valencia"), null);
  assert.equal(personalCostForLocation(undefined, "Madrid"), null);
});
