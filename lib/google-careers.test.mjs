import assert from "node:assert/strict";
import test from "node:test";

import { parseCompanyPostedSalary } from "./company-posted-salary.ts";
import { parseGoogleCareersPage } from "./google-careers.ts";

function job(overrides = {}) {
  const value = Array(21).fill(null);
  value[0] = "135042943743337158";
  value[1] = "Software Engineer III, AI/ML, Threat Intelligence";
  value[3] = [null, "<ul><li>Build reliable systems.</li></ul>"];
  value[4] = [null, "<h3>Minimum qualifications:</h3><ul><li>2 years of software development.</li></ul>"];
  value[7] = "Google";
  value[9] = [["Málaga, Spain", ["Málaga, Spain"], "Málaga", null, "AN", "ES"]];
  value[10] = [null, "<p>Spain: €70000 - €72000 (EUR) + 15% bonus target + equity + benefits</p>"];
  return Object.assign(value, overrides);
}

function page(payload) {
  return `<script>AF_initDataCallback({key: 'ds:1', hash: '2', data:${JSON.stringify(payload)}, sideChannel: {}});</script>`;
}

test("parses an exact Google Spain posting and preserves explicit salary text", () => {
  const parsed = parseGoogleCareersPage(page([[job()], null, 1, 20]));
  assert.equal(parsed?.total, 1);
  assert.equal(parsed?.jobs[0]?.companyName, "Google");
  assert.deepEqual(parsed?.jobs[0]?.locations, ["Málaga, Spain"]);
  assert.match(parsed?.jobs[0]?.canonicalUrl ?? "", /135042943743337158-software-engineer-iii-aiml-threat-intelligence/);
  assert.match(parsed?.jobs[0]?.descriptionText ?? "", /Qualifications\nMinimum qualifications:/);
  assert.match(parsed?.jobs[0]?.salaryText ?? "", /€70000 - €72000/);
  const salary = parseCompanyPostedSalary({
    title: parsed?.jobs[0]?.title ?? "",
    locations: parsed?.jobs[0]?.locations ?? [],
    salaryText: parsed?.jobs[0]?.salaryText ?? "",
    companySlug: "google",
  });
  // Google states the range without a period and adds an unquantified bonus and
  // equity. The base range itself is clean, so it is released as Málaga mid-level
  // pay with the deduced period recorded.
  assert.equal(salary.accepted, true);
  assert.equal(salary.canonicalLevel, "mid");
  assert.equal(salary.period, "year");
  assert.equal(salary.cityKey, "malaga");
  assert.deepEqual([salary.minimumAmount, salary.maximumAmount], [70_000, 72_000]);
  assert.ok(salary.qualityFlags.includes("inferred_annual_period"));
});

test("handles escaped brackets inside strings without ending the payload early", () => {
  const escaped = job();
  escaped[10] = [null, "<p>Build [safe] systems and parse a quoted \\\"value\\\".</p>"];
  const parsed = parseGoogleCareersPage(page([[escaped], null, 1, 20]));
  assert.equal(parsed?.jobs.length, 1);
  assert.match(parsed?.jobs[0]?.descriptionText ?? "", /\[safe\]/);
});

test("fails closed for wrong identity, non-Spain scope, malformed jobs, and count metadata", () => {
  const wrongCompany = job({ 7: "Not Google" });
  const wrongCountry = job({ 9: [["London, UK", ["London, UK"], "London", null, null, "GB"]] });
  assert.equal(parseGoogleCareersPage(page([[wrongCompany], null, 1, 20])), null);
  assert.equal(parseGoogleCareersPage(page([[wrongCountry], null, 1, 20])), null);
  assert.equal(parseGoogleCareersPage(page([[[]], null, 1, 20])), null);
  assert.equal(parseGoogleCareersPage(page([[job()], null, "1", 20])), null);
});

test("fails closed when the exact data callback is absent or truncated", () => {
  assert.equal(parseGoogleCareersPage("<html>No data</html>"), null);
  assert.equal(parseGoogleCareersPage("AF_initDataCallback({key: 'ds:1', data:[["), null);
});
