/**
 * Live reconciliation check for the Netflix official career feed.
 *
 * A data-source phase is not done until a complete live run reproduces the
 * counts the plan records, so this script drives the same parser and the same
 * pagination/relevance/detail rules the Convex provider uses and prints the
 * reconciliation summary. It is read-only: it writes nothing to Convex.
 *
 * Netflix's published robots policy explicitly allows `/api/apply` and
 * `/careers`, and the endpoints below are credential-free.
 *
 *   node --experimental-strip-types scripts/verify-netflix-careers.mjs
 */
import {
  isNetflixSoftwareListing,
  normalizeNetflixCareersDetail,
  parseNetflixCareersSearchPage,
} from "../lib/netflix-careers.ts";
import { isRelevantToSpainSoftware } from "../lib/job-relevance.ts";

const SEARCH_URL =
  "https://explore.jobs.netflix.net/api/apply/v2/jobs?domain=netflix.com&location=Spain&sort_by=relevance";
const HEADERS = {
  Accept: "application/json",
  "User-Agent": "EQ salary-intelligence research monitor/1.0",
};
const PAGE_SIZE = 50;
const DETAIL_PACING_MS = 150;

const listings = [];
let expectedTotal;
let start = 0;
let listingComplete = false;

for (let page = 0; page < 50; page += 1) {
  const url = new URL(SEARCH_URL);
  url.searchParams.set("start", String(start));
  url.searchParams.set("num", String(PAGE_SIZE));
  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) throw new Error(`Spain search failed with HTTP ${response.status}.`);
  const parsed = parseNetflixCareersSearchPage(await response.json());
  if (parsed === null) {
    throw new Error("Search page failed to parse; the provider would abort and preserve the last snapshot.");
  }
  expectedTotal ??= parsed.total;
  if (parsed.total !== expectedTotal) throw new Error("Pagination total changed during the run.");
  listings.push(...parsed.jobs);
  if (listings.length >= parsed.total) {
    listingComplete = listings.length === parsed.total;
    break;
  }
  if (parsed.jobs.length === 0) break;
  start += parsed.jobs.length;
}

const externalIds = listings.map((job) => job.externalId);
const canonicalUrls = listings.map((job) => job.canonicalUrl);
const duplicateIdentities =
  new Set(externalIds).size !== externalIds.length ||
  new Set(canonicalUrls).size !== canonicalUrls.length;

console.log(`Netflix-reported Spain total : ${expectedTotal}`);
console.log(`Listings parsed              : ${listings.length}`);
console.log(`Listing enumeration complete : ${listingComplete}`);
console.log(`Duplicate identities         : ${duplicateIdentities}`);
console.log("\nSpain listings");
for (const job of listings) {
  console.log(`  [${job.externalId}] ${job.title} — ${job.locations.join(" / ")} (${job.department ?? "no department"})`);
}

const relevant = listings.filter(
  (job) => isNetflixSoftwareListing(job) && isRelevantToSpainSoftware(job.title, job.locations),
);
console.log(`\nRelevant software IC roles   : ${relevant.length}`);

const postings = [];
let detailFailures = 0;
for (const listing of relevant) {
  const url = new URL(`https://explore.jobs.netflix.net/api/apply/v2/jobs/${listing.externalId}`);
  url.searchParams.set("domain", "netflix.com");
  const response = await fetch(url, { headers: HEADERS });
  const posting = response.ok ? normalizeNetflixCareersDetail(await response.json(), listing) : null;
  if (posting === null) detailFailures += 1;
  else postings.push(posting);
  await new Promise((resolve) => setTimeout(resolve, DETAIL_PACING_MS));
}

console.log(`Detail failures              : ${detailFailures}`);
console.log(`Complete postings            : ${postings.length}`);
console.log(
  `dataComplete                 : ${listingComplete && detailFailures === 0 && postings.length === relevant.length}`,
);

/*
 * Netflix computes the board-wide location facet independently of our
 * pagination, so it is a second, non-derived check on Spain completeness.
 */
const facetResponse = await fetch(`${SEARCH_URL}&start=0&num=1`, { headers: HEADERS });
const locationFacets = (await facetResponse.json())?.facets?.locations ?? {};
const spainFacets = Object.entries(locationFacets).filter(([name]) => /(?:^|,\s*)Spain$/.test(name));
console.log(`\nNetflix Spain location facet : ${JSON.stringify(spainFacets)}`);
