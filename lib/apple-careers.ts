export interface AppleCareersListingData {
  externalId: string;
  positionId: string;
  title: string;
  locations: string[];
  teamName: string;
  teamCode: string;
  canonicalUrl: string;
  summaryText: string;
  postedAt?: string;
}

export interface AppleCareersSearchPageData {
  total: number;
  page: number;
  jobs: AppleCareersListingData[];
  rawJobs: unknown[];
}

export interface AppleCareersPostingData extends AppleCareersListingData {
  companyName: "Apple";
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

function extractHydration(html: string): Record<string, unknown> | null {
  const match = /window\.__staticRouterHydrationData\s*=\s*JSON\.parse\(("(?:\\.|[^"\\])*")\);/.exec(html);
  if (match?.[1] === undefined) return null;
  try {
    const serialized = JSON.parse(match[1]) as unknown;
    return typeof serialized === "string" ? asRecord(JSON.parse(serialized) as unknown) : null;
  } catch {
    return null;
  }
}

function exactSpainLocations(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const locations = value.flatMap((raw) => {
    const location = asRecord(raw);
    const name = asString(location?.name);
    const city = asString(location?.city);
    const state = asString(location?.stateProvince);
    if (location?.countryName !== "Spain" || location?.countryID !== "iso-country-ESP" || !name) return [];
    return [[...new Set([name, city, state, "Spain"].filter((item): item is string => Boolean(item)))].join(", ")];
  });
  return locations.length === value.length ? [...new Set(locations)] : null;
}

function detailExternalId(job: Record<string, unknown>): string | undefined {
  const id = asString(job.id);
  const positionId = asString(job.positionId);
  if (!positionId || !/^\d{6,12}$/.test(positionId) || !id) return undefined;
  const externalId = /^(?:PIPE|REQ)-\d{6,12}$/i.test(id) ? positionId : id;
  return /^\d{6,12}(?:-\d{4})?$/.test(externalId) ? externalId : undefined;
}

function normalizeListing(value: unknown): AppleCareersListingData | null {
  const job = asRecord(value);
  if (job === null || job.postExternal !== true) return null;
  const externalId = detailExternalId(job);
  const positionId = asString(job.positionId);
  const title = asString(job.postingTitle);
  const transformedTitle = asString(job.transformedPostingTitle);
  const summaryText = asString(job.jobSummary);
  const team = asRecord(job.team);
  const teamName = asString(team?.teamName);
  const teamCode = asString(team?.teamCode);
  const locations = exactSpainLocations(job.locations);
  if (
    !externalId || !positionId || !title || !transformedTitle || !summaryText ||
    !teamName || !teamCode || !/^[A-Z0-9]{2,12}$/.test(teamCode) || locations === null ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(transformedTitle)
  ) return null;
  return {
    externalId,
    positionId,
    title,
    locations,
    teamName,
    teamCode,
    canonicalUrl: `https://jobs.apple.com/en-us/details/${externalId}/${transformedTitle}?team=${teamCode}`,
    summaryText,
    postedAt: asString(job.postDateInGMT),
  };
}

export function parseAppleCareersSearchPage(html: string): AppleCareersSearchPageData | null {
  const hydration = extractHydration(html);
  const loaderData = asRecord(hydration?.loaderData);
  const root = asRecord(loaderData?.root);
  const search = asRecord(loaderData?.search);
  const query = asRecord(search?.queryParams);
  const filters = asRecord(search?.filters);
  const rawLocations = filters?.locations;
  const filterLocation = Array.isArray(rawLocations) && rawLocations.length === 1
    ? asRecord(rawLocations[0])
    : null;
  const total = search?.totalRecords;
  const page = search?.page;
  const rawJobs = search?.searchResults;
  if (
    root?.locale !== "en-us" || query?.location !== "spain-ESPC" ||
    filterLocation?.id !== "postLocation-ESPC" || filterLocation?.name !== "Spain" ||
    typeof total !== "number" || !Number.isInteger(total) || total < 0 ||
    typeof page !== "number" || !Number.isInteger(page) || page < 1 ||
    !Array.isArray(rawJobs)
  ) return null;
  const jobs = rawJobs.flatMap((raw) => normalizeListing(raw) ?? []);
  if (jobs.length !== rawJobs.length) return null;
  return { total, page, jobs, rawJobs };
}

function detailText(job: Record<string, unknown>): string {
  return [
    ["Summary", asString(job.jobSummary)],
    ["Description", asString(job.description)],
    ["Responsibilities", asString(job.responsibilities)],
    ["Minimum Qualifications", asString(job.minimumQualifications)],
    ["Preferred Qualifications", asString(job.preferredQualifications)],
  ].flatMap(([heading, value]) => value ? [`${heading}\n${value}`] : []).join("\n").trim();
}

export function parseAppleCareersDetail(
  html: string,
  expected: AppleCareersListingData,
): AppleCareersPostingData | null {
  const hydration = extractHydration(html);
  const loaderData = asRecord(hydration?.loaderData);
  const root = asRecord(loaderData?.root);
  const detail = asRecord(loaderData?.jobDetails);
  const job = asRecord(detail?.jobsData);
  if (root?.locale !== "en-us" || job === null) return null;
  const jobNumber = asString(job.jobNumber);
  const positionId = asString(job.positionId);
  const title = asString(job.postingTitle);
  const transformedTitle = asString(job.transformedPostingTitle);
  const requestUrl = asString(detail?.requestUrl);
  const locations = exactSpainLocations(job.locations);
  const teamNames = Array.isArray(job.teamNames)
    ? job.teamNames.flatMap((value) => asString(value) ?? [])
    : [];
  const descriptionText = detailText(job);
  if (
    jobNumber !== expected.externalId || positionId !== expected.positionId || title !== expected.title ||
    transformedTitle === undefined ||
    requestUrl === undefined || !requestUrl.startsWith(expected.canonicalUrl) ||
    locations === null || !teamNames.includes(expected.teamName) || !descriptionText
  ) return null;
  return {
    ...expected,
    locations,
    companyName: "Apple",
    descriptionText,
  };
}

export function isAppleSoftwareListing(job: AppleCareersListingData): boolean {
  const directTechnicalRole = /\b(software|sw|systems?|developer|data|machine learning|deep learning|ml|ai|cloud|platform|security|devops|site reliability|sre|backend|front[- ]?end|full[- ]?stack|mobile|ios|engineer)\b/i.test(job.title);
  const structuredTechnicalRole = /\b(language|quality) engineer\b/i.test(job.title) &&
    /^(?:MLAI|SFTWR)$/.test(job.teamCode);
  const excluded = /\b(manager|director|head|sales|support|retail|advisor|expert|localization)\b/i.test(job.title);
  return (directTechnicalRole || structuredTechnicalRole) && !excluded;
}
