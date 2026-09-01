import assert from "node:assert/strict";
import test from "node:test";

import {
  boundedDescription,
  DESCRIPTION_STORAGE_LIMIT,
  formatJobDescription,
} from "./job-description-format.ts";

// Real text captured from Apple's own posting (Language Engineer, Arabic /
// Global Siri), via jobs.apple.com — not invented, so the heading heuristic
// is tested against what an actual decoded JD looks like.
const ARABIC_LANGUAGE_ENGINEER = `Summary
The Global Siri team teaches Siri how to understand and speak new languages using machine learning, natural language processing, and modern software development. We work hard to bring the best user experiences and language technologies, powered by Apple Intelligence, to our customers across the world.

The features we build are redefining how hundreds of millions of people across all Siri languages are connected to the information they are looking for and the apps they love to use through various devices. We work in one of the most exciting environments with pioneering ML models applied to production problems. We build state-of-the-art ML technologies that scale to all Siri languages. As part of this group, you will have an opportunity to imagine and build products and features that delight our customers every day, worldwide.

We are looking for an experienced product-minded engineer with a strong Software Engineering and/or Machine Learning background to join our team and shape the future of Siri.
Description
We are responsible for the end-to-end user experiences of Global Siri. As a Language Engineer for Siri in Arabic, your focus will span across all components of our products. Through data-driven analysis, you will identify target areas and build up the technical understanding to create meaningful contributions.

You will partner with teams across Apple to design and structure innovations for global markets that process millions of requests a day. You will implement them, iterating on a solution both independently as well as in a collaborative environment. You will share your expertise and mentor others, while continuously learning from colleagues. Excellent communication skills will be required to convey ideas clearly and coordinate work across multiple teams.
Minimum Qualifications
Native Arabic speaker fluency and awareness of the Arabic culture.
Experienced in applying ML and NLP techniques to deliver products, with a solid understanding of ML concepts.
Strong skills in object-oriented software design and programming, and experience with working on large code bases.
Ability to analyze data and make data-driven decisions to improve user experience for the Arabic market.
Preferred Qualifications
Experience developing, training, and fine-tuning Large Language Models (LLMs), and building scalable workflows leveraging them, in particular targeting specific internationalization challenges.
Experience with multilingual data, machine translation and understanding of the complexities and tradeoffs involved when scaling to non-English languages.
Proficiency in multiple programming languages such as Python, Swift, Rust, Objective-C, C++, or Go.
Product-focused mindset with a strong emphasis on end-user experience.
Excellent interpersonal skills; happy to work in a team as well as independently; can take and give feedback; can iterate on a solution in a collaborative and fast-paced environment.
M.Sc. in Computer Science or related field, or equivalent experience`;

test("real headings are recognised: Summary, Description, Minimum/Preferred Qualifications", () => {
  const blocks = formatJobDescription(ARABIC_LANGUAGE_ENGINEER);
  assert.deepEqual(
    blocks.map((block) => block.heading),
    ["Summary", "Description", "Minimum Qualifications", "Preferred Qualifications"],
  );
});

test("no line of the original text is lost", () => {
  const blocks = formatJobDescription(ARABIC_LANGUAGE_ENGINEER);
  const recovered = blocks.flatMap((block) => block.lines).join(" ");
  // Every non-heading, non-blank source line must appear somewhere in the
  // recovered text — nothing summarized, nothing dropped.
  const originalLines = ARABIC_LANGUAGE_ENGINEER.split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const headingLines = new Set(["Summary", "Description", "Minimum Qualifications", "Preferred Qualifications"]);
  for (const line of originalLines) {
    if (headingLines.has(line)) continue;
    assert.ok(recovered.includes(line), `missing from output: ${line}`);
  }
});

test("a bullet without terminal punctuation is not mistaken for a heading", () => {
  // "Product-focused mindset with a strong emphasis on end-user experience."
  // ends in a period, so it must never be flagged.
  const blocks = formatJobDescription(ARABIC_LANGUAGE_ENGINEER);
  const allLines = blocks.flatMap((block) => block.lines);
  assert.ok(
    allLines.some((line) => line.startsWith("Product-focused mindset")),
  );
});

test("a plain sentence ending in punctuation is never treated as a heading", () => {
  const blocks = formatJobDescription("A short sentence that ends here.\nMore text follows on this line.");
  assert.deepEqual(blocks.map((block) => block.heading), [null]);
});

test("a short capitalised connector-phrase heading is recognised", () => {
  const blocks = formatJobDescription("About the Team\nWe ship things that matter to millions of people.");
  assert.equal(blocks[0].heading, "About the Team");
});

test("a trailing colon on a heading is stripped", () => {
  const blocks = formatJobDescription("Responsibilities:\nOwn the roadmap for the team.");
  assert.equal(blocks[0].heading, "Responsibilities");
});

test("text before the first heading has a null heading", () => {
  const blocks = formatJobDescription("Some intro line here.\nSummary\nThe rest of it.");
  assert.equal(blocks[0].heading, null);
  assert.equal(blocks[1].heading, "Summary");
});

test("boundedDescription caps length and drops empty strings to undefined", () => {
  assert.equal(boundedDescription(""), undefined);
  const short = "a real description";
  assert.equal(boundedDescription(short), short);
  const long = "x".repeat(DESCRIPTION_STORAGE_LIMIT + 500);
  assert.equal(boundedDescription(long)?.length, DESCRIPTION_STORAGE_LIMIT);
});
