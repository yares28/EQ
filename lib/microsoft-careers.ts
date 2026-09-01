export interface MicrosoftCareersListingData {
  externalId: string;
  displayJobId: string;
  title: string;
  locations: string[];
  standardizedLocations: string[];
  department?: string;
  canonicalUrl: string;
  postedAtMs?: number;
}

export interface MicrosoftCareersSearchPageData {
  total: number;
  jobs: MicrosoftCareersListingData[];
  rawJobs: unknown[];
}

export interface MicrosoftCareersPostingData extends MicrosoftCareersListingData {
  companyName: "Microsoft";
  descriptionText: string;
  roleType: "Individual Contributor";
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

function isSpainLocation(locations: string[], standardizedLocations: string[]): boolean {
  return locations.some((location) => /^Spain(?:,|$)/i.test(location)) &&
    standardizedLocations.some((location) => /(?:^|,\s*)ES$/i.test(location));
}

export function normalizeMicrosoftCareersListing(value: unknown): MicrosoftCareersListingData | null {
  const job = asRecord(value);
  if (job === null) return null;
  const externalId = asExternalId(job.id);
  const displayJobId = asString(job.displayJobId);
  const atsJobId = asString(job.atsJobId);
  const title = asString(job.name);
  const positionUrl = asString(job.positionUrl);
  const locations = asStringArray(job.locations);
  const standardizedLocations = asStringArray(job.standardizedLocations);
  if (
    !externalId || !displayJobId || !/^\d{6,12}$/.test(displayJobId) || atsJobId !== displayJobId ||
    !title || !positionUrl || positionUrl !== `/careers/job/${externalId}` ||
    locations === null || standardizedLocations === null ||
    locations.length !== standardizedLocations.length ||
    !isSpainLocation(locations, standardizedLocations)
  ) return null;
  const postedTs = job.postedTs;
  const postedAtMs = typeof postedTs === "number" && Number.isInteger(postedTs) && postedTs > 0
    ? postedTs * 1_000
    : undefined;
  return {
    externalId,
    displayJobId,
    title,
    locations: [...new Set(locations)],
    standardizedLocations: [...new Set(standardizedLocations)],
    department: asString(job.department),
    canonicalUrl: `https://apply.careers.microsoft.com${positionUrl}`,
    postedAtMs,
  };
}

export function parseMicrosoftCareersSearchPage(value: unknown): MicrosoftCareersSearchPageData | null {
  const payload = asRecord(value);
  const data = asRecord(payload?.data);
  const total = data?.count;
  const rawJobs = data?.positions;
  if (
    payload?.status !== 200 ||
    typeof total !== "number" || !Number.isInteger(total) || total < 0 ||
    !Array.isArray(rawJobs)
  ) return null;
  const jobs = rawJobs.flatMap((raw) => normalizeMicrosoftCareersListing(raw) ?? []);
  if (jobs.length !== rawJobs.length) return null;
  return { total, jobs, rawJobs };
}

function oneRoleType(value: unknown): string | undefined {
  const values = asStringArray(value);
  return values?.length === 1 ? values[0] : undefined;
}

export function normalizeMicrosoftCareersDetail(
  value: unknown,
  expected: MicrosoftCareersListingData,
): MicrosoftCareersPostingData | null {
  const payload = asRecord(value);
  if (payload?.status !== 200) return null;
  const job = asRecord(payload.data);
  if (job === null) return null;
  const listing = normalizeMicrosoftCareersListing(job);
  const descriptionHtml = asString(job.jobDescription);
  const publicUrl = asString(job.publicUrl);
  const roleType = oneRoleType(job.efcustomTextRoletype);
  if (
    listing === null || listing.externalId !== expected.externalId ||
    listing.displayJobId !== expected.displayJobId || listing.title !== expected.title ||
    publicUrl !== listing.canonicalUrl || roleType !== "Individual Contributor" ||
    !descriptionHtml
  ) return null;
  const descriptionText = decodeHtml(descriptionHtml);
  if (!descriptionText) return null;
  return {
    ...listing,
    companyName: "Microsoft",
    descriptionText,
    roleType,
  };
}
