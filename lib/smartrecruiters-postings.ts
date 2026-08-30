export interface SmartRecruitersPostingData {
  externalId: string;
  title: string;
  companyIdentifier: string;
  companyName: string;
  locations: string[];
  canonicalUrl: string;
  descriptionText: string;
  salaryText?: string;
}

export type SmartRecruitersBoardAssessment =
  | { accepted: true }
  | {
      accepted: false;
      reason: "empty" | "invalid" | "identity_mismatch" | "test_only";
    };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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

/**
 * Discovery is deliberately strict: SmartRecruiters returns HTTP 200 for some
 * unknown identifiers, and real company identifiers can expose only test jobs.
 */
export function assessSmartRecruitersBoardListing(
  value: unknown,
  candidateKey: string,
  companyName: string,
): SmartRecruitersBoardAssessment {
  const content = asRecord(value)?.content;
  if (!Array.isArray(content) || content.length === 0) return { accepted: false, reason: "empty" };
  const identities = content.flatMap((raw) => {
    const posting = asRecord(raw);
    const company = asRecord(posting?.company);
    const identifier = asString(company?.identifier);
    const name = asString(company?.name);
    const title = asString(posting?.name);
    return identifier && name && title ? [{ identifier, name, title }] : [];
  });
  if (identities.length !== content.length) return { accepted: false, reason: "invalid" };
  if (!identities.every((identity) =>
    identityKey(identity.identifier) === identityKey(candidateKey) &&
    identityMatches(companyName, identity.name)
  )) {
    return { accepted: false, reason: "identity_mismatch" };
  }
  if (identities.every((identity) => /\b(?:test|uat|dummy|sample)\b/i.test(identity.title))) {
    return { accepted: false, reason: "test_only" };
  }
  return { accepted: true };
}

function asPositiveAmount(value: unknown): number | undefined {
  const number = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(number) && number > 0 ? number : undefined;
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

const COUNTRY_LABELS: Record<string, string> = {
  es: "Spain",
  gb: "United Kingdom",
  uk: "United Kingdom",
  ie: "Ireland",
  pt: "Portugal",
  fr: "France",
  de: "Germany",
  it: "Italy",
  nl: "Netherlands",
  pl: "Poland",
  us: "United States",
};

export function smartRecruitersLocation(value: unknown): string[] {
  const location = asRecord(value);
  if (location === null) return [];
  const countryCode = asString(location.country)?.toLowerCase();
  const country = countryCode ? COUNTRY_LABELS[countryCode] ?? countryCode.toUpperCase() : undefined;
  const base = asString(location.fullLocation) ?? [
    asString(location.city),
    asString(location.region),
    country,
  ].filter(Boolean).join(", ");
  const workMode = location.remote === true
    ? "Remote"
    : location.hybrid === true
      ? "Hybrid"
      : undefined;
  if (!base && !workMode) return [];
  return [[base, workMode].filter(Boolean).join(" · ")];
}

function compensationPeriod(value: unknown): string | undefined {
  const period = asString(value)?.toUpperCase();
  if (period === "HOURLY") return "hour";
  if (period === "MONTHLY") return "month";
  if (period === "YEARLY") return "year";
  if (period === "DAILY") return "day";
  if (period === "WEEKLY") return "week";
  return undefined;
}

export function smartRecruitersCompensation(value: unknown): string | undefined {
  const compensation = asRecord(value);
  if (compensation === null) return undefined;
  const currency = asString(compensation.currency)?.toUpperCase();
  if (!currency || !/^[A-Z]{3}$/.test(currency)) return undefined;
  const minimum = asPositiveAmount(compensation.min);
  const maximum = asPositiveAmount(compensation.max);
  if (minimum === undefined && maximum === undefined) return undefined;
  const period = compensationPeriod(compensation.period);
  const periodText = period ? ` per ${period}` : "";
  if (minimum !== undefined && maximum !== undefined && minimum !== maximum) {
    return `${currency} ${minimum}–${maximum}${periodText}`;
  }
  if (minimum !== undefined && maximum === undefined) {
    return `Minimum ${currency} ${minimum}${periodText}`;
  }
  if (maximum !== undefined && minimum === undefined) {
    return `Maximum ${currency} ${maximum}${periodText}`;
  }
  return `${currency} ${minimum ?? maximum}${periodText}`;
}

function postingDescription(posting: Record<string, unknown>): string {
  const sections = asRecord(asRecord(posting.jobAd)?.sections);
  if (sections === null) return "";
  const orderedKeys = [
    "companyDescription",
    "jobDescription",
    "qualifications",
    "additionalInformation",
  ];
  return orderedKeys.flatMap((key) => {
    const section = asRecord(sections[key]);
    const text = decodeHtml(asString(section?.text) ?? "");
    if (!text) return [];
    const title = asString(section?.title);
    return [[title, text].filter(Boolean).join("\n")];
  }).join("\n");
}

export function normalizeSmartRecruitersPosting(value: unknown): SmartRecruitersPostingData | null {
  const posting = asRecord(value);
  if (posting === null || posting.active === false || posting.visibility === "INTERNAL") return null;
  const externalId = asString(posting.id) ?? asString(posting.uuid);
  const title = asString(posting.name);
  const company = asRecord(posting.company);
  const companyIdentifier = asString(company?.identifier);
  const companyName = asString(company?.name);
  const canonicalUrl = asString(posting.postingUrl);
  if (!externalId || !title || !companyIdentifier || !companyName || !canonicalUrl) return null;
  const jobAd = asRecord(posting.jobAd);
  return {
    externalId,
    title,
    companyIdentifier,
    companyName,
    locations: smartRecruitersLocation(posting.location),
    canonicalUrl,
    descriptionText: postingDescription(posting),
    salaryText: smartRecruitersCompensation(posting.compensation) ??
      smartRecruitersCompensation(jobAd?.compensation),
  };
}
