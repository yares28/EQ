/**
 * Every level an observation can carry. `staff` and `principal` exist here so a
 * posting at those levels keeps its own identity: collapsing them into `senior`
 * used to publish a principal-engineer range under a senior label.
 */
export type SalaryLevel =
  | "intern"
  | "junior"
  | "mid"
  | "senior"
  | "staff"
  | "principal";
/**
 * Spanish cities EQ can scope a salary to. This is the single list every layer
 * reads — the posting parser's city patterns, the location filter, and the
 * scope-compatibility rules — so a city cannot be detectable in a posting but
 * unreachable in the UI, which is what hid Google's Málaga ranges.
 */
export const SPAIN_CITY_LOCATIONS = [
  "Madrid",
  "Barcelona",
  "Valencia",
  "Málaga",
  "Seville",
  "Bilbao",
  "Zaragoza",
  "Alicante",
] as const;

export type SpainCityLocation = (typeof SPAIN_CITY_LOCATIONS)[number];

export type SalaryLocation =
  | SpainCityLocation
  | "Spain-wide"
  | "Remote Spain/EU"
  | "EU benchmark"
  | "Other Spain"
  | "Unknown";

export function isSpainCityLocation(value: string): value is SpainCityLocation {
  return (SPAIN_CITY_LOCATIONS as readonly string[]).includes(value);
}
export type Confidence = "High" | "Medium" | "Low" | "Unknown";
export type CompanyType =
  | "FAANG+"
  | "AI lab"
  | "AI infrastructure"
  | "Fintech"
  | "Mobility"
  | "Data infrastructure"
  | "Marketplace"
  | "Streaming"
  | "Other";

export interface SalarySource {
  id: string;
  label: string;
  url: string;
  publisher: string;
  checkedAt: string;
}

export interface SalaryPoint {
  id: string;
  level: SalaryLevel;
  levelLabel: string;
  companyLevel: string;
  location: SalaryLocation;
  locationLabel: string;
  /**
   * Base + bonus + equity + extras. Null when the publisher states base only —
   * an employer posting almost always does, and treating its base as a total
   * silently ranks it against figures that include stock.
   */
  totalCompEur: number | null;
  baseEur: number | null;
  /** The posted base band, when the source published a range rather than a point. */
  baseMinEur?: number | null;
  baseMaxEur?: number | null;
  bonusEur: number | null;
  equityEur: number | null;
  extrasEur: number | null;
  confidence: Confidence;
  confidenceNote: string;
  /** Only populated when the linked publisher explicitly discloses it. */
  sampleSize?: number | null;
  sampleNote?: string;
  sourceIds: string[];
  notes: string;
}

export interface SalaryCompany {
  canonicalName: string;
  slug: string;
  companyType: CompanyType;
  locationAvailability: SalaryLocation[];
  lastResearchedAt: string;
  sources: SalarySource[];
  salaryPoints: SalaryPoint[];
  researchNotes: string;
}

export const requiredSalaryLevels = ["intern", "junior", "mid"] as const;

export const levelLabels: Record<SalaryLevel, string> = {
  intern: "Intern",
  junior: "SDE1 / Junior",
  mid: "SDE2",
  senior: "Senior / next level",
  staff: "Staff",
  principal: "Principal",
};

export const confidenceOrder: Record<Confidence, number> = {
  High: 4,
  Medium: 3,
  Low: 2,
  Unknown: 1,
};

export const salaryCompanies: SalaryCompany[] = [
  {
    canonicalName: "Meta",
    slug: "meta",
    companyType: "FAANG+",
    locationAvailability: ["Unknown"],
    lastResearchedAt: "2026-08-25",
    sources: [],
    salaryPoints: [],
    researchNotes:
      "No source-backed Meta Spain Intern, SDE1, or SDE2 salary was found.",
  },
  {
    canonicalName: "Apple",
    slug: "apple",
    companyType: "FAANG+",
    locationAvailability: ["Spain-wide"],
    lastResearchedAt: "2026-08-27",
    sources: [
      {
        id: "levels-apple-spain",
        label: "Apple SWE salaries in Spain",
        publisher: "Levels.fyi",
        checkedAt: "2026-08-27",
        url: "https://www.levels.fyi/en-gb/companies/apple/salaries/software-engineer/locations/spain",
      },
    ],
    salaryPoints: [
      {
        id: "apple-ict2-spain-2026",
        level: "junior",
        levelLabel: "SDE1",
        companyLevel: "ICT2",
        location: "Spain-wide",
        locationLabel: "Spain-wide",
        totalCompEur: 77300,
        baseEur: 63700,
        equityEur: 12200,
        bonusEur: 1400,
        extrasEur: null,
        confidence: "Medium",
        confidenceNote:
          "Recent company-specific level source, but Spain-wide rather than Madrid, Valencia, or remote-specific.",
        sourceIds: ["levels-apple-spain"],
        notes: "Entry-level Apple SWE row on Levels.fyi; no city split found.",
      },
      {
        id: "apple-ict3-spain-2026",
        level: "mid",
        levelLabel: "SDE2",
        companyLevel: "ICT3",
        location: "Spain-wide",
        locationLabel: "Spain-wide",
        totalCompEur: 99000,
        baseEur: 68100,
        equityEur: 27900,
        bonusEur: 3000,
        extrasEur: null,
        confidence: "Medium",
        confidenceNote:
          "Recent company-specific level source, but Spain-wide rather than Madrid, Valencia, or remote-specific.",
        sourceIds: ["levels-apple-spain"],
        notes: "Mapped to mid-level because ICT3 is listed after ICT2 entry-level.",
      },
      {
        id: "apple-ict4-spain-2026",
        level: "senior",
        levelLabel: "Senior Software Engineer",
        companyLevel: "ICT4",
        location: "Spain-wide",
        locationLabel: "Spain-wide",
        totalCompEur: 178976,
        baseEur: 98500,
        equityEur: 70000,
        bonusEur: 10500,
        extrasEur: null,
        confidence: "Medium",
        confidenceNote:
          "Recent company-specific level source, but Spain-wide rather than city-specific.",
        sourceIds: ["levels-apple-spain"],
        notes: "ICT4 is Apple’s next reported level after ICT3 and is labeled Senior Software Engineer.",
      },
    ],
    researchNotes:
      "No source-backed Apple software-engineering internship salary for Spain was found. Spain-wide ICT2, ICT3, and ICT4 are available.",
  },
  {
    canonicalName: "Amazon",
    slug: "amazon",
    companyType: "FAANG+",
    locationAvailability: ["Madrid"],
    lastResearchedAt: "2026-08-27",
    sources: [
      {
        id: "glassdoor-amazon-intern-madrid",
        label: "Amazon Software Engineer Internship salaries",
        publisher: "Glassdoor",
        checkedAt: "2026-08-25",
        url: "https://www.glassdoor.es/Sueldo/Amazon-Software-Engineer-Internship-Sueldos-E6036_DAO.htm?filter.jobTitleExact=Software+Engineer%28Internship%29",
      },
      {
        id: "levels-amazon-sde-i-madrid",
        label: "Amazon SDE I in Madrid",
        publisher: "Levels.fyi",
        checkedAt: "2026-08-27",
        url: "https://www.levels.fyi/companies/amazon/salaries/software-engineer/levels/sde-i/locations/madrid-metropolitan-area",
      },
      {
        id: "levels-amazon-sde-ii-madrid",
        label: "Amazon SDE II in Madrid",
        publisher: "Levels.fyi",
        checkedAt: "2026-08-27",
        url: "https://www.levels.fyi/companies/amazon/salaries/software-engineer/levels/sde-ii/locations/madrid-metropolitan-area",
      },
      {
        id: "levels-amazon-sde-iii-madrid",
        label: "Amazon SDE III in Madrid",
        publisher: "Levels.fyi",
        checkedAt: "2026-08-27",
        url: "https://www.levels.fyi/companies/amazon/salaries/software-engineer/levels/sde-iii/locations/madrid-metropolitan-area",
      },
    ],
    salaryPoints: [
      {
        id: "amazon-internship-madrid-2026",
        level: "intern",
        levelLabel: "Intern",
        companyLevel: "Internship",
        location: "Madrid",
        locationLabel: "Madrid",
        totalCompEur: 24000,
        baseEur: 24000,
        equityEur: null,
        bonusEur: null,
        extrasEur: null,
        confidence: "Medium",
        confidenceNote:
          "Recent company + role + Madrid source; monthly amount annualized from repeated EUR 2K/month submissions.",
        sourceIds: ["glassdoor-amazon-intern-madrid"],
        notes:
          "Annualized from EUR 2K/month. Some additional-pay rows are inconsistent, so extras are left Unknown.",
      },
      {
        id: "amazon-sde-i-madrid-2026",
        level: "junior",
        levelLabel: "SDE1",
        companyLevel: "L4 / SDE I",
        location: "Madrid",
        locationLabel: "Madrid Metropolitan Area",
        totalCompEur: 58268,
        baseEur: 46700,
        equityEur: 7400,
        bonusEur: 4200,
        extrasEur: null,
        confidence: "High",
        confidenceNote: "Recent company-specific level and Madrid source.",
        sourceIds: ["levels-amazon-sde-i-madrid"],
        notes:
          "Levels.fyi total compensation includes averaged stock and sign-on bonus treatment.",
      },
      {
        id: "amazon-sde-ii-madrid-2026",
        level: "mid",
        levelLabel: "SDE2",
        companyLevel: "L5 / SDE II",
        location: "Madrid",
        locationLabel: "Madrid Metropolitan Area",
        totalCompEur: 86900,
        baseEur: 63200,
        equityEur: 23700,
        bonusEur: 0,
        extrasEur: null,
        confidence: "High",
        confidenceNote: "Recent company-specific level and Madrid source.",
        sourceIds: ["levels-amazon-sde-ii-madrid"],
        notes:
          "Levels.fyi total compensation includes averaged stock and sign-on bonus treatment.",
      },
      {
        id: "amazon-sde-iii-madrid-2026",
        level: "senior",
        levelLabel: "Senior SDE",
        companyLevel: "L6 / SDE III",
        location: "Madrid",
        locationLabel: "Madrid Metropolitan Area",
        totalCompEur: 124484,
        baseEur: 84406,
        equityEur: 40078,
        bonusEur: 0,
        extrasEur: null,
        confidence: "High",
        confidenceNote: "Recent company-specific level and Madrid source.",
        sourceIds: ["levels-amazon-sde-iii-madrid"],
        notes:
          "SDE III / L6 is Amazon’s next reported Madrid level after SDE II / L5 and is labeled Senior SDE.",
      },
    ],
    researchNotes:
      "Amazon has the most complete Madrid coverage: intern, SDE I, SDE II, and Senior SDE.",
  },
  {
    canonicalName: "Netflix",
    slug: "netflix",
    companyType: "Streaming",
    locationAvailability: ["Unknown"],
    lastResearchedAt: "2026-08-25",
    sources: [
      {
        id: "levels-netflix-global",
        label: "Netflix SWE salaries, global/US page",
        publisher: "Levels.fyi",
        checkedAt: "2026-08-25",
        url: "https://www.levels.fyi/companies/netflix/salaries/software-engineer",
      },
      {
        id: "glassdoor-netflix-spain",
        label: "Netflix Spain salaries",
        publisher: "Glassdoor",
        checkedAt: "2026-08-25",
        url: "https://www.glassdoor.es/Sueldo/Netflix-Sueldos-E11891_P6.htm",
      },
    ],
    salaryPoints: [],
    researchNotes:
      "No credible Spain software-engineer level salary was found. Global/US Netflix SWE data and non-SWE Spain roles were excluded.",
  },
  {
    canonicalName: "Google",
    slug: "google",
    companyType: "FAANG+",
    locationAvailability: ["Madrid", "Spain-wide"],
    lastResearchedAt: "2026-08-27",
    sources: [
      {
        id: "levels-google-madrid",
        label: "Google SWE salaries in Madrid",
        publisher: "Levels.fyi",
        checkedAt: "2026-08-27",
        url: "https://www.levels.fyi/companies/google/salaries/software-engineer/locations/madrid-metropolitan-area",
      },
      {
        id: "levels-google-spain",
        label: "Google SWE salaries in Spain",
        publisher: "Levels.fyi",
        checkedAt: "2026-08-27",
        url: "https://www.levels.fyi/companies/google/salaries/software-engineer/locations/spain",
      },
    ],
    salaryPoints: [
      {
        id: "google-l3-madrid-2026",
        level: "junior",
        levelLabel: "SDE1",
        companyLevel: "L3",
        location: "Madrid",
        locationLabel: "Madrid Metropolitan Area",
        totalCompEur: 95231,
        baseEur: 77500,
        equityEur: 17700,
        bonusEur: 0,
        extrasEur: null,
        confidence: "Medium",
        confidenceNote:
          "Recent Madrid-specific public source, but Levels.fyi also surfaced a conflicting L3-specific Madrid page with a higher average.",
        sourceIds: ["levels-google-madrid"],
        notes:
          "Uses the recent Madrid location summary page. A separate L3 page showed higher values, so confidence is not High.",
      },
      {
        id: "google-l4-spain-2026",
        level: "mid",
        levelLabel: "SDE2",
        companyLevel: "L4",
        location: "Spain-wide",
        locationLabel: "Spain-wide",
        totalCompEur: 89600,
        baseEur: 68900,
        equityEur: 18500,
        bonusEur: 2200,
        extrasEur: null,
        confidence: "Medium",
        confidenceNote:
          "Recent company + level source, but Spain-wide; the Madrid L4 row was unavailable.",
        sourceIds: ["levels-google-spain"],
        notes: "Do not treat as Madrid-specific or Valencia-specific.",
      },
      {
        id: "google-l5-spain-2026",
        level: "senior",
        levelLabel: "Senior SWE",
        companyLevel: "L5",
        location: "Spain-wide",
        locationLabel: "Spain-wide",
        totalCompEur: 145309,
        baseEur: 86700,
        equityEur: 40100,
        bonusEur: 18500,
        extrasEur: null,
        confidence: "Medium",
        confidenceNote:
          "Recent company + senior level source, but Spain-wide rather than city-specific; components are rounded from the public level summary.",
        sourceIds: ["levels-google-spain"],
        notes: "L5 is Google’s next reported Spain level after L4 and is labeled Senior SWE.",
      },
    ],
    researchNotes:
      "No Google Spain software-engineering internship salary was found. Madrid L4 and L5 were unavailable, so SDE2 and Senior use the same Spain-wide scope.",
  },
  {
    canonicalName: "Microsoft",
    slug: "microsoft",
    companyType: "FAANG+",
    locationAvailability: ["Spain-wide"],
    lastResearchedAt: "2026-08-27",
    sources: [
      {
        id: "levels-microsoft-spain",
        label: "Microsoft SWE salaries in Spain",
        publisher: "Levels.fyi",
        checkedAt: "2026-08-27",
        url: "https://www.levels.fyi/companies/microsoft/salaries/software-engineer/locations/spain",
      },
    ],
    salaryPoints: [
      {
        id: "microsoft-59-spain-2026",
        level: "junior",
        levelLabel: "SDE1",
        companyLevel: "59",
        location: "Spain-wide",
        locationLabel: "Spain-wide",
        totalCompEur: 58924,
        baseEur: 46900,
        equityEur: 7500,
        bonusEur: 4500,
        extrasEur: null,
        confidence: "Medium",
        confidenceNote:
          "Recent company-specific level source, but Spain-wide rather than city-specific.",
        sourceIds: ["levels-microsoft-spain"],
        notes: "Entry-level Microsoft SDE row.",
      },
      {
        id: "microsoft-61-spain-2026",
        level: "mid",
        levelLabel: "SDE2",
        companyLevel: "61",
        location: "Spain-wide",
        locationLabel: "Spain-wide",
        totalCompEur: 84900,
        baseEur: 59900,
        equityEur: 16900,
        bonusEur: 8100,
        extrasEur: null,
        confidence: "Medium",
        confidenceNote:
          "Recent company-specific level source, but Spain-wide rather than city-specific.",
        sourceIds: ["levels-microsoft-spain"],
        notes: "Level 61 is the first SDE II row in the Spain source.",
      },
      {
        id: "microsoft-62-spain-2026",
        level: "senior",
        levelLabel: "Next reported level",
        companyLevel: "62",
        location: "Spain-wide",
        locationLabel: "Spain-wide",
        totalCompEur: 103000,
        baseEur: 68000,
        equityEur: 25600,
        bonusEur: 9100,
        extrasEur: null,
        confidence: "Medium",
        confidenceNote:
          "Recent company-specific level source, but Spain-wide rather than city-specific.",
        sourceIds: ["levels-microsoft-spain"],
        notes: "Level 62 is the immediate reported level after Microsoft SDE II level 61; Senior SDE starts at 63.",
      },
    ],
    researchNotes:
      "No source-backed software-engineering internship salary for Microsoft Spain was found. Levels 59, 61, and the immediate next level 62 are retained for like-for-like progression.",
  },
  {
    canonicalName: "OpenAI",
    slug: "openai",
    companyType: "AI lab",
    locationAvailability: ["Unknown"],
    lastResearchedAt: "2026-08-25",
    sources: [
      {
        id: "openai-salario-2026",
        label: "OpenAI 2026 salary snapshot",
        publisher: "Salario.io",
        checkedAt: "2026-08-25",
        url: "https://salario.io/company/openai/",
      },
    ],
    salaryPoints: [],
    researchNotes:
      "No Spain, Madrid, Valencia, or remote Spain/EU OpenAI software-engineer salary source was found. US/global data was excluded.",
  },
  {
    canonicalName: "Nvidia",
    slug: "nvidia",
    companyType: "AI infrastructure",
    locationAvailability: ["Unknown"],
    lastResearchedAt: "2026-08-25",
    sources: [
      {
        id: "levels-nvidia-global",
        label: "Nvidia global SWE salaries",
        publisher: "Levels.fyi",
        checkedAt: "2026-08-25",
        url: "https://www.levels.fyi/companies/nvidia/salaries",
      },
    ],
    salaryPoints: [],
    researchNotes:
      "No credible Spain software-engineer level salary was found. Global Nvidia compensation was excluded from Spain comparisons.",
  },
  {
    canonicalName: "Stripe",
    slug: "stripe",
    companyType: "Fintech",
    locationAvailability: ["Unknown"],
    lastResearchedAt: "2026-08-25",
    sources: [],
    salaryPoints: [],
    researchNotes:
      "No source-backed Stripe Spain Intern, SDE1, or SDE2 salary was found.",
  },
  {
    canonicalName: "Uber",
    slug: "uber",
    companyType: "Mobility",
    locationAvailability: ["Unknown"],
    lastResearchedAt: "2026-08-25",
    sources: [
      {
        id: "levels-uber-global",
        label: "Uber global SWE salaries",
        publisher: "Levels.fyi",
        checkedAt: "2026-08-25",
        url: "https://www.levels.fyi/companies/uber/salaries/software-engineer",
      },
    ],
    salaryPoints: [],
    researchNotes:
      "No credible Spain software-engineer level salary was found. A Murcia all-level leaderboard signal was excluded because it did not provide requested level mapping or breakdown.",
  },
  {
    canonicalName: "Databricks",
    slug: "databricks",
    companyType: "Data infrastructure",
    locationAvailability: ["Unknown"],
    lastResearchedAt: "2026-08-25",
    sources: [
      {
        id: "levels-databricks-global",
        label: "Databricks global SWE salaries",
        publisher: "Levels.fyi",
        checkedAt: "2026-08-25",
        url: "https://www.levels.fyi/companies/databricks/salaries/software-engineer",
      },
    ],
    salaryPoints: [],
    researchNotes:
      "No Spain-specific Databricks software-engineer level salary was found. Berlin/Amsterdam and US data were excluded from Spain rows.",
  },
  {
    canonicalName: "Airbnb",
    slug: "airbnb",
    companyType: "Marketplace",
    locationAvailability: ["Unknown"],
    lastResearchedAt: "2026-08-25",
    sources: [
      {
        id: "levels-airbnb-global",
        label: "Airbnb global SWE salaries",
        publisher: "Levels.fyi",
        checkedAt: "2026-08-25",
        url: "https://www.levels.fyi/companies/airbnb/salaries/software-engineer",
      },
    ],
    salaryPoints: [],
    researchNotes:
      "No credible Spain, Madrid, Valencia, or remote Spain/EU Airbnb software-engineer salary source was found. US/global data was excluded.",
  },
];

export const salaryCompaniesByName = new Map(
  salaryCompanies.map((company) => [company.canonicalName.toLowerCase(), company])
);
