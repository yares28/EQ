export type SourceCategory =
  | "salary_market"
  | "tax"
  | "social_security"
  | "housing"
  | "city_cost"
  | "occupation"
  | "currency"
  | "company_identity"
  | "company_filings"
  | "jobs";

export type AccessMode = "api" | "public_feed" | "official_release";

export interface ResearchSourceDefinition {
  key: string;
  name: string;
  category: SourceCategory;
  accessMode: AccessMode;
  authority: "official" | "company";
  url: string;
  refreshCadenceHours: number;
  maxAgeDays: number;
  productionUse: "approved" | "manual_release_check";
  limitation: string;
  license?: string;
  termsUrl?: string;
}

/**
 * Production allow-list for automated research. A source is not usable merely
 * because it is technically reachable: access mode, expected freshness, and
 * usage restrictions are part of the definition and are persisted with every
 * run in Convex.
 */
export const researchSourceRegistry: ResearchSourceDefinition[] = [
  {
    key: "ine-open-data",
    name: "INE Open Data",
    category: "salary_market",
    accessMode: "api",
    authority: "official",
    url: "https://www.ine.es/datosabiertos/",
    refreshCadenceHours: 24,
    maxAgeDays: 420,
    productionUse: "approved",
    limitation: "Official market benchmarks, not company-level compensation.",
    license: "INE public-data reuse terms; source attribution required",
    termsUrl: "https://www.ine.es/aviso_legal",
  },
  {
    key: "eurostat-earnings",
    name: "Eurostat earnings statistics",
    category: "salary_market",
    accessMode: "api",
    authority: "official",
    url: "https://ec.europa.eu/eurostat/data/web-services",
    refreshCadenceHours: 12,
    maxAgeDays: 420,
    productionUse: "approved",
    limitation:
      "Official EU comparison baseline; preserve dataset reference periods because the API only exposes the latest revision.",
  },
  {
    key: "aeat-withholding-2026",
    name: "AEAT withholding model",
    category: "tax",
    accessMode: "api",
    authority: "official",
    url: "https://sede.agenciatributaria.gob.es/Sede/Retenciones.shtml",
    refreshCadenceHours: 24,
    maxAgeDays: 35,
    productionUse: "approved",
    limitation:
      "Authentication-free official calculation service; calculates payroll withholding, not the taxpayer's final annual IRPF liability.",
  },
  {
    key: "tgss-contribution-tables-2026",
    name: "Social Security contribution tables",
    category: "social_security",
    accessMode: "public_feed",
    authority: "official",
    url: "https://www.seg-social.es/wps/portal/wss/internet/Trabajadores/10777/36537",
    refreshCadenceHours: 24,
    maxAgeDays: 35,
    productionUse: "approved",
    limitation:
      "Official 2026 employee contribution parameters; the app supports a general indefinite full-year employee, not every payroll arrangement.",
  },
  {
    key: "serpavi-rent",
    name: "SERPAVI rental reference",
    category: "housing",
    accessMode: "official_release",
    authority: "official",
    url: "https://publicaciones.transportes.gob.es/serpavi-2026-sistema-estatal-de-referencia-del-precio-del-alquiler-de-vivienda",
    refreshCadenceHours: 168,
    maxAgeDays: 420,
    productionUse: "approved",
    limitation:
      "High-authority reference with publication lag; always show the reference year and never present it as a live asking-rent feed.",
  },
  {
    key: "madrid-open-data-rent",
    name: "Comunidad de Madrid open rent statistics",
    category: "housing",
    accessMode: "api",
    authority: "official",
    url: "https://datos.comunidad.madrid/catalogo/dataset/alquiler_medio_mensual_viviendas_arrendadas_valor_catastral_municipios_mas_20000",
    refreshCadenceHours: 24,
    maxAgeDays: 420,
    productionUse: "approved",
    limitation:
      "Annual AEAT-derived declared-rent averages for habitual housing; not a live asking-rent feed.",
    license: "Creative Commons Attribution 4.0",
    termsUrl: "https://creativecommons.org/licenses/by/4.0/legalcode.es",
  },
  {
    key: "aeat-declared-rent-2024",
    name: "AEAT declared-rent statistics 2024",
    category: "housing",
    accessMode: "public_feed",
    authority: "official",
    url: "https://sede.agenciatributaria.gob.es/Sede/estadisticas/estadisticas-impuesto/estadistica-viviendas-declaradas-irpf.html",
    refreshCadenceHours: 24,
    maxAgeDays: 420,
    productionUse: "approved",
    limitation:
      "Annual mean declared rent for habitual housing, not a live asking-rent feed; the full-dwelling city reference is intentionally not personalized.",
  },
  {
    key: "ine-household-budget-madrid",
    name: "INE Madrid household budget survey",
    category: "city_cost",
    accessMode: "api",
    authority: "official",
    url: "https://www.ine.es/jaxiT3/Tabla.htm?t=73991",
    refreshCadenceHours: 24,
    maxAgeDays: 420,
    productionUse: "approved",
    limitation:
      "Definitive annual regional per-person averages; useful as a reference basket, not an individual budget or a city-level price quote.",
    license: "INE public-data reuse terms; source attribution required",
    termsUrl: "https://www.ine.es/aviso_legal",
  },
  {
    key: "crtm-fares-2026",
    name: "CRTM 2026 public transport fares",
    category: "city_cost",
    accessMode: "public_feed",
    authority: "official",
    url: "https://www.crtm.es/comunicacion/sala-de-prensa/noticias/noticias/29122025-la-comunidad-de-madrid-mantiene-los-precios-del-transporte-publico/",
    refreshCadenceHours: 24,
    maxAgeDays: 35,
    productionUse: "approved",
    limitation:
      "Zone A ordinary 30-day pass for ages 26–64 during 2026; other zones and discounted profiles have different fares.",
  },
  {
    key: "ine-household-budget-valencia",
    name: "INE Comunitat Valenciana household budget survey",
    category: "city_cost",
    accessMode: "api",
    authority: "official",
    url: "https://www.ine.es/jaxiT3/Tabla.htm?t=73991",
    refreshCadenceHours: 24,
    maxAgeDays: 420,
    productionUse: "approved",
    limitation:
      "Definitive annual regional per-person averages; useful as a reference basket, not an individual budget or a city-level price quote.",
    license: "INE public-data reuse terms; source attribution required",
    termsUrl: "https://www.ine.es/aviso_legal",
  },
  {
    key: "emt-valencia-fares-2026",
    name: "EMT València 2026 fares",
    category: "city_cost",
    accessMode: "public_feed",
    authority: "official",
    url: "https://www.emtvalencia.es/wp/tarifas-y-titulos/",
    refreshCadenceHours: 24,
    maxAgeDays: 35,
    productionUse: "approved",
    limitation:
      "MovimEMT 2026 monthly spend cap for EMT city buses only; Metrovalencia, Metrobús, and Cercanías require other titles.",
  },
  {
    key: "esco-occupations",
    name: "ESCO occupations and skills",
    category: "occupation",
    accessMode: "api",
    authority: "official",
    url: "https://esco.ec.europa.eu/en/use-esco/use-esco-services-api",
    refreshCadenceHours: 168,
    maxAgeDays: 120,
    productionUse: "approved",
    limitation: "Provides canonical occupations and skills, not company-specific levels.",
  },
  {
    key: "ecb-fx",
    name: "ECB reference exchange rates",
    category: "currency",
    accessMode: "api",
    authority: "official",
    url: "https://data.ecb.europa.eu/help/api/overview",
    refreshCadenceHours: 24,
    maxAgeDays: 5,
    productionUse: "approved",
    limitation: "Reference rates are for normalization, not executable transaction rates.",
  },
  {
    key: "gleif-entity-api",
    name: "GLEIF LEI API",
    category: "company_identity",
    accessMode: "api",
    authority: "official",
    url: "https://www.gleif.org/en/lei-data/gleif-api",
    refreshCadenceHours: 168,
    maxAgeDays: 45,
    productionUse: "approved",
    limitation: "Only entities with an LEI are covered.",
  },
  {
    key: "cnmv-filings",
    name: "CNMV regulated filings",
    category: "company_filings",
    accessMode: "public_feed",
    authority: "official",
    url: "https://www.cnmv.es/portal/consultas/busqueda.aspx",
    refreshCadenceHours: 24,
    maxAgeDays: 3,
    productionUse: "approved",
    limitation: "Covers CNMV-regulated issuers; private employers require other sources.",
  },
  {
    key: "greenhouse-job-board",
    name: "Greenhouse Job Board API",
    category: "jobs",
    accessMode: "api",
    authority: "company",
    url: "https://docs.greenhouse.io/job-board.html",
    refreshCadenceHours: 6,
    maxAgeDays: 2,
    productionUse: "approved",
    limitation: "Only companies using a discoverable public Greenhouse board are covered.",
  },
  {
    key: "lever-postings",
    name: "Lever Postings API",
    category: "jobs",
    accessMode: "api",
    authority: "company",
    url: "https://github.com/lever/postings-api",
    refreshCadenceHours: 6,
    maxAgeDays: 2,
    productionUse: "approved",
    limitation: "Only public Lever postings are covered; global and EU endpoints differ.",
  },
  {
    key: "ashby-job-postings",
    name: "Ashby Job Postings API",
    category: "jobs",
    accessMode: "api",
    authority: "company",
    url: "https://developers.ashbyhq.com/docs/public-job-posting-api",
    refreshCadenceHours: 6,
    maxAgeDays: 2,
    productionUse: "approved",
    limitation: "Only companies using a discoverable public Ashby board are covered.",
  },
  {
    key: "smartrecruiters-posting-api",
    name: "SmartRecruiters Posting API",
    category: "jobs",
    accessMode: "api",
    authority: "company",
    url: "https://developers.smartrecruiters.com/docs/posting-api",
    refreshCadenceHours: 6,
    maxAgeDays: 2,
    productionUse: "approved",
    limitation:
      "Only non-empty public boards with an exact company identity are linked; empty, test-only, internal, and ambiguous feeds remain unsupported.",
  },
  {
    key: "google-careers-public-jobs",
    name: "Google Careers public jobs",
    category: "jobs",
    accessMode: "public_feed",
    authority: "company",
    url: "https://www.google.com/about/careers/applications/jobs/results?location=Spain",
    refreshCadenceHours: 6,
    maxAgeDays: 2,
    productionUse: "approved",
    limitation:
      "Covers active Google roles returned by the official Spain location filter. Salary periods are never inferred when the posting omits them.",
  },
  {
    key: "workday-public-jobs",
    name: "Workday public career sites",
    category: "jobs",
    accessMode: "api",
    authority: "company",
    url: "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite",
    refreshCadenceHours: 6,
    maxAgeDays: 2,
    productionUse: "approved",
    limitation:
      "Only explicitly allow-listed company tenants and exact Spain-filtered public roles are linked. Compensation tied to another country is quarantined.",
  },
  {
    key: "amazon-jobs-public-search",
    name: "Amazon Jobs public search",
    category: "jobs",
    accessMode: "api",
    authority: "company",
    url: "https://www.amazon.jobs/en/search?country%5B%5D=ESP&category%5B%5D=software-development",
    refreshCadenceHours: 6,
    maxAgeDays: 2,
    productionUse: "approved",
    limitation:
      "Uses Amazon's exact ESP country and Software Development category filters. Every record must retain an explicit Spain structured location; non-EUR or non-Spain compensation is quarantined.",
  },
  {
    key: "microsoft-careers-public-search",
    name: "Microsoft Careers public search",
    category: "jobs",
    accessMode: "api",
    authority: "company",
    url: "https://apply.careers.microsoft.com/careers?location=Spain&filter_include_remote=0&filter_include_relocation=0",
    refreshCadenceHours: 6,
    maxAgeDays: 2,
    productionUse: "approved",
    limitation:
      "Uses Microsoft's official Spain search with remote and relocation expansion disabled. Every listing must retain matching Spain display and ES structured locations; only complete individual-contributor details enter software-role monitoring.",
  },
  {
    key: "apple-careers-public-search",
    name: "Apple Jobs public search",
    category: "jobs",
    accessMode: "public_feed",
    authority: "company",
    url: "https://jobs.apple.com/en-us/search?location=spain-ESPC",
    refreshCadenceHours: 6,
    maxAgeDays: 2,
    productionUse: "approved",
    limitation:
      "Reads Apple's server-rendered public job payload for the exact Spain filter. Every role and detail page must retain Apple's iso-country-ESP identity; only technical non-management roles with complete qualifications are accepted.",
  },
  {
    key: "netflix-careers-public-search",
    name: "Netflix Jobs public search",
    category: "jobs",
    accessMode: "api",
    authority: "company",
    url: "https://explore.jobs.netflix.net/careers?location=Spain",
    termsUrl: "https://explore.jobs.netflix.net/robots.txt",
    refreshCadenceHours: 6,
    maxAgeDays: 2,
    productionUse: "approved",
    limitation:
      "Reads Netflix's official job endpoint, which its published robots policy explicitly allows. Every listing must carry the netflix.com domain and an exact Spain country segment; Netflix publishes no structured role-type field, so only technical non-management titles with complete details enter software-role monitoring.",
  },
];

export const sourceRegistrySummary = {
  total: researchSourceRegistry.length,
  official: researchSourceRegistry.filter((source) => source.authority === "official").length,
  automated: researchSourceRegistry.filter(
    (source) => source.accessMode === "api" || source.accessMode === "public_feed",
  ).length,
  jobFeeds: researchSourceRegistry.filter((source) => source.category === "jobs").length,
};
