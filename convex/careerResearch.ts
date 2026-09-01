import { v } from "convex/values";
import { internalAction, type ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { extractCompanyPostedSalaryText } from "../lib/company-posted-salary";
import { parseAmazonJobsPage } from "../lib/amazon-jobs";
import {
  isAppleSoftwareListing,
  parseAppleCareersDetail,
  parseAppleCareersSearchPage,
  type AppleCareersListingData,
} from "../lib/apple-careers";
import {
  normalizeMicrosoftCareersDetail,
  parseMicrosoftCareersSearchPage,
  type MicrosoftCareersListingData,
} from "../lib/microsoft-careers";
import {
  isNetflixSoftwareListing,
  normalizeNetflixCareersDetail,
  parseNetflixCareersSearchPage,
  type NetflixCareersListingData,
} from "../lib/netflix-careers";
import {
  parseGoogleCareersPage,
  type GoogleCareersPostingData,
} from "../lib/google-careers";
import { isRelevantToSpainSoftware } from "../lib/job-relevance";
import {
  findWorkdayCountryFacetId,
  normalizeWorkdayPostingDetail,
  parseWorkdayListingPage,
} from "../lib/workday-postings";
import {
  assessSmartRecruitersBoardListing,
  normalizeSmartRecruitersPosting,
  smartRecruitersLocation,
} from "../lib/smartrecruiters-postings";

type Provider = "greenhouse" | "lever" | "ashby" | "smartrecruiters" | "google_careers" | "workday" | "amazon_jobs" | "microsoft_careers" | "apple_careers" | "netflix_careers";
type Region = "global" | "eu";

interface CareerBoard {
  provider: Provider;
  boardKey: string;
  region?: Region;
  publicUrl: string;
  discoveryMethod: "verified_board_name" | "exact_slug_probe";
  confidence: "high" | "medium";
  discoveredAt: number;
}

interface CompanyTarget {
  companyId: Id<"companies">;
  canonicalName: string;
  slug: string;
  careerBoard?: CareerBoard;
}

interface NormalizedPosting {
  externalId: string;
  title: string;
  locations: string[];
  canonicalUrl: string;
  salaryText?: string;
  requirements: string[];
  descriptionText: string;
  relevantToSpainSoftware: boolean;
}

interface BoardPayload {
  sourceUrl: string;
  rawPayload: unknown;
  postings: NormalizedPosting[];
  seenExternalIds: string[];
  listingComplete: boolean;
  dataComplete: boolean;
  httpStatus: number;
}

class ProviderFetchError extends Error {
  constructor(
    message: string,
    readonly httpStatus?: number,
  ) {
    super(message);
  }
}

const SOURCE_KEYS: Record<Provider, string> = {
  greenhouse: "greenhouse-job-board",
  lever: "lever-postings",
  ashby: "ashby-job-postings",
  smartrecruiters: "smartrecruiters-posting-api",
  google_careers: "google-careers-public-jobs",
  workday: "workday-public-jobs",
  amazon_jobs: "amazon-jobs-public-search",
  microsoft_careers: "microsoft-careers-public-search",
  apple_careers: "apple-careers-public-search",
  netflix_careers: "netflix-careers-public-search",
};

const WORKDAY_BOARDS = {
  "nvidia/NVIDIAExternalCareerSite": {
    host: "nvidia.wd5.myworkdayjobs.com",
    tenant: "nvidia",
    site: "NVIDIAExternalCareerSite",
  },
} as const;

const MAX_ATS_RESPONSE_CHARACTERS = 20_000_000;
const RAW_SNAPSHOT_TARGET_CHARACTERS = 450_000;
const MAX_DESCRIPTION_CHARACTERS = 80_000;

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : "Unknown career-feed error.";
}

function candidateBoardKeys(companyName: string, slug: string): string[] {
  const withoutSuffix = companyName.replace(
    /\b(incorporated|inc|corporation|corp|limited|ltd|plc|llc|group|holdings|technologies|technology)\b\.?/gi,
    " ",
  );
  const compactOriginal = withoutSuffix.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]/g, "");
  const compact = slug.replace(/-/g, "");
  const strippedSlug = withoutSuffix.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return [...new Set([slug, strippedSlug, compact, compactOriginal])]
    .filter((key) => /^[A-Za-z0-9-]{2,64}$/.test(key))
    .slice(0, 4);
}

function identityKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(incorporated|inc|corporation|corp|limited|ltd|plc|llc|group|holdings)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function identityMatches(companyName: string, boardName: string): boolean {
  const company = identityKey(companyName);
  const board = identityKey(boardName);
  return company.length >= 3 && board.length >= 3 &&
    (company === board || company.includes(board) || board.includes(company));
}

async function fetchJson(
  url: string,
  { maxCharacters = 5_000_000, timeoutMs = 12_000 }: { maxCharacters?: number; timeoutMs?: number } = {},
): Promise<{ status: number; ok: boolean; data: unknown }> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "EQ salary-intelligence research monitor/1.0",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > maxCharacters) {
    throw new ProviderFetchError("Career feed exceeded the response-size limit.", response.status);
  }
  const body = await response.text();
  if (body.length > maxCharacters) {
    throw new ProviderFetchError("Career feed exceeded the response-size limit.", response.status);
  }
  if (!response.ok) return { status: response.status, ok: false, data: null };
  try {
    return { status: response.status, ok: true, data: JSON.parse(body) as unknown };
  } catch {
    throw new ProviderFetchError("Career feed returned invalid JSON.", response.status);
  }
}

async function fetchText(
  url: string,
  { maxCharacters = 5_000_000, timeoutMs = 20_000 }: { maxCharacters?: number; timeoutMs?: number } = {},
): Promise<{ status: number; ok: boolean; data: string }> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "text/html",
      "Accept-Language": "en-US,en;q=0.8",
      "User-Agent": "EQ salary-intelligence research monitor/1.0",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > maxCharacters) {
    throw new ProviderFetchError("Career page exceeded the response-size limit.", response.status);
  }
  const body = await response.text();
  if (body.length > maxCharacters) {
    throw new ProviderFetchError("Career page exceeded the response-size limit.", response.status);
  }
  return { status: response.status, ok: response.ok, data: body };
}

async function fetchJsonPost(
  url: string,
  body: unknown,
  { maxCharacters = 5_000_000, timeoutMs = 20_000 }: { maxCharacters?: number; timeoutMs?: number } = {},
): Promise<{ status: number; ok: boolean; data: unknown }> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "EQ salary-intelligence research monitor/1.0",
    },
    body: JSON.stringify(body),
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > maxCharacters) {
    throw new ProviderFetchError("Career feed exceeded the response-size limit.", response.status);
  }
  const responseBody = await response.text();
  if (responseBody.length > maxCharacters) {
    throw new ProviderFetchError("Career feed exceeded the response-size limit.", response.status);
  }
  if (!response.ok) return { status: response.status, ok: false, data: null };
  try {
    return { status: response.status, ok: true, data: JSON.parse(responseBody) as unknown };
  } catch {
    throw new ProviderFetchError("Career feed returned invalid JSON.", response.status);
  }
}

async function openMicrosoftCareersSession(publicUrl: string): Promise<string> {
  const response = await fetch(publicUrl, {
    method: "GET",
    headers: {
      Accept: "text/html",
      "Accept-Language": "en-US,en;q=0.8",
      "User-Agent": "EQ salary-intelligence research monitor/1.0",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(25_000),
  });
  const body = await response.text();
  if (!response.ok || body.length > 2_000_000) {
    throw new ProviderFetchError("Microsoft Careers session request failed.", response.status);
  }
  const setCookie = response.headers.get("set-cookie") ?? "";
  const cookies = ["_vs", "_vscid"].flatMap((name) => {
    const match = new RegExp(`(?:^|,\\s*)${name}=([^;]+)`).exec(setCookie);
    return match?.[1] ? [`${name}=${match[1]}`] : [];
  });
  if (cookies.length !== 2) {
    throw new ProviderFetchError("Microsoft Careers did not establish the expected public session.", response.status);
  }
  return cookies.join("; ");
}

async function fetchMicrosoftCareersJson(
  url: string,
  cookie: string,
  maxCharacters = 5_000_000,
): Promise<{ status: number; ok: boolean; data: unknown }> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Accept-Language": "en-US,en;q=0.8",
      Cookie: cookie,
      Referer: "https://apply.careers.microsoft.com/careers?location=Spain",
      "User-Agent": "EQ salary-intelligence research monitor/1.0",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(25_000),
  });
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > maxCharacters) {
    throw new ProviderFetchError("Microsoft Careers response exceeded the size limit.", response.status);
  }
  const body = await response.text();
  if (body.length > maxCharacters) {
    throw new ProviderFetchError("Microsoft Careers response exceeded the size limit.", response.status);
  }
  if (!response.ok) return { status: response.status, ok: false, data: null };
  try {
    return { status: response.status, ok: true, data: JSON.parse(body) as unknown };
  } catch {
    throw new ProviderFetchError("Microsoft Careers returned invalid JSON.", response.status);
  }
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function decodeHtml(value: string): string {
  const decodeEntities = (input: string) => input
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
  const decoded = decodeEntities(decodeEntities(value));
  return decoded
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function extractRequirements(description: string): string[] {
  const lines = description.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const heading = /^(requirements?|qualifications?|what you(?:'|’)ll bring|what we(?:'|’)re looking for|requisitos?|perfil|must haves?)\s*:?[\s—-]*$/i;
  const otherHeading = /^[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ &'’/+-]{2,50}:?$/;
  const start = lines.findIndex((line) => heading.test(line));
  if (start < 0) return [];
  const values: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (values.length > 0 && otherHeading.test(line) && !/^[-•]/.test(line)) break;
    const cleaned = line.replace(/^[-•*·]\s*/, "").trim();
    if (cleaned.length >= 4 && cleaned.length <= 240) values.push(cleaned);
    if (values.length >= 30) break;
  }
  return [...new Set(values)];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asSalaryAmount(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return String(value);
  return asString(value);
}

function boundedText(value: string, maxCharacters: number): string {
  return value.length <= maxCharacters ? value : value.slice(0, maxCharacters);
}

async function paceWrites(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.flatMap((value) => value ? [value] : []))];
}

async function discoverBoard(company: CompanyTarget): Promise<CareerBoard | null> {
  if (company.slug === "apple" && identityKey(company.canonicalName) === "apple") {
    return {
      provider: "apple_careers",
      boardKey: "apple",
      publicUrl: "https://jobs.apple.com/en-us/search?location=spain-ESPC",
      discoveryMethod: "verified_board_name",
      confidence: "high",
      discoveredAt: Date.now(),
    };
  }
  if (company.slug === "amazon" && identityKey(company.canonicalName) === "amazon") {
    return {
      provider: "amazon_jobs",
      boardKey: "amazon",
      publicUrl: "https://www.amazon.jobs/en/search?country%5B%5D=ESP&category%5B%5D=software-development",
      discoveryMethod: "verified_board_name",
      confidence: "high",
      discoveredAt: Date.now(),
    };
  }
  if (company.slug === "google" && identityKey(company.canonicalName) === "google") {
    return {
      provider: "google_careers",
      boardKey: "google",
      publicUrl: "https://www.google.com/about/careers/applications/jobs/results?location=Spain",
      discoveryMethod: "verified_board_name",
      confidence: "high",
      discoveredAt: Date.now(),
    };
  }
  if (company.slug === "nvidia" && identityKey(company.canonicalName) === "nvidia") {
    return {
      provider: "workday",
      boardKey: "nvidia/NVIDIAExternalCareerSite",
      publicUrl: "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite",
      discoveryMethod: "verified_board_name",
      confidence: "high",
      discoveredAt: Date.now(),
    };
  }
  if (company.slug === "microsoft" && identityKey(company.canonicalName) === "microsoft") {
    return {
      provider: "microsoft_careers",
      boardKey: "microsoft",
      publicUrl: "https://apply.careers.microsoft.com/careers?location=Spain&filter_include_remote=0&filter_include_relocation=0",
      discoveryMethod: "verified_board_name",
      confidence: "high",
      discoveredAt: Date.now(),
    };
  }
  if (company.slug === "netflix" && identityKey(company.canonicalName) === "netflix") {
    return {
      provider: "netflix_careers",
      boardKey: "netflix",
      publicUrl: "https://explore.jobs.netflix.net/careers?location=Spain",
      discoveryMethod: "verified_board_name",
      confidence: "high",
      discoveredAt: Date.now(),
    };
  }
  const candidates = candidateBoardKeys(company.canonicalName, company.slug);
  let transientFailures = 0;

  for (const key of candidates) {
    try {
      const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(key)}`;
      const response = await fetchJson(url, { maxCharacters: 500_000, timeoutMs: 8_000 });
      const board = asRecord(response.data);
      const boardName = asString(board?.name);
      if (response.ok && boardName && identityMatches(company.canonicalName, boardName)) {
        return {
          provider: "greenhouse",
          boardKey: key,
          publicUrl: `https://boards.greenhouse.io/${encodeURIComponent(key)}`,
          discoveryMethod: "verified_board_name",
          confidence: "high",
          discoveredAt: Date.now(),
        };
      }
    } catch {
      transientFailures += 1;
    }
  }

  for (const key of candidates) {
    try {
      const url = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(key)}/postings?limit=100&offset=0&destination=PUBLIC`;
      const response = await fetchJson(url, { maxCharacters: 5_000_000, timeoutMs: 12_000 });
      const assessment = response.ok
        ? assessSmartRecruitersBoardListing(response.data, key, company.canonicalName)
        : { accepted: false as const };
      if (assessment.accepted) {
        return {
          provider: "smartrecruiters",
          boardKey: key,
          publicUrl: `https://careers.smartrecruiters.com/${encodeURIComponent(key)}`,
          discoveryMethod: "verified_board_name",
          confidence: "high",
          discoveredAt: Date.now(),
        };
      }
    } catch {
      transientFailures += 1;
    }
  }

  for (const key of candidates) {
    try {
      const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(key)}?includeCompensation=true`;
      const response = await fetchJson(url, {
        maxCharacters: MAX_ATS_RESPONSE_CHARACTERS,
        timeoutMs: 20_000,
      });
      const payload = asRecord(response.data);
      if (response.ok && payload?.apiVersion === "1" && Array.isArray(payload.jobs)) {
        return {
          provider: "ashby",
          boardKey: key,
          publicUrl: `https://jobs.ashbyhq.com/${encodeURIComponent(key)}`,
          discoveryMethod: "exact_slug_probe",
          confidence: "medium",
          discoveredAt: Date.now(),
        };
      }
    } catch {
      transientFailures += 1;
    }
  }

  for (const region of ["global", "eu"] as const) {
    const host = region === "eu" ? "api.eu.lever.co" : "api.lever.co";
    const publicHost = region === "eu" ? "jobs.eu.lever.co" : "jobs.lever.co";
    for (const key of candidates) {
      try {
        const url = `https://${host}/v0/postings/${encodeURIComponent(key)}?mode=json&limit=1`;
        const response = await fetchJson(url, { maxCharacters: 1_000_000, timeoutMs: 8_000 });
        if (response.ok && Array.isArray(response.data)) {
          return {
            provider: "lever",
            boardKey: key,
            region,
            publicUrl: `https://${publicHost}/${encodeURIComponent(key)}`,
            discoveryMethod: "exact_slug_probe",
            confidence: "medium",
            discoveredAt: Date.now(),
          };
        }
      } catch {
        transientFailures += 1;
      }
    }
  }

  if (transientFailures >= candidates.length * 2) {
    throw new ProviderFetchError("Career-board discovery was interrupted by provider errors.");
  }
  return null;
}

function normalizeGreenhouse(payload: unknown): NormalizedPosting[] {
  const jobs = asRecord(payload)?.jobs;
  if (!Array.isArray(jobs)) throw new ProviderFetchError("Greenhouse response is missing jobs.", 200);
  return jobs.flatMap((raw): NormalizedPosting[] => {
    const job = asRecord(raw);
    if (job === null) return [];
    const id = typeof job?.id === "number" || typeof job?.id === "string" ? String(job.id) : undefined;
    const title = asString(job?.title);
    const url = asString(job?.absolute_url);
    if (!id || !title || !url) return [];
    const location = asString(asRecord(job.location)?.name);
    const descriptionText = boundedText(
      decodeHtml(asString(job.content) ?? ""),
      MAX_DESCRIPTION_CHARACTERS,
    );
    const locations = uniqueStrings([location]);
    return [{
      externalId: id,
      title,
      locations,
      canonicalUrl: url,
      salaryText: extractCompanyPostedSalaryText(descriptionText),
      requirements: extractRequirements(descriptionText),
      descriptionText,
      relevantToSpainSoftware: isRelevantToSpainSoftware(title, locations),
    }];
  });
}

function normalizeLever(pages: unknown[]): NormalizedPosting[] {
  const rawJobs = pages.flatMap((page) => Array.isArray(page) ? page : []);
  return rawJobs.flatMap((raw): NormalizedPosting[] => {
    const job = asRecord(raw);
    if (job === null) return [];
    const id = asString(job?.id);
    const title = asString(job?.text);
    const url = asString(job?.hostedUrl);
    if (!id || !title || !url) return [];
    const categories = asRecord(job.categories);
    const allLocations = Array.isArray(categories?.allLocations)
      ? categories.allLocations.flatMap((value) => asString(value) ?? [])
      : [];
    const locations = uniqueStrings([asString(categories?.location), ...allLocations]);
    const fullDescriptionText = boundedText(
      asString(job.descriptionPlain) ?? decodeHtml(asString(job.description) ?? ""),
      MAX_DESCRIPTION_CHARACTERS,
    );
    const lists = Array.isArray(job.lists) ? job.lists : [];
    const listedRequirements = lists.flatMap((rawList): string[] => {
      const list = asRecord(rawList);
      const heading = asString(list?.text) ?? "";
      if (!/(requirements?|qualifications?|what you(?:'|’)ll bring|must haves?|requisitos?)/i.test(heading)) return [];
      return decodeHtml(asString(list?.content) ?? "").split(/\n+/).filter(Boolean);
    });
    const salaryRange = asRecord(job.salaryRange);
    const structuredCurrency = asString(salaryRange?.currency);
    const structuredMinimum = asSalaryAmount(salaryRange?.min);
    const structuredMaximum = asSalaryAmount(salaryRange?.max);
    const structuredInterval = asString(salaryRange?.interval);
    const structuredSalary = structuredCurrency && structuredMinimum && structuredMaximum && structuredInterval
      ? `${structuredCurrency} ${structuredMinimum}–${structuredMaximum} per ${structuredInterval}`
      : undefined;
    const relevantToSpainSoftware = isRelevantToSpainSoftware(title, locations);
    return [{
      externalId: id,
      title,
      locations,
      canonicalUrl: url,
      salaryText: relevantToSpainSoftware
        ? asString(job.salaryDescriptionPlain) ?? structuredSalary ?? extractCompanyPostedSalaryText(fullDescriptionText)
        : undefined,
      requirements: relevantToSpainSoftware
        ? [...new Set(listedRequirements.length > 0 ? listedRequirements : extractRequirements(fullDescriptionText))].slice(0, 30)
        : [],
      descriptionText: relevantToSpainSoftware ? fullDescriptionText : "",
      relevantToSpainSoftware,
    }];
  });
}

function normalizeAshby(payload: unknown): NormalizedPosting[] {
  const jobs = asRecord(payload)?.jobs;
  if (!Array.isArray(jobs)) throw new ProviderFetchError("Ashby response is missing jobs.", 200);
  return jobs.flatMap((raw): NormalizedPosting[] => {
    const job = asRecord(raw);
    if (job === null) return [];
    if (job?.isListed === false) return [];
    const title = asString(job?.title);
    const url = asString(job?.jobUrl);
    if (!title || !url) return [];
    const secondary = Array.isArray(job.secondaryLocations)
      ? job.secondaryLocations.flatMap((location) => asString(asRecord(location)?.location) ?? [])
      : [];
    const locations = uniqueStrings([asString(job.location), ...secondary]);
    const fullDescriptionText = boundedText(
      asString(job.descriptionPlain) ?? decodeHtml(asString(job.descriptionHtml) ?? ""),
      MAX_DESCRIPTION_CHARACTERS,
    );
    const compensation = asRecord(job.compensation);
    const externalId = url.split("?")[0].replace(/\/$/, "").split("/").at(-1) ?? url;
    const relevantToSpainSoftware = isRelevantToSpainSoftware(title, locations);
    return [{
      externalId,
      title,
      locations,
      canonicalUrl: url,
      salaryText: relevantToSpainSoftware
        ? asString(compensation?.scrapeableCompensationSalarySummary) ??
          asString(compensation?.compensationTierSummary) ??
          extractCompanyPostedSalaryText(fullDescriptionText)
        : undefined,
      requirements: relevantToSpainSoftware ? extractRequirements(fullDescriptionText) : [],
      descriptionText: relevantToSpainSoftware ? fullDescriptionText : "",
      relevantToSpainSoftware,
    }];
  });
}

function boardSourceUrl(board: CareerBoard): string {
  if (board.provider === "apple_careers") {
    if (board.boardKey !== "apple") {
      throw new ProviderFetchError("Apple Jobs board identity changed unexpectedly.");
    }
    return "https://jobs.apple.com/en-us/search?location=spain-ESPC";
  }
  if (board.provider === "microsoft_careers") {
    if (board.boardKey !== "microsoft") {
      throw new ProviderFetchError("Microsoft Careers board identity changed unexpectedly.");
    }
    return "https://apply.careers.microsoft.com/api/pcsx/search?domain=microsoft.com&query=&location=Spain&start=0&sort_by=distance&filter_include_remote=0&filter_include_relocation=0";
  }
  if (board.provider === "netflix_careers") {
    if (board.boardKey !== "netflix") {
      throw new ProviderFetchError("Netflix Jobs board identity changed unexpectedly.");
    }
    return "https://explore.jobs.netflix.net/api/apply/v2/jobs?domain=netflix.com&location=Spain&start=0&num=50&sort_by=relevance";
  }
  if (board.provider === "amazon_jobs") {
    if (board.boardKey !== "amazon") {
      throw new ProviderFetchError("Amazon Jobs board identity changed unexpectedly.");
    }
    return "https://www.amazon.jobs/en/search.json?normalized_country_code%5B%5D=ESP&category%5B%5D=software-development&sort=recent";
  }
  if (board.provider === "google_careers") {
    return "https://www.google.com/about/careers/applications/jobs/results?location=Spain";
  }
  if (board.provider === "workday") {
    const config = WORKDAY_BOARDS[board.boardKey as keyof typeof WORKDAY_BOARDS];
    if (config === undefined) {
      throw new ProviderFetchError("Workday board is not on the exact-host allowlist.");
    }
    return `https://${config.host}/wday/cxs/${config.tenant}/${config.site}/jobs`;
  }
  if (board.provider === "greenhouse") {
    return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board.boardKey)}/jobs`;
  }
  if (board.provider === "ashby") {
    return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board.boardKey)}?includeCompensation=true`;
  }
  if (board.provider === "smartrecruiters") {
    return `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(board.boardKey)}/postings?limit=100&destination=PUBLIC`;
  }
  const host = board.region === "eu" ? "api.eu.lever.co" : "api.lever.co";
  return `https://${host}/v0/postings/${encodeURIComponent(board.boardKey)}?mode=json`;
}

function splitRawItems(
  kind: string,
  items: unknown[],
  metadata: Record<string, unknown> = {},
): unknown[] {
  for (const item of items) {
    if (JSON.stringify(item).length > RAW_SNAPSHOT_TARGET_CHARACTERS) {
      throw new ProviderFetchError("A single career-feed record exceeded the snapshot-size limit.");
    }
  }

  const itemKey = (item: unknown): string => {
    const record = asRecord(item);
    if (record === null) return JSON.stringify(item);
    const nestedDetail = asRecord(record.detail);
    return [
      record.id,
      record.id_icims,
      record.displayJobId,
      record.externalId,
      record.externalPath,
      record.jobUrl,
      record.hostedUrl,
      record.absolute_url,
      record.title,
      record.name,
      record.text,
    ]
      .flatMap((value) => typeof value === "string" || typeof value === "number" ? [String(value)] : [])
      .concat(nestedDetail ? [String(nestedDetail.id ?? nestedDetail.jobUrl ?? "")] : [])
      .find(Boolean) ?? JSON.stringify(item);
  };
  const bucketFor = (value: string, bucketCount: number): number => {
    let hash = 2_166_136_261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16_777_619);
    }
    return (hash >>> 0) % bucketCount;
  };

  for (let bucketCount = 16; bucketCount <= 512; bucketCount *= 2) {
    const buckets = Array.from({ length: bucketCount }, () => [] as unknown[]);
    for (const item of items) buckets[bucketFor(itemKey(item), bucketCount)].push(item);
    const chunks = buckets.flatMap((bucket, bucketIndex) => {
      if (bucket.length === 0 && items.length > 0) return [];
      const orderedItems = [...bucket].sort((left, right) => itemKey(left).localeCompare(itemKey(right)));
      return [{ kind, metadata, bucketIndex, bucketCount, items: orderedItems }];
    });
    if (chunks.every((chunk) => JSON.stringify(chunk).length <= RAW_SNAPSHOT_TARGET_CHARACTERS)) {
      return chunks.length > 0
        ? chunks
        : [{ kind, metadata, bucketIndex: 0, bucketCount: 1, items: [] }];
    }
  }
  throw new ProviderFetchError("Career-feed records could not be split into safe snapshot buckets.");
}

/**
 * Convex documents are capped at 1 MiB. Preserve the full provider payload as
 * immutable, reconstructable chunks with substantial headroom for document
 * metadata and UTF-8 expansion.
 */
function rawSnapshotChunks(payload: unknown): unknown[] {
  const record = asRecord(payload);
  if (record === null) {
    return Array.isArray(payload) ? splitRawItems("array", payload) : [payload];
  }

  if (Array.isArray(record.pages)) {
    return splitRawItems(
      "lever-postings",
      record.pages.flatMap((page) => Array.isArray(page) ? page : []),
    );
  }

  if (Array.isArray(record.smartRecruitersPages)) {
    const listingItems = record.smartRecruitersPages.flatMap((page) => {
      const content = asRecord(page)?.content;
      return Array.isArray(content) ? content : [];
    });
    const firstPage = asRecord(record.smartRecruitersPages[0]);
    const listingChunks = splitRawItems("smartrecruiters-listing", listingItems, {
      totalFound: firstPage?.totalFound ?? listingItems.length,
    });
    const details = Array.isArray(record.relevantJobDetails) ? record.relevantJobDetails : [];
    return [
      ...listingChunks,
      ...splitRawItems("smartrecruiters-relevant-details", details),
    ];
  }

  if (Array.isArray(record.googleCareersPages)) {
    const jobs = record.googleCareersPages.flatMap((page) => {
      const rawJobs = asRecord(page)?.jobs;
      return Array.isArray(rawJobs) ? rawJobs : [];
    });
    const firstPage = asRecord(record.googleCareersPages[0]);
    return splitRawItems("google-careers-spain", jobs, {
      total: firstPage?.total ?? jobs.length,
      pageSize: firstPage?.pageSize,
    });
  }

  if (Array.isArray(record.amazonJobsPages)) {
    const jobs = record.amazonJobsPages.flatMap((page) => {
      const rawJobs = asRecord(page)?.jobs;
      return Array.isArray(rawJobs) ? rawJobs : [];
    });
    const firstPage = asRecord(record.amazonJobsPages[0]);
    return splitRawItems("amazon-jobs-spain-software", jobs, {
      total: firstPage?.hits ?? jobs.length,
      countryCode: "ESP",
      category: "software-development",
    });
  }

  if (Array.isArray(record.microsoftCareersPages)) {
    const jobs = record.microsoftCareersPages.flatMap((page) => {
      const positions = asRecord(page)?.positions;
      return Array.isArray(positions) ? positions : [];
    });
    const details = Array.isArray(record.microsoftCareersDetails) ? record.microsoftCareersDetails : [];
    return [
      ...splitRawItems("microsoft-careers-spain", jobs, {
        total: record.microsoftCareersTotal ?? jobs.length,
        includeRemote: false,
        includeRelocation: false,
      }),
      ...splitRawItems("microsoft-careers-relevant-details", details),
    ];
  }

  if (Array.isArray(record.appleCareersPages)) {
    const jobs = record.appleCareersPages.flatMap((page) => {
      const results = asRecord(page)?.searchResults;
      return Array.isArray(results) ? results : [];
    });
    const details = Array.isArray(record.appleCareersDetails) ? record.appleCareersDetails : [];
    return [
      ...splitRawItems("apple-jobs-spain", jobs, {
        total: record.appleCareersTotal ?? jobs.length,
        locationFilter: "spain-ESPC",
      }),
      ...splitRawItems("apple-jobs-relevant-details", details),
    ];
  }

  if (record.workdayFacetDiscovery !== undefined && Array.isArray(record.workdayPages)) {
    const discovery = asRecord(record.workdayFacetDiscovery);
    if (discovery === null) {
      throw new ProviderFetchError("Workday facet discovery snapshot was malformed.");
    }
    const discoveryJobs = Array.isArray(discovery.jobPostings) ? discovery.jobPostings : [];
    const discoveryMetadata = Object.fromEntries(
      Object.entries(discovery).filter(([key]) => key !== "jobPostings"),
    );
    const listingItems = record.workdayPages.flatMap((page) => {
      const jobs = asRecord(page)?.jobPostings;
      return Array.isArray(jobs) ? jobs : [];
    });
    const details = Array.isArray(record.workdayDetails) ? record.workdayDetails : [];
    return [
      ...splitRawItems("workday-facet-discovery", discoveryJobs, discoveryMetadata),
      ...splitRawItems("workday-spain-listing", listingItems, {
        total: record.workdayTotal,
        countryFacetId: record.workdayCountryFacetId,
      }),
      ...splitRawItems("workday-spain-details", details),
    ];
  }

  const listing = asRecord(record.listing);
  if (listing !== null && Array.isArray(listing.jobs)) {
    const listingMetadata = Object.fromEntries(
      Object.entries(listing).filter(([key]) => key !== "jobs"),
    );
    const listingChunks = splitRawItems("greenhouse-listing", listing.jobs, listingMetadata);
    const details = Array.isArray(record.relevantJobDetails) ? record.relevantJobDetails : [];
    return [
      ...listingChunks,
      ...splitRawItems("greenhouse-relevant-details", details),
    ];
  }

  if (Array.isArray(record.jobs)) {
    const metadata = Object.fromEntries(
      Object.entries(record).filter(([key]) => key !== "jobs"),
    );
    return splitRawItems("ashby-postings", record.jobs, metadata);
  }
  return [payload];
}

async function fetchGreenhouseBoard(
  board: CareerBoard,
  sourceUrl: string,
): Promise<BoardPayload> {
  const listing = await fetchJson(sourceUrl, {
    maxCharacters: MAX_ATS_RESPONSE_CHARACTERS,
    timeoutMs: 20_000,
  });
  if (!listing.ok) throw new ProviderFetchError("Greenhouse feed request failed.", listing.status);
  const normalizedListing = normalizeGreenhouse(listing.data);
  const rawJobs = asRecord(listing.data)?.jobs;
  if (!Array.isArray(rawJobs)) throw new ProviderFetchError("Greenhouse response is missing jobs.", 200);

  const relevantIds = new Set(
    normalizedListing
      .filter((posting) => posting.relevantToSpainSoftware)
      .map((posting) => posting.externalId),
  );
  const detailById = new Map<string, Record<string, unknown>>();
  const detailFailures = new Set<string>();
  const relevantRawJobs = rawJobs.flatMap((raw) => {
    const job = asRecord(raw);
    const id = typeof job?.id === "number" || typeof job?.id === "string" ? String(job.id) : undefined;
    return id && relevantIds.has(id) ? [{ id, job }] : [];
  });

  for (let index = 0; index < relevantRawJobs.length; index += 8) {
    const batch = relevantRawJobs.slice(index, index + 8);
    await Promise.all(batch.map(async ({ id }) => {
      try {
        const detailUrl = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board.boardKey)}/jobs/${encodeURIComponent(id)}`;
        const detail = await fetchJson(detailUrl, { maxCharacters: 1_000_000, timeoutMs: 12_000 });
        const record = asRecord(detail.data);
        if (!detail.ok || record === null) {
          detailFailures.add(id);
          return;
        }
        detailById.set(id, record);
      } catch {
        detailFailures.add(id);
      }
    }));
  }

  const enrichedJobs = rawJobs.flatMap((raw) => {
    const job = asRecord(raw);
    const id = typeof job?.id === "number" || typeof job?.id === "string" ? String(job.id) : undefined;
    if (!id) return [raw];
    if (detailFailures.has(id)) return [];
    const detail = detailById.get(id);
    return [{ ...job, ...detail }];
  });
  const relevantJobDetails = [...detailById.entries()].map(([id, detail]) => ({ id, detail }));
  return {
    sourceUrl,
    rawPayload: { listing: listing.data, relevantJobDetails },
    postings: normalizeGreenhouse({ jobs: enrichedJobs }),
    seenExternalIds: normalizedListing.map((posting) => posting.externalId),
    listingComplete: true,
    dataComplete: detailFailures.size === 0,
    httpStatus: listing.status,
  };
}

async function fetchSmartRecruitersBoard(
  board: CareerBoard,
  sourceUrl: string,
  canonicalCompanyName: string,
): Promise<BoardPayload> {
  const pages: unknown[] = [];
  const listingItems: unknown[] = [];
  let complete = false;
  let status = 200;
  let totalFound = 0;

  for (let page = 0; page < 50; page += 1) {
    const response = await fetchJson(`${sourceUrl}&offset=${page * 100}`, {
      maxCharacters: 5_000_000,
      timeoutMs: 20_000,
    });
    status = response.status;
    if (!response.ok) {
      throw new ProviderFetchError("SmartRecruiters feed request failed.", response.status);
    }
    const payload = asRecord(response.data);
    const content = payload?.content;
    const reportedTotal = payload?.totalFound;
    if (!Array.isArray(content) || typeof reportedTotal !== "number" || reportedTotal < 0) {
      throw new ProviderFetchError("SmartRecruiters returned an invalid posting list.", response.status);
    }
    pages.push(response.data);
    listingItems.push(...content);
    totalFound = reportedTotal;
    if (listingItems.length >= totalFound || content.length < 100) {
      complete = true;
      break;
    }
  }

  const listingRecords = listingItems.flatMap((raw) => {
    const posting = asRecord(raw);
    const id = typeof posting?.id === "number" || typeof posting?.id === "string"
      ? String(posting.id)
      : undefined;
    const title = asString(posting?.name);
    const companyIdentity = asRecord(posting?.company);
    const identifier = asString(companyIdentity?.identifier);
    const companyName = asString(companyIdentity?.name);
    if (!id || !title || !identifier || !companyName) return [];
    if (
      identityKey(identifier) !== identityKey(board.boardKey) ||
      !identityMatches(canonicalCompanyName, companyName)
    ) {
      throw new ProviderFetchError("SmartRecruiters company identity changed unexpectedly.", status);
    }
    const locations = smartRecruitersLocation(posting?.location);
    return [{ id, title, locations }];
  });
  const listingComplete = complete && listingRecords.length === listingItems.length;
  const relevant = listingRecords.filter((posting) =>
    isRelevantToSpainSoftware(posting.title, posting.locations),
  );
  const detailById = new Map<string, Record<string, unknown>>();
  const detailFailures = new Set<string>();

  for (let index = 0; index < relevant.length; index += 8) {
    const batch = relevant.slice(index, index + 8);
    await Promise.all(batch.map(async ({ id }) => {
      try {
        const detailUrl = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(board.boardKey)}/postings/${encodeURIComponent(id)}`;
        const response = await fetchJson(detailUrl, { maxCharacters: 1_000_000, timeoutMs: 12_000 });
        const detail = asRecord(response.data);
        if (!response.ok || detail === null) {
          detailFailures.add(id);
          return;
        }
        detailById.set(id, detail);
      } catch {
        detailFailures.add(id);
      }
    }));
    if (index + 8 < relevant.length) await paceWrites(100);
  }

  const postings = [...detailById.values()].flatMap((raw): NormalizedPosting[] => {
    const posting = normalizeSmartRecruitersPosting(raw);
    if (posting === null) return [];
    if (
      identityKey(posting.companyIdentifier) !== identityKey(board.boardKey) ||
      !identityMatches(canonicalCompanyName, posting.companyName)
    ) {
      throw new ProviderFetchError("SmartRecruiters posting identity did not match its board.", status);
    }
    const descriptionText = boundedText(posting.descriptionText, MAX_DESCRIPTION_CHARACTERS);
    const relevantToSpainSoftware = isRelevantToSpainSoftware(posting.title, posting.locations);
    return [{
      externalId: posting.externalId,
      title: posting.title,
      locations: posting.locations,
      canonicalUrl: posting.canonicalUrl,
      salaryText: relevantToSpainSoftware
        ? posting.salaryText ?? extractCompanyPostedSalaryText(descriptionText)
        : undefined,
      requirements: relevantToSpainSoftware ? extractRequirements(descriptionText) : [],
      descriptionText: relevantToSpainSoftware ? descriptionText : "",
      relevantToSpainSoftware,
    }];
  });
  if (postings.length !== detailById.size) {
    for (const item of relevant) {
      if (!postings.some((posting) => posting.externalId === item.id)) detailFailures.add(item.id);
    }
  }

  return {
    sourceUrl,
    rawPayload: {
      smartRecruitersPages: pages,
      relevantJobDetails: [...detailById.entries()].map(([id, detail]) => ({ id, detail })),
    },
    postings,
    seenExternalIds: listingRecords.map((posting) => posting.id),
    listingComplete,
    dataComplete: listingComplete && detailFailures.size === 0,
    httpStatus: status,
  };
}

async function fetchGoogleCareersBoard(sourceUrl: string): Promise<BoardPayload> {
  const rawPages: Array<{ page: number; total: number; pageSize: number; jobs: unknown[] }> = [];
  const normalized: GoogleCareersPostingData[] = [];
  let expectedTotal: number | undefined;
  let expectedPageSize: number | undefined;
  let status = 200;
  let complete = false;

  for (let page = 1; page <= 50; page += 1) {
    const pageUrl = page === 1 ? sourceUrl : `${sourceUrl}&page=${page}`;
    const response = await fetchText(pageUrl, {
      maxCharacters: 5_000_000,
      timeoutMs: 25_000,
    });
    status = response.status;
    if (!response.ok) throw new ProviderFetchError("Google Careers request failed.", response.status);
    const parsed = parseGoogleCareersPage(response.data);
    if (parsed === null) {
      throw new ProviderFetchError("Google Careers returned an unrecognized result payload.", response.status);
    }
    expectedTotal ??= parsed.total;
    expectedPageSize ??= parsed.pageSize;
    if (parsed.total !== expectedTotal || parsed.pageSize !== expectedPageSize) {
      throw new ProviderFetchError("Google Careers pagination metadata changed during the refresh.", response.status);
    }
    rawPages.push({ page, total: parsed.total, pageSize: parsed.pageSize, jobs: parsed.rawJobs });
    normalized.push(...parsed.jobs);
    if (normalized.length >= parsed.total) {
      complete = normalized.length === parsed.total;
      break;
    }
    if (parsed.jobs.length !== parsed.pageSize) break;
  }

  const ids = normalized.map((posting) => posting.externalId);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
    throw new ProviderFetchError("Google Careers returned duplicate job identifiers.", status);
  }
  const postings = normalized.map((posting): NormalizedPosting => {
    const descriptionText = boundedText(posting.descriptionText, MAX_DESCRIPTION_CHARACTERS);
    const relevantToSpainSoftware = isRelevantToSpainSoftware(posting.title, posting.locations);
    return {
      externalId: posting.externalId,
      title: posting.title,
      locations: posting.locations,
      canonicalUrl: posting.canonicalUrl,
      salaryText: relevantToSpainSoftware ? posting.salaryText : undefined,
      requirements: relevantToSpainSoftware ? extractRequirements(descriptionText) : [],
      descriptionText: relevantToSpainSoftware ? descriptionText : "",
      relevantToSpainSoftware,
    };
  });

  return {
    sourceUrl,
    rawPayload: { googleCareersPages: rawPages },
    postings,
    seenExternalIds: ids,
    listingComplete: complete,
    dataComplete: complete,
    httpStatus: status,
  };
}

async function fetchAppleCareersBoard(
  board: CareerBoard,
  sourceUrl: string,
  canonicalCompanyName: string,
): Promise<BoardPayload> {
  if (board.boardKey !== "apple" || identityKey(canonicalCompanyName) !== "apple") {
    throw new ProviderFetchError("Apple Jobs company identity changed unexpectedly.");
  }
  const rawPages: Array<{ page: number; total: number; searchResults: unknown[] }> = [];
  const listingRecords: AppleCareersListingData[] = [];
  let expectedTotal: number | undefined;
  let status = 200;
  let listingComplete = false;

  for (let page = 1; page <= 50; page += 1) {
    const pageUrl = page === 1 ? sourceUrl : `${sourceUrl}&page=${page}`;
    const response = await fetchText(pageUrl, {
      maxCharacters: 4_000_000,
      timeoutMs: 25_000,
    });
    status = response.status;
    if (!response.ok) {
      throw new ProviderFetchError("Apple Jobs Spain search request failed.", response.status);
    }
    const parsed = parseAppleCareersSearchPage(response.data);
    if (parsed === null || parsed.page !== page) {
      throw new ProviderFetchError("Apple Jobs returned an invalid Spain result page.", response.status);
    }
    expectedTotal ??= parsed.total;
    if (parsed.total !== expectedTotal) {
      throw new ProviderFetchError("Apple Jobs pagination total changed during the refresh.", response.status);
    }
    rawPages.push({ page, total: parsed.total, searchResults: parsed.rawJobs });
    listingRecords.push(...parsed.jobs);
    if (listingRecords.length >= parsed.total) {
      listingComplete = listingRecords.length === parsed.total;
      break;
    }
    if (parsed.jobs.length === 0) break;
  }

  const listingIds = listingRecords.map((posting) => posting.externalId);
  const listingUrls = listingRecords.map((posting) => posting.canonicalUrl);
  if (new Set(listingIds).size !== listingIds.length || new Set(listingUrls).size !== listingUrls.length) {
    throw new ProviderFetchError("Apple Jobs returned duplicate Spain job identities.", status);
  }

  const relevant = listingRecords.filter(isAppleSoftwareListing);
  const details = new Map<string, { rawHtml: string; posting: NonNullable<ReturnType<typeof parseAppleCareersDetail>> }>();
  const detailFailures = new Set<string>();
  for (let index = 0; index < relevant.length; index += 4) {
    const batch = relevant.slice(index, index + 4);
    await Promise.all(batch.map(async (listing) => {
      try {
        const response = await fetchText(listing.canonicalUrl, {
          maxCharacters: 2_000_000,
          timeoutMs: 25_000,
        });
        const posting = response.ok ? parseAppleCareersDetail(response.data, listing) : null;
        if (posting === null || !identityMatches(canonicalCompanyName, posting.companyName)) {
          detailFailures.add(listing.externalId);
        } else {
          details.set(listing.externalId, { rawHtml: response.data, posting });
        }
      } catch {
        detailFailures.add(listing.externalId);
      }
    }));
    if (index + 4 < relevant.length) await paceWrites(150);
  }

  const postings = [...details.values()].map(({ posting }): NormalizedPosting => {
    const descriptionText = boundedText(posting.descriptionText, MAX_DESCRIPTION_CHARACTERS);
    return {
      externalId: posting.externalId,
      title: posting.title,
      locations: posting.locations,
      canonicalUrl: posting.canonicalUrl,
      salaryText: extractCompanyPostedSalaryText(descriptionText),
      requirements: extractRequirements(descriptionText),
      descriptionText,
      relevantToSpainSoftware: true,
    };
  });

  return {
    sourceUrl,
    rawPayload: {
      appleCareersTotal: expectedTotal ?? 0,
      appleCareersPages: rawPages,
      appleCareersDetails: [...details.entries()].map(([externalId, detail]) => ({
        externalId,
        html: detail.rawHtml,
      })),
    },
    postings,
    seenExternalIds: listingIds,
    listingComplete,
    dataComplete: listingComplete && detailFailures.size === 0 && postings.length === relevant.length,
    httpStatus: status,
  };
}

async function fetchMicrosoftCareersBoard(
  board: CareerBoard,
  sourceUrl: string,
  canonicalCompanyName: string,
): Promise<BoardPayload> {
  if (board.boardKey !== "microsoft" || identityKey(canonicalCompanyName) !== "microsoft") {
    throw new ProviderFetchError("Microsoft Careers company identity changed unexpectedly.");
  }
  const cookie = await openMicrosoftCareersSession(board.publicUrl);
  const rawPages: Array<{ start: number; count: number; positions: unknown[] }> = [];
  const listingRecords: MicrosoftCareersListingData[] = [];
  let expectedTotal: number | undefined;
  let status = 200;
  let listingComplete = false;
  let start = 0;

  for (let page = 0; page < 50; page += 1) {
    const pageUrl = new URL(sourceUrl);
    pageUrl.searchParams.set("start", String(start));
    const response = await fetchMicrosoftCareersJson(pageUrl.toString(), cookie, 5_000_000);
    status = response.status;
    if (!response.ok) {
      throw new ProviderFetchError("Microsoft Careers Spain search request failed.", response.status);
    }
    const parsed = parseMicrosoftCareersSearchPage(response.data);
    if (parsed === null) {
      throw new ProviderFetchError("Microsoft Careers returned an invalid Spain result page.", response.status);
    }
    expectedTotal ??= parsed.total;
    if (parsed.total !== expectedTotal) {
      throw new ProviderFetchError("Microsoft Careers pagination total changed during the refresh.", response.status);
    }
    rawPages.push({ start, count: parsed.total, positions: parsed.rawJobs });
    listingRecords.push(...parsed.jobs);
    if (listingRecords.length >= parsed.total) {
      listingComplete = listingRecords.length === parsed.total;
      break;
    }
    if (parsed.jobs.length === 0) break;
    start += parsed.jobs.length;
  }

  const listingIds = listingRecords.map((posting) => posting.externalId);
  const listingUrls = listingRecords.map((posting) => posting.canonicalUrl);
  if (new Set(listingIds).size !== listingIds.length || new Set(listingUrls).size !== listingUrls.length) {
    throw new ProviderFetchError("Microsoft Careers returned duplicate Spain job identities.", status);
  }

  const relevant = listingRecords.filter((posting) =>
    isRelevantToSpainSoftware(posting.title, posting.locations),
  );
  const details = new Map<string, { raw: unknown; posting: NonNullable<ReturnType<typeof normalizeMicrosoftCareersDetail>> }>();
  const detailFailures = new Set<string>();
  for (const listing of relevant) {
    try {
      const detailUrl = new URL("https://apply.careers.microsoft.com/api/pcsx/position_details");
      detailUrl.searchParams.set("position_id", listing.externalId);
      detailUrl.searchParams.set("domain", "microsoft.com");
      detailUrl.searchParams.set("hl", "en");
      detailUrl.searchParams.set("queried_location", "Spain");
      const response = await fetchMicrosoftCareersJson(detailUrl.toString(), cookie, 2_000_000);
      const posting = response.ok ? normalizeMicrosoftCareersDetail(response.data, listing) : null;
      if (posting === null || !identityMatches(canonicalCompanyName, posting.companyName)) {
        detailFailures.add(listing.externalId);
      } else {
        details.set(listing.externalId, { raw: response.data, posting });
      }
    } catch {
      detailFailures.add(listing.externalId);
    }
    await paceWrites(150);
  }

  // Every Spain listing is stored, not only the software-IC ones: the relevance
  // flag decides what enters pay comparisons, and must not decide whether the
  // company appears to be hiring in Spain at all. Full detail is still fetched
  // only for relevant roles, so the request cost is unchanged.
  const detailByExternalId = new Map(
    [...details.values()].map(({ posting }) => [posting.externalId, posting]),
  );
  const postings = listingRecords.map((listing): NormalizedPosting => {
    const detail = detailByExternalId.get(listing.externalId);
    const descriptionText = detail
      ? boundedText(detail.descriptionText, MAX_DESCRIPTION_CHARACTERS)
      : "";
    return {
      externalId: listing.externalId,
      title: detail?.title ?? listing.title,
      locations: detail?.locations ?? listing.locations,
      canonicalUrl: detail?.canonicalUrl ?? listing.canonicalUrl,
      salaryText: detail ? extractCompanyPostedSalaryText(descriptionText) : undefined,
      requirements: detail ? extractRequirements(descriptionText) : [],
      descriptionText,
      relevantToSpainSoftware: detail !== undefined,
    };
  });

  return {
    sourceUrl,
    rawPayload: {
      microsoftCareersTotal: expectedTotal ?? 0,
      microsoftCareersPages: rawPages,
      microsoftCareersDetails: [...details.entries()].map(([externalId, detail]) => ({
        externalId,
        detail: detail.raw,
      })),
    },
    postings,
    seenExternalIds: listingIds,
    listingComplete,
    dataComplete:
      listingComplete &&
      detailFailures.size === 0 &&
      detailByExternalId.size === relevant.length,
    httpStatus: status,
  };
}

async function fetchNetflixCareersBoard(
  board: CareerBoard,
  sourceUrl: string,
  canonicalCompanyName: string,
): Promise<BoardPayload> {
  if (board.boardKey !== "netflix" || identityKey(canonicalCompanyName) !== "netflix") {
    throw new ProviderFetchError("Netflix Jobs company identity changed unexpectedly.");
  }
  const pageSize = 50;
  const rawPages: Array<{ start: number; count: number; positions: unknown[] }> = [];
  const listingRecords: NetflixCareersListingData[] = [];
  let expectedTotal: number | undefined;
  let status = 200;
  let listingComplete = false;
  let start = 0;

  for (let page = 0; page < 50; page += 1) {
    const pageUrl = new URL(sourceUrl);
    pageUrl.searchParams.set("start", String(start));
    pageUrl.searchParams.set("num", String(pageSize));
    const response = await fetchJson(pageUrl.toString(), { maxCharacters: 5_000_000, timeoutMs: 25_000 });
    status = response.status;
    if (!response.ok) {
      throw new ProviderFetchError("Netflix Jobs Spain search request failed.", response.status);
    }
    const parsed = parseNetflixCareersSearchPage(response.data);
    if (parsed === null) {
      throw new ProviderFetchError("Netflix Jobs returned an invalid Spain result page.", response.status);
    }
    expectedTotal ??= parsed.total;
    if (parsed.total !== expectedTotal) {
      throw new ProviderFetchError("Netflix Jobs pagination total changed during the refresh.", response.status);
    }
    rawPages.push({ start, count: parsed.total, positions: parsed.rawJobs });
    listingRecords.push(...parsed.jobs);
    if (listingRecords.length >= parsed.total) {
      listingComplete = listingRecords.length === parsed.total;
      break;
    }
    if (parsed.jobs.length === 0) break;
    start += parsed.jobs.length;
  }

  const listingIds = listingRecords.map((posting) => posting.externalId);
  const listingUrls = listingRecords.map((posting) => posting.canonicalUrl);
  if (new Set(listingIds).size !== listingIds.length || new Set(listingUrls).size !== listingUrls.length) {
    throw new ProviderFetchError("Netflix Jobs returned duplicate Spain job identities.", status);
  }

  const relevant = listingRecords.filter((posting) =>
    isNetflixSoftwareListing(posting) && isRelevantToSpainSoftware(posting.title, posting.locations),
  );
  const details = new Map<string, { raw: unknown; posting: NonNullable<ReturnType<typeof normalizeNetflixCareersDetail>> }>();
  const detailFailures = new Set<string>();
  for (const listing of relevant) {
    try {
      const detailUrl = new URL(
        `https://explore.jobs.netflix.net/api/apply/v2/jobs/${listing.externalId}`,
      );
      detailUrl.searchParams.set("domain", "netflix.com");
      const response = await fetchJson(detailUrl.toString(), { maxCharacters: 2_000_000, timeoutMs: 20_000 });
      const posting = response.ok ? normalizeNetflixCareersDetail(response.data, listing) : null;
      if (posting === null || !identityMatches(canonicalCompanyName, posting.companyName)) {
        detailFailures.add(listing.externalId);
      } else {
        details.set(listing.externalId, { raw: response.data, posting });
      }
    } catch {
      detailFailures.add(listing.externalId);
    }
    await paceWrites(150);
  }

  // Same rule as the other providers: keep every Spain listing, and let the
  // relevance flag decide only what may enter a pay comparison.
  const detailByExternalId = new Map(
    [...details.values()].map(({ posting }) => [posting.externalId, posting]),
  );
  const postings = listingRecords.map((listing): NormalizedPosting => {
    const detail = detailByExternalId.get(listing.externalId);
    const descriptionText = detail
      ? boundedText(detail.descriptionText, MAX_DESCRIPTION_CHARACTERS)
      : "";
    return {
      externalId: listing.externalId,
      title: detail?.title ?? listing.title,
      locations: detail?.locations ?? listing.locations,
      canonicalUrl: detail?.canonicalUrl ?? listing.canonicalUrl,
      salaryText: detail ? extractCompanyPostedSalaryText(descriptionText) : undefined,
      requirements: detail ? extractRequirements(descriptionText) : [],
      descriptionText,
      relevantToSpainSoftware: detail !== undefined,
    };
  });

  return {
    sourceUrl,
    rawPayload: {
      netflixCareersTotal: expectedTotal ?? 0,
      netflixCareersPages: rawPages,
      netflixCareersDetails: [...details.entries()].map(([externalId, detail]) => ({
        externalId,
        detail: detail.raw,
      })),
    },
    postings,
    seenExternalIds: listingIds,
    listingComplete,
    dataComplete:
      listingComplete &&
      detailFailures.size === 0 &&
      detailByExternalId.size === relevant.length,
    httpStatus: status,
  };
}

async function fetchAmazonJobsBoard(
  board: CareerBoard,
  sourceUrl: string,
  canonicalCompanyName: string,
): Promise<BoardPayload> {
  if (board.boardKey !== "amazon") {
    throw new ProviderFetchError("Amazon Jobs board identity changed unexpectedly.");
  }
  const rawPages: unknown[] = [];
  const normalizedJobs: NonNullable<ReturnType<typeof parseAmazonJobsPage>>["jobs"] = [];
  let expectedTotal: number | undefined;
  let status = 200;
  let complete = false;

  for (let page = 0; page < 50; page += 1) {
    const response = await fetchJson(`${sourceUrl}&offset=${page * 50}&result_limit=50`, {
      maxCharacters: 12_000_000,
      timeoutMs: 25_000,
    });
    status = response.status;
    if (!response.ok) {
      throw new ProviderFetchError("Amazon Jobs Spain search request failed.", response.status);
    }
    const parsed = parseAmazonJobsPage(response.data);
    if (parsed === null) {
      throw new ProviderFetchError("Amazon Jobs returned an invalid Spain result page.", response.status);
    }
    expectedTotal ??= parsed.total;
    if (parsed.total !== expectedTotal) {
      throw new ProviderFetchError("Amazon Jobs pagination total changed during the refresh.", response.status);
    }
    rawPages.push(response.data);
    normalizedJobs.push(...parsed.jobs);
    if (normalizedJobs.length >= parsed.total) {
      complete = normalizedJobs.length === parsed.total;
      break;
    }
    if (parsed.jobs.length !== 50) break;
  }

  const ids = normalizedJobs.map((job) => job.externalId);
  const urls = normalizedJobs.map((job) => job.canonicalUrl);
  if (new Set(ids).size !== ids.length || new Set(urls).size !== urls.length) {
    throw new ProviderFetchError("Amazon Jobs returned duplicate Spain job identities.", status);
  }
  const postings = normalizedJobs.map((job): NormalizedPosting => {
    if (!identityMatches(canonicalCompanyName, job.companyName)) {
      throw new ProviderFetchError("Amazon Jobs company identity changed unexpectedly.", status);
    }
    const url = new URL(job.canonicalUrl);
    if (url.hostname !== "www.amazon.jobs" || !url.pathname.startsWith(`/en/jobs/${job.externalId}/`)) {
      throw new ProviderFetchError("Amazon Jobs canonical URL changed unexpectedly.", status);
    }
    const descriptionText = boundedText(job.descriptionText, MAX_DESCRIPTION_CHARACTERS);
    const relevantToSpainSoftware = isRelevantToSpainSoftware(job.title, job.locations);
    return {
      externalId: job.externalId,
      title: job.title,
      locations: job.locations,
      canonicalUrl: job.canonicalUrl,
      salaryText: relevantToSpainSoftware ? extractCompanyPostedSalaryText(descriptionText) : undefined,
      requirements: relevantToSpainSoftware ? extractRequirements(descriptionText) : [],
      descriptionText: relevantToSpainSoftware ? descriptionText : "",
      relevantToSpainSoftware,
    };
  });
  return {
    sourceUrl,
    rawPayload: { amazonJobsPages: rawPages },
    postings,
    seenExternalIds: ids,
    listingComplete: complete,
    dataComplete: complete,
    httpStatus: status,
  };
}

async function fetchWorkdayBoard(
  board: CareerBoard,
  sourceUrl: string,
  canonicalCompanyName: string,
): Promise<BoardPayload> {
  const config = WORKDAY_BOARDS[board.boardKey as keyof typeof WORKDAY_BOARDS];
  if (config === undefined) {
    throw new ProviderFetchError("Workday board is not on the exact-host allowlist.");
  }
  const emptyFilter = { appliedFacets: {}, limit: 20, offset: 0, searchText: "" };
  const discovery = await fetchJsonPost(sourceUrl, emptyFilter, {
    maxCharacters: 5_000_000,
    timeoutMs: 25_000,
  });
  if (!discovery.ok) {
    throw new ProviderFetchError("Workday facet discovery request failed.", discovery.status);
  }
  if (parseWorkdayListingPage(discovery.data) === null) {
    throw new ProviderFetchError("Workday facet discovery returned an invalid listing.", discovery.status);
  }
  const countryFacetId = findWorkdayCountryFacetId(discovery.data, "Spain");
  if (countryFacetId === null) {
    throw new ProviderFetchError("Workday did not return one exact Spain country facet.", discovery.status);
  }

  const rawPages: unknown[] = [];
  const listingRecords: Array<{ externalId: string; title: string; externalPath: string }> = [];
  let expectedTotal: number | undefined;
  let status = discovery.status;
  let listingComplete = false;
  for (let page = 0; page < 50; page += 1) {
    const response = await fetchJsonPost(sourceUrl, {
      appliedFacets: { locationHierarchy1: [countryFacetId] },
      limit: 20,
      offset: page * 20,
      searchText: "",
    }, {
      maxCharacters: 5_000_000,
      timeoutMs: 25_000,
    });
    status = response.status;
    if (!response.ok) {
      throw new ProviderFetchError("Workday Spain listing request failed.", response.status);
    }
    const parsed = parseWorkdayListingPage(response.data);
    if (parsed === null) {
      throw new ProviderFetchError("Workday returned an invalid Spain listing.", response.status);
    }
    expectedTotal ??= parsed.total;
    if (parsed.total !== expectedTotal) {
      throw new ProviderFetchError("Workday pagination total changed during the refresh.", response.status);
    }
    rawPages.push(response.data);
    listingRecords.push(...parsed.postings);
    if (listingRecords.length >= parsed.total) {
      listingComplete = listingRecords.length === parsed.total;
      break;
    }
    if (parsed.postings.length !== 20) break;
  }

  const listingIds = listingRecords.map((posting) => posting.externalId);
  const listingPaths = listingRecords.map((posting) => posting.externalPath);
  if (new Set(listingIds).size !== listingIds.length || new Set(listingPaths).size !== listingPaths.length) {
    throw new ProviderFetchError("Workday returned duplicate Spain job identities.", status);
  }

  const details = new Map<string, { raw: unknown; posting: NonNullable<ReturnType<typeof normalizeWorkdayPostingDetail>> }>();
  const detailFailures = new Set<string>();
  const detailBaseUrl = `https://${config.host}/wday/cxs/${config.tenant}/${config.site}`;
  for (let index = 0; index < listingRecords.length; index += 8) {
    const batch = listingRecords.slice(index, index + 8);
    await Promise.all(batch.map(async (listing) => {
      try {
        const response = await fetchJson(`${detailBaseUrl}${listing.externalPath}`, {
          maxCharacters: 2_000_000,
          timeoutMs: 20_000,
        });
        const posting = response.ok ? normalizeWorkdayPostingDetail(response.data) : null;
        if (posting === null || posting.externalId !== listing.externalId || posting.title !== listing.title) {
          detailFailures.add(listing.externalId);
          return;
        }
        const url = new URL(posting.canonicalUrl);
        if (
          url.hostname !== config.host ||
          !identityMatches(canonicalCompanyName, posting.companyName) ||
          !posting.locations.some((location) => /\b(?:spain|españa)\b/i.test(location))
        ) {
          detailFailures.add(listing.externalId);
          return;
        }
        details.set(listing.externalId, { raw: response.data, posting });
      } catch {
        detailFailures.add(listing.externalId);
      }
    }));
    if (index + 8 < listingRecords.length) await paceWrites(100);
  }

  const postings = [...details.values()].map(({ posting }): NormalizedPosting => {
    const descriptionText = boundedText(posting.descriptionText, MAX_DESCRIPTION_CHARACTERS);
    const relevantToSpainSoftware = isRelevantToSpainSoftware(posting.title, posting.locations);
    return {
      externalId: posting.externalId,
      title: posting.title,
      locations: posting.locations,
      canonicalUrl: posting.canonicalUrl,
      salaryText: relevantToSpainSoftware ? extractCompanyPostedSalaryText(descriptionText) : undefined,
      requirements: relevantToSpainSoftware ? extractRequirements(descriptionText) : [],
      descriptionText: relevantToSpainSoftware ? descriptionText : "",
      relevantToSpainSoftware,
    };
  });

  return {
    sourceUrl,
    rawPayload: {
      workdayFacetDiscovery: discovery.data,
      workdayCountryFacetId: countryFacetId,
      workdayTotal: expectedTotal ?? 0,
      workdayPages: rawPages,
      workdayDetails: [...details.entries()].map(([externalId, detail]) => ({
        externalId,
        detail: detail.raw,
      })),
    },
    postings,
    seenExternalIds: listingIds,
    listingComplete,
    dataComplete: listingComplete && detailFailures.size === 0 && postings.length === listingRecords.length,
    httpStatus: status,
  };
}

async function fetchBoard(board: CareerBoard, canonicalCompanyName: string): Promise<BoardPayload> {
  const sourceUrl = boardSourceUrl(board);
  if (board.provider === "apple_careers") {
    return await fetchAppleCareersBoard(board, sourceUrl, canonicalCompanyName);
  }
  if (board.provider === "microsoft_careers") {
    return await fetchMicrosoftCareersBoard(board, sourceUrl, canonicalCompanyName);
  }
  if (board.provider === "netflix_careers") {
    return await fetchNetflixCareersBoard(board, sourceUrl, canonicalCompanyName);
  }
  if (board.provider === "google_careers") {
    return await fetchGoogleCareersBoard(sourceUrl);
  }
  if (board.provider === "amazon_jobs") {
    return await fetchAmazonJobsBoard(board, sourceUrl, canonicalCompanyName);
  }
  if (board.provider === "greenhouse") {
    return await fetchGreenhouseBoard(board, sourceUrl);
  }
  if (board.provider === "smartrecruiters") {
    return await fetchSmartRecruitersBoard(board, sourceUrl, canonicalCompanyName);
  }
  if (board.provider === "workday") {
    return await fetchWorkdayBoard(board, sourceUrl, canonicalCompanyName);
  }
  if (board.provider === "lever") {
    const pages: unknown[] = [];
    let complete = false;
    let status = 200;
    for (let page = 0; page < 50; page += 1) {
      const separator = sourceUrl.includes("?") ? "&" : "?";
      const response = await fetchJson(`${sourceUrl}${separator}skip=${page * 100}&limit=100`);
      status = response.status;
      if (!response.ok) throw new ProviderFetchError("Lever feed request failed.", response.status);
      if (!Array.isArray(response.data)) throw new ProviderFetchError("Lever returned an invalid job list.", response.status);
      pages.push(response.data);
      if (response.data.length < 100) {
        complete = true;
        break;
      }
    }
    const postings = normalizeLever(pages);
    return {
      sourceUrl,
      rawPayload: { pages },
      postings,
      seenExternalIds: postings.map((posting) => posting.externalId),
      listingComplete: complete,
      dataComplete: complete,
      httpStatus: status,
    };
  }

  const response = await fetchJson(sourceUrl, {
    maxCharacters: MAX_ATS_RESPONSE_CHARACTERS,
    timeoutMs: 20_000,
  });
  if (!response.ok) throw new ProviderFetchError(`${board.provider} feed request failed.`, response.status);
  const postings = normalizeAshby(response.data);
  return {
    sourceUrl,
    rawPayload: response.data,
    postings,
    seenExternalIds: postings.map((posting) => posting.externalId),
    listingComplete: true,
    dataComplete: true,
    httpStatus: response.status,
  };
}

async function syncBoard(ctx: ActionCtx, company: CompanyTarget & { careerBoard: CareerBoard }): Promise<void> {
  const board = company.careerBoard;
  const sourceKey = SOURCE_KEYS[board.provider];
  const sourceUrl = boardSourceUrl(board);
  const requestHash = await sha256(sourceUrl);
  const bucket = Math.floor(Date.now() / (6 * 60 * 60_000));
  const run = await ctx.runMutation(internal.sourceMaintenance.beginProviderRun, {
    sourceKey,
    runKey: `${sourceKey}:${company.slug}:${bucket}`,
    requestHash,
  });

  try {
    const fetched = await fetchBoard(board, company.canonicalName);
    const observedAt = Date.now();
    const isComplete = fetched.listingComplete && fetched.dataComplete;
    const serializedPayload = JSON.stringify(fetched.rawPayload);
    const responseHash = await sha256(serializedPayload);
    const chunks = rawSnapshotChunks(fetched.rawPayload);
    const snapshotIds: Id<"rawSnapshots">[] = [];
    for (const [index, chunk] of chunks.entries()) {
      const serializedChunk = JSON.stringify(chunk);
      const snapshot = await ctx.runMutation(internal.sourceMaintenance.recordSnapshot, {
        runId: run.runId,
        sourceUrl: fetched.sourceUrl,
        externalId: `${board.boardKey}:part:${index + 1}-of-${chunks.length}`,
        contentHash: await sha256(`${fetched.sourceUrl}\n${index}\n${serializedChunk}`),
        mimeType: "application/json",
        observedAt,
        payload: chunk,
      });
      snapshotIds.push(snapshot.snapshotId);
      await paceWrites(200);
    }
    const snapshotId = snapshotIds[0];
    if (snapshotId === undefined) throw new Error("Career feed produced no source snapshot.");
    for (const [index, posting] of fetched.postings.entries()) {
      await ctx.runMutation(internal.jobMonitoring.upsertPostingSnapshot, {
        companyId: company.companyId,
        sourceId: run.sourceId,
        snapshotId,
        externalId: posting.externalId,
        canonicalUrl: posting.canonicalUrl,
        title: posting.title,
        locations: posting.locations,
        salaryText: posting.salaryText,
        requirements: posting.requirements,
        descriptionText: posting.descriptionText,
        contentHash: await sha256(JSON.stringify(posting)),
        state: "active",
        relevantToSpainSoftware: posting.relevantToSpainSoftware,
        observedAt,
      });
      if ((index + 1) % 20 === 0) await paceWrites(100);
    }
    let rolesRemoved = 0;
    if (isComplete) {
      const reconciled = await ctx.runMutation(internal.jobMonitoring.finalizeCompleteFeed, {
        companyId: company.companyId,
        sourceId: run.sourceId,
        seenExternalIds: fetched.seenExternalIds,
        observedAt,
      });
      rolesRemoved = reconciled.removed;
    }
    await ctx.runMutation(internal.sourceMaintenance.completeRun, {
      runId: run.runId,
      status: isComplete ? "succeeded" : "partial",
      responseHash,
      recordsSeen: fetched.seenExternalIds.length,
      recordsAccepted: fetched.postings.length,
      recordsRejected: Math.max(0, fetched.seenExternalIds.length - fetched.postings.length),
      httpStatus: fetched.httpStatus,
    });
    if (isComplete) {
      await ctx.runMutation(internal.companyResearch.markSynced, {
        companyId: company.companyId,
        syncedAt: observedAt,
      });
      await ctx.runMutation(internal.companySalaryResearch.backfillCurrent, {
        limit: 500,
      });
      await ctx.runMutation(internal.companyResearch.recordScan, {
        companyId: company.companyId,
        scannedAt: observedAt,
        status: "complete",
        rolesSeen: fetched.seenExternalIds.length,
        rolesRemoved,
      });
    } else {
      await ctx.runMutation(internal.companyResearch.recordScan, {
        companyId: company.companyId,
        scannedAt: observedAt,
        status: "partial",
        rolesSeen: fetched.seenExternalIds.length,
        rolesRemoved: 0,
        errorMessage: "The feed did not return a complete result; previous data was preserved.",
      });
      await ctx.runMutation(internal.companyResearch.markPartial, {
        companyId: company.companyId,
        attemptedAt: observedAt,
      });
    }
  } catch (error) {
    await ctx.runMutation(internal.sourceMaintenance.completeRun, {
      runId: run.runId,
      status: "failed",
      recordsSeen: 0,
      recordsAccepted: 0,
      recordsRejected: 0,
      httpStatus: error instanceof ProviderFetchError ? error.httpStatus : undefined,
      errorCode: error instanceof ProviderFetchError ? "provider_fetch_failed" : "career_sync_failed",
      errorMessage: safeMessage(error),
    });
    throw error;
  }
}

async function discoverAndSync(ctx: ActionCtx, company: CompanyTarget): Promise<void> {
  try {
    const board = company.careerBoard ?? await discoverBoard(company);
    if (board === null) {
      await ctx.runMutation(internal.companyResearch.markUnsupported, { companyId: company.companyId });
      return;
    }
    if (company.careerBoard === undefined) {
      await ctx.runMutation(internal.companyResearch.saveDiscoveredBoard, {
        companyId: company.companyId,
        board,
      });
    }
    await syncBoard(ctx, { ...company, careerBoard: board });
  } catch (error) {
    await ctx.runMutation(internal.companyResearch.recordScan, {
      companyId: company.companyId,
      scannedAt: Date.now(),
      status: "failed",
      rolesSeen: 0,
      rolesRemoved: 0,
      errorMessage: safeMessage(error),
    });
    await ctx.runMutation(internal.companyResearch.markFailed, {
      companyId: company.companyId,
      message: safeMessage(error),
    });
  }
}

export const dispatchQueued = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.runMutation(internal.sourceMaintenance.syncCatalog, {});
    // Several per sweep: at one per run a 25-company paste took over six hours
    // to be attempted at all, which read as the queue silently ignoring it.
    // `claimQueued` fills the batch from fresh work first and admits at most
    // one retry, so this bursts after a paste without becoming a steady load.
    const companies = await ctx.runMutation(internal.companyResearch.claimQueued, { limit: 5 });
    for (const company of companies) {
      await discoverAndSync(ctx, company);
    }
    return null;
  },
});

export const refreshMonitored = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.runMutation(internal.sourceMaintenance.syncCatalog, {});
    // Several per sweep so the refresh cadence holds as companies are added:
    // one per run caps the whole fleet at 48 refreshes a day.
    const companies = await ctx.runQuery(internal.companyResearch.listMonitored, { limit: 3 });
    for (const company of companies) {
      await discoverAndSync(ctx, company);
    }
    return null;
  },
});

/** Targeted operational replay keeps validation and incident recovery scoped. */
export const refreshCompany = internalAction({
  args: { slug: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.sourceMaintenance.syncCatalog, {});
    const company = await ctx.runQuery(internal.companyResearch.getMonitoredBySlug, {
      slug: args.slug,
    });
    if (company === null) return false;
    await discoverAndSync(ctx, company);
    return true;
  },
});
