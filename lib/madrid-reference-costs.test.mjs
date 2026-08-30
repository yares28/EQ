import assert from "node:assert/strict";
import test from "node:test";

import { estimateCashAfterCityReferenceCosts } from "./city-reference-costs.ts";

test("combines rent and essentials without changing the source values", () => {
  const result = estimateCashAfterCityReferenceCosts(4_300, 1_012, 312.56);
  assert.equal(result.monthlyReferenceCostEur, 1_324.56);
  assert.equal(result.monthlyCashAfterReferenceCostsEur, 2_975.44);
  assert.equal(result.referenceCostSharePercent, 30.8);
});

test("uses the same city-neutral calculation for the Valencia reference", () => {
  const result = estimateCashAfterCityReferenceCosts(4_300, 753, 292.78);
  assert.equal(result.monthlyReferenceCostEur, 1_045.78);
  assert.equal(result.monthlyCashAfterReferenceCostsEur, 3_254.22);
  assert.equal(result.referenceCostSharePercent, 24.32);
});

test("floors the reference remainder at zero", () => {
  const result = estimateCashAfterCityReferenceCosts(1_100, 1_012, 312.56);
  assert.equal(result.monthlyCashAfterReferenceCostsEur, 0);
  assert.equal(result.referenceCostSharePercent, 120.41);
});

test("rejects invalid or zero-net inputs", () => {
  assert.throws(
    () => estimateCashAfterCityReferenceCosts(0, 1_012, 312.56),
    RangeError,
  );
  assert.throws(
    () => estimateCashAfterCityReferenceCosts(3_000, -1, 312.56),
    RangeError,
  );
});
