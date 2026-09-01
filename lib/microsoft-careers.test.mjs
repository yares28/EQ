import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeMicrosoftCareersDetail,
  normalizeMicrosoftCareersListing,
  parseMicrosoftCareersSearchPage,
} from "./microsoft-careers.ts";

const listing = {
  id: 1970393556959514,
  displayJobId: "200047774",
  name: "Software Engineer II",
  locations: ["Spain, Madrid, Madrid"],
  standardizedLocations: ["Madrid, MD, ES"],
  postedTs: 1786521656,
  department: "Software Engineering",
  atsJobId: "200047774",
  positionUrl: "/careers/job/1970393556959514",
};

test("normalizes an exact Microsoft Spain listing", () => {
  assert.deepEqual(normalizeMicrosoftCareersListing(listing), {
    externalId: "1970393556959514",
    displayJobId: "200047774",
    title: "Software Engineer II",
    locations: ["Spain, Madrid, Madrid"],
    standardizedLocations: ["Madrid, MD, ES"],
    department: "Software Engineering",
    canonicalUrl: "https://apply.careers.microsoft.com/careers/job/1970393556959514",
    postedAtMs: 1786521656000,
  });
});

test("rejects results without matching raw and structured Spain locations", () => {
  assert.equal(normalizeMicrosoftCareersListing({
    ...listing,
    locations: ["Remote"],
    standardizedLocations: ["Remote"],
  }), null);
  assert.equal(normalizeMicrosoftCareersListing({
    ...listing,
    positionUrl: "/careers/job/another-id",
  }), null);
});

test("parses only complete, recognized search pages", () => {
  const parsed = parseMicrosoftCareersSearchPage({
    status: 200,
    error: { message: "", body: "" },
    data: { count: 1, positions: [listing] },
  });
  assert.equal(parsed?.total, 1);
  assert.equal(parsed?.jobs[0]?.externalId, "1970393556959514");
  assert.equal(parseMicrosoftCareersSearchPage({ status: 200, data: { count: 1, positions: [{}] } }), null);
});

test("normalizes an exact individual-contributor detail response", () => {
  const expected = normalizeMicrosoftCareersListing(listing);
  assert.ok(expected);
  const parsed = normalizeMicrosoftCareersDetail({
    status: 200,
    data: {
      ...listing,
      publicUrl: "https://apply.careers.microsoft.com/careers/job/1970393556959514",
      efcustomTextRoletype: ["Individual Contributor"],
      jobDescription: "<b>Overview</b><br><p>Build &amp; operate services.</p><p>Qualifications</p><ul><li>Production experience</li></ul>",
    },
  }, expected);
  assert.equal(parsed?.companyName, "Microsoft");
  assert.equal(parsed?.roleType, "Individual Contributor");
  assert.match(parsed?.descriptionText ?? "", /Build & operate services/);
});

test("rejects manager details and public URL identity changes", () => {
  const expected = normalizeMicrosoftCareersListing(listing);
  assert.ok(expected);
  const detail = {
    status: 200,
    data: {
      ...listing,
      publicUrl: "https://apply.careers.microsoft.com/careers/job/1970393556959514",
      efcustomTextRoletype: ["Manager"],
      jobDescription: "A complete description",
    },
  };
  assert.equal(normalizeMicrosoftCareersDetail(detail, expected), null);
  assert.equal(normalizeMicrosoftCareersDetail({
    ...detail,
    data: { ...detail.data, efcustomTextRoletype: ["Individual Contributor"], publicUrl: "https://example.com/job" },
  }, expected), null);
});
