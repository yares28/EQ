import assert from "node:assert/strict";
import test from "node:test";

import { isRelevantToSpainSoftware } from "./job-relevance.ts";

test("keeps Spain and EU software IC roles", () => {
  assert.equal(isRelevantToSpainSoftware("Software Engineer III, GTI", ["Málaga, Spain"]), true);
  assert.equal(isRelevantToSpainSoftware("Staff Software Engineer (AI/ML)", ["Málaga, Spain"]), true);
  assert.equal(isRelevantToSpainSoftware("Senior Deep Learning Engineer, Accuracy Evaluation", ["Spain, Remote"]), true);
  assert.equal(isRelevantToSpainSoftware("Data Engineer", ["Madrid, Spain"]), true);
  assert.equal(isRelevantToSpainSoftware("Desarrolladora de software", ["València, Spain"]), true);
  assert.equal(isRelevantToSpainSoftware("Platform Engineer", ["Remote · Worldwide"]), true);
});

test("excludes customer, sales, management, and non-software engineering roles", () => {
  assert.equal(isRelevantToSpainSoftware("Technical Account Manager, Google Cloud", ["Madrid, Spain"]), false);
  assert.equal(isRelevantToSpainSoftware("Customer Engineer, Google Distributed Cloud", ["Madrid, Spain"]), false);
  assert.equal(isRelevantToSpainSoftware("Field Sales Representative, Google Cloud", ["Madrid, Spain"]), false);
  assert.equal(isRelevantToSpainSoftware("Technical Operations Compliance Manager", ["Madrid, Spain"]), false);
  assert.equal(isRelevantToSpainSoftware("Mechanical Engineer", ["Madrid, Spain"]), false);
  assert.equal(isRelevantToSpainSoftware("DCEO Chief Engineer, Data Center Engineering Operations", ["Zaragoza, Spain"]), false);
  assert.equal(isRelevantToSpainSoftware("EMEA Development & Permitting Lead", ["Madrid, Spain"]), false);
});

test("requires an explicit supported geography", () => {
  assert.equal(isRelevantToSpainSoftware("Software Engineer", ["San Francisco, California"]), false);
  assert.equal(isRelevantToSpainSoftware("Software Engineer", ["Valencia, California"]), false);
  assert.equal(isRelevantToSpainSoftware("Software Engineer", ["Remote, United States"]), false);
});
