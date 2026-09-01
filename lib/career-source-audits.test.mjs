import assert from "node:assert/strict";
import test from "node:test";

import {
  CAREER_SOURCE_AUDITS,
  CAREER_SOURCE_AUDIT_GATE_LABELS,
  careerSourceAuditDetail,
  careerSourceAuditForSlug,
} from "./career-source-audits.ts";

test("every audit records a dated, evidence-backed, reversible outcome", () => {
  assert.ok(CAREER_SOURCE_AUDITS.length > 0);
  for (const audit of CAREER_SOURCE_AUDITS) {
    assert.match(audit.companySlug, /^[a-z0-9-]{2,64}$/, audit.companySlug);
    assert.ok(audit.companyName.length > 0, audit.companySlug);
    assert.match(audit.auditedOn, /^\d{4}-\d{2}-\d{2}$/, audit.companySlug);
    assert.equal(audit.rediscovery, "weekly", audit.companySlug);
    assert.ok(audit.failedGates.length > 0, `${audit.companySlug} must name the gate it failed`);
    assert.equal(
      new Set(audit.failedGates).size,
      audit.failedGates.length,
      `${audit.companySlug} must not repeat a gate`,
    );
    for (const gate of audit.failedGates) {
      assert.ok(gate in CAREER_SOURCE_AUDIT_GATE_LABELS, `${audit.companySlug}: unknown gate ${gate}`);
    }
    assert.ok(
      audit.surfaces.length > 0,
      `${audit.companySlug} must cite the surfaces that were examined`,
    );
    for (const surface of audit.surfaces) {
      assert.match(surface.url, /^https:\/\//, `${audit.companySlug}: ${surface.url}`);
      assert.ok(surface.observation.length > 0, `${audit.companySlug}: ${surface.url}`);
    }
    assert.ok(audit.summary.length > 0, audit.companySlug);
  }
});

test("audit slugs are unique so one company resolves to one documented outcome", () => {
  const slugs = CAREER_SOURCE_AUDITS.map((audit) => audit.companySlug);
  assert.equal(new Set(slugs).size, slugs.length);
});

test("the three unsupported-employer audits are recorded", () => {
  assert.equal(careerSourceAuditForSlug("meta")?.companyName, "Meta");
  assert.equal(careerSourceAuditForSlug("uber")?.companyName, "Uber");
  assert.equal(careerSourceAuditForSlug("netflix"), null, "Netflix ships an adapter, not an audit exemption");
  assert.equal(careerSourceAuditForSlug("unknown-company"), null);
});

test("both recorded audits fail on published access terms rather than on effort", () => {
  for (const slug of ["meta", "uber"]) {
    const audit = careerSourceAuditForSlug(slug);
    assert.ok(audit);
    assert.ok(
      audit.failedGates.includes("access_terms"),
      `${slug} must record the access-terms gate`,
    );
    assert.ok(
      audit.surfaces.some((surface) => surface.url.endsWith("/robots.txt")),
      `${slug} must cite the published policy it was measured against`,
    );
  }
});

test("the rendered detail names the failed gates, the audit date, and the retry cadence", () => {
  const audit = careerSourceAuditForSlug("meta");
  assert.ok(audit);
  const detail = careerSourceAuditDetail(audit);
  assert.match(detail, /Failed gates: Access terms, Credential-free access\./);
  assert.match(detail, /Audited 2026-08-29/);
  assert.match(detail, /rediscovery retries weekly$/);
});

test("a single failed gate is described in the singular", () => {
  const detail = careerSourceAuditDetail({
    companySlug: "example",
    companyName: "Example",
    auditedOn: "2026-08-29",
    surfaces: [{ url: "https://example.com/robots.txt", observation: "Disallows every path." }],
    failedGates: ["access_terms"],
    summary: "Example publishes no readable feed.",
    rediscovery: "weekly",
  });
  assert.match(detail, /Failed gate: Access terms\./);
});
