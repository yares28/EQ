import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  query,
} from "./_generated/server";

const SOURCE_KEY = "eurostat-earnings";
const DATASET_CODE = "earn_ses22_49";
const REFERENCE_YEAR = 2022;
const DATASET_URL =
  "https://ec.europa.eu/eurostat/databrowser/view/earn_ses22_49/default/table?lang=en";
const API_ROOT =
  `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${DATASET_CODE}`;
const MAX_RESPONSE_CHARACTERS = 250_000;

const benchmarkDefinitions = [
  {
    industryKey: "J",
    label: "Information & communication professionals",
  },
  {
    industryKey: "B-S",
    label: "Professionals across industries",
  },
] as const;

type BenchmarkDefinition = (typeof benchmarkDefinitions)[number];

interface ParsedBenchmark {
  definition: BenchmarkDefinition;
  amount: number;
  indicatorLabel: string;
  occupationLabel: string;
  industryLabel: string;
  sourceUpdatedAt: number;
  rawPayload: unknown;
  sourceUrl: string;
}

class MarketFetchError extends Error {
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
    : "Unknown Eurostat refresh error.";
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function categoryLabel(payload: Record<string, unknown>, dimensionKey: string, code: string): string {
  const dimension = record(payload.dimension);
  const item = record(dimension?.[dimensionKey]);
  const category = record(item?.category);
  const labels = record(category?.label);
  const label = labels?.[code];
  if (typeof label !== "string" || label.trim() === "") {
    throw new MarketFetchError(`Eurostat omitted the ${dimensionKey} label for ${code}.`);
  }
  return label;
}

function sourceUrl(industryKey: string): string {
  const params = new URLSearchParams({
    lang: "en",
    geo: "ES",
    time: String(REFERENCE_YEAR),
    freq: "A",
    sex: "T",
    indic_se: "ERN",
    isco08: "OC2",
    sizeclas: "TOTAL",
    nace_r2: industryKey,
    unit: "EUR",
  });
  return `${API_ROOT}?${params.toString()}`;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function fetchBenchmark(definition: BenchmarkDefinition): Promise<ParsedBenchmark> {
  const url = sourceUrl(definition.industryKey);
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
  if (declaredLength > MAX_RESPONSE_CHARACTERS) {
    throw new MarketFetchError("Eurostat response exceeded the size limit.", response.status);
  }
  const body = await response.text();
  if (body.length > MAX_RESPONSE_CHARACTERS) {
    throw new MarketFetchError("Eurostat response exceeded the size limit.", response.status);
  }
  if (!response.ok) {
    throw new MarketFetchError(`Eurostat returned HTTP ${response.status}.`, response.status);
  }

  let payload: Record<string, unknown>;
  try {
    const parsed = record(JSON.parse(body) as unknown);
    if (parsed === null) throw new Error("not an object");
    payload = parsed;
  } catch {
    throw new MarketFetchError("Eurostat returned invalid JSON.", response.status);
  }

  const sizes = payload.size;
  if (!Array.isArray(sizes) || sizes.length !== 9 || sizes.some((size) => size !== 1)) {
    throw new MarketFetchError("Eurostat filters no longer resolve to exactly one observation.");
  }
  const values = record(payload.value);
  const amount = values?.["0"];
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || amount > 500_000) {
    throw new MarketFetchError("Eurostat returned an invalid annual earnings value.");
  }
  const updated = payload.updated;
  const sourceUpdatedAt = typeof updated === "string" ? Date.parse(updated) : Number.NaN;
  if (!Number.isFinite(sourceUpdatedAt)) {
    throw new MarketFetchError("Eurostat omitted a valid dataset revision timestamp.");
  }

  const indicatorLabel = categoryLabel(payload, "indic_se", "ERN");
  const occupationLabel = categoryLabel(payload, "isco08", "OC2");
  const industryLabel = categoryLabel(payload, "nace_r2", definition.industryKey);
  const unitLabel = categoryLabel(payload, "unit", "EUR");
  const countryLabel = categoryLabel(payload, "geo", "ES");
  if (indicatorLabel !== "Gross earnings" || unitLabel !== "Euro" || countryLabel !== "Spain") {
    throw new MarketFetchError("Eurostat dimension semantics changed; import stopped for review.");
  }

  return {
    definition,
    amount,
    indicatorLabel,
    occupationLabel,
    industryLabel,
    sourceUpdatedAt,
    rawPayload: payload,
    sourceUrl: url,
  };
}

export const upsertBenchmark = internalMutation({
  args: {
    sourceId: v.id("sourceRegistry"),
    snapshotId: v.id("rawSnapshots"),
    observationKey: v.string(),
    industryKey: v.string(),
    rawIndustry: v.string(),
    rawIndicator: v.string(),
    rawOccupation: v.string(),
    amount: v.number(),
    sourceUpdatedAt: v.number(),
    observedAt: v.number(),
  },
  returns: v.object({ inserted: v.boolean() }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("salaryMarketObservations")
      .withIndex("by_sourceId_and_observationKey", (q) =>
        q.eq("sourceId", args.sourceId).eq("observationKey", args.observationKey),
      )
      .collect();
    const current = existing
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
      datasetCode: DATASET_CODE,
      indicatorKey: "gross_earnings",
      rawIndicator: args.rawIndicator,
      occupationKey: "professionals",
      rawOccupation: args.rawOccupation,
      industryKey: args.industryKey,
      rawIndustry: args.rawIndustry,
      countryCode: "ES",
      currency: "EUR",
      period: "year",
      statistic: "mean",
      amount: args.amount,
      referenceYear: REFERENCE_YEAR,
      sourceUpdatedAt: args.sourceUpdatedAt,
      observedAt: args.observedAt,
      effectiveFrom: args.sourceUpdatedAt,
      confidenceScore: 0.93,
      confidenceBand: 0.04,
      qualityFlags: [
        "official_statistic",
        "broad_occupation_group",
        "not_company_compensation",
      ],
      status: "accepted",
    });
    return { inserted: true };
  },
});

const publicBenchmarkValidator = v.object({
  key: v.string(),
  label: v.string(),
  amount: v.number(),
  currency: v.string(),
  period: v.literal("year"),
  statistic: v.literal("mean"),
  referenceYear: v.number(),
  sourceUpdatedAt: v.number(),
  checkedAt: v.number(),
  datasetUrl: v.string(),
});

export const latestBenchmarks = query({
  args: {},
  returns: v.array(publicBenchmarkValidator),
  handler: async (ctx) => {
    const observations = await ctx.db
      .query("salaryMarketObservations")
      .withIndex("by_country_and_status", (q) =>
        q.eq("countryCode", "ES").eq("status", "accepted"),
      )
      .collect();
    const latestByKey = new Map<string, (typeof observations)[number]>();
    for (const observation of observations) {
      const current = latestByKey.get(observation.observationKey);
      if (current === undefined || observation.observedAt > current.observedAt) {
        latestByKey.set(observation.observationKey, observation);
      }
    }
    return benchmarkDefinitions.flatMap((definition) => {
      const key = `${DATASET_CODE}:ES:OC2:${definition.industryKey}:ERN:EUR:${REFERENCE_YEAR}`;
      const observation = latestByKey.get(key);
      return observation === undefined
        ? []
        : [{
            key,
            label: definition.label,
            amount: observation.amount,
            currency: observation.currency,
            period: "year" as const,
            statistic: "mean" as const,
            referenceYear: observation.referenceYear,
            sourceUpdatedAt: observation.sourceUpdatedAt,
            checkedAt: observation.observedAt,
            datasetUrl: DATASET_URL,
          }];
    });
  },
});

export const refreshEurostat = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.runMutation(internal.sourceMaintenance.syncCatalog, {});
    const urls = benchmarkDefinitions.map((definition) => sourceUrl(definition.industryKey));
    const requestHash = await sha256(urls.join("\n"));
    const twelveHourBucket = Math.floor(Date.now() / (12 * 60 * 60_000));
    const run = await ctx.runMutation(internal.sourceMaintenance.beginOfficialRun, {
      sourceKey: SOURCE_KEY,
      runKey: `${SOURCE_KEY}:${twelveHourBucket}`,
      requestHash,
      parserVersion: "eurostat-earnings-v1",
    });
    if (run === null) return null;

    let runClosed = false;
    try {
      const results = await Promise.allSettled(
        benchmarkDefinitions.map((definition) => fetchBenchmark(definition)),
      );
      const accepted = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      const failures = results.flatMap((result) =>
        result.status === "rejected" ? [safeMessage(result.reason)] : [],
      );

      if (accepted.length === 0) {
        const firstError = results.find((result) => result.status === "rejected");
        await ctx.runMutation(internal.sourceMaintenance.completeRun, {
          runId: run.runId,
          status: "failed",
          recordsSeen: benchmarkDefinitions.length,
          recordsAccepted: 0,
          recordsRejected: benchmarkDefinitions.length,
          httpStatus:
            firstError?.status === "rejected" && firstError.reason instanceof MarketFetchError
              ? firstError.reason.httpStatus
              : undefined,
          errorCode: "eurostat_fetch_failed",
          errorMessage: failures.join(" ").slice(0, 500),
        });
        runClosed = true;
        return null;
      }

      const observedAt = Date.now();
      const rawPayload = accepted.map((benchmark) => ({
        sourceUrl: benchmark.sourceUrl,
        payload: benchmark.rawPayload,
      }));
      const serializedPayload = JSON.stringify(rawPayload);
      const responseHash = await sha256(serializedPayload);
      const snapshot = await ctx.runMutation(internal.sourceMaintenance.recordSnapshot, {
        runId: run.runId,
        sourceUrl: DATASET_URL,
        externalId: `${DATASET_CODE}:${REFERENCE_YEAR}`,
        contentHash: responseHash,
        mimeType: "application/json",
        observedAt,
        effectiveAt: Math.max(...accepted.map((benchmark) => benchmark.sourceUpdatedAt)),
        payload: rawPayload,
      });

      for (const benchmark of accepted) {
        await ctx.runMutation(internal.salaryMarketResearch.upsertBenchmark, {
          sourceId: run.sourceId,
          snapshotId: snapshot.snapshotId,
          observationKey:
            `${DATASET_CODE}:ES:OC2:${benchmark.definition.industryKey}:ERN:EUR:${REFERENCE_YEAR}`,
          industryKey: benchmark.definition.industryKey,
          rawIndustry: benchmark.industryLabel,
          rawIndicator: benchmark.indicatorLabel,
          rawOccupation: benchmark.occupationLabel,
          amount: benchmark.amount,
          sourceUpdatedAt: benchmark.sourceUpdatedAt,
          observedAt,
        });
      }

      await ctx.runMutation(internal.sourceMaintenance.completeRun, {
        runId: run.runId,
        status: failures.length === 0 ? "succeeded" : "partial",
        responseHash,
        recordsSeen: benchmarkDefinitions.length,
        recordsAccepted: accepted.length,
        recordsRejected: failures.length,
        errorCode: failures.length === 0 ? undefined : "eurostat_partial_fetch",
        errorMessage: failures.length === 0 ? undefined : failures.join(" ").slice(0, 500),
      });
      runClosed = true;
    } catch (error) {
      if (!runClosed) {
        try {
          await ctx.runMutation(internal.sourceMaintenance.completeRun, {
            runId: run.runId,
            status: "failed",
            recordsSeen: benchmarkDefinitions.length,
            recordsAccepted: 0,
            recordsRejected: benchmarkDefinitions.length,
            errorCode: "eurostat_normalization_failed",
            errorMessage: safeMessage(error),
          });
        } catch {
          // A completion mutation can commit before a transport error is returned.
        }
      }
    }
    return null;
  },
});
