export interface WorkdayListingPosting {
  externalId: string;
  title: string;
  externalPath: string;
}

export interface WorkdayListingPage {
  total: number;
  postings: WorkdayListingPosting[];
}

export interface WorkdayPostingData {
  externalId: string;
  title: string;
  companyName: string;
  locations: string[];
  canonicalUrl: string;
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

function decodeHtml(value: string): string {
  const decodeEntities = (input: string) => input
    .replace(/&nbsp;|&#160;|&amp;#xa;/gi, " ")
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

function collectFacetGroups(value: unknown, output: Record<string, unknown>[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectFacetGroups(item, output);
    return;
  }
  const record = asRecord(value);
  if (record === null) return;
  if (record.facetParameter === "locationHierarchy1" && Array.isArray(record.values)) {
    output.push(record);
  }
  for (const child of Object.values(record)) collectFacetGroups(child, output);
}

export function findWorkdayCountryFacetId(value: unknown, country: string): string | null {
  const groups: Record<string, unknown>[] = [];
  collectFacetGroups(value, groups);
  const matches = groups.flatMap((group) => (group.values as unknown[]).flatMap((raw) => {
    const item = asRecord(raw);
    const descriptor = asString(item?.descriptor);
    const id = asString(item?.id);
    return descriptor?.localeCompare(country, undefined, { sensitivity: "base" }) === 0 && id
      ? [id]
      : [];
  }));
  return matches.length === 1 ? matches[0] ?? null : null;
}

export function parseWorkdayListingPage(value: unknown): WorkdayListingPage | null {
  const payload = asRecord(value);
  const total = payload?.total;
  const rawPostings = payload?.jobPostings;
  if (
    typeof total !== "number" || !Number.isInteger(total) || total < 0 ||
    !Array.isArray(rawPostings)
  ) return null;
  const postings = rawPostings.flatMap((raw) => {
    const posting = asRecord(raw);
    const title = asString(posting?.title);
    const externalPath = asString(posting?.externalPath);
    const bulletFields = posting?.bulletFields;
    const externalId = Array.isArray(bulletFields) ? asString(bulletFields[0]) : undefined;
    return title && externalPath?.startsWith("/job/") && externalId
      ? [{ title, externalPath, externalId }]
      : [];
  });
  if (postings.length !== rawPostings.length) return null;
  return { total, postings };
}

export function normalizeWorkdayPostingDetail(value: unknown): WorkdayPostingData | null {
  const payload = asRecord(value);
  const posting = asRecord(payload?.jobPostingInfo);
  const hiringOrganization = asRecord(payload?.hiringOrganization);
  if (posting === null || posting.posted !== true || posting.canApply === false) return null;
  const externalId = asString(posting.jobReqId);
  const title = asString(posting.title);
  const companyName = asString(hiringOrganization?.name);
  const canonicalUrl = asString(posting.externalUrl);
  const description = asString(posting.jobDescription);
  if (!externalId || !title || !companyName || !canonicalUrl || !description) return null;
  let url: URL;
  try {
    url = new URL(canonicalUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !url.hostname.endsWith(".myworkdayjobs.com")) return null;
  const additionalLocations = Array.isArray(posting.additionalLocations)
    ? posting.additionalLocations.flatMap((location) => asString(location) ?? [])
    : [];
  const locations = [...new Set([asString(posting.location), ...additionalLocations].filter(
    (location): location is string => Boolean(location),
  ))];
  if (locations.length === 0) return null;
  return {
    externalId,
    title,
    companyName,
    locations,
    canonicalUrl,
    descriptionText: decodeHtml(description),
  };
}
