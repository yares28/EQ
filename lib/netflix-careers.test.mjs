import assert from "node:assert/strict";
import test from "node:test";

import {
  isNetflixSoftwareListing,
  normalizeNetflixCareersDetail,
  normalizeNetflixCareersListing,
  parseNetflixCareersSearchPage,
} from "./netflix-careers.ts";

const listing = {
  id: 790318097186,
  name: "Software Engineer (L5) - Content Engineering",
  posting_name: "Software Engineer (L5) - Content Engineering",
  location: "Madrid,Spain",
  locations: ["Madrid,Spain"],
  department: "Engineering",
  business_unit: "Streaming",
  t_create: 1787616000,
  t_update: 1787616000,
  ats_job_id: "JR42304",
  display_job_id: "JR42304",
  type: "ATS",
  job_description: "",
  canonicalPositionUrl: "https://explore.jobs.netflix.net/careers/job/790318097186",
  isPrivate: false,
};

const searchPage = (positions, count = positions.length) => ({
  domain: "netflix.com",
  count,
  positions,
});

test("normalizes an exact Netflix Spain listing", () => {
  assert.deepEqual(normalizeNetflixCareersListing(listing), {
    externalId: "790318097186",
    displayJobId: "JR42304",
    title: "Software Engineer (L5) - Content Engineering",
    locations: ["Madrid, Spain"],
    rawLocations: ["Madrid,Spain"],
    department: "Engineering",
    canonicalUrl: "https://explore.jobs.netflix.net/careers/job/790318097186",
    postedAtMs: 1787616000000,
  });
});

test("accepts the exact Spain country segment only", () => {
  assert.equal(
    normalizeNetflixCareersListing({
      ...listing,
      location: "Madrid,MD,Spain",
      locations: ["Madrid,MD,Spain"],
    })?.locations[0],
    "Madrid, MD, Spain",
  );
  for (const location of ["Remote", "Remote,Spain", "Warsaw,Poland", "Spain", "Madrid,Spain (Remote)"]) {
    assert.equal(
      normalizeNetflixCareersListing({ ...listing, location, locations: [location] }),
      null,
      `expected ${location} to fail closed`,
    );
  }
});

test("rejects listings whose identity fields disagree", () => {
  assert.equal(normalizeNetflixCareersListing({ ...listing, ats_job_id: "JR99999" }), null);
  assert.equal(normalizeNetflixCareersListing({ ...listing, posting_name: "Different posting" }), null);
  assert.equal(normalizeNetflixCareersListing({ ...listing, isPrivate: true }), null);
  assert.equal(normalizeNetflixCareersListing({ ...listing, type: "EXTERNAL" }), null);
  assert.equal(
    normalizeNetflixCareersListing({
      ...listing,
      canonicalPositionUrl: "https://explore.jobs.netflix.net/careers/job/790000000000",
    }),
    null,
  );
});

test("parses a complete positive Spain search page", () => {
  const parsed = parseNetflixCareersSearchPage(searchPage([listing], 1));
  assert.equal(parsed?.total, 1);
  assert.equal(parsed?.jobs.length, 1);
  assert.equal(parsed?.jobs[0]?.externalId, "790318097186");
});

test("parses a zero-result page as a valid empty result", () => {
  const parsed = parseNetflixCareersSearchPage(searchPage([], 0));
  assert.deepEqual(parsed, { total: 0, jobs: [], rawJobs: [] });
});

test("rejects malformed and foreign-domain payloads", () => {
  assert.equal(parseNetflixCareersSearchPage(null), null);
  assert.equal(parseNetflixCareersSearchPage({ count: 1, positions: [listing] }), null);
  assert.equal(parseNetflixCareersSearchPage({ ...searchPage([listing], 1), domain: "example.com" }), null);
  assert.equal(parseNetflixCareersSearchPage({ ...searchPage([listing], 1), count: -1 }), null);
  assert.equal(parseNetflixCareersSearchPage({ domain: "netflix.com", count: 1, positions: "many" }), null);
});

test("rejects a partially decodable page instead of dropping records", () => {
  assert.equal(parseNetflixCareersSearchPage(searchPage([listing, {}], 2)), null);
  assert.equal(
    parseNetflixCareersSearchPage(searchPage([listing, { ...listing, id: 790318097187, locations: ["Warsaw,Poland"] }], 2)),
    null,
  );
});

test("surfaces duplicate identities so the caller can abort reconciliation", () => {
  const parsed = parseNetflixCareersSearchPage(searchPage([listing, { ...listing }], 2));
  assert.equal(parsed?.jobs.length, 2);
  assert.equal(new Set(parsed?.jobs.map((job) => job.externalId)).size, 1);
});

test("normalizes complete Netflix detail evidence", () => {
  const expected = normalizeNetflixCareersListing(listing);
  assert.ok(expected);
  const parsed = normalizeNetflixCareersDetail({
    ...listing,
    canonicalPositionUrl:
      "https://explore.jobs.netflix.net/careers/job/790318097186?microsite=netflix.com",
    job_description:
      "<p><span>Netflix builds streaming systems.</span></p><p>Qualifications</p><ul><li>Production Java &amp; Kotlin experience</li></ul>",
  }, expected);
  assert.equal(parsed?.companyName, "Netflix");
  assert.equal(parsed?.canonicalUrl, "https://explore.jobs.netflix.net/careers/job/790318097186");
  assert.match(parsed?.descriptionText ?? "", /Production Java & Kotlin experience/);
});

test("rejects detail records that changed identity or lost the description", () => {
  const expected = normalizeNetflixCareersListing(listing);
  assert.ok(expected);
  const complete = { ...listing, job_description: "<p>A complete description.</p>" };
  assert.equal(normalizeNetflixCareersDetail({ ...complete, job_description: "" }, expected), null);
  assert.equal(
    normalizeNetflixCareersDetail({ ...complete, name: "Software Engineer (L6)", posting_name: "Software Engineer (L6)" }, expected),
    null,
  );
  assert.equal(
    normalizeNetflixCareersDetail({
      ...complete,
      id: 790318097187,
      canonicalPositionUrl: "https://explore.jobs.netflix.net/careers/job/790318097187",
    }, expected),
    null,
  );
});

test("keeps Netflix technical IC titles and excludes adjacent or leadership work", () => {
  const withTitle = (title) => ({ ...normalizeNetflixCareersListing(listing), title });
  for (const title of [
    "Software Engineer (L5) - Content Engineering",
    "Senior Data Engineer",
    "Site Reliability Engineer",
    "Machine Learning Engineer, Personalization",
  ]) {
    assert.equal(isNetflixSoftwareListing(withTitle(title)), true, title);
  }
  for (const title of [
    "HR Business Partner - Spain & Turkiye",
    "Engineering Manager, Playback",
    "Director of Engineering",
    "Technical Recruiter",
    "Product Manager, Ads",
    "Counsel, Legal",
  ]) {
    assert.equal(isNetflixSoftwareListing(withTitle(title)), false, title);
  }
});
