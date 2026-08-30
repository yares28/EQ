export interface GoogleCareersPostingData {
  externalId: string;
  title: string;
  companyName: "Google";
  locations: string[];
  canonicalUrl: string;
  descriptionText: string;
  salaryText?: string;
}

export function googleCareersCompensationText(description: string): string | undefined {
  return description
    .split(/\n+/)
    .map((line) => line.trim())
    .find((line) => /^Spain\s*:/i.test(line) && /€|\bEUR\b/i.test(line) && /\d/.test(line))
    ?.slice(0, 500);
}

export interface GoogleCareersPageData {
  jobs: GoogleCareersPostingData[];
  rawJobs: unknown[];
  total: number;
  pageSize: number;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
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
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function nestedHtml(value: unknown): string | undefined {
  return asString(asArray(value)?.[1]);
}

function googleJobSlug(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-");
}

function extractDataArray(html: string): unknown[] | null {
  const callback = /AF_initDataCallback\(\{key:\s*['"]ds:1['"]/.exec(html);
  if (callback === null) return null;
  const dataKey = html.indexOf("data:", callback.index + callback[0].length);
  if (dataKey < 0) return null;
  const start = html.indexOf("[", dataKey + 5);
  if (start < 0) return null;

  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < html.length; index += 1) {
    const character = html[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') {
      quoted = true;
      continue;
    }
    if (character === "[") depth += 1;
    if (character === "]") {
      depth -= 1;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(html.slice(start, index + 1)) as unknown;
          return asArray(parsed);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function normalizeJob(value: unknown): GoogleCareersPostingData | null {
  const job = asArray(value);
  if (job === null || job.length < 21) return null;
  const externalId = asString(job[0]);
  const title = asString(job[1]);
  const companyName = asString(job[7]);
  const rawLocations = asArray(job[9]);
  if (!externalId || !/^\d{10,24}$/.test(externalId) || !title || companyName !== "Google" || rawLocations === null) {
    return null;
  }

  const locationRecords = rawLocations.flatMap((value) => {
    const location = asArray(value);
    const label = asString(location?.[0]);
    const countryCode = asString(location?.[5]);
    return label && countryCode ? [{ label, countryCode }] : [];
  });
  if (locationRecords.length !== rawLocations.length || !locationRecords.some((location) => location.countryCode === "ES")) {
    return null;
  }

  const sections = [
    ["Qualifications", nestedHtml(job[4])],
    ["About the job", nestedHtml(job[10])],
    ["Responsibilities", nestedHtml(job[3])],
  ] as const;
  const descriptionText = sections.flatMap(([heading, html]) => {
    const text = decodeHtml(html ?? "");
    return text ? [`${heading}\n${text}`] : [];
  }).join("\n");
  if (!descriptionText) return null;

  return {
    externalId,
    title,
    companyName: "Google",
    locations: [...new Set(locationRecords.map((location) => location.label))],
    canonicalUrl: `https://www.google.com/about/careers/applications/jobs/results/${externalId}-${googleJobSlug(title)}?location=Spain`,
    descriptionText,
    salaryText: googleCareersCompensationText(descriptionText),
  };
}

/** Parse the official page's machine-readable result payload without executing it. */
export function parseGoogleCareersPage(html: string): GoogleCareersPageData | null {
  const data = extractDataArray(html);
  const rawJobs = asArray(data?.[0]);
  const total = data?.[2];
  const pageSize = data?.[3];
  if (
    rawJobs === null ||
    typeof total !== "number" || !Number.isInteger(total) || total < 0 ||
    typeof pageSize !== "number" || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100
  ) {
    return null;
  }
  const jobs = rawJobs.flatMap((job) => normalizeJob(job) ?? []);
  if (jobs.length !== rawJobs.length) return null;
  return { jobs, rawJobs, total, pageSize };
}
