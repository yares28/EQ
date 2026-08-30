import { v } from "convex/values";

import {
  SPAIN_PAYROLL_2026_ALGORITHM_VERSION,
  SPAIN_PAYROLL_2026_MODEL_KEY,
  SPAIN_PAYROLL_2026_PARAMETERS,
  SPAIN_PAYROLL_2026_SOURCE_URLS,
  employeeSocialSecurity2026,
} from "../lib/spain-payroll-2026";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import {
  internalAction,
  internalMutation,
  query,
} from "./_generated/server";

const AEAT_SOURCE_KEY = "aeat-withholding-2026";
const SOCIAL_SECURITY_SOURCE_KEY = "tgss-contribution-tables-2026";
const AEAT_SERVICE_URL = SPAIN_PAYROLL_2026_SOURCE_URLS.aeatService;
const SOCIAL_SECURITY_VALIDATION_URL =
  SPAIN_PAYROLL_2026_SOURCE_URLS.socialSecurityOrder;
const MAX_AEAT_RESPONSE_CHARACTERS = 250_000;
const MAX_SOCIAL_SECURITY_RESPONSE_CHARACTERS = 2_500_000;
const CURRENT_MODEL_MAX_AGE_MS = 35 * 24 * 60 * 60_000;

const aeatGoldenCases = [
  { nif: "12345678Z", name: "CASO VEINTICUATRO", gross: 24_000, withholding: 3_242.4, rate: 13.51 },
  { nif: "11111111H", name: "CASO TREINTA Y CINCO", gross: 35_200, withholding: 6_381.76, rate: 18.13 },
  { nif: "22222222J", name: "CASO CINCUENTA", gross: 50_000, withholding: 11_200, rate: 22.4 },
  { nif: "33333333P", name: "CASO TOPE", gross: 61_214.4, withholding: 15_083.23, rate: 24.64 },
  { nif: "44444444A", name: "CASO CIEN", gross: 100_000, withholding: 32_110, rate: 32.11 },
] as const;

class PayrollValidationError extends Error {
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
    : "Unknown official payroll validation error.";
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function xmlNumber(xml: string, tag: string): number {
  const match = xml.match(new RegExp(`<${tag}>([0-9]+(?:\\.[0-9]+)?)</${tag}>`));
  const value = match === null ? Number.NaN : Number(match[1]);
  if (!Number.isFinite(value)) {
    throw new PayrollValidationError(`AEAT response omitted ${tag}.`);
  }
  return value;
}

function buildAeatXml(): string {
  const retained = aeatGoldenCases.map((testCase) => {
    const contributions = employeeSocialSecurity2026(testCase.gross)
      .annualEmployeeSocialSecurityEur.toFixed(2);
    return `<Retenido><Nif>${testCase.nif}</Nif><ApellidosNombre>${testCase.name}</ApellidosNombre><Nacimiento>1995</Nacimiento><SituacionFamiliar><Situacion3/></SituacionFamiliar><SituacionLaboral><TrabajadorActivo><Contrato>1</Contrato></TrabajadorActivo></SituacionLaboral><RetribAnuales>${testCase.gross.toFixed(2)}</RetribAnuales><Cotizaciones>${contributions}</Cotizaciones></Retenido>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><AEATRetencionesEntrada2026><IdDoc><CodModelo>RET</CodModelo><Ejercicio>2026</Ejercicio></IdDoc><Retenedor><Nif>B12345674</Nif><ApellidosNombre>EMPRESA DE PRUEBA</ApellidosNombre>${retained}</Retenedor></AEATRetencionesEntrada2026>`;
}

async function fetchBoundedText(
  url: string,
  options: RequestInit,
  maxCharacters: number,
): Promise<{ text: string; status: number; contentType: string }> {
  const response = await fetch(url, {
    ...options,
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > maxCharacters) {
    throw new PayrollValidationError("Official payroll response exceeded the size limit.", response.status);
  }
  const text = await response.text();
  if (text.length > maxCharacters) {
    throw new PayrollValidationError("Official payroll response exceeded the size limit.", response.status);
  }
  if (!response.ok) {
    throw new PayrollValidationError(`Official payroll source returned HTTP ${response.status}.`, response.status);
  }
  return {
    text,
    status: response.status,
    contentType: response.headers.get("content-type") ?? "text/plain",
  };
}

function validateAeatResponse(xml: string): void {
  if (!xml.includes("<AEATRetencionesSalida2026") || xml.includes("<AEATRetencionesError2026")) {
    throw new PayrollValidationError("AEAT returned an error document instead of 2026 calculations.");
  }
  const retained = [...xml.matchAll(/<Retenido>([\s\S]*?)<\/Retenido>/g)];
  if (retained.length !== aeatGoldenCases.length) {
    throw new PayrollValidationError("AEAT returned an unexpected number of golden cases.");
  }
  retained.forEach((match, index) => {
    const expected = aeatGoldenCases[index];
    if (expected === undefined) {
      throw new PayrollValidationError("AEAT golden-case order changed.");
    }
    const responseCase = match[1];
    const contributions = employeeSocialSecurity2026(expected.gross)
      .annualEmployeeSocialSecurityEur;
    const actualGross = xmlNumber(responseCase, "RetribAnuales");
    const actualContributions = xmlNumber(responseCase, "Cotizaciones");
    const actualWithholding = xmlNumber(responseCase, "ImpAnualRetencionesIngresosCuenta");
    const actualRate = xmlNumber(responseCase, "TipoRetencion");
    if (
      Math.abs(actualGross - expected.gross) > 0.005 ||
      Math.abs(actualContributions - contributions) > 0.005 ||
      Math.abs(actualWithholding - expected.withholding) > 0.005 ||
      Math.abs(actualRate - expected.rate) > 0.001
    ) {
      throw new PayrollValidationError(`AEAT 2026 golden case changed at €${expected.gross}.`);
    }
  });
}

function normalizedOfficialText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function validateSocialSecurityResponse(html: string): void {
  const text = normalizedOfficialText(html);
  const requiredFragments = [
    "2026",
    "5.101,20",
    "4,70",
    "1,55",
    "0,10",
    "0,15",
    "5.611,32",
    "7.651,80",
    "0,19",
    "0,21",
    "0,24",
  ];
  const missing = requiredFragments.filter((fragment) => !text.includes(fragment));
  if (missing.length > 0) {
    throw new PayrollValidationError(
      `Social Security 2026 parameters changed or disappeared: ${missing.join(", ")}.`,
    );
  }
}

async function recentlySucceeded(ctx: ActionCtx, sourceKey: string, bucketStart: number) {
  const source = await ctx.runQuery(internal.sourceMaintenance.getByKey, { key: sourceKey });
  return source?.lastSuccessfulAt !== undefined && source.lastSuccessfulAt >= bucketStart;
}

async function validateAeat(ctx: ActionCtx, dailyBucket: number): Promise<boolean> {
  const requestXml = buildAeatXml();
  const run = await ctx.runMutation(internal.sourceMaintenance.beginOfficialRun, {
    sourceKey: AEAT_SOURCE_KEY,
    runKey: `${AEAT_SOURCE_KEY}:conformance:${dailyBucket}`,
    requestHash: await sha256(requestXml),
    parserVersion: "aeat-retenciones-2026-conformance-v1",
  });
  if (run === null) {
    return await recentlySucceeded(ctx, AEAT_SOURCE_KEY, dailyBucket * 24 * 60 * 60_000);
  }
  try {
    const body = new URLSearchParams({ EJER: "2026", PER: "0", F01: requestXml });
    const response = await fetchBoundedText(
      AEAT_SERVICE_URL,
      {
        method: "POST",
        headers: {
          Accept: "application/xml, text/xml",
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body,
      },
      MAX_AEAT_RESPONSE_CHARACTERS,
    );
    validateAeatResponse(response.text);
    const observedAt = Date.now();
    const responseHash = await sha256(response.text);
    await ctx.runMutation(internal.sourceMaintenance.recordSnapshot, {
      runId: run.runId,
      sourceUrl: AEAT_SERVICE_URL,
      externalId: `aeat-retenciones-2026:golden:${dailyBucket}`,
      contentHash: responseHash,
      mimeType: response.contentType,
      observedAt,
      effectiveAt: Date.UTC(2026, 0, 1),
      payload: response.text,
    });
    await ctx.runMutation(internal.sourceMaintenance.completeRun, {
      runId: run.runId,
      status: "succeeded",
      responseHash,
      recordsSeen: aeatGoldenCases.length,
      recordsAccepted: aeatGoldenCases.length,
      recordsRejected: 0,
      httpStatus: response.status,
    });
    return true;
  } catch (error) {
    try {
      await ctx.runMutation(internal.sourceMaintenance.completeRun, {
        runId: run.runId,
        status: "failed",
        recordsSeen: aeatGoldenCases.length,
        recordsAccepted: 0,
        recordsRejected: aeatGoldenCases.length,
        httpStatus: error instanceof PayrollValidationError ? error.httpStatus : undefined,
        errorCode: "aeat_payroll_conformance_failed",
        errorMessage: safeMessage(error),
      });
    } catch {
      // A completion mutation can commit before a transport error is returned.
    }
    return false;
  }
}

async function validateSocialSecurity(ctx: ActionCtx, dailyBucket: number): Promise<boolean> {
  const run = await ctx.runMutation(internal.sourceMaintenance.beginOfficialRun, {
    sourceKey: SOCIAL_SECURITY_SOURCE_KEY,
    runKey: `${SOCIAL_SECURITY_SOURCE_KEY}:conformance:${dailyBucket}`,
    requestHash: await sha256(JSON.stringify(SPAIN_PAYROLL_2026_PARAMETERS.socialSecurity)),
    parserVersion: "tgss-2026-employee-contributions-v1",
  });
  if (run === null) {
    return await recentlySucceeded(
      ctx,
      SOCIAL_SECURITY_SOURCE_KEY,
      dailyBucket * 24 * 60 * 60_000,
    );
  }
  try {
    const response = await fetchBoundedText(
      SOCIAL_SECURITY_VALIDATION_URL,
      { method: "GET", headers: { Accept: "text/html" } },
      MAX_SOCIAL_SECURITY_RESPONSE_CHARACTERS,
    );
    validateSocialSecurityResponse(response.text);
    const observedAt = Date.now();
    const responseHash = await sha256(response.text);
    await ctx.runMutation(internal.sourceMaintenance.recordSnapshot, {
      runId: run.runId,
      sourceUrl: SOCIAL_SECURITY_VALIDATION_URL,
      externalId: `tgss-general-regime-2026:${dailyBucket}`,
      contentHash: responseHash,
      mimeType: response.contentType,
      observedAt,
      effectiveAt: Date.UTC(2026, 0, 1),
      payload: response.text.slice(0, 700_000),
    });
    await ctx.runMutation(internal.sourceMaintenance.completeRun, {
      runId: run.runId,
      status: "succeeded",
      responseHash,
      recordsSeen: 11,
      recordsAccepted: 11,
      recordsRejected: 0,
      httpStatus: response.status,
    });
    return true;
  } catch (error) {
    try {
      await ctx.runMutation(internal.sourceMaintenance.completeRun, {
        runId: run.runId,
        status: "failed",
        recordsSeen: 11,
        recordsAccepted: 0,
        recordsRejected: 11,
        httpStatus: error instanceof PayrollValidationError ? error.httpStatus : undefined,
        errorCode: "tgss_payroll_conformance_failed",
        errorMessage: safeMessage(error),
      });
    } catch {
      // A completion mutation can commit before a transport error is returned.
    }
    return false;
  }
}

export const upsertValidatedVersion = internalMutation({
  args: {
    parameterHash: v.string(),
    validatedAt: v.number(),
  },
  returns: v.object({ inserted: v.boolean() }),
  handler: async (ctx, args) => {
    const activeVersions = await ctx.db
      .query("calculationVersions")
      .withIndex("by_key_and_active", (q) =>
        q.eq("key", SPAIN_PAYROLL_2026_MODEL_KEY).eq("active", true),
      )
      .collect();
    const matching = activeVersions.find(
      (version) => version.parameterHash === args.parameterHash,
    );
    if (matching !== undefined) {
      await ctx.db.patch(matching._id, { validatedAt: args.validatedAt });
      return { inserted: false };
    }
    for (const version of activeVersions) {
      await ctx.db.patch(version._id, {
        active: false,
        effectiveTo: args.validatedAt,
      });
    }
    await ctx.db.insert("calculationVersions", {
      key: SPAIN_PAYROLL_2026_MODEL_KEY,
      countryCode: "ES",
      jurisdiction: "general-regime",
      taxYear: 2026,
      algorithmVersion: SPAIN_PAYROLL_2026_ALGORITHM_VERSION,
      parameterHash: args.parameterHash,
      parameters: SPAIN_PAYROLL_2026_PARAMETERS,
      sourceKeys: [AEAT_SOURCE_KEY, SOCIAL_SECURITY_SOURCE_KEY],
      validatedAt: args.validatedAt,
      effectiveFrom: Date.UTC(2026, 0, 1),
      active: true,
    });
    return { inserted: true };
  },
});

export const activeSpainPayrollModel = query({
  args: {},
  returns: v.union(
    v.object({
      modelKey: v.string(),
      algorithmVersion: v.string(),
      taxYear: v.number(),
      validatedAt: v.number(),
      expiresAt: v.number(),
      current: v.boolean(),
      sourceUrls: v.object({
        aeat: v.string(),
        socialSecurity: v.string(),
      }),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const versions = await ctx.db
      .query("calculationVersions")
      .withIndex("by_key_and_active", (q) =>
        q.eq("key", SPAIN_PAYROLL_2026_MODEL_KEY).eq("active", true),
      )
      .collect();
    const version = versions.sort((a, b) => b.validatedAt - a.validatedAt)[0];
    if (version === undefined || version.taxYear === undefined) return null;
    const expiresAt = version.validatedAt + CURRENT_MODEL_MAX_AGE_MS;
    return {
      modelKey: version.key,
      algorithmVersion: version.algorithmVersion,
      taxYear: version.taxYear,
      validatedAt: version.validatedAt,
      expiresAt,
      current: Date.now() <= expiresAt,
      sourceUrls: {
        aeat: SPAIN_PAYROLL_2026_SOURCE_URLS.aeat,
        socialSecurity: SPAIN_PAYROLL_2026_SOURCE_URLS.socialSecurity,
      },
    };
  },
});

export const refreshSpainPayrollModel = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ctx.runMutation(internal.sourceMaintenance.syncCatalog, {});
    const dailyBucket = Math.floor(Date.now() / (24 * 60 * 60_000));
    const [aeatValid, socialSecurityValid] = await Promise.all([
      validateAeat(ctx, dailyBucket),
      validateSocialSecurity(ctx, dailyBucket),
    ]);
    if (aeatValid && socialSecurityValid) {
      await ctx.runMutation(internal.payrollResearch.upsertValidatedVersion, {
        parameterHash: await sha256(JSON.stringify(SPAIN_PAYROLL_2026_PARAMETERS)),
        validatedAt: Date.now(),
      });
    }
    return null;
  },
});
