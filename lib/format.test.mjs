import assert from "node:assert/strict";
import test from "node:test";

import {
  euroOrDash,
  formatDayFromTimestamp,
  formatIsoDay,
  plural,
  ratio,
  signedEuro,
  signedPercent,
} from "./format.ts";

test("a signed value never gets a hardcoded plus in front of a minus", () => {
  assert.equal(signedPercent(8), "+8%");
  assert.equal(signedPercent(-8), "-8%");
  assert.equal(signedPercent(0), "0%");
  assert.ok(!signedPercent(-8).includes("+-"));
  assert.ok(!signedEuro(-3_400).includes("+-"));
});

test("non-finite and missing values render as a dash, not as Infinity", () => {
  for (const bad of [null, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.equal(signedPercent(bad), "—");
    assert.equal(signedEuro(bad), "—");
    assert.equal(euroOrDash(bad), "—");
  }
});

test("a shortfall keeps its sign rather than being clamped away", () => {
  assert.ok(euroOrDash(-340).includes("-"));
  assert.ok(signedEuro(-3_400).includes("-"));
});

test("counts agree with their noun", () => {
  assert.equal(plural(1, "company", "companies"), "1 company");
  assert.equal(plural(0, "company", "companies"), "0 companies");
  assert.equal(plural(2, "company", "companies"), "2 companies");
});

test("an unparseable date renders a dash instead of throwing", () => {
  // new Date(NaN).toISOString() throws RangeError; this must not.
  assert.equal(formatDayFromTimestamp(Number.NaN), "—");
  assert.equal(formatDayFromTimestamp(null), "—");
  assert.equal(formatDayFromTimestamp(undefined), "—");
  assert.equal(formatIsoDay("not-a-date"), "—");
  assert.equal(formatIsoDay(undefined), "—");
  assert.equal(formatIsoDay("2026-08-30"), "30 Aug 2026");
});

test("division never leaks Infinity or NaN", () => {
  assert.equal(ratio(10, 0), null);
  assert.equal(ratio(10, null), null);
  assert.equal(ratio(null, 10), null);
  assert.equal(ratio(Number.NaN, 10), null);
  assert.equal(ratio(10, 4), 2.5);
});
