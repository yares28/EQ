import assert from "node:assert/strict";
import test from "node:test";

import {
  annualizedPostedAmountEur,
  buildCompanyResearchCatalog,
  careerProviderLabel,
  companyResearchPresentation,
  decisionLocationMatches,
  postedLocationMatches,
  salaryPointFromPostedRange,
  selectPostedRange,
  shouldAutomaticallyRetryCompanyResearch,
  COMPANY_UNSUPPORTED_RETRY_DELAY_MS,
  COMPANY_UNTRACKABLE_RETRY_DELAY_MS,
} from "./company-research-catalog.ts";

function baseCompany(slug = "known") {
  return {
    canonicalName: "Known",
    slug,
    companyType: "Other",
    locationAvailability: ["Spain-wide"],
    lastResearchedAt: "2026-08-27",
    sources: [],
    salaryPoints: [{ id: "known-junior", level: "junior", location: "Spain-wide", totalCompEur: 70_000 }],
    researchNotes: "Existing salary evidence",
  };
}

function tracked(slug = "newco", overrides = {}) {
  return {
    canonicalName: "NewCo",
    slug,
    researchStatus: "queued",
    researchRequestedAt: Date.UTC(2026, 7, 27),
    openRoleCount: 0,
    ...overrides,
  };
}

function range(overrides = {}) {
  return {
    company: "NewCo",
    companySlug: "newco",
    title: "Software Engineer",
    url: "https://example.com/job",
    level: "junior",
    location: "Madrid, Spain",
    locationLabel: "Madrid",
    currency: "EUR",
    period: "year",
    rangeKind: "range",
    minimumAmount: 55_000,
    maximumAmount: 70_000,
    confidenceScore: 95,
    checkedAt: Date.UTC(2026, 7, 27),
    source: "greenhouse",
    ...overrides,
  };
}

test("adds a newly pasted company without inventing salary evidence", () => {
  const catalog = buildCompanyResearchCatalog({
    baseCompanies: [baseCompany()],
    trackedCompanies: [tracked()],
    postedRanges: [],
  });

  assert.equal(catalog.length, 2);
  assert.equal(catalog[1].slug, "newco");
  assert.deepEqual(catalog[1].salaryPoints, []);
  assert.deepEqual(catalog[1].locationAvailability, ["Unknown"]);
  assert.match(catalog[1].researchNotes, /queued/i);
});

test("does not duplicate catalog companies and keeps crowdsourced points when the jobs page has no range", () => {
  const known = baseCompany();
  const catalog = buildCompanyResearchCatalog({
    baseCompanies: [known],
    trackedCompanies: [tracked("known", { canonicalName: "Known", researchStatus: "monitoring" })],
    postedRanges: [],
  });

  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].salaryPoints.length, 1);
  assert.equal(catalog[0].salaryPoints[0].id, "known-junior");
  assert.match(catalog[0].researchNotes, /sourced public salary pages/i);
});

test("a posted range replaces the same level and location and keeps other crowdsourced points", () => {
  const known = baseCompany();
  known.salaryPoints = [
    { id: "known-junior", level: "junior", location: "Madrid", totalCompEur: 70_000 },
    { id: "known-mid", level: "mid", location: "Madrid", totalCompEur: 90_000 },
  ];
  const catalog = buildCompanyResearchCatalog({
    baseCompanies: [known],
    trackedCompanies: [tracked("known", { canonicalName: "Known", researchStatus: "monitoring" })],
    postedRanges: [range({ companySlug: "known", company: "Known" })],
  });

  assert.equal(catalog[0].salaryPoints.length, 2);
  const junior = catalog[0].salaryPoints.find((point) => point.level === "junior");
  const mid = catalog[0].salaryPoints.find((point) => point.level === "mid");
  assert.equal(junior?.totalCompEur, null, "a posted base is not a total");
  assert.equal(junior?.baseEur, 62_500);
  assert.match(junior?.id ?? "", /^posted:/);
  assert.equal(mid?.id, "known-mid");
  assert.match(catalog[0].researchNotes, /come first/i);
});

test("treats a 0-1 parser confidence score as High when the posting is accepted", () => {
  const point = salaryPointFromPostedRange(range({ confidenceScore: 0.98 }));
  assert.equal(point?.confidence, "High");
});

test("turns a qualifying career-page range into posted-base evidence, not total compensation", () => {
  const catalog = buildCompanyResearchCatalog({
    baseCompanies: [],
    trackedCompanies: [tracked()],
    postedRanges: [range()],
  });

  assert.deepEqual(catalog[0].locationAvailability, ["Madrid"]);
  assert.equal(catalog[0].salaryPoints.length, 1);
  // The employer stated base only, so there is no total to compare against
  // sourced figures that include stock.
  assert.equal(catalog[0].salaryPoints[0].totalCompEur, null);
  assert.equal(catalog[0].salaryPoints[0].baseEur, 62_500);
  assert.equal(catalog[0].salaryPoints[0].baseMinEur, 55_000);
  assert.equal(catalog[0].salaryPoints[0].baseMaxEur, 70_000);
  assert.equal(catalog[0].salaryPoints[0].bonusEur, null);
  assert.equal(catalog[0].salaryPoints[0].equityEur, null);
  assert.equal(catalog[0].salaryPoints[0].companyLevel, "Software Engineer");
});

test("does not annualize an hourly posting into a ranked salary point", () => {
  const hourly = range({ period: "hour", minimumAmount: 35, maximumAmount: 45 });
  assert.equal(annualizedPostedAmountEur(hourly), null);
  assert.equal(salaryPointFromPostedRange(hourly), null);
});

test("selects the strongest exact-level and exact-location annual range", () => {
  const selected = selectPostedRange({
    ranges: [
      range({ period: "month", checkedAt: Date.UTC(2026, 7, 28) }),
      range({ rangeKind: "minimum", checkedAt: Date.UTC(2026, 7, 29) }),
      range({ checkedAt: Date.UTC(2026, 7, 27) }),
      range({ level: "mid", checkedAt: Date.UTC(2026, 7, 30) }),
    ],
    companySlug: "newco",
    targetLevel: "junior",
    location: "Madrid",
  });

  assert.equal(selected?.period, "year");
  assert.equal(selected?.rangeKind, "range");
  assert.equal(selected?.level, "junior");
});

test("never carries a posted range into another exact city", () => {
  const item = range();
  assert.equal(postedLocationMatches(item, "Madrid"), true);
  assert.equal(postedLocationMatches(item, "Valencia"), false);
});

test("treats Spain-wide employer postings as valid for Madrid and Valencia filters", () => {
  const spainWide = range({ locationLabel: "Spain-wide", location: "Spain" });
  assert.equal(postedLocationMatches(spainWide, "Madrid"), true);
  assert.equal(postedLocationMatches(spainWide, "Valencia"), true);
  assert.equal(decisionLocationMatches("Spain-wide", "Madrid"), true);
  assert.equal(decisionLocationMatches("Madrid", "Valencia"), false);
});

test("matches only explicit remote postings under the Remote filter", () => {
  const remote = range({ locationLabel: "Remote Spain / EU", location: "Spain" });
  const spainWide = range({ locationLabel: "Spain-wide", location: "Spain" });
  assert.equal(postedLocationMatches(remote, "Remote"), true);
  assert.equal(postedLocationMatches(spainWide, "Remote"), false);
  assert.equal(postedLocationMatches(spainWide, "Madrid"), true);
  assert.equal(decisionLocationMatches("Remote Spain/EU", "Remote"), true);
  assert.equal(decisionLocationMatches("Spain-wide", "Remote"), false);
  assert.equal(decisionLocationMatches("Spain-wide", "Madrid"), true);
});

test("describes monitoring and unsupported states without hiding gaps", () => {
  const monitoring = companyResearchPresentation(
    tracked("newco", {
      researchStatus: "monitoring",
      provider: "ashby",
      lastCareerSyncAt: Date.UTC(2026, 7, 27),
      openRoleCount: 3,
    }),
  );
  const unsupported = companyResearchPresentation(
    tracked("newco", { researchStatus: "unsupported" }),
  );

  assert.equal(monitoring.label, "Monitoring");
  assert.match(monitoring.detail, /3 relevant open roles/i);
  assert.match(unsupported.label, /no supported free feed/i);
  assert.equal(careerProviderLabel("google_careers"), "Google Careers");
  assert.equal(careerProviderLabel("workday"), "Workday Careers");
  assert.equal(careerProviderLabel("amazon_jobs"), "Amazon Jobs");
  assert.equal(careerProviderLabel("microsoft_careers"), "Microsoft Careers");
  assert.equal(careerProviderLabel("apple_careers"), "Apple Jobs");
  assert.equal(careerProviderLabel("netflix_careers"), "Netflix Jobs");
});

test("an audited employer explains which acceptance gate its official source failed", () => {
  const audited = companyResearchPresentation(tracked("meta", { researchStatus: "unsupported" }));
  const unaudited = companyResearchPresentation(tracked("newco", { researchStatus: "unsupported" }));

  assert.match(audited.label, /no supported free feed/i);
  assert.match(audited.detail, /Failed gates: Access terms/);
  assert.match(audited.detail, /rediscovery retries weekly$/);
  assert.match(unaudited.detail, /discovery retries weekly$/);
  assert.doesNotMatch(unaudited.detail, /Failed gate/);
});

test("retries transient failures, stale leases, and unsupported companies weekly", () => {
  const now = Date.UTC(2026, 7, 27, 12);
  assert.equal(
    shouldAutomaticallyRetryCompanyResearch({
      status: "failed",
      lastAttemptAt: now - 7 * 60 * 60_000,
      now,
    }),
    true,
  );
  assert.equal(
    shouldAutomaticallyRetryCompanyResearch({
      status: "failed",
      lastAttemptAt: now - 60 * 60_000,
      now,
    }),
    false,
  );
  assert.equal(
    shouldAutomaticallyRetryCompanyResearch({
      status: "discovering",
      lastAttemptAt: now - 31 * 60_000,
      now,
    }),
    true,
  );
  assert.equal(shouldAutomaticallyRetryCompanyResearch({
    status: "unsupported",
    lastAttemptAt: now - 6 * 24 * 60 * 60_000,
    now,
  }), false);
  assert.equal(shouldAutomaticallyRetryCompanyResearch({
    status: "unsupported",
    lastAttemptAt: now - 8 * 24 * 60 * 60_000,
    now,
  }), true);
});

test("a posting keeps the level it was published at", () => {
  for (const level of ["intern", "junior", "mid", "senior", "staff", "principal"]) {
    const point = salaryPointFromPostedRange(range({ level }));
    assert.equal(
      point.level,
      level,
      `${level} posting must not be republished under another level`,
    );
  }
});

test("senior and principal ranges stay separate points", () => {
  const companies = buildCompanyResearchCatalog({
    baseCompanies: [],
    trackedCompanies: [tracked("elastic", { canonicalName: "Elastic" })],
    postedRanges: [
      range({
        companySlug: "elastic",
        level: "senior",
        locationLabel: "Spain-wide",
        minimumAmount: 67_000,
        maximumAmount: 106_000,
      }),
      range({
        companySlug: "elastic",
        level: "principal",
        locationLabel: "Spain-wide",
        minimumAmount: 80_400,
        maximumAmount: 127_200,
      }),
    ],
  });
  const levels = companies[0].salaryPoints.map((point) => point.level).sort();
  assert.deepEqual(levels, ["principal", "senior"]);
  // The principal money must not be reachable through the senior cell.
  const senior = companies[0].salaryPoints.find((point) => point.level === "senior");
  assert.equal(senior.baseMinEur, 67_000);
});

test("a company posting only above the target level offers no range at that level", () => {
  const ranges = [
    range({
      companySlug: "elastic",
      level: "principal",
      locationLabel: "Spain-wide",
      minimumAmount: 80_400,
      maximumAmount: 127_200,
    }),
  ];
  for (const targetLevel of ["intern", "junior", "mid"]) {
    assert.equal(
      selectPostedRange({ ranges, companySlug: "elastic", targetLevel, location: "Madrid" }),
      null,
      `${targetLevel} must not resolve to a principal posting`,
    );
  }
});

test("a Spain-wide posting applies to every Spanish city", () => {
  for (const city of ["Madrid", "Valencia", "Málaga", "Bilbao", "Seville"]) {
    assert.equal(
      decisionLocationMatches("Spain-wide", city),
      true,
      `Spain-wide must cover ${city}`,
    );
    assert.equal(
      postedLocationMatches(range({ locationLabel: "Spain-wide" }), city),
      true,
    );
  }
});

test("one city's pay never satisfies another city", () => {
  assert.equal(decisionLocationMatches("Málaga", "Madrid"), false);
  assert.equal(decisionLocationMatches("Madrid", "Málaga"), false);
  assert.equal(
    postedLocationMatches(range({ locationLabel: "Málaga" }), "Madrid"),
    false,
  );
  assert.equal(
    postedLocationMatches(range({ locationLabel: "Málaga" }), "Málaga"),
    true,
  );
});

test("remote matches only postings published as remote", () => {
  assert.equal(decisionLocationMatches("Remote Spain/EU", "Remote"), true);
  assert.equal(decisionLocationMatches("Spain-wide", "Remote"), false);
  assert.equal(decisionLocationMatches("Málaga", "Remote"), false);
});

test("a city posting keeps its own city as the point location", () => {
  const point = salaryPointFromPostedRange(
    range({ locationLabel: "Málaga", level: "mid" }),
  );
  assert.equal(point.location, "Málaga");
  assert.equal(point.locationLabel, "Málaga");
});

test("a city filter admits only that city and Spain-wide, never a second city", () => {
  const cities = ["Madrid", "Valencia", "Málaga", "Barcelona", "Bilbao"];
  const allScopes = [
    ...cities,
    "Spain-wide",
    "Remote Spain/EU",
    "Other Spain",
    "EU benchmark",
    "Unknown",
  ];

  for (const filter of cities) {
    const admitted = allScopes.filter((scope) => decisionLocationMatches(scope, filter));
    // This is what lets Compare treat the set as one comparable scope: a
    // national band plus at most one city, never two different cities.
    const admittedCities = admitted.filter((scope) => cities.includes(scope));
    assert.deepEqual(
      admittedCities,
      [filter],
      `${filter} must admit only itself among cities`,
    );
    assert.ok(admitted.includes("Spain-wide"), "a Spain-wide band applies to every city");
    assert.ok(!admitted.includes("EU benchmark"));
    assert.ok(!admitted.includes("Unknown"));
    assert.ok(!admitted.includes("Remote Spain/EU"));
  }
});

const NOW = 1_800_000_000_000;

test("an unsupported company still within its attempts keeps the weekly retry", () => {
  const eligible = (attempts) =>
    shouldAutomaticallyRetryCompanyResearch({
      status: "unsupported",
      lastAttemptAt: NOW - COMPANY_UNSUPPORTED_RETRY_DELAY_MS,
      now: NOW,
      attempts,
    });
  assert.equal(eligible(undefined), true);
  assert.equal(eligible(2), true);
});

test("discovery backs off to monthly once attempts are exhausted", () => {
  const args = {
    status: "unsupported",
    lastAttemptAt: NOW - COMPANY_UNSUPPORTED_RETRY_DELAY_MS,
    now: NOW,
    attempts: 3,
  };
  // A week is no longer enough for a company that has spent its attempts.
  assert.equal(shouldAutomaticallyRetryCompanyResearch(args), false);
  assert.equal(
    shouldAutomaticallyRetryCompanyResearch({
      ...args,
      lastAttemptAt: NOW - COMPANY_UNTRACKABLE_RETRY_DELAY_MS,
    }),
    true,
  );
});

test("an exhausted company is reported as untrackable, not as pending", () => {
  const pending = companyResearchPresentation(
    tracked("pendingco", { researchStatus: "unsupported", discoveryAttempts: 1 }),
  );
  assert.equal(pending.label, "No supported free feed");
  assert.match(pending.detail, /retries weekly/);

  const exhausted = companyResearchPresentation(
    tracked("deadco", { researchStatus: "unsupported", discoveryAttempts: 3 }),
  );
  assert.equal(exhausted.label, "Not automatically trackable");
  assert.doesNotMatch(exhausted.detail, /retries weekly/);
  // The company is still worth showing: its pay comes from research, not the feed.
  assert.match(exhausted.detail, /salary is still researched/);
});
