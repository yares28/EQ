import assert from "node:assert/strict";
import test from "node:test";

import {
  CRON_CONTRACTS,
  RETENTION_RULES,
  UNSCHEDULED_SOURCES,
  retentionRule,
  summarizeSourceHealth,
  verifyCronContracts,
} from "./source-operations.ts";
import { researchSourceRegistry } from "./source-registry.ts";

const NOW = Date.UTC(2026, 7, 29, 12);
const HOUR_MS = 60 * 60_000;

const source = (overrides = {}) => ({
  key: "ine-open-data",
  name: "INE Open Data",
  category: "salary_market",
  enabled: true,
  health: "healthy",
  consecutiveFailures: 0,
  lastAttemptedAt: NOW - HOUR_MS,
  lastSuccessfulAt: NOW - HOUR_MS,
  maxStalenessMs: 24 * HOUR_MS,
  ...overrides,
});

test("every registered source is either scheduled or recorded as deliberately unscheduled", () => {
  assert.deepEqual(verifyCronContracts(), []);
});

test("the cron contracts cover the registry exactly once", () => {
  const scheduled = CRON_CONTRACTS.flatMap((contract) => contract.sourceKeys);
  assert.equal(new Set(scheduled).size, scheduled.length, "a source is scheduled twice");
  const exempt = UNSCHEDULED_SOURCES.map((entry) => entry.key);
  assert.equal(
    new Set([...scheduled, ...exempt]).size,
    researchSourceRegistry.length,
    "the contracts and exemptions do not add up to the registry",
  );
  for (const entry of UNSCHEDULED_SOURCES) {
    assert.ok(entry.reason.length > 0, entry.key);
  }
});

test("no cron runs slower than the cadence its sources declare", () => {
  for (const contract of CRON_CONTRACTS) {
    for (const key of contract.sourceKeys) {
      const registered = researchSourceRegistry.find((entry) => entry.key === key);
      assert.ok(registered, key);
      assert.ok(
        contract.intervalHours <= registered.refreshCadenceHours,
        `${key} would be stale by construction under "${contract.cronName}"`,
      );
    }
  }
});

test("a source added without a schedule is reported rather than silently unrefreshed", () => {
  const violations = verifyCronContracts.call(null);
  assert.deepEqual(violations, []);
  const orphanKeys = researchSourceRegistry
    .map((entry) => entry.key)
    .filter(
      (key) =>
        !CRON_CONTRACTS.some((contract) => contract.sourceKeys.includes(key)) &&
        !UNSCHEDULED_SOURCES.some((entry) => entry.key === key),
    );
  assert.deepEqual(orphanKeys, []);
});

test("retention rules keep enough history to reproduce a published figure", () => {
  assert.ok(RETENTION_RULES.length > 0);
  for (const rule of RETENTION_RULES) {
    assert.ok(rule.keepDays >= 90, `${rule.table} retains too little history`);
    assert.ok(rule.minimumKeptPerParent >= 1, `${rule.table} could orphan a live observation`);
    assert.ok(rule.rationale.length > 0, rule.table);
  }
  assert.equal(retentionRule("rawSnapshots")?.keepDays, 180);
  assert.equal(retentionRule("unknownTable"), null);
});

test("a fully refreshed fleet is release ready", () => {
  const summary = summarizeSourceHealth([source(), source({ key: "ecb-fx" })], NOW);
  assert.equal(summary.total, 2);
  assert.equal(summary.current, 2);
  assert.equal(summary.releaseReady, true);
  assert.deepEqual(summary.blockingKeys, []);
  assert.match(summary.headline, /All 2 sources refreshed within their windows/);
});

test("a source past its staleness window blocks a release and is named", () => {
  const summary = summarizeSourceHealth(
    [source(), source({ key: "crtm-fares-2026", lastSuccessfulAt: NOW - 200 * HOUR_MS })],
    NOW,
  );
  assert.equal(summary.stale, 1);
  assert.equal(summary.releaseReady, false);
  assert.deepEqual(summary.blockingKeys, ["crtm-fares-2026"]);
  assert.match(summary.headline, /crtm-fares-2026/);
  assert.equal(summary.rows[0].key, "crtm-fares-2026", "blocking sources sort first");
});

test("an unhealthy source blocks a release even after a recent success", () => {
  const summary = summarizeSourceHealth(
    [source({ health: "degraded", consecutiveFailures: 3 })],
    NOW,
  );
  assert.equal(summary.releaseReady, false);
  assert.match(summary.rows[0].note, /degraded/);
});

test("deliberately unscheduled sources do not block a release before first use", () => {
  const summary = summarizeSourceHealth(
    [source({ key: "gleif-entity-api", lastSuccessfulAt: null, lastAttemptedAt: null })],
    NOW,
  );
  assert.equal(summary.neverSucceeded, 1);
  assert.equal(summary.releaseReady, true);
  assert.match(summary.rows[0].note, /on demand/i);
});

test("a scheduled source that has not run yet does not block a release", () => {
  const summary = summarizeSourceHealth(
    [source({ key: "lever-postings", lastSuccessfulAt: null, lastAttemptedAt: null })],
    NOW,
  );
  assert.equal(summary.releaseReady, true);
});

test("a source that never succeeded is distinguished from one that went stale", () => {
  const summary = summarizeSourceHealth(
    [
      source({ key: "never-attempted", lastSuccessfulAt: null, lastAttemptedAt: null }),
      source({ key: "always-failed", lastSuccessfulAt: null, lastAttemptedAt: NOW - HOUR_MS, consecutiveFailures: 7 }),
    ],
    NOW,
  );
  assert.equal(summary.neverSucceeded, 2);
  assert.equal(summary.stale, 0);
  assert.equal(summary.releaseReady, false);
  const alwaysFailed = summary.rows.find((row) => row.key === "always-failed");
  assert.match(alwaysFailed.note, /7 consecutive failures/);
  const neverAttempted = summary.rows.find((row) => row.key === "never-attempted");
  assert.equal(neverAttempted.note, "Never attempted.");
});

test("a source approaching its window is flagged without blocking a release", () => {
  const summary = summarizeSourceHealth(
    [source({ lastSuccessfulAt: NOW - 20 * HOUR_MS })],
    NOW,
  );
  assert.equal(summary.aging, 1);
  assert.equal(summary.releaseReady, true);
  assert.match(summary.headline, /approaching the staleness limit/);
});

test("a disabled source neither counts as healthy nor blocks a release", () => {
  const summary = summarizeSourceHealth([source({ enabled: false })], NOW);
  assert.equal(summary.disabled, 1);
  assert.equal(summary.current, 0);
  assert.equal(summary.releaseReady, true);
});

test("an empty fleet is not reported as healthy by accident", () => {
  const summary = summarizeSourceHealth([], NOW);
  assert.equal(summary.total, 0);
  assert.deepEqual(summary.rows, []);
});
