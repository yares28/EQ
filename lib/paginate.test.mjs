import assert from "node:assert/strict";
import test from "node:test";

import { paginate } from "./paginate.ts";

const items = Array.from({ length: 7 }, (_, index) => index + 1);

test("pages an array and numbers the window", () => {
  const first = paginate(items, 1, 3);
  assert.deepEqual(first.items, [1, 2, 3]);
  assert.equal(first.pageCount, 3);
  assert.deepEqual([first.from, first.to, first.total], [1, 3, 7]);
  assert.equal(first.hasPrevious, false);
  assert.equal(first.hasNext, true);
});

test("the last page is short and knows it is last", () => {
  const last = paginate(items, 3, 3);
  assert.deepEqual(last.items, [7]);
  assert.deepEqual([last.from, last.to], [7, 7]);
  assert.equal(last.hasNext, false);
  assert.equal(last.hasPrevious, true);
});

test("a page past the end clamps to the last page rather than rendering nothing", () => {
  const clamped = paginate(items, 99, 3);
  assert.equal(clamped.page, 3);
  assert.deepEqual(clamped.items, [7]);
});

test("a page below the first clamps up", () => {
  assert.equal(paginate(items, 0, 3).page, 1);
  assert.equal(paginate(items, -4, 3).page, 1);
});

test("an empty list numbers nothing rather than reading 1-0 of 0", () => {
  const empty = paginate([], 1, 25);
  assert.deepEqual(empty.items, []);
  assert.deepEqual([empty.from, empty.to, empty.total], [0, 0, 0]);
  assert.equal(empty.pageCount, 1);
  assert.equal(empty.hasNext, false);
});

test("a list shorter than one page is a single page", () => {
  const single = paginate([1, 2], 1, 25);
  assert.equal(single.pageCount, 1);
  assert.deepEqual([single.from, single.to], [1, 2]);
});
