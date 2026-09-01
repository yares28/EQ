import assert from "node:assert/strict";
import test from "node:test";

import { parseCvText } from "./cv-parse.ts";
import {
  applyRewrittenBullets,
  diffCvBullets,
  escapeLatex,
  renderCvLatex,
} from "./cv-latex.ts";

const CV = parseCvText(`Yahya Fares
+34 621050150   |   yayafaresPRO@gmail.com   |   linkedin.com/in/yares
Education
Universidad Polit\u00b4 ecnica de Valencia   Valencia, Spain
Bachelor in Computer Engineering   Graduation date – Nov. 2026
Experience
Amazon Operations Intern   Apr 2026 – Present
Amazon   Madrid, Spain
\u2022   Designed and shipped an internal automation tool for shift distribution, eliminating hours
of manual coordination per week.
\u2022   Led teams of 40+ associates, hitting productivity targets.
Projects
Trakzi   |   Next.js, React, Typescript   www.trakzi.com
\u2022   Built an all-in-one personal finance app.
Technical Skills
Technologies : Java, Python, TypeScript
Tools : Git, AWS, Docker`);

test("every LaTeX special character is escaped", () => {
  // Unescaped, the % alone would comment out the rest of the line and the
  // document would silently stop compiling.
  const escaped = escapeLatex("70% growth & $5 cost_basis #1 {a} ~x ^y");
  assert.ok(!/(?<!\\)%/.test(escaped));
  assert.ok(!/(?<!\\)&/.test(escaped));
  assert.ok(!/(?<!\\)\$/.test(escaped));
  assert.ok(!/(?<!\\)_/.test(escaped));
  assert.ok(escaped.includes("\\#"));
  assert.ok(escaped.includes("\\textasciitilde{}"));
  assert.ok(escaped.includes("\\textasciicircum{}"));
});

test("a backslash does not produce a broken command", () => {
  assert.equal(escapeLatex("a\\b"), "a\\textbackslash{}b");
});

test("en dashes become the template's own convention", () => {
  assert.equal(escapeLatex("2021 – 2023"), "2021 -- 2023");
});

test("the rendered document is complete and compilable in shape", () => {
  const tex = renderCvLatex(CV);
  assert.ok(tex.includes("\\documentclass[letterpaper,11pt]{article}"));
  assert.ok(tex.includes("\\begin{document}"));
  assert.ok(tex.trimEnd().endsWith("\\end{document}"));
  // Every macro the body uses must be defined in the preamble, or Overleaf
  // rejects the paste with an undefined-control-sequence error.
  for (const macro of [
    "\\resumeItem",
    "\\resumeSubheading",
    "\\resumeProjectHeading",
    "\\resumeSubHeadingListStart",
    "\\resumeItemListStart",
  ]) {
    assert.ok(tex.includes(`\\newcommand{${macro}}`), `missing definition for ${macro}`);
  }
});

test("braces balance across the whole document", () => {
  const tex = renderCvLatex(CV);
  let depth = 0;
  for (let index = 0; index < tex.length; index += 1) {
    if (tex[index] === "\\") { index += 1; continue; }
    if (tex[index] === "{") depth += 1;
    if (tex[index] === "}") depth -= 1;
    assert.ok(depth >= 0, `unbalanced closing brace at ${index}`);
  }
  assert.equal(depth, 0);
});

test("the name, contacts and every section reach the document", () => {
  const tex = renderCvLatex(CV);
  assert.ok(tex.includes("Yahya Fares"));
  assert.ok(tex.includes("yayafaresPRO@gmail.com"));
  for (const heading of ["Education", "Experience", "Projects", "Technical Skills"]) {
    assert.ok(tex.includes(`\\section{${heading}}`), `missing section ${heading}`);
  }
});

test("every bullet of the original survives into the document", () => {
  const tex = renderCvLatex(CV);
  const bullets = CV.sections.flatMap((section) =>
    section.entries.flatMap((entry) => entry.bullets.map((bullet) => bullet.text)),
  );
  assert.ok(bullets.length >= 3);
  for (const bullet of bullets) {
    assert.ok(tex.includes(escapeLatex(bullet)), `dropped: ${bullet.slice(0, 40)}`);
  }
});

test("a pipe is emitted in math mode, not as bare text", () => {
  // A bare "|" does not render as a pipe in text mode, and the project titles
  // ("Trakzi | Next.js, React") depend on it.
  const tex = renderCvLatex(CV);
  assert.ok(tex.includes("Trakzi $|$ Next.js"));
  assert.ok(!/\{\\textbf\{Trakzi \| /.test(tex));
});

test("an orphan bullet stays a bullet rather than becoming a plain line", () => {
  const cv = parseCvText(`Other Achievements
\u2022   Cloud Computing with AWS Certificate (UPV)
\u2022   Finalist in Mercadona IT Hackathon`);
  const tex = renderCvLatex(cv);
  assert.ok(tex.includes("\\resumeItem{Cloud Computing with AWS Certificate (UPV)}"));
  assert.ok(tex.includes("\\resumeItem{Finalist in Mercadona IT Hackathon}"));
});

test("a labelled skills line uses the compact block, not a bullet", () => {
  const cv = parseCvText(`Technical Skills
Technologies : Java, Python
Tools : Git, AWS`);
  const tex = renderCvLatex(cv);
  assert.ok(tex.includes("\\textbf{Technologies}{: Java, Python}"));
  assert.ok(!tex.includes("\\resumeItem{Technologies"));
});

test("an entry with a subtitle uses the two-row subheading, a project does not", () => {
  const tex = renderCvLatex(CV);
  assert.ok(tex.includes("\\resumeSubheading\n      {Amazon Operations Intern}"));
  assert.ok(tex.includes("\\resumeProjectHeading"));
});

test("a rewrite replaces wording in place and the diff names every change", () => {
  const rewritten = applyRewrittenBullets(CV, [
    { sectionIndex: 1, entryIndex: 0, bulletIndex: 0, text: "Shipped an internal Java automation tool." },
  ]);
  const changes = diffCvBullets(CV, rewritten);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].section, "Experience");
  assert.equal(changes[0].entry, "Amazon Operations Intern");
  assert.match(changes[0].before, /^Designed and shipped/);
  assert.equal(changes[0].after, "Shipped an internal Java automation tool.");
  // Untouched bullets stay untouched.
  assert.equal(
    rewritten.sections[1].entries[0].bullets[1].text,
    CV.sections[1].entries[0].bullets[1].text,
  );
});

test("a rewrite cannot invent a bullet that does not exist", () => {
  // Adding a bullet is how a fabricated job would get in; the shape check is
  // what makes that impossible rather than merely discouraged.
  assert.throws(
    () => applyRewrittenBullets(CV, [
      { sectionIndex: 1, entryIndex: 0, bulletIndex: 99, text: "Led a team of 500." },
    ]),
    /does not exist/,
  );
});

test("an identical rewrite produces no diff", () => {
  assert.deepEqual(diffCvBullets(CV, CV), []);
});

test("rewriting does not mutate the original CV", () => {
  const originalFirst = CV.sections[1].entries[0].bullets[0].text;
  applyRewrittenBullets(CV, [
    { sectionIndex: 1, entryIndex: 0, bulletIndex: 0, text: "Something else entirely." },
  ]);
  assert.equal(CV.sections[1].entries[0].bullets[0].text, originalFirst);
});

test("a bullet containing LaTeX specials round-trips into a valid document", () => {
  const rewritten = applyRewrittenBullets(CV, [
    { sectionIndex: 1, entryIndex: 0, bulletIndex: 0, text: "Cut cost by 70% & saved $5_000 #fast" },
  ]);
  const tex = renderCvLatex(rewritten);
  assert.ok(tex.includes("70\\%"));
  assert.ok(tex.includes("\\&"));
  assert.ok(tex.includes("\\$5\\_000"));
  assert.ok(tex.includes("\\#fast"));
});
