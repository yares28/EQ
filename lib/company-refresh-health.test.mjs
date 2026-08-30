import assert from "node:assert/strict";
import test from "node:test";

import {
  COMPANY_REFRESH_STALE_AFTER_MS,
  companyRefreshHealth,
  dailyRefreshCapacityPerCompany,
} from "./company-refresh-health.ts";

const NOW = Date.UTC(2026, 7, 30, 12, 0, 0);
const HOUR = 36e5;

test("a company refreshed within the day is current", () => {
  for (const hoursAgo of [0, 1, 6, 23]) {
    const health = companyRefreshHealth({
      lastCareerSyncAt: NOW - hoursAgo * HOUR,
      now: NOW,
    });
    assert.equal(health.state, "current", `${hoursAgo}h ago must be current`);
    assert.equal(health.hoursSinceSync, hoursAgo);
  }
});

test("a company that missed a full day is overdue", () => {
  const health = companyRefreshHealth({
    lastCareerSyncAt: NOW - 31 * HOUR,
    now: NOW,
  });
  assert.equal(health.state, "overdue");
  assert.equal(health.hoursSinceSync, 31);
  assert.match(health.label, /overdue/i);
});

test("the boundary is not overdue until it is passed", () => {
  assert.equal(
    companyRefreshHealth({
      lastCareerSyncAt: NOW - COMPANY_REFRESH_STALE_AFTER_MS,
      now: NOW,
    }).state,
    "current",
    "exactly 24h is still within the guarantee",
  );
  assert.equal(
    companyRefreshHealth({
      lastCareerSyncAt: NOW - COMPANY_REFRESH_STALE_AFTER_MS - 1,
      now: NOW,
    }).state,
    "overdue",
  );
});

test("a company that never synced is reported as such, not as fresh", () => {
  const health = companyRefreshHealth({ lastCareerSyncAt: undefined, now: NOW });
  assert.equal(health.state, "never");
  assert.equal(health.hoursSinceSync, null);
});

test("a clock skew into the future does not read as overdue", () => {
  const health = companyRefreshHealth({ lastCareerSyncAt: NOW + 5 * HOUR, now: NOW });
  assert.equal(health.state, "current");
  assert.equal(health.hoursSinceSync, 0);
});

test("sweep throughput covers the fleet at the intake cap", () => {
  // The shipped schedule: every 30 minutes, three companies per sweep.
  const perCompany = (monitoredCompanies) =>
    dailyRefreshCapacityPerCompany({
      monitoredCompanies,
      sweepIntervalMinutes: 30,
      companiesPerSweep: 3,
    });

  // 25 is the per-paste intake cap; even at four times that, every company
  // still gets at least one refresh a day.
  assert.ok(perCompany(25) >= 1, "25 companies must clear the daily guarantee");
  assert.ok(perCompany(100) >= 1, "100 companies must still clear it");
  // The previous single-company sweep could not have done this.
  assert.ok(
    dailyRefreshCapacityPerCompany({
      monitoredCompanies: 100,
      sweepIntervalMinutes: 30,
      companiesPerSweep: 1,
    }) < 1,
    "one per sweep falls below daily past ~48 companies",
  );
});
