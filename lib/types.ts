import type { Doc, Id } from "@/convex/_generated/dataModel";

export type Job = Doc<"jobs">;
export type JobId = Id<"jobs">;
export type Profile = Doc<"profile">;
export type Settings = Doc<"settings">;
export type Ingest = Doc<"ingests">;

export type Score = NonNullable<Job["scores"]["fit"]>;
export type Provenance = Score["provenance"];
export type Rung = Job["rung"];
export type WorkMode = Job["workMode"];
export type UserStatus = Job["userStatus"];
export type Eligibility = Job["eligibility"];
export type Requirement = Job["requirements"][number];
export type ReqLevel = Requirement["level"];
export type ScoreKey = "fit" | "salary" | "aura" | "future" | "flex";
export type Weights = Record<ScoreKey, number>;
