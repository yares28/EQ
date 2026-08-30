export interface NetflixCareersListingData {
  externalId: string;
  displayJobId: string;
  title: string;
  locations: string[];
  rawLocations: string[];
  department?: string;
  canonicalUrl: string;
  postedAtMs?: number;
}

export interface NetflixCareersSearchPageData {
  total: number;
  jobs: NetflixCareersListingData[];
  rawJobs: unknown[];
}

export interface NetflixCareersPostingData extends NetflixCareersListingData {
  companyName: "Netflix";
  descriptionText: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const strings = value.map(asString);
  return strings.some((item) => item === undefined) ? null : strings as string[];
}

function asExternalId(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  const stringValue = asString(value);
  return stringValue && /^\d{10,20}$/.test(stringValue) ? stringValue : undefined;
}

function decodeHtml(value: string): string {
  const decodeEntities = (input: string) => input
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;|&#38;/gi, "&")
    .replace(/&lt;|&#60;/gi, "<")
    .replace(/&gt;|&#62;/gi, ">")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
  return decodeEntities(decodeEntities(value))
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/td|\/tr)\b[^>]*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

/**
 * Eightfold publishes Netflix locations as comma-separated `City,Region,Country`
 * segments. Only an exact `Spain` country segment qualifies, so the `Remote`
 * sentinel and every non-Spain office fail closed instead of widening scope.
 */
function exactSpainLocation(value: string): string | null {
  const segments = value.split(",").map((segment) => segment.trim()).filter(Boolean);
  if (segments.length < 2 || segments.length > 4) return null;
  if (segments[segments.length - 1] !== "Spain") return null;
  if (segments.slice(0, -1).some((segment) => /^(remote|anywhere|worldwide)$/i.test(segment))) return null;
  return [...new Set(segments)].join(", ");
}

function exactSpainLocations(value: unknown): { locations: string[]; rawLocations: string[] } | null {
  const rawLocations = asStringArray(value);
  if (rawLocations === null) return null;
  const locations = rawLocations.flatMap((raw) => exactSpainLocation(raw) ?? []);
  if (locations.length !== rawLocations.length) return null;
  return { locations: [...new Set(locations)], rawLocations: [...new Set(rawLocations)] };
}

function postedAtMs(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value * 1_000 : undefined;
}

export function normalizeNetflixCareersListing(value: unknown): NetflixCareersListingData | null {
  const job = asRecord(value);
  if (job === null || job.isPrivate === true || job.type !== "ATS") return null;
  const externalId = asExternalId(job.id);
  const displayJobId = asString(job.display_job_id);
  const atsJobId = asString(job.ats_job_id);
  const title = asString(job.name);
  const postingName = asString(job.posting_name);
  const canonicalPositionUrl = asString(job.canonicalPositionUrl);
  const spain = exactSpainLocations(job.locations);
  const primaryLocation = asString(job.location);
  if (
    !externalId || !displayJobId || !/^[A-Z]{1,4}\d{4,12}$/.test(displayJobId) ||
    atsJobId !== displayJobId || !title || postingName !== title ||
    spain === null || !primaryLocation || !spain.rawLocations.includes(primaryLocation) ||
    canonicalPositionUrl === undefined ||
    !canonicalPositionUrl.startsWith(`https://explore.jobs.netflix.net/careers/job/${externalId}`)
  ) return null;
  return {
    externalId,
    displayJobId,
    title,
    locations: spain.locations,
    rawLocations: spain.rawLocations,
    department: asString(job.department),
    canonicalUrl: `https://explore.jobs.netflix.net/careers/job/${externalId}`,
    postedAtMs: postedAtMs(job.t_create),
  };
}

export function parseNetflixCareersSearchPage(value: unknown): NetflixCareersSearchPageData | null {
  const payload = asRecord(value);
  const total = payload?.count;
  const rawJobs = payload?.positions;
  if (
    payload?.domain !== "netflix.com" ||
    typeof total !== "number" || !Number.isInteger(total) || total < 0 ||
    !Array.isArray(rawJobs)
  ) return null;
  const jobs = rawJobs.flatMap((raw) => normalizeNetflixCareersListing(raw) ?? []);
  if (jobs.length !== rawJobs.length) return null;
  return { total, jobs, rawJobs };
}

export function normalizeNetflixCareersDetail(
  value: unknown,
  expected: NetflixCareersListingData,
): NetflixCareersPostingData | null {
  const job = asRecord(value);
  if (job === null) return null;
  const listing = normalizeNetflixCareersListing(job);
  const descriptionHtml = asString(job.job_description);
  if (
    listing === null || listing.externalId !== expected.externalId ||
    listing.displayJobId !== expected.displayJobId || listing.title !== expected.title ||
    listing.canonicalUrl !== expected.canonicalUrl || !descriptionHtml
  ) return null;
  const descriptionText = decodeHtml(descriptionHtml);
  if (!descriptionText) return null;
  return { ...listing, companyName: "Netflix", descriptionText };
}

/**
 * Netflix's Eightfold records expose no structured individual-contributor flag,
 * so the posted title is the only available role-scope evidence. Ambiguous and
 * leadership titles are excluded rather than assumed to be engineering roles.
 */
export function isNetflixSoftwareListing(job: NetflixCareersListingData): boolean {
  const technicalRole =
    /\b(software|systems?|developer|development|data|machine learning|ml|artificial intelligence|ai|cloud|platform|infrastructure|security|devops|site reliability|sre|backend|back[- ]?end|front[- ]?end|full[- ]?stack|mobile|ios|android|engineer|engineering)\b/i
      .test(job.title);
  const excluded =
    /\b(manager|director|head|lead|principal architect|vice president|vp|sales|recruit(?:er|ing)|business partner|talent|legal|counsel|finance|accounting|marketing|communications|support|success|program manager|product manager|project manager)\b/i
      .test(job.title);
  return technicalRole && !excluded;
}
