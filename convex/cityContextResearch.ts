import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import {
  internalAction,
  internalMutation,
  query,
} from "./_generated/server";

const INE_SOURCE_KEY = "ine-open-data";
const RENT_SOURCE_KEY = "madrid-open-data-rent";
const INE_TABLE_URL = "https://www.ine.es/jaxiT3/Tabla.htm?t=28193";
const INE_API_ROOT = "https://servicios.ine.es/wstempus/js/ES";
const MADRID_RENT_CATALOG_URL =
  "https://datos.comunidad.madrid/catalogo/dataset/alquiler_medio_mensual_viviendas_arrendadas_valor_catastral_municipios_mas_20000";
const MADRID_RENT_SQM_CATALOG_URL =
  "https://datos.comunidad.madrid/catalogo/dataset/alquiler_metro_cuadrado_mensual_viviendas_arrendadas_valor_catastral_municipios_mas_20000";
const MAX_INE_RESPONSE_CHARACTERS = 150_000;
const MAX_RENT_RESPONSE_CHARACTERS = 400_000;

const ineSeries = [
  {
    code: "EAES1115",
    occupationKey: "high_skill_cno_1_3",
    rawOccupation: "Alta",
    label: "Madrid high-skilled occupations",
  },
  {
    code: "EAES1116",
    occupationKey: "all_occupations",
    rawOccupation: "Todas las ocupaciones",
    label: "Madrid all occupations",
  },
] as const;

const rentFeeds = [
  {
    metric: "monthly_amount" as const,
    url: "https://datos.comunidad.madrid/dataset/06ce1705-c4be-4825-a83b-36f1141a30e6/resource/dcd350e8-a997-4cbc-9834-6885d8c58d9b/download/alquiler-medio-mensual-de-viviendas-arrendadas-con-valor-catastral-para-municipios-de-mas-de-20.json",
    unit: "EUR/month",
    datasetUrl: MADRID_RENT_CATALOG_URL,
  },
  {
    metric: "per_square_meter" as const,
    url: "https://datos.comunidad.madrid/dataset/244448f3-7df9-4318-8603-92fb550fc865/resource/90844776-1343-4d4c-9b0a-ed34f347137d/download/alquiler-del-metro-cuadrado-mensual-de-viviendas-arrendadas-con-valor-catastral-para-municipios.json",
    unit: "EUR/m2/month",
    datasetUrl: MADRID_RENT_SQM_CATALOG_URL,
  },
] as const;

const rentGeographies = [
  {
    cityKey: "madrid-city",
    geographyLevel: "city" as const,
    rawGeography: "Madrid",
    territoryType: "Municipios",
    label: "Madrid city",
  },
  {
    cityKey: "madrid-region",
    geographyLevel: "region" as const,
    rawGeography: "Comunidad de Madrid",
    territoryType: "Comunidad de Madrid",
    label: "Comunidad de Madrid",
  },
] as const;

type JsonRecord = Record<string, unknown>;
type IneSeriesDefinition = (typeof ineSeries)[number];
type RentFeedDefinition = (typeof rentFeeds)[number];
type RentGeographyDefinition = (typeof rentGeographies)[number];

interface FetchedJson {
  payload: JsonRecord;
  serialized: string;
  sourceUpdatedAt: number | null;
  etag: string | null;
  httpStatus: number;
}

interface IneBenchmark {
  definition: IneSeriesDefinition;
  amount: number;
  referenceYear: number;
  sourceUpdatedAt: number;
  rawPayload: unknown;
}

interface RentObservation {
  feed: RentFeedDefinition;
  geography: RentGeographyDefinition;
  amount: number;
  referenceYear: number;
  sourceUpdatedAt: number;
}

class OfficialContextError extends Error {
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
    : "Unknown official city-context refresh error.";
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

async function fetchJson(url: string, maxCharacters: number): Promise<FetchedJson> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "EQ salary-intelligence research monitor/1.0",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > maxCharacters) {
    throw new OfficialContextError("Official response exceeded the size limit.", response.status);
  }
  const serialized = await response.text();
  if (serialized.length > maxCharacters) {
    throw new OfficialContextError("Official response exceeded the size limit.", response.status);
  }
  if (!response.ok) {
    throw new OfficialContextError(`Official source returned HTTP ${response.status}.`, response.status);
  }
  let payload: JsonRecord;
  try {
    const parsed = record(JSON.parse(serialized) as unknown);
    if (parsed === null) throw new Error("not an object");
    payload = parsed;
  } catch {
    throw new OfficialContextError("Official source returned invalid JSON.", response.status);
  }
  const lastModified = response.headers.get("last-modified");
  const sourceUpdatedAt = lastModified === null ? Number.NaN : Date.parse(lastModified);
  return {
    payload,
    serialized,
    sourceUpdatedAt: Number.isFinite(sourceUpdatedAt) ? sourceUpdatedAt : null,
    etag: response.headers.get("etag"),
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

async function fetchIneBenchmark(definition: IneSeriesDefinition): Promise<IneBenchmark> {
  const dataUrl = `${INE_API_ROOT}/DATOS_SERIE/${definition.code}?det=2&tip=AM&nult=1`;
  const metadataUrl = `${INE_API_ROOT}/SERIE/${definition.code}?det=2&tip=AM`;
  const [dataResponse, metadataResponse] = await Promise.all([
    fetchJson(dataUrl, MAX_INE_RESPONSE_CHARACTERS),
    fetchJson(metadataUrl, MAX_INE_RESPONSE_CHARACTERS),
  ]);
  const data = dataResponse.payload;
  const metadata = metadataResponse.payload;
  if (data.COD !== definition.code || metadata.COD !== definition.code) {
    throw new OfficialContextError(`INE series identity changed for ${definition.code}.`);
  }
  const unit = record(data.Unidad);
  if (unit?.Nombre !== "Euros" || unit.Abrev !== "€") {
    throw new OfficialContextError(`INE unit changed for ${definition.code}.`);
  }
  if (
    metadataValue(data, "Comunidades y Ciudades Autónomas") !== "Madrid, Comunidad de" ||
    metadataValue(data, "Sexo") !== "Ambos sexos" ||
    metadataValue(data, "Conceptos salariales/laborales") !== "Salario medio bruto"
  ) {
    throw new OfficialContextError(`INE series semantics changed for ${definition.code}.`);
  }
  const occupation =
    metadataValue(data, "AGRUPACIONES OCUPACIONES") ??
    metadataValue(data, "TOTALES OCUPACIONES");
  if (occupation !== definition.rawOccupation) {
    throw new OfficialContextError(`INE occupation scope changed for ${definition.code}.`);
  }
  if (!Array.isArray(data.Data) || data.Data.length !== 1) {
    throw new OfficialContextError(`INE did not return one latest value for ${definition.code}.`);
  }
  const latest = record(data.Data[0]);
  const type = record(latest?.TipoDato);
  const amount = latest?.Valor;
  const referenceYear = latest?.Anyo;
  if (
    type?.Nombre !== "Definitivo" ||
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    amount < 10_000 ||
    amount > 200_000 ||
    typeof referenceYear !== "number" ||
    !Number.isInteger(referenceYear) ||
    referenceYear < 2024
  ) {
    throw new OfficialContextError(`INE returned an invalid latest value for ${definition.code}.`);
  }
  const publication = record(metadata.Publicacion);
  const publicationUpdate = record(publication?.PubFechaAct);
  const sourceUpdatedAt = typeof publicationUpdate?.Fecha === "string"
    ? Date.parse(publicationUpdate.Fecha)
    : Number.NaN;
  if (
    !Number.isFinite(sourceUpdatedAt) ||
    publicationUpdate?.Anyo !== referenceYear ||
    typeof publicationUpdate?.Nombre !== "string" ||
    !publicationUpdate.Nombre.includes("Definitivos")
  ) {
    throw new OfficialContextError(`INE publication metadata changed for ${definition.code}.`);
  }
  return {
    definition,
    amount,
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

function parseRentFeed(
  feed: RentFeedDefinition,
  fetched: FetchedJson,
): { observations: RentObservation[]; rawPayload: unknown } {
  if (fetched.sourceUpdatedAt === null) {
    throw new OfficialContextError("Madrid rent feed omitted its Last-Modified timestamp.");
  }
  if (!Array.isArray(fetched.payload.data) || fetched.payload.data.length < 500 || fetched.payload.data.length > 1_000) {
    throw new OfficialContextError("Madrid rent feed returned an unexpected number of records.");
  }
  const rows = fetched.payload.data.map((item) => {
    const row = record(item);
    if (row === null) throw new OfficialContextError("Madrid rent feed included an invalid row.");
    return row;
  });
  const years = rows.flatMap((row) => {
    const value = Number(row["Año"]);
    return Number.isInteger(value) ? [value] : [];
  });
  const referenceYear = Math.max(...years);
  if (!Number.isInteger(referenceYear) || referenceYear < 2024) {
    throw new OfficialContextError("Madrid rent feed omitted a current reference year.");
  }

  const observations = rentGeographies.map((geography) => {
    const matches = rows.filter(
      (row) =>
        row["Año"] === String(referenceYear) &&
        row["Tipo territorio"] === geography.territoryType &&
        row.Territorio === geography.rawGeography &&
        row["Tipo de vivienda"] === "Viviendas habituales",
    );
    if (matches.length !== 1) {
      throw new OfficialContextError(
        `Madrid rent feed did not return one ${feed.metric} record for ${geography.rawGeography}.`,
      );
    }
    const row = matches[0];
    if (row.Unidad !== "Euros") {
      throw new OfficialContextError("Madrid rent feed unit changed.");
    }
    const amount = Number(row.Valor);
    const validAmount = feed.metric === "monthly_amount"
      ? amount >= 100 && amount <= 5_000
      : amount >= 1 && amount <= 100;
    if (!Number.isFinite(amount) || !validAmount) {
      throw new OfficialContextError(`Madrid rent feed returned an invalid ${feed.metric} value.`);
    }
    return {
      feed,
      geography,
      amount,
      referenceYear,
      sourceUpdatedAt: fetched.sourceUpdatedAt as number,
    };
  });
  return {
    observations,
    rawPayload: {
      sourceUrl: feed.url,
      etag: fetched.etag,
      lastModifiedAt: fetched.sourceUpdatedAt,
      serialized: fetched.serialized,
    },
  };
}

export const upsertRegionalSalary = internalMutation({
  args: {
    sourceId: v.id("sourceRegistry"),
    snapshotId: v.id("rawSnapshots"),
    observationKey: v.string(),
    occupationKey: v.string(),
    rawOccupation: v.string(),
    amount: v.number(),
    referenceYear: v.number(),
    sourceUpdatedAt: v.number(),
    observedAt: v.number(),
  },
  returns: v.object({ inserted: v.boolean() }),
  handler: async (ctx, args) => {
    const observations = await ctx.db
      .query("salaryMarketObservations")
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
    await ctx.db.insert("salaryMarketObservations", {
      sourceId: args.sourceId,
      snapshotId: args.snapshotId,
      observationKey: args.observationKey,
      datasetCode: "ine-eaes-28193",
      indicatorKey: "mean_gross_annual_salary",
      rawIndicator: "Salario medio bruto",
      occupationKey: args.occupationKey,
      rawOccupation: args.rawOccupation,
      industryKey: "covered_industries",
      rawIndustry: "EAES covered CNAE-09 sections",
      countryCode: "ES",
      regionKey: "comunidad-madrid",
      rawRegion: "Madrid, Comunidad de",
      currency: "EUR",
      period: "year",
      statistic: "mean",
      amount: args.amount,
      referenceYear: args.referenceYear,
      sourceUpdatedAt: args.sourceUpdatedAt,
      observedAt: args.observedAt,
      effectiveFrom: args.sourceUpdatedAt,
      confidenceScore: 0.96,
      confidenceBand: 0.03,
      qualityFlags: [
        "official_statistic",
        "regional_average",
        "broad_occupation_group",
        "not_company_compensation",
      ],
      status: "accepted",
    });
    return { inserted: true };
  },
});

export const upsertRentObservation = internalMutation({
  args: {
    sourceId: v.id("sourceRegistry"),
    snapshotId: v.id("rawSnapshots"),
    observationKey: v.string(),
    cityKey: v.string(),
    geographyLevel: v.union(v.literal("city"), v.literal("region")),
    rawGeography: v.string(),
    metric: v.union(v.literal("monthly_amount"), v.literal("per_square_meter")),
    amount: v.number(),
    unit: v.string(),
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
    await ctx.db.insert("cityCostObservations", {
      cityKey: args.cityKey,
      sourceId: args.sourceId,
      snapshotId: args.snapshotId,
      observationKey: args.observationKey,
      geographyLevel: args.geographyLevel,
      rawGeography: args.rawGeography,
      category: "rent",
      metric: args.metric,
      statistic: "mean",
      amount: args.amount,
      currency: "EUR",
      unit: args.unit,
      housingType: "habitual_housing",
      referenceYear: args.referenceYear,
      sourceUpdatedAt: args.sourceUpdatedAt,
      observedAt: args.observedAt,
      effectiveFrom: args.sourceUpdatedAt,
      confidenceScore: 0.95,
      confidenceBand: 0.03,
      qualityFlags: [
        "official_administrative_data",
        "habitual_housing",
        "annual_average",
        "not_live_asking_rent",
      ],
      status: "accepted",
    });
    return { inserted: true };
  },
});

const publicSalaryValidator = v.object({
  key: v.string(),
  label: v.string(),
  amount: v.number(),
  referenceYear: v.number(),
  sourceUpdatedAt: v.number(),
  checkedAt: v.number(),
  datasetUrl: v.string(),
});

const publicHousingValidator = v.object({
  key: v.string(),
  geographyKey: v.string(),
  geographyLabel: v.string(),
  metric: v.union(v.literal("monthly_amount"), v.literal("per_square_meter")),
  amount: v.number(),
  unit: v.string(),
  referenceYear: v.number(),
  sourceUpdatedAt: v.number(),
  checkedAt: v.number(),
  datasetUrl: v.string(),
});

export const latestMadridContext = query({
  args: {},
  returns: v.object({
    salary: v.array(publicSalaryValidator),
    housing: v.array(publicHousingValidator),
  }),
  handler: async (ctx) => {
    const salaryObservations = await ctx.db
      .query("salaryMarketObservations")
      .withIndex("by_country_and_status", (q) =>
        q.eq("countryCode", "ES").eq("status", "accepted"),
      )
      .collect();
    const salaryByKey = new Map(
      salaryObservations
        .filter((observation) => observation.regionKey === "comunidad-madrid")
        .map((observation) => [observation.observationKey, observation]),
    );
    const salary = ineSeries.flatMap((definition) => {
      const matches = [...salaryByKey.values()]
        .filter((observation) => observation.occupationKey === definition.occupationKey)
        .sort((a, b) => b.observedAt - a.observedAt);
      const observation = matches[0];
      return observation === undefined
        ? []
        : [{
            key: observation.observationKey,
            label: definition.label,
            amount: observation.amount,
            referenceYear: observation.referenceYear,
            sourceUpdatedAt: observation.sourceUpdatedAt,
            checkedAt: observation.observedAt,
            datasetUrl: INE_TABLE_URL,
          }];
    });

    const housingGroups = await Promise.all(
      rentGeographies.map((geography) =>
        ctx.db
          .query("cityCostObservations")
          .withIndex("by_city_and_status", (q) =>
            q.eq("cityKey", geography.cityKey).eq("status", "accepted"),
          )
          .collect(),
      ),
    );
    const housing = housingGroups.flatMap((observations, geographyIndex) => {
      const geography = rentGeographies[geographyIndex];
      return rentFeeds.flatMap((feed) => {
        const observation = observations
          .filter((item) => item.category === "rent" && item.metric === feed.metric)
          .sort((a, b) => b.observedAt - a.observedAt)[0];
        return observation === undefined || geography === undefined
          ? []
          : [{
              key: observation.observationKey,
              geographyKey: geography.cityKey,
              geographyLabel: geography.label,
              metric: feed.metric,
              amount: observation.amount,
              unit: observation.unit,
              referenceYear: observation.referenceYear,
              sourceUpdatedAt: observation.sourceUpdatedAt,
              checkedAt: observation.observedAt,
              datasetUrl: feed.datasetUrl,
            }];
      });
    });
    return { salary, housing };
  },
});

async function refreshIne(ctx: ActionCtx): Promise<void> {
  const urls = ineSeries.flatMap((definition) => [
    `${INE_API_ROOT}/DATOS_SERIE/${definition.code}?det=2&tip=AM&nult=1`,
    `${INE_API_ROOT}/SERIE/${definition.code}?det=2&tip=AM`,
  ]);
  const dailyBucket = Math.floor(Date.now() / (24 * 60 * 60_000));
  const run = await ctx.runMutation(internal.sourceMaintenance.beginOfficialRun, {
    sourceKey: INE_SOURCE_KEY,
    runKey: `${INE_SOURCE_KEY}:madrid-salary:${dailyBucket}`,
    requestHash: await sha256(urls.join("\n")),
    parserVersion: "ine-madrid-salary-v1",
  });
  if (run === null) return;
  let runClosed = false;
  try {
    const benchmarks = await Promise.all(
      ineSeries.map((definition) => fetchIneBenchmark(definition)),
    );
    const observedAt = Date.now();
    const rawPayload = benchmarks.map((benchmark) => benchmark.rawPayload);
    const responseHash = await sha256(JSON.stringify(rawPayload));
    const snapshot = await ctx.runMutation(internal.sourceMaintenance.recordSnapshot, {
      runId: run.runId,
      sourceUrl: INE_TABLE_URL,
      externalId: `ine-eaes-28193:${benchmarks[0]?.referenceYear ?? "latest"}`,
      contentHash: responseHash,
      mimeType: "application/json",
      observedAt,
      effectiveAt: Math.max(...benchmarks.map((benchmark) => benchmark.sourceUpdatedAt)),
      payload: rawPayload,
    });
    for (const benchmark of benchmarks) {
      await ctx.runMutation(internal.cityContextResearch.upsertRegionalSalary, {
        sourceId: run.sourceId,
        snapshotId: snapshot.snapshotId,
        observationKey:
          `ine-eaes-28193:comunidad-madrid:${benchmark.definition.occupationKey}:mean:${benchmark.referenceYear}`,
        occupationKey: benchmark.definition.occupationKey,
        rawOccupation: benchmark.definition.rawOccupation,
        amount: benchmark.amount,
        referenceYear: benchmark.referenceYear,
        sourceUpdatedAt: benchmark.sourceUpdatedAt,
        observedAt,
      });
    }
    await ctx.runMutation(internal.sourceMaintenance.completeRun, {
      runId: run.runId,
      status: "succeeded",
      responseHash,
      recordsSeen: benchmarks.length,
      recordsAccepted: benchmarks.length,
      recordsRejected: 0,
      httpStatus: 200,
    });
    runClosed = true;
  } catch (error) {
    if (!runClosed) {
      try {
        await ctx.runMutation(internal.sourceMaintenance.completeRun, {
          runId: run.runId,
          status: "failed",
          recordsSeen: ineSeries.length,
          recordsAccepted: 0,
          recordsRejected: ineSeries.length,
          httpStatus: error instanceof OfficialContextError ? error.httpStatus : undefined,
          errorCode: "ine_madrid_salary_failed",
          errorMessage: safeMessage(error),
        });
      } catch {
        // A completion mutation can commit before a transport error is returned.
      }
    }
  }
}

async function refreshRent(ctx: ActionCtx): Promise<void> {
  const dailyBucket = Math.floor(Date.now() / (24 * 60 * 60_000));
  const run = await ctx.runMutation(internal.sourceMaintenance.beginOfficialRun, {
    sourceKey: RENT_SOURCE_KEY,
    runKey: `${RENT_SOURCE_KEY}:${dailyBucket}`,
    requestHash: await sha256(rentFeeds.map((feed) => feed.url).join("\n")),
    parserVersion: "madrid-declared-rent-v1",
  });
  if (run === null) return;
  let runClosed = false;
  try {
    const fetchedFeeds = await Promise.all(
      rentFeeds.map(async (feed) => ({
        feed,
        fetched: await fetchJson(feed.url, MAX_RENT_RESPONSE_CHARACTERS),
      })),
    );
    const parsedFeeds = fetchedFeeds.map(({ feed, fetched }) => parseRentFeed(feed, fetched));
    const observations = parsedFeeds.flatMap((parsed) => parsed.observations);
    const rawPayload = parsedFeeds.map((parsed) => parsed.rawPayload);
    const observedAt = Date.now();
    const responseHash = await sha256(JSON.stringify(rawPayload));
    const snapshot = await ctx.runMutation(internal.sourceMaintenance.recordSnapshot, {
      runId: run.runId,
      sourceUrl: MADRID_RENT_CATALOG_URL,
      externalId: `madrid-declared-rent:${observations[0]?.referenceYear ?? "latest"}`,
      contentHash: responseHash,
      mimeType: "application/json",
      observedAt,
      effectiveAt: Math.max(...observations.map((observation) => observation.sourceUpdatedAt)),
      payload: rawPayload,
    });
    for (const observation of observations) {
      await ctx.runMutation(internal.cityContextResearch.upsertRentObservation, {
        sourceId: run.sourceId,
        snapshotId: snapshot.snapshotId,
        observationKey:
          `madrid-declared-rent:${observation.geography.cityKey}:${observation.feed.metric}:mean:habitual:${observation.referenceYear}`,
        cityKey: observation.geography.cityKey,
        geographyLevel: observation.geography.geographyLevel,
        rawGeography: observation.geography.rawGeography,
        metric: observation.feed.metric,
        amount: observation.amount,
        unit: observation.feed.unit,
        referenceYear: observation.referenceYear,
        sourceUpdatedAt: observation.sourceUpdatedAt,
        observedAt,
      });
    }
    await ctx.runMutation(internal.sourceMaintenance.completeRun, {
      runId: run.runId,
      status: "succeeded",
      responseHash,
      recordsSeen: observations.length,
      recordsAccepted: observations.length,
      recordsRejected: 0,
      httpStatus: 200,
    });
    runClosed = true;
  } catch (error) {
    if (!runClosed) {
      try {
        await ctx.runMutation(internal.sourceMaintenance.completeRun, {
          runId: run.runId,
          status: "failed",
          recordsSeen: rentFeeds.length * rentGeographies.length,
          recordsAccepted: 0,
          recordsRejected: rentFeeds.length * rentGeographies.length,
          httpStatus: error instanceof OfficialContextError ? error.httpStatus : undefined,
          errorCode: "madrid_rent_failed",
          errorMessage: safeMessage(error),
        });
      } catch {
        // A completion mutation can commit before a transport error is returned.
      }
    }
  }
}

export const refreshOfficialMadridContext = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.runMutation(internal.sourceMaintenance.syncCatalog, {});
    await Promise.all([refreshIne(ctx), refreshRent(ctx)]);
    return null;
  },
});
