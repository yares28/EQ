import assert from "node:assert/strict";
import test from "node:test";

import {
  assessSmartRecruitersBoardListing,
  normalizeSmartRecruitersPosting,
  smartRecruitersCompensation,
  smartRecruitersLocation,
} from "./smartrecruiters-postings.ts";

test("accepts only a non-empty exact company board with a real posting", () => {
  assert.deepEqual(assessSmartRecruitersBoardListing({
    content: [{
      name: "Senior Software Engineer",
      company: { identifier: "ExampleCorp", name: "Example Corp." },
    }],
  }, "examplecorp", "Example Corp"), { accepted: true });
  assert.deepEqual(
    assessSmartRecruitersBoardListing({ content: [] }, "examplecorp", "Example Corp"),
    { accepted: false, reason: "empty" },
  );
});

test("rejects ambiguous identities and test-only boards", () => {
  assert.deepEqual(assessSmartRecruitersBoardListing({
    content: [{
      name: "Senior Software Engineer",
      company: { identifier: "other", name: "Other Company" },
    }],
  }, "examplecorp", "Example Corp"), { accepted: false, reason: "identity_mismatch" });
  assert.deepEqual(assessSmartRecruitersBoardListing({
    content: [{
      name: "Test UAT",
      company: { identifier: "ExampleCorp", name: "Example Corp" },
    }],
  }, "examplecorp", "Example Corp"), { accepted: false, reason: "test_only" });
});

test("normalizes an exact Spain location and explicit annual compensation", () => {
  const posting = normalizeSmartRecruitersPosting({
    id: "job-1",
    name: "Ingeniera de Software Sénior",
    company: { identifier: "Example", name: "Example" },
    location: { city: "València", region: "Valencia", country: "es", remote: false },
    postingUrl: "https://jobs.smartrecruiters.com/Example/job-1",
    active: true,
    visibility: "PUBLIC",
    compensation: { currency: "EUR", min: 62_000, max: 75_000, period: "YEARLY" },
    jobAd: {
      sections: {
        jobDescription: { title: "Job Description", text: "<p>Build reliable systems.</p>" },
        qualifications: { title: "Qualifications", text: "<ul><li>TypeScript</li></ul>" },
      },
    },
  });

  assert.equal(posting?.salaryText, "EUR 62000–75000 per year");
  assert.deepEqual(posting?.locations, ["València, Valencia, Spain"]);
  assert.match(posting?.descriptionText ?? "", /Qualifications\nTypeScript/);
});

test("keeps one-sided compensation explicit and leaves unsupported periods quarantinable", () => {
  assert.equal(
    smartRecruitersCompensation({ currency: "EUR", min: 35, max: null, period: "HOURLY" }),
    "Minimum EUR 35 per hour",
  );
  assert.equal(
    smartRecruitersCompensation({ currency: "EUR", min: 1_200, max: 1_500, period: "WEEKLY" }),
    "EUR 1200–1500 per week",
  );
});

test("fails closed for incomplete compensation and internal postings", () => {
  assert.equal(smartRecruitersCompensation({ min: 60_000, max: 70_000, period: "YEARLY" }), undefined);
  assert.equal(normalizeSmartRecruitersPosting({
    id: "job-2",
    name: "Software Engineer",
    company: { identifier: "Example", name: "Example" },
    location: { city: "Madrid", country: "es" },
    postingUrl: "https://jobs.smartrecruiters.com/Example/job-2",
    visibility: "INTERNAL",
  }), null);
});

test("adds remote scope without losing the structured country name", () => {
  assert.deepEqual(
    smartRecruitersLocation({ city: "Madrid", country: "es", remote: true }),
    ["Madrid, Spain · Remote"],
  );
});
