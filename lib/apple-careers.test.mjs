import assert from "node:assert/strict";
import test from "node:test";

import {
  isAppleSoftwareListing,
  parseAppleCareersDetail,
  parseAppleCareersSearchPage,
} from "./apple-careers.ts";

function hydration(loaderData) {
  const serialized = JSON.stringify({ loaderData, actionData: null, errors: null });
  return `<html><script>window.__staticRouterHydrationData = JSON.parse(${JSON.stringify(serialized)});</script></html>`;
}

const rawJob = {
  id: "200676359-0215",
  reqId: "200676359-0215",
  positionId: "200676359",
  postingTitle: "AIML - Applied ML Engineer, Responsible AI",
  transformedPostingTitle: "aiml-applied-ml-engineer-responsible-ai",
  jobSummary: "Build production machine-learning systems.",
  locations: [{ name: "Barcelona", city: "Barcelona", stateProvince: "Barcelona", countryName: "Spain", countryID: "iso-country-ESP" }],
  team: { teamName: "Machine Learning and AI", teamCode: "MLAI" },
  postExternal: true,
  postDateInGMT: "2026-08-10T10:53:52.537+00:00",
};

test("parses Apple's exact server-rendered Spain search payload", () => {
  const html = hydration({
    root: { locale: "en-us" },
    search: {
      totalRecords: 1,
      page: 1,
      queryParams: { location: "spain-ESPC" },
      filters: { locations: [{ id: "postLocation-ESPC", name: "Spain" }] },
      searchResults: [rawJob],
    },
  });
  const parsed = parseAppleCareersSearchPage(html);
  assert.equal(parsed?.total, 1);
  assert.equal(parsed?.jobs[0]?.externalId, "200676359-0215");
  assert.equal(parsed?.jobs[0]?.canonicalUrl, "https://jobs.apple.com/en-us/details/200676359-0215/aiml-applied-ml-engineer-responsible-ai?team=MLAI");
});

test("rejects expanded or non-Spain locations", () => {
  const html = hydration({
    root: { locale: "en-us" },
    search: {
      totalRecords: 1,
      page: 1,
      queryParams: { location: "spain-ESPC" },
      filters: { locations: [{ id: "postLocation-ESPC", name: "Spain" }] },
      searchResults: [{ ...rawJob, locations: [{ name: "London", countryName: "United Kingdom", countryID: "iso-country-GBR" }] }],
    },
  });
  assert.equal(parseAppleCareersSearchPage(html), null);
});

test("parses complete Apple detail evidence", () => {
  const listing = parseAppleCareersSearchPage(hydration({
    root: { locale: "en-us" },
    search: {
      totalRecords: 1,
      page: 1,
      queryParams: { location: "spain-ESPC" },
      filters: { locations: [{ id: "postLocation-ESPC", name: "Spain" }] },
      searchResults: [rawJob],
    },
  }))?.jobs[0];
  assert.ok(listing);
  const html = hydration({
    root: { locale: "en-us" },
    jobDetails: {
      requestUrl: listing.canonicalUrl,
      jobsData: {
        jobNumber: listing.externalId,
        positionId: listing.positionId,
        postingTitle: listing.title,
        transformedPostingTitle: "aiml-applied-ml-engineer-responsible-ai",
        teamNames: [listing.teamName, "Software and Services"],
        locations: rawJob.locations,
        jobSummary: "Summary text",
        description: "Description text",
        responsibilities: "Ship reliable systems",
        minimumQualifications: "Production experience",
        preferredQualifications: "Computer Science degree",
      },
    },
  });
  const parsed = parseAppleCareersDetail(html, listing);
  assert.equal(parsed?.companyName, "Apple");
  assert.match(parsed?.descriptionText ?? "", /Minimum Qualifications/);
});

test("keeps technical Apple IC titles and excludes adjacent work", () => {
  const base = parseAppleCareersSearchPage(hydration({
    root: { locale: "en-us" },
    search: {
      totalRecords: 1,
      page: 1,
      queryParams: { location: "spain-ESPC" },
      filters: { locations: [{ id: "postLocation-ESPC", name: "Spain" }] },
      searchResults: [rawJob],
    },
  }))?.jobs[0];
  assert.ok(base);
  assert.equal(isAppleSoftwareListing(base), true);
  assert.equal(isAppleSoftwareListing({ ...base, title: "Language Engineer (Polish)", teamCode: "SFTWR" }), true);
  assert.equal(isAppleSoftwareListing({ ...base, title: "German Language Expert - Localization and Release Engineering", teamCode: "SFTWR" }), false);
  assert.equal(isAppleSoftwareListing({ ...base, title: "Engineering Manager" }), false);
});
