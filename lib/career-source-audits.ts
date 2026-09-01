/**
 * Documented outcomes of official career-source feasibility audits.
 *
 * A company only becomes `unsupported` after its official public surface has
 * been examined against the provider acceptance gates. Recording which gate
 * failed, and on what evidence, keeps the unsupported state auditable and
 * reversible: rediscovery re-runs on a schedule, and a later audit can retire
 * the entry by shipping an adapter instead of relaxing a gate.
 */

export type CareerSourceAuditGate =
  | "access_terms"
  | "credential_free"
  | "employer_identity"
  | "spain_geography"
  | "pagination_completeness"
  | "stable_job_id"
  | "job_detail_access";

export interface CareerSourceSurface {
  url: string;
  observation: string;
}

export interface CareerSourceAudit {
  companySlug: string;
  companyName: string;
  auditedOn: string;
  surfaces: CareerSourceSurface[];
  failedGates: CareerSourceAuditGate[];
  summary: string;
  rediscovery: "weekly";
}

export const CAREER_SOURCE_AUDIT_GATE_LABELS: Record<CareerSourceAuditGate, string> = {
  access_terms: "Access terms",
  credential_free: "Credential-free access",
  employer_identity: "Exact employer identity",
  spain_geography: "Exact Spain geography",
  pagination_completeness: "Complete pagination",
  stable_job_id: "Stable job identifiers",
  job_detail_access: "Complete job detail",
};

export const CAREER_SOURCE_AUDITS: CareerSourceAudit[] = [
  {
    companySlug: "meta",
    companyName: "Meta",
    auditedOn: "2026-08-29",
    surfaces: [
      {
        url: "https://www.metacareers.com/robots.txt",
        observation:
          "The published policy states that collection of data through automated means is prohibited without express written permission from the operator.",
      },
      {
        url: "https://www.metacareers.com/jobs",
        observation:
          "A credential-free request returns HTTP 400 with an error document rather than a machine-readable job listing.",
      },
    ],
    failedGates: ["access_terms", "credential_free"],
    summary:
      "Meta publishes no career feed that can be read under its own stated automated-access terms, so no adapter may be built without express written permission.",
    rediscovery: "weekly",
  },
  {
    companySlug: "uber",
    companyName: "Uber",
    auditedOn: "2026-08-29",
    surfaces: [
      {
        url: "https://www.uber.com/robots.txt",
        observation:
          "The published policy disallows every `*/api/` path, which covers the job-search endpoint backing the careers listing.",
      },
      {
        url: "https://www.uber.com/global/en/careers/list/",
        observation:
          "The crawlable careers listing returns HTTP 406 to a credential-free client and carries no server-rendered job records.",
      },
    ],
    failedGates: ["access_terms", "pagination_completeness", "job_detail_access"],
    summary:
      "Uber's structured job endpoint is disallowed by its own robots policy and the permitted careers page exposes no complete, machine-readable Spain listing.",
    rediscovery: "weekly",
  },
];

export function careerSourceAuditForSlug(slug: string): CareerSourceAudit | null {
  return CAREER_SOURCE_AUDITS.find((audit) => audit.companySlug === slug) ?? null;
}

export function careerSourceAuditDetail(audit: CareerSourceAudit): string {
  const gates = audit.failedGates
    .map((gate) => CAREER_SOURCE_AUDIT_GATE_LABELS[gate])
    .join(", ");
  return `${audit.summary} Failed gate${audit.failedGates.length === 1 ? "" : "s"}: ${gates}. Audited ${audit.auditedOn} · rediscovery retries weekly`;
}
