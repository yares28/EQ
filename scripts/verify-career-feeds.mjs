/**
 * Run fixture-backed provider checks for every free career adapter in the fleet.
 * Netflix also has a live reconciliation script because its Spain endpoint is
 * credential-free and stable enough to treat as a release gate.
 *
 *   node --experimental-strip-types scripts/verify-career-feeds.mjs
 */
import { spawnSync } from "node:child_process";

const FIXTURE_SUITES = [
  "test:amazon-jobs",
  "test:apple-careers",
  "test:google-careers",
  "test:microsoft-careers",
  "test:workday",
  "test:smartrecruiters",
  "test:netflix-careers",
];

const LIVE_SUITES = ["verify:netflix-careers"];

function run(label, script) {
  const result = spawnSync("npm", ["run", script], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    console.error(`\n${label} failed (${script}).`);
    process.exit(result.status ?? 1);
  }
  console.log(`\n${label} passed.`);
}

console.log("Career feed verification — fixture suites");
for (const script of FIXTURE_SUITES) {
  run(script, script);
}

console.log("\nCareer feed verification — live reconciliation");
for (const script of LIVE_SUITES) {
  run(script, script);
}

console.log("\nAll career feed checks passed.");
