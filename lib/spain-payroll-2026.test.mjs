import assert from "node:assert/strict";
import test from "node:test";

import {
  employeeSocialSecurity2026,
  estimateSpainPayroll2026,
} from "./spain-payroll-2026.ts";

const aeatGoldenCases = [
  { gross: 24_000, socialSecurity: 1_560, withholding: 3_242.4, rate: 13.51 },
  { gross: 35_200, socialSecurity: 2_288, withholding: 6_381.76, rate: 18.13 },
  { gross: 50_000, socialSecurity: 3_250, withholding: 11_200, rate: 22.4 },
  { gross: 61_214.4, socialSecurity: 3_978.94, withholding: 15_083.23, rate: 24.64 },
  { gross: 100_000, socialSecurity: 4_061.62, withholding: 32_110, rate: 32.11 },
];

test("matches official AEAT 2026 golden outputs", () => {
  for (const golden of aeatGoldenCases) {
    const estimate = estimateSpainPayroll2026(golden.gross);
    assert.equal(estimate.annualEmployeeSocialSecurityEur, golden.socialSecurity);
    assert.equal(estimate.annualIrpfWithholdingEur, golden.withholding);
    assert.equal(estimate.irpfWithholdingRatePercent, golden.rate);
  }
});

test("applies the 2026 solidarity contribution only above the maximum base", () => {
  assert.equal(employeeSocialSecurity2026(61_214.4).annualSolidarityContributionEur, 0);
  assert.equal(employeeSocialSecurity2026(100_000).annualSolidarityContributionEur, 82.68);
});

test("preserves the annual cash identity after deductions", () => {
  const estimate = estimateSpainPayroll2026(50_000);
  assert.equal(
    estimate.annualNetCashEur,
    estimate.annualGrossCashEur -
      estimate.annualEmployeeSocialSecurityEur -
      estimate.annualIrpfWithholdingEur,
  );
  assert.equal(estimate.monthlyNetCashEur, 2_962.5);
});

test("rejects invalid gross cash inputs", () => {
  assert.throws(() => estimateSpainPayroll2026(0), RangeError);
  assert.throws(() => estimateSpainPayroll2026(Number.NaN), RangeError);
});

