import assert from "node:assert/strict";
import test from "node:test";

import { matchPosting, matchTier, roleFamily, TIER_THRESHOLDS } from "./cv-match.ts";
import { extractSkillTokens } from "./skill-taxonomy.ts";

const CV_TEXT = `Technologies: Java, Python, JavaScript, TypeScript, SQL, C/C++, Spring Boot, Node.js, REST APIs, React, Next.js, HTML, CSS, TailwindCSS, PostgreSQL, Supabase, Neon, Redis
Tools: Git, Postman, AWS, Docker, Kubernetes
Built an internal workforce forecasting application using internal AWS full stack integrated components (EC2, DynamoDB, Lambda, AWS Amplify).
Architected a relational database schema on AWS and led migration to SQL Server.`;

/** The real CV, in the shape the scorer consumes. */
const CV = {
  skills: extractSkillTokens(CV_TEXT),
  languages: [
    { language: "English", level: "Fluent" },
    { language: "Spanish", level: "Native" },
    { language: "French", level: "Native C1" },
    { language: "Arabic", level: "Native" },
  ],
  text: CV_TEXT,
  baseLocation: "Madrid",
  level: "junior",
};

function posting(overrides = {}) {
  return {
    title: "Software Engineer",
    locations: ["Madrid, Spain"],
    matchTokens: ["python", "aws", "docker"],
    mustHaveTokens: ["python"],
    level: "junior",
    descriptionText: "",
    ...overrides,
  };
}

test("a posting with no captured tokens is unscored, never zero", () => {
  // Same rule the pay evidence follows: a zero would rank it below a genuine
  // bad match, which is a different and false claim.
  const result = matchPosting(CV, posting({ matchTokens: [], mustHaveTokens: [] }));
  assert.equal(result.score, null);
  assert.equal(result.tier, null);
});

test("a posting squarely in the CV's stack scores strong", () => {
  const result = matchPosting(CV, posting({
    title: "Backend Engineer",
    matchTokens: ["java", "spring", "postgres", "docker", "rest"],
    mustHaveTokens: ["java", "spring", "postgres"],
  }));
  assert.ok(result.score >= TIER_THRESHOLDS.strong, `scored ${result.score}`);
  assert.equal(result.tier, "strong");
  assert.deepEqual(result.missingMustHaves, []);
});

test("a posting whose required skills the CV lacks scores weak", () => {
  const result = matchPosting(CV, posting({
    title: "Staff Machine Learning Engineer",
    matchTokens: ["pytorch", "tensorflow", "jax", "llm", "deeplearning"],
    mustHaveTokens: ["pytorch", "jax", "llm"],
    level: "staff",
  }));
  assert.ok(result.score < TIER_THRESHOLDS.possible, `scored ${result.score}`);
  assert.deepEqual(result.missingMustHaves.sort(), ["jax", "llm", "pytorch"]);
});

test("reaching up several levels is penalised much harder than reaching down", () => {
  const base = { matchTokens: ["python"], mustHaveTokens: ["python"] };
  const up = matchPosting(CV, posting({ ...base, level: "principal" }));
  const down = matchPosting(CV, posting({ ...base, level: "intern" }));
  const exact = matchPosting(CV, posting({ ...base, level: "junior" }));
  assert.ok(up.score < down.score, "a principal role must not beat an intern one");
  assert.ok(exact.score >= down.score);
});

test("a posting naming no required skills leaves that signal unjudged", () => {
  // Google's GTI role gates on a degree and years, not named skills. Claiming
  // "100% of requirements met" there would be an invented finding.
  const result = matchPosting(CV, posting({ mustHaveTokens: [] }));
  const mustHave = result.signals.find((signal) => signal.id === "mustHave");
  assert.equal(mustHave.value, null);
  assert.match(mustHave.detail, /no specific required skills/i);
  // The score still exists, carried by the signals that could be judged.
  assert.ok(typeof result.score === "number");
});

test("fewer judgeable signals widen the band", () => {
  const full = matchPosting(CV, posting({ descriptionText: "Fluent English required." }));
  const sparse = matchPosting(CV, posting({
    mustHaveTokens: [],
    level: "unknown",
    locations: [],
    descriptionText: "",
  }));
  assert.ok(sparse.band > full.band, `${sparse.band} should exceed ${full.band}`);
});

test("location outside Spain scores below the same role in Madrid", () => {
  const madrid = matchPosting(CV, posting({ locations: ["Madrid, Spain"] }));
  const abroad = matchPosting(CV, posting({ locations: ["Seattle, United States"] }));
  assert.ok(abroad.score < madrid.score);
  assert.match(abroad.signals.find((s) => s.id === "location").detail, /Outside Spain/);
});

test("a language the CV has is met, one it lacks is not", () => {
  const met = matchPosting(CV, posting({ descriptionText: "Fluent Spanish and English required." }));
  assert.equal(met.signals.find((s) => s.id === "language").value, 1);

  const noneNamed = matchPosting(CV, posting({ descriptionText: "" }));
  assert.equal(noneNamed.signals.find((s) => s.id === "language").value, null);
});

test("ATS hygiene ignores acronyms for skills the CV does not have", () => {
  // Scoring these down would imply the fix is to add a skill the user lacks,
  // which is the one thing a CV tool must never invite.
  const result = matchPosting(CV, posting({
    matchTokens: ["nlp", "llm"],
    mustHaveTokens: ["nlp", "llm"],
  }));
  const hygiene = result.signals.find((signal) => signal.id === "hygiene");
  assert.equal(hygiene.value, null);
});

test("ATS hygiene flags an acronym the CV spells only one way", () => {
  // The CV writes "AWS" but never "Amazon Web Services".
  const result = matchPosting(CV, posting({
    matchTokens: ["aws"],
    mustHaveTokens: ["aws"],
  }));
  const hygiene = result.signals.find((signal) => signal.id === "hygiene");
  assert.ok(hygiene.value < 1);
  assert.match(hygiene.detail, /Amazon Web Services/);
});

test("gap-to-tier reports how many must-haves would lift the score", () => {
  const result = matchPosting(CV, posting({
    matchTokens: ["python", "pytorch", "jax", "llm"],
    mustHaveTokens: ["python", "pytorch", "jax", "llm"],
  }));
  assert.ok(result.gapToNextTier > 0, "should name a reachable gap");
  assert.ok(result.gapToNextTier <= result.missingMustHaves.length);
});

test("a role already strong reports no gap", () => {
  const result = matchPosting(CV, posting({
    matchTokens: ["java", "spring", "postgres"],
    mustHaveTokens: ["java", "spring"],
  }));
  assert.equal(result.tier, "strong");
  assert.equal(result.gapToNextTier, 0);
});

test("matched and missing together account for every posting token", () => {
  const result = matchPosting(CV, posting({
    matchTokens: ["java", "pytorch", "docker", "jax"],
    mustHaveTokens: ["java"],
  }));
  assert.deepEqual(
    [...result.matched, ...result.missing].sort(),
    ["docker", "java", "jax", "pytorch"],
  );
});

test("tier thresholds are ordered and total", () => {
  assert.equal(matchTier(100), "strong");
  assert.equal(matchTier(TIER_THRESHOLDS.strong), "strong");
  assert.equal(matchTier(TIER_THRESHOLDS.strong - 1), "possible");
  assert.equal(matchTier(TIER_THRESHOLDS.possible), "possible");
  assert.equal(matchTier(TIER_THRESHOLDS.possible - 1), "weak");
  assert.equal(matchTier(0), "weak");
});

test("role family comes from the dominant skill group", () => {
  assert.equal(roleFamily({ title: "", locations: [], matchTokens: ["react", "nextjs", "css"] }), "frontend");
  assert.equal(roleFamily({ title: "", locations: [], matchTokens: ["pytorch", "ml", "nlp"] }), "data");
  assert.equal(roleFamily({ title: "", locations: [], matchTokens: [] }), "general");
});

test("the real Google GTI posting scores against the real CV without throwing", () => {
  // Tokens exactly as the pipeline extracted them from the live posting.
  const result = matchPosting(CV, posting({
    title: "Software Engineer III, GTI",
    matchTokens: ["beam", "c", "cpp", "distributed", "etl", "gcp", "go", "hadoop", "java", "nlp", "python", "security"],
    mustHaveTokens: [],
    level: "mid",
    locations: ["Málaga, Spain"],
  }));
  assert.ok(typeof result.score === "number");
  assert.ok(result.matched.includes("java") && result.matched.includes("python"));
  assert.ok(result.missing.includes("hadoop"));
});
