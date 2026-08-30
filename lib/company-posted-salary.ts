export type PostedSalaryLevel =
  | "intern"
  | "junior"
  | "mid"
  | "senior"
  | "staff"
  | "principal"
  | "unknown";

export type PostedSalaryPeriod = "hour" | "month" | "year" | "unknown";

export type PostedSalaryRangeKind = "range" | "fixed" | "minimum" | "maximum";

export interface PostedSalaryParseInput {
  title: string;
  locations: string[];
  salaryText: string;
  /**
   * Resolves numbered job titles against the employer's own ladder. The same
   * string means different levels at different employers: "Software Engineer
   * III" is L4 (mid) at Google but a senior step at Amazon.
   */
  companySlug?: string;
}

export interface PostedSalaryParseResult {
  accepted: boolean;
  occupationKey: "software_engineering" | "unknown";
  canonicalLevel: PostedSalaryLevel;
  rawLevel?: string;
  countryCode: string;
  cityKey?: string;
  rawLocation: string;
  locationLabel: string;
  currency: string;
  period: PostedSalaryPeriod;
  rangeKind: PostedSalaryRangeKind;
  minimumAmount?: number;
  maximumAmount?: number;
  confidenceScore: number;
  confidenceBand: number;
  qualityFlags: string[];
  rejectionReasons: string[];
}

const SPAIN_CITY_PATTERNS: Array<{
  key: string;
  label: string;
  pattern: RegExp;
  excludedPattern?: RegExp;
}> = [
  { key: "madrid", label: "Madrid", pattern: /\bmadrid\b/i },
  { key: "barcelona", label: "Barcelona", pattern: /\bbarcelona\b/i },
  {
    key: "valencia",
    label: "Valencia",
    pattern: /(?:\bvalencia\b|(?:^|[\s,/(])valència(?:$|[\s,)/])|\bcomunitat valenciana\b|\bcomunidad valenciana\b)/i,
    excludedPattern: /\bvalencia\s*,\s*(?:ca|california)\b/i,
  },
  { key: "malaga", label: "Málaga", pattern: /\bm[aá]laga\b/i },
  { key: "seville", label: "Seville", pattern: /\b(?:sevilla|seville)\b/i },
  { key: "bilbao", label: "Bilbao", pattern: /\bbilbao\b/i },
  { key: "zaragoza", label: "Zaragoza", pattern: /\bzaragoza\b/i },
  { key: "alicante", label: "Alicante", pattern: /\balicante\b/i },
];

const LOCATION_LABELS: Record<string, string> = Object.fromEntries([
  ...SPAIN_CITY_PATTERNS.map(({ key, label }) => [key, label]),
  ["remote-spain", "Remote Spain"],
  ["remote-spain-eu", "Remote Spain / EU"],
  ["spain-wide", "Spain-wide"],
]);

/**
 * Whether a posting sits in Spain, for any role — not only the software IC
 * roles that qualify for salary extraction. Built on the same city patterns as
 * the salary parser so the two can never disagree about what counts as Spain.
 */
export function isSpainLocation(locations: string[]): boolean {
  const raw = locations.join(" · ");
  if (!raw.trim()) return false;
  const city = SPAIN_CITY_PATTERNS.find(
    (candidate) =>
      candidate.pattern.test(raw) && !candidate.excludedPattern?.test(raw),
  );
  if (city !== undefined) return true;
  return /\b(?:spain|españa)\b/i.test(raw);
}

export function postedSalaryLocationLabel(cityKey: string | undefined, rawLocation: string): string {
  return cityKey ? LOCATION_LABELS[cityKey] ?? rawLocation : rawLocation;
}

function canonicalOccupation(title: string): "software_engineering" | "unknown" {
  const leadership = /(?:\b(manager|director|head|vice president|vp|team lead|tech(?:nical)? lead)\b|\b(?:jefe|responsable)\s+de\b|\bl[ií]der\s+t[eé]cnic[oa]\b)/i;
  const adjacentRole = /(?:\b(solutions? architect|field engineer|support engineer|sales engineer|data scientist|product manager|engineering program manager)\b|\barquitect[oa](?:\/a)?\s+de\s+soluciones\b)/i;
  const softwareRole = /(?:\b(software engineer|software developer|software development engineer|sde\s*[- ]?\d*|backend|back-end|frontend|front-end|full\s*stack|full-stack|mobile engineer|ios engineer|android engineer|platform engineer|production engineer|site reliability|sre|devops|application developer|web developer|java engineer|python engineer|rust engineer|golang engineer|go engineer|kotlin engineer|scala engineer|ruby engineer|swift engineer|typescript engineer|c\+\+ engineer|c# engineer|security engineer|security research engineer)\b|\bingenier[oa](?:\/a)?(?:\s+de)?\s+software\b|\bdesarrollador(?:a|\/a)?(?:\s+de)?\s+(?:software|aplicaciones?|web)\b)/i;
  if (leadership.test(title) || adjacentRole.test(title)) return "unknown";
  return softwareRole.test(title) ? "software_engineering" : "unknown";
}

/**
 * How a numbered engineering title maps to a normalized band, per employer.
 * Google's scale is offset by one against the common one — SWE II is its entry
 * L3 and SWE III is L4 — so reading its titles with the default scale promotes
 * every Google posting by a full level.
 *
 * Only employers whose scale is audited in `company-level-ladders.ts` and
 * differs from the default belong here.
 */
const DEFAULT_NUMBERED_TITLE_SCALE: Record<number, PostedSalaryLevel> = {
  1: "junior",
  2: "mid",
  3: "senior",
};

const COMPANY_NUMBERED_TITLE_SCALES: Record<string, Record<number, PostedSalaryLevel>> = {
  // Google L-scale: SWE II = L3 (junior), SWE III = L4 (mid), Senior SWE = L5.
  google: { 2: "junior", 3: "mid" },
};

const NUMBERED_TITLE = /\b(?:sde|software engineer|software developer|software development engineer)\s*(i{1,3}|[123])\b/i;

function numberedTitleRank(token: string): number {
  const roman: Record<string, number> = { i: 1, ii: 2, iii: 3 };
  return roman[token.toLowerCase()] ?? Number(token);
}

function canonicalLevel(
  title: string,
  companySlug?: string,
): { level: PostedSalaryLevel; rawLevel?: string } {
  // Explicit seniority words win over numbering, so "Senior Software Engineer
  // III" is read as senior rather than by its numeral.
  const rules: Array<{ level: PostedSalaryLevel; pattern: RegExp }> = [
    { level: "intern", pattern: /\b(intern(?:ship)?|working student)\b/i },
    { level: "principal", pattern: /\bprincipal\b/i },
    { level: "staff", pattern: /\b(?:senior\s+staff|staff)\b/i },
    { level: "senior", pattern: /\b(?:s[eé]nior|sr\.?)\b/i },
    { level: "junior", pattern: /\b(?:junior|jr\.?|entry[- ]level|early career|new grad(?:uate)?|graduate|associate)\b/i },
    { level: "mid", pattern: /\b(?:mid[- ]level|intermediate|intermedi[oa])\b/i },
  ];
  for (const rule of rules) {
    const match = title.match(rule.pattern);
    if (match?.[0]) return { level: rule.level, rawLevel: match[0] };
  }

  const numbered = title.match(NUMBERED_TITLE);
  if (numbered?.[1]) {
    const scale = companySlug === undefined
      ? DEFAULT_NUMBERED_TITLE_SCALE
      : COMPANY_NUMBERED_TITLE_SCALES[companySlug] ?? DEFAULT_NUMBERED_TITLE_SCALE;
    const level = scale[numberedTitleRank(numbered[1])];
    if (level !== undefined) return { level, rawLevel: numbered[0] };
  }
  return { level: "unknown" };
}

function geography(locations: string[]): {
  acceptedScope: boolean;
  countryCode: string;
  cityKey?: string;
  label: string;
  flags: string[];
} {
  const rawLocation = locations.join(" · ");
  const city = SPAIN_CITY_PATTERNS.find((candidate) =>
    candidate.pattern.test(rawLocation) && !candidate.excludedPattern?.test(rawLocation),
  );
  const explicitSpain = /\b(?:spain|españa)\b/i.test(rawLocation);
  const remote = /\b(?:remote|distributed|work from home|anywhere)\b/i.test(rawLocation);
  const euScope = /\b(?:europe|european union|eu|emea)\b/i.test(rawLocation);

  if (city) {
    return {
      acceptedScope: true,
      countryCode: "ES",
      cityKey: city.key,
      label: city.label,
      flags: ["spain_exact_location"],
    };
  }
  if (explicitSpain) {
    return {
      acceptedScope: true,
      countryCode: "ES",
      cityKey: remote ? "remote-spain" : "spain-wide",
      label: remote ? "Remote Spain" : "Spain-wide",
      flags: ["spain_exact_location", ...(remote ? ["remote_role"] : [])],
    };
  }
  if (remote && euScope) {
    return {
      acceptedScope: true,
      countryCode: "ES",
      cityKey: "remote-spain-eu",
      label: "Remote Spain / EU",
      flags: ["regional_eu_remote_scope", "remote_role"],
    };
  }
  return {
    acceptedScope: false,
    countryCode: "XX",
    label: rawLocation || "Location not stated",
    flags: [],
  };
}

function currency(text: string): { code: string; explicit: boolean; conflict: boolean } {
  const hasEur = /€|\bEUR\b/i.test(text);
  const hasUsd = /\bUSD\b|\$/i.test(text);
  const hasGbp = /\bGBP\b|£/i.test(text);
  const count = [hasEur, hasUsd, hasGbp].filter(Boolean).length;
  if (count > 1) return { code: "MIXED", explicit: true, conflict: true };
  if (hasEur) return { code: "EUR", explicit: true, conflict: false };
  if (hasUsd) return { code: "USD", explicit: true, conflict: false };
  if (hasGbp) return { code: "GBP", explicit: true, conflict: false };
  return { code: "UNK", explicit: false, conflict: false };
}

function period(text: string): PostedSalaryPeriod {
  if (/\b(?:per\s+hour|hourly|an?\s+hour|por\s+hora)\b|\/(?:hr|hour)\b/i.test(text)) return "hour";
  if (/\b(?:per\s+month|monthly|a\s+month|mensual(?:es)?|al\s+mes|por\s+mes)\b|\/(?:mo|month)\b/i.test(text)) return "month";
  if (/\b(?:per\s+year|yearly|annual(?:ly)?|per\s+annum|p\.?a\.?|a\s+year|anual(?:es)?|al\s+año|por\s+año|brutos?\s+anuales?)\b|\/(?:yr|year)\b/i.test(text)) return "year";
  return "unknown";
}

const SALARY_TERMS = /\b(?:salary|base pay|pay range|compensation|remuneration|salario|sueldo|retribuci[oó]n)\b/i;
const IMPLIED_ANNUAL_SALARY = /\b(?:salary range|starting salary|base salary|pay range|compensation|salario|sueldo|retribuci[oó]n)\b/i;
const SALARY_CURRENCY_AMOUNT = /(?:€|\$|£|\bEUR\b|\bUSD\b|\bGBP\b)[^\n]{0,80}\d|\d[^\n]{0,80}(?:€|\$|£|\bEUR\b|\bUSD\b|\bGBP\b)/i;
const NON_SALARY_BENEFIT = /\b(?:learning|wellness|equipment|travel|meal|home office)\s+(?:stipend|allowance|budget)\b/i;

function decodeSalaryMarkup(text: string): string {
  return text
    .replace(/&mdash;|&#8212;|&#x2014;/gi, "—")
    .replace(/&ndash;|&#8211;|&#x2013;/gi, "–")
    .replace(/&euro;/gi, "€")
    .replace(/&nbsp;/gi, " ");
}

/**
 * Extracts the smallest complete compensation block from plain job text.
 * Some ATS feeds put the heading, range, and period on separate lines, so a
 * single-line search silently loses otherwise explicit primary-source data.
 */
export function extractCompanyPostedSalaryText(description: string): string | undefined {
  const lines = decodeSalaryMarkup(description).split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const candidates: Array<{ text: string; hasPeriod: boolean; lineCount: number }> = [];

  for (const [anchor, line] of lines.entries()) {
    if (!SALARY_TERMS.test(line) || NON_SALARY_BENEFIT.test(line)) continue;
    for (let end = anchor; end <= Math.min(lines.length - 1, anchor + 2); end += 1) {
      const window = lines.slice(anchor, end + 1);
      if (window.some((value) => NON_SALARY_BENEFIT.test(value))) continue;
      const text = window.join(" · ");
      if (!SALARY_CURRENCY_AMOUNT.test(text)) continue;
      candidates.push({
        text,
        hasPeriod: period(text) !== "unknown",
        lineCount: window.length,
      });
    }
  }

  return candidates
    .sort((left, right) =>
      Number(right.hasPeriod) - Number(left.hasPeriod) ||
      left.lineCount - right.lineCount ||
      left.text.length - right.text.length,
    )[0]?.text.slice(0, 500);
}

function localizedAmount(raw: string, thousandsSuffix: boolean): number | null {
  let compact = raw.replace(/\s/g, "");
  if (!compact) return null;
  if (thousandsSuffix) {
    compact = compact.replace(",", ".");
    const value = Number(compact);
    return Number.isFinite(value) ? Math.round(value * 1_000) : null;
  }
  const lastComma = compact.lastIndexOf(",");
  const lastDot = compact.lastIndexOf(".");
  const separatorIndex = Math.max(lastComma, lastDot);
  if (separatorIndex >= 0) {
    const decimals = compact.length - separatorIndex - 1;
    if (decimals === 3) {
      compact = compact.replace(/[.,]/g, "");
    } else if (lastComma >= 0 && lastDot >= 0) {
      const decimalSeparator = lastComma > lastDot ? "," : ".";
      compact = compact
        .replace(decimalSeparator === "," ? /\./g : /,/g, "")
        .replace(decimalSeparator, ".");
    } else {
      compact = compact.replace(",", ".");
    }
  }
  const value = Number(compact);
  return Number.isFinite(value) ? value : null;
}

function salaryAmounts(text: string, salaryPeriod: PostedSalaryPeriod): number[] {
  const pattern = /(?:€|£|\$|\b(?:EUR|USD|GBP)\b)?\s*(\d{1,3}(?:[.,\s]\d{3})+|\d+(?:[.,]\d+)?)\s*([kK])?\s*(?:€|£|\$|\b(?:EUR|USD|GBP)\b)?/gi;
  const bounds: Record<Exclude<PostedSalaryPeriod, "unknown">, [number, number]> = {
    hour: [5, 1_000],
    month: [500, 100_000],
    year: [8_000, 1_000_000],
  };
  const matches = [...text.matchAll(pattern)]
    // A number followed by "%" is a rate, not a compensation amount. Counting
    // "15% bonus target" as a third figure tripped the multiple-amounts gate
    // and discarded otherwise clean base ranges.
    .filter((match) => !/^\s*%/.test(text.slice(match.index + match[0].length)))
    .map((match) => localizedAmount(match[1], Boolean(match[2])))
    .filter((value): value is number => value !== null);
  if (salaryPeriod === "unknown") return matches.filter((value) => value > 0);
  const [minimum, maximum] = bounds[salaryPeriod];
  return matches.filter((value) => value >= minimum && value <= maximum);
}

/**
 * Recovers the pay period when the employer states an amount without one.
 * Reached only when no hour or month wording was found, so an amount in the
 * annual band cannot be read as either — €70,000 is not an hourly or monthly
 * figure. Both routes are recorded as `inferred_annual_period`, never as an
 * explicit period.
 */
function impliedAnnualPeriod(
  text: string,
  amounts: number[],
  explicitCurrency: boolean,
): PostedSalaryPeriod {
  const annualLike = amounts.filter((value) => value >= 20_000 && value <= 400_000);
  if (annualLike.length === 0) return "unknown";
  const minimum = Math.min(...annualLike);
  const maximum = Math.max(...annualLike);
  if (annualLike.length >= 2 && maximum / minimum > 4) return "unknown";
  // Route 1: the surrounding wording names it as salary or compensation.
  if (IMPLIED_ANNUAL_SALARY.test(text)) return "year";
  // Route 2: elimination. Every stated amount sits in the annual band and the
  // currency is explicit, so no other period is arithmetically available.
  return explicitCurrency && annualLike.length === amounts.length ? "year" : "unknown";
}

function rangeKind(text: string, count: number): PostedSalaryRangeKind {
  if (/\b(?:from|starting at|minimum|min\.?)\b|\+/i.test(text) && count === 1) return "minimum";
  if (/\b(?:up to|maximum|max\.?)\b/i.test(text) && count === 1) return "maximum";
  return count >= 2 ? "range" : "fixed";
}

export function parseCompanyPostedSalary(input: PostedSalaryParseInput): PostedSalaryParseResult {
  const salaryText = decodeSalaryMarkup(input.salaryText);
  const rawLocation = input.locations.join(" · ");
  const occupationKey = canonicalOccupation(input.title);
  const level = canonicalLevel(input.title, input.companySlug);
  const salaryCurrency = currency(salaryText);
  const explicitPeriod = period(salaryText);
  const location = geography(input.locations);
  let salaryPeriod = explicitPeriod;
  let amounts = salaryAmounts(salaryText, salaryPeriod);
  if (salaryPeriod === "unknown") {
    const implied = impliedAnnualPeriod(salaryText, amounts, salaryCurrency.explicit);
    if (implied === "year") {
      salaryPeriod = "year";
      amounts = salaryAmounts(salaryText, "year");
    }
  }
  const kind = rangeKind(salaryText, amounts.length);
  const rejectionReasons: string[] = [];

  if (occupationKey === "unknown") rejectionReasons.push("not_software_engineering_ic");
  if (level.level === "unknown") rejectionReasons.push("level_ambiguous");
  if (!location.acceptedScope) rejectionReasons.push("outside_spain_scope");
  if (salaryCurrency.conflict) rejectionReasons.push("currency_conflict");
  else if (salaryCurrency.code !== "EUR") rejectionReasons.push("currency_not_eur");
  if (salaryPeriod === "unknown") rejectionReasons.push("period_missing");
  if (amounts.length === 0) rejectionReasons.push("amount_missing_or_out_of_bounds");
  if (amounts.length > 2) rejectionReasons.push("multiple_compensation_amounts");

  const sortedAmounts = amounts.slice(0, 2).sort((left, right) => left - right);
  if (sortedAmounts.length === 2 && sortedAmounts[0] === sortedAmounts[1]) {
    sortedAmounts.splice(1, 1);
  }
  if (sortedAmounts.length === 2 && sortedAmounts[1] / sortedAmounts[0] > 4) {
    rejectionReasons.push("range_spread_implausible");
  }

  const qualityFlags = [
    "company_posted",
    "direct_primary_source",
    "base_salary_only",
    ...location.flags,
    ...(salaryCurrency.explicit ? ["explicit_currency"] : []),
    ...(explicitPeriod !== "unknown" ? ["explicit_period"] : salaryPeriod === "year" ? ["inferred_annual_period"] : []),
    kind === "range" ? "salary_range" : `${kind}_salary_value`,
  ];
  let confidenceScore = 0.98;
  if (location.cityKey === "remote-spain-eu") confidenceScore -= 0.06;
  if (kind !== "range") confidenceScore -= 0.04;
  if (input.locations.length > 1) confidenceScore -= 0.03;
  // A period we deduced is weaker evidence than one the employer stated.
  if (explicitPeriod === "unknown" && salaryPeriod !== "unknown") confidenceScore -= 0.08;
  if (rejectionReasons.length > 0) confidenceScore = Math.min(confidenceScore, 0.45);
  confidenceScore = Math.round(Math.max(0, confidenceScore) * 100) / 100;

  return {
    accepted: rejectionReasons.length === 0,
    occupationKey,
    canonicalLevel: level.level,
    rawLevel: level.rawLevel,
    countryCode: location.countryCode,
    cityKey: location.cityKey,
    rawLocation,
    locationLabel: location.label,
    currency: salaryCurrency.code,
    period: salaryPeriod,
    rangeKind: kind,
    minimumAmount: sortedAmounts[0],
    maximumAmount: sortedAmounts.length === 2 ? sortedAmounts[1] : sortedAmounts[0],
    confidenceScore,
    confidenceBand: rejectionReasons.length === 0 ? 0.05 : 0.25,
    qualityFlags,
    rejectionReasons,
  };
}
