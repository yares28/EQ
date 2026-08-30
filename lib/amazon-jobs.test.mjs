import assert from "node:assert/strict";
import test from "node:test";

import { normalizeAmazonJob, parseAmazonJobsPage } from "./amazon-jobs.ts";

const job = {
  id_icims: "10463482",
  title: "Software Development Engineer (Java&AWS), Ring",
  company_name: "Amazon Spain Services, S.L.U.",
  job_path: "/en/jobs/10463482/software-development-engineer-java-aws-ring",
  description: "<p>Build distributed services.</p>",
  basic_qualifications: "- Experience programming in Java<br/>- Systems design experience",
  preferred_qualifications: "- Bachelor's degree",
  locations: [JSON.stringify({
    countryIso3a: "ESP",
    normalizedLocation: "Madrid, Community of Madrid, ESP",
  })],
};

test("normalizes a current official Spain job with a stable canonical identity", () => {
  assert.deepEqual(normalizeAmazonJob(job), {
    externalId: "10463482",
    title: "Software Development Engineer (Java&AWS), Ring",
    companyName: "Amazon Spain Services, S.L.U.",
    locations: ["Madrid, Community of Madrid, Spain"],
    canonicalUrl: "https://www.amazon.jobs/en/jobs/10463482/software-development-engineer-java-aws-ring",
    descriptionText: "Build distributed services.\nBasic Qualifications\n- Experience programming in Java\n- Systems design experience\nPreferred Qualifications\n- Bachelor's degree",
  });
});

test("parses total and preserves raw jobs for immutable snapshots", () => {
  const parsed = parseAmazonJobsPage({ error: null, hits: 1, jobs: [job] });
  assert.equal(parsed?.total, 1);
  assert.equal(parsed?.jobs.length, 1);
  assert.equal(parsed?.rawJobs[0], job);
});

test("fails closed for non-Spain, malformed location, and mismatched public paths", () => {
  assert.equal(normalizeAmazonJob({
    ...job,
    locations: [JSON.stringify({ countryIso3a: "USA", normalizedLocation: "Seattle, Washington, USA" })],
  }), null);
  assert.equal(normalizeAmazonJob({ ...job, locations: ["not-json"] }), null);
  assert.equal(normalizeAmazonJob({ ...job, job_path: "/en/jobs/99999/wrong-job" }), null);
});

test("rejects incomplete or errored result pages", () => {
  assert.equal(parseAmazonJobsPage({ error: "unavailable", hits: 0, jobs: [] }), null);
  assert.equal(parseAmazonJobsPage({ error: null, hits: 1, jobs: [{}] }), null);
});
