export type PostingState = "active" | "closed" | "removed" | "unknown";

export interface JobPostingSnapshot {
  title: string;
  locations: string[];
  salaryText: string | null;
  requirements: string[];
  descriptionText: string;
  state: PostingState;
}

export type JobChangeKind =
  | "title_changed"
  | "location_changed"
  | "salary_changed"
  | "requirements_changed"
  | "description_changed"
  | "posting_closed"
  | "posting_reopened"
  | "posting_removed";

export interface FieldChange {
  kind: JobChangeKind;
  before: string | string[] | null;
  after: string | string[] | null;
}

export interface PostingChangeSet {
  changed: boolean;
  material: boolean;
  kinds: JobChangeKind[];
  changes: FieldChange[];
}

function normalizedText(value: string | null): string {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en");
}

function normalizedList(values: string[]): string[] {
  return [...new Set(values.map((value) => normalizedText(value)).filter(Boolean))].sort();
}

function sameList(left: string[], right: string[]): boolean {
  const a = normalizedList(left);
  const b = normalizedList(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function compareJobPostings(
  before: JobPostingSnapshot,
  after: JobPostingSnapshot,
): PostingChangeSet {
  const changes: FieldChange[] = [];

  if (normalizedText(before.title) !== normalizedText(after.title)) {
    changes.push({ kind: "title_changed", before: before.title, after: after.title });
  }
  if (!sameList(before.locations, after.locations)) {
    changes.push({
      kind: "location_changed",
      before: before.locations,
      after: after.locations,
    });
  }
  if (normalizedText(before.salaryText) !== normalizedText(after.salaryText)) {
    changes.push({
      kind: "salary_changed",
      before: before.salaryText,
      after: after.salaryText,
    });
  }
  if (!sameList(before.requirements, after.requirements)) {
    changes.push({
      kind: "requirements_changed",
      before: before.requirements,
      after: after.requirements,
    });
  }
  if (normalizedText(before.descriptionText) !== normalizedText(after.descriptionText)) {
    changes.push({
      kind: "description_changed",
      before: before.descriptionText,
      after: after.descriptionText,
    });
  }
  if (before.state === "active" && after.state === "closed") {
    changes.push({ kind: "posting_closed", before: before.state, after: after.state });
  }
  if (before.state !== "active" && after.state === "active") {
    changes.push({ kind: "posting_reopened", before: before.state, after: after.state });
  }
  if (after.state === "removed" && before.state !== "removed") {
    changes.push({ kind: "posting_removed", before: before.state, after: after.state });
  }

  const kinds = [...new Set(changes.map((change) => change.kind))];
  const materialKinds = new Set<JobChangeKind>([
    "title_changed",
    "location_changed",
    "salary_changed",
    "requirements_changed",
    "posting_closed",
    "posting_reopened",
    "posting_removed",
  ]);
  return {
    changed: changes.length > 0,
    material: kinds.some((kind) => materialKinds.has(kind)),
    kinds,
    changes,
  };
}

/**
 * A missing record is only marked removed after two complete, successful feed
 * runs. API failures and partial pagination never close a role.
 */
export function stateForMissingPosting({
  previousState,
  consecutiveSuccessfulMisses,
  feedRunComplete,
}: {
  previousState: PostingState;
  consecutiveSuccessfulMisses: number;
  feedRunComplete: boolean;
}): PostingState {
  if (!feedRunComplete) return previousState;
  return consecutiveSuccessfulMisses >= 2 ? "removed" : previousState;
}
