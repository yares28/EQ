import assert from "node:assert/strict";
import test from "node:test";

import {
  findWorkdayCountryFacetId,
  normalizeWorkdayPostingDetail,
  parseWorkdayListingPage,
} from "./workday-postings.ts";

const listing = {
  total: 1,
  jobPostings: [{
    title: "Senior Libraries Engineer – AI and HPC",
    externalPath: "/job/Poland-Remote/Senior-Libraries-Engineer_JR2006812",
    bulletFields: ["JR2006812"],
  }],
  facets: [{
    facetParameter: "locationMainGroup",
    values: [{
      facetParameter: "locationHierarchy1",
      descriptor: "Locations",
      values: [{ descriptor: "Spain", id: "spain-facet", count: 7 }],
    }],
  }],
};

test("finds a unique Spain facet and parses a complete listing page", () => {
  assert.equal(findWorkdayCountryFacetId(listing, "Spain"), "spain-facet");
  assert.deepEqual(parseWorkdayListingPage(listing), {
    total: 1,
    postings: [{
      title: "Senior Libraries Engineer – AI and HPC",
      externalPath: "/job/Poland-Remote/Senior-Libraries-Engineer_JR2006812",
      externalId: "JR2006812",
    }],
  });
});

test("normalizes active public detail and keeps every stated location", () => {
  const posting = normalizeWorkdayPostingDetail({
    jobPostingInfo: {
      title: "Senior Libraries Engineer – AI and HPC",
      jobReqId: "JR2006812",
      location: "Poland, Remote",
      additionalLocations: ["Spain, Remote", "Germany, Remote"],
      jobDescription: "<p>Build accelerated libraries.</p><p>For Poland: 221,250 PLN - 383,500 PLN.</p>",
      externalUrl: "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/example_JR2006812",
      posted: true,
      canApply: true,
    },
    hiringOrganization: { name: "PL01 Nvidia Poland sp. z o.o." },
  });
  assert.equal(posting?.externalId, "JR2006812");
  assert.deepEqual(posting?.locations, ["Poland, Remote", "Spain, Remote", "Germany, Remote"]);
  assert.match(posting?.descriptionText ?? "", /Build accelerated libraries/);
});

test("fails closed for malformed listings, duplicate country facets, and inactive details", () => {
  assert.equal(parseWorkdayListingPage({ total: 1, jobPostings: [{}] }), null);
  assert.equal(findWorkdayCountryFacetId({ facets: [listing.facets[0], listing.facets[0]] }, "Spain"), null);
  assert.equal(normalizeWorkdayPostingDetail({
    jobPostingInfo: { posted: false },
    hiringOrganization: { name: "Nvidia" },
  }), null);
});

test("rejects non-HTTPS and non-Workday canonical URLs", () => {
  const base = {
    title: "Software Engineer",
    jobReqId: "JR1",
    location: "Spain, Remote",
    jobDescription: "Build systems.",
    posted: true,
  };
  assert.equal(normalizeWorkdayPostingDetail({
    jobPostingInfo: { ...base, externalUrl: "https://example.com/job/JR1" },
    hiringOrganization: { name: "Nvidia" },
  }), null);
});
