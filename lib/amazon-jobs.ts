export interface AmazonJobData {
  externalId: string;
  title: string;
  companyName: string;
  locations: string[];
  canonicalUrl: string;
  descriptionText: string;
}

export interface AmazonJobsPage {
  total: number;
  jobs: AmazonJobData[];
  rawJobs: unknown[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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
  return decodeEntities(decodeEntities(value))
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function parseLocation(value: unknown): { countryCode: string; label: string } | null {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  const location = asRecord(parsed);
  if (location === null) return null;
  const countryCode = asString(location.countryIso3a) ?? asString(location.normalizedCountryCode);
  const normalizedLocation = asString(location.normalizedLocation);
  const fallbackLocation = asString(location.locationNonStemming) ?? asString(location.location);
  const label = normalizedLocation?.replace(/,\s*ESP$/i, ", Spain") ?? fallbackLocation;
  return countryCode && label ? { countryCode, label } : null;
}

export function normalizeAmazonJob(value: unknown): AmazonJobData | null {
  const job = asRecord(value);
  if (job === null) return null;
  const externalId = asString(job.id_icims);
  const title = asString(job.title);
  const companyName = asString(job.company_name);
  const jobPath = asString(job.job_path);
  const description = asString(job.description);
  if (
    !externalId || !/^\d{5,12}$/.test(externalId) ||
    !title || !companyName || !jobPath || !description
  ) return null;
  const pathPattern = new RegExp(`^/en/jobs/${externalId}/[a-z0-9][a-z0-9-]*$`, "i");
  if (!pathPattern.test(jobPath)) return null;
  if (!Array.isArray(job.locations) || job.locations.length === 0) return null;
  const parsedLocations = job.locations.map(parseLocation);
  if (parsedLocations.some((location) => location === null)) return null;
  const locations = parsedLocations as Array<{ countryCode: string; label: string }>;
  if (!locations.some((location) => location.countryCode === "ESP")) return null;

  const basic = asString(job.basic_qualifications);
  const preferred = asString(job.preferred_qualifications);
  const descriptionParts = [
    decodeHtml(description),
    basic ? `Basic Qualifications\n${decodeHtml(basic)}` : undefined,
    preferred ? `Preferred Qualifications\n${decodeHtml(preferred)}` : undefined,
  ].filter((part): part is string => Boolean(part));
  return {
    externalId,
    title,
    companyName,
    locations: [...new Set(locations.map((location) => location.label))],
    canonicalUrl: `https://www.amazon.jobs${jobPath}`,
    descriptionText: descriptionParts.join("\n"),
  };
}

export function parseAmazonJobsPage(value: unknown): AmazonJobsPage | null {
  const payload = asRecord(value);
  const total = payload?.hits;
  const rawJobs = payload?.jobs;
  if (
    payload?.error !== null ||
    typeof total !== "number" || !Number.isInteger(total) || total < 0 ||
    !Array.isArray(rawJobs)
  ) return null;
  const jobs = rawJobs.flatMap((raw) => {
    const job = normalizeAmazonJob(raw);
    return job === null ? [] : [job];
  });
  if (jobs.length !== rawJobs.length) return null;
  return { total, jobs, rawJobs };
}
