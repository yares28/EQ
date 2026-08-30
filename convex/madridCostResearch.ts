import { v } from "convex/values";

import { evaluateCityCostReadiness } from "../lib/city-cost-readiness";
import {
  normalizedOfficialText,
  parseAeatDeclaredRentRow,
  validateEmtValencia2026Fare,
} from "../lib/official-city-cost-parsers";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import {
  internalAction,
  internalMutation,
  query,
} from "./_generated/server";

const MADRID_INE_SOURCE_KEY = "ine-household-budget-madrid";
const VALENCIA_INE_SOURCE_KEY = "ine-household-budget-valencia";
const CRTM_SOURCE_KEY = "crtm-fares-2026";
const EMT_SOURCE_KEY = "emt-valencia-fares-2026";
const AEAT_RENT_SOURCE_KEY = "aeat-declared-rent-2024";
const INE_API_ROOT = "https://servicios.ine.es/wstempus/js/ES";
const INE_GROUP_TABLE_URL = "https://www.ine.es/jaxiT3/Tabla.htm?t=73991";
const INE_DETAIL_TABLE_URL = "https://www.ine.es/jaxiT3/Tabla.htm?t=73993";
const CRTM_FARE_URL =
  "https://www.crtm.es/comunicacion/sala-de-prensa/noticias/noticias/29122025-la-comunidad-de-madrid-mantiene-los-precios-del-transporte-publico/";
const EMT_FARE_URL = "https://www.emtvalencia.es/wp/tarifas-y-titulos/";
const AEAT_RENT_URL =
  "https://sede.agenciatributaria.gob.es/AEAT/Contenidos_Comunes/La_Agencia_Tributaria/Estadisticas/Publicaciones/sites/irpfvivienda/2024/jrubikf51e805519b77c14638914bf8be47b12345122c36.html";
const MAX_INE_RESPONSE_CHARACTERS = 180_000;
const MAX_OFFICIAL_HTML_CHARACTERS = 900_000;
const ZONE_A_2026_MONTHLY_FARE_EUR = 32.7;
const MOVIMEMT_2026_MONTHLY_CAP_EUR = 21;

interface IneCostDefinition {
  code: string;
  componentKey:
    | "groceries"
    | "communications"
    | "water"
    | "sanitation"
    | "waste"
    | "electricity"
    | "gas"
    | "liquid_fuels";
  groupVariable: string;
  rawCategory: string;
  monthlyMinimum: number;
  monthlyMaximum: number;
}

interface IneRegionConfig {
  sourceKey: string;
  cityKey: string;
  rawGeography: string;
  observationGeographyKey: string;
  parserVersion: string;
  errorCode: string;
  series: readonly IneCostDefinition[];
}

const ineCostSeries = [
  {
    code: "EPF566167",
    componentKey: "groceries",
    groupVariable: "Grupos ECOICOP",
    rawCategory: "Alimentos y bebidas no alcohólicas",
    monthlyMinimum: 100,
    monthlyMaximum: 400,
  },
  {
    code: "EPF566174",
    componentKey: "communications",
    groupVariable: "Grupos ECOICOP",
    rawCategory: "Información y comunicaciones",
    monthlyMinimum: 10,
    monthlyMaximum: 100,
  },
  {
    code: "EPF542356",
    componentKey: "water",
    groupVariable: "Clases COICOP/EPF",
    rawCategory: "Suministro de agua",
    monthlyMinimum: 1,
    monthlyMaximum: 50,
  },
  {
    code: "EPF542360",
    componentKey: "sanitation",
    groupVariable: "Clases COICOP/EPF",
    rawCategory: "Servicio de saneamiento",
    monthlyMinimum: 0.01,
    monthlyMaximum: 30,
  },
  {
    code: "EPF542520",
    componentKey: "waste",
    groupVariable: "Clases COICOP/EPF",
    rawCategory: "Servicio de recogida de basura",
    monthlyMinimum: 0.01,
    monthlyMaximum: 30,
  },
  {
    code: "EPF542364",
    componentKey: "electricity",
    groupVariable: "Clases COICOP/EPF",
    rawCategory: "Electricidad",
    monthlyMinimum: 5,
    monthlyMaximum: 100,
  },
  {
    code: "EPF542368",
    componentKey: "gas",
    groupVariable: "Clases COICOP/EPF",
    rawCategory: "Gas",
    monthlyMinimum: 1,
    monthlyMaximum: 80,
  },
  {
    code: "EPF542372",
    componentKey: "liquid_fuels",
    groupVariable: "Clases COICOP/EPF",
    rawCategory: "Combustibles líquidos",
    monthlyMinimum: 0.01,
    monthlyMaximum: 50,
  },
] as const;

const valenciaIneCostSeries = [
  { ...ineCostSeries[0], code: "EPF565663" },
  { ...ineCostSeries[1], code: "EPF565670" },
  { ...ineCostSeries[2], code: "EPF541204" },
  { ...ineCostSeries[3], code: "EPF541208" },
  { ...ineCostSeries[4], code: "EPF541368" },
  { ...ineCostSeries[5], code: "EPF541212" },
  { ...ineCostSeries[6], code: "EPF541216" },
  { ...ineCostSeries[7], code: "EPF541220" },
] as const;

const madridIneConfig: IneRegionConfig = {
  sourceKey: MADRID_INE_SOURCE_KEY,
  cityKey: "madrid-region",
  rawGeography: "Madrid, Comunidad de",
  observationGeographyKey: "comunidad-madrid",
  parserVersion: "ine-epf-madrid-essential-costs-v2",
  errorCode: "ine_madrid_costs_failed",
  series: ineCostSeries,
};

const valenciaIneConfig: IneRegionConfig = {
  sourceKey: VALENCIA_INE_SOURCE_KEY,
  cityKey: "valencia-region",
  rawGeography: "Comunitat Valenciana",
  observationGeographyKey: "comunitat-valenciana",
  parserVersion: "ine-epf-valencia-essential-costs-v1",
  errorCode: "ine_valencia_costs_failed",
  series: valenciaIneCostSeries,
};

const sharedPublicCostDefinitions = [
  {
    category: "groceries" as const,
    label: "Groceries",
    datasetUrl: INE_GROUP_TABLE_URL,
  },
  {
    category: "utilities" as const,
    label: "Utilities",
    datasetUrl: INE_DETAIL_TABLE_URL,
  },
  {
    category: "communications" as const,
    label: "Connectivity",
    datasetUrl: INE_GROUP_TABLE_URL,
  },
] as const;

const costCityConfigs = {
  "madrid-city": {
    cityLabel: "Madrid",
    regionKey: "madrid-region",
    transportLabel: "Zone A transit",
    transportUrl: CRTM_FARE_URL,
  },
  "valencia-city": {
    cityLabel: "Valencia",
    regionKey: "valencia-region",
    transportLabel: "EMT city-bus cap",
    transportUrl: EMT_FARE_URL,
  },
} as const;

const cityKeyValidator = v.union(v.literal("madrid-city"), v.literal("valencia-city"));

const costCategoryValidator = v.union(
  v.literal("rent"),
  v.literal("groceries"),
  v.literal("utilities"),
  v.literal("communications"),
  v.literal("transport"),
);

type JsonRecord = Record<string, unknown>;

interface FetchedJson {
  payload: JsonRecord;
  serialized: string;
  httpStatus: number;
}

interface FetchedText {
  text: string;
  contentType: string;
  httpStatus: number;
}

interface IneCostValue {
  definition: IneCostDefinition;
  annualAmount: number;
  referenceYear: number;
  sourceUpdatedAt: number;
  rawPayload: unknown;
}

class CityCostError extends Error {
  constructor(
    message: string,
    readonly httpStatus?: number,
  ) {
    super(message);
  }
}

function safeMessage(error: unknown): string {
  return error instanceof Error
    ? error.message.slice(0, 500)
    : "Unknown city recurring-cost refresh error.";
}

function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function fetchJson(url: string): Promise<FetchedJson> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "EQ Spain city cost research monitor/1.0",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_INE_RESPONSE_CHARACTERS) {
    throw new CityCostError("INE response exceeded the size limit.", response.status);
  }
  const serialized = await response.text();
  if (serialized.length > MAX_INE_RESPONSE_CHARACTERS) {
    throw new CityCostError("INE response exceeded the size limit.", response.status);
  }
  if (!response.ok) {
    throw new CityCostError(`INE returned HTTP ${response.status}.`, response.status);
  }
  let payload: JsonRecord;
  try {
    const parsed = record(JSON.parse(serialized) as unknown);
    if (parsed === null) throw new Error("not an object");
    payload = parsed;
  } catch {
    throw new CityCostError("INE returned invalid JSON.", response.status);
  }
  return { payload, serialized, httpStatus: response.status };
}

async function fetchText(url: string, timeoutMs = 20_000): Promise<FetchedText> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "text/html",
      "User-Agent": "EQ Spain city cost research monitor/1.0",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_OFFICIAL_HTML_CHARACTERS) {
    throw new CityCostError("Official HTML response exceeded the size limit.", response.status);
  }
  const text = await response.text();
  if (text.length > MAX_OFFICIAL_HTML_CHARACTERS) {
    throw new CityCostError("Official HTML response exceeded the size limit.", response.status);
  }
  if (!response.ok) {
    throw new CityCostError(`Official source returned HTTP ${response.status}.`, response.status);
  }
  return {
    text,
    contentType: response.headers.get("content-type") ?? "text/html",
    httpStatus: response.status,
  };
}

function metadataValue(payload: JsonRecord, variableName: string): string | null {
  if (!Array.isArray(payload.MetaData)) return null;
  for (const item of payload.MetaData) {
    const metadata = record(item);
    const variable = record(metadata?.Variable);
    if (variable?.Nombre === variableName && typeof metadata?.Nombre === "string") {
      return metadata.Nombre;
    }
  }
  return null;
}

async function fetchIneCostValue(
  definition: IneCostDefinition,
  rawGeography: string,
): Promise<IneCostValue> {
  const dataUrl = `${INE_API_ROOT}/DATOS_SERIE/${definition.code}?det=2&tip=AM&nult=1`;
  const metadataUrl = `${INE_API_ROOT}/SERIE/${definition.code}?det=2&tip=AM`;
  const [dataResponse, metadataResponse] = await Promise.all([
    fetchJson(dataUrl),
    fetchJson(metadataUrl),
  ]);
  const data = dataResponse.payload;
  const metadata = metadataResponse.payload;
  if (data.COD !== definition.code || metadata.COD !== definition.code) {
    throw new CityCostError(`INE series identity changed for ${definition.code}.`);
  }
  const unit = record(data.Unidad);
  if (unit?.Nombre !== "Euros" || unit.Abrev !== "€") {
    throw new CityCostError(`INE unit changed for ${definition.code}.`);
  }
  if (
    metadataValue(data, "Comunidades y Ciudades Autónomas") !== rawGeography ||
    metadataValue(data, "Tipo de dato") !== "Dato base" ||
    metadataValue(
      data,
      "Gastos totales, medios, distribución porcentual e índices sobre la media del gasto",
    ) !== "Gasto medio por persona" ||
    metadataValue(data, definition.groupVariable) !== definition.rawCategory
  ) {
    throw new CityCostError(`INE series semantics changed for ${definition.code}.`);
  }
  if (!Array.isArray(data.Data) || data.Data.length !== 1) {
    throw new CityCostError(`INE did not return one latest value for ${definition.code}.`);
  }
  const latest = record(data.Data[0]);
  const type = record(latest?.TipoDato);
  const period = record(latest?.Periodo);
  const annualAmount = latest?.Valor;
  const referenceYear = latest?.Anyo;
  if (
    type?.Nombre !== "Definitivo" ||
    period?.Nombre !== "A" ||
    typeof annualAmount !== "number" ||
    !Number.isFinite(annualAmount) ||
    annualAmount / 12 < definition.monthlyMinimum ||
    annualAmount / 12 > definition.monthlyMaximum ||
    typeof referenceYear !== "number" ||
    !Number.isInteger(referenceYear) ||
    referenceYear < 2025
  ) {
    throw new CityCostError(`INE returned an invalid latest value for ${definition.code}.`);
  }
  const publication = record(metadata.Publicacion);
  const publicationUpdate = record(publication?.PubFechaAct);
  const sourceUpdatedAt = typeof publicationUpdate?.Fecha === "string"
    ? Date.parse(publicationUpdate.Fecha)
    : Number.NaN;
  if (
    publication?.Nombre !== "Encuesta de Presupuestos Familiares" ||
    publicationUpdate?.Anyo !== referenceYear ||
    !Number.isFinite(sourceUpdatedAt)
  ) {
    throw new CityCostError(`INE publication metadata changed for ${definition.code}.`);
  }
  return {
    definition,
    annualAmount,
    referenceYear,
    sourceUpdatedAt,
    rawPayload: {
      dataUrl,
      metadataUrl,
      data,
      metadata,
    },
  };
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function validateCrtm2026Fare(html: string): void {
  const text = normalizedOfficialText(html);
  const requiredFragments = [
    "29 de diciembre de 2025",
    "2026",
    "usuarios de entre 26 y 64 años",
    "zona A conserva la tarifa de 32,70",
    "B1 38,20",
    "B2 43,20",
    "B3, C1 y C2: 49,20",
  ];
  const missing = requiredFragments.filter((fragment) => !text.includes(fragment));
  if (missing.length > 0) {
    throw new CityCostError(
      `CRTM 2026 fare evidence changed or disappeared: ${missing.join(", ")}.`,
    );
  }
}

export const upsertLivingCostObservation = internalMutation({
  args: {
    sourceId: v.id("sourceRegistry"),
    snapshotId: v.id("rawSnapshots"),
    observationKey: v.string(),
    cityKey: v.string(),
    geographyLevel: v.union(v.literal("city"), v.literal("region")),
    rawGeography: v.string(),
    category: costCategoryValidator,
    statistic: v.union(v.literal("mean"), v.literal("fixed")),
    metric: v.optional(v.union(v.literal("monthly_amount"), v.literal("per_square_meter"))),
    amount: v.number(),
    unit: v.string(),
    housingType: v.optional(v.string()),
    sampleSize: v.optional(v.number()),
    referenceYear: v.number(),
    sourceUpdatedAt: v.number(),
    observedAt: v.number(),
  },
  returns: v.object({ inserted: v.boolean() }),
  handler: async (ctx, args) => {
    const observations = await ctx.db
      .query("cityCostObservations")
      .withIndex("by_sourceId_and_observationKey", (q) =>
        q.eq("sourceId", args.sourceId).eq("observationKey", args.observationKey),
      )
      .collect();
    const current = observations
      .filter((observation) => observation.status === "accepted")
      .sort((a, b) => b.observedAt - a.observedAt)[0];
    if (
      current !== undefined &&
      current.amount === args.amount &&
      current.sourceUpdatedAt === args.sourceUpdatedAt
    ) {
      await ctx.db.patch(current._id, {
        snapshotId: args.snapshotId,
        observedAt: args.observedAt,
      });
      return { inserted: false };
    }
    if (current !== undefined) {
      await ctx.db.patch(current._id, {
        status: "superseded",
        effectiveTo: args.observedAt,
      });
    }
    const isRent = args.category === "rent";
    const officialSurvey = args.statistic === "mean" && !isRent;
    await ctx.db.insert("cityCostObservations", {
      cityKey: args.cityKey,
      sourceId: args.sourceId,
      snapshotId: args.snapshotId,
      observationKey: args.observationKey,
      geographyLevel: args.geographyLevel,
      rawGeography: args.rawGeography,
      category: args.category,
      metric: args.metric ?? "monthly_amount",
      statistic: args.statistic,
      amount: args.amount,
      currency: "EUR",
      unit: args.unit,
      housingType: args.housingType,
      sampleSize: args.sampleSize,
      referenceYear: args.referenceYear,
      sourceUpdatedAt: args.sourceUpdatedAt,
      observedAt: args.observedAt,
      effectiveFrom: args.sourceUpdatedAt,
      confidenceScore: isRent ? 0.96 : officialSurvey ? 0.9 : 0.99,
      confidenceBand: isRent ? 0.04 : officialSurvey ? 0.08 : 0,
      qualityFlags: isRent
        ? [
            "official_aeat_declared_rent",
            "habitual_housing",
            "city_average",
            "full_dwelling",
            "annual_reference",
            "not_live_asking_rent",
          ]
        : officialSurvey
        ? [
            "official_household_budget_survey",
            "regional_average",
            "per_person",
            "annual_reference",
            "not_personal_budget",
          ]
        : args.cityKey === "valencia-city"
          ? [
              "official_current_fare",
              "emt_city_bus_only",
              "monthly_spend_cap",
              "not_all_transport_spending",
            ]
          : [
            "official_current_fare",
            "zone_a",
            "ordinary_age_26_64",
            "not_all_transport_spending",
          ],
      status: "accepted",
    });
    return { inserted: true };
  },
});

const publicCostItemValidator = v.object({
  key: v.string(),
  category: costCategoryValidator,
  label: v.string(),
  monthlyAmount: v.number(),
  referenceYear: v.number(),
  sourceUpdatedAt: v.number(),
  checkedAt: v.number(),
  datasetUrl: v.string(),
});

export const latestCityLivingCosts = query({
  args: { cityKey: cityKeyValidator },
  returns: v.union(
    v.object({
      cityKey: cityKeyValidator,
      cityLabel: v.string(),
      current: v.boolean(),
      unmetRequirements: v.array(v.string()),
      readinessNote: v.string(),
      monthlyRentEur: v.number(),
      rentPerSquareMeterEur: v.number(),
      rentSampleSize: v.number(),
      monthlyEssentialsEur: v.number(),
      monthlyReferenceCostEur: v.number(),
      checkedAt: v.number(),
      housingReferenceYear: v.number(),
      householdBudgetReferenceYear: v.number(),
      transportReferenceYear: v.number(),
      items: v.array(publicCostItemValidator),
      sourceUrls: v.object({ ine: v.string(), rent: v.string(), transport: v.string() }),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const config = costCityConfigs[args.cityKey];
    const publicCostDefinitions = [
      ...sharedPublicCostDefinitions,
      {
        category: "transport" as const,
        label: config.transportLabel,
        datasetUrl: config.transportUrl,
      },
    ];
    const [regionObservations, cityObservations] = await Promise.all([
      ctx.db
        .query("cityCostObservations")
        .withIndex("by_city_and_status", (q) =>
          q.eq("cityKey", config.regionKey).eq("status", "accepted"),
        )
        .collect(),
      ctx.db
        .query("cityCostObservations")
        .withIndex("by_city_and_status", (q) =>
          q.eq("cityKey", args.cityKey).eq("status", "accepted"),
        )
        .collect(),
    ]);
    const accepted = [...regionObservations, ...cityObservations];
    const items = publicCostDefinitions.flatMap((definition) => {
      const observation = accepted
        .filter(
          (item) =>
            item.category === definition.category && item.metric === "monthly_amount",
        )
        .sort((a, b) => b.observedAt - a.observedAt)[0];
      return observation === undefined
        ? []
        : [{
            key: observation.observationKey,
            category: definition.category,
            label: definition.label,
            monthlyAmount: observation.amount,
            referenceYear: observation.referenceYear,
            sourceUpdatedAt: observation.sourceUpdatedAt,
            checkedAt: observation.observedAt,
            datasetUrl: definition.datasetUrl,
            sourceId: observation.sourceId,
          }];
    });
    if (items.length !== publicCostDefinitions.length) return null;

    const rentCandidates = cityObservations.filter((item) => item.category === "rent");
    const rentMonthly = rentCandidates
      .filter((item) => item.metric === "monthly_amount" && item.sampleSize !== undefined)
      .sort((a, b) => b.observedAt - a.observedAt)[0];
    const rentPerSquareMeter = rentCandidates
      .filter(
        (item) =>
          item.metric === "per_square_meter" &&
          rentMonthly !== undefined &&
          item.referenceYear === rentMonthly.referenceYear &&
          item.sourceId === rentMonthly.sourceId,
      )
      .sort((a, b) => b.observedAt - a.observedAt)[0];
    if (
      rentMonthly === undefined ||
      rentPerSquareMeter === undefined ||
      rentMonthly.sampleSize === undefined ||
      rentMonthly.referenceYear !== rentPerSquareMeter.referenceYear ||
      rentMonthly.sourceId !== rentPerSquareMeter.sourceId
    ) return null;

    const uniqueSourceIds = [
      ...new Set([
        ...items.map((item) => item.sourceId),
        rentMonthly.sourceId,
        rentPerSquareMeter.sourceId,
      ]),
    ];
    const sources = await Promise.all(uniqueSourceIds.map((sourceId) => ctx.db.get(sourceId)));
    const now = Date.now();
    const readiness = evaluateCityCostReadiness({
      now,
      requiredCategories: publicCostDefinitions.map((definition) => definition.category),
      presentCategories: items.map((item) => item.category),
      rent: {
        monthlyAmountEur: rentMonthly.amount,
        perSquareMeterEur: rentPerSquareMeter.amount,
        sampleSize: rentMonthly.sampleSize ?? null,
        monthlyReferenceYear: rentMonthly.referenceYear,
        perSquareMeterReferenceYear: rentPerSquareMeter.referenceYear,
        sharesSource: rentMonthly.sourceId === rentPerSquareMeter.sourceId,
      },
      sources: sources.map((source, index) => ({
        key: source?.key ?? String(uniqueSourceIds[index]),
        health: source?.health ?? "unknown",
        lastSuccessfulAt: source?.lastSuccessfulAt ?? null,
        maxStalenessMs: (source?.maxStalenessMinutes ?? 0) * 60_000,
      })),
    });
    const current = readiness.status === "current";
    const groceries = items.find((item) => item.category === "groceries");
    const transport = items.find((item) => item.category === "transport");
    if (groceries === undefined || transport === undefined) return null;
    const monthlyEssentialsEur = roundCurrency(
      items.reduce((total, item) => total + item.monthlyAmount, 0),
    );
    return {
      cityKey: args.cityKey,
      cityLabel: config.cityLabel,
      current,
      unmetRequirements: readiness.unmet,
      readinessNote: readiness.explanation,
      monthlyRentEur: rentMonthly.amount,
      rentPerSquareMeterEur: rentPerSquareMeter.amount,
      rentSampleSize: rentMonthly.sampleSize,
      monthlyEssentialsEur,
      monthlyReferenceCostEur: roundCurrency(rentMonthly.amount + monthlyEssentialsEur),
      checkedAt: Math.min(
        rentMonthly.observedAt,
        rentPerSquareMeter.observedAt,
        ...items.map((item) => item.checkedAt),
      ),
      housingReferenceYear: rentMonthly.referenceYear,
      householdBudgetReferenceYear: groceries.referenceYear,
      transportReferenceYear: transport.referenceYear,
      items: items.map((item) => ({
        key: item.key,
        category: item.category,
        label: item.label,
        monthlyAmount: item.monthlyAmount,
        referenceYear: item.referenceYear,
        sourceUpdatedAt: item.sourceUpdatedAt,
        checkedAt: item.checkedAt,
        datasetUrl: item.datasetUrl,
      })),
      sourceUrls: {
        ine: INE_GROUP_TABLE_URL,
        rent: AEAT_RENT_URL,
        transport: config.transportUrl,
      },
    };
  },
});

async function refreshIneCosts(ctx: ActionCtx, config: IneRegionConfig): Promise<void> {
  const dailyBucket = Math.floor(Date.now() / (24 * 60 * 60_000));
  const urls = config.series.flatMap((definition) => [
    `${INE_API_ROOT}/DATOS_SERIE/${definition.code}?det=2&tip=AM&nult=1`,
    `${INE_API_ROOT}/SERIE/${definition.code}?det=2&tip=AM`,
  ]);
  const run = await ctx.runMutation(internal.sourceMaintenance.beginOfficialRun, {
    sourceKey: config.sourceKey,
    runKey: `${config.sourceKey}:${dailyBucket}`,
    requestHash: await sha256(urls.join("\n")),
    parserVersion: config.parserVersion,
  });
  if (run === null) return;
  try {
    const settledValues = await Promise.allSettled(
      config.series.map((definition) => fetchIneCostValue(definition, config.rawGeography)),
    );
    const failedValue = settledValues.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failedValue !== undefined) throw failedValue.reason;
    const values = settledValues.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    const referenceYears = new Set(values.map((value) => value.referenceYear));
    const sourceUpdateDates = new Set(values.map((value) => value.sourceUpdatedAt));
    if (referenceYears.size !== 1 || sourceUpdateDates.size !== 1) {
      throw new CityCostError(`INE ${config.rawGeography} cost series do not share one release.`);
    }
    const byComponent = new Map(
      values.map((value) => [value.definition.componentKey, value.annualAmount]),
    );
    const valueFor = (key: IneCostDefinition["componentKey"]): number => {
      const amount = byComponent.get(key);
      if (amount === undefined) throw new CityCostError(`INE omitted ${key}.`);
      return amount;
    };
    const monthlyCosts = [
      {
        category: "groceries" as const,
        amount: roundCurrency(valueFor("groceries") / 12),
      },
      {
        category: "utilities" as const,
        amount: roundCurrency(
          (
            valueFor("water") +
            valueFor("sanitation") +
            valueFor("waste") +
            valueFor("electricity") +
            valueFor("gas") +
            valueFor("liquid_fuels")
          ) / 12,
        ),
      },
      {
        category: "communications" as const,
        amount: roundCurrency(valueFor("communications") / 12),
      },
    ];
    const utilities = monthlyCosts.find((item) => item.category === "utilities");
    if (utilities === undefined || utilities.amount < 20 || utilities.amount > 150) {
      throw new CityCostError("INE utilities aggregate fell outside validation bounds.");
    }
    const observedAt = Date.now();
    const referenceYear = values[0]?.referenceYear;
    const sourceUpdatedAt = values[0]?.sourceUpdatedAt;
    if (referenceYear === undefined || sourceUpdatedAt === undefined) {
      throw new CityCostError(`INE ${config.rawGeography} cost release was empty.`);
    }
    const rawPayload = values.map((value) => value.rawPayload);
    const responseHash = await sha256(JSON.stringify(rawPayload));
    const snapshot = await ctx.runMutation(internal.sourceMaintenance.recordSnapshot, {
      runId: run.runId,
      sourceUrl: INE_GROUP_TABLE_URL,
      externalId: `ine-epf-${config.observationGeographyKey}-essential-costs:${referenceYear}`,
      contentHash: responseHash,
      mimeType: "application/json",
      observedAt,
      effectiveAt: sourceUpdatedAt,
      payload: rawPayload,
    });
    for (const cost of monthlyCosts) {
      await ctx.runMutation(internal.madridCostResearch.upsertLivingCostObservation, {
        sourceId: run.sourceId,
        snapshotId: snapshot.snapshotId,
        observationKey: `ine-epf:${config.observationGeographyKey}:${cost.category}:mean-per-person-month:${referenceYear}`,
        cityKey: config.cityKey,
        geographyLevel: "region",
        rawGeography: config.rawGeography,
        category: cost.category,
        statistic: "mean",
        amount: cost.amount,
        unit: "EUR/person/month",
        referenceYear,
        sourceUpdatedAt,
        observedAt,
      });
    }
    await ctx.runMutation(internal.sourceMaintenance.completeRun, {
      runId: run.runId,
      status: "succeeded",
      responseHash,
      recordsSeen: values.length,
      recordsAccepted: values.length,
      recordsRejected: 0,
      httpStatus: 200,
    });
  } catch (error) {
    try {
      await ctx.runMutation(internal.sourceMaintenance.completeRun, {
        runId: run.runId,
        status: "failed",
        recordsSeen: config.series.length,
        recordsAccepted: 0,
        recordsRejected: config.series.length,
        httpStatus: error instanceof CityCostError ? error.httpStatus : undefined,
        errorCode: config.errorCode,
        errorMessage: safeMessage(error),
      });
    } catch {
      // A completion mutation can commit before a transport error is returned.
    }
  }
}

async function refreshCrtmFare(ctx: ActionCtx): Promise<void> {
  const dailyBucket = Math.floor(Date.now() / (24 * 60 * 60_000));
  const run = await ctx.runMutation(internal.sourceMaintenance.beginOfficialRun, {
    sourceKey: CRTM_SOURCE_KEY,
    runKey: `${CRTM_SOURCE_KEY}:${dailyBucket}`,
    requestHash: await sha256(CRTM_FARE_URL),
    parserVersion: "crtm-zone-a-2026-conformance-v1",
  });
  if (run === null) return;
  try {
    const response = await fetchText(CRTM_FARE_URL);
    validateCrtm2026Fare(response.text);
    const observedAt = Date.now();
    const sourceUpdatedAt = Date.UTC(2025, 11, 29);
    const responseHash = await sha256(response.text);
    const snapshot = await ctx.runMutation(internal.sourceMaintenance.recordSnapshot, {
      runId: run.runId,
      sourceUrl: CRTM_FARE_URL,
      externalId: `crtm-zone-a-ordinary-30-day:2026`,
      contentHash: responseHash,
      mimeType: response.contentType,
      observedAt,
      effectiveAt: Date.UTC(2026, 0, 1),
      payload: response.text,
    });
    await ctx.runMutation(internal.madridCostResearch.upsertLivingCostObservation, {
      sourceId: run.sourceId,
      snapshotId: snapshot.snapshotId,
      observationKey: "crtm:madrid-zone-a:ordinary-age-26-64:30-day:2026",
      cityKey: "madrid-city",
      geographyLevel: "city",
      rawGeography: "Madrid Zone A",
      category: "transport",
      statistic: "fixed",
      amount: ZONE_A_2026_MONTHLY_FARE_EUR,
      unit: "EUR/30-day pass",
      referenceYear: 2026,
      sourceUpdatedAt,
      observedAt,
    });
    await ctx.runMutation(internal.sourceMaintenance.completeRun, {
      runId: run.runId,
      status: "succeeded",
      responseHash,
      recordsSeen: 1,
      recordsAccepted: 1,
      recordsRejected: 0,
      httpStatus: response.httpStatus,
    });
  } catch (error) {
    try {
      await ctx.runMutation(internal.sourceMaintenance.completeRun, {
        runId: run.runId,
        status: "failed",
        recordsSeen: 1,
        recordsAccepted: 0,
        recordsRejected: 1,
        httpStatus: error instanceof CityCostError ? error.httpStatus : undefined,
        errorCode: "crtm_2026_fare_failed",
        errorMessage: safeMessage(error),
      });
    } catch {
      // A completion mutation can commit before a transport error is returned.
    }
  }
}

async function refreshEmtFare(ctx: ActionCtx): Promise<void> {
  const dailyBucket = Math.floor(Date.now() / (24 * 60 * 60_000));
  const run = await ctx.runMutation(internal.sourceMaintenance.beginOfficialRun, {
    sourceKey: EMT_SOURCE_KEY,
    runKey: `${EMT_SOURCE_KEY}:${dailyBucket}`,
    requestHash: await sha256(EMT_FARE_URL),
    parserVersion: "emt-movimemt-2026-conformance-v1",
  });
  if (run === null) return;
  try {
    const response = await fetchText(EMT_FARE_URL, 45_000);
    validateEmtValencia2026Fare(response.text);
    const observedAt = Date.now();
    const sourceUpdatedAt = Date.UTC(2026, 0, 1);
    const responseHash = await sha256(response.text);
    const snapshot = await ctx.runMutation(internal.sourceMaintenance.recordSnapshot, {
      runId: run.runId,
      sourceUrl: EMT_FARE_URL,
      externalId: "emt-valencia:movimemt-monthly-cap:2026",
      contentHash: responseHash,
      mimeType: response.contentType,
      observedAt,
      effectiveAt: sourceUpdatedAt,
      payload: response.text,
    });
    await ctx.runMutation(internal.madridCostResearch.upsertLivingCostObservation, {
      sourceId: run.sourceId,
      snapshotId: snapshot.snapshotId,
      observationKey: "emt-valencia:movimemt:monthly-spend-cap:2026",
      cityKey: "valencia-city",
      geographyLevel: "city",
      rawGeography: "Valencia EMT network",
      category: "transport",
      statistic: "fixed",
      amount: MOVIMEMT_2026_MONTHLY_CAP_EUR,
      unit: "EUR/calendar-month cap",
      referenceYear: 2026,
      sourceUpdatedAt,
      observedAt,
    });
    await ctx.runMutation(internal.sourceMaintenance.completeRun, {
      runId: run.runId,
      status: "succeeded",
      responseHash,
      recordsSeen: 1,
      recordsAccepted: 1,
      recordsRejected: 0,
      httpStatus: response.httpStatus,
    });
  } catch (error) {
    try {
      await ctx.runMutation(internal.sourceMaintenance.completeRun, {
        runId: run.runId,
        status: "failed",
        recordsSeen: 1,
        recordsAccepted: 0,
        recordsRejected: 1,
        httpStatus: error instanceof CityCostError ? error.httpStatus : undefined,
        errorCode: "emt_2026_fare_failed",
        errorMessage: safeMessage(error),
      });
    } catch {
      // A completion mutation can commit before a transport error is returned.
    }
  }
}

async function refreshAeatDeclaredRent(ctx: ActionCtx): Promise<void> {
  const dailyBucket = Math.floor(Date.now() / (24 * 60 * 60_000));
  const run = await ctx.runMutation(internal.sourceMaintenance.beginOfficialRun, {
    sourceKey: AEAT_RENT_SOURCE_KEY,
    runKey: `${AEAT_RENT_SOURCE_KEY}:${dailyBucket}`,
    requestHash: await sha256(AEAT_RENT_URL),
    parserVersion: "aeat-declared-rent-city-2024-v1",
  });
  if (run === null) return;
  try {
    const response = await fetchText(AEAT_RENT_URL);
    const text = normalizedOfficialText(response.text);
    if (
      !text.includes("Rentabilidad y precios de alquiler como vivienda habitual") ||
      !text.includes("Unidad: Euros")
    ) {
      throw new CityCostError("AEAT declared-rent table identity changed.");
    }
    const rows = [
      {
        cityKey: "madrid-city",
        municipalityCode: "Madrid-28079",
        row: parseAeatDeclaredRentRow(response.text, "Madrid-28079"),
      },
      {
        cityKey: "valencia-city",
        municipalityCode: "Valencia-46250",
        row: parseAeatDeclaredRentRow(response.text, "Valencia-46250"),
      },
    ] as const;
    const observedAt = Date.now();
    const sourceUpdatedAt = Date.UTC(2024, 11, 31);
    const responseHash = await sha256(response.text);
    const snapshot = await ctx.runMutation(internal.sourceMaintenance.recordSnapshot, {
      runId: run.runId,
      sourceUrl: AEAT_RENT_URL,
      externalId: "aeat-irpf-habitual-rent-cities:2024",
      contentHash: responseHash,
      mimeType: response.contentType,
      observedAt,
      effectiveAt: sourceUpdatedAt,
      payload: response.text,
    });
    for (const item of rows) {
      const sharedArgs = {
        sourceId: run.sourceId,
        snapshotId: snapshot.snapshotId,
        cityKey: item.cityKey,
        geographyLevel: "city" as const,
        rawGeography: item.municipalityCode,
        category: "rent" as const,
        statistic: "mean" as const,
        housingType: "habitual housing",
        sampleSize: item.row.rentedHomeCount,
        referenceYear: 2024,
        sourceUpdatedAt,
        observedAt,
      };
      await ctx.runMutation(internal.madridCostResearch.upsertLivingCostObservation, {
        ...sharedArgs,
        observationKey: `aeat-irpf:${item.municipalityCode}:habitual-rent:mean-monthly:2024`,
        metric: "monthly_amount",
        amount: item.row.averageMonthlyRentEur,
        unit: "EUR/dwelling/month",
      });
      await ctx.runMutation(internal.madridCostResearch.upsertLivingCostObservation, {
        ...sharedArgs,
        observationKey: `aeat-irpf:${item.municipalityCode}:habitual-rent:mean-per-square-meter:2024`,
        metric: "per_square_meter",
        amount: item.row.averageMonthlyRentPerSquareMeterEur,
        unit: "EUR/square-meter/month",
      });
    }
    await ctx.runMutation(internal.sourceMaintenance.completeRun, {
      runId: run.runId,
      status: "succeeded",
      responseHash,
      recordsSeen: rows.length,
      recordsAccepted: rows.length,
      recordsRejected: 0,
      httpStatus: response.httpStatus,
    });
  } catch (error) {
    try {
      await ctx.runMutation(internal.sourceMaintenance.completeRun, {
        runId: run.runId,
        status: "failed",
        recordsSeen: 2,
        recordsAccepted: 0,
        recordsRejected: 2,
        httpStatus: error instanceof CityCostError ? error.httpStatus : undefined,
        errorCode: "aeat_declared_rent_failed",
        errorMessage: safeMessage(error),
      });
    } catch {
      // A completion mutation can commit before a transport error is returned.
    }
  }
}

export const refreshSpainCityLivingCosts = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.runMutation(internal.sourceMaintenance.syncCatalog, {});
    await Promise.all([
      refreshIneCosts(ctx, madridIneConfig),
      refreshIneCosts(ctx, valenciaIneConfig),
      refreshCrtmFare(ctx),
      refreshEmtFare(ctx),
      refreshAeatDeclaredRent(ctx),
    ]);
    return null;
  },
});
