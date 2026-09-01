import assert from "node:assert/strict";
import test from "node:test";

import { parseCvText } from "./cv-parse.ts";

/**
 * The real text of public/YahyaFaresENG.pdf as a PDF extractor returns it —
 * two-column rows flattened into one line with a run of spaces between the
 * halves. Using the genuine document means the parser is measured against the
 * layout it will actually meet, not one invented to suit it.
 */
const CV = `Yahya Fares
+34 621050150 | yayafaresPRO@gmail.com | linkedin.com/in/yares | github.com/yares28
Education
Universidad Politécnica de Valencia     Valencia, Spain
Bachelor in Computer Engineering     Graduation date – Nov. 2026
Experience
Amazon Operations Intern     Apr 2026 – Present
Amazon     Madrid, Spain
• Designed and shipped an internal automation tool for shift distribution and workforce allocation, eliminating hours of manual coordination per week and materially improving scheduling efficiency.
• Built an internal workforce forecasting application used by HR the labor planning team to predict daily/weekly headcount from site rosters by modeling planned and unplanned absences, improving staffing decisions. Used internal AWS full stack integrated components (EC2, DynamoDB, Lambda, AWS Amplify...).
• Led teams of 40+ associates across multiple operational areas, consistently hitting productivity, safety, and quality targets in a high-volume, KPI-driven environment.
Software Developer Intern     Jul 2021 – Sep 2023
FacStructure     Casablanca, Morocco
• Selected to return for three consecutive summer internships (2021, 2022, 2023) based on consistent delivery and ownership of high-impact projects.
• Architected a relational database schema on AWS and led end-to-end migration from physical archives to SQL Server, improving data retrieval performance and ensuring integrity across tens of thousands of records.
Projects
Trakzi | Next.js, React, Typescript, PostreSQL, Redis, Gemini     www.trakzi.com
• Built an all-in-one personal finance app that lets users import bank statements and receipts to keep their spending data in one place. Just surpassed the milestone of 500+ users.
• Implemented savings and financial planning features, including net worth tracking, goal-oriented insights, and mortgage calculation flows.
UPV-Cal | Next.js, React, TypeScript, Spring Boot, PostgreSQL     www.upvcal.com
• Architected and deployed a full-stack exam scheduling platform used by 1000+ users.
• Designed RESTful backend services with Spring Boot for filtering, persistence, and data export.
Technical Skills
Technologies: Java, Python, JavaScript, TypeScript, SQL, C/C++, Spring Boot, Node.js, REST APIs, React, Next.js, HTML, CSS, TailwindCSS, PostgreSQL, Supabase, Neon, Redis
Tools: Git, Postman, AWS, Docker, Kubernetes
Languages
Languages: English (Fluent), Spanish (Native), French (Native C1), Arabic (Native)
Other Achievements
• Cloud Computing with AWS Certificate (UPV)
• Finalist in Mercadona IT Hackathon`;

test("the name and contact line are recovered", () => {
  const cv = parseCvText(CV);
  assert.equal(cv.name, "Yahya Fares");
  assert.match(cv.contactLine, /yayafaresPRO@gmail\.com/);
});

test("every section heading in the template is found, in order", () => {
  const cv = parseCvText(CV);
  assert.deepEqual(cv.sections.map((section) => section.heading), [
    "Education",
    "Experience",
    "Projects",
    "Technical Skills",
    "Languages",
    "Other Achievements",
  ]);
});

test("experience entries keep their employer, dates and bullets", () => {
  const cv = parseCvText(CV);
  const experience = cv.sections.find((section) => section.heading === "Experience");
  assert.equal(experience.entries.length, 2);

  const amazon = experience.entries[0];
  assert.equal(amazon.title, "Amazon Operations Intern");
  assert.equal(amazon.meta, "Apr 2026 – Present");
  assert.equal(amazon.subtitle, "Amazon");
  assert.equal(amazon.subtitleMeta, "Madrid, Spain");
  assert.equal(amazon.bullets.length, 3);
  assert.match(amazon.bullets[0].text, /^Designed and shipped an internal automation tool/);
});

test("project entries keep their stack line and link", () => {
  const cv = parseCvText(CV);
  const projects = cv.sections.find((section) => section.heading === "Projects");
  assert.equal(projects.entries.length, 2);
  assert.equal(projects.entries[0].title, "Trakzi | Next.js, React, Typescript, PostreSQL, Redis, Gemini");
  assert.equal(projects.entries[0].meta, "www.trakzi.com");
  assert.equal(projects.entries[0].bullets.length, 2);
});

test("skills come from the whole document, not only the skills section", () => {
  const cv = parseCvText(CV);
  // Listed under Technical Skills.
  for (const expected of ["java", "python", "typescript", "postgres", "kubernetes"]) {
    assert.ok(cv.skills.includes(expected), `missing ${expected}`);
  }
  // Only ever mentioned inside an experience bullet — a skills-section-only
  // parser would miss these, and they are real evidence.
  for (const expected of ["dynamodb", "ec2", "sqlserver"]) {
    assert.ok(cv.skills.includes(expected), `missing ${expected}`);
  }
});

test("languages parse into language and level", () => {
  const cv = parseCvText(CV);
  assert.deepEqual(cv.languages, [
    { language: "English", level: "Fluent" },
    { language: "Spanish", level: "Native" },
    { language: "French", level: "Native C1" },
    { language: "Arabic", level: "Native" },
  ]);
});

test("a section whose bullets have no entry above them keeps them", () => {
  const cv = parseCvText(CV);
  const achievements = cv.sections.find((section) => section.heading === "Other Achievements");
  assert.deepEqual(achievements.looseLines, [
    "Cloud Computing with AWS Certificate (UPV)",
    "Finalist in Mercadona IT Hackathon",
  ]);
});

test("education is summarised from its entries", () => {
  const cv = parseCvText(CV);
  assert.equal(cv.education.length, 1);
  assert.match(cv.education[0], /Universidad Politécnica de Valencia/);
});

test("no bullet of the original is lost", () => {
  const cv = parseCvText(CV);
  const kept = [
    ...cv.sections.flatMap((section) => section.entries.flatMap((entry) => entry.bullets.map((b) => b.text))),
    ...cv.sections.flatMap((section) => section.looseLines),
  ].join("\n");
  for (const line of CV.split("\n")) {
    const bullet = line.match(/^\s*•\s+(.*)$/);
    if (bullet === null) continue;
    assert.ok(kept.includes(bullet[1].trim()), `dropped: ${bullet[1].slice(0, 40)}`);
  }
});

test("empty input does not throw", () => {
  const cv = parseCvText("");
  assert.equal(cv.name, "");
  assert.deepEqual(cv.sections, []);
  assert.deepEqual(cv.skills, []);
});
