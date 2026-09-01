import assert from "node:assert/strict";
import test from "node:test";

import { extractSkillTokens, skillGroup, skillLabel } from "./skill-taxonomy.ts";

// The Technical Skills block from the CV in public/YahyaFaresENG.pdf, verbatim.
const CV_SKILLS_BLOCK = `Technical Skills
Technologies: Java, Python, JavaScript, TypeScript, SQL, C/C++, Spring Boot, Node.js, REST APIs, React, Next.js,
HTML, CSS, TailwindCSS, PostgreSQL, Supabase, Neon, Redis
Tools: Git, Postman, AWS, Docker, Kubernetes`;

// From Google's own posting, captured in jobPostings.descriptionText.
const GOOGLE_GTI = `Minimum qualifications:
Bachelor's degree or equivalent practical experience.
2 years of experience with software development in one or more programming languages, or 1 year of experience with an advanced degree.
Preferred qualifications:
Master's degree or PhD in Computer Science or related technical fields.
Experience with one or more general purpose programming languages including but not limited to: C/C++, Python, Go, Java.
Experience working with data pipelines (e.g., MapReduce, Apache Beam, Apache Hadoop, Google Dataflow) or Google Cloud Platform.`;

test("the CV's skills block extracts every technology it lists", () => {
  const tokens = extractSkillTokens(CV_SKILLS_BLOCK);
  for (const expected of [
    "java", "python", "javascript", "typescript", "sql", "c", "cpp",
    "spring", "node", "rest", "react", "nextjs", "html", "css", "tailwind",
    "postgres", "supabase", "neon", "redis", "git", "postman", "aws",
    "docker", "kubernetes",
  ]) {
    assert.ok(tokens.includes(expected), `missing ${expected}`);
  }
});

test("java does not match inside javascript", () => {
  assert.deepEqual(extractSkillTokens("JavaScript"), ["javascript"]);
  assert.ok(!extractSkillTokens("JavaScript").includes("java"));
});

test("bare C is found in C/C++ without swallowing the C++", () => {
  const tokens = extractSkillTokens("C/C++");
  assert.ok(tokens.includes("c"));
  assert.ok(tokens.includes("cpp"));
});

test("single-letter and symbol skills are not matched inside longer words", () => {
  // "artifacts" contains "ts"; "processing" contains "c"; neither is a skill here.
  const tokens = extractSkillTokens("We ship artifacts after processing them.");
  assert.ok(!tokens.includes("typescript"));
  assert.ok(!tokens.includes("c"));
});

test("an acronym and its expansion resolve to the same skill", () => {
  assert.deepEqual(extractSkillTokens("Amazon Web Services"), ["aws"]);
  assert.deepEqual(extractSkillTokens("AWS"), ["aws"]);
  assert.deepEqual(extractSkillTokens("K8s"), ["kubernetes"]);
});

test("a longer alias wins over the shorter one it contains", () => {
  // "SQL Server" must not be reported as plain SQL only.
  const tokens = extractSkillTokens("Microsoft SQL Server");
  assert.ok(tokens.includes("sqlserver"));
});

test("Spanish spellings resolve to the same canonical skill", () => {
  assert.deepEqual(extractSkillTokens("aprendizaje automático"), ["ml"]);
  assert.deepEqual(extractSkillTokens("sistemas distribuidos"), ["distributed"]);
});

test("a real Google posting extracts the stack it actually asks for", () => {
  const tokens = extractSkillTokens(GOOGLE_GTI);
  for (const expected of ["cpp", "python", "go", "java", "etl", "beam", "hadoop", "gcp"]) {
    assert.ok(tokens.includes(expected), `missing ${expected}`);
  }
});

test("a skill ending a sentence is still found", () => {
  // Google's posting ends a list with "Go, Java." — treating every dot as part
  // of the token silently dropped that Java.
  assert.ok(extractSkillTokens("C/C++, Python, Go, Java.").includes("java"));
  assert.ok(extractSkillTokens("We use Python.").includes("python"));
});

test("a dot glued to a word still binds the token together", () => {
  // "Node.js" must not register JavaScript via its "js" alias.
  assert.ok(!extractSkillTokens("Node.js").includes("javascript"));
  assert.ok(extractSkillTokens("Node.js").includes("node"));
});

test("an alias split across a line break still matches", () => {
  assert.deepEqual(extractSkillTokens("Amazon Web\nServices"), ["aws"]);
});

test("empty and whitespace input yield no tokens", () => {
  assert.deepEqual(extractSkillTokens(""), []);
  assert.deepEqual(extractSkillTokens("   \n  "), []);
});

test("labels and groups resolve, and unknown ids degrade to the id", () => {
  assert.equal(skillLabel("nextjs"), "Next.js");
  assert.equal(skillGroup("nextjs"), "frontend");
  assert.equal(skillLabel("not-a-skill"), "not-a-skill");
  assert.equal(skillGroup("not-a-skill"), null);
});
