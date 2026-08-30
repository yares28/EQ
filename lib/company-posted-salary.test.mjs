import assert from "node:assert/strict";
import test from "node:test";

import {
  extractCompanyPostedSalaryText,
  isSpainLocation,
  parseCompanyPostedSalary,
  postedSalaryLocationLabel,
} from "./company-posted-salary.ts";

test("accepts an explicit Madrid annual software-engineer range", () => {
  const result = parseCompanyPostedSalary({
    title: "Senior Software Engineer, Platform",
    locations: ["Madrid, Spain"],
    salaryText: "The base salary range is €70,000–€90,000 per year.",
  });

  assert.equal(result.accepted, true);
  assert.equal(result.canonicalLevel, "senior");
  assert.equal(result.cityKey, "madrid");
  assert.equal(result.period, "year");
  assert.equal(result.minimumAmount, 70_000);
  assert.equal(result.maximumAmount, 90_000);
});

test("accepts European number formatting and a company-specific level", () => {
  const result = parseCompanyPostedSalary({
    title: "Software Engineer II",
    locations: ["Barcelona, Spain"],
    salaryText: "Retribución bruta anual: 55.000 EUR - 68.500 EUR",
  });

  assert.equal(result.accepted, true);
  assert.equal(result.canonicalLevel, "mid");
  assert.deepEqual([result.minimumAmount, result.maximumAmount], [55_000, 68_500]);
});

test("accepts explicit remote EU scope but labels it separately", () => {
  const result = parseCompanyPostedSalary({
    title: "Staff Software Engineer",
    locations: ["Remote, European Union"],
    salaryText: "EUR 95k - 125k annual base salary",
  });

  assert.equal(result.accepted, true);
  assert.equal(result.cityKey, "remote-spain-eu");
  assert.ok(result.qualityFlags.includes("regional_eu_remote_scope"));
});

test("quarantines a US range attached to a European role", () => {
  const result = parseCompanyPostedSalary({
    title: "Software Engineer, Privacy Engineering",
    locations: ["Dublin, Ireland"],
    salaryText: "$293K - $405K per year",
  });

  assert.equal(result.accepted, false);
  assert.ok(result.rejectionReasons.includes("outside_spain_scope"));
  assert.ok(result.rejectionReasons.includes("currency_not_eur"));
});

test("quarantines an otherwise plausible range when the level is ambiguous", () => {
  const result = parseCompanyPostedSalary({
    title: "Software Engineer, Payments",
    locations: ["Madrid, Spain"],
    salaryText: "€55,000–€70,000 per year",
  });

  assert.equal(result.accepted, false);
  assert.ok(result.rejectionReasons.includes("level_ambiguous"));
});

test("reads a bare annual-magnitude range as annual, but records the inference", () => {
  // No period wording, but €70k–€90k cannot be hourly or monthly, so annual is
  // the only available reading. It must stay distinguishable from a stated one.
  const result = parseCompanyPostedSalary({
    title: "Senior Software Engineer",
    locations: ["Spain, Remote"],
    salaryText: "€70.000–€90.000",
  });

  assert.equal(result.accepted, true);
  assert.equal(result.period, "year");
  assert.ok(result.qualityFlags.includes("inferred_annual_period"));
  assert.ok(!result.qualityFlags.includes("explicit_period"));
  assert.ok(
    result.confidenceScore < 0.98,
    "an inferred period must score below a stated one",
  );
});

test("keeps quarantining amounts whose period is genuinely ambiguous", () => {
  // Monthly-magnitude: €2,500 could be a month or a week. Not inferable.
  const monthly = parseCompanyPostedSalary({
    title: "Senior Software Engineer",
    locations: ["Spain"],
    salaryText: "€2.500 – €3.000",
  });
  assert.equal(monthly.accepted, false);
  assert.ok(monthly.rejectionReasons.includes("period_missing"));

  // A stray non-annual amount alongside the range means the text is not a
  // clean salary statement, so elimination must not fire.
  const mixed = parseCompanyPostedSalary({
    title: "Senior Software Engineer",
    locations: ["Spain"],
    salaryText: "€70.000 plus €500 travel allowance",
  });
  assert.equal(mixed.accepted, false);
  assert.ok(mixed.rejectionReasons.includes("period_missing"));
});

test("a percentage is a rate, not a compensation amount", () => {
  const result = parseCompanyPostedSalary({
    title: "Software Engineer III",
    locations: ["Málaga, Spain"],
    salaryText: "Spain: €70000 - €72000 (EUR) + 15% bonus target + equity + benefits",
    companySlug: "google",
  });

  assert.equal(result.accepted, true);
  assert.ok(!result.rejectionReasons.includes("multiple_compensation_amounts"));
  assert.deepEqual([result.minimumAmount, result.maximumAmount], [70_000, 72_000]);
});

test("numbered titles resolve against the employer's own scale", () => {
  const posting = (companySlug) => ({
    title: "Software Engineer III",
    locations: ["Madrid, Spain"],
    salaryText: "Salary: €70.000 — €80.000 per year",
    companySlug,
  });

  // Google SWE III is L4, which its audited ladder maps to mid.
  assert.equal(parseCompanyPostedSalary(posting("google")).canonicalLevel, "mid");
  // Employers without a recorded scale keep the common reading.
  assert.equal(parseCompanyPostedSalary(posting("stripe")).canonicalLevel, "senior");
  assert.equal(parseCompanyPostedSalary(posting(undefined)).canonicalLevel, "senior");
  // An explicit seniority word always outranks the numeral.
  assert.equal(
    parseCompanyPostedSalary({ ...posting("google"), title: "Senior Software Engineer III" })
      .canonicalLevel,
    "senior",
  );
});

test("accepts Elastic-style typical starting salary ranges without per-year wording", () => {
  const result = parseCompanyPostedSalary({
    title: "Software Engineer II",
    locations: ["Spain"],
    salaryText: "The typical starting salary range for this role is: · €62.800 &mdash; €84.300 EUR",
  });

  assert.equal(result.accepted, true);
  assert.equal(result.period, "year");
  assert.equal(result.canonicalLevel, "mid");
  assert.deepEqual([result.minimumAmount, result.maximumAmount], [62_800, 84_300]);
  assert.ok(result.qualityFlags.includes("inferred_annual_period"));
});

test("accepts language-specific IC titles such as Principal Java Engineer", () => {
  const result = parseCompanyPostedSalary({
    title: "Principal Java Engineer",
    locations: ["Spain"],
    salaryText: "The typical starting salary range for this role is: €80.400 — €127.200 EUR",
  });

  assert.equal(result.accepted, true);
  assert.equal(result.occupationKey, "software_engineering");
  assert.equal(result.canonicalLevel, "principal");
  assert.deepEqual([result.minimumAmount, result.maximumAmount], [80_400, 127_200]);
});

test("quarantines managers and adjacent engineering roles", () => {
  const manager = parseCompanyPostedSalary({
    title: "Engineering Manager",
    locations: ["Madrid, Spain"],
    salaryText: "€90,000–€110,000 per year",
  });
  const architect = parseCompanyPostedSalary({
    title: "Senior Solutions Architect",
    locations: ["Madrid, Spain"],
    salaryText: "€80,000–€100,000 per year",
  });

  assert.equal(manager.accepted, false);
  assert.equal(architect.accepted, false);
  assert.ok(manager.rejectionReasons.includes("not_software_engineering_ic"));
  assert.ok(architect.rejectionReasons.includes("not_software_engineering_ic"));
});

test("accepts a Spanish Valencia engineering title and annual wording", () => {
  const result = parseCompanyPostedSalary({
    title: "Ingeniera de Software Sénior",
    locations: ["València, Comunitat Valenciana"],
    salaryText: "Retribución: 62.000 €–75.000 € brutos anuales",
  });

  assert.equal(result.accepted, true);
  assert.equal(result.canonicalLevel, "senior");
  assert.equal(result.cityKey, "valencia");
  assert.equal(result.locationLabel, "Valencia");
  assert.deepEqual([result.minimumAmount, result.maximumAmount], [62_000, 75_000]);
});

test("extracts a complete salary block split across adjacent ATS lines", () => {
  const result = extractCompanyPostedSalaryText([
    "Compensation",
    "€58,000–€72,000",
    "per year",
    "Home office allowance: €500",
  ].join("\n"));

  assert.equal(result, "Compensation · €58,000–€72,000 · per year");
});

test("does not mistake a benefit allowance for base salary", () => {
  const result = extractCompanyPostedSalaryText(
    "Home office allowance: €500 per year\nLearning budget: €1,000 per year",
  );

  assert.equal(result, undefined);
});

test("renders every supported Spanish city key canonically", () => {
  assert.equal(postedSalaryLocationLabel("valencia", "València, Spain"), "Valencia");
  assert.equal(postedSalaryLocationLabel("malaga", "Malaga"), "Málaga");
  assert.equal(postedSalaryLocationLabel("unknown-city", "Murcia, Spain"), "Murcia, Spain");
});

test("does not treat years of experience as the pay period, but still accepts a named base-salary range", () => {
  const result = parseCompanyPostedSalary({
    title: "Senior Software Engineer",
    locations: ["Valencia, Spain"],
    salaryText: "Base salary €58,000–€72,000; 5 years of experience required",
  });

  assert.equal(result.accepted, true);
  assert.equal(result.period, "year");
  assert.ok(result.qualityFlags.includes("inferred_annual_period"));
  assert.ok(!result.qualityFlags.includes("explicit_period"));
});

test("does not map Valencia, California to Spain", () => {
  const result = parseCompanyPostedSalary({
    title: "Senior Software Engineer",
    locations: ["Valencia, CA"],
    salaryText: "Base salary €58,000–€72,000 per year",
  });

  assert.equal(result.accepted, false);
  assert.equal(result.countryCode, "XX");
  assert.ok(result.rejectionReasons.includes("outside_spain_scope"));
});

test("Spain detection covers every role type, and only Spain", () => {
  for (const location of [
    ["Madrid, Spain"], ["Spain"], ["España"], ["Málaga, Spain"],
    ["Barcelona"], ["Bilbao"], ["Remote - Spain"], ["Valencia, Spain"],
  ]) {
    assert.equal(isSpainLocation(location), true, `${location} is Spain`);
  }
  for (const location of [
    ["London, UK"], ["Valencia, CA"], ["Dublin, Ireland"], ["Portugal"],
    ["Remote - EMEA"], [""], [],
  ]) {
    assert.equal(isSpainLocation(location), false, `${location} is not Spain`);
  }
});
