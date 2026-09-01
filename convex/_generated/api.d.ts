/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as careerResearch from "../careerResearch.js";
import type * as cityContextResearch from "../cityContextResearch.js";
import type * as companyResearch from "../companyResearch.js";
import type * as companySalaryCatalog from "../companySalaryCatalog.js";
import type * as companySalaryObservationCore from "../companySalaryObservationCore.js";
import type * as companySalaryResearch from "../companySalaryResearch.js";
import type * as crons from "../crons.js";
import type * as history from "../history.js";
import type * as ingests from "../ingests.js";
import type * as jobMonitoring from "../jobMonitoring.js";
import type * as jobs from "../jobs.js";
import type * as madridCostResearch from "../madridCostResearch.js";
import type * as payrollResearch from "../payrollResearch.js";
import type * as profile from "../profile.js";
import type * as research from "../research.js";
import type * as retention from "../retention.js";
import type * as salaryMarketResearch from "../salaryMarketResearch.js";
import type * as seed from "../seed.js";
import type * as settings from "../settings.js";
import type * as sourceMaintenance from "../sourceMaintenance.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  careerResearch: typeof careerResearch;
  cityContextResearch: typeof cityContextResearch;
  companyResearch: typeof companyResearch;
  companySalaryCatalog: typeof companySalaryCatalog;
  companySalaryObservationCore: typeof companySalaryObservationCore;
  companySalaryResearch: typeof companySalaryResearch;
  crons: typeof crons;
  history: typeof history;
  ingests: typeof ingests;
  jobMonitoring: typeof jobMonitoring;
  jobs: typeof jobs;
  madridCostResearch: typeof madridCostResearch;
  payrollResearch: typeof payrollResearch;
  profile: typeof profile;
  research: typeof research;
  retention: typeof retention;
  salaryMarketResearch: typeof salaryMarketResearch;
  seed: typeof seed;
  settings: typeof settings;
  sourceMaintenance: typeof sourceMaintenance;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
