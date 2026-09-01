import assert from "node:assert/strict";
import test from "node:test";

import {
  euroOrDash,
  formatDayFromTimestamp,
  formatIsoDay,
  ordinal,
  placeAmong,
  plural,
  ratio,
  signedEuro,
  signedNumber,
  signedPercent,
} from "./format.ts";

test("a signed value never gets a hardcoded plus in front of a minus", () => {
  assert.equal(signedPercent(8), "+8%");
  assert.equal(signedPercent(-8), "-8%");
  assert.equal(signedPercent(0), "0%");
  assert.ok(!signedPercent(-8).includes("+-"));
  assert.ok(!signedEuro(-3_400).includes("+-"));
});

test("a percentage-point gap carries one unit, not two", () => {
  // "+21% pp" was a real regression: signedPercent already appends "%", so a
  // caller adding " pp" stacked two units onto one number.
  assert.equal(signedNumber(21, " pp"), "+21 pp");
  assert.equal(signedNumber(-21, " pp"), "-21 pp");
  assert.equal(signedNumber(21), "+21");
  assert.equal(signedNumber(null, " pp"), "—");
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

test("the minus goes in front of the euro sign, not inside the amount", () => {
  // "€-340" scans as a typo; "-€340" scans as a negative number.
  assert.equal(euroOrDash(-340), "-€340");
  assert.equal(euroOrDash(-3_400), "-€3.4k");
  assert.equal(signedEuro(-3_400), "-€3.4k");
  assert.equal(euroOrDash(340), "€340");
  assert.equal(signedEuro(3_400), "+€3.4k");
});

test("ordinals handle the teens, which is where they usually break", () => {
  assert.equal(ordinal(1), "1st");
  assert.equal(ordinal(2), "2nd");
  assert.equal(ordinal(3), "3rd");
  assert.equal(ordinal(4), "4th");
  // 11th, not 11st.
  assert.equal(ordinal(11), "11th");
  assert.equal(ordinal(12), "12th");
  assert.equal(ordinal(13), "13th");
  assert.equal(ordinal(21), "21st");
  assert.equal(ordinal(22), "22nd");
  assert.equal(ordinal(23), "23rd");
  assert.equal(ordinal(111), "111th");
  assert.equal(ordinal(0), "—");
  assert.equal(ordinal(Number.NaN), "—");
});

test("a place is only counted among values that exist", () => {
  // A blank is never ranked last; it is not ranked.
  assert.equal(placeAmong(null, [5, 4, 3]), null);
  // A field of one is not a ranking.
  assert.equal(placeAmong(5, [5, null, null]), null);
  assert.deepEqual(placeAmong(5, [5, 4, null]), { position: 1, of: 2 });
  assert.deepEqual(placeAmong(3, [5, 4, 3]), { position: 3, of: 3 });
  // Ties share a position rather than being broken arbitrarily.
  assert.deepEqual(placeAmong(4, [5, 4, 4]), { position: 2, of: 3 });
  assert.equal(placeAmong(Number.NaN, [5, 4]), null);
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
