import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_VIEW_PREFERENCES,
  MAX_COMPARED_COMPANIES,
  normalizeCompareSlugs,
  normalizeRoute,
  parseViewPreferences,
  serializeViewPreferences,
} from "./view-preferences.ts";

test("returns defaults for missing or malformed storage", () => {
  assert.deepEqual(parseViewPreferences(null), DEFAULT_VIEW_PREFERENCES);
  assert.deepEqual(parseViewPreferences("{"), DEFAULT_VIEW_PREFERENCES);
  assert.deepEqual(parseViewPreferences("[]"), DEFAULT_VIEW_PREFERENCES);
  assert.deepEqual(parseViewPreferences("null"), DEFAULT_VIEW_PREFERENCES);
});

test("round-trips every preference", () => {
  const preferences = {
    scope: "shortlist",
    sortBy: "net",
    hideUnknown: true,
    planView: "gaps",
    compareSlugs: ["elastic", "google"],
    lastRoute: "/companies/elastic",
  };
  assert.deepEqual(
    parseViewPreferences(serializeViewPreferences(preferences)),
    preferences,
  );
});

test("one bad field never resets the others", () => {
  const parsed = parseViewPreferences(
    JSON.stringify({
      scope: "everything",
      sortBy: "net",
      hideUnknown: "yes",
      planView: "mid",
      lastRoute: "/charts",
    }),
  );
  assert.equal(parsed.scope, DEFAULT_VIEW_PREFERENCES.scope, "invalid scope falls back");
  assert.equal(parsed.hideUnknown, DEFAULT_VIEW_PREFERENCES.hideUnknown);
  // The valid neighbours survive.
  assert.equal(parsed.sortBy, "net");
  assert.equal(parsed.planView, "mid");
  assert.equal(parsed.lastRoute, "/charts");
});

test("only same-origin app paths are restorable", () => {
  assert.equal(normalizeRoute("/salary"), "/salary");
  assert.equal(normalizeRoute("/companies/google"), "/companies/google");

  // A stored route is replayed into the router, so anything that could leave
  // the app must fall back rather than be sanitised into something navigable.
  for (const hostile of [
    "https://evil.example/x",
    "//evil.example/x",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "salary",
    "",
    42,
    null,
    undefined,
    { toString: () => "/salary" },
  ]) {
    assert.equal(
      normalizeRoute(hostile),
      DEFAULT_VIEW_PREFERENCES.lastRoute,
      `${String(hostile)} must not be restorable`,
    );
  }
});

test("a hostile stored route does not leak through parsing", () => {
  const parsed = parseViewPreferences(
    JSON.stringify({ lastRoute: "https://evil.example/steal" }),
  );
  assert.equal(parsed.lastRoute, "/");
});

test("the comparison selection only accepts real slugs, deduped and capped", () => {
  assert.deepEqual(normalizeCompareSlugs(["google", "elastic"]), ["google", "elastic"]);
  // Order of first appearance is kept; repeats collapse.
  assert.deepEqual(normalizeCompareSlugs(["google", "google", "elastic"]), ["google", "elastic"]);
  // Never more than the matrix can render.
  assert.equal(
    normalizeCompareSlugs(["a", "b", "c", "d", "e", "f"]).length,
    MAX_COMPARED_COMPANIES,
  );
  // Storage is not trusted: anything that is not slug-shaped is dropped.
  assert.deepEqual(
    normalizeCompareSlugs(["google", "../../etc/passwd", "<script>", "UPPER", "", 7, null]),
    ["google"],
  );
  assert.deepEqual(normalizeCompareSlugs("google"), []);
  assert.deepEqual(normalizeCompareSlugs(undefined), []);
});

test("a chosen comparison survives storage", () => {
  const stored = serializeViewPreferences({
    ...DEFAULT_VIEW_PREFERENCES,
    compareSlugs: ["elastic", "google"],
  });
  assert.deepEqual(parseViewPreferences(stored).compareSlugs, ["elastic", "google"]);
});
