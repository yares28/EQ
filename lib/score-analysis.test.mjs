import assert from "node:assert/strict";
import test from "node:test";

import { matchPosting } from "./cv-match.ts";
import { extractSkillTokens } from "./skill-taxonomy.ts";
import {
  cheapestWins,
  nextJumps,
  companyFit,
  compareCvs,
  familyFit,
  realisticPay,
  skillOpportunities,
} from "./score-analysis.ts";

const CV_TEXT = `Technologies: Java, Python, TypeScript, SQL, Spring Boot, React, PostgreSQL
Tools: Git, AWS, Docker`;
const CV = {
  skills: extractSkillTokens(CV_TEXT),
  languages: [{ language: "English", level: "Fluent" }],
  text: CV_TEXT,
  baseLocation: "Madrid",
  level: "junior",
};

function scored({ id, company = "Acme", title = "Engineer", tokens, must, pay = null, open = true }) {
  const match = matchPosting(CV, {
    title,
    locations: ["Madrid, Spain"],
    matchTokens: tokens,
    mustHaveTokens: must,
    level: "junior",
  });
  return {
    postingId: id,
    companySlug: company.toLowerCase(),
    companyName: company,
    title,
    url: `https://example.com/${id}`,
    locations: ["Madrid, Spain"],
    open,
    firstSeenAt: 1,
    lastSeenAt: 1,
    match,
    payEur: pay,
  };
}

test("what to learn next ranks by roles unlocked, then breadth", () => {
  const rows = [
    scored({ id: "1", tokens: ["java", "terraform"], must: ["terraform"], pay: 70000 }),
    scored({ id: "2", tokens: ["java", "terraform"], must: ["terraform"], pay: 80000 }),
    scored({ id: "3", tokens: ["java", "kafka"], must: ["kafka"], pay: 60000 }),
  ];
  const opportunities = skillOpportunities(rows);
  const terraform = opportunities.find((item) => item.skillId === "terraform");
  assert.equal(terraform.roleCount, 2, "counts every role, not just the examples shown");
  assert.equal(terraform.medianPayEur, 75000);
  assert.ok(opportunities.indexOf(terraform) < opportunities.findIndex((i) => i.skillId === "kafka"));
});

test("role count is not capped by the example list", () => {
  // Examples are capped at three for display; the count must not be.
  const rows = Array.from({ length: 7 }, (_, index) =>
    scored({ id: String(index), tokens: ["terraform"], must: ["terraform"] }),
  );
  const [terraform] = skillOpportunities(rows);
  assert.equal(terraform.roleCount, 7);
  assert.equal(terraform.exampleTitles.length, 3);
});

test("a skill you already have never appears as an opportunity", () => {
  const rows = [scored({ id: "1", tokens: ["java"], must: ["java"] })];
  assert.deepEqual(skillOpportunities(rows), []);
});

test("realistic pay never exceeds headline pay", () => {
  const rows = [
    // Strong match, modest pay.
    scored({ id: "1", tokens: ["java", "spring"], must: ["java"], pay: 50000 }),
    // Bad match, high pay — should lift the headline but not the reachable figure.
    scored({ id: "2", tokens: ["jax", "pytorch", "llm"], must: ["jax", "pytorch"], pay: 200000 }),
  ];
  const pay = realisticPay(rows);
  assert.ok(pay.reachableMedianEur <= pay.headlineMedianEur);
  assert.equal(pay.reachableCount, 1);
  assert.equal(pay.headlineCount, 2);
});

test("realistic pay reports nothing rather than zero when no role is reachable", () => {
  const rows = [scored({ id: "1", tokens: ["jax"], must: ["jax"], pay: 90000 })];
  const pay = realisticPay(rows);
  assert.equal(pay.reachableMedianEur, null);
  assert.equal(pay.reachableCount, 0);
});

test("cheapest wins are ordered by how small the gap is", () => {
  const rows = [
    scored({ id: "far", tokens: ["jax", "pytorch", "llm", "kafka"], must: ["jax", "pytorch", "llm", "kafka"] }),
    scored({ id: "near", tokens: ["java", "spring", "kafka"], must: ["java", "spring", "kafka"] }),
  ];
  const wins = cheapestWins(rows);
  assert.ok(wins.length > 0);
  assert.ok(wins[0].gap <= wins[wins.length - 1].gap);
});

test("family fit groups roles and ranks by median score", () => {
  const rows = [
    scored({ id: "1", title: "Backend Engineer", tokens: ["java", "spring", "rest"], must: ["java"] }),
    scored({ id: "2", title: "ML Engineer", tokens: ["pytorch", "jax", "ml"], must: ["pytorch"] }),
  ];
  const families = familyFit(rows);
  assert.ok(families.length >= 2);
  // Ordered strongest-first, so the backend row must outrank the ML one.
  assert.ok(families[0].medianScore >= families[families.length - 1].medianScore);
});

test("company rollup reports best and median per company", () => {
  const rows = [
    scored({ id: "1", company: "Alpha", tokens: ["java", "spring"], must: ["java"] }),
    scored({ id: "2", company: "Alpha", tokens: ["jax"], must: ["jax"] }),
    scored({ id: "3", company: "Beta", tokens: ["java", "spring", "postgres"], must: ["java", "spring"] }),
  ];
  const fits = companyFit(rows);
  const alpha = fits.find((item) => item.companySlug === "alpha");
  assert.equal(alpha.roleCount, 2);
  assert.ok(alpha.bestScore >= alpha.medianScore);
  // Sorted by best score, descending. Both companies have a fully-matched role
  // here, so the contract to assert is the ordering, not which name wins.
  for (let index = 1; index < fits.length; index += 1) {
    assert.ok(fits[index - 1].bestScore >= fits[index].bestScore);
  }
});

test("an unscored role is excluded from every rollup", () => {
  const rows = [scored({ id: "1", tokens: [], must: [] })];
  assert.deepEqual(familyFit(rows), []);
  assert.deepEqual(companyFit(rows), []);
});

test("comparing two CVs reports what moved in each direction", () => {
  const improvedText = `${CV_TEXT}, Kubernetes, Terraform`;
  const candidate = { ...CV, skills: extractSkillTokens(improvedText), text: improvedText };
  const postings = [
    { title: "Platform", locations: ["Madrid, Spain"], matchTokens: ["terraform", "java"], mustHaveTokens: ["terraform"], level: "junior" },
    { title: "Backend", locations: ["Madrid, Spain"], matchTokens: ["java", "spring"], mustHaveTokens: ["java"], level: "junior" },
  ];
  const comparison = compareCvs(CV, candidate, postings);
  assert.equal(comparison.improved, 1);
  assert.equal(comparison.worsened, 0);
  assert.equal(comparison.unchanged, 1);
  assert.ok(comparison.netScoreDelta > 0);
  assert.equal(comparison.biggestGain.title, "Platform");
  assert.equal(comparison.biggestLoss, null);
});

test("comparing identical CVs reports no movement at all", () => {
  const postings = [
    { title: "Backend", locations: ["Madrid, Spain"], matchTokens: ["java"], mustHaveTokens: ["java"], level: "junior" },
  ];
  const comparison = compareCvs(CV, CV, postings);
  assert.equal(comparison.improved, 0);
  assert.equal(comparison.worsened, 0);
  assert.equal(comparison.netScoreDelta, 0);
});

const LADDER = ["intern", "junior", "mid"];
const LABEL = (level) => ({ intern: "Intern", junior: "SDE1", mid: "SDE2" })[level] ?? level;

test("a jump is only stated when both rungs exist at the same company", () => {
  const rows = [scored({ id: "1", company: "Alpha", tokens: ["java"], must: ["java"] })];
  const pay = (slug, level) =>
    slug === "alpha" && level === "junior" ? 50000 : slug === "alpha" && level === "mid" ? 70000 : null;
  const jumps = nextJumps(rows, pay, LADDER, LABEL);
  // intern->junior has no intern figure, so only junior->mid is reported.
  assert.equal(jumps.length, 1);
  assert.equal(jumps[0].fromLabel, "SDE1");
  assert.equal(jumps[0].toLabel, "SDE2");
  assert.equal(jumps[0].deltaEur, 20000);
  assert.equal(jumps[0].deltaPercent, 40);
});

test("no jump is invented when a rung is missing", () => {
  const rows = [scored({ id: "1", company: "Alpha", tokens: ["java"], must: ["java"] })];
  const jumps = nextJumps(rows, () => null, LADDER, LABEL);
  assert.deepEqual(jumps, []);
});

test("jumps are ranked by the size of the step, not the pay", () => {
  const rows = [
    scored({ id: "1", company: "Alpha", tokens: ["java"], must: ["java"] }),
    scored({ id: "2", company: "Beta", tokens: ["java"], must: ["java"] }),
  ];
  // Beta pays more in absolute terms but climbs less steeply.
  const pay = (slug, level) => {
    if (slug === "alpha") return level === "junior" ? 40000 : level === "mid" ? 80000 : null;
    if (slug === "beta") return level === "junior" ? 90000 : level === "mid" ? 99000 : null;
    return null;
  };
  const jumps = nextJumps(rows, pay, LADDER, LABEL);
  assert.equal(jumps[0].companySlug, "alpha");
  assert.equal(jumps[0].deltaPercent, 100);
  assert.equal(jumps[1].deltaPercent, 10);
});

test("each jump carries your best match at that company", () => {
  const rows = [
    scored({ id: "1", company: "Alpha", tokens: ["java", "spring"], must: ["java"] }),
    scored({ id: "2", company: "Alpha", tokens: ["jax"], must: ["jax"] }),
  ];
  const pay = (slug, level) => (level === "junior" ? 50000 : level === "mid" ? 60000 : null);
  const [jump] = nextJumps(rows, pay, LADDER, LABEL);
  const best = Math.max(...rows.map((r) => r.match.score));
  assert.equal(jump.bestMatch, best);
});

test("a zero or negative base pay yields no jump rather than an infinite one", () => {
  const rows = [scored({ id: "1", company: "Alpha", tokens: ["java"], must: ["java"] })];
  const pay = (slug, level) => (level === "junior" ? 0 : level === "mid" ? 60000 : null);
  assert.deepEqual(nextJumps(rows, pay, LADDER, LABEL), []);
});
